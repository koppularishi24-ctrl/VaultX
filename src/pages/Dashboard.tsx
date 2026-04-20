import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, VaultItemData } from '../store/useStore';
import { db } from '../lib/storage';
import { encryptData, decryptData } from '../lib/crypto';
import { 
  Shield, LogOut, Plus, Search, Copy, ExternalLink, 
  MoreVertical, Edit2, Trash2, Lock, Eye, EyeOff, X, RefreshCw, CheckCircle2, Download, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

function parseCSV(str: string) {
  const arr: string[][] = [];
  let quote = false;
  let row = 0, col = 0;
  for (let c = 0; c < str.length; c++) {
      let cc = str[c], nc = str[c+1];
      arr[row] = arr[row] || [];
      arr[row][col] = arr[row][col] || '';
      if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
      if (cc == '"') { quote = !quote; continue; }
      if (cc == ',' && !quote) { ++col; continue; }
      if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
      if (cc == '\n' && !quote) { ++row; col = 0; continue; }
      if (cc == '\r' && !quote) { ++row; col = 0; continue; }
      arr[row][col] += cc;
  }
  return arr;
}

// --- SCHEMAS ---
const itemSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  username: z.string().min(1, 'Username/Email is required'),
  password: z.string().optional(),
  websiteUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  notes: z.string().optional(),
  category: z.string(),
});

type ItemFormData = z.infer<typeof itemSchema>;

