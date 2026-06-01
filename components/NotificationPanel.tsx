import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useNotifications } from '../lib/NotificationContext'
import { AppNotification, MuteOption, getMuteLabel, isMuted } from '../lib/notifications'
import { addContact, getContactByUserIdAndContactUserId, updateContact } from '../db/queries'
import { notifyContactAccepted, notifyContactRejected } from '../lib/notifications'
import { navigateFromNotification } from '../lib/notificationNavigation'

const MUTE_OPTIONS: { label: string; value: MuteOption }[] = [
  { label: 'Turn on notifications', value: 'unmuted' },
  { label: 'Mute for 1 hour', value: '1h' },
  { label: 'Mute for 8 hours', value: '8h' },
  { label: 'Mute for 24 hours', value: '24h' },
  { label: 'Always mute', value: 'always' },
]

function notifIcon(type: AppNotification['type']): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'new_upload': return 'musical-notes-outline'
    case 'contact_request': return 'person-add-outline'
    case 'contact_accepted': return 'checkmark-circle-outline'
    case 'contact_rejected': return 'close-circle-outline'
    case 'management_broadcast': return 'megaphone-outline'
    default: return 'notifications-outline'
  }
}

// All icons use monochrome tones
function notifIconColor(type: AppNotification['type']): string {
  switch (type) {
    case 'new_upload': return '#1a1a1a'
    case 'contact_request': return '#444'
    case 'contact_accepted': return '#1a1a1a'
    case 'contact_rejected': return '#888'
    case 'management_broadcast': return '#111'
    default: return '#aaa'
  }
}

function notifIconBg(type: AppNotification['type']): string {
  switch (type) {
    case 'new_upload': return '#f0f0f0'
    case 'contact_request': return '#e8e8e8'
    case 'contact_accepted': return '#1a1a1a'
    case 'contact_rejected': return '#f5f5f5'
    case 'management_broadcast': return '#f2f2f2'
    default: return '#f5f5f5'
  }
}

