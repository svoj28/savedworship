import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  Image,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import { addContact, getContactsByUserId, deleteContact } from '../db/queries'
import { Contact } from '../db/models'
import { generateShortId } from '../lib/shortId'

type TabType = 'share' | 'add' | 'contacts'

interface AddContactFormData {
  recipientId: string
}

export default function AddContactsScreen() {
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<TabType>('share')
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [formData, setFormData] = useState<AddContactFormData>({ recipientId: '' })
  const [addingContact, setAddingContact] = useState(false)

  useEffect(() => {
    loadUserAndContacts()
  }, [])

  const loadUserAndContacts = async () => {
    try {
      setLoading(true)
      const currentUser = await getCurrentUser()
      if (currentUser) {
        setUser(currentUser)
        const userContacts = await getContactsByUserId(currentUser.id)
        setContacts(userContacts)
      }
    } catch (err) {
      console.error('Error loading user:', err)
      Alert.alert('Error', 'Failed to load user data')
    } finally {
      setLoading(false)
    }
  }

  const handleAddContact = async () => {
    if (!formData.recipientId.trim()) {
      Alert.alert('Error', 'Please enter a recipient ID')
      return
    }

    if (formData.recipientId === user?.id) {
      Alert.alert('Error', 'You cannot add yourself')
      return
    }

    try {
      setAddingContact(true)

      // Check if contact already exists
      const existing = contacts.find(c => c.contactUserId === formData.recipientId)
      if (existing) {
        Alert.alert('Error', 'This contact already exists')
        return
      }

      // Create contact
      const newContact = await addContact({
        userId: user.id,
        contactUserId: formData.recipientId,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        synced: false,
      })

      setContacts([newContact, ...contacts])
      setFormData({ recipientId: '' })
      Alert.alert('Success', 'Contact added successfully')
    } catch (err) {
      console.error('Error adding contact:', err)
      Alert.alert('Error', 'Failed to add contact')
    } finally {
      setAddingContact(false)
    }
  }

  const handleDeleteContact = async (contactId: string) => {
    Alert.alert('Delete Contact', 'Are you sure you want to delete this contact?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await deleteContact(contactId)
            setContacts(contacts.filter(c => c.id !== contactId))
            Alert.alert('Success', 'Contact deleted')
          } catch (err) {
            Alert.alert('Error', 'Failed to delete contact')
          }
        },
        style: 'destructive',
      },
    ])
  }

  const handleShareQRCode = async () => {
    try {
      await Share.share({
        message: `Add me as a contact! My Recipient ID is: ${user?.id}`,
        title: 'Share My Recipient ID',
      })
    } catch (err) {
      console.error('Error sharing:', err)
    }
  }

  const handleScanQRCode = () => {
    Alert.alert('QR Code Scanner', 'QR code scanning feature coming soon')
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'share' && styles.activeTab]}
          onPress={() => setActiveTab('share')}
        >
          <Text style={[styles.tabText, activeTab === 'share' && styles.activeTabText]}>
            Share ID
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'add' && styles.activeTab]}
          onPress={() => setActiveTab('add')}
        >
          <Text style={[styles.tabText, activeTab === 'add' && styles.activeTabText]}>
            Add Contact
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contacts' && styles.activeTab]}
          onPress={() => setActiveTab('contacts')}
        >
          <Text style={[styles.tabText, activeTab === 'contacts' && styles.activeTabText]}>
            My Contacts
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Share ID Tab */}
        {activeTab === 'share' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Share Your ID</Text>
            <Text style={styles.description}>
              Others can enter your Recipient ID to add you as a contact.
            </Text>

            {user?.id && (
              <View style={styles.qrcodeContainer}>
                <View style={styles.qrcode}>
                  <Image
                    source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(user.id)}` }}
                    style={{ width: 250, height: 250 }}
                  />
                </View>
              </View>
            )}

            <View style={styles.idBox}>
              <Text style={styles.idLabel}>Your Recipient ID:</Text>
              <Text style={styles.idValue}>{generateShortId(user?.id)}</Text>
              <Text style={styles.idHint}>Full ID: {user?.id.substring(0, 12)}...</Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleShareQRCode}
            >
              <Ionicons name="share-social" size={20} color="#fff" />
              <Text style={styles.buttonText}>Share ID</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Add Contact Tab */}
        {activeTab === 'add' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Add Contact</Text>
            <Text style={styles.description}>
              Enter another user's Recipient ID or scan their QR code to add them as a contact.
            </Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter recipient ID"
                value={formData.recipientId}
                onChangeText={(text) => setFormData({ recipientId: text })}
                editable={!addingContact}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, addingContact && styles.disabledButton]}
              onPress={handleAddContact}
              disabled={addingContact}
            >
              {addingContact ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Add Contact</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleScanQRCode}
            >
              <Ionicons name="qr-code" size={20} color="#007AFF" />
              <Text style={styles.secondaryButtonText}>Scan QR Code</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>My Contacts</Text>
            {contacts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No contacts yet</Text>
                <Text style={styles.emptySubtext}>
                  Add your first contact to get started
                </Text>
              </View>
            ) : (
              contacts.map((contact) => (
                <View key={contact.id} style={styles.contactCard}>
                  <View style={styles.contactInfo}>
                    <View style={styles.contactAvatar}>
                      <Ionicons name="person" size={24} color="#007AFF" />
                    </View>
                    <View style={styles.contactDetails}>
                      <Text style={styles.contactName}>
                        {contact.contactName || 'Unknown Contact'}
                      </Text>
                      <Text style={styles.contactId}>
                        ID: {generateShortId(contact.contactUserId)}
                      </Text>
                      <Text style={[styles.contactStatus, contact.status === 'accepted' && styles.statusAccepted]}>
                        {contact.status === 'pending' ? '⏳ Pending' : '✓ Connected'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteContact(contact.id)}
                  >
                    <Ionicons name="trash" size={20} color="#f44" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  activeTabText: {
    color: '#007AFF',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  qrcodeContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  qrcode: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  idBox: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  idLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  idValue: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
  },
  idHint: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  inputContainer: {
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 12,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  contactInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  contactId: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  contactStatus: {
    fontSize: 11,
    color: '#f44',
    marginTop: 4,
    fontWeight: '500',
  },
  statusAccepted: {
    color: '#4CAF50',
  },
  deleteButton: {
    padding: 8,
  },
})
