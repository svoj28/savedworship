import React, { useEffect, useState, createContext, useContext } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  ActivityIndicator,
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'

// Initialize database
import { initializeDatabase } from './db/index'

// Auth
import { onAuthStateChange, getCurrentUser, AuthUser } from './lib/auth'

// Sync
import { stampUserIdOnUnsyncedRows, startPeriodicSync, removeOrphanedUnsyncedRows } from './lib/sync'
import { startNetworkSync, stopNetworkSync } from './lib/networkSync'

// Notifications
import { NotificationProvider } from './lib/NotificationContext'
import NotificationBell from './components/NotificationBell'

// Screens
import SignInScreen from './screens/SignInScreen'
import SignUpScreen from './screens/SignUpScreen'
import ChordListsHomeScreen from './screens/ChordListsHomeScreen'
import ChordListScreen from './screens/ChordListScreen'
import AddSongScreen from './screens/AddSongScreen'
import NoteDetailScreen from './screens/NoteDetailScreen'
import MetronomeScreen from './screens/MetronomeScreen'
import ManualTransposeScreen from './screens/ManualTransposeScreen'
import PersonalNotesScreen from './screens/PersonalNotesScreen'
import ManagementScreen from './screens/ManagementScreen'
import ConversationScreen from './screens/ConversationScreen'
import AddContactsScreen from './screens/AddContactsScreen'
import EditAccountScreen from './screens/EditAccountScreen'
import { useRole } from '../SavedWorshipMusicTool/lib/useRole'
import AudioToolsScreen from './screens/AudioToolsScreen'
import { StatusBar as RNStatusBar } from 'react-native'

// Components
import CustomDrawerContent from './components/CustomDrawerContent'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// ─── Theme Context ────────────────────────────────────────────────────────────
type ThemeMode = 'dark' | 'light'

type AppColors = {
  bg: string
  surface: string
  border: string
  text: string
  textSub: string
  icon: string
  iconInactive: string
  tabBar: string
  header: string
  overlay: string
  accent: string
  accentText: string
  hairline: string
  statusBar: 'light' | 'dark'
}

const DARK_COLORS: AppColors = {
  bg: '#0a0a0a',
  surface: '#141414',
  border: 'rgba(255,255,255,0.1)',
  text: '#ffffff',
  textSub: 'rgba(255,255,255,0.45)',
  icon: '#ffffff',
  iconInactive: 'rgba(255,255,255,0.3)',
  tabBar: '#0a0a0a',
  header: '#0a0a0a',
  overlay: 'rgba(0,0,0,0.6)',
  accent: '#ffffff',
  accentText: '#0a0a0a',
  hairline: 'rgba(255,255,255,0.1)',
  statusBar: 'light',
}

const LIGHT_COLORS: AppColors = {
  bg: '#f5f5f5',
  surface: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  text: '#0a0a0a',
  textSub: 'rgba(0,0,0,0.4)',
  icon: '#0a0a0a',
  iconInactive: 'rgba(0,0,0,0.3)',
  tabBar: '#ffffff',
  header: '#ffffff',
  overlay: 'rgba(0,0,0,0.35)',
  accent: '#0a0a0a',
  accentText: '#ffffff',
  hairline: 'rgba(0,0,0,0.1)',
  statusBar: 'dark',
}

interface ThemeContextType {
  mode: ThemeMode
  toggle: () => void
  colors: AppColors
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  toggle: () => {},
  colors: DARK_COLORS,
})

export const useAppTheme = () => useContext(ThemeContext)

// ─── Theme Toggle Button ──────────────────────────────────────────────────────

function ThemeToggle() {
  const { mode, toggle, colors } = useAppTheme()
  return (
    <TouchableOpacity
      onPress={toggle}
      style={[themeToggleStyles.btn, { borderColor: colors.hairline }]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons
        name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
        size={17}
        color={colors.icon}
      />
    </TouchableOpacity>
  )
}

const themeToggleStyles = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
})

// ─── Auth Stack ───────────────────────────────────────────────────────────────

