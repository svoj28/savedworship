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
        style={[styles.button, muted && styles.buttonMuted]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.65}
      >
        <Ionicons
          name={muted ? 'notifications-off-outline' : 'notifications-outline'}
          size={20}
          color={muted ? '#aaa' : '#1a1a1a'}
        />

        {unreadCount > 0 && !muted && (
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
    marginRight: 14,
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    position: 'relative',
  },
  buttonMuted: {
    backgroundColor: '#fafafa',
    borderColor: '#efefef',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#1a1a1a',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})