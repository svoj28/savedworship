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
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import { createMessage, query as dbQuery, editMessage, deleteMessage } from '../db/queries'
import { Message } from '../db/models'

export default function ConversationScreen() {
  const [userId, setUserId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [overallChatMessages, setOverallChatMessages] = useState<Message[]>([])
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [receiverId, setReceiverId] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [chatMode, setChatMode] = useState<'direct' | 'overall'>('overall')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [scrollViewRef, setScrollViewRef] = useState<any>(null)
  const [showActionMenu, setShowActionMenu] = useState(false)

  const OVERALL_CHAT_ID = 'overall-chat'

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
        await loadMessages(user.id)
        await loadOverallChat(user.id)
        await loadUsers()
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
      // Scroll to bottom after loading messages
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

      setOverallChatMessages(results.map(mapMessage))
      // Scroll to bottom after loading messages
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
      setShowNewMessage(false)

      if (chatMode === 'overall') {
        await loadOverallChat(userId)
      } else {
        await loadMessages(userId)
      }
    } catch (err) {
      console.error('Error sending message:', err)
      Alert.alert('Error', 'Failed to send message')
    }
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

  const loadUsers = async () => {
    try {
      const results = await dbQuery(
        `SELECT DISTINCT sender_id, receiver_id FROM messages WHERE receiver_id != ? AND COALESCE(is_deleted, 0) = 0`,
        [OVERALL_CHAT_ID]
      )
      const uniqueUserIds = new Set<string>()

      results.forEach((msg: any) => {
        if (msg.sender_id) uniqueUserIds.add(msg.sender_id)
        if (msg.receiver_id) uniqueUserIds.add(msg.receiver_id)
      })

      setUsers(Array.from(uniqueUserIds).map((id) => ({ id, name: id.substring(0, 8) })))
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  const renderMessageBubble = (msg: Message) => {
    const isOwn = msg.senderId === userId
    const isSelected = selectedMessageId === msg.id
    
    if (msg.isDeleted) {
      return (
        <View key={msg.id} style={[styles.messageBubble, isOwn && styles.ownMessage]}>
          <Text style={[styles.deletedMessageText, isOwn && styles.ownMessageText]}>
            <Ionicons name="trash-outline" size={12} /> This message was deleted
          </Text>
        </View>
      )
    }

    return (
      <Pressable
        key={msg.id}
        onLongPress={() => isOwn && setSelectedMessageId(msg.id)}
        style={{ marginBottom: 8 }}
      >
        <View style={[styles.messageBubble, isOwn && styles.ownMessage]}>
          {chatMode === 'overall' && !isOwn && (
            <Text style={styles.senderName}>{msg.senderId.substring(0, 8)}</Text>
          )}
          <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>{msg.text}</Text>
          
          <View style={styles.messageFooter}>
            <Text style={[styles.timestamp, isOwn && styles.ownTimestamp]}>
              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {msg.editedAt && (
              <Text style={[styles.editedBadge, isOwn && styles.ownEditedBadge]}>
                (edited)
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  const currentMessages = chatMode === 'overall' ? overallChatMessages : messages
  const isEmpty = currentMessages.length === 0

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

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {chatMode === 'overall' ? 'Overall Chat' : 'Direct Messages'}
        </Text>
      </View>

      {/* Messages Area */}
      {isEmpty ? (
        <View style={styles.centerContent}>
          <Ionicons
            name={chatMode === 'overall' ? 'people-outline' : 'chatbubbles-outline'}
            size={60}
            color="#CCC"
          />
          <Text style={styles.emptyText}>
            {chatMode === 'overall' ? 'No messages in overall chat yet' : 'No direct messages yet'}
          </Text>
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

      {/* Input Area - Always Visible */}
      <View style={styles.inputArea}>
        {chatMode === 'direct' && (
          <View style={styles.recipientSection}>
            <Text style={styles.recipientLabel}>To:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.recipientScroll}
            >
              {users.length === 0 ? (
                <TextInput
                  style={styles.recipientInput}
                  placeholder="Enter recipient ID"
                  value={receiverId}
                  onChangeText={setReceiverId}
                  placeholderTextColor="#999"
                />
              ) : (
                users.map((user) => (
                  <TouchableOpacity
                    key={user.id}
                    style={[
                      styles.userOption,
                      receiverId === user.id && styles.userOptionSelected,
                    ]}
                    onPress={() => setReceiverId(user.id)}
                  >
                    <Text
                      style={[
                        styles.userOptionText,
                        receiverId === user.id && styles.userOptionTextSelected,
                      ]}
                    >
                      {user.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}

        <View style={styles.messageInputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder={
              chatMode === 'overall'
                ? 'Share a message...'
                : 'Type a message...'
            }
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={500}
            placeholderTextColor="#999"
          />
          <TouchableOpacity
            style={styles.sendButtonSmall}
            onPress={handleSendMessage}
          >
            <Ionicons name="send" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

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

      {/* Message Action Menu Popup */}
      <Modal 
        visible={selectedMessageId !== null} 
        transparent 
        animationType="fade"
        onRequestClose={() => setSelectedMessageId(null)}
      >
        <Pressable 
          style={styles.menuOverlay}
          onPress={() => setSelectedMessageId(null)}
        >
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
                if (selectedMessageId) {
                  handleDeleteMessage(selectedMessageId)
                }
                setSelectedMessageId(null)
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={[styles.menuOptionText, styles.deleteOptionText]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
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
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  messagesContainer: {
    flex: 1,
    padding: 12,
  },
  messageBubble: {
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  ownMessage: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 14,
    color: '#000',
  },
  ownMessageText: {
    color: '#FFF',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#666',
  },
  ownTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  editedBadge: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  ownEditedBadge: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  deletedMessageText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  actionBar: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  /* Input Area Styles */
  inputArea: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recipientSection: {
    marginBottom: 8,
  },
  recipientLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  recipientScroll: {
    marginBottom: 8,
  },
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
    maxHeight: 100,
  },
  sendButtonSmall: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  /* Modal Styles */
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  cancelButton: {
    color: '#999',
    fontSize: 14,
  },
  sendButton: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  recipientContainer: {
    marginBottom: 16,
  },
  recipientInput: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#000',
  },
  userOption: {
    backgroundColor: '#F0F0F0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  userOptionSelected: {
    backgroundColor: '#007AFF',
  },
  userOptionText: {
    fontSize: 12,
    color: '#000',
  },
  userOptionTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
    textAlignVertical: 'top',
  },
  /* Action Menu Popup Styles */
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionMenuContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  deleteOption: {
    borderBottomWidth: 0,
  },
  menuOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#007AFF',
  },
  deleteOptionText: {
    color: '#FF3B30',
  },
})