function AuthStack() {
  const [showSignUp, setShowSignUp] = useState(false)

  return (
    <Stack.Navigator id="auth-stack" screenOptions={{ headerShown: false }}>
      {showSignUp ? (
        <Stack.Screen name="SignUp">
          {(props: any) => (
            <SignUpScreen
              {...props}
              onSignUpSuccess={() => setShowSignUp(false)}
              onNavigateToSignIn={() => setShowSignUp(false)}
            />
          )}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="SignIn">
          {(props: any) => (
            <SignInScreen
              {...props}
              onSignInSuccess={() => {}}
              onNavigateToSignUp={() => setShowSignUp(true)}
            />
          )}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  )
}

// ─── Chord Lists Stack ────────────────────────────────────────────────────────

function ChordListsStack() {
  const { canManageChords } = useRole()
  const { colors } = useAppTheme()

  return (
    <Stack.Navigator
      id="chord-lists-stack"
      screenOptions={{
        headerShown: false,
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.header },
      }}
    >
      <Stack.Screen name="ChordListsHome" component={ChordListsHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ChordList"
        component={ChordListScreen}
        options={{ title: 'Song', headerLeft: () => null, headerShown: true }}
      />
      {canManageChords && (
        <Stack.Screen
          name="AddSong"
          component={AddSongScreen}
          options={{ title: 'Add Song', headerLeft: () => null, headerShown: true }}
        />
      )}
    </Stack.Navigator>
  )
}

// ─── Personal Notes Stack ─────────────────────────────────────────────────────

function PersonalNotesStack() {
  const { colors } = useAppTheme()
  return (
    <Stack.Navigator
      id="personal-notes-stack"
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.header },
      }}
    >
      <Stack.Screen name="PersonalNotesHome" component={PersonalNotesScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ title: 'Note', headerLeft: () => null }}
      />
    </Stack.Navigator>
  )
}

// ─── Shared header options factory ───────────────────────────────────────────

function makeHeaderOptions(colors: AppColors) {
  return {
    headerShown: true,
    headerTintColor: colors.text,
    headerStyle: { 
      backgroundColor: colors.header,
    },
    headerShadowVisible: false,
    headerTitleStyle: {
      fontWeight: '700' as const,
      fontSize: 15,
      letterSpacing: 0.3,
      color: colors.text,
    },
  }
}

// ─── Tab Navigator ────────────────────────────────────────────────────────────

function TabsScreen({ setDrawerVisible }: { setDrawerVisible: (v: boolean) => void }) {
  const { colors } = useAppTheme()

  const tabIcon = (route: any, focused: boolean, color: string, size: number) => {
    const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
      ChordListsTab:    ['musical-notes',  'musical-notes-outline'],
      PersonalNotesTab: ['shield',          'shield-outline'],
      ManagementTab:    ['settings',        'settings-outline'],
      ConversationTab:  ['chatbubbles',     'chatbubbles-outline'],
    }
    const [active, inactive] = icons[route.name] ?? ['ellipse', 'ellipse-outline']
    return <Ionicons name={focused ? active : inactive} size={size} color={color} />
  }

  return (
    <Tab.Navigator
      id="main-tabs"
      screenOptions={({ route }) => ({
        ...makeHeaderOptions(colors),
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => setDrawerVisible(true)}
            style={{ marginLeft: 16 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="menu-outline" size={22} color={colors.icon} />
          </TouchableOpacity>
        ),
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
            <ThemeToggle />
            <NotificationBell />
          </View>
        ),
        tabBarIcon: ({ focused, color, size }) => tabIcon(route, focused, color, size),
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.iconInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          height: Platform.OS === 'ios' ? 84 : 60,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        },
      })}
    >
      <Tab.Screen name="ChordListsTab"    component={ChordListsStack}   options={{ title: 'Chords' }} />
      <Tab.Screen name="PersonalNotesTab" component={PersonalNotesStack} options={{ title: 'Notes' }} />
      <Tab.Screen name="ManagementTab"    component={ManagementScreen}   options={{ title: 'Manage' }} />
      <Tab.Screen name="ConversationTab"  component={ConversationScreen} options={{ title: 'Chat' }} />
    </Tab.Navigator>
  )
}

// ─── App Stack ────────────────────────────────────────────────────────────────

