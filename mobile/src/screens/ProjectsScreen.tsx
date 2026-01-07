import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabScreenProps } from '@/navigation/types';
import type { Project } from '@/types';
import { colors, borderRadius, fontSize, spacing } from '@/styles/theme';

const MOCK_PROJECTS: (Project & { taskCount?: number })[] = [
  {
    id: '1',
    name: 'vibe-kanban',
    dev_script: 'pnpm run dev',
    github_repo_url: 'https://github.com/BloopAI/vibe-kanban',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-07T00:00:00Z',
    taskCount: 12,
  },
  {
    id: '2',
    name: 'my-saas-app',
    dev_script: null,
    github_repo_url: 'https://github.com/user/my-saas-app',
    created_at: '2025-01-05T00:00:00Z',
    updated_at: '2025-01-06T00:00:00Z',
    taskCount: 5,
  },
  {
    id: '3',
    name: 'local-project',
    dev_script: 'npm start',
    github_repo_url: null,
    created_at: '2025-01-06T00:00:00Z',
    updated_at: '2025-01-07T00:00:00Z',
    taskCount: 0,
  },
];

type ProjectCardProps = {
  project: Project & { taskCount?: number };
  index: number;
  onPress: () => void;
};

function ProjectCard({ project, onPress }: ProjectCardProps) {
  const repoName = project.github_repo_url
    ? project.github_repo_url.split('/').slice(-2).join('/')
    : null;

  return (
    <View>
      <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <View style={styles.flex1}>
            <Text style={styles.projectName}>{project.name}</Text>
            {repoName && (
              <View style={styles.repoRow}>
                <Ionicons name="logo-github" size={14} color={colors.mutedForeground} />
                <Text style={styles.repoName}>{repoName}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardActions}>
            <View style={styles.taskBadge}>
              <Text style={styles.taskCount}>{project.taskCount ?? 0} tasks</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={styles.chevron} />
          </View>
        </View>

        {project.dev_script && (
          <View style={styles.devScriptContainer}>
            <Text style={styles.devScript} numberOfLines={1}>$ {project.dev_script}</Text>
          </View>
        )}

        <Text style={styles.updatedAt}>
          Updated {new Date(project.updated_at).toLocaleDateString()}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="folder-open-outline" size={32} color={colors.mutedForeground} />
      </View>
      <Text style={styles.emptyTitle}>No Projects Yet</Text>
      <Text style={styles.emptySubtitle}>Create your first project to start managing AI coding tasks</Text>
      <TouchableOpacity onPress={onCreate} style={styles.createButton} activeOpacity={0.8}>
        <Text style={styles.createButtonText}>Create Project</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ProjectsScreen() {
  const navigation = useNavigation<MainTabScreenProps<'Projects'>['navigation']>();
  const [refreshing, setRefreshing] = useState(false);
  const [projects] = useState(MOCK_PROJECTS);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const handleProjectPress = (projectId: string) => {
    navigation.navigate('Kanban', { projectId });
  };

  const handleCreateProject = () => {};

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {projects.length === 0 ? (
        <EmptyState onCreate={handleCreateProject} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ProjectCard project={item} index={index} onPress={() => handleProjectPress(item.id)} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground} />
          }
        />
      )}

      <TouchableOpacity onPress={handleCreateProject} style={styles.fab} activeOpacity={0.8}>
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
  listContent: {
    paddingTop: spacing.lg,
    paddingBottom: 100,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  projectName: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontWeight: '600',
  },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  repoName: {
    marginLeft: spacing.xs,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  taskCount: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.foreground,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
  devScriptContainer: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(48, 46, 44, 0.5)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  devScript: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  updatedAt: {
    marginTop: spacing.sm,
    fontFamily: 'ChivoMono',
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.lg,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontFamily: 'ChivoMono',
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  createButton: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  createButtonText: {
    fontFamily: 'ChivoMono-Bold',
    fontSize: fontSize.sm,
    color: colors.successForeground,
    fontWeight: '600',
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
