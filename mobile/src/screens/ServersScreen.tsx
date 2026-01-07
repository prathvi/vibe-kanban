import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useServerStore } from '@/stores/serverStore';
import type { ServerConfig, ServerConnectionStatus } from '@/types/server';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

const STATUS_COLORS: Record<ServerConnectionStatus, string> = {
  connected: colors.success,
  disconnected: '#6b7280',
  checking: '#eab308',
  error: colors.statusFailed,
};

const STATUS_LABELS: Record<ServerConnectionStatus, string> = {
  connected: 'Connected',
  disconnected: 'Offline',
  checking: 'Checking...',
  error: 'Error',
};

type ServerCardProps = {
  server: ServerConfig;
  isActive: boolean;
  status: ServerConnectionStatus;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCheckConnection: () => void;
};

function ServerCard({ server, isActive, status, onSelect, onEdit, onDelete, onCheckConnection }: ServerCardProps) {
  return (
    <View>
      <TouchableOpacity
        onPress={onSelect}
        style={[styles.card, isActive && styles.cardActive]}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              {isActive && <Ionicons name="checkmark-circle" size={16} color={colors.success} style={styles.checkIcon} />}
              <Text style={styles.serverName}>{server.name}</Text>
            </View>
            <Text style={styles.serverUrl} numberOfLines={1}>{server.url}</Text>
          </View>
          <View style={styles.statusContainer}>
            <TouchableOpacity onPress={onCheckConnection} style={styles.statusButton} disabled={status === 'checking'}>
              {status === 'checking' ? (
                <ActivityIndicator size="small" color="#eab308" />
              ) : (
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
                  <Text style={[styles.statusText, { color: STATUS_COLORS[status] }]}>{STATUS_LABELS[status]}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.cardFooter}>
          {!server.isDefault && (
            <>
              <TouchableOpacity onPress={onEdit} style={styles.actionButton}>
                <Ionicons name="pencil-outline" size={14} color={colors.foreground} />
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
                <Ionicons name="trash-outline" size={14} color={colors.statusFailed} />
                <Text style={styles.actionTextDanger}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
          {server.isDefault && <Text style={styles.defaultText}>Default server (cannot be deleted)</Text>}
          {server.lastConnectedAt && (
            <Text style={styles.lastConnected}>Last: {new Date(server.lastConnectedAt).toLocaleDateString()}</Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

type AddServerModalProps = {
  visible: boolean;
  editingServer?: ServerConfig | null;
  onClose: () => void;
  onSave: (name: string, url: string) => void;
};

function AddServerModal({ visible, editingServer, onClose, onSave }: AddServerModalProps) {
  const [name, setName] = useState(editingServer?.name || '');
  const [url, setUrl] = useState(editingServer?.url || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingServer) {
      setName(editingServer.name);
      setUrl(editingServer.url);
    } else {
      setName('');
      setUrl('');
    }
    setError('');
  }, [editingServer, visible]);

  const handleSave = () => {
    if (!name.trim()) {
      setError('Server name is required');
      return;
    }
    if (!url.trim()) {
      setError('Server URL is required');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setError('URL must start with http:// or https://');
      return;
    }
    onSave(name.trim(), url.trim());
  };

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{editingServer ? 'Edit Server' : 'Add Server'}</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Server Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="My Remote Server"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Server URL</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://vibe.example.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.modalActions}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton} activeOpacity={0.8}>
            <Text style={styles.saveText}>{editingServer ? 'Save' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function ServersScreen() {
  const {
    servers,
    activeServerId,
    serverStatuses,
    isLoading,
    loadServers,
    addServer,
    updateServer,
    deleteServer,
    setActiveServer,
    checkServerConnection,
    checkAllServers,
  } = useServerStore();

  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);

  useEffect(() => {
    loadServers().then(() => checkAllServers());
  }, [loadServers, checkAllServers]);

  const handleAddServer = useCallback(
    async (name: string, url: string) => {
      if (editingServer) {
        await updateServer(editingServer.id, { name, url });
      } else {
        await addServer(name, url);
      }
      setShowModal(false);
      setEditingServer(null);
    },
    [editingServer, updateServer, addServer]
  );

  const handleDeleteServer = useCallback(
    (server: ServerConfig) => {
      Alert.alert('Delete Server', `Are you sure you want to delete "${server.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteServer(server.id) },
      ]);
    },
    [deleteServer]
  );

  const handleSelectServer = useCallback(
    async (id: string) => {
      await setActiveServer(id);
      await checkServerConnection(id);
    },
    [setActiveServer, checkServerConnection]
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.foreground} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={servers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ServerCard
            server={item}
            isActive={item.id === activeServerId}
            status={serverStatuses[item.id] || 'disconnected'}
            onSelect={() => handleSelectServer(item.id)}
            onEdit={() => {
              setEditingServer(item);
              setShowModal(true);
            }}
            onDelete={() => handleDeleteServer(item)}
            onCheckConnection={() => checkServerConnection(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.headerText}>Select a server to connect to. The active server will be used for all API requests.</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="server-outline" size={48} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No servers configured</Text>
          </View>
        }
      />

      <TouchableOpacity
        onPress={() => {
          setEditingServer(null);
          setShowModal(true);
        }}
        style={styles.fab}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.successForeground} />
      </TouchableOpacity>

      <AddServerModal
        visible={showModal}
        editingServer={editingServer}
        onClose={() => {
          setShowModal(false);
          setEditingServer(null);
        }}
        onSave={handleAddServer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.lg,
    paddingBottom: 100,
  },
  listHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
  },
  cardActive: {
    borderColor: colors.success,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIcon: {
    marginRight: 6,
  },
  serverName: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.base,
    color: colors.foreground,
    fontWeight: '600',
  },
  serverUrl: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusButton: {
    padding: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(64, 61, 58, 0.5)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  actionText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.foreground,
    marginLeft: spacing.xs,
  },
  actionTextDanger: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.destructive,
    marginLeft: spacing.xs,
  },
  defaultText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  lastConnected: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginLeft: 'auto',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: spacing.lg,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    backgroundColor: colors.success,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
  },
  modalTitle: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  errorText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.destructive,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.sm,
    color: colors.successForeground,
    fontWeight: '600',
  },
});
