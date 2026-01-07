import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useServerStore } from '@/stores/serverStore';
import { ServerSelector } from '@/components/ServerSelector';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error } = useAuthStore();
  const { loadServers, checkAllServers } = useServerStore();

  useEffect(() => {
    loadServers().then(() => checkAllServers());
  }, [loadServers, checkAllServers]);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    try {
      await login(username.trim(), password);
    } catch {}
  };

  const isDisabled = isLoading || !username.trim() || !password.trim();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex1}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="terminal" size={40} color={colors.foreground} />
            </View>
            <Text style={styles.title}>VIBE KANBAN</Text>
            <Text style={styles.subtitle}>AI Agent Command Center</Text>
            <View style={styles.serverSelector}>
              <ServerSelector compact />
            </View>
          </View>

          <View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter username"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.inputGroupLarge}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={isDisabled}
              style={[styles.button, isDisabled ? styles.buttonDisabled : styles.buttonEnabled]}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.foreground} />
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={isDisabled ? colors.mutedForeground : colors.successForeground}
                  />
                  <Text style={[styles.buttonText, isDisabled ? styles.buttonTextDisabled : styles.buttonTextEnabled]}>
                    AUTHENTICATE
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Secure connection · v0.0.1</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex1: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 80,
    height: 80,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.xxl,
    color: colors.foreground,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  serverSelector: {
    marginTop: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputGroupLarge: {
    marginBottom: spacing.xxl,
  },
  label: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  errorContainer: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: 'rgba(168, 84, 84, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(168, 84, 84, 0.3)',
    borderRadius: borderRadius.lg,
  },
  errorText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.destructive,
    textAlign: 'center',
  },
  button: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonEnabled: {
    backgroundColor: colors.success,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    marginLeft: spacing.sm,
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: colors.mutedForeground,
  },
  buttonTextEnabled: {
    color: colors.successForeground,
  },
  footer: {
    marginTop: 32,
  },
  footerText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
