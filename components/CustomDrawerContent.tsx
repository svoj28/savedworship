// components/CustomDrawerContent.tsx
import React, { useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Clipboard,
  Image,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser, signOut, AuthUser } from '../lib/auth'
import { getContactsByUserId } from '../db/queries'
import { getUserProfileByUserId } from '../db/queries'
import { Contact, UserProfile } from '../db/models'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { generateShortId } from '../lib/shortId'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function CustomDrawerContent({ visible, onClose }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const navigation = useNavigation<any>()

  useEffect(() => {
    loadUser()
  }, [])

  // Reload contacts and profile when drawer is focused
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadContacts()
        loadProfile()
      }
    }, [user])
  )

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      if (currentUser) {
        await Promise.all([loadContacts(currentUser.id), loadProfile(currentUser.id)])
      }
    } catch (err) {
      console.error('Error loading user:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadContacts = async (userId?: string) => {
    if (!userId && !user) return
    try {
      const userContacts = await getContactsByUserId(userId || user!.id)
      setContacts(userContacts)
    } catch (err) {
      console.error('Error loading contacts:', err)
    }
  }

  const loadProfile = async (userId?: string) => {
    if (!userId && !user) return
    try {
      const userProfile = await getUserProfileByUserId(userId || user!.id)
      setProfile(userProfile)
    } catch (err) {
      console.error('Error loading profile:', err)
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await Clipboard.setString(text)
      Alert.alert('Copied', `${label} copied to clipboard`)
    } catch (err) {
      Alert.alert('Error', 'Failed to copy to clipboard')
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
          {profile?.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={36} color="#fff" />
            </View>
          )}
          
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {profile?.nickname || user?.email?.split('@')[0] || 'User'}
            </Text>
            <Text style={styles.userEmail}>{user?.email || 'Not logged in'}</Text>
            {profile?.instruments && (
              <Text style={styles.userRoles}>{profile.instruments}</Text>
            )}
          </View>
        </View>

        {profile?.bio && (
          <View style={styles.bioContainer}>
            <Text style={styles.bioText} numberOfLines={2}>{profile.bio}</Text>
          </View>
        )}
        
        {/* User ID Section */}
        {user?.id && (
          <TouchableOpacity 
            style={styles.userIdContainer}
            onPress={() => copyToClipboard(generateShortId(user.id), 'Recipient ID')}
          >
            <View style={styles.userIdLabelRow}>
              <Text style={styles.userIdLabel}>Recipient ID</Text>
              <Ionicons name="copy" size={14} color="rgba(255, 255, 255, 0.7)" />
            </View>
            <Text style={styles.userId}>{generateShortId(user.id)}</Text>
            <Text style={styles.userIdHint}>Tap to copy</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Menu Items */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('EditAccount')}
        >
          <Ionicons name="person-circle" size={24} color="#007AFF" />
          <Text style={styles.menuItemText}>Edit Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('AddContacts')}
        >
          <Ionicons name="person-add" size={24} color="#007AFF" />
          <Text style={styles.menuItemText}>Add Contacts</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Friends List */}
        <View style={styles.friendsSection}>
          <View style={styles.friendsHeader}>
            <Ionicons name="people" size={18} color="#007AFF" />
            <Text style={styles.friendsTitle}>Friends ({contacts.length})</Text>
          </View>

          {contacts.length === 0 ? (
            <Text style={styles.noFriendsText}>No friends yet</Text>
          ) : (
            <ScrollView 
              style={styles.friendsList}
              nestedScrollEnabled={true}
              scrollEventThrottle={16}
            >
              {contacts.map((contact) => (
                <TouchableOpacity
                  key={contact.id}
                  style={styles.friendItem}
                  onPress={() => {
                    onClose()
                    navigation.navigate('AddContacts')
                  }}
                >
                  <View style={styles.friendAvatar}>
                    <Ionicons name="person" size={16} color="#007AFF" />
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>
                      {contact.contactName || 'Friend'}
                    </Text>
                    <Text style={styles.friendId}>{generateShortId(contact.contactUserId)}</Text>
                  </View>
                  {contact.status === 'accepted' && (
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('Metronome')}
        >
          <Ionicons name="timer" size={24} color="#007AFF" />
          <Text style={styles.menuItemText}>Metronome</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, styles.highlightedMenuItem]}
          onPress={() => handleNavigate('ManualTranspose')}
        >
          <Ionicons name="git-compare" size={24} color="#007AFF" />
          <View style={styles.keyChangerContent}>
            <Text style={styles.menuItemText}>Transpose Chords</Text>
            <Text style={styles.menuItemSubtext}>Change chord keys</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, styles.keyPitchHighlight]}
          onPress={() => handleNavigate('KeyPitchChanger')}
        >
          <Ionicons name="musical-note" size={24} color="#FF9500" />
          <View style={styles.keyChangerContent}>
            <Text style={styles.menuItemText}>Key/Pitch Changer</Text>
            <Text style={styles.menuItemSubtext}>Adjust audio pitch</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, styles.vocalRemoverMenuItem]}
          onPress={() => handleNavigate('VocalRemover')}
        >
          <Ionicons name="mic-off" size={24} color="#FF6B6B" />
          <View style={styles.keyChangerContent}>
            <Text style={styles.menuItemText}>Vocal/Instrument Remover</Text>
            <Text style={styles.menuItemSubtext}>Remove vocals or instruments</Text>
          </View>
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
    paddingBottom: 16,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
  userInstruments: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
    fontStyle: 'italic',
  },
  userRoles: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
    fontStyle: 'italic',
  },
  bioContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  bioText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 16,
  },
  userIdContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  userIdLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userIdLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userId: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#fff',
    marginBottom: 4,
  },
  userIdHint: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    fontStyle: 'italic',
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
  friendsSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  friendsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  friendsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    textTransform: 'uppercase',
  },
  friendsList: {
    maxHeight: 200,
  },
  noFriendsText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginBottom: 6,
    gap: 8,
  },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  friendId: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  highlightedMenuItem: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    marginHorizontal: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  keyPitchHighlight: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    marginHorizontal: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
  },
  vocalRemoverMenuItem: {
    backgroundColor: '#FFE8E8',
    borderRadius: 8,
    marginHorizontal: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF6B6B',
  },
  keyChangerContent: {
    flex: 1,
  },
  menuItemSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
})
