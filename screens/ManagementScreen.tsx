import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import {
  getLineupsByUserId,
  getFileDroppersByUserId,
  getAnnouncementsByUserId,
  getVersionDroppersByUserId,
  createLineup,
  createFileDropper,
  createImportantAnnouncement,
  createVersionDropper,
  updateLineup,
  updateFileDropper,
  updateAnnouncement,
  updateVersionDropper,
  deleteLineup,
  deleteFileDropper,
  deleteAnnouncement,
  deleteVersionDropper,
} from '../db/queries'
import { Lineup, FileDropper, ImportantAnnouncement, VersionDropper } from '../db/models'

type Section = 'lineup' | 'conversation' | 'files' | 'announcements' | 'versions' | null

interface FormData {
  title: string
  description?: string
  content?: string
  youtubeUrl?: string
  fileUrl?: string
}

export default function ManagementScreen() {
  const [activeSection, setActiveSection] = useState<Section>(null)
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // Data states
  const [lineups, setLineups] = useState<Lineup[]>([])
  const [files, setFiles] = useState<FileDropper[]>([])
  const [announcements, setAnnouncements] = useState<ImportantAnnouncement[]>([])
  const [versions, setVersions] = useState<VersionDropper[]>([])

  // Form states
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>({})
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
        await loadData(user.id)
      }
    }
    loadUser()
  }, [])

  const loadData = async (id: string) => {
    setLoading(true)
    try {
      const [lineupData, fileData, announcementData, versionData] = await Promise.all([
        getLineupsByUserId(id),
        getFileDroppersByUserId(id),
        getAnnouncementsByUserId(id),
        getVersionDroppersByUserId(id),
      ])
      setLineups(lineupData)
      setFiles(fileData)
      setAnnouncements(announcementData)
      setVersions(versionData)
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddNew = () => {
    setEditingId(null)
    setFormData({})
    setShowForm(true)
  }

  const handleEdit = (item: any) => {
    setEditingId(item.id)
    setFormData({
      title: item.title,
      description: item.description || '',
      content: item.content || '',
      youtubeUrl: item.youtubeUrl || '',
      fileUrl: item.fileUrl || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!formData.title?.trim()) {
      Alert.alert('Error', 'Please enter a title')
      return
    }

    try {
      const now = Date.now()

      if (activeSection === 'lineup') {
        if (editingId) {
          await updateLineup(editingId, {
            title: formData.title,
            description: formData.description,
            updatedAt: now,
          })
        } else {
          await createLineup({
            title: formData.title,
            description: formData.description,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
        }
      } else if (activeSection === 'files') {
        if (!formData.fileUrl?.trim()) {
          Alert.alert('Error', 'Please enter a file URL')
          return
        }
        if (editingId) {
          await updateFileDropper(editingId, {
            title: formData.title,
            description: formData.description,
            fileUrl: formData.fileUrl,
            updatedAt: now,
          })
        } else {
          await createFileDropper({
            title: formData.title,
            description: formData.description,
            fileUrl: formData.fileUrl,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
        }
      } else if (activeSection === 'announcements') {
        if (!formData.content?.trim()) {
          Alert.alert('Error', 'Please enter announcement content')
          return
        }
        if (editingId) {
          await updateAnnouncement(editingId, {
            title: formData.title,
            content: formData.content,
            updatedAt: now,
          })
        } else {
          await createImportantAnnouncement({
            title: formData.title,
            content: formData.content,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
        }
      } else if (activeSection === 'versions') {
        if (!formData.youtubeUrl?.trim()) {
          Alert.alert('Error', 'Please enter a YouTube URL')
          return
        }
        if (editingId) {
          await updateVersionDropper(editingId, {
            title: formData.title,
            description: formData.description,
            youtubeUrl: formData.youtubeUrl,
            updatedAt: now,
          })
        } else {
          await createVersionDropper({
            title: formData.title,
            description: formData.description,
            youtubeUrl: formData.youtubeUrl,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
        }
      }

      setShowForm(false)
      setFormData({})
      await loadData(userId)
    } catch (err) {
      console.error('Error submitting form:', err)
      Alert.alert('Error', 'Failed to save item')
    }
  }

  const handleDelete = async (id: string) => {
    Alert.alert('Delete', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            if (activeSection === 'lineup') await deleteLineup(id)
            else if (activeSection === 'files') await deleteFileDropper(id)
            else if (activeSection === 'announcements') await deleteAnnouncement(id)
            else if (activeSection === 'versions') await deleteVersionDropper(id)

            await loadData(userId)
          } catch (err) {
            console.error('Error deleting item:', err)
            Alert.alert('Error', 'Failed to delete item')
          }
        },
      },
    ])
  }

  const renderSectionContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )
    }

    let items: any[] = []
    let emptyMessage = ''

    if (activeSection === 'lineup') {
      items = lineups
      emptyMessage = 'No lineups created yet'
    } else if (activeSection === 'files') {
      items = files
      emptyMessage = 'No files added yet'
    } else if (activeSection === 'announcements') {
      items = announcements
      emptyMessage = 'No announcements created yet'
    } else if (activeSection === 'versions') {
      items = versions
      emptyMessage = 'No versions added yet'
    }

    if (items.length === 0) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddNew}>
            <Ionicons name="add-circle" size={40} color="#007AFF" />
            <Text style={styles.addButtonText}>Add New</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return (
      <View style={styles.itemsContainer}>
        {items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.description && <Text style={styles.itemDescription}>{item.description}</Text>}
              {item.content && <Text style={styles.itemDescription}>{item.content}</Text>}
              {item.youtubeUrl && <Text style={styles.itemUrl}>{item.youtubeUrl}</Text>}
              {item.fileUrl && <Text style={styles.itemUrl}>{item.fileUrl}</Text>}
            </View>
            <View style={styles.itemActions}>
              <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionButton}>
                <Ionicons name="pencil" size={20} color="#007AFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionButton}>
                <Ionicons name="trash" size={20} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.addMoreButton} onPress={handleAddNew}>
          <Ionicons name="add-circle" size={30} color="#007AFF" />
          <Text style={styles.addMoreText}>Add Another</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const renderForm = () => {
    return (
      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.formContainer}>
          <View style={styles.formContent}>
            <View style={styles.formHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={28} color="#007AFF" />
              </TouchableOpacity>
              <Text style={styles.formTitle}>
                {editingId ? 'Edit Item' : `Add New ${activeSection}`}
              </Text>
              <TouchableOpacity onPress={handleSubmit}>
                <Ionicons name="checkmark" size={28} color="#34C759" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll}>
              <TextInput
                style={styles.input}
                placeholder="Title"
                value={formData.title || ''}
                onChangeText={(text) => setFormData({ ...formData, title: text })}
                placeholderTextColor="#999"
              />

              {activeSection === 'announcements' && (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Announcement Content"
                  value={formData.content || ''}
                  onChangeText={(text) => setFormData({ ...formData, content: text })}
                  multiline
                  numberOfLines={5}
                  placeholderTextColor="#999"
                />
              )}

              {activeSection === 'files' && (
                <TextInput
                  style={styles.input}
                  placeholder="File URL"
                  value={formData.fileUrl || ''}
                  onChangeText={(text) => setFormData({ ...formData, fileUrl: text })}
                  placeholderTextColor="#999"
                />
              )}

              {activeSection === 'versions' && (
                <TextInput
                  style={styles.input}
                  placeholder="YouTube URL"
                  value={formData.youtubeUrl || ''}
                  onChangeText={(text) => setFormData({ ...formData, youtubeUrl: text })}
                  placeholderTextColor="#999"
                />
              )}

              {(activeSection === 'lineup' || activeSection === 'files' || activeSection === 'versions') && (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Description (optional)"
                  value={formData.description || ''}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline
                  numberOfLines={4}
                  placeholderTextColor="#999"
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    )
  }

  if (!activeSection) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Management Panel</Text>
        </View>

        <View style={styles.sectionGrid}>
          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => setActiveSection('lineup')}
          >
            <Ionicons name="list" size={40} color="#007AFF" />
            <Text style={styles.sectionTitle}>Lineup Posted</Text>
            <Text style={styles.sectionCount}>{lineups.length} items</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => setActiveSection('conversation')}
          >
            <Ionicons name="chatbubbles" size={40} color="#FF9500" />
            <Text style={styles.sectionTitle}>Conversation</Text>
            <Text style={styles.sectionCount}>Messages</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => setActiveSection('files')}
          >
            <Ionicons name="folder" size={40} color="#5AC8FA" />
            <Text style={styles.sectionTitle}>File Dropper</Text>
            <Text style={styles.sectionCount}>{files.length} files</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => setActiveSection('announcements')}
          >
            <Ionicons name="megaphone" size={40} color="#FF2D55" />
            <Text style={styles.sectionTitle}>Announcements</Text>
            <Text style={styles.sectionCount}>{announcements.length} items</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => setActiveSection('versions')}
          >
            <Ionicons name="play-circle" size={40} color="#FF3B30" />
            <Text style={styles.sectionTitle}>Version Dropper</Text>
            <Text style={styles.sectionCount}>{versions.length} videos</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <TouchableOpacity onPress={() => setActiveSection(null)}>
          <Ionicons name="arrow-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.sectionHeaderTitle}>
          {activeSection === 'lineup' && 'Lineup Posted'}
          {activeSection === 'conversation' && 'Conversation'}
          {activeSection === 'files' && 'File Dropper'}
          {activeSection === 'announcements' && 'Important Announcements'}
          {activeSection === 'versions' && 'Version Dropper'}
        </Text>
        <TouchableOpacity onPress={handleAddNew}>
          <Ionicons name="add" size={28} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {renderSectionContent()}
      {renderForm()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  sectionGrid: {
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sectionCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    color: '#000',
    textAlign: 'center',
  },
  sectionCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 20,
  },
  addButton: {
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 8,
  },
  itemsContainer: {
    padding: 12,
  },
  itemCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  itemContent: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  itemUrl: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  addMoreButton: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  addMoreText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  formContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  formScroll: {
    padding: 16,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    color: '#000',
  },
  textArea: {
    textAlignVertical: 'top',
    paddingTop: 12,
    minHeight: 100,
  },
})
