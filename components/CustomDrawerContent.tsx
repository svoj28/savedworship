// components/CustomDrawerContent.tsx
import React, { useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser, signOut, AuthUser } from '../lib/auth'
import { useNavigation } from '@react-navigation/native'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function CustomDrawerContent({ visible, onClose }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const navigation = useNavigation<any>()

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
    } catch (err) {
      console.error('Error loading user:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          try {
            onClose()
            await signOut()
          } catch (err) {
            Alert.alert('Error', 'Failed to logout')
          }
        },
        style: 'destructive',
      },
    ])
  }

  const handleNavigate = (screenName: string) => {
    onClose()
    navigation.navigate(screenName)
  }

  return (
    <View style={styles.container}>
      {/* Header with Account Info */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color="#fff" />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.email?.split('@')[0] || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'Not logged in'}</Text>
          </View>
        </View>
      </View>

      {/* Menu Items */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('Metronome')}
        >
          <Ionicons name="timer" size={24} color="#007AFF" />
          <Text style={styles.menuItemText}>Metronome</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('ManualTranspose')}
        >
          <Ionicons name="swap-vertical" size={24} color="#007AFF" />
          <Text style={styles.menuItemText}>Manual Transpose</Text>
        </TouchableOpacity>

        <View style={styles.divider} />
      </ScrollView>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out" size={20} color="#f44" />
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '75%',
    height: '100%',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  menuContainer: {
    flex: 1,
    paddingVertical: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f44',
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f44',
  },
})
