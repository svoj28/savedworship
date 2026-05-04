import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getUserProfileByUserId } from '../db/queries'
import { UserProfile } from '../db/models'

const { width, height } = Dimensions.get('window')

const ROLE_ICONS: Record<string, string> = {
  Vocals: 'mic',
  Drums: 'musical-notes',
  Keyboard: 'musical-note',
  Bass: 'musical-notes',
  'Electric Guitar': 'musical-note',
  'Acoustic Guitar': 'musical-note',
  'Song Leader': 'star',
}

interface UserProfileModalProps {
  visible: boolean
  targetUserId: string | null
  onClose: () => void
  onMessage?: (userId: string) => void
  isActiveUser?: boolean
}

export default function UserProfileModal({
  visible,
  targetUserId,
  onClose,
  onMessage,
  isActiveUser = false,
}: UserProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const slideAnim = React.useRef(new Animated.Value(height)).current
const fadeAnim = React.useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible && targetUserId) {
      loadProfile(targetUserId)
Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 12,
      }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 260,
        useNativeDriver: true,
      }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible, targetUserId])

  const loadProfile = async (uid: string) => {
    setLoading(true)
    try {
      const local = await getUserProfileByUserId(uid)
      if (local) {
        setProfile(local)
                setIsPrivate(local.bio?.startsWith('[private]') ?? false)
      } else {
                try {
          const { supabase } = await import('../lib/supabase')
          const { data } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', uid)
            .single()
          if (data) {
            setProfile({
              id: data.id,
              userId: data.user_id,
              nickname: data.nickname ?? '',
              bio: data.bio ?? '',
              avatarUrl: data.avatar_url ?? '',
              instruments: data.instruments ?? '',
              createdAt: data.created_at ?? Date.now(),
              updatedAt: data.updated_at ?? Date.now(),
              synced: true,
              role: data.role ?? 'user',
            })
            setIsPrivate(data.bio?.startsWith('[private]') ?? false)
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error loading profile for modal:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
Animated.parallel([
    Animated.timing(slideAnim, {
      toValue: height,
      duration: 240,
      useNativeDriver: true,
    }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onClose())
  }

  const roles = profile?.instruments
    ? profile.instruments.split(',').map(r => r.trim()).filter(Boolean)
    : []

    const displayBio = profile?.bio?.replace('[private]', '').trim() || ''

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
<Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
</Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Pull indicator */}
<View style={styles.pullBarWrapper}>
        <View style={styles.pullBar} />
</View>

        <ScrollView
showsVerticalScrollIndicator={false}
bounces={false}
          contentContainerStyle={styles.scrollContent}
>
          {/* ── Hero Banner ── */}
          <View style={styles.heroBanner}>
{/* Cross / decorative pattern */}
            <View style={styles.heroPattern}>
              {/* Subtle vertical line */}
              <View style={styles.patternLineV} />
              {/* Subtle horizontal line */}
              <View style={styles.patternLineH} />
              {/* Corner accents */}
              <View style={[styles.cornerAccent, styles.cornerTL]} />
              <View style={[styles.cornerAccent, styles.cornerBR]} />
            </View>

            {/* Wordmark */}
            <View style={styles.brandmarkRow}>
              <View style={styles.brandmarkDivider} />
              <Text style={styles.brandmarkText}>WORSHIP TEAM</Text>
              <View style={styles.brandmarkDivider} />
            </View>

            {/* Close button */}
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          {/* ── Avatar overlap ── */}
          <View style={styles.avatarOverlapContainer}>
            <View style={styles.avatarRingOuter}>
              <View style={styles.avatarRingInner}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={42} color="#999" />
                </View>
              )}
</View>
            </View>

            {isActiveUser && (
              <View style={styles.activePill}>
                <View style={styles.activePillDot} />
                <Text style={styles.activePillText}>Active</Text>
              </View>
            )}
          </View>

          {/* ── Name ── */}
          <View style={styles.nameRow}>
            <Text style={styles.nickname}>{profile?.nickname || 'Unknown'}</Text>
            {isPrivate && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={10} color="#777" />
                <Text style={styles.privateBadgeText}>Private</Text>
              </View>
            )}
          </View>

          {/* Thin rule below name */}
          <View style={styles.nameDivider}>
            <View style={styles.nameDividerLine} />
            <View style={styles.nameDividerDiamond} />
            <View style={styles.nameDividerLine} />
          </View>

          {isPrivate ? (
            /* ── PRIVATE ── */
            <View style={styles.privateBlock}>
<View style={styles.privateLockCircle}>
              <Ionicons name="lock-closed-outline" size={28} color="#555" />
</View>
              <Text style={styles.privateTitle}>Profile is Private</Text>
              <Text style={styles.privateSubtitle}>
                Only the member's name and photo are visible to others.
              </Text>
            </View>
          ) : (
            /* ── PUBLIC ── */
            <>
                            {displayBio ? (
                <View style={styles.bioBlock}>
<Text style={styles.bioLabel}>About</Text>
                  <Text style={styles.bioText}>{displayBio}</Text>
                </View>
              ) : null}

                            {roles.length > 0 && (
                <View style={styles.section}>
<View style={styles.sectionHeader}>
                    <View style={styles.sectionAccentBar} />
                  <Text style={styles.sectionLabel}>Ministry Roles</Text>
</View>
                  <View style={styles.rolesWrap}>
                    {roles.map(role => (
                      <View key={role} style={styles.roleChip}>
                        <Ionicons
                          name={(ROLE_ICONS[role] as any) || 'musical-note'}
                          size={12}
                          color="#1A1A1A"
                        />
                        <Text style={styles.roleChipText}>{role}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {/* ── Message button ── */}
          {onMessage && (
<View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.messageBtn}
              onPress={() => {
                handleClose()
                onMessage(targetUserId!)
              }}
activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-outline" size={16} color="#FAFAFA" />
              <Text style={styles.messageBtnText}>Send Message</Text>
            </TouchableOpacity>
</View>
          )}

          <View style={{ height: 36 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.88,
    overflow: 'hidden',
// Subtle top shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 16,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  pullBarWrapper: {
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: 'center',
  },
  pullBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
      },

  // ── Hero Banner ──
  heroBanner: {
    height: 116,
    backgroundColor: '#F0F0F0',
    borderBottomWidth: 1,
    borderBottomColor: '#DCDCDC',
    overflow: 'hidden',
justifyContent: 'flex-end',
    paddingBottom: 14,
    position: 'relative',
  },
  heroPattern: {
    ...StyleSheet.absoluteFillObject,
  },
  patternLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  patternLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  cornerAccent: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  cornerTL: {
    top: 12,
    left: 14,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  cornerBR: {
    bottom: 12,
    right: 14,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
  },
  brandmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  brandmarkDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#BDBDBD',
  },
  brandmarkText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Avatar ──
  avatarOverlapContainer: {
    alignItems: 'center',
    marginTop: -48,
    marginBottom: 10,
  },
  avatarRingOuter: {
    padding: 4,
    borderRadius: 64,
    backgroundColor: '#FAFAFA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarRingInner: {
    padding: 3,
    borderRadius: 58,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarFallback: {
    backgroundColor: '#EBEBEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 4,
    marginTop: 10,
    gap: 5,
  },
  activePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
letterSpacing: 0.5,
  },

  // ── Name ──
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
        paddingHorizontal: 24,
marginBottom: 10,
  },
  nickname: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D0D0D',
letterSpacing: -0.3,
    textAlign: 'center',
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDEDED',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
borderWidth: 1,
    borderColor: '#D8D8D8',
  },
  privateBadgeText: {
    fontSize: 10,
    color: '#777',
    fontWeight: '600',
  letterSpacing: 0.5,
  },

  // Ornamental divider
  nameDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 40,
    marginBottom: 16,
    gap: 8,
  },
  nameDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  nameDividerDiamond: {
    width: 6,
    height: 6,
    backgroundColor: '#BBBBBB',
    transform: [{ rotate: '45deg' }],
  },

  // ── Bio ──
  bioBlock: {
    marginHorizontal: 24,
        marginBottom: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  bioLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#AAAAAA',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 7,
    textAlign: 'center',
  },
  bioText: {
    fontSize: 14,
    color: '#3A3A3A',
    lineHeight: 22,
    textAlign: 'center',
fontStyle: 'italic',
  },

  // ── Roles ──
  section: {
    marginHorizontal: 24,
    marginTop: 16,
  },
sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionAccentBar: {
    width: 3,
    height: 14,
    backgroundColor: '#1A1A1A',
    borderRadius: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
      },
  rolesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#D8D8D8',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
letterSpacing: 0.2,
  },

  // ── Private State ──
  privateBlock: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 32,
    gap: 12,
  },
  privateLockCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#DCDCDC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  privateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
letterSpacing: 0.2,
  },
  privateSubtitle: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Action ──
  actionContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
        paddingVertical: 15,
    borderRadius: 10,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  messageBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FAFAFA',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})