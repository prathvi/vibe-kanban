import { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabScreenProps, RootStackScreenProps } from '@/navigation/types';
import { TASK_STATUS_CONFIG, type TaskStatus, type TaskWithAttemptStatus } from '@/types';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = SCREEN_WIDTH * 0.85;
const COLUMN_GAP = 12;

const MOCK_TASKS: TaskWithAttemptStatus[] = [
  {
    id: '1',
    project_id: '1',
    title: 'Implement authentication flow',
    description: 'Add login and signup screens with proper validation',
    status: 'inprogress',
    parent_workspace_id: null,
    shared_task_id: null,
    created_at: '2025-01-07T10:00:00Z',
    updated_at: '2025-01-07T10:00:00Z',
    has_in_progress_attempt: true,
    last_attempt_failed: false,
    executor: 'claude',
  },
  {
    id: '2',
    project_id: '1',
    title: 'Fix navbar responsive styling',
    description: null,
    status: 'todo',
    parent_workspace_id: null,
    shared_task_id: null,
    created_at: '2025-01-06T09:00:00Z',
    updated_at: '2025-01-06T09:00:00Z',
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    executor: 'gemini',
  },
  {
    id: '3',
    project_id: '1',
    title: 'Add unit tests for auth module',
    description: 'Cover login, signup, and password reset flows',
    status: 'inreview',
    parent_workspace_id: null,
    shared_task_id: null,
    created_at: '2025-01-05T14:00:00Z',
    updated_at: '2025-01-07T08:00:00Z',
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    executor: 'claude',
  },
  {
    id: '4',
    project_id: '1',
    title: 'Setup CI/CD pipeline',
    description: 'Configure GitHub Actions for automated testing',
    status: 'done',
    parent_workspace_id: null,
    shared_task_id: null,
    created_at: '2025-01-04T11:00:00Z',
    updated_at: '2025-01-06T16:00:00Z',
    has_in_progress_attempt: false,
    last_attempt_failed: false,
    executor: 'claude',
  },
  {
    id: '5',
    project_id: '1',
    title: 'Refactor database queries',
    description: 'Optimize slow queries in the tasks module',
    status: 'todo',
    parent_workspace_id: null,
    shared_task_id: null,
    created_at: '2025-01-07T07:00:00Z',
    updated_at: '2025-01-07T07:00:00Z',
    has_in_progress_attempt: false,
    last_attempt_failed: true,
    executor: 'codex',
  },
];

const COLUMNS: TaskStatus[] = ['todo', 'inprogress', 'inreview', 'done'];

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: colors.statusInit,
  inprogress: colors.statusRunning,
  inreview: colors.warning,
  done: colors.statusComplete,
  cancelled: '#6b7280',
};

type TaskCardProps = {
  task: TaskWithAttemptStatus;
  onPress: () => void;
};

function TaskCard({ task, onPress }: TaskCardProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.taskCard} activeOpacity={0.7}>
      <View style={styles.taskHeader}>
        <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
        {task.has_in_progress_attempt && <View style={styles.runningDot} />}
        {task.last_attempt_failed && !task.has_in_progress_attempt && (
          <Ionicons name="alert-circle" size={14} color={colors.statusFailed} style={styles.alertIcon} />
        )}
      </View>
      {task.description && (
        <Text style={styles.taskDescription} numberOfLines={2}>{task.description}</Text>
      )}
      <View style={styles.taskFooter}>
        <View style={styles.executorBadge}>
          <Ionicons name="terminal" size={10} color={colors.mutedForeground} />
          <Text style={styles.executorText}>{task.executor}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

type ColumnProps = {
  status: TaskStatus;
  tasks: TaskWithAttemptStatus[];
  onTaskPress: (taskId: string) => void;
};

function Column({ status, tasks, onTaskPress }: ColumnProps) {
  const config = TASK_STATUS_CONFIG[status];

  return (
    <View style={[styles.column, { width: COLUMN_WIDTH, marginRight: COLUMN_GAP }]}>
      <View style={styles.columnHeader}>
        <View style={styles.columnTitleRow}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
          <Text style={styles.columnTitle}>{config.label}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{tasks.length}</Text>
        </View>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TaskCard task={item} onPress={() => onTaskPress(item.id)} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyText}>No tasks</Text>
          </View>
        }
      />
    </View>
  );
}

export function KanbanScreen() {
  const route = useRoute<MainTabScreenProps<'Kanban'>['route']>();
  const navigation = useNavigation<RootStackScreenProps<'Main'>['navigation']>();
  const { projectId } = route.params;
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const tasksByStatus = COLUMNS.reduce(
    (acc, status) => {
      acc[status] = MOCK_TASKS.filter((t) => t.status === status);
      return acc;
    },
    {} as Record<TaskStatus, TaskWithAttemptStatus[]>
  );

  const handleTaskPress = (taskId: string) => {
    navigation.navigate('TaskDetails', { taskId, projectId: projectId || '1' });
  };

  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (COLUMN_WIDTH + COLUMN_GAP));
    setCurrentIndex(Math.min(Math.max(index, 0), COLUMNS.length - 1));
  };

  const handleCreateTask = () => {};

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.flex1}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled={false}
          snapToInterval={COLUMN_WIDTH + COLUMN_GAP}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: (SCREEN_WIDTH - COLUMN_WIDTH) / 2,
            paddingTop: 16,
            paddingBottom: 100,
          }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {COLUMNS.map((status) => (
            <Column key={status} status={status} tasks={tasksByStatus[status]} onTaskPress={handleTaskPress} />
          ))}
        </ScrollView>

        <View style={styles.pagination}>
          {COLUMNS.map((_, index) => (
            <View key={index} style={[styles.dot, index === currentIndex ? styles.dotActive : styles.dotInactive]} />
          ))}
        </View>
      </View>

      <TouchableOpacity onPress={handleCreateTask} style={styles.fab} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color={colors.successForeground} />
      </TouchableOpacity>
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
  column: {
    backgroundColor: 'rgba(48, 46, 44, 0.3)',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  columnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  columnTitle: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.sm,
    color: colors.foreground,
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  countText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  taskCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  taskTitle: {
    flex: 1,
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.sm,
    color: colors.foreground,
    fontWeight: '500',
  },
  runningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.statusRunning,
    marginLeft: spacing.sm,
    marginTop: 4,
  },
  alertIcon: {
    marginLeft: spacing.sm,
  },
  taskDescription: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  executorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 46, 44, 0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  executorText: {
    marginLeft: spacing.xs,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
  },
  emptyColumn: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  pagination: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: colors.foreground,
  },
  dotInactive: {
    backgroundColor: colors.muted,
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
});
