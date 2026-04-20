import { create } from 'zustand';

export interface VaultItemData {
  id: string;
  title: string;
  username: string;
  password?: string;
  websiteUrl?: string;
  notes?: string;
  category: string;
  createdAt: number;
}

interface AuthState {
  user: { id: string; email: string } | null;
  masterKey: CryptoKey | null;
  vaultItems: VaultItemData[];
  isLocked: boolean;
  login: (user: { id: string; email: string }, key: CryptoKey) => void;
  logout: () => void;
  lock: () => void;
  unlock: (key: CryptoKey) => void;
  setVaultItems: (items: VaultItemData[]) => void;
  addVaultItem: (item: VaultItemData) => void;
  updateVaultItem: (item: VaultItemData) => void;
  deleteVaultItem: (id: string) => void;
}

export const useStore = create<AuthState>((set) => ({
  user: null,
  masterKey: null,
  vaultItems: [],
  isLocked: true,

  login: (user, key) => set({ user, masterKey: key, isLocked: false }),
  
  logout: () => set({ user: null, masterKey: null, vaultItems: [], isLocked: true }),
  
  lock: () => set({ masterKey: null, vaultItems: [], isLocked: true }),
  
  unlock: (key) => set({ masterKey: key, isLocked: false }),
  
  setVaultItems: (items) => set({ vaultItems: items }),
  
  addVaultItem: (item) => set((state) => ({ vaultItems: [...state.vaultItems, item] })),
  
  updateVaultItem: (updatedItem) => set((state) => ({
    vaultItems: state.vaultItems.map((item) => item.id === updatedItem.id ? updatedItem : item)
  })),
  
  deleteVaultItem: (id) => set((state) => ({
    vaultItems: state.vaultItems.filter((item) => item.id !== id)
  })),
}));
