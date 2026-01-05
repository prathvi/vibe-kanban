import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Trash2, UserPlus, Shield, User } from 'lucide-react';
import type {
  UserPublic,
  UsersListResponse,
  CreateUserRequest,
  UpdateUserRequest,
  ApiResponse,
} from 'shared/types';
import { useLocalAuth } from '@/contexts/LocalAuthContext';

// API helpers
const fetchWithAuth = async <T,>(
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

export function UserSettings() {
  const { user: currentUser, getAccessToken, isAdmin } = useLocalAuth();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New user form
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [creating, setCreating] = useState(false);

  // Load users
  const loadUsers = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    try {
      setLoading(true);
      const res = await fetchWithAuth<UsersListResponse>('/api/users', token);
      if (res.success && res.data) {
        setUsers(res.data.users);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin, loadUsers]);

  // Create user
  const handleCreateUser = async () => {
    const token = getAccessToken();
    if (!token) return;

    if (newUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const payload: CreateUserRequest = {
        username: newUsername,
        password: newPassword,
        email: newEmail || null,
        role: newRole,
      };

      await fetchWithAuth<UserPublic>('/api/users', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccess('User created successfully');
      setShowNewUser(false);
      setNewUsername('');
      setNewPassword('');
      setNewEmail('');
      setNewRole('user');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  // Update user role
  const handleRoleChange = async (userId: string, newRole: string) => {
    const token = getAccessToken();
    if (!token) return;

    try {
      setError(null);

      const payload: UpdateUserRequest = {
        role: newRole,
        email: null,
        password: null,
      };

      await fetchWithAuth<UserPublic>(`/api/users/${userId}`, token, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setSuccess('Role updated successfully');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string, username: string) => {
    const token = getAccessToken();
    if (!token) return;

    if (
      !confirm(
        `Are you sure you want to delete user "${username}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setError(null);

      await fetchWithAuth(`/api/users/${userId}`, token, {
        method: 'DELETE',
      });

      setSuccess('User deleted successfully');
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  // Clear messages after timeout
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              You need admin privileges to manage users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription className="text-green-600">
            {success}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage user accounts and their roles.
            </CardDescription>
          </div>
          <Button
            onClick={() => setShowNewUser(!showNewUser)}
            variant="outline"
            size="sm"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* New user form */}
          {showNewUser && (
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/50">
              <h3 className="font-medium">Create New User</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newUsername">Username</Label>
                  <Input
                    id="newUsername"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter username"
                    className="border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newEmail">Email (optional)</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter email"
                    className="border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password"
                    className="border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newRole">Role</Label>
                  <Select
                    value={newRole}
                    onValueChange={(v) => setNewRole(v as 'user' | 'admin')}
                  >
                    <SelectTrigger className="border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateUser}
                  disabled={creating}
                  size="sm"
                >
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create User
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowNewUser(false)}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Users list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found.
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      {user.role === 'admin' ? (
                        <Shield className="h-5 w-5 text-primary" />
                      ) : (
                        <User className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {user.username}
                        {user.id === currentUser?.id && (
                          <span className="text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </div>
                      {user.email && (
                        <div className="text-sm text-muted-foreground">
                          {user.email}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={user.role}
                      onValueChange={(v) => handleRoleChange(user.id, v)}
                      disabled={user.id === currentUser?.id}
                    >
                      <SelectTrigger className="w-24 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteUser(user.id, user.username)}
                      disabled={user.id === currentUser?.id}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
