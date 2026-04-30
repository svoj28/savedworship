import React, { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, View, Alert, Modal, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'

// Initialize database
import { initializeDatabase } from './db/index'

// Auth
import { onAuthStateChange, getCurrentUser, AuthUser } from './lib/auth'

// Sync
import { stampUserIdOnUnsyncedRows, startPeriodicSync } from './lib/sync'

// Screens
import SignInScreen from './screens/SignInScreen'
import SignUpScreen from './screens/SignUpScreen'
import ChordListsHomeScreen from './screens/ChordListsHomeScreen'
import ChordListScreen from './screens/ChordListScreen'
import AddSongScreen from './screens/AddSongScreen'
import NoteDetailScreen from './screens/NoteDetailScreen'
import MetronomeScreen from './screens/MetronomeScreen'
import ManualTransposeScreen from './screens/ManualTransposeScreen'
import KeyPitchChangerScreen from './screens/KeyPitchChangerScreen'
import VocalRemoverScreen from './screens/VocalRemoverScreen'
import PersonalNotesScreen from './screens/PersonalNotesScreen'
import ManagementScreen from './screens/ManagementScreen'
import ConversationScreen from './screens/ConversationScreen'
import AddContactsScreen from './screens/AddContactsScreen'
import EditAccountScreen from './screens/EditAccountScreen'

// Components
import CustomDrawerContent from './components/CustomDrawerContent'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

/**
 * Auth Stack - Sign In / Sign Up
 */
function AuthStack() {
  const [showSignUp, setShowSignUp] = useState(false)

  return (
    <Stack.Navigator
      id="auth-stack"
      screenOptions={{
        headerShown: false,
      }}
    >
      {showSignUp ? (
        <Stack.Screen
          name="SignUp"
          options={{}}
        >
          {(props: any) => (
            <SignUpScreen
              {...props}
              onSignUpSuccess={() => setShowSignUp(false)}
              onNavigateToSignIn={() => setShowSignUp(false)}
            />
          )}
        </Stack.Screen>
      ) : (
        <Stack.Screen
          name="SignIn"
          options={{}}
        >
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

/**
 * Chord Lists Stack - Browse and view chord lists
 */
function ChordListsStack() {
  return (
    <Stack.Navigator
      id="chord-lists-stack"
      screenOptions={{
        headerTintColor: '#007AFF',
        headerShown: true,
      }}
    >
      <Stack.Screen
        name="ChordListsHome"
        component={ChordListsHomeScreen}
        options={{ title: 'Chord Lists' }}
      />
      <Stack.Screen
        name="ChordList"
        component={ChordListScreen}
        options={{ title: 'Song', headerLeft: () => null }}
      />
      <Stack.Screen
        name="AddSong"
        component={AddSongScreen}
        options={{ title: 'Add Song', headerLeft: () => null }}
      />
    </Stack.Navigator>
  )
}

/**
 * Personal Notes Stack - View and edit personal notes
 */
function PersonalNotesStack() {
  return (
    <Stack.Navigator
      id="personal-notes-stack"
      screenOptions={{
        headerTintColor: '#007AFF',
        headerShown: true,
      }}
    >
      <Stack.Screen
        name="PersonalNotesHome"
        component={PersonalNotesScreen}
        options={{ title: 'Notes' }}
      />
      <Stack.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ title: 'Note', headerLeft: () => null }}
      />
    </Stack.Navigator>
  )
}

/**
 * App Tab Navigator - Main authenticated screens (Chords, Notes, Management, Conversation)
 */
function TabsScreen({ setDrawerVisible }: { setDrawerVisible: (visible: boolean) => void }) {
  return (
    <Tab.Navigator
      id="main-tabs"
      screenOptions={({ route }) => ({
        headerShown: true,
        headerTintColor: '#007AFF',
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => setDrawerVisible(true)}
            style={{ marginLeft: 16 }}
          >
            <Ionicons name="menu" size={24} color="#007AFF" />
          </TouchableOpacity>
        ),
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap

          if (route.name === 'ChordListsTab') {
            iconName = focused ? 'musical-notes' : 'musical-notes-outline'
          } else if (route.name === 'PersonalNotesTab') {
            iconName = focused ? 'shield' : 'shield-outline'
          } else if (route.name === 'ManagementTab') {
            iconName = focused ? 'settings' : 'settings-outline'
          } else if (route.name === 'ConversationTab') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline'
          } else {
            iconName = 'ellipse'
          }

          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
      })}
    >
      <Tab.Screen
        name="ChordListsTab"
        component={ChordListsStack}
        options={{
          title: 'Chords',
        }}
      />
      <Tab.Screen
        name="PersonalNotesTab"
        component={PersonalNotesStack}
        options={{
          title: 'Notes',
        }}
      />
      <Tab.Screen
        name="ManagementTab"
        component={ManagementScreen}
        options={{
          title: 'Management',
        }}
      />
      <Tab.Screen
        name="ConversationTab"
        component={ConversationScreen}
        options={{
          title: 'Conversation',
        }}
      />
    </Tab.Navigator>
  )
}

