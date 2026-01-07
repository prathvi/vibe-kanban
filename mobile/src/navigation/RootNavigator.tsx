import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { LoginScreen } from '@/screens/LoginScreen';
import { ProjectsScreen } from '@/screens/ProjectsScreen';
import { KanbanScreen } from '@/screens/KanbanScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TaskDetailsScreen } from '@/screens/TaskDetailsScreen';
import { LogsViewerScreen } from '@/screens/LogsViewerScreen';
import { ServersScreen } from '@/screens/ServersScreen';
import type { RootStackParamList, MainTabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: 'hsl(48, 4%, 16%)',
          borderTopColor: 'hsl(60, 2%, 25%)',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: 'hsl(48, 7%, 85%)',
        tabBarInactiveTintColor: 'hsl(48, 2%, 55%)',
        headerStyle: {
          backgroundColor: 'hsl(48, 4%, 16%)',
        },
        headerTintColor: 'hsl(48, 7%, 85%)',
        headerTitleStyle: {
          fontFamily: 'ChivoMono',
        },
      }}
    >
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" size={size} color={color} />
          ),
          headerTitle: 'Projects',
        }}
      />
      <Tab.Screen
        name="Kanban"
        component={KanbanScreen}
        initialParams={{ projectId: '' }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
          headerTitle: 'Tasks',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'hsl(48, 4%, 16%)' },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="TaskDetails"
              component={TaskDetailsScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: 'hsl(48, 4%, 16%)' },
                headerTintColor: 'hsl(48, 7%, 85%)',
                headerTitle: 'Task Details',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="AttemptLogs"
              component={LogsViewerScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: 'hsl(48, 4%, 16%)' },
                headerTintColor: 'hsl(48, 7%, 85%)',
                headerTitle: 'Execution Logs',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="Servers"
              component={ServersScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: 'hsl(48, 4%, 16%)' },
                headerTintColor: 'hsl(48, 7%, 85%)',
                headerTitle: 'Manage Servers',
                presentation: 'modal',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
