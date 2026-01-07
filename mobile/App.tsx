import { useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/stores/authStore';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
    },
  },
});

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  const onReady = useCallback(async () => {
    await Font.loadAsync({
      ChivoMono: require('./assets/fonts/ChivoMono-Regular.ttf'),
      'ChivoMono-Bold': require('./assets/fonts/ChivoMono-Bold.ttf'),
    }).catch(() => {});
    
    await checkAuth();
    await SplashScreen.hideAsync();
  }, [checkAuth]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
