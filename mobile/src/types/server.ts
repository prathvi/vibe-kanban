export type ServerConfig = {
  id: string;
  name: string;
  url: string;
  isDefault?: boolean;
  createdAt: string;
  lastConnectedAt?: string;
};

export type ServerConnectionStatus = 'connected' | 'disconnected' | 'checking' | 'error';

export type ServerWithStatus = ServerConfig & {
  status: ServerConnectionStatus;
  errorMessage?: string;
};
