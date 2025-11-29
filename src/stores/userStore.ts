import { create } from 'zustand';
import supabase from '@/lib/supabase';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface UserSettings {
  wordpressUrl: string;
  wordpressUsername: string;
  wordpressPassword: string;
  defaultCategory: string;
  importThreads: number;
  autoPagination: boolean;
  waitSeconds: number;
}

interface UserStore {
  user: User | null;
  isAuthenticated: boolean;
  settings: UserSettings;
  loginModalOpen: boolean;
  settingsModalOpen: boolean;
  debugModalOpen: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  initFromSupabase: () => Promise<void>;
  openDebugModal: () => void;
  closeDebugModal: () => void;
}

const defaultSettings: UserSettings = {
  wordpressUrl: '',
  wordpressUsername: '',
  wordpressPassword: '',
  defaultCategory: '',
  importThreads: 10,
  autoPagination: true,
  waitSeconds: 0,
};

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  isAuthenticated: false,
  settings: defaultSettings,
  loginModalOpen: false,
  settingsModalOpen: false,
  debugModalOpen: false,
  
  login: async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const u = data.user;
      if (!u) return false;
      const name = (u.user_metadata && (u.user_metadata.full_name as string)) || (email.split('@')[0] || '');
      set({ user: { id: u.id, email, name }, isAuthenticated: true, loginModalOpen: false });
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
  openDebugModal: () => set({ debugModalOpen: true }),
  closeDebugModal: () => set({ debugModalOpen: false }),
  initFromSupabase: async () => {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (u) {
      const email = u.email || '';
      const name = (u.user_metadata && (u.user_metadata.full_name as string)) || (email.split('@')[0] || '');
      set({ user: { id: u.id, email, name }, isAuthenticated: true });
    } else {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
