import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useServerStore } from '@/stores/serverStore';
import { ServerSelector } from '@/components/ServerSelector';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

type SettingsItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  rightContent?: React.ReactNode;
};

function SettingsItem({ icon, label, onPress, danger, rightContent }: SettingsItemProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.settingsItem} activeOpacity={0.7}>
      <Ionicons name={icon} size={22} color={danger ? colors.destructive : colors.foreground} />
      <Text style={[styles.settingsLabel, danger && styles.settingsLabelDanger]}>{label}</Text>
      {rightContent || <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
    </TouchableOpacity>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation();
  const logout = useAuthStore((s) => s.logout);
  const { servers } = useServerStore();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.flex1}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Server Connection</Text>
          <View style={styles.serverCard}>
            <ServerSelector />
            <TouchableOpacity
              onPress={() => navigation.navigate('Servers' as never)}
              style={styles.manageButton}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={14} color={colors.foreground} />
              <Text style={styles.manageText}>Manage Servers ({servers.length})</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <View style={styles.card}>
            <SettingsItem icon="person-outline" label="Account" onPress={() => {}} />
            <SettingsItem icon="notifications-outline" label="Notifications" onPress={() => {}} />
            <SettingsItem icon="color-palette-outline" label="Appearance" onPress={() => {}} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agents</Text>
          <View style={styles.card}>
            <SettingsItem icon="terminal-outline" label="Agent Configuration" onPress={() => {}} />
            <SettingsItem icon="server-outline" label="MCP Servers" onPress={() => {}} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <SettingsItem icon="information-circle-outline" label="Version 0.0.1" onPress={() => {}} />
            <SettingsItem icon="document-text-outline" label="Documentation" onPress={() => {}} />
          </View>
        </View>

        <View style={styles.sectionLast}>
          <View style={styles.card}>
            <SettingsItem icon="log-out-outline" label="Sign Out" onPress={logout} danger />
          </View>
        </View>
      </ScrollView>
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
  section: {
    marginTop: spacing.lg,
  },
  sectionLast: {
    marginTop: spacing.xxl,
    marginBottom: 32,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.card,
  },
  serverCard: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  manageButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  manageText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.foreground,
    marginLeft: spacing.sm,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsLabel: {
    marginLeft: spacing.md,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.base,
    color: colors.foreground,
    flex: 1,
  },
  settingsLabelDanger: {
    color: colors.destructive,
  },
});
