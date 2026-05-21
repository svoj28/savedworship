import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = 'new_upload' | 'contact_request' | 'contact_accepted' | 'contact_rejected' | 'management_broadcast'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, any>
  createdAt: number
  read: boolean
  userId: string
}

export type MuteOption = 'unmuted' | '1h' | '8h' | '24h' | 'always'

export interface MuteState {
  option: MuteOption
  until: number | null // timestamp, null = always or unmuted
}

function normalizeNotificationData(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : { value }
    } catch {
      return { value }
    }
  }
  return typeof value === 'object' ? (value as Record<string, any>) : { value }
}

export function notificationFromRow(row: any): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: normalizeNotificationData(row.data),
    createdAt: row.created_at,
    read: row.read,
    userId: row.user_id,
  }
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const NOTIFICATIONS_KEY = (userId: string) => `notifications:${userId}`
const MUTE_KEY = (userId: string) => `notifications:mute:${userId}`
const LAST_CHECKED_KEY = (userId: string) => `notifications:lastChecked:${userId}`

// ─── Notification Handler Setup ───────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

// ─── Permission & Token ───────────────────────────────────────────────────────

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#007AFF',
    })
  }

  return 'local' // Using local notifications only
}

// ─── Mute Logic ───────────────────────────────────────────────────────────────

export async function getMuteState(userId: string): Promise<MuteState> {
  try {
    const raw = await AsyncStorage.getItem(MUTE_KEY(userId))
    if (!raw) return { option: 'unmuted', until: null }
    const state: MuteState = JSON.parse(raw)

    // If timed mute has expired, auto-unmute
    if (state.option !== 'unmuted' && state.option !== 'always' && state.until) {
      if (Date.now() >= state.until) {
        const unmuted: MuteState = { option: 'unmuted', until: null }
        await AsyncStorage.setItem(MUTE_KEY(userId), JSON.stringify(unmuted))
        return unmuted
      }
    }
    return state
  } catch {
    return { option: 'unmuted', until: null }
  }
}

export async function setMuteState(userId: string, option: MuteOption): Promise<MuteState> {
  const durationMap: Record<MuteOption, number | null> = {
    unmuted: null,
    '1h': 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    always: null,
  }

  const duration = durationMap[option]
  const state: MuteState = {
    option,
    until: duration ? Date.now() + duration : null,
  }
  await AsyncStorage.setItem(MUTE_KEY(userId), JSON.stringify(state))
  return state
}

export function isMuted(muteState: MuteState): boolean {
  if (muteState.option === 'unmuted') return false
  if (muteState.option === 'always') return true
  if (muteState.until && Date.now() < muteState.until) return true
  return false
}

export function getMuteLabel(muteState: MuteState): string {
  if (muteState.option === 'unmuted') return 'Notifications on'
  if (muteState.option === 'always') return 'Muted always'
  if (muteState.until) {
    const remaining = muteState.until - Date.now()
    const hours = Math.ceil(remaining / (1000 * 60 * 60))
    const mins = Math.ceil(remaining / (1000 * 60))
    if (hours >= 1) return `Muted for ~${hours}h`
    return `Muted for ~${mins}m`
  }
  return 'Muted'
}

// ─── In-App Notification Store ────────────────────────────────────────────────

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY(userId))
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function saveNotification(notification: AppNotification): Promise<void> {
  const existing = await getNotifications(notification.userId)
  // Keep last 50 notifications
  const updated = [notification, ...existing].slice(0, 50)
  await AsyncStorage.setItem(NOTIFICATIONS_KEY(notification.userId), JSON.stringify(updated))
}

export async function markAllRead(userId: string): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
  } catch (err) {
    console.warn('Failed to mark notifications as read in Supabase:', err)
  }

  const notifications = await getNotifications(userId)
  const updated = notifications.map(n => ({ ...n, read: true }))
  await AsyncStorage.setItem(NOTIFICATIONS_KEY(userId), JSON.stringify(updated))
}

export async function markOneRead(userId: string, notifId: string): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notifId)
      .eq('user_id', userId)
  } catch (err) {
    console.warn('Failed to mark notification as read in Supabase:', err)
  }

  const notifications = await getNotifications(userId)
  const updated = notifications.map(n => n.id === notifId ? { ...n, read: true } : n)
  await AsyncStorage.setItem(NOTIFICATIONS_KEY(userId), JSON.stringify(updated))
}

export async function clearAllNotifications(userId: string): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
  } catch (err) {
    console.warn('Failed to clear notifications in Supabase:', err)
  }

  await AsyncStorage.removeItem(NOTIFICATIONS_KEY(userId))
}

export async function getUnreadCount(userId: string): Promise<number> {
  const notifications = await getNotifications(userId)
  return notifications.filter(n => !n.read).length
}

// ─── Last Checked Timestamp ───────────────────────────────────────────────────

