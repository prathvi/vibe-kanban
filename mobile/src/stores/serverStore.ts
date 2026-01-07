import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { ServerConfig, ServerConnectionStatus } from '@/types/server';

const SERVERS_STORAGE_KEY = 'vibe_kanban_servers';
const ACTIVE_SERVER_KEY = 'vibe_kanban_active_server';

function generateId(): string {
  return `srv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

type ServerState = {
  servers: ServerConfig[];
  activeServerId: string | null;
  serverStatuses: Record<string, ServerConnectionStatus>;
  isLoading: boolean;
  
  loadServers: () => Promise<void>;
  addServer: (name: string, url: string) => Promise<ServerConfig>;
  updateServer: (id: string, updates: Partial<Pick<ServerConfig, 'name' | 'url'>>) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  setActiveServer: (id: string) => Promise<void>;
  checkServerConnection: (id: string) => Promise<boolean>;
  checkAllServers: () => Promise<void>;
  getActiveServer: () => ServerConfig | null;
  getActiveServerUrl: () => string;
};

const DEFAULT_SERVER: ServerConfig = {
  id: 'default',
  name: 'Local Server',
  url: 'http://localhost:3001',
  isDefault: true,
  createdAt: new Date().toISOString(),
};

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [DEFAULT_SERVER],
  activeServerId: 'default',
  serverStatuses: {},
  isLoading: true,

  loadServers: async () => {
    set({ isLoading: true });
    try {
      const serversJson = await SecureStore.getItemAsync(SERVERS_STORAGE_KEY);
      const activeId = await SecureStore.getItemAsync(ACTIVE_SERVER_KEY);
      
      let servers: ServerConfig[] = [DEFAULT_SERVER];
      if (serversJson) {
        const stored = JSON.parse(serversJson) as ServerConfig[];
        const hasDefault = stored.some(s => s.id === 'default');
        servers = hasDefault ? stored : [DEFAULT_SERVER, ...stored];
      }
      
      const validActiveId = activeId && servers.some(s => s.id === activeId) 
        ? activeId 
        : servers[0]?.id || 'default';
      
      set({ 
        servers, 
        activeServerId: validActiveId,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load servers:', error);
      set({ isLoading: false });
    }
  },

  addServer: async (name: string, url: string) => {
    const normalizedUrl = url.replace(/\/+$/, '');
    const newServer: ServerConfig = {
      id: generateId(),
      name: name.trim(),
      url: normalizedUrl,
      createdAt: new Date().toISOString(),
    };
    
    const { servers } = get();
    const updatedServers = [...servers, newServer];
    
    await SecureStore.setItemAsync(SERVERS_STORAGE_KEY, JSON.stringify(updatedServers));
    set({ servers: updatedServers });
    
    return newServer;
  },

  updateServer: async (id: string, updates: Partial<Pick<ServerConfig, 'name' | 'url'>>) => {
    const { servers } = get();
    const updatedServers = servers.map(server => {
      if (server.id === id) {
        return {
          ...server,
          ...updates,
          url: updates.url ? updates.url.replace(/\/+$/, '') : server.url,
        };
      }
      return server;
    });
    
    await SecureStore.setItemAsync(SERVERS_STORAGE_KEY, JSON.stringify(updatedServers));
    set({ servers: updatedServers });
  },

  deleteServer: async (id: string) => {
    const { servers, activeServerId } = get();
    
    const serverToDelete = servers.find(s => s.id === id);
    if (serverToDelete?.isDefault) {
      throw new Error('Cannot delete default server');
    }
    
    const updatedServers = servers.filter(s => s.id !== id);
    await SecureStore.setItemAsync(SERVERS_STORAGE_KEY, JSON.stringify(updatedServers));
    
    if (activeServerId === id) {
      const newActiveId = updatedServers[0]?.id || 'default';
      await SecureStore.setItemAsync(ACTIVE_SERVER_KEY, newActiveId);
      set({ servers: updatedServers, activeServerId: newActiveId });
    } else {
      set({ servers: updatedServers });
    }
  },

  setActiveServer: async (id: string) => {
    const { servers } = get();
    const server = servers.find(s => s.id === id);
    if (!server) {
      throw new Error('Server not found');
    }
    
    await SecureStore.setItemAsync(ACTIVE_SERVER_KEY, id);
    
    const updatedServers = servers.map(s => 
      s.id === id ? { ...s, lastConnectedAt: new Date().toISOString() } : s
    );
    await SecureStore.setItemAsync(SERVERS_STORAGE_KEY, JSON.stringify(updatedServers));
    
    set({ activeServerId: id, servers: updatedServers });
  },

  checkServerConnection: async (id: string) => {
    const { servers, serverStatuses } = get();
    const server = servers.find(s => s.id === id);
    if (!server) return false;
    
    set({ serverStatuses: { ...serverStatuses, [id]: 'checking' } });
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${server.url}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const isConnected = response.ok;
      set({ 
        serverStatuses: { 
          ...get().serverStatuses, 
          [id]: isConnected ? 'connected' : 'error' 
        } 
      });
      return isConnected;
    } catch {
      set({ 
        serverStatuses: { 
          ...get().serverStatuses, 
          [id]: 'disconnected' 
        } 
      });
      return false;
    }
  },

  checkAllServers: async () => {
    const { servers, checkServerConnection } = get();
    await Promise.all(servers.map(s => checkServerConnection(s.id)));
  },

  getActiveServer: () => {
    const { servers, activeServerId } = get();
    return servers.find(s => s.id === activeServerId) || servers[0] || null;
  },

  getActiveServerUrl: () => {
    const server = get().getActiveServer();
    return server?.url || 'http://localhost:3001';
  },
}));
