import { supabase } from './supabase';

export interface DBUser {
  id: string;
  email: string;
  createdAt: number;
}

export interface DBVaultItem {
  id: string;
  userId: string;
  encryptedBlob: string;
  iv: string;
  createdAt: number;
}

export const db = {
  getUsers: async (): Promise<DBUser[]> => {
    const { data } = await supabase.from('zk_users').select('*');
    return data || [];
  },
  
  getUserByEmail: async (email: string): Promise<DBUser | undefined> => {
    const { data, error } = await supabase
      .from('zk_users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (error || !data) return undefined;
    return data as DBUser;
  },

  getUserById: async (id: string): Promise<DBUser | undefined> => {
    const { data, error } = await supabase
      .from('zk_users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
      
    if (error || !data) return undefined;
    return data as DBUser;
  },
  
  saveUser: async (user: DBUser): Promise<void> => {
    const { error } = await supabase.from('zk_users').insert([user]);
    if (error) throw error;
  },
  
  getVaultItems: async (userId: string): Promise<DBVaultItem[]> => {
    const { data, error } = await supabase
      .from('zk_vault_items')
      .select('*')
      .eq('userId', userId);
      
    if (error) return [];
    return data.map((d: any) => ({
      id: d.id,
      userId: d.userId,
      encryptedBlob: d.encryptedBlob,
      iv: d.iv,
      createdAt: d.createdat
    })) as DBVaultItem[];
  },
  
  saveVaultItem: async (item: DBVaultItem): Promise<void> => {
    const { error } = await supabase.from('zk_vault_items').upsert([{
      id: item.id,
      userId: item.userId,
      encryptedBlob: item.encryptedBlob,
      iv: item.iv,
      createdat: item.createdAt
    }]);
    if (error) throw error;
  },
  
  deleteVaultItem: async (id: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('zk_vault_items')
      .delete()
      .match({ id, userId });
    if (error) throw error;
  },

  eraseMyVault: async (userId: string): Promise<void> => {
    const { error } = await supabase.from('zk_vault_items').delete().eq('userId', userId);
    if (error) throw error;
  }
};

