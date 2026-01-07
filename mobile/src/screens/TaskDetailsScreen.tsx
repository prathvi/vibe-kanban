import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackScreenProps } from '@/navigation/types';
import { TASK_STATUS_CONFIG, type TaskStatus } from '@/types';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

const MOCK_TASK = {
  id: '1',
  title: 'Implement authentication flow',
  description:
    'Add login and signup screens with proper validation. Include password reset functionality and OAuth integration for GitHub.',
  status: 'inprogress' as TaskStatus,
  executor: 'claude',
  has_in_progress_attempt: true,
  last_attempt_failed: false,
  created_at: '2025-01-07T10:00:00Z',
  attempts: [
    { id: 'a1', branch: 'feat/auth-flow', status: 'running', created_at: '2025-01-07T10:30:00Z' },
    { id: 'a2', branch: 'feat/auth-flow-v2', status: 'failed', created_at: '2025-01-07T09:00:00Z' },
  ],
};

const STATUS_BG_COLORS: Record<string, string> = {
  'status-init': colors.statusInit,
  'status-running': colors.statusRunning,
  warning: colors.warning,
  'status-complete': colors.statusComplete,
  muted: '#6b7280',
};

type StatusBadgeProps = { status: TaskStatus };

function StatusBadge({ status }: StatusBadgeProps) {
  const config = TASK_STATUS_CONFIG[status];
  const bgColor = STATUS_BG_COLORS[config.color] || '#6b7280';

  return (
    <View style={[styles.statusBadge, { backgroundColor: bgColor }]}>
      <Text style={styles.statusText}>{config.label}</Text>
    </View>
  );
}

type AttemptCardProps = {
  attempt: { id: string; branch: string; status: string; created_at: string };
  onPress: () => void;
};

function AttemptCard({ attempt, onPress }: AttemptCardProps) {
  const isRunning = attempt.status === 'running';
  const isFailed = attempt.status === 'failed';

  return (
    <TouchableOpacity onPress={onPress} style={styles.attemptCard} activeOpacity={0.7}>
      <View style={styles.attemptHeader}>
        <View style={styles.attemptBranch}>
          <Ionicons name="git-branch-outline" size={16} color={colors.foreground} />
          <Text style={styles.branchText} numberOfLines={1}>{attempt.branch}</Text>
        </View>
        <View style={styles.attemptActions}>
          {isRunning && <View style={styles.runningDot} />}
          {isFailed && <Ionicons name="alert-circle" size={16} color={colors.statusFailed} />}
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </View>
      </View>
      <Text style={styles.attemptDate}>{new Date(attempt.created_at).toLocaleString()}</Text>
    </TouchableOpacity>
  );
}

export function TaskDetailsScreen({ route }: RootStackScreenProps<'TaskDetails'>) {
  const [task] = useState(MOCK_TASK);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <StatusBadge status={task.status} />
            <View style={styles.executorBadge}>
              <Ionicons name="terminal" size={14} color={colors.foreground} />
              <Text style={styles.executorText}>{task.executor}</Text>
            </View>
          </View>

          <Text style={styles.title}>{task.title}</Text>

          {task.description && <Text style={styles.description}>{task.description}</Text>}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Created {new Date(task.created_at).toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={styles.attemptsSection}>
          <Text style={styles.attemptsTitle}>Attempts ({task.attempts.length})</Text>
          {task.attempts.map((attempt) => (
            <AttemptCard key={attempt.id} attempt={attempt} onPress={() => {}} />
          ))}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
            <View style={styles.actionContent}>
              <Ionicons name="play" size={18} color={colors.success} />
              <Text style={styles.actionTextSuccess}>Start Attempt</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
            <View style={styles.actionContent}>
              <Ionicons name="create-outline" size={18} color={colors.foreground} />
              <Text style={styles.actionText}>Edit</Text>
            </View>
          </TouchableOpacity>
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
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingVertical: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.white,
  },
  executorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  executorText: {
    marginLeft: spacing.xs,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.foreground,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.xl,
    color: colors.foreground,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  description: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: spacing.md,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  attemptsSection: {
    marginTop: spacing.sm,
  },
  attemptsTitle: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.sm,
    color: colors.foreground,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  attemptCard: {
    backgroundColor: colors.muted,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attemptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attemptBranch: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  branchText: {
    marginLeft: spacing.sm,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  attemptActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  runningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.statusRunning,
    marginRight: spacing.sm,
  },
  attemptDate: {
    marginTop: spacing.xs,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: 32,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionTextSuccess: {
    marginLeft: spacing.sm,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.success,
  },
  actionText: {
    marginLeft: spacing.sm,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
});
