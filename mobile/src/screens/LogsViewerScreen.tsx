import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnsiText } from '@/components/logs/AnsiText';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

type LogEntry = {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
};

const MOCK_LOGS: LogEntry[] = [
  { id: '1', timestamp: '10:30:00', level: 'info', message: '\x1b[32m✓\x1b[0m Starting task execution...' },
  { id: '2', timestamp: '10:30:01', level: 'info', message: '\x1b[36m[claude]\x1b[0m Analyzing codebase structure' },
  { id: '3', timestamp: '10:30:02', level: 'debug', message: '\x1b[90mReading file: src/components/Auth.tsx\x1b[0m' },
  { id: '4', timestamp: '10:30:03', level: 'debug', message: '\x1b[90mReading file: src/lib/api.ts\x1b[0m' },
  { id: '5', timestamp: '10:30:05', level: 'info', message: '\x1b[33m⚡\x1b[0m Generating authentication flow implementation' },
  { id: '6', timestamp: '10:30:10', level: 'info', message: '\x1b[34m[write]\x1b[0m Creating src/screens/LoginScreen.tsx' },
  { id: '7', timestamp: '10:30:12', level: 'info', message: '\x1b[34m[write]\x1b[0m Creating src/screens/SignupScreen.tsx' },
  { id: '8', timestamp: '10:30:15', level: 'warn', message: '\x1b[33m⚠ Warning:\x1b[0m No existing auth context found, creating new one' },
  { id: '9', timestamp: '10:30:18', level: 'info', message: '\x1b[34m[write]\x1b[0m Creating src/contexts/AuthContext.tsx' },
  { id: '10', timestamp: '10:30:20', level: 'info', message: '\x1b[34m[edit]\x1b[0m Updating src/App.tsx to include AuthProvider' },
  { id: '11', timestamp: '10:30:25', level: 'error', message: '\x1b[31m✗ Error:\x1b[0m TypeScript compilation failed' },
  { id: '12', timestamp: '10:30:26', level: 'error', message: "\x1b[31m  → Property 'user' does not exist on type 'AuthState'\x1b[0m" },
  { id: '13', timestamp: '10:30:28', level: 'info', message: '\x1b[36m[claude]\x1b[0m Fixing type error...' },
  { id: '14', timestamp: '10:30:30', level: 'info', message: '\x1b[34m[edit]\x1b[0m Updating src/contexts/AuthContext.tsx' },
  { id: '15', timestamp: '10:30:32', level: 'info', message: '\x1b[32m✓\x1b[0m TypeScript compilation successful' },
  { id: '16', timestamp: '10:30:35', level: 'info', message: '\x1b[32m✓\x1b[0m All tests passing' },
  { id: '17', timestamp: '10:30:36', level: 'info', message: '\x1b[1m\x1b[32m✓ Task completed successfully\x1b[0m' },
];

const LEVEL_ICONS: Record<LogEntry['level'], { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  info: { name: 'information-circle', color: colors.statusInit },
  warn: { name: 'warning', color: colors.statusRunning },
  error: { name: 'alert-circle', color: colors.statusFailed },
  debug: { name: 'code-slash', color: colors.mutedForeground },
};

type LogItemProps = {
  item: LogEntry;
  showTimestamp: boolean;
  showLevel: boolean;
};

function LogItem({ item, showTimestamp, showLevel }: LogItemProps) {
  const levelConfig = LEVEL_ICONS[item.level];

  return (
    <View style={styles.logItem}>
      {showTimestamp && <Text style={styles.timestamp}>{item.timestamp}</Text>}
      {showLevel && (
        <View style={styles.levelIcon}>
          <Ionicons name={levelConfig.name} size={12} color={levelConfig.color} />
        </View>
      )}
      <View style={styles.messageContainer}>
        <AnsiText
          text={item.message}
          baseStyle={{ fontFamily: 'ChivoMono', fontSize: 12, color: colors.foreground }}
        />
      </View>
    </View>
  );
}

export function LogsViewerScreen() {
  const flatListRef = useRef<FlatList>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');

  const filteredLogs = filter === 'all' ? MOCK_LOGS : MOCK_LOGS.filter((log) => log.level === filter);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LogEntry>) => (
      <LogItem item={item} showTimestamp={showTimestamps} showLevel={showLevels} />
    ),
    [showTimestamps, showLevels]
  );

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const toggleFilter = () => {
    const filters: (LogEntry['level'] | 'all')[] = ['all', 'error', 'warn', 'info', 'debug'];
    const currentIndex = filters.indexOf(filter);
    setFilter(filters[(currentIndex + 1) % filters.length]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <TouchableOpacity onPress={toggleFilter} style={styles.filterButton}>
            <Text style={styles.filterText}>{filter}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.foreground} style={styles.chevron} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowTimestamps(!showTimestamps)}
            style={[styles.iconButton, showTimestamps && styles.iconButtonActive]}
          >
            <Ionicons name="time-outline" size={16} color={showTimestamps ? colors.foreground : colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowLevels(!showLevels)}
            style={[styles.iconButton, styles.iconButtonMargin, showLevels && styles.iconButtonActive]}
          >
            <Ionicons name="flag-outline" size={16} color={showLevels ? colors.foreground : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <View style={styles.toolbarRight}>
          <TouchableOpacity
            onPress={() => setAutoScroll(!autoScroll)}
            style={[styles.iconButton, autoScroll && styles.autoScrollActive]}
          >
            <Ionicons name="arrow-down" size={16} color={autoScroll ? colors.success : colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={scrollToBottom} style={[styles.iconButton, styles.iconButtonMargin]}>
            <Ionicons name="chevron-down-circle-outline" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onContentSizeChange={() => {
          if (autoScroll) flatListRef.current?.scrollToEnd({ animated: false });
        }}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={10}
        style={styles.list}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>{filteredLogs.length} log entries</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.muted,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  filterText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.foreground,
    textTransform: 'uppercase',
  },
  chevron: {
    marginLeft: spacing.xs,
  },
  iconButton: {
    padding: 6,
    borderRadius: borderRadius.sm,
  },
  iconButtonActive: {
    backgroundColor: colors.card,
  },
  iconButtonMargin: {
    marginLeft: spacing.xs,
  },
  autoScrollActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  list: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  logItem: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(64, 61, 58, 0.3)',
  },
  timestamp: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    width: 64,
  },
  levelIcon: {
    width: 20,
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  messageContainer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.muted,
  },
  footerText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