// --- MAIN COMPONENT ---
export default function Dashboard() {
  const { user, masterKey, vaultItems, setVaultItems, logout, lock, addVaultItem } = useStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Items');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItemData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);

  const showToast = (message: string, type: 'success'|'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Auto-lock timer (5 minutes of inactivity)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        lock();
        navigate('/auth');
      }, 5 * 60 * 1000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
    };
  }, [lock, navigate]);

  // Load and decrypt items
  useEffect(() => {
    async function loadItems() {
      if (!user || !masterKey) return;
      
      try {
        const encryptedItems = await db.getVaultItems(user.id);
        const decryptedItems: VaultItemData[] = [];

        for (const item of encryptedItems) {
          try {
            const jsonStr = await decryptData(item.encryptedBlob, item.iv, masterKey);
            const data = JSON.parse(jsonStr);
            decryptedItems.push({
              id: item.id,
              createdAt: item.createdAt,
              ...data
            });
          } catch (err) {
            console.error('Failed to decrypt item', item.id);
          }
        }
        
        // Sort by newest first
        decryptedItems.sort((a, b) => b.createdAt - a.createdAt);
        setVaultItems(decryptedItems);
      } catch (err) {
        console.error('Error loading items', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadItems();
  }, [user, masterKey, setVaultItems]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleLock = () => {
    lock();
    navigate('/auth');
  };

  const handleExport = () => {
    if (vaultItems.length === 0) {
      showToast("Your vault is empty.", "error");
      return;
    }

    const escapeCSV = (str?: string) => {
      if (!str) return '';
      const stringified = String(str);
      if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        return `"${stringified.replace(/"/g, '""')}"`;
      }
      return stringified;
    };

    const headers = ['Title', 'Username', 'Password', 'Website URL', 'Notes', 'Category'];
    const csvRows = [headers.join(',')];

    for (const item of vaultItems) {
      const row = [
        escapeCSV(item.title),
        escapeCSV(item.username),
        escapeCSV(item.password),
        escapeCSV(item.websiteUrl),
        escapeCSV(item.notes),
        escapeCSV(item.category)
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vaultx_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEraseVault = async () => {
    const confirmPrompt = window.prompt("⚠️ Type 'ERASE' to permanently delete all your encrypted items. This cannot be undone.");
    if (confirmPrompt !== 'ERASE') {
      if (confirmPrompt !== null) {
        showToast("Erase cancelled. You didn't type ERASE correctly.", "error");
      }
      return;
    }
    
    setIsLoading(true);
    try {
      await db.eraseMyVault(user!.id);
      setVaultItems([]);
      showToast("Your vault has been completely erased.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to erase vault.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !masterKey) return;

    setIsLoading(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("File is empty or invalid");

      const headers = rows[0].map(h => h.toLowerCase());
      const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name'));
      const userIdx = headers.findIndex(h => h.includes('username') || h.includes('email') || h.includes('login'));
      const passIdx = headers.findIndex(h => h.includes('password'));
      const urlIdx = headers.findIndex(h => h.includes('url') || h.includes('website'));
      const notesIdx = headers.findIndex(h => h.includes('note'));

      let importedCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0 || (row.length === 1 && !row[0])) continue;

        const title = titleIdx >= 0 ? row[titleIdx] : `Imported Item ${i}`;
        const username = userIdx >= 0 ? row[userIdx] : '';
        const password = passIdx >= 0 ? row[passIdx] : '';
        const websiteUrl = urlIdx >= 0 ? row[urlIdx] : '';
        const notes = notesIdx >= 0 ? row[notesIdx] : '';

        if (!title && !username && !password) continue;

        const payload = {
          title: title || 'Untitled',
          username: username || '',
          password,
          websiteUrl,
          notes,
          category: 'Imported',
        };

        const jsonStr = JSON.stringify(payload);
        const { ciphertext, iv } = await encryptData(jsonStr, masterKey);
        
        const id = crypto.randomUUID();
        const createdAt = Date.now();

        const dbItem = {
          id,
          userId: user.id,
          encryptedBlob: ciphertext,
          iv,
          createdAt,
        };

        await db.saveVaultItem(dbItem);
        
        const storeItem: VaultItemData = {
          id,
          ...payload,
          createdAt,
        };
        
        addVaultItem(storeItem);
        importedCount++;
      }
      
      showToast(`Successfully imported ${importedCount} items!`);
    } catch (err) {
      console.error(err);
      showToast("Failed to import CSV. Please check the file format.", "error");
    } finally {
      setIsLoading(false);
      if (event.target) event.target.value = '';
    }
  };

  const filteredItems = vaultItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = activeCategory === 'All Items' || 
          (activeCategory === 'Logins' && item.category === 'Logins') ||
          (activeCategory === 'Secure Notes' && item.category === 'Notes');
          
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#111] border-r border-white/5 flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">VaultX</span>
        </div>
        
        <div className="flex-1 py-6 px-4 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-2">Categories</div>
          <nav className="space-y-1 mb-8">
            <SidebarItem active={activeCategory === 'All Items'} onClick={() => setActiveCategory('All Items')} label="All Items" count={vaultItems.length} />
            <SidebarItem active={activeCategory === 'Logins'} onClick={() => setActiveCategory('Logins')} label="Logins" count={vaultItems.filter(i => i.category === 'Logins').length} />
            <SidebarItem active={activeCategory === 'Secure Notes'} onClick={() => setActiveCategory('Secure Notes')} label="Secure Notes" count={vaultItems.filter(i => i.category === 'Notes').length} />
          </nav>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 px-2">Tools</div>
          <nav className="space-y-1">
            <button onClick={() => document.getElementById('csv-upload')?.click()} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <input type="file" id="csv-upload" accept=".csv" className="hidden" onChange={handleImport} />
            
            <button onClick={handleExport} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            
            <button onClick={handleEraseVault} className="w-full flex items-center gap-3 px-3 py-2 mt-4 rounded-lg text-sm font-medium text-red-500/80 hover:text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-4 h-4" /> Erase Entire Vault
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="px-2 py-2 text-sm text-gray-400 truncate mb-2">
            {user?.email}
          </div>
          <button onClick={handleLock} className="w-full flex items-center gap-3 px-2 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <Lock className="w-4 h-4" /> Lock Vault
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-2 py-2 text-sm text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-colors">
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-20 px-8 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md z-10">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search your vault..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111] border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
          <button 
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="ml-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Item
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-gray-600" />
              </div>
              <h3 className="text-xl font-medium mb-2">Your vault is empty</h3>
              <p className="text-gray-500 max-w-sm mb-6">Add your first password to start securing your digital life.</p>
              <button 
                onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                + Add new item
              </button>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map(item => (
                <VaultCard 
                  key={item.id} 
                  item={item} 
                  onEdit={() => { setEditingItem(item); setIsModalOpen(true); }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <ItemModal 
            item={editingItem} 
            onClose={() => setIsModalOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-xl border ${
              toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'
            } z-50 flex items-center gap-2`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <span className="font-medium text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ label, count, active, onClick }: { label: string, count?: number, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
    >
      <span>{label}</span>
      {count !== undefined && <span className="bg-white/10 px-2 py-0.5 rounded-full text-xs">{count}</span>}
    </button>
  );
}

const VaultCard: React.FC<{ item: VaultItemData, onEdit: () => void }> = ({ item, onEdit }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteVaultItem, user } = useStore();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const confirmDelete = async () => {
    try {
      await db.deleteVaultItem(item.id, user!.id);
      deleteVaultItem(item.id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#111] border border-white/5 hover:border-white/10 rounded-xl p-5 group transition-all"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
            {item.title.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-white truncate">{item.title}</h3>
            <p className="text-xs text-gray-500 truncate">{item.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isDeleting ? (
            <div className="flex items-center gap-2 bg-red-500/10 text-red-400 px-2 py-1 rounded-md text-xs font-medium">
              Sure? 
              <button onClick={confirmDelete} className="hover:text-white">Yes</button>
              <button onClick={() => setIsDeleting(false)} className="hover:text-white">No</button>
            </div>
          ) : (
            <>
              <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => setIsDeleting(true)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-md">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {item.password && (
          <div className="flex items-center justify-between bg-black rounded-lg p-2 border border-white/5">
            <div className="font-mono text-sm text-gray-300 truncate mr-2">
              {showPassword ? item.password : '••••••••••••••••'}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button 
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 text-gray-500 hover:text-white rounded-md"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => handleCopy(item.password!)}
                className="p-1.5 text-gray-500 hover:text-white rounded-md relative"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        
        {item.websiteUrl && (
          <a 
            href={item.websiteUrl.startsWith('http') ? item.websiteUrl : `https://${item.websiteUrl}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 truncate"
          >
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{item.websiteUrl}</span>
          </a>
        )}
      </div>
    </motion.div>
  );
}

// --- MODAL COMPONENT ---
function ItemModal({ item, onClose }: { item: VaultItemData | null, onClose: () => void }) {
  const { user, masterKey, addVaultItem, updateVaultItem } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: item ? {
      title: item.title,
      username: item.username,
      password: item.password || '',
      websiteUrl: item.websiteUrl || '',
      notes: item.notes || '',
      category: item.category || 'Logins',
    } : { category: 'Logins' }
  });

  const currentPassword = watch('password');

  const onSubmit = async (data: ItemFormData) => {
    if (!user || !masterKey) return;
    setIsSaving(true);

    try {
      const payload = {
        title: data.title,
        username: data.username,
        password: data.password,
        websiteUrl: data.websiteUrl,
        notes: data.notes,
        category: data.category,
      };

      const jsonStr = JSON.stringify(payload);
      const { ciphertext, iv } = await encryptData(jsonStr, masterKey);

      const id = item ? item.id : crypto.randomUUID();
      const createdAt = item ? item.createdAt : Date.now();

      const dbItem = {
        id,
        userId: user.id,
        encryptedBlob: ciphertext,
        iv,
        createdAt,
      };

      await db.saveVaultItem(dbItem);

      const storeItem: VaultItemData = {
        id,
        ...payload,
        createdAt,
      };

      if (item) {
        updateVaultItem(storeItem);
      } else {
        addVaultItem(storeItem);
      }

      onClose();
    } catch (err) {
      console.error('Failed to save item', err);
      setSubmitError('Failed to save item securely.');
    } finally {
      setIsSaving(false);
    }
  };

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let retVal = "";
    const length = 16;
    const array = new Uint32Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        retVal += charset[array[i] % charset.length];
    }
    setValue('password', retVal);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-xl font-semibold">{item ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitError && (
          <div className="px-6 py-3 bg-red-500/10 text-red-400 text-sm border-b border-red-500/20">
            {submitError}
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <form id="item-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Title</label>
              <input {...register('title')} className="w-full bg-black border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" placeholder="e.g. Google, Netflix" />
              {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username / Email</label>
              <input {...register('username')} className="w-full bg-black border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
              {errors.username && <p className="text-red-400 text-xs mt-1">{errors.username.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-300">Password</label>
                <button type="button" onClick={generatePassword} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Generate
                </button>
              </div>
              <div className="relative">
                <input {...register('password')} type={showGen ? "text" : "password"} className="w-full bg-black border border-white/10 rounded-lg pl-4 pr-10 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500" />
                <button type="button" onClick={() => setShowGen(!showGen)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                  {showGen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Website URL (Optional)</label>
              <input {...register('websiteUrl')} className="w-full bg-black border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" placeholder="https://" />
              {errors.websiteUrl && <p className="text-red-400 text-xs mt-1">{errors.websiteUrl.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Category</label>
              <select {...register('category')} className="w-full bg-black border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500">
                <option value="Logins">Login</option>
                <option value="Notes">Secure Note</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Secure Notes (Optional)</label>
              <textarea {...register('notes')} rows={3} className="w-full bg-black border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 resize-none" />
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-white/5 bg-[#0a0a0a] flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button type="submit" form="item-form" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {isSaving ? 'Encrypting...' : 'Save Item'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
