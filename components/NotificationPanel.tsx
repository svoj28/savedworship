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
import { updateContact, getContactsByUserId, getContactByUserIdAndContactUserId, deleteContact, addContact } from '../db/queries'
import { notifyContactAccepted, notifyContactRejected } from '../lib/notifications'


const MUTE_OPTIONS: { label: string; value: MuteOption }[] = [
  { label: 'Turn on notifications', value: 'unmuted' },
  { label: 'Mute for 1 hour', value: '1h' },
  { label: 'Mute for 8 hours', value: '8h' },
  { label: 'Mute for 24 hours', value: '24h' },
  { label: 'Always mute', value: 'always' },
]

function notifIcon(type: AppNotification['type']): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'new_upload': return 'musical-notes'
    case 'contact_request': return 'person-add'
    case 'contact_accepted': return 'checkmark-circle'
    case 'contact_rejected': return 'close-circle'
    default: return 'notifications'
  }
}

function notifColor(type: AppNotification['type']): string {
  switch (type) {
    case 'new_upload': return '#007AFF'
    case 'contact_request': return '#FF9500'
    case 'contact_accepted': return '#34C759'
    case 'contact_rejected': return '#FF3B30'
    default: return '#8E8E93'
  }
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
  const { notifications, muteState, loading, markRead, markAllAsRead, clearAll, updateMute } = useNotifications()
  const [showMuteMenu, setShowMuteMenu] = useState(false)
  const muted = isMuted(muteState)


  const handleContactResponse = async (notif: AppNotification, action: 'accept' | 'reject') => {
  try {
    const requesterId = notif.data?.fromUserId  // the person who sent the request
    const currentUserId = notif.userId           // the person who received it (me)

    if (!requesterId || !currentUserId) return

    // Find the incoming record on MY side (userId = me, contactUserId = requester)
    const incomingContact = await getContactByUserIdAndContactUserId(currentUserId, requesterId)
    if (!incomingContact) {
      Alert.alert('Error', 'Contact request not found')
      return
    }

    // Find the outgoing record on THEIR side (userId = requester, contactUserId = me)
    const outgoingContact = await getContactByUserIdAndContactUserId(requesterId, currentUserId)

    if (action === 'accept') {
      // Update MY side
      await updateContact(incomingContact.id, { status: 'accepted', updatedAt: Date.now() })

      // Update THEIR side — this is what makes it show on the sender's friends list
      if (outgoingContact) {
        await updateContact(outgoingContact.id, { status: 'accepted', updatedAt: Date.now() })
      } else {
        // Outgoing record doesn't exist yet — create it so sender sees the friend
        await addContact({
          userId: requesterId,
          contactUserId: currentUserId,
          status: 'accepted',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          synced: false,
        })
      }

      await notifyContactAccepted(requesterId, 'Your contact request was accepted')

    } else {
      // Reject — delete both sides so it disappears everywhere
      await deleteContact(incomingContact.id)
      if (outgoingContact) {
        await deleteContact(outgoingContact.id)
      }
      await notifyContactRejected(requesterId, 'Your contact request was declined')
    }

    await markRead(notif.id)
  } catch (err) {
    console.error('Contact response error:', err)
    Alert.alert('Error', `Failed to ${action} contact request`)
  }
}


  const handleMuteOption = async (option: MuteOption) => {
    setShowMuteMenu(false)
    await updateMute(option)
  }

  const handleClearAll = () => {
    Alert.alert('Clear Notifications', 'Clear all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: clearAll },
    ])
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <View style={styles.panel}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <View style={styles.headerActions}>
              {/* Mute button */}
              <TouchableOpacity
                style={[styles.headerBtn, muted && styles.headerBtnMuted]}
                onPress={() => setShowMuteMenu(v => !v)}
              >
                <Ionicons
                  name={muted ? 'notifications-off' : 'notifications'}
                  size={20}
                  color={muted ? '#FF3B30' : '#007AFF'}
                />
              </TouchableOpacity>

              {/* Mark all read */}
              {notifications.some(n => !n.read) && (
                <TouchableOpacity style={styles.headerBtn} onPress={markAllAsRead}>
                  <Ionicons name="checkmark-done" size={20} color="#007AFF" />
                </TouchableOpacity>
              )}

              {/* Clear all */}
              {notifications.length > 0 && (
                <TouchableOpacity style={styles.headerBtn} onPress={handleClearAll}>
                  <Ionicons name="trash-outline" size={20} color="#8E8E93" />
                </TouchableOpacity>
              )}

              {/* Close */}
              <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mute status bar */}
          {muted && (
            <View style={styles.muteBar}>
              <Ionicons name="notifications-off" size={14} color="#FF3B30" />
              <Text style={styles.muteBarText}>{getMuteLabel(muteState)}</Text>
            </View>
          )}

          {/* Mute dropdown */}
          {showMuteMenu && (
            <View style={styles.muteMenu}>
              {MUTE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.muteOption,
                    muteState.option === opt.value && styles.muteOptionActive,
                  ]}
                  onPress={() => handleMuteOption(opt.value)}
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
                    <Ionicons name="checkmark" size={16} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Notification List */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#007AFF" />
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="notifications-outline" size={52} color="#ccc" />
              <Text style={styles.emptyText}>No notifications</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {notifications.map(notif => (
                <TouchableOpacity
  key={notif.id}
  style={[styles.notifCard, !notif.read && styles.notifCardUnread]}
  onPress={() => markRead(notif.id)}
  activeOpacity={0.7}
>
  <View style={[styles.notifIcon, { backgroundColor: notifColor(notif.type) + '20' }]}>
    <Ionicons name={notifIcon(notif.type)} size={20} color={notifColor(notif.type)} />
  </View>
  <View style={styles.notifBody}>
    <View style={styles.notifTopRow}>
      <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
      <Text style={styles.notifTime}>{timeAgo(notif.createdAt)}</Text>
    </View>
    <Text style={styles.notifMessage} numberOfLines={2}>{notif.body}</Text>

    {/* Accept / Reject buttons — only for unread contact requests */}
    {notif.type === 'contact_request' && !notif.read && notif.data?.fromUserId && (
      <View style={styles.responseButtons}>
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => handleContactResponse(notif, 'accept')}
        >
          <Ionicons name="checkmark" size={14} color="#fff" />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={() => handleContactResponse(notif, 'reject')}
        >
          <Ionicons name="close" size={14} color="#fff" />
          <Text style={styles.rejectBtnText}>Decline</Text>
        </TouchableOpacity>
      </View>
    )}
  </View>
  {!notif.read && <View style={styles.unreadDot} />}
</TouchableOpacity>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
    responseButtons: {
  flexDirection: 'row',
  gap: 8,
  marginTop: 8,
},
acceptBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  backgroundColor: '#34C759',
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 6,
},
acceptBtnText: {
  color: '#fff',
  fontSize: 12,
  fontWeight: '600',
},
rejectBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  backgroundColor: '#FF3B30',
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 6,
},
rejectBtnText: {
  color: '#fff',
  fontSize: 12,
  fontWeight: '600',
},
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerBtn: {
    padding: 8,
    borderRadius: 8,
  },
  headerBtnMuted: {
    backgroundColor: '#FFF0EE',
  },
  muteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF0EE',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  muteBarText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '500',
  },
  muteMenu: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fafafa',
  },
  muteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  muteOptionActive: {
    backgroundColor: '#EAF2FF',
  },
  muteOptionText: {
    fontSize: 15,
    color: '#333',
  },
  muteOptionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: '#aaa',
    fontSize: 15,
  },
  list: {
    flex: 1,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 12,
    position: 'relative',
  },
  notifCardUnread: {
    backgroundColor: '#F0F6FF',
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifBody: {
    flex: 1,
    gap: 3,
  },
  notifTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    flex: 1,
  },
  notifTime: {
    fontSize: 11,
    color: '#999',
    flexShrink: 0,
  },
  notifMessage: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginTop: 6,
    flexShrink: 0,
  },
})