function notifIconTint(type: AppNotification['type']): string {
  // accepted gets white icon on dark bg
  return type === 'contact_accepted' ? '#fff' : notifIconColor(type)
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

interface Props {
  visible: boolean
  onClose: () => void
}

export default function NotificationPanel({ visible, onClose }: Props) {
  const { notifications, muteState, loading, refresh, markRead, markAllAsRead, clearAll, updateMute } = useNotifications()
  const [showMuteMenu, setShowMuteMenu] = useState(false)
  const muted = isMuted(muteState)

  const handleContactResponse = async (notif: AppNotification, action: 'accept' | 'reject') => {
    try {
      const requesterId = notif.data?.fromUserId
      const currentUserId = notif.userId

      if (!requesterId || !currentUserId) return

      const ownContact = await getContactByUserIdAndContactUserId(currentUserId, requesterId)
      if (ownContact) {
        await updateContact(ownContact.id, {
          status: action === 'accept' ? 'accepted' : 'blocked',
          updatedAt: Date.now(),
        })
      } else {
        await addContact({
          userId: currentUserId,
          contactUserId: requesterId,
          status: action === 'accept' ? 'accepted' : 'blocked',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          synced: false,
        })
      }

      if (action === 'accept') {
        await notifyContactAccepted(requesterId, 'Your contact request was accepted')
      } else {
        await notifyContactRejected(requesterId, 'Your contact request was declined')
      }

      await markRead(notif.id)
      await refresh()
    } catch (err) {
      console.error('Contact response error:', err)
      Alert.alert('Error', `Failed to ${action} contact request`)
    }
  }

  const handleMuteOption = async (option: MuteOption) => {
    setShowMuteMenu(false)
    await updateMute(option)
  }

  const handleNotificationPress = async (notif: AppNotification) => {
    navigateFromNotification(notif)
    await markRead(notif.id)
  }

  const handleClearAll = () => {
    Alert.alert('Clear Notifications', 'Remove all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: clearAll },
    ])
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <View style={styles.panel}>
          {/* Drag handle */}
          {/* <View style={styles.handle} /> */}

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={styles.unreadCountBadge}>
                  <Text style={styles.unreadCountText}>{unreadCount}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.headerBtn, loading && styles.headerBtnDisabled]}
                onPress={refresh}
                activeOpacity={0.65}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#1a1a1a" />
                ) : (
                  <Ionicons name="refresh-outline" size={18} color="#1a1a1a" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.headerBtn, showMuteMenu && styles.headerBtnActive, muted && styles.headerBtnMuted]}
                onPress={() => setShowMuteMenu(v => !v)}
                activeOpacity={0.65}
              >
                <Ionicons
                  name={muted ? 'notifications-off-outline' : 'notifications-outline'}
                  size={18}
                  color={muted ? '#888' : '#1a1a1a'}
                />
              </TouchableOpacity>

              {unreadCount > 0 && (
                <TouchableOpacity style={styles.headerBtn} onPress={markAllAsRead} activeOpacity={0.65}>
                  <Ionicons name="checkmark-done-outline" size={18} color="#1a1a1a" />
                </TouchableOpacity>
              )}

              {notifications.length > 0 && (
                <TouchableOpacity style={styles.headerBtn} onPress={handleClearAll} activeOpacity={0.65}>
                  <Ionicons name="trash-outline" size={18} color="#888" />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.headerBtn, styles.closeBtn]} onPress={onClose} activeOpacity={0.65}>
                <Ionicons name="close" size={18} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mute status bar */}
          {muted && (
            <View style={styles.muteBar}>
              <Ionicons name="notifications-off-outline" size={13} color="#888" />
              <Text style={styles.muteBarText}>{getMuteLabel(muteState)}</Text>
            </View>
          )}

          {/* Mute dropdown */}
          {showMuteMenu && (
            <View style={styles.muteMenu}>
              {MUTE_OPTIONS.map((opt, index) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.muteOption,
                    muteState.option === opt.value && styles.muteOptionActive,
                    index === MUTE_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => handleMuteOption(opt.value)}
                  activeOpacity={0.6}
                >
                  <Text
                    style={[
                      styles.muteOptionText,
                      muteState.option === opt.value && styles.muteOptionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {muteState.option === opt.value && (
                    <View style={styles.muteCheckDot} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Content */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#1a1a1a" size="small" />
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.centered}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-outline" size={32} color="#ccc" />
              </View>
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptySubtext}>No notifications at this time</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {notifications.map((notif, index) => (
                <TouchableOpacity
                  key={notif.id}
                  style={[
                    styles.notifCard,
                    !notif.read && styles.notifCardUnread,
                    index === 0 && { borderTopWidth: 0 },
                  ]}
                  onPress={() => handleNotificationPress(notif)}
                  activeOpacity={0.65}
                >
                  {/* Icon */}
                  <View style={[styles.notifIconWrap, { backgroundColor: notifIconBg(notif.type) }]}>
                    <Ionicons
                      name={notifIcon(notif.type)}
                      size={18}
                      color={notifIconTint(notif.type)}
                    />
                  </View>

                  {/* Body */}
                  <View style={styles.notifBody}>
                    <View style={styles.notifTopRow}>
                      <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                      <Text style={styles.notifTime}>{timeAgo(notif.createdAt)}</Text>
                    </View>
                    <Text style={styles.notifMessage} numberOfLines={2}>{notif.body}</Text>

                    {/* Contact request actions */}
                    {notif.type === 'contact_request' && !notif.read && notif.data?.fromUserId && (
                      <View style={styles.responseButtons}>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => handleContactResponse(notif, 'accept')}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="checkmark" size={13} color="#fff" />
                          <Text style={styles.acceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.declineBtn}
                          onPress={() => handleContactResponse(notif, 'reject')}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="close" size={13} color="#555" />
                          <Text style={styles.declineBtnText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Unread indicator */}
                  {!notif.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              ))}
              <View style={{ height: 32 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '82%',
    minHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },

  // ── Handle ───────────────────────────────────────────────
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  // ── Header ───────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0a0a0a',
    letterSpacing: 0.1,

  },
    headerBtnDisabled: {
    opacity: 0.65,
  },
  unreadCountBadge: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#efefef',
  },
  headerBtnActive: {
    backgroundColor: '#e8e8e8',
    borderColor: '#ddd',
  },
  headerBtnMuted: {
    backgroundColor: '#f0f0f0',
  },
  closeBtn: {
    marginLeft: 2,
  },

  // ── Mute bar ─────────────────────────────────────────────
  muteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f7f7f7',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  muteBarText: {
    color: '#777',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // ── Mute menu ────────────────────────────────────────────
  muteMenu: {
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
  },
  muteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  muteOptionActive: {
    backgroundColor: '#f0f0f0',
  },
  muteOptionText: {
    fontSize: 14,
    color: '#444',
  },
  muteOptionTextActive: {
    color: '#0a0a0a',
    fontWeight: '600',
  },
  muteCheckDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
  },

  // ── Empty / Loading ──────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 10,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#bbb',
  },

  // ── Notification card ────────────────────────────────────
  list: {
    flex: 1,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    gap: 12,
    position: 'relative',
  },
  notifCardUnread: {
    backgroundColor: '#fafafa',
  },
  notifIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifBody: {
    flex: 1,
  },
  notifTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0a0a0a',
    flex: 1,
    letterSpacing: 0.1,
  },
  notifTime: {
    fontSize: 10,
    color: '#bbb',
    flexShrink: 0,
    letterSpacing: 0.2,
  },
  notifMessage: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
  },

  // ── Contact request buttons ──────────────────────────────
  responseButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  declineBtnText: {
    color: '#555',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // ── Unread dot ───────────────────────────────────────────
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
    marginTop: 5,
    flexShrink: 0,
  },
})