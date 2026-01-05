import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocalAuth } from '@/contexts/LocalAuthContext';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isLoading, error, setupRequired } = useLocalAuth();

  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Determine where to redirect after login
  const from = (location.state as { from?: string })?.from || '/';

  // Auto-switch to register mode if setup is required (first user)
  const showRegister = isRegistering || setupRequired;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (username.length < 3) {
      setFormError('Username must be at least 3 characters');
      return;
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    if (showRegister && password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    try {
      if (showRegister) {
        await register(username, password, email || undefined);
      } else {
        await login(username, password);
      }
      navigate(from, { replace: true });
    } catch {
      // Error is handled by context
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            {setupRequired ? 'Create Admin Account' : 'Welcome Back'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {setupRequired
              ? 'Set up your admin account to get started'
              : showRegister
                ? 'Create a new account'
                : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
              disabled={isLoading}
              className="border-border"
            />
          </div>

          {showRegister && (
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                disabled={isLoading}
                className="border-border"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete={showRegister ? 'new-password' : 'current-password'}
              disabled={isLoading}
              className="border-border"
            />
          </div>

          {showRegister && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
                disabled={isLoading}
                className="border-border"
              />
            </div>
          )}

          {(formError || error) && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded">
              {formError || error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading
              ? 'Please wait...'
              : setupRequired
                ? 'Create Admin Account'
                : showRegister
                  ? 'Create Account'
                  : 'Sign In'}
          </Button>
        </form>

        {!setupRequired && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setFormError(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground underline"
              disabled={isLoading}
            >
              {isRegistering
                ? 'Already have an account? Sign in'
                : "Don't have an account? Register"}
            </button>
          </div>
        )}

        {setupRequired && (
          <p className="mt-6 text-sm text-muted-foreground text-center">
            This will be the admin account for managing users.
          </p>
        )}
      </div>
    </div>
  );
}