export async function getLastChecked(userId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CHECKED_KEY(userId))
    return raw ? parseInt(raw) : 0
  } catch {
    return 0
  }
}

export async function setLastChecked(userId: string): Promise<void> {
  await AsyncStorage.setItem(LAST_CHECKED_KEY(userId), Date.now().toString())
}

// ─── Send Local Push Notification ─────────────────────────────────────────────

export async function sendLocalNotification(
  userId: string,
  title: string,
  body: string,
  type: NotificationType,
  data?: Record<string, any>
): Promise<void> {
  const notification: AppNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    title,
    body,
    data,
    createdAt: Date.now(),
    read: false,
    userId,
  }

  const muteState = await getMuteState(userId)

  let shouldSchedule = false
  try {
    const { getCurrentUser } = await import('./auth')
    const currentUser = await getCurrentUser()
    shouldSchedule = Boolean(currentUser && currentUser.id === userId)
  } catch {
    shouldSchedule = false
  }

  if (shouldSchedule) {
    await saveNotification(notification)
  }

  if (shouldSchedule && !isMuted(muteState)) {
    void Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type, userId, ...data },
        sound: true,
      },
      trigger: null,
    })
  }

  void (async () => {
    try {
      const { supabase } = await import('./supabase')
      await supabase.from('notifications').insert({
        id: notification.id,
        user_id: userId,
        type,
        title,
        body,
        data: normalizeNotificationData(data),
        created_at: notification.createdAt,
        read: false,
      })
    } catch (err) {
      console.warn('Failed to save notification to Supabase:', err)
    }
  })()
}
export async function loadNotificationsFromSupabase(userId: string): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    const lastChecked = await getLastChecked(userId)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !data) return

    const notifications: AppNotification[] = data.map(notificationFromRow)

    // Save to local AsyncStorage
    await AsyncStorage.setItem(NOTIFICATIONS_KEY(userId), JSON.stringify(notifications))

    // Fire OS notification for any unread ones received while offline
    const muteState = await getMuteState(userId)
    if (!isMuted(muteState)) {
      for (const n of notifications.filter(n => !n.read && n.createdAt > lastChecked)) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: n.title,
            body: n.body,
            data: { type: n.type, userId, ...n.data },
            sound: true,
          },
          trigger: null,
        })
      }
    }

    await setLastChecked(userId)
  } catch (err) {
    console.warn('Failed to load notifications from Supabase:', err)
  }
}

async function getAllUserIds(): Promise<string[]> {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('user_profiles').select('user_id')
    const userIds = (data || [])
      .map((row: any) => row.user_id)
      .filter(Boolean)

    if (userIds.length > 0) {
      return Array.from(new Set(userIds))
    }
  } catch (err) {
    console.warn('Failed to load user ids from Supabase:', err)
  }

  try {
    const { query } = await import('../db/index')
    const rows = await query('SELECT user_id FROM user_profiles')
    return Array.from(new Set(rows.map((row: any) => row.user_id).filter(Boolean)))
  } catch (err) {
    console.warn('Failed to load user ids locally:', err)
    return []
  }
}

export async function notifyManagementChangeToAllUsers(
  actorUserId: string,
  action: 'created' | 'updated' | 'deleted',
  sectionLabel: string,
  itemTitle?: string
) {
  const userIds = await getAllUserIds()
  if (userIds.length === 0) return

  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1)
  const title = `${sectionLabel} ${actionLabel}`
  const body = itemTitle
    ? `"${itemTitle}" was ${action} in ${sectionLabel.toLowerCase()}.`
    : `A ${sectionLabel.toLowerCase()} item was ${action}.`

  await Promise.all(
    userIds.map((userId) =>
      sendLocalNotification(userId, title, body, 'management_broadcast', {
        actorUserId,
        action,
        sectionLabel,
        itemTitle: itemTitle ?? '',
      })
    )
  )
}

// ─── Helpers to create typed notifications ────────────────────────────────────

export async function notifyNewUpload(userId: string, songTitle: string) {
  await sendLocalNotification(
    userId,
    'New Song Added',
    `"${songTitle}" was added to the chord list.`,
    'new_upload',
    { songTitle }
  )
}

export async function notifyContactRequest(userId: string, fromName: string, fromUserId?: string) {
  await sendLocalNotification(
    userId,
    'New Contact Request',
    `${fromName} wants to add you as a contact.`,
    'contact_request',
    { fromName, fromUserId }
  )
}

export async function notifyContactAccepted(userId: string, contactName: string) {
  await sendLocalNotification(
    userId,
    'Contact Request Accepted',
    `${contactName} accepted your contact request.`,
    'contact_accepted',
    { contactName }
  )
}

export async function notifyContactRejected(userId: string, contactName: string) {
  await sendLocalNotification(
    userId,
    'Contact Request Declined',
    `${contactName} declined your contact request.`,
    'contact_rejected',
    { contactName }
  )
}