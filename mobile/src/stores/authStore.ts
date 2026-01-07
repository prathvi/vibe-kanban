import { create } from 'zustand';
import { authApi, setAuthToken, clearAuthToken } from '@/lib/api';

type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: string; username: string } | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(username, password);
      await setAuthToken(response.access_token);
      set({ isAuthenticated: true, isLoading: false, user: { id: '', username } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    await clearAuthToken();
    set({ isAuthenticated: false, user: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      await authApi.status();
      set({ isAuthenticated: true, isLoading: false });
    } catch {
      set({ isAuthenticated: false, isLoading: false });
    }
  },
}));
