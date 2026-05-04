import React, { useState } from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useNotifications } from '../lib/NotificationContext'
import { isMuted } from '../lib/notifications'
import NotificationPanel from './NotificationPanel'

export default function NotificationBell() {
  const { unreadCount, muteState } = useNotifications()
  const [panelVisible, setPanelVisible] = useState(false)
  const muted = isMuted(muteState)

  return (
    <>
      <TouchableOpacity
        onPress={() => setPanelVisible(true)}
        style={styles.button}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={muted ? 'notifications-off-outline' : 'notifications-outline'}
          size={24}
          color={muted ? '#8E8E93' : '#007AFF'}
        />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <NotificationPanel
        visible={panelVisible}
        onClose={() => setPanelVisible(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    marginRight: 16,
    position: 'relative',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
})