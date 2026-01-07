import * as SecureStore from 'expo-secure-store';
import { useServerStore } from '@/stores/serverStore';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  serverUrl?: string;
};

function getBaseUrl(): string {
  return useServerStore.getState().getActiveServerUrl();
}

async function getAuthToken(): Promise<string | null> {
  try {
    const activeServerId = useServerStore.getState().activeServerId;
    const tokenKey = `auth_token_${activeServerId}`;
    return await SecureStore.getItemAsync(tokenKey);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  const activeServerId = useServerStore.getState().activeServerId;
  const tokenKey = `auth_token_${activeServerId}`;
  await SecureStore.setItemAsync(tokenKey, token);
}

export async function clearAuthToken(): Promise<void> {
  const activeServerId = useServerStore.getState().activeServerId;
  const tokenKey = `auth_token_${activeServerId}`;
  await SecureStore.deleteItemAsync(tokenKey);
}

export async function clearAllAuthTokens(): Promise<void> {
  const servers = useServerStore.getState().servers;
  await Promise.all(
    servers.map(async (server) => {
      const tokenKey = `auth_token_${server.id}`;
      await SecureStore.deleteItemAsync(tokenKey).catch(() => {});
    })
  );
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, serverUrl } = options;
  const baseUrl = serverUrl || getBaseUrl();
  const token = await getAuthToken();

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API Error: ${response.status}`);
  }

  return response.json();
}

export async function apiRequestToServer<T>(
  serverUrl: string,
  endpoint: string,
  options: Omit<RequestOptions, 'serverUrl'> = {}
): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, serverUrl });
}

export const projectsApi = {
  list: () => apiRequest<{ projects: unknown[] }>('/api/projects'),
  get: (id: string) => apiRequest(`/api/projects/${id}`),
  create: (data: { name: string }) =>
    apiRequest('/api/projects', { method: 'POST', body: data }),
};

export const tasksApi = {
  list: (projectId: string) =>
    apiRequest<{ tasks: unknown[] }>(`/api/projects/${projectId}/tasks`),
  get: (taskId: string) => apiRequest(`/api/tasks/${taskId}`),
  create: (data: unknown) =>
    apiRequest('/api/tasks', { method: 'POST', body: data }),
  update: (taskId: string, data: unknown) =>
    apiRequest(`/api/tasks/${taskId}`, { method: 'PATCH', body: data }),
};

export const authApi = {
  login: (username: string, password: string) =>
    apiRequest<{ access_token: string; refresh_token: string }>(
      '/api/auth/login',
      { method: 'POST', body: { username, password } }
    ),
  status: () => apiRequest('/api/auth/status'),
  logout: () => clearAuthToken(),
};

export const serverApi = {
  health: (serverUrl: string) =>
    apiRequestToServer<{ status: string }>(serverUrl, '/api/health'),
};
