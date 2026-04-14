import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../utils/api';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  bio?: string;
  created_at: string;
  followers_count: number;
  following_count: number;
  movies_count: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGoogleAuthInProgress: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
  setGoogleAuthInProgress: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  isGoogleAuthInProgress: false,

  setGoogleAuthInProgress: (val: boolean) => set({ isGoogleAuthInProgress: val }),

  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    const { token, user } = response.data;
    
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  register: async (email: string, password: string, name: string) => {
    const response = await api.post('/auth/register', { email, password, name });
    const { token, user } = response.data;
    
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  loginWithGoogle: async (sessionId: string) => {
    const response = await api.post('/auth/session', { session_id: sessionId });
    const { token, user } = response.data;
    
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore errors
    }
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  loadUser: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userStr = await AsyncStorage.getItem('user');
      
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true, isLoading: false });
        
        // Verify token is still valid
        try {
          const response = await api.get('/auth/me');
          set({ user: response.data });
        } catch (e) {
          // Token invalid, logout
          await get().logout();
        }
      } else {
        set({ isLoading: false });
      }
    } catch (e) {
      set({ isLoading: false });
    }
  },

  updateUser: (data: Partial<User>) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...data };
      set({ user: updatedUser });
      AsyncStorage.setItem('user', JSON.stringify(updatedUser));
    }
  },
}));