function AppTabs({
  drawerVisible,
  setDrawerVisible,
}: {
  drawerVisible: boolean
  setDrawerVisible: (v: boolean) => void
}) {
  const { colors } = useAppTheme()

  return (
    <>
      <Stack.Navigator id="app-stack" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TabsStack">
          {() => <TabsScreen setDrawerVisible={setDrawerVisible} />}
        </Stack.Screen>
        <Stack.Screen
          name="Metronome"
          component={MetronomeScreen}
          options={{ title: 'Metronome', headerLeft: () => null, ...makeHeaderOptions(colors) }}
        />
        <Stack.Screen
          name="ManualTranspose"
          component={ManualTransposeScreen}
          options={{ title: 'Transpose Chords', headerLeft: () => null, ...makeHeaderOptions(colors) }}
        />
        <Stack.Screen
          name="AudioTools"
          component={AudioToolsScreen}
          options={{ title: 'Audio Tools', headerLeft: () => null, ...makeHeaderOptions(colors) }}
        />
        <Stack.Screen
          name="AddContacts"
          component={AddContactsScreen}
          options={{ title: 'Contacts', headerLeft: () => null, ...makeHeaderOptions(colors) }}
        />
        <Stack.Screen
          name="EditAccount"
          component={EditAccountScreen}
          options={{ title: 'Edit Profile', headerLeft: () => null, ...makeHeaderOptions(colors) }}
        />
      </Stack.Navigator>

      {/* Slide-in Drawer */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <CustomDrawerContent visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.overlay }}
            activeOpacity={1}
            onPress={() => setDrawerVisible(false)}
          />
        </View>
      </Modal>
    </>
  )
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen({ colors }: { colors: AppColors }) {
  return (
    <View style={[loadStyles.root, { backgroundColor: colors.bg }]}>
      <View style={[loadStyles.wordmarkRow]}>
        <Text style={[loadStyles.wordmark, { color: colors.text }]}>S A V E D</Text>
        <Text style={[loadStyles.wordmarkLight, { color: colors.textSub }]}>WORSHIP</Text>
      </View>
      <View style={[loadStyles.spinnerWrap, { borderColor: colors.hairline }]}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    </View>
  )
}

const loadStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 5,
  },
  wordmarkLight: {
    fontSize: 22,
    fontWeight: '300',
    letterSpacing: 5,
  },
  spinnerWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

// ─── Root ─────────────────────────────────────────────────────────────────────

function AppContent() {
  const { mode, colors } = useAppTheme()

  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [dbReady, setDbReady] = useState(false)
  const periodicSyncCleanupRef = React.useRef<(() => void) | null>(null)

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initializeDatabase()
        setDbReady(true)
        const authUser = await getCurrentUser()
        setUser(authUser)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        setDbError(errorMsg)
      } finally {
        setLoading(false)
      }
    }
    initializeApp()
    const unsubscribe = onAuthStateChange(setUser)
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || !dbReady) {
      periodicSyncCleanupRef.current?.()
      periodicSyncCleanupRef.current = null
      stopNetworkSync()
      return
    }
    const startSync = async () => {
      try {
        await removeOrphanedUnsyncedRows(user.id)
        await stampUserIdOnUnsyncedRows(user.id)
        const cleanup = await startPeriodicSync(user.id, 60000)
        periodicSyncCleanupRef.current = cleanup
        startNetworkSync()
      } catch (err) {
        console.error('Sync start failed:', err)
      }
    }
    startSync()
    return () => {
      periodicSyncCleanupRef.current?.()
      periodicSyncCleanupRef.current = null
      stopNetworkSync()
    }
  }, [user, dbReady])

  const navTheme = mode === 'dark'
    ? {
        ...DarkTheme,
        colors: { ...DarkTheme.colors, background: colors.bg, card: colors.header, border: colors.hairline, text: colors.text },
      }
    : {
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.header, border: colors.hairline, text: colors.text },
      }

  if (dbError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  }

  if (loading) {
    return <LoadingScreen colors={colors} />
  }

 return (
  <NotificationProvider userId={user?.id ?? null}>
    <View style={{ flex: 1, paddingTop: RNStatusBar.currentHeight ?? 0, backgroundColor: colors.header }}>
      <NavigationContainer theme={navTheme}>
        <StatusBar style={colors.statusBar} />
        {user ? (
          <AppTabs drawerVisible={drawerVisible} setDrawerVisible={setDrawerVisible} />
        ) : (
          <AuthStack />
        )}
      </NavigationContainer>
    </View>
  </NotificationProvider>
)
}

export default function App() {
  const [mode, setMode] = useState<ThemeMode>('dark')
  const colors = mode === 'dark' ? DARK_COLORS : LIGHT_COLORS

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider
        value={{ mode, toggle: () => setMode(m => m === 'dark' ? 'light' : 'dark'), colors }}
      >
        <AppContent />
      </ThemeContext.Provider>
    </SafeAreaProvider>
  )
}