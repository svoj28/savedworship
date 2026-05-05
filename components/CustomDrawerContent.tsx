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
  Animated,
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
  const [expandFriends, setExpandFriends] = useState(true)
  const navigation = useNavigation<any>()

  useEffect(() => {
    loadUser()
  }, [])

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
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        onPress: async () => {
          try {
            onClose()
            await signOut()
          } catch (err) {
            Alert.alert('Error', 'Failed to sign out')
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

      {/* Header */}
      <View style={styles.header}>
        {/* Top accent line */}
        <View style={styles.accentLine} />

        {/* App title */}
        <View style={styles.appTitleRow}>
          <Ionicons name="musical-notes" size={14} color="#999" />
          <Text style={styles.appTitle}>SAVED WORSHIP</Text>
        </View>

        {/* Avatar & User Info */}
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrapper}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={28} color="#000" />
              </View>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {profile?.nickname || user?.email?.split('@')[0] || 'Member'}
            </Text>
            <Text style={styles.userEmail}>{user?.email || 'Not signed in'}</Text>
            {profile?.instruments && (
              <View style={styles.instrumentBadge}>
                <Text style={styles.instrumentText}>{profile.instruments}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Bio */}
        {profile?.bio && (
          <View style={styles.bioContainer}>
            <Text style={styles.bioText} numberOfLines={2}>
              {profile.bio}
            </Text>
          </View>
        )}

        {/* Recipient ID */}
        {user?.id && (
          <TouchableOpacity
            style={styles.idContainer}
            onPress={() => copyToClipboard(generateShortId(user.id), 'Recipient ID')}
            activeOpacity={0.7}
          >
            <View style={styles.idRow}>
              <Text style={styles.idLabel}>RECIPIENT ID</Text>
              <View style={styles.copyBadge}>
                <Ionicons name="copy-outline" size={11} color="#fff" />
                <Text style={styles.copyText}>COPY</Text>
              </View>
            </View>
            <Text style={styles.idValue}>{generateShortId(user.id)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Scrollable Menu */}
      <ScrollView
        style={styles.menuScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.menuContent}
      >
        {/* Section: Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('EditAccount')}
          activeOpacity={0.6}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="person-outline" size={18} color="#000" />
          </View>
          <Text style={styles.menuLabel}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('AddContacts')}
          activeOpacity={0.6}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="person-add-outline" size={18} color="#000" />
          </View>
          <Text style={styles.menuLabel}>Add Contacts</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        {/* Section: Members */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>MEMBERS</Text>
          <TouchableOpacity
            onPress={() => setExpandFriends(!expandFriends)}
            style={styles.expandButton}
          >
            <Ionicons
              name={expandFriends ? 'chevron-up' : 'chevron-down'}
              size={14}
              color="#888"
            />
          </TouchableOpacity>
        </View>

        {expandFriends && (
          <View style={styles.friendsContainer}>
            {contacts.length === 0 ? (
              <View style={styles.emptyFriends}>
                <Ionicons name="people-outline" size={22} color="#ccc" />
                <Text style={styles.emptyFriendsText}>No members yet</Text>
              </View>
            ) : (
              contacts.map((contact, index) => (
                <TouchableOpacity
                  key={contact.id}
                  style={[
                    styles.friendItem,
                    index === contacts.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    onClose()
                    navigation.navigate('AddContacts')
                  }}
                  activeOpacity={0.6}
                >
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>
                      {(contact.contactName || 'F')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>
                      {contact.contactName || 'Member'}
                    </Text>
                    <Text style={styles.friendId}>
                      {generateShortId(contact.contactUserId)}
                    </Text>
                  </View>
                  {contact.status === 'accepted' && (
                    <View style={styles.statusDot} />
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={styles.countRow}>
          <Text style={styles.countText}>{contacts.length} member{contacts.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Section: Tools */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>TOOLS</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('Metronome')}
          activeOpacity={0.6}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="timer-outline" size={18} color="#000" />
          </View>
          <Text style={styles.menuLabel}>Metronome</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => handleNavigate('ManualTranspose')}
          activeOpacity={0.6}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="git-compare-outline" size={18} color="#000" />
          </View>
          <Text style={styles.menuLabel}>Transpose Chords</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuItem, { borderBottomWidth: 0 }]}
          onPress={() => handleNavigate('AudioTools')}
          activeOpacity={0.6}
        >
          <View style={styles.menuIcon}>
            <Ionicons name="musical-note-outline" size={18} color="#000" />
          </View>
          <Text style={styles.menuLabel}>Audio Tools</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer: Sign Out */}
      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        <TouchableOpacity style={styles.signOutButton} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={17} color="#333" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '75%',
    height: '100%',
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e8e8e8',
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 20,
  },
  accentLine: {
    width: 28,
    height: 2,
    backgroundColor: '#fff',
    marginBottom: 16,
    opacity: 0.9,
  },
  appTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  appTitle: {
    fontSize: 10,
    letterSpacing: 2.5,
    color: '#888',
    fontWeight: '600',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  avatarWrapper: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 30,
    padding: 2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  userEmail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  instrumentBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  instrumentText: {
    fontSize: 10,
    color: '#aaa',
    letterSpacing: 0.5,
  },
  bioContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
    marginBottom: 14,
  },
  bioText: {
    fontSize: 12,
    color: '#777',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  idContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  idLabel: {
    fontSize: 9,
    letterSpacing: 2,
    color: '#555',
    fontWeight: '600',
  },
  copyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  copyText: {
    fontSize: 9,
    letterSpacing: 1,
    color: '#fff',
    fontWeight: '600',
  },
  idValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#fff',
    letterSpacing: 1,
  },

  // ── Menu ────────────────────────────────────────────────
  menuScroll: {
    flex: 1,
  },
  menuContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 2.5,
    color: '#bbb',
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  expandButton: {
    padding: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    letterSpacing: 0.1,
  },

  // ── Friends ─────────────────────────────────────────────
  friendsContainer: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    overflow: 'hidden',
  },
  emptyFriends: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyFriendsText: {
    fontSize: 12,
    color: '#bbb',
    fontStyle: 'italic',
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
    gap: 10,
  },
  friendAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  friendId: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 1,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
  },
  countRow: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 10,
    color: '#ccc',
    letterSpacing: 0.5,
  },

  // ── Footer ───────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  footerDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginBottom: 14,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    letterSpacing: 0.3,
  },
})