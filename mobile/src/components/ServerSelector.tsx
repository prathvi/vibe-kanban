import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useServerStore } from '@/stores/serverStore';
import type { ServerConnectionStatus } from '@/types/server';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

const STATUS_COLORS: Record<ServerConnectionStatus, string> = {
  connected: colors.success,
  disconnected: '#6b7280',
  checking: '#eab308',
  error: colors.statusFailed,
};

type ServerSelectorProps = {
  compact?: boolean;
  onServerChange?: () => void;
};

export function ServerSelector({ compact, onServerChange }: ServerSelectorProps) {
  const [showPicker, setShowPicker] = useState(false);
  const { servers, activeServerId, serverStatuses, setActiveServer, checkServerConnection } = useServerStore();

  const activeServer = servers.find((s) => s.id === activeServerId);
  const activeStatus = activeServerId ? serverStatuses[activeServerId] : 'disconnected';

  const handleSelectServer = async (id: string) => {
    await setActiveServer(id);
    await checkServerConnection(id);
    setShowPicker(false);
    onServerChange?.();
  };

  if (compact) {
    return (
      <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.compactButton} activeOpacity={0.7}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[activeStatus] }]} />
        <Text style={styles.compactText} numberOfLines={1}>{activeServer?.name || 'Select Server'}</Text>
        <Ionicons name="chevron-down" size={12} color={colors.foreground} style={styles.chevron} />
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.button} activeOpacity={0.7}>
        <View style={styles.buttonContent}>
          <View style={styles.buttonLeft}>
            <View style={[styles.statusDotLarge, { backgroundColor: STATUS_COLORS[activeStatus] }]} />
            <View style={styles.buttonText}>
              <Text style={styles.serverName}>{activeServer?.name || 'No Server Selected'}</Text>
              <Text style={styles.serverUrl} numberOfLines={1}>{activeServer?.url || 'Tap to select a server'}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Server</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={servers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const status = serverStatuses[item.id] || 'disconnected';
                const isActive = item.id === activeServerId;

                return (
                  <TouchableOpacity
                    onPress={() => handleSelectServer(item.id)}
                    style={[styles.serverItem, isActive && styles.serverItemActive]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.statusDotLarge, { backgroundColor: STATUS_COLORS[status] }]} />
                    <View style={styles.serverItemText}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemUrl}>{item.url}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark" size={20} color={colors.success} />}
                    {status === 'checking' && <ActivityIndicator size="small" color="#eab308" />}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.listContent}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 46, 44, 0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  compactText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.foreground,
  },
  chevron: {
    marginLeft: spacing.xs,
  },
  button: {
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDotLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.md,
  },
  buttonText: {
    flex: 1,
  },
  serverName: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.sm,
    color: colors.foreground,
    fontWeight: '600',
  },
  serverUrl: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 40,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(64, 61, 58, 0.5)',
  },
  serverItemActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  serverItemText: {
    flex: 1,
  },
  itemName: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  itemUrl: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
});
