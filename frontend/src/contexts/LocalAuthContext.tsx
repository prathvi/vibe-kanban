import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type {
  UserPublic,
  AuthTokensResponse,
  SetupStatusResponse,
  RegisterRequest,
  LoginRequest,
  RefreshRequest,
  ApiResponse,
} from 'shared/types';

// Storage keys
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const USER_KEY = 'auth_user';

// API helper
const authFetch = async <T,>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

const authFetchWithToken = async <T,>(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

interface LocalAuthContextValue {
  user: UserPublic | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  setupRequired: boolean | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    email?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  getAccessToken: () => string | null;
}

const LocalAuthContext = createContext<LocalAuthContextValue | null>(null);

interface LocalAuthProviderProps {
  children: ReactNode;
}

export function LocalAuthProvider({ children }: LocalAuthProviderProps) {
  const [user, setUser] = useState<UserPublic | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  // Check setup status and validate existing token on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check setup status
        const statusRes = await authFetch<SetupStatusResponse>(
          '/api/local-auth/setup-status'
        );
        if (statusRes.success && statusRes.data) {
          setSetupRequired(statusRes.data.setup_required);
        }

        // If we have a token, validate it
        const token = localStorage.getItem(ACCESS_TOKEN_KEY);
        if (token) {
          try {
            const userRes = await authFetchWithToken<UserPublic>(
              '/api/local-auth/me',
              token
            );
            if (userRes.success && userRes.data) {
              setUser(userRes.data);
              localStorage.setItem(USER_KEY, JSON.stringify(userRes.data));
            }
          } catch {
            // Token invalid, try to refresh
            const refreshed = await tryRefreshToken();
            if (!refreshed) {
              // Clear invalid auth state
              clearAuthState();
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize auth:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const saveAuthState = useCallback(
    (accessToken: string, refreshToken: string, userData: UserPublic) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      setUser(userData);
      setSetupRequired(false);
    },
    []
  );

  const tryRefreshToken = useCallback(async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    try {
      const payload: RefreshRequest = { refresh_token: refreshToken };
      const res = await authFetch<AuthTokensResponse>(
        '/api/local-auth/refresh',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.success && res.data) {
        saveAuthState(res.data.access_token, res.data.refresh_token, res.data.user);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [saveAuthState]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      setIsLoading(true);

      try {
        const payload: LoginRequest = { username, password };
        const res = await authFetch<AuthTokensResponse>(
          '/api/local-auth/login',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );

        if (res.success && res.data) {
          saveAuthState(res.data.access_token, res.data.refresh_token, res.data.user);
        } else {
          throw new Error(res.message || 'Login failed');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [saveAuthState]
  );

  const register = useCallback(
    async (username: string, password: string, email?: string) => {
      setError(null);
      setIsLoading(true);

      try {
        const payload: RegisterRequest = {
          username,
          password,
          email: email || null,
        };
        const res = await authFetch<AuthTokensResponse>(
          '/api/local-auth/register',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );

        if (res.success && res.data) {
          saveAuthState(res.data.access_token, res.data.refresh_token, res.data.user);
        } else {
          throw new Error(res.message || 'Registration failed');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [saveAuthState]
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      try {
        await authFetch('/api/local-auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Ignore logout errors
      }
    }
    clearAuthState();
  }, [clearAuthState]);

  const getAccessToken = useCallback(() => {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      isAdmin: user?.role === 'admin',
      setupRequired,
      error,
      login,
      register,
      logout,
      refreshToken: tryRefreshToken,
      getAccessToken,
    }),
    [
      user,
      isLoading,
      setupRequired,
      error,
      login,
      register,
      logout,
      tryRefreshToken,
      getAccessToken,
    ]
  );

  return (
    <LocalAuthContext.Provider value={value}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuth(): LocalAuthContextValue {
  const context = useContext(LocalAuthContext);
  if (!context) {
    throw new Error('useLocalAuth must be used within a LocalAuthProvider');
  }
  return context;
}
