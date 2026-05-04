import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  clearAllNotifications,
  getMuteState,
  setMuteState,
  registerForPushNotificationsAsync,
  AppNotification,
  MuteState,
  MuteOption,
} from './notifications'

interface NotificationContextValue {
  notifications: AppNotification[]
  unreadCount: number
  muteState: MuteState
  loading: boolean
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearAll: () => Promise<void>
  updateMute: (option: MuteOption) => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({
  children,
  userId,
}: {
  children: React.ReactNode
  userId: string | null
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [muteState, setMuteStateLocal] = useState<MuteState>({ option: 'unmuted', until: null })
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    setLoading(true)
    try {
      const [notifs, count, mute] = await Promise.all([
        getNotifications(userId),
        getUnreadCount(userId),
        getMuteState(userId),
      ])
      setNotifications(notifs)
      setUnreadCount(count)
      setMuteStateLocal(mute)
    } catch (err) {
      console.error('Failed to refresh notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  const markRead = useCallback(async (id: string) => {
    if (!userId) return
    await markOneRead(userId, id)
    await refresh()
  }, [userId, refresh])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    await markAllRead(userId)
    await refresh()
  }, [userId, refresh])

  const clearAll = useCallback(async () => {
    if (!userId) return
    await clearAllNotifications(userId)
    await refresh()
  }, [userId, refresh])

  const updateMute = useCallback(async (option: MuteOption) => {
    if (!userId) return
    const newState = await setMuteState(userId, option)
    setMuteStateLocal(newState)
  }, [userId])

  // Register for push notifications and poll every 30s
  useEffect(() => {
    if (!userId) return
    registerForPushNotificationsAsync()
    refresh()

    pollRef.current = setInterval(refresh, 30000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [userId, refresh])

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, muteState, loading, refresh, markRead, markAllAsRead, clearAll, updateMute }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}