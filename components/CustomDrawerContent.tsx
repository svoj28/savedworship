// components/CustomDrawerContent.tsx
import React, { useEffect, useMemo, useState } from 'react'
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
  Modal,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import Svg, { Rect } from 'react-native-svg'
import QRCodeGenerator from 'qrcode-generator'
import { getCurrentUser, signOut, AuthUser } from '../lib/auth'
import { getContactsByUserId, getContactsByRecipientId, getUserProfileByUserId } from '../db/queries'
import { Contact, UserProfile } from '../db/models'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { generateShortId } from '../lib/shortId'
import { onTableChange } from '../lib/sync'

type QRCodeGraphicProps = {
  value: string
  size: number
}

function QRCodeGraphic({ value, size }: QRCodeGraphicProps) {
  const qr = useMemo(() => {
    const generated = QRCodeGenerator(0, 'M')
    generated.addData(value)
    generated.make()
    return generated
  }, [value])

  const moduleCount = qr.getModuleCount()
  const modules: React.ReactElement[] = []

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!qr.isDark(row, column)) {
        continue
      }

      modules.push(
        <Rect
          key={`${row}-${column}`}
          x={column}
          y={row}
          width={1}
          height={1}
          fill="#000"
        />
      )
    }
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${moduleCount} ${moduleCount}`}>
      <Rect x={0} y={0} width={moduleCount} height={moduleCount} fill="#fff" />
      {modules}
    </Svg>
  )
}

function buildRecipientQrValue(userId: string) {
  return JSON.stringify({
    type: 'savedworship:recipient',
    userId,
    shortId: generateShortId(userId),
  })
}

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
  const [showQRModal, setShowQRModal] = useState(false)
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

  useEffect(() => {
    const unsubContacts = onTableChange('contacts', () => {
      loadContacts()
    })
    const unsubProfiles = onTableChange('user_profiles', () => {
      loadProfile()
      loadContacts()
    })

    return () => {
      unsubContacts()
      unsubProfiles()
    }
  }, [user])

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
      const selfId = userId || user!.id
      const [outgoing, incoming] = await Promise.all([
        getContactsByUserId(selfId),
        getContactsByRecipientId(selfId),
      ])

      const pairKey = (a: string, b: string) => [a, b].sort().join('::')
      const groups = new Map<string, Contact[]>()
      for (const contact of [...outgoing, ...incoming]) {
        const key = pairKey(contact.userId, contact.contactUserId)
        const list = groups.get(key) || []
        list.push(contact)
        groups.set(key, list)
      }

      const acceptedUnique = Array.from(groups.values()).flatMap((group) => {
        const blocked = group.find(contact => contact.status === 'blocked')
        if (blocked) return []

        const accepted = group.find(contact => contact.status === 'accepted')
        if (!accepted) return []

        return [accepted]
      })

      setContacts(acceptedUnique)
    } catch (err) {
      console.error('Error loading contacts:', err)
    }
  }

  const acceptedContacts = contacts.filter(c => c.status === 'accepted')

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
          <>
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

            {/* QR Code */}
            <TouchableOpacity
              style={styles.qrCodeContainer}
              onPress={() => setShowQRModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.qrCodeWrapper}>
                <QRCodeGraphic value={buildRecipientQrValue(user.id)} size={80} />
              </View>
              <View style={styles.qrLabel}>
                <Ionicons name="scan-circle-outline" size={12} color="#aaa" />
                <Text style={styles.qrLabelText}>Tap to enlarge</Text>
              </View>
            </TouchableOpacity>
          </>
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

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={styles.qrModalOverlay}>
          <TouchableOpacity
            style={styles.qrModalBackdrop}
            onPress={() => setShowQRModal(false)}
            activeOpacity={1}
          />
          <View style={styles.qrModalContent}>
            <View style={styles.qrModalHeader}>
              <Text style={styles.qrModalTitle}>Your Profile QR Code</Text>
              <TouchableOpacity
                onPress={() => setShowQRModal(false)}
                style={styles.qrModalCloseButton}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrModalBody}>
              <View style={styles.qrModalQRWrapper}>
                {user?.id && (
                  <QRCodeGraphic value={buildRecipientQrValue(user.id)} size={240} />
                )}
              </View>
              <Text style={styles.qrModalSubtext}>Share this QR code for direct messaging</Text>
            </View>

            <TouchableOpacity
              style={styles.qrModalCopyButton}
              onPress={() => {
                copyToClipboard(generateShortId(user?.id || ''), 'Recipient ID')
                setShowQRModal(false)
              }}
            >
              <Ionicons name="copy-outline" size={16} color="#fff" />
              <Text style={styles.qrModalCopyText}>Copy Recipient ID</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // ── QR Code ──────────────────────────────────────────────
  qrCodeContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    marginTop: 10,
    alignItems: 'center',
  },
  qrCodeWrapper: {
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  qrLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qrLabelText: {
    fontSize: 11,
    color: '#aaa',
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },

  // ── QR Modal ─────────────────────────────────────────────
  qrModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  qrModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  qrModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '85%',
    maxWidth: 320,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  qrModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  qrModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.2,
  },
  qrModalCloseButton: {
    padding: 4,
  },
  qrModalBody: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  qrModalQRWrapper: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  qrModalSubtext: {
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  qrModalCopyButton: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrModalCopyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
  },
})