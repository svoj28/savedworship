import React, { useEffect, useState, useRef } from 'react'
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
  Modal,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera'
import { getCurrentUser } from '../lib/auth'
import { addContact, getContactsByUserId, deleteContact, getUserProfileByShortId, updateContact } from '../db/queries'
import { Contact } from '../db/models'
import { generateShortId } from '../lib/shortId'
import { notifyNewUpload, notifyContactRequest, notifyContactAccepted, notifyContactRejected } from '../lib/notifications'

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

  // QR Scanner state
  const [scannerVisible, setScannerVisible] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)


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

  const handleAddContact = async (recipientId?: string) => {
    let idToAdd = (recipientId ?? formData.recipientId).trim()

    if (!idToAdd) {
      Alert.alert('Error', 'Please enter a recipient ID')
      return
    }

    if (idToAdd === user?.id) {
      Alert.alert('Error', 'You cannot add yourself')
      return
    }

    // If not a UUID, try to resolve as short ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(idToAdd)) {
      // Try to find user by short ID
      const profile = await getUserProfileByShortId(idToAdd)
      if (!profile) {
        Alert.alert('Error', 'No user found with that Recipient ID')
        return
      }
      idToAdd = profile.userId
    }

    try {
      setAddingContact(true)

      const existing = contacts.find(c => c.contactUserId === idToAdd)
      if (existing) {
        Alert.alert('Error', 'This contact already exists')
        return
      }

      const newContact = await addContact({
  userId: idToAdd,
  contactUserId: user.id,
  status: 'pending',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  synced: false,
})

setContacts([newContact, ...contacts])
await notifyContactRequest(idToAdd, user?.displayName || 'Someone', user.id)
setFormData({ recipientId: '' })
Alert.alert('Success', 'Contact request sent')
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

const handleAcceptContact = async (contact: Contact) => {
  try {
    await updateContact(contact.id, { status: 'accepted', updatedAt: Date.now() })
    setContacts(contacts.map(c =>
      c.id === contact.id ? { ...c, status: 'accepted' } : c
    ))
    await notifyContactAccepted(contact.contactUserId, user?.displayName || 'Someone')
  } catch (err) {
    Alert.alert('Error', 'Failed to accept contact')
  }
}

const handleRejectContact = async (contact: Contact) => {
  Alert.alert('Reject Contact', 'Are you sure you want to reject this request?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Reject',
      style: 'destructive',
      onPress: async () => {
        try {
          await updateContact(contact.id, { status: 'blocked', updatedAt: Date.now() })
          setContacts(contacts.map(c =>
            c.id === contact.id ? { ...c, status: 'blocked' } : c
          ))
          await notifyContactRejected(contact.contactUserId, user?.displayName || 'Someone')
        } catch (err) {
          Alert.alert('Error', 'Failed to reject contact')
        }
      },
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

  // ─── QR Scanner logic ────────────────────────────────────────────────────────

  const handleScanQRCode = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync()
    if (status === 'granted') {
      setHasPermission(true)
      setScanned(false)
      setScannerVisible(true)
    } else {
      setHasPermission(false)
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in your device settings to scan QR codes.',
        [{ text: 'OK' }]
      )
    }
  }

  const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanned) return
    setScanned(true)
    setScannerVisible(false)

    // The QR code encodes the full user ID — use it directly
    Alert.alert(
      'QR Code Scanned',
      `Found ID: ${data.substring(0, 20)}...\n\nAdd this person as a contact?`,
      [
        {
          text: 'Cancel',
          onPress: () => setScanned(false),
          style: 'cancel',
        },
        {
          text: 'Add Contact',
          onPress: () => handleAddContact(data),
        },
      ]
    )
  }

  const closeScanner = () => {
    setScannerVisible(false)
    setScanned(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* QR Scanner Modal */}
      <Modal
        visible={scannerVisible}
        animationType="slide"
        onRequestClose={closeScanner}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={closeScanner} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan QR Code</Text>
            <View style={{ width: 44 }} />
          </View>

          {hasPermission && (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />
          )}

          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame}>
              {/* Corner marks */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>

          <View style={styles.scannerFooter}>
            <Text style={styles.scannerHint}>
              Point your camera at the recipient's QR code
            </Text>
            {scanned && (
              <TouchableOpacity
                style={styles.rescanButton}
                onPress={() => setScanned(false)}
              >
                <Text style={styles.rescanText}>Tap to Scan Again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

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
              Others can scan your QR code or enter your Recipient ID to add you as a contact.
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
              onPress={() => handleAddContact()}
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
      <Text style={[
        styles.contactStatus,
        contact.status === 'accepted' && styles.statusAccepted,
        contact.status === 'blocked' && styles.statusRejected,
      ]}>
        {contact.status === 'pending' && '⏳ Pending'}
        {contact.status === 'accepted' && '✓ Connected'}
        {contact.status === 'blocked' && '✗ Rejected'}
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
  cardActions: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},
acceptButton: {
  backgroundColor: '#34C759',
  borderRadius: 6,
  padding: 7,
},
rejectButton: {
  backgroundColor: '#FF3B30',
  borderRadius: 6,
  padding: 7,
},
statusRejected: {
  color: '#FF3B30',
},
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // ─── Scanner Modal ───────────────────────────────────────────────────────────
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    zIndex: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Darken the area around the frame via the frame itself being transparent
  },
  scannerFrame: {
    width: 240,
    height: 240,
    position: 'relative',
    marginTop: 80, // push down to account for header
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#fff',
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scannerFooter: {
    paddingBottom: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scannerHint: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  rescanButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  rescanText: {
    color: '#fff',
    fontWeight: '600',
  },

  // ─── Tabs ────────────────────────────────────────────────────────────────────
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

  // ─── Content ─────────────────────────────────────────────────────────────────
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