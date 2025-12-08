import { create } from 'zustand';
import supabase from '@/lib/supabase';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  credits?: number;
}

export interface UserSettings {
  wordpressUrl: string;
  wordpressUsername: string;
  wordpressPassword: string;
  defaultCategory: string;
  importThreads: number;
  autoPagination: boolean;
  waitSeconds: number;
  language: string;
}

interface UserStore {
  user: User | null;
  isAuthenticated: boolean;
  settings: UserSettings;
  loginModalOpen: boolean;
  settingsModalOpen: boolean;
  debugModalOpen: boolean;
  rechargeModalOpen: boolean;
  contactModalOpen: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openRechargeModal: () => void;
  closeRechargeModal: () => void;
  openContactModal: () => void;
  closeContactModal: () => void;
  initFromSupabase: () => Promise<void>;
  openDebugModal: () => void;
  closeDebugModal: () => void;
  refreshCredits: () => Promise<void>;
}

const defaultSettings: UserSettings = {
  wordpressUrl: '',
  wordpressUsername: '',
  wordpressPassword: '',
  defaultCategory: '',
  importThreads: 10,
  autoPagination: true,
  waitSeconds: 0,
  language: 'zh-CN',
};

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  settings: defaultSettings,
  loginModalOpen: false,
  settingsModalOpen: false,
  debugModalOpen: false,
  rechargeModalOpen: false,
  contactModalOpen: false,
  
  login: async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const u = data.user;
      if (!u) return false;
      
      const metadata = u.user_metadata || {};
      const name = (metadata.name as string) || (metadata.full_name as string) || (metadata.nickname as string) || (email.split('@')[0] || '');
      const avatar = (metadata.avatar_url as string) || (metadata.avatar as string);
      
      set({ user: { id: u.id, email, name, avatar, credits: 0 }, isAuthenticated: true, loginModalOpen: false });
      get().refreshCredits();
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  },
  
  logout: () => {
    void supabase.auth.signOut();
    set({ 
      user: null, 
      isAuthenticated: false,
      settings: defaultSettings
    });
  },
  
  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    }));
  },
  
  openLoginModal: () => set({ loginModalOpen: true }),
  closeLoginModal: () => set({ loginModalOpen: false }),
  openSettingsModal: () => set({ settingsModalOpen: true }),
  closeSettingsModal: () => set({ settingsModalOpen: false }),
  openRechargeModal: () => set({ rechargeModalOpen: true }),
  closeRechargeModal: () => set({ rechargeModalOpen: false }),
  openContactModal: () => set({ contactModalOpen: true }),
  closeContactModal: () => set({ contactModalOpen: false }),
  openDebugModal: () => set({ debugModalOpen: true }),
  closeDebugModal: () => set({ debugModalOpen: false }),
  refreshCredits: async () => {
    const u = get().user;
    if (!u) return;
    const { data } = await supabase.from('user_configs').select('credits').eq('user_id', u.id).single();
    if (data) {
      set((state) => ({ user: state.user ? { ...state.user, credits: data.credits ?? 0 } : null }));
    }
  },
  initFromSupabase: async () => {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (u) {
      const email = u.email || '';
      const metadata = u.user_metadata || {};
      const name = (metadata.name as string) || (metadata.full_name as string) || (metadata.nickname as string) || (email.split('@')[0] || '');
      const avatar = (metadata.avatar_url as string) || (metadata.avatar as string);
      
      set({ user: { id: u.id, email, name, avatar, credits: 0 }, isAuthenticated: true });
      get().refreshCredits();
    } else {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
