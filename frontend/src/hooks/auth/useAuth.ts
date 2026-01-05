import { useUserSystem } from '../../components/ConfigProvider';
import { useLocalAuth } from '../../contexts/LocalAuthContext';

export function useAuth() {
  const { loginStatus } = useUserSystem();
  const { isAuthenticated: isLocalAuthenticated, isLoading: localAuthLoading, user: localUser } = useLocalAuth();

  const isOAuthSignedIn = loginStatus?.status === 'loggedin';
  const isSignedIn = isOAuthSignedIn || isLocalAuthenticated;
  const isLoaded = loginStatus !== null && !localAuthLoading;

  return {
    isSignedIn,
    isLoaded,
    isOAuthSignedIn,
    isLocalAuthenticated,
    userId:
      loginStatus?.status === 'loggedin'
        ? loginStatus.profile.user_id
        : localUser?.id ?? null,
  };
}