/**
 * App Stack Navigator - Tabs + Drawer Screens
 */
function AppTabs({ drawerVisible, setDrawerVisible }: { drawerVisible: boolean; setDrawerVisible: (visible: boolean) => void }) {
  return (
    <>
      <Stack.Navigator
        id="app-stack"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="TabsStack"
          options={{ headerShown: false }}
        >
          {() => <TabsScreen setDrawerVisible={setDrawerVisible} />}
        </Stack.Screen>
        <Stack.Screen
          name="Metronome"
          component={MetronomeScreen}
          options={{ title: 'Metronome', headerShown: true, headerTintColor: '#007AFF', headerLeft: () => null }}
        />
        <Stack.Screen
          name="ManualTranspose"
          component={ManualTransposeScreen}
          options={{ title: 'Transpose Chords', headerShown: true, headerTintColor: '#007AFF', headerLeft: () => null }}
        />
        <Stack.Screen
          name="KeyPitchChanger"
          component={KeyPitchChangerScreen}
          options={{ title: 'Key/Pitch Changer', headerShown: true, headerTintColor: '#007AFF', headerLeft: () => null }}
        />
        <Stack.Screen
          name="VocalRemover"
          component={VocalRemoverScreen}
          options={{ title: 'Vocal & Instrument Remover', headerShown: true, headerTintColor: '#007AFF', headerLeft: () => null }}
        />
        <Stack.Screen
          name="AddContacts"
          component={AddContactsScreen}
          options={{ title: 'Contacts', headerShown: true, headerTintColor: '#007AFF', headerLeft: () => null }}
        />
        <Stack.Screen
          name="EditAccount"
          component={EditAccountScreen}
          options={{ title: 'Edit Profile', headerShown: true, headerTintColor: '#007AFF', headerLeft: () => null }}
        />
      </Stack.Navigator>

      {/* Modal Drawer */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Drawer Content */}
          <CustomDrawerContent
            visible={drawerVisible}
            onClose={() => setDrawerVisible(false)}
          />
          {/* Overlay */}
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
            onPress={() => setDrawerVisible(false)}
          />
        </View>
      </Modal>
    </>
  )
}

/**
 * Root Navigation - Auth or App
 */
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const periodicSyncCleanupRef = React.useRef<(() => void) | null>(null)

  useEffect(() => {

    const startSync = async () => {
  await stampUserIdOnUnsyncedRows(user.id) // fix any rows missing user_id
  const cleanup = await startPeriodicSync(user.id, 60000)
  periodicSyncCleanupRef.current = cleanup
}
    // Initialize database and auth sequentially
    const initializeApp = async () => {
      try {
        console.log('Initializing database...')
        await initializeDatabase()
        console.log('Database ready')

        // Check current auth state
        const authUser = await getCurrentUser()
        setUser(authUser)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error('App initialization failed:', err)
        setDbError(errorMsg)
      } finally {
        setLoading(false)
      }
    }

    initializeApp()

    // Listen for auth state changes
    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Start periodic sync when user is authenticated
  useEffect(() => {
    if (!user) {
      // Clean up sync when user logs out
      if (periodicSyncCleanupRef.current) {
        periodicSyncCleanupRef.current()
        periodicSyncCleanupRef.current = null
      }
      return
    }

    // Start periodic sync when user logs in
    const startSync = async () => {
      try {
        console.log('Starting periodic sync for user:', user.id)
        const cleanup = await startPeriodicSync(user.id, 60000) // Sync every 60 seconds
        periodicSyncCleanupRef.current = cleanup
      } catch (err) {
        console.error('Failed to start periodic sync:', err)
      }
    }

    startSync()

    // Cleanup on unmount or user change
    return () => {
      if (periodicSyncCleanupRef.current) {
        periodicSyncCleanupRef.current()
        periodicSyncCleanupRef.current = null
      }
    }
  }, [user])

  if (dbError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <StatusBar style="auto" />
      </View>
    )
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {user ? (
        <>
          <AppTabs drawerVisible={drawerVisible} setDrawerVisible={setDrawerVisible} />
          <StatusBar style="auto" />
        </>
      ) : (
        <>
          <AuthStack />
          <StatusBar style="auto" />
        </>
      )}
    </NavigationContainer>
  )
}
