import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Pressable,
  Image,
  FlatList,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import { createMessage, query as dbQuery, editMessage, deleteMessage, getUserProfileByUserId, getContactsByUserId } from '../db/queries'
import { Message, UserProfile } from '../db/models'
import { useFocusEffect } from '@react-navigation/native'
import UserProfileModal from './UserProfileModal'

export default function ConversationScreen() {
  const [userId, setUserId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [overallChatMessages, setOverallChatMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState('')
  const [receiverId, setReceiverId] = useState('')
  const [chatMode, setChatMode] = useState<'direct' | 'overall'>('overall')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [scrollViewRef, setScrollViewRef] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map())
  const [contactedUsers, setContactedUsers] = useState<any[]>([])
  const [showNewConversationModal, setShowNewConversationModal] = useState(false)
  const [newRecipientId, setNewRecipientId] = useState('')
  const [friendsList, setFriendsList] = useState<any[]>([])
  // Track which friend IDs are "active" (online) — wire to your presence system
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set())
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null)

  const OVERALL_CHAT_ID = 'overall-chat'

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
        const profile = await getUserProfileByUserId(user.id)
        setUserProfile(profile)
        await loadMessages(user.id)
        await loadOverallChat(user.id)
        await loadUsers()
        await loadContactedUsers(user.id)
        await loadFriendsListForModal(user.id)
      }
    }
    loadUser()
  }, [])

  const loadMessages = async (id: string) => {
    try {
      const sentMessages = await dbQuery(
        `SELECT * FROM messages WHERE sender_id = ? AND receiver_id != ? AND COALESCE(is_deleted, 0) = 0 ORDER BY created_at ASC`,
        [id, OVERALL_CHAT_ID]
      )
      const receivedMessages = await dbQuery(
        `SELECT * FROM messages WHERE receiver_id = ? AND receiver_id != ? AND COALESCE(is_deleted, 0) = 0 ORDER BY created_at ASC`,
        [id, OVERALL_CHAT_ID]
      )

      const mapMessage = (row: any): Message => ({
        id: row.id,
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        text: row.text,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isDeleted: Boolean(row.is_deleted),
        editedAt: row.edited_at,
        synced: Boolean(row._synced),
      })

      const allMessages = [
        ...sentMessages.map(mapMessage),
        ...receivedMessages.map(mapMessage),
      ].sort((a, b) => a.createdAt - b.createdAt)

      setMessages(allMessages)
      await loadUsers()
      setTimeout(() => scrollViewRef?.scrollToEnd({ animated: true }), 100)

      const senderIds = new Set(allMessages.map(m => m.senderId))
      const profilesMap = new Map<string, UserProfile>(userProfiles)
      for (const senderId of senderIds) {
        if (!profilesMap.has(senderId)) {
          const profile = await getProfileWithFallback(senderId)
          if (profile) profilesMap.set(senderId, profile)
        }
      }
      setUserProfiles(profilesMap)

      setTimeout(() => {
        scrollViewRef?.scrollToEnd({ animated: true })
      }, 100)
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const loadOverallChat = async (id: string) => {
    try {
      const results = await dbQuery(
        `SELECT * FROM messages WHERE receiver_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY created_at ASC`,
        [OVERALL_CHAT_ID]
      )

      const mapMessage = (row: any): Message => ({
        id: row.id,
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        text: row.text,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isDeleted: Boolean(row.is_deleted),
        editedAt: row.edited_at,
        synced: Boolean(row._synced),
      })

      const mapped = results.map(mapMessage)
      setOverallChatMessages(mapped)
      await loadUsers()
      setTimeout(() => scrollViewRef?.scrollToEnd({ animated: true }), 100)

      const senderIds = new Set(mapped.map(m => m.senderId))
      const profilesMap = new Map<string, UserProfile>(userProfiles)
      for (const senderId of senderIds) {
        if (!profilesMap.has(senderId)) {
          const profile = await getProfileWithFallback(senderId)
          if (profile) profilesMap.set(senderId, profile)
        }
      }
      setUserProfiles(profilesMap)

      setTimeout(() => {
        scrollViewRef?.scrollToEnd({ animated: true })
      }, 100)
    } catch (err) {
      console.error('Error loading overall chat:', err)
    }
  }

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      Alert.alert('Error', 'Please enter a message')
      return
    }

    if (chatMode === 'direct' && !receiverId.trim()) {
      Alert.alert('Error', 'Please select a recipient')
      return
    }

    try {
      await createMessage({
        senderId: userId,
        receiverId: chatMode === 'overall' ? OVERALL_CHAT_ID : receiverId,
        text: messageText,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
        synced: false,
      })

      setMessageText('')

      if (chatMode === 'overall') {
        await loadOverallChat(userId)
      } else {
        await loadMessages(userId)
        await loadContactedUsers(userId)
      }
    } catch (err) {
      console.error('Error sending message:', err)
      Alert.alert('Error', 'Failed to send message')
    }
  }

  const handleStartConversation = (targetUserId: string) => {
    setReceiverId(targetUserId)
    setShowNewConversationModal(false)
    setNewRecipientId('')
  }

  const handleEditMessage = async () => {
    if (!editingText.trim()) {
      Alert.alert('Error', 'Message cannot be empty')
      return
    }

    try {
      if (editingMessageId) {
        await editMessage(editingMessageId, editingText)
        setEditingMessageId(null)
        setEditingText('')
        setShowEditModal(false)

        if (chatMode === 'overall') {
          await loadOverallChat(userId)
        } else {
          await loadMessages(userId)
        }
      }
    } catch (err) {
      console.error('Error editing message:', err)
      Alert.alert('Error', 'Failed to edit message')
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert('Delete Message', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await deleteMessage(messageId)

            if (chatMode === 'overall') {
              await loadOverallChat(userId)
            } else {
              await loadMessages(userId)
            }
            setSelectedMessageId(null)
          } catch (err) {
            console.error('Error deleting message:', err)
            Alert.alert('Error', 'Failed to delete message')
          }
        },
        style: 'destructive',
      },
    ])
  }

  const handleDeleteConversation = (otherUserId: string, nickname: string) => {
    Alert.alert(
      'Delete Conversation',
      `Remove your conversation with ${nickname}?`,
      [
        { text: 'Cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft-delete all messages between the two users
              await dbQuery(
                `UPDATE messages SET is_deleted = 1 WHERE 
                (sender_id = ? AND receiver_id = ?) OR 
                (sender_id = ? AND receiver_id = ?)`,
                [userId, otherUserId, otherUserId, userId]
              )
              // If currently viewing this convo, go back to DM list
              if (receiverId === otherUserId) setReceiverId('')
              await loadMessages(userId)
              await loadContactedUsers(userId)
            } catch (err) {
              console.error('Error deleting conversation:', err)
              Alert.alert('Error', 'Failed to delete conversation')
            }
          },
        },
      ]
    )
  }

  const getProfileWithFallback = async (targetUserId: string): Promise<UserProfile | null> => {
    const local = await getUserProfileByUserId(targetUserId)
    if (local?.nickname) return local

    try {
      const { supabase } = await import('../lib/supabase')
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .single()

      if (data) {
        const { execute } = await import('../db/index')
        try {
          await execute(
            `INSERT OR REPLACE INTO user_profiles 
             (id, user_id, nickname, bio, avatar_url, instruments, role, created_at, updated_at, _synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              data.id ?? targetUserId,
              data.user_id,
              data.nickname ?? '',
              data.bio ?? '',
              data.avatar_url ?? '',
              data.instruments ?? '',
              data.role ?? 'user',
              data.created_at ?? Date.now(),
              data.updated_at ?? Date.now(),
            ]
          )
        } catch (e) {}

        return {
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
        }
      }
    } catch (e) {
      console.warn('Failed to fetch profile from Supabase:', e)
    }

    return null
  }

  const loadUsers = async () => {
    try {
      const allProfiles: any[] = await dbQuery(`SELECT * FROM user_profiles`)

      const profilesMap = new Map<string, UserProfile>()
      for (const row of allProfiles) {
        const profile: UserProfile = {
          id: row.id,
          userId: row.user_id,
          nickname: row.nickname || '',
          bio: row.bio || '',
          avatarUrl: row.avatar_url || '',
          instruments: row.instruments || '',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          synced: Boolean(row._synced),
          role: row.role ?? 'user',
        }
        profilesMap.set(row.user_id, profile)
      }
      setUserProfiles(profilesMap)
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const loadContactedUsers = async (id: string) => {
    try {
      const results = await dbQuery(
        `SELECT sender_id, receiver_id, text, created_at FROM messages 
        WHERE receiver_id != ? AND COALESCE(is_deleted, 0) = 0
        ORDER BY created_at DESC`,
        [OVERALL_CHAT_ID]
      )

      const userMap = new Map<string, { lastContacted: number; lastMessage: string }>()
      results.forEach((msg: any) => {
        const otherUserId = msg.sender_id === id ? msg.receiver_id : msg.sender_id
        if (!userMap.has(otherUserId)) {
          userMap.set(otherUserId, {
            lastContacted: msg.created_at,
            lastMessage: msg.text,
          })
        }
      })

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

      const contactList = []
      for (const [uid, data] of userMap.entries()) {
        if (data.lastContacted > thirtyDaysAgo) {
          const profile = await getUserProfileByUserId(uid)
          contactList.push({
            id: uid,
            nickname: profile?.nickname || 'User',
            avatar: profile?.avatarUrl,
            lastContacted: data.lastContacted,
            lastMessage: data.lastMessage,
          })
        }
      }

      contactList.sort((a, b) => b.lastContacted - a.lastContacted)
      setContactedUsers(contactList)
    } catch (err) {
      console.error('Error loading contacted users:', err)
    }
  }

  const loadFriendsListForModal = async (id: string) => {
    try {
      const contacts = await getContactsByUserId(id)
      const list = await Promise.all(
        contacts.map(async (contact: any) => {
          const profile = await getUserProfileByUserId(contact.contactUserId)
          return {
            id: contact.contactUserId,
            nickname: profile?.nickname || 'User',
            avatar: profile?.avatarUrl,
          }
        })
      )
      setFriendsList(list)
    } catch (err) {
      console.error('Error loading friends list:', err)
    }
  }

  useFocusEffect(
    React.useCallback(() => {
      if (userId) {
        loadOverallChat(userId)
        loadMessages(userId)
        loadUsers()
        loadContactedUsers(userId)
        loadFriendsListForModal(userId)
      }
    }, [userId])
  )

  // Filter messages for current direct conversation
  const directConversationMessages = messages.filter(
    m =>
      (m.senderId === userId && m.receiverId === receiverId) ||
      (m.senderId === receiverId && m.receiverId === userId)
  )

  const currentMessages = chatMode === 'overall' ? overallChatMessages : directConversationMessages
  const isEmpty = currentMessages.length === 0

  const renderMessageBubble = (msg: Message) => {
    const isOwn = msg.senderId === userId
    const senderProfile = userProfiles.get(msg.senderId)
    const displayProfile = isOwn ? userProfile : senderProfile
    const displayNickname = isOwn ? (userProfile?.nickname || 'User') : (senderProfile?.nickname || 'User')

    if (msg.isDeleted) {
      return (
        <View key={msg.id} style={styles.messageContainer}>
          <View style={styles.messageBubble}>
            <Text style={styles.deletedMessageText}>
              <Ionicons name="trash-outline" size={12} /> This message was deleted
            </Text>
          </View>
        </View>
      )
    }

    const avatarContent = displayProfile?.avatarUrl && displayProfile.avatarUrl.trim() !== '' ? (
      <Image source={{ uri: displayProfile.avatarUrl }} style={styles.messageSenderAvatar} />
    ) : (
      <View style={styles.messageSenderAvatarPlaceholder}>
        <Ionicons name="person" size={16} color="#999" />
      </View>
    )

    const avatar = (
      <TouchableOpacity
        onPress={() => setProfileModalUserId(msg.senderId)}
        activeOpacity={0.75}
      >
        {avatarContent}
      </TouchableOpacity>
    )

    return (
      <Pressable
        key={msg.id}
        onLongPress={() => isOwn && setSelectedMessageId(msg.id)}
        style={styles.messageWrapper}
      >
        <View>
          <Text style={[styles.messageSenderNickname, isOwn && styles.messageSenderNicknameOwn]}>
            {displayNickname}
          </Text>
          <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
            {!isOwn && avatar}
            <View style={[styles.messageBubble, isOwn && styles.ownMessage]}>
              <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>{msg.text}</Text>
              <View style={styles.messageFooter}>
                <Text style={[styles.timestamp, isOwn && styles.ownTimestamp]}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                {msg.editedAt && (
                  <Text style={[styles.editedBadge, isOwn && styles.ownEditedBadge]}>(edited)</Text>
                )}
              </View>
            </View>
            {isOwn && avatar}
          </View>
        </View>
      </Pressable>
    )
  }

  // ─── Sorted friends: active first ───────────────────────────────────────────
  const sortedFriends = [...friendsList].sort((a, b) => {
    const aActive = activeUserIds.has(a.id) ? 0 : 1
    const bActive = activeUserIds.has(b.id) ? 0 : 1
    return aActive - bActive
  })

  // ─── Direct Messages panel (no conversation open) ───────────────────────────
  const renderDirectMessagesPanel = () => (
    <ScrollView style={styles.dmPanel} showsVerticalScrollIndicator={false}>
      {/* Friends Section */}
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionHeader}>
          <Ionicons name="people" size={14} color="#007AFF" />
          {'  '}Friends
        </Text>
        {sortedFriends.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptySectionText}>No friends yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendsRow}>
            {sortedFriends.map(friend => {
              const isActive = activeUserIds.has(friend.id)
              return (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.friendBubble}
                  onPress={() => handleStartConversation(friend.id)}
                  onLongPress={() => setProfileModalUserId(friend.id)}
                >
                  <View style={styles.friendAvatarWrapper}>
                    {friend.avatar ? (
                      <Image source={{ uri: friend.avatar }} style={styles.friendBubbleAvatar} />
                    ) : (
                      <View style={styles.friendBubbleAvatarPlaceholder}>
                        <Ionicons name="person" size={22} color="#999" />
                      </View>
                    )}
                    {isActive && <View style={styles.activeDot} />}
                  </View>
                  <Text style={styles.friendBubbleName} numberOfLines={1}>
                    {friend.nickname}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* Conversations Section */}
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionHeader}>
          <Ionicons name="chatbubbles" size={14} color="#007AFF" />
          {'  '}Conversations
        </Text>
        {contactedUsers.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="chatbubbles-outline" size={40} color="#DDD" />
            <Text style={styles.emptySectionText}>No conversations yet</Text>
            <Text style={styles.emptySectionSub}>Tap a friend above to start chatting</Text>
          </View>
        ) : (
          contactedUsers.map(contact => {
            const isSelected = selectedConversationId === contact.id
            return (
              <View key={contact.id}>
                <Pressable
                  style={[styles.conversationItem, isSelected && styles.conversationItemSelected]}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedConversationId(null)
                    } else {
                      handleStartConversation(contact.id)
                    }
                  }}
                  onLongPress={() => setSelectedConversationId(contact.id)}
                >
                  <TouchableOpacity
                    onPress={() => setProfileModalUserId(contact.id)}
                    style={styles.convAvatarWrapper}
                  >
                    {contact.avatar ? (
                      <Image source={{ uri: contact.avatar }} style={styles.convAvatar} />
                    ) : (
                      <View style={styles.convAvatarPlaceholder}>
                        <Ionicons name="person" size={20} color="#999" />
                      </View>
                    )}
                    {activeUserIds.has(contact.id) && <View style={styles.activeDotSmall} />}
                  </TouchableOpacity>
                  <View style={styles.convInfo}>
                    <Text style={styles.convNickname}>{contact.nickname}</Text>
                    <Text style={styles.convLastMessage} numberOfLines={1}>
                      {contact.lastMessage || 'Say hello!'}
                    </Text>
                  </View>
                  <Text style={styles.convTime}>
                    {new Date(contact.lastContacted).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {isSelected && (
                    <TouchableOpacity
                      style={styles.convDeleteBtn}
                      onPress={() => {
                        setSelectedConversationId(null)
                        handleDeleteConversation(contact.id, contact.nickname)
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                    </TouchableOpacity>
                  )}
                </Pressable>
              </View>
            )
          })
        )}
      </View>
    </ScrollView>
  )

  // ─── Active Direct Conversation ─────────────────────────────────────────────
  const activeConvProfile = receiverId ? userProfiles.get(receiverId) : null
  const activeConvNickname = activeConvProfile?.nickname || 'User'

  const renderActiveConversation = () => (
    <>
      {/* Conversation sub-header */}
      <View style={styles.convHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setReceiverId('')}>
          <Ionicons name="chevron-back" size={22} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.convHeaderTapArea}
          onPress={() => setProfileModalUserId(receiverId)}
        >
          <View style={styles.convAvatarWrapper}>
            {activeConvProfile?.avatarUrl ? (
              <Image source={{ uri: activeConvProfile.avatarUrl }} style={styles.convHeaderAvatar} />
            ) : (
              <View style={styles.convHeaderAvatarPlaceholder}>
                <Ionicons name="person" size={18} color="#999" />
              </View>
            )}
            {activeUserIds.has(receiverId) && <View style={styles.activeDotSmall} />}
          </View>
          <View>
            <Text style={styles.convHeaderName}>{activeConvNickname}</Text>
            <Text style={styles.convHeaderStatus}>
              {activeUserIds.has(receiverId) ? 'Active now' : 'Offline'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {isEmpty ? (
        <View style={styles.centerContent}>
          <Ionicons name="chatbubble-ellipses-outline" size={50} color="#CCC" />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Say hi to {activeConvNickname}!</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.messagesContainer}
          showsVerticalScrollIndicator={false}
          ref={setScrollViewRef}
          onContentSizeChange={() => scrollViewRef?.scrollToEnd({ animated: true })}
        >
          {currentMessages.map(renderMessageBubble)}
        </ScrollView>
      )}

      {/* Input */}
      <View style={styles.inputArea}>
        <View style={styles.messageInputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={500}
            placeholderTextColor="#999"
          />
          <TouchableOpacity style={styles.sendButtonSmall} onPress={handleSendMessage}>
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </>
  )

  return (
    <View style={styles.container}>
      {/* Chat Mode Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, chatMode === 'overall' && styles.tabActive]}
          onPress={() => setChatMode('overall')}
        >
          <Ionicons
            name={chatMode === 'overall' ? 'people' : 'people-outline'}
            size={20}
            color={chatMode === 'overall' ? '#007AFF' : '#999'}
          />
          <Text style={[styles.tabText, chatMode === 'overall' && styles.tabTextActive]}>
            Overall Chat
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, chatMode === 'direct' && styles.tabActive]}
          onPress={() => setChatMode('direct')}
        >
          <Ionicons
            name={chatMode === 'direct' ? 'chatbubble' : 'chatbubble-outline'}
            size={20}
            color={chatMode === 'direct' ? '#007AFF' : '#999'}
          />
          <Text style={[styles.tabText, chatMode === 'direct' && styles.tabTextActive]}>
            Direct Messages
          </Text>
        </TouchableOpacity>
      </View>

      {/* Header — shown only in overall or when no direct convo open */}
      {(chatMode === 'overall' || (chatMode === 'direct' && !receiverId)) && (
        <View style={styles.header}>
          <View style={styles.headerContent}>
            {userProfile?.avatarUrl ? (
              <Image source={{ uri: userProfile.avatarUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Ionicons name="person" size={20} color="#999" />
              </View>
            )}
            <View style={styles.headerInfo}>
              <Text style={styles.headerNickname}>{userProfile?.nickname || 'User'}</Text>
              <Text style={styles.headerTitle}>
                {chatMode === 'overall' ? 'Overall Chat' : 'Direct Messages'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── OVERALL CHAT ── */}
      {chatMode === 'overall' && (
        <>
          {overallChatMessages.length === 0 ? (
            <View style={styles.centerContent}>
              <Ionicons name="people-outline" size={60} color="#CCC" />
              <Text style={styles.emptyText}>No messages in overall chat yet</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.messagesContainer}
              showsVerticalScrollIndicator={false}
              ref={setScrollViewRef}
              onContentSizeChange={() => scrollViewRef?.scrollToEnd({ animated: true })}
            >
              {overallChatMessages.map(renderMessageBubble)}
            </ScrollView>
          )}
          <View style={styles.inputArea}>
            <View style={styles.messageInputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder="Share a message..."
                value={messageText}
                onChangeText={setMessageText}
                multiline
                maxLength={500}
                placeholderTextColor="#999"
              />
              <TouchableOpacity style={styles.sendButtonSmall} onPress={handleSendMessage}>
                <Ionicons name="send" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* ── DIRECT MESSAGES ── */}
      {chatMode === 'direct' && (
        <>
          {receiverId ? renderActiveConversation() : renderDirectMessagesPanel()}

          {/* FAB: only show when NOT in an active conversation */}
          {!receiverId && (
            <TouchableOpacity
              style={styles.fab}
              onPress={() => setShowNewConversationModal(true)}
            >
              <Ionicons name="create" size={24} color="#FFF" />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Edit Message Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Message</Text>
              <TouchableOpacity onPress={handleEditMessage}>
                <Text style={styles.sendButton}>Save</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.label}>Message:</Text>
              <TextInput
                style={styles.messageInput}
                value={editingText}
                onChangeText={setEditingText}
                multiline
                numberOfLines={6}
                placeholderTextColor="#999"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Message Action Menu */}
      <Modal
        visible={selectedMessageId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMessageId(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setSelectedMessageId(null)}>
          <View style={styles.actionMenuContainer}>
            <TouchableOpacity
              style={styles.menuOption}
              onPress={() => {
                if (selectedMessageId) {
                  setEditingMessageId(selectedMessageId)
                  const msg = currentMessages.find(m => m.id === selectedMessageId)
                  if (msg) {
                    setEditingText(msg.text)
                    setShowEditModal(true)
                  }
                }
                setSelectedMessageId(null)
              }}
            >
              <Ionicons name="pencil-outline" size={20} color="#007AFF" />
              <Text style={styles.menuOptionText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuOption, styles.deleteOption]}
              onPress={() => {
                if (selectedMessageId) handleDeleteMessage(selectedMessageId)
                setSelectedMessageId(null)
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={[styles.menuOptionText, styles.deleteOptionText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* New Conversation Modal */}
      <Modal
        visible={showNewConversationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewConversationModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.newConversationContent}>
            <View style={styles.newConversationHeader}>
              <TouchableOpacity onPress={() => setShowNewConversationModal(false)}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Start Conversation</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView style={styles.newConversationBody} showsVerticalScrollIndicator={false}>
              {friendsList.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>From Friends</Text>
                  <View style={styles.friendsGrid}>
                    {friendsList.map(friend => (
                      <TouchableOpacity
                        key={friend.id}
                        style={styles.friendCard}
                        onPress={() => handleStartConversation(friend.id)}
                      >
                        {friend.avatar ? (
                          <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} />
                        ) : (
                          <View style={styles.friendAvatarPlaceholder}>
                            <Ionicons name="person" size={24} color="#999" />
                          </View>
                        )}
                        <Text style={styles.friendName} numberOfLines={2}>
                          {friend.nickname}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.recipientInputSection}>
                <Text style={styles.sectionTitle}>By Recipient ID</Text>
                <TextInput
                  style={styles.recipientIdInput}
                  placeholder="Enter recipient ID"
                  value={newRecipientId}
                  onChangeText={setNewRecipientId}
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  style={[styles.startButton, !newRecipientId.trim() && styles.startButtonDisabled]}
                  onPress={() => {
                    if (newRecipientId.trim()) handleStartConversation(newRecipientId)
                  }}
                  disabled={!newRecipientId.trim()}
                >
                  <Text style={styles.startButtonText}>Start</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.qrSection}>
                <Text style={styles.sectionTitle}>Scan QR Code</Text>
                <TouchableOpacity style={styles.qrButton}>
                  <Ionicons name="qr-code" size={40} color="#007AFF" />
                  <Text style={styles.qrButtonText}>Scan QR Code</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* User Profile Modal */}
      <UserProfileModal
        visible={profileModalUserId !== null}
        targetUserId={profileModalUserId}
        isActiveUser={profileModalUserId ? activeUserIds.has(profileModalUserId) : false}
        onClose={() => setProfileModalUserId(null)}
        onMessage={(uid) => {
          setChatMode('direct')
          handleStartConversation(uid)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  // ── Tabs ──
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#007AFF' },
  tabText: { fontSize: 13, fontWeight: '500', color: '#999' },
  tabTextActive: { color: '#007AFF' },

  // ── Header ──
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerNickname: { fontSize: 14, fontWeight: '600', color: '#007AFF', marginBottom: 2 },
  headerTitle: { fontSize: 14, fontWeight: '500', color: '#666' },

  // ── DM Panel ──
  dmPanel: { flex: 1, backgroundColor: '#F8F9FA' },
  sectionBlock: { marginBottom: 4 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#007AFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    letterSpacing: 0.3,
  },

  // Friends horizontal scroll
  friendsRow: { paddingLeft: 16, paddingBottom: 12 },
  friendBubble: { alignItems: 'center', marginRight: 18, width: 64 },
  friendAvatarWrapper: { position: 'relative', marginBottom: 6 },
  friendBubbleAvatar: { width: 56, height: 56, borderRadius: 28 },
  friendBubbleAvatarPlaceholder: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#E8E8E8', justifyContent: 'center', alignItems: 'center',
  },
  activeDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#34C759', borderWidth: 2, borderColor: '#F8F9FA',
  },
  activeDotSmall: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#34C759', borderWidth: 2, borderColor: '#FFF',
  },
  friendBubbleName: { fontSize: 11, fontWeight: '500', color: '#333', textAlign: 'center' },

  // Conversations list
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  conversationItemSelected: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  conversationItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  convAvatarWrapper: { position: 'relative' },
  convAvatar: { width: 46, height: 46, borderRadius: 23 },
  convAvatarPlaceholder: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center',
  },
  convInfo: { flex: 1 },
  convNickname: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 3 },
  convLastMessage: { fontSize: 12, color: '#999' },
  convTime: { fontSize: 11, color: '#BBB', marginLeft: 4 },
  convDeleteBtn: {
    padding: 6,
    marginLeft: 'auto',
  },

  // ── Conversation view ──
  convHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  convHeaderTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: { padding: 4, marginRight: 2 },
  convHeaderAvatar: { width: 36, height: 36, borderRadius: 18 },
  convHeaderAvatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center',
  },
  convHeaderName: { fontSize: 15, fontWeight: '600', color: '#000' },
  convHeaderStatus: { fontSize: 12, color: '#34C759' },

  // ── Messages ──
  messagesContainer: { flex: 1, padding: 12 },
  messageWrapper: { marginBottom: 12 },
  messageContainer: { marginBottom: 12 },
  messageSenderNickname: {
    fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 4, marginLeft: 40,
  },
  messageSenderNicknameOwn: {
    marginLeft: 0, marginRight: 40, textAlign: 'right', color: '#007AFF',
  },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageRowOwn: { justifyContent: 'flex-end' },
  messageSenderAvatar: { width: 32, height: 32, borderRadius: 16 },
  messageSenderAvatarPlaceholder: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center',
  },
  messageBubble: {
    backgroundColor: '#E5E5EA', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, maxWidth: '70%', alignSelf: 'flex-start',
  },
  ownMessage: { backgroundColor: '#007AFF', alignSelf: 'flex-end' },
  messageText: { fontSize: 14, color: '#000' },
  ownMessageText: { color: '#FFF' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  timestamp: { fontSize: 11, color: '#666' },
  ownTimestamp: { color: 'rgba(255,255,255,0.7)' },
  editedBadge: { fontSize: 10, color: '#999', fontStyle: 'italic' },
  ownEditedBadge: { color: 'rgba(255,255,255,0.6)' },
  deletedMessageText: { fontSize: 13, color: '#999', fontStyle: 'italic' },

  // ── Input ──
  inputArea: {
    backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E8E8E8',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  messageInputContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  textInput: {
    flex: 1, backgroundColor: '#F0F0F0', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#000', maxHeight: 100,
  },
  sendButtonSmall: {
    backgroundColor: '#007AFF', borderRadius: 20,
    width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },

  // ── Empty States ──
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#CCC', marginTop: 8 },
  emptySection: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  emptySectionText: { fontSize: 14, color: '#BBB', marginTop: 8 },
  emptySectionSub: { fontSize: 12, color: '#CCC', marginTop: 4 },

  // ── FAB ──
  fab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },

  // ── Modals ──
  modalContainer: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8',
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  cancelButton: { color: '#999', fontSize: 14 },
  sendButton: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
  modalBody: { paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 8 },
  messageInput: {
    borderWidth: 1, borderColor: '#E8E8E8', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: '#000', textAlignVertical: 'top',
  },
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  actionMenuContainer: {
    backgroundColor: '#FFF', borderRadius: 12, overflow: 'hidden', minWidth: 160,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  menuOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  deleteOption: { borderBottomWidth: 0 },
  menuOptionText: { fontSize: 15, fontWeight: '500', color: '#007AFF' },
  deleteOptionText: { color: '#FF3B30' },
  newConversationContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', flex: 1,
  },
  newConversationHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8',
  },
  newConversationBody: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  sectionTitle: {
    fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 12, marginTop: 16,
  },
  friendsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  friendCard: {
    width: '33.33%', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4,
  },
  friendAvatar: { width: 60, height: 60, borderRadius: 30, marginBottom: 8 },
  friendAvatarPlaceholder: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  friendName: { fontSize: 12, fontWeight: '500', color: '#000', textAlign: 'center' },
  recipientInputSection: { marginBottom: 20 },
  recipientIdInput: {
    borderWidth: 1, borderColor: '#E8E8E8', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 14, color: '#000', marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 12, alignItems: 'center',
  },
  startButtonDisabled: { backgroundColor: '#CCC' },
  startButtonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  qrSection: { marginBottom: 40 },
  qrButton: {
    backgroundColor: '#F0F0F0', borderRadius: 12, paddingVertical: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  qrButtonText: { fontSize: 14, fontWeight: '600', color: '#007AFF', marginTop: 8 },
})