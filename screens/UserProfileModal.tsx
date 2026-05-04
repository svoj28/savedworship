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

  useEffect(() => {
    if (visible && targetUserId) {
      loadProfile(targetUserId)
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start()
    } else {
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, targetUserId])

  const loadProfile = async (uid: string) => {
    setLoading(true)
    try {
      const local = await getUserProfileByUserId(uid)
      if (local) {
        setProfile(local)
        // Check privacy flag — stored in bio field as a JSON prefix or separate column
        // We'll use a convention: if bio starts with "[private]" the user wants privacy
        setIsPrivate(local.bio?.startsWith('[private]') ?? false)
      } else {
        // Try Supabase fallback
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
    Animated.timing(slideAnim, {
      toValue: height,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onClose())
  }

  const roles = profile?.instruments
    ? profile.instruments.split(',').map(r => r.trim()).filter(Boolean)
    : []

  // Strip the [private] marker from display bio
  const displayBio = profile?.bio?.replace('[private]', '').trim() || ''

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Pull bar */}
        <View style={styles.pullBar} />

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Hero banner */}
          <View style={styles.heroBanner}>
            <View style={styles.bannerPattern}>
              {Array.from({ length: 20 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.bannerDot,
                    {
                      left: (i % 5) * 72 + 16,
                      top: Math.floor(i / 5) * 28 + 12,
                      opacity: 0.08 + (i % 3) * 0.06,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Close button */}
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Avatar — overlaps hero */}
          <View style={styles.avatarOverlapContainer}>
            <View style={styles.avatarRing}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={44} color="#AAA" />
                </View>
              )}
            </View>
            {isActiveUser && (
              <View style={styles.activePill}>
                <View style={styles.activePillDot} />
                <Text style={styles.activePillText}>Active now</Text>
              </View>
            )}
          </View>

          {/* Name + privacy badge */}
          <View style={styles.nameRow}>
            <Text style={styles.nickname}>{profile?.nickname || 'Unknown'}</Text>
            {isPrivate && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={11} color="#888" />
                <Text style={styles.privateBadgeText}>Private</Text>
              </View>
            )}
          </View>

          {isPrivate ? (
            /* ── PRIVATE MODE ── */
            <View style={styles.privateBlock}>
              <Ionicons name="lock-closed-outline" size={36} color="#CCC" />
              <Text style={styles.privateTitle}>This profile is private</Text>
              <Text style={styles.privateSubtitle}>
                Only the user's name and photo are visible.
              </Text>
            </View>
          ) : (
            /* ── PUBLIC MODE ── */
            <>
              {/* Bio */}
              {displayBio ? (
                <View style={styles.bioBlock}>
                  <Text style={styles.bioText}>{displayBio}</Text>
                </View>
              ) : null}

              {/* Roles */}
              {roles.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Roles</Text>
                  <View style={styles.rolesWrap}>
                    {roles.map(role => (
                      <View key={role} style={styles.roleChip}>
                        <Ionicons
                          name={(ROLE_ICONS[role] as any) || 'musical-note'}
                          size={13}
                          color="#007AFF"
                        />
                        <Text style={styles.roleChipText}>{role}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {/* Message button */}
          {onMessage && (
            <TouchableOpacity
              style={styles.messageBtn}
              onPress={() => {
                handleClose()
                onMessage(targetUserId!)
              }}
            >
              <Ionicons name="chatbubble" size={18} color="#FFF" />
              <Text style={styles.messageBtnText}>Send Message</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.88,
    overflow: 'hidden',
  },
  pullBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 0,
  },
  heroBanner: {
    height: 110,
    backgroundColor: '#007AFF',
    overflow: 'hidden',
    position: 'relative',
  },
  bannerPattern: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerDot: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOverlapContainer: {
    alignItems: 'center',
    marginTop: -46,
    marginBottom: 8,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 60,
    backgroundColor: '#FAFAFA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarFallback: {
    backgroundColor: '#EEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
    gap: 5,
  },
  activePillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  activePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    paddingHorizontal: 24,
  },
  nickname: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  privateBadgeText: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
  },
  bioBlock: {
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  bioText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
    textAlign: 'center',
  },
  section: {
    marginHorizontal: 24,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  rolesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#C7E0FF',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  privateBlock: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 32,
    gap: 10,
  },
  privateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
  },
  privateSubtitle: {
    fontSize: 13,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 19,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    marginHorizontal: 24,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  messageBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
})