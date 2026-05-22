import React, { useEffect, useState, useCallback } from 'react'
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
  StatusBar,
  Linking,
  RefreshControl,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import {
  getAllLineups,
  getAllFileDroppers,
  getAllAnnouncements,
  getAllVersionDroppers,
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
import YoutubePlayer from 'react-native-youtube-iframe'
import { Lineup, FileDropper, ImportantAnnouncement, VersionDropper } from '../db/models'
import { useRole } from '../lib/useRole'
import { notifyManagementChangeToAllUsers } from '../lib/notifications'
import { onTableChange } from '../lib/sync'
import { supabase } from '../lib/supabase'
import { useNotifications } from '../lib/NotificationContext'
import { usePullToRefresh } from '../lib/usePullToRefresh'


type Section = 'lineup' | 'conversation' | 'files' | 'announcements' | 'versions' | null

interface FormData {
  title?: string
  description?: string
  content?: string
  youtubeUrl?: string
  fileUrl?: string
  fileName?: string
}

interface SectionConfig {
  key: Exclude<Section, null>
  label: string
  icon: any
  countKey?: string
  countLabel: string
}

const SECTIONS: SectionConfig[] = [
  { key: 'lineup',        label: 'Lineup',         icon: 'list-outline',        countKey: 'lineups',       countLabel: 'items'   },
  { key: 'conversation',  label: 'Important Messages',   icon: 'chatbubbles-outline', countKey: 'announcements', countLabel: 'messages'   },
  { key: 'files',         label: 'Files',          icon: 'folder-outline',      countKey: 'files',         countLabel: 'files'   },
  { key: 'announcements', label: 'Announcements',  icon: 'megaphone-outline',   countKey: 'announcements', countLabel: 'items'   },
  { key: 'versions',      label: 'Versions',       icon: 'play-circle-outline', countKey: 'versions',      countLabel: 'videos'  },
]

const SECTION_TITLES: Record<Exclude<Section, null>, string> = {
  lineup:        'Lineup Posted',
  conversation:  'Important Messages',
  files:         'File Dropper',
  announcements: 'Announcements',
  versions:      'Version Dropper',
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export default function ManagementScreen({ route }: any) {
  const [activeSection, setActiveSection] = useState<Section>(null)
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { isAdmin } = useRole()
  const { notifications } = useNotifications()
  const lastManagementNotificationIdRef = React.useRef<string | null>(null)

    const [lineups, setLineups] = useState<Lineup[]>([])
  const [files, setFiles] = useState<FileDropper[]>([])
  const [announcements, setAnnouncements] = useState<ImportantAnnouncement[]>([])
  const [versions, setVersions] = useState<VersionDropper[]>([])

    const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pickingFile, setPickingFile] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any | null>(null)

  const normalizeManagementRow = (tableName: string, row: any) => {
    if (tableName === 'lineups') {
      return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
      }
    }
    if (tableName === 'file_droppers') {
      return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        fileUrl: row.file_url || '',
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
      }
    }
    if (tableName === 'important_announcements') {
      return {
        id: row.id,
        title: row.title,
        content: row.content || '',
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
      }
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      youtubeUrl: row.youtube_url || '',
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      synced: Boolean(row._synced),
    }
  }

  const sortByNewest = (left: any, right: any) => (right.createdAt || 0) - (left.createdAt || 0)

  const applyRealtimeManagementChange = (tableName: string, payload: any) => {
    const eventType = payload?.eventType
    const row = payload?.new ?? payload?.old
    if (!row) return

    const normalized = normalizeManagementRow(tableName, row)

    const applyUpsert = (setter: React.Dispatch<React.SetStateAction<any[]>>) => {
      setter(prev => {
        const withoutCurrent = prev.filter(item => item.id !== normalized.id)
        if (eventType === 'DELETE') return withoutCurrent
        return [...withoutCurrent, normalized].sort(sortByNewest)
      })
    }

    if (tableName === 'lineups') applyUpsert(setLineups)
    if (tableName === 'file_droppers') applyUpsert(setFiles)
    if (tableName === 'important_announcements') applyUpsert(setAnnouncements)
    if (tableName === 'version_droppers') applyUpsert(setVersions)

    setSelectedItem(prev => (prev?.id === normalized.id ? (eventType === 'DELETE' ? null : normalized) : prev))
  }

  const refreshData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true)
    try {
      const [lineupData, fileData, announcementData, versionData] = await Promise.all([
        getAllLineups(),
        getAllFileDroppers(),
        getAllAnnouncements(),
        getAllVersionDroppers(),
      ])
      setLineups(lineupData)
      setFiles(fileData)
      setAnnouncements(announcementData)
      setVersions(versionData)
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      if (!options.silent) setLoading(false)
    }
  }, [])

  const { refreshing, onRefresh } = usePullToRefresh(() => refreshData({ silent: true }))

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
      }
    }
    loadUser()
    void refreshData()
  }, [])

  useEffect(() => {
    const latestManagementNotification = [...notifications]
      .find(notification => {
        if (notification.type !== 'management_broadcast') return false
        if (!userId) return true
        return notification.data?.actorUserId !== userId
      })

    if (!latestManagementNotification) return
    if (lastManagementNotificationIdRef.current === latestManagementNotification.id) return

    lastManagementNotificationIdRef.current = latestManagementNotification.id
    void refreshData({ silent: true })
  }, [notifications, refreshData])

  useEffect(() => {
    const initialSection = route?.params?.initialSection as Section | undefined
    if (initialSection) {
      setActiveSection(initialSection)
    }
  }, [route?.params?.initialSection])

  useEffect(() => {
    const unsubLineups = onTableChange('lineups', () => void refreshData({ silent: true }))
    const unsubFiles = onTableChange('file_droppers', () => void refreshData({ silent: true }))
    const unsubAnnouncements = onTableChange('important_announcements', () => void refreshData({ silent: true }))
    const unsubVersions = onTableChange('version_droppers', () => void refreshData({ silent: true }))

    const lineupsChannel = supabase
      .channel('management-lineups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineups' }, payload => {
        applyRealtimeManagementChange('lineups', payload)
      })
      .subscribe()

    const filesChannel = supabase
      .channel('management-files')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'file_droppers' }, payload => {
        applyRealtimeManagementChange('file_droppers', payload)
      })
      .subscribe()

    const announcementsChannel = supabase
      .channel('management-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'important_announcements' }, payload => {
        applyRealtimeManagementChange('important_announcements', payload)
      })
      .subscribe()

    const versionsChannel = supabase
      .channel('management-versions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'version_droppers' }, payload => {
        applyRealtimeManagementChange('version_droppers', payload)
      })
      .subscribe()

    return () => {
      unsubLineups()
      unsubFiles()
      unsubAnnouncements()
      unsubVersions()
      supabase.removeChannel(lineupsChannel)
      supabase.removeChannel(filesChannel)
      supabase.removeChannel(announcementsChannel)
      supabase.removeChannel(versionsChannel)
    }
  }, [refreshData])

const getCount = (key?: string): number => {
    if (!key) return 0
    const map: Record<string, number> = {
      lineups: lineups.length,
      files: files.length,
      announcements: announcements.length,
      versions: versions.length,
    }
    return map[key] ?? 0
  }

  const getItems = (): any[] => {
    if (activeSection === 'lineup') return lineups
    if (activeSection === 'files') return files
    if (activeSection === 'conversation') return announcements
    if (activeSection === 'announcements') return announcements
    if (activeSection === 'versions') return versions
    return []
  }

  const handleAddNew = () => {     setEditingId(null);     setFormData({});     setShowForm(true)   }

  const handleEdit = (item: any) => {
    setEditingId(item.id)
    setFormData({
      title: item.title,
      description: item.description || '',
      content: item.content || '',
      youtubeUrl: item.youtubeUrl || '',
      fileUrl: item.fileUrl || '',
      fileName: item.fileName || '',
    })
    setShowForm(true)
  }

  const handleOpenItem = (item: any) => {
    setSelectedItem(item)
  }

  const handlePickFile = async () => {
    try {
      setPickingFile(true)
      const result = await DocumentPicker.getDocumentAsync({         type: '*/*'       })
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0]
        setFormData(prev => ({           ...prev,           fileUrl: asset.uri,           fileName: asset.name         }))
      }
    } catch (err) {
            Alert.alert('Error', 'Failed to pick file')
    } finally {
      setPickingFile(false)
    }
  }

  const handleSaveConfirm = () => {
    if (!isAdmin) {
      Alert.alert('Access denied', 'Only admins can add or edit management items.')
      return
    }
    if (saving || deletingId) return

    const actionLabel = editingId ? 'Save changes' : 'Add item'
    Alert.alert(
      actionLabel,
      editingId
        ? `Save your changes to "${formData.title?.trim() || 'this item'}"?`
        : `Add "${formData.title?.trim() || 'this item'}" to ${sectionTitle.toLowerCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: actionLabel, onPress: handleSubmit },
      ]
    )
  }

  const upsertLocalItem = (item: any) => {
    if (activeSection === 'lineup') {
      setLineups(prev => editingId ? prev.map(existing => existing.id === editingId ? { ...existing, ...item } : existing) : [item, ...prev])
      return
    }
    if (activeSection === 'files') {
      setFiles(prev => editingId ? prev.map(existing => existing.id === editingId ? { ...existing, ...item } : existing) : [item, ...prev])
      return
    }
    if (activeSection === 'conversation' || activeSection === 'announcements') {
      setAnnouncements(prev => editingId ? prev.map(existing => existing.id === editingId ? { ...existing, ...item } : existing) : [item, ...prev])
      return
    }
    if (activeSection === 'versions') {
      setVersions(prev => editingId ? prev.map(existing => existing.id === editingId ? { ...existing, ...item } : existing) : [item, ...prev])
    }
  }

  const removeLocalItem = (itemId: string) => {
    if (activeSection === 'lineup') {
      setLineups(prev => prev.filter(item => item.id !== itemId))
      return
    }
    if (activeSection === 'files') {
      setFiles(prev => prev.filter(item => item.id !== itemId))
      return
    }
    if (activeSection === 'conversation' || activeSection === 'announcements') {
      setAnnouncements(prev => prev.filter(item => item.id !== itemId))
      return
    }
    if (activeSection === 'versions') {
      setVersions(prev => prev.filter(item => item.id !== itemId))
    }
  }

  const handleSubmit = async () => {
    if (!isAdmin) {
      Alert.alert('Access denied', 'Only admins can add or edit management items.')
      return
    }
    if (saving || deletingId) return
    if (!formData.title?.trim()) {       Alert.alert('Error', 'Please enter a title');       return }
    setSaving(true)
    try {
      const now = Date.now()
      if (activeSection === 'lineup') {
        if (editingId) {
          await updateLineup(editingId, {
            title: formData.title,
            description: formData.description,
            updatedAt: now,
          })
          upsertLocalItem({
            id: editingId,
            title: formData.title,
            description: formData.description,
            userId,
            updatedAt: now,
          })
          void notifyManagementChangeToAllUsers(userId, 'updated', 'Lineup', formData.title)
        } else {
          const created = await createLineup({
            title: formData.title,
            description: formData.description,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
          upsertLocalItem(created)
          void notifyManagementChangeToAllUsers(userId, 'created', 'Lineup', formData.title)
        }
      } else if (activeSection === 'files') {
        if (!formData.fileUrl?.trim()) {           Alert.alert('Error', 'Please enter a file URL');           return         }
        if (editingId) {
          await updateFileDropper(editingId, {
            title: formData.title,
            description: formData.description,
            fileUrl: formData.fileUrl,
            updatedAt: now,
          })
          upsertLocalItem({
            id: editingId,
            title: formData.title,
            description: formData.description,
            fileUrl: formData.fileUrl,
            userId,
            updatedAt: now,
          })
          void notifyManagementChangeToAllUsers(userId, 'updated', 'File', formData.title)
        } else {
          const created = await createFileDropper({
            title: formData.title,
            description: formData.description,
            fileUrl: formData.fileUrl,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
          upsertLocalItem(created)
          void notifyManagementChangeToAllUsers(userId, 'created', 'File', formData.title)
        }
      } else if (activeSection === 'conversation' || activeSection === 'announcements') {
        if (!formData.content?.trim()) {           Alert.alert('Error', 'Please enter announcement content');           return         }
        if (editingId) {
          await updateAnnouncement(editingId, {
            title: formData.title,
            content: formData.content,
            updatedAt: now,
          })
          upsertLocalItem({
            id: editingId,
            title: formData.title,
            content: formData.content,
            userId,
            updatedAt: now,
          })
          void notifyManagementChangeToAllUsers(userId, 'updated', 'Important Message', formData.title)
        } else {
          const created = await createImportantAnnouncement({
            title: formData.title,
            content: formData.content,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
          upsertLocalItem(created)
          void notifyManagementChangeToAllUsers(userId, 'created', 'Important Message', formData.title)
        }
      } else if (activeSection === 'versions') {
        if (!formData.youtubeUrl?.trim()) {           Alert.alert('Error', 'Please enter a YouTube URL');           return         }
        if (editingId) {
          await updateVersionDropper(editingId, {
            title: formData.title,
            description: formData.description,
            youtubeUrl: formData.youtubeUrl,
            updatedAt: now,
          })
          upsertLocalItem({
            id: editingId,
            title: formData.title,
            description: formData.description,
            youtubeUrl: formData.youtubeUrl,
            userId,
            updatedAt: now,
          })
          void notifyManagementChangeToAllUsers(userId, 'updated', 'Version', formData.title)
        } else {
          const created = await createVersionDropper({
            title: formData.title,
            description: formData.description,
            youtubeUrl: formData.youtubeUrl,
            userId,
            createdAt: now,
            updatedAt: now,
            synced: false,
          })
          upsertLocalItem(created)
          void notifyManagementChangeToAllUsers(userId, 'created', 'Version', formData.title)
        }
      }
      setShowForm(false)
      setFormData({})
    } catch (err) {       Alert.alert('Error', 'Failed to save item')     }
    finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: any) => {
    if (!isAdmin) {
      Alert.alert('Access denied', 'Only admins can delete management items.')
      return
    }
    if (saving || deletingId) return
    Alert.alert('Delete Item', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeletingId(item.id)
          try {
            if (activeSection === 'lineup') await deleteLineup(item.id)
            else if (activeSection === 'files') await deleteFileDropper(item.id)
            else if (activeSection === 'conversation' || activeSection === 'announcements') await deleteAnnouncement(item.id)
            else if (activeSection === 'versions') await deleteVersionDropper(item.id)
            removeLocalItem(item.id)
            void notifyManagementChangeToAllUsers(userId, 'deleted', sectionTitle, item.title)
          } catch (err) {             Alert.alert('Error', 'Failed to delete item')           }
          finally {
            setDeletingId(null)
          }
        },
      },
    ])
  }

  // ─── DASHBOARD ───
  if (!activeSection) {
      return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.dashboardContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
          <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />

        <View style={styles.dashHeader}>
          <Text style={styles.dashEyebrow}>ADMIN</Text>
          <Text style={styles.dashTitle}>Management</Text>
        </View>
      
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0A0A0A" />
          </View>
        ) : (
          <View style={styles.sectionGrid}>
            {SECTIONS.map((section) => {
              const count = getCount(section.countKey)
              return (
                <TouchableOpacity
                  key={section.key}
                  style={styles.sectionCard}
                  onPress={() => setActiveSection(section.key)}
                  activeOpacity={0.72}
                >
                  <View style={styles.sectionCardIcon}>
                    <Ionicons name={section.icon} size={20} color="#0A0A0A" />
                  </View>
                  <View style={styles.sectionCardMeta}>
                    <Text style={styles.sectionCardLabel}>{section.label}</Text>
                    <Text style={styles.sectionCardCount}>
                      {section.countKey ? `${count} ${section.countLabel}` : section.countLabel}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#D0D0D0" />
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </ScrollView>
    )
  }

  // ─── SECTION DETAIL ───
  const items = getItems()
  const sectionTitle = SECTION_TITLES[activeSection]
  const sectionIcon = SECTIONS.find(s => s.key === activeSection)?.icon ?? 'cube-outline'

      return (
<View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      <View style={styles.sectionHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setActiveSection(null)} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color="#0A0A0A" />
        </TouchableOpacity>
        <View style={styles.sectionHeaderMeta}>
          <Text style={styles.sectionHeaderEyebrow}>MANAGEMENT</Text>
          <Text style={styles.sectionHeaderTitle}>{sectionTitle}</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity style={styles.addBtn} onPress={handleAddNew} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color="#FAFAFA" />
          </TouchableOpacity>
        ) : <View style={{ width: 34 }} />}
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#0A0A0A" />
                    </View>
      ) : items.length === 0 ? (
        <View style={styles.centerContent}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name={sectionIcon} size={28} color="#B0B0B0" />
          </View>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            {isAdmin ? 'Tap + to add your first item' : 'No items have been added'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.itemsContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.itemsSectionLabel}>
            {items.length} {items.length === 1 ? 'ITEM' : 'ITEMS'}
          </Text>

          {items.map((item, idx) => (
          <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => handleOpenItem(item)} activeOpacity={0.75}>
            <View style={styles.itemIndexWrap}>
                <Text style={styles.itemIndex}>{idx + 1}</Text>
              </View>
              <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.description ? <Text style={styles.itemMeta} numberOfLines={2}>{item.description}</Text> : null}
              {item.content ? <Text style={styles.itemMeta} numberOfLines={2}>{item.content}</Text> : null}
              {item.youtubeUrl ? (
                  <View style={styles.itemUrlRow}>
                    <Ionicons name="logo-youtube" size={11} color="#ADADAD" />
<Text style={styles.itemUrl} numberOfLines={1}>{item.youtubeUrl}</Text>
            </View>
) : null}
                {item.fileUrl ? (
                  <View style={styles.itemUrlRow}>
                    <Ionicons name="attach-outline" size={11} color="#ADADAD" />
                    <Text style={styles.itemUrl} numberOfLines={1}>{item.fileUrl}</Text>
                  </View>
                ) : null}
                <Text style={styles.itemViewMore}>Tap to view full content</Text>
              </View>
            {isAdmin && (
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.itemActionBtn} onPress={() => handleEdit(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="pencil-outline" size={15} color="#0A0A0A" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.itemActionBtn, styles.itemActionBtnDestructive]} onPress={() => handleDelete(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="trash-outline" size={15} color="#C0C0C0" />
              </TouchableOpacity>
            </View>
            )}
          </TouchableOpacity>
        ))}

         {isAdmin && (
        <TouchableOpacity style={styles.addMoreBtn} onPress={handleAddNew} activeOpacity={0.7}>
          <Ionicons name="add" size={17} color="#0A0A0A" />
          <Text style={styles.addMoreText}>Add Another</Text>
        </TouchableOpacity>
        )}
      <View style={{ height: 40 }} />
        </ScrollView>
    )  }

  {/* ─── FORM MODAL ─── */}
      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Item' : `Add ${sectionTitle}`}
              </Text>
              <TouchableOpacity onPress={handleSaveConfirm} style={[styles.modalSaveBtn, (saving || !!deletingId) && styles.modalSaveBtnDisabled]} disabled={saving || !!deletingId}>
                {saving ? <ActivityIndicator size="small" color="#FAFAFA" /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
<Text style={styles.fieldLabel}>TITLE</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter title…"
                placeholderTextColor="#C4C4C4"
                value={formData.title || ''}
                onChangeText={(text) => setFormData({ ...formData, title: text })}
                              />

              {(activeSection === 'conversation' || activeSection === 'announcements') && (
<>
                  <Text style={[styles.fieldLabel, { marginTop: 20 }]}>CONTENT</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Write your announcement…"
                    placeholderTextColor="#C4C4C4"
                  value={formData.content || ''}
                  onChangeText={(text) => setFormData({ ...formData, content: text })}
                  multiline                   numberOfLines={5} textAlignVertical="top"
                />
</>
              )}

              {activeSection === 'files' && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 20 }]}>FILE</Text>
                    <TouchableOpacity                       style={styles.filePickerBtn}                       onPress={handlePickFile}                       disabled={pickingFile} activeOpacity={0.8}>
                    {pickingFile
                      ? <ActivityIndicator size="small" color="#FAFAFA" />
                      :                       <Ionicons name="folder-open-outline" size={16} color="#FAFAFA" />
}
                      <Text style={styles.filePickerBtnText}>                        {pickingFile ? 'Picking file…' : 'Pick from Device'}                      </Text>
                    </TouchableOpacity>
                  
                  {formData.fileName ? (
                    <View style={styles.selectedFile}>
                      <Ionicons name="document-outline" size={16} color="#555" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.selectedFileName}>{formData.fileName}</Text>
                        {formData.fileUrl &&                           <Text style={styles.selectedFileUrl} numberOfLines={1}>                            {formData.fileUrl}                          </Text>}
                      </View>
                      <TouchableOpacity onPress={() => setFormData({ ...formData, fileUrl: '', fileName: '' })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color="#C0C0C0" />
                      </TouchableOpacity>
                    </View>
                  ) : null}

<Text style={styles.orDivider}>— or enter URL manually —</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="https://…"
                    placeholderTextColor="#C4C4C4"
                    value={formData.fileUrl || ''}
                    onChangeText={(text) => setFormData({ ...formData, fileUrl: text })}
                    autoCapitalize="none" keyboardType="url"
                  />
                </>
              )}

              {activeSection === 'versions' && (
<>
                  <Text style={[styles.fieldLabel, { marginTop: 20 }]}>YOUTUBE URL</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="https://youtube.com/…"
                    placeholderTextColor="#C4C4C4"
                  value={formData.youtubeUrl || ''}
                  onChangeText={(text) => setFormData({ ...formData, youtubeUrl: text })}
                  autoCapitalize="none" keyboardType="url"
                />
</>
              )}

              {(activeSection === 'lineup' || activeSection === 'files' || activeSection === 'versions') && (
<>
                  <Text style={[styles.fieldLabel, { marginTop: 20 }]}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Optional description…"
                    placeholderTextColor="#C4C4C4"
                  value={formData.description || ''}
                  onChangeText={(text) => setFormData({ ...formData, description: text })}
                  multiline                   numberOfLines={4} textAlignVertical="top"
                />
</>
              )}
<View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {(loading || saving || deletingId) && (
        <View style={styles.busyOverlay} pointerEvents="auto">
          <View style={styles.busyCard}>
            <ActivityIndicator size="large" color="#0A0A0A" />
            {/* <Text style={styles.busyTitle}>{saving ? 'Saving changes…' : 'Deleting item…'}</Text>
            <Text style={styles.busySubtitle}>Please wait until the operation finishes.</Text> */}
          </View>
        </View>
      )}

      <Modal visible={selectedItem !== null} transparent animationType="fade" onRequestClose={() => setSelectedItem(null)}>
        <View style={styles.detailOverlay}>
          <TouchableOpacity style={styles.detailBackdrop} activeOpacity={1} onPress={() => setSelectedItem(null)} />
          <View style={styles.detailSheet}>
            <View style={styles.detailHandle} />
            <View style={styles.detailHead}>
              <View style={styles.detailHeadTextWrap}>
                <Text style={styles.detailEyebrow}>{sectionTitle}</Text>
                <Text style={styles.detailTitle}>{selectedItem?.title || 'Item'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedItem(null)} style={styles.detailCloseBtn}>
                <Ionicons name="close" size={20} color="#0A0A0A" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailBody} contentContainerStyle={styles.detailBodyContent} showsVerticalScrollIndicator={false}>
              {selectedItem?.description ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>DESCRIPTION</Text>
                  <Text style={styles.detailText}>{selectedItem.description}</Text>
                </View>
              ) : null}

              {selectedItem?.content ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>CONTENT</Text>
                  <Text style={styles.detailText}>{selectedItem.content}</Text>
                </View>
              ) : null}

              {selectedItem?.youtubeUrl ? (
  <View style={styles.detailBlock}>
    <Text style={styles.detailLabel}>VIDEO</Text>
    {(() => {
      const videoId = extractYouTubeId(selectedItem.youtubeUrl)
      return videoId ? (
        <View style={styles.detailYoutubeWrap}>
          <YoutubePlayer height={180} videoId={videoId} play={false} />
          <TouchableOpacity
            style={styles.detailOpenYoutubeBtn}
            onPress={() => {
              const url = /^https?:\/\//i.test(selectedItem.youtubeUrl)
                ? selectedItem.youtubeUrl
                : `https://${selectedItem.youtubeUrl}`
              Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open YouTube'))
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-youtube" size={14} color="#FF0000" />
            <Text style={styles.detailOpenYoutubeBtnText}>Open in YouTube</Text>
            <Ionicons name="open-outline" size={13} color="#888" />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.detailMonoText}>{selectedItem.youtubeUrl}</Text>
      )
    })()}
  </View>
) : null}

              {selectedItem?.fileUrl ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>FILE URL</Text>
                  <Text style={styles.detailMonoText}>{selectedItem.fileUrl}</Text>
                </View>
              ) : null}

              {selectedItem?.fileName ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>FILE NAME</Text>
                  <Text style={styles.detailText}>{selectedItem.fileName}</Text>
                </View>
              ) : null}
            </ScrollView>

            {isAdmin && selectedItem && (
              <View style={styles.detailActions}>
                <TouchableOpacity style={[styles.detailActionBtn, styles.detailActionBtnSecondary]} onPress={() => { const item = selectedItem; setSelectedItem(null); handleEdit(item) }}>
                  <Ionicons name="pencil-outline" size={16} color="#0A0A0A" />
                  <Text style={styles.detailActionBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.detailActionBtn, styles.detailActionBtnDestructive]} onPress={() => { const item = selectedItem; setSelectedItem(null); handleDelete(item) }}>
                  <Ionicons name="trash-outline" size={16} color="#FFF" />
                  <Text style={styles.detailActionBtnTextDestructive}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
        </View>
  )
}

const styles = StyleSheet.create({
  container: {     flex: 1,     backgroundColor: '#FAFAFA' },

  detailYoutubeWrap: {
  borderRadius: 12,
  overflow: 'hidden',
  backgroundColor: '#000',
},
detailOpenYoutubeBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  paddingHorizontal: 14,
  paddingVertical: 10,
  backgroundColor: '#111',
},
detailOpenYoutubeBtnText: {
  flex: 1,
  fontSize: 13,
  fontWeight: '600',
  color: '#CCC',
},

  // Dashboard
  dashboardContent: { paddingBottom: 60   },
  dashHeader: {
        backgroundColor: '#FFF',
paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  dashEyebrow: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2, marginBottom: 2 },
  dashTitle: { fontSize: 28, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.8 },
  loadingWrap: { paddingTop: 80, alignItems: 'center' },

  // Section Grid — now a vertical list for consistency
  sectionGrid: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
  gap: 14,
    backgroundColor: '#FFF',
borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sectionCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
    },
  sectionCardMeta: { flex: 1, gap: 3 },
  sectionCardLabel: { fontSize: 15, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.2 },
  sectionCardCount: {     fontSize: 11,     color: '#ADADAD', fontWeight: '500'   },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
        backgroundColor: '#FFF',
paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    gap: 12,
  },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  sectionHeaderMeta: { flex: 1, gap: 2 },
  sectionHeaderEyebrow: { fontSize: 9, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2 },
  sectionHeaderTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.3 },
  addBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },

  // Center / Empty
  centerContent: { flex: 1,     justifyContent: 'center',     alignItems: 'center', gap: 8, paddingBottom: 80 },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', letterSpacing: -0.2 },
  emptySubtitle: { fontSize: 13, color: '#B0B0B0' },

  // Items
  itemsContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40 },
  itemsSectionLabel: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 1.8, marginBottom: 12 },
  itemCard: {
        flexDirection: 'row',
    alignItems: 'flex-start',
      backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
        paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 12,
  },
  itemIndexWrap: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center', marginTop: 1, flexShrink: 0 },
  itemIndex: { fontSize: 11, fontWeight: '800', color: '#ADADAD' },
  itemBody: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.1 },
  itemMeta: { fontSize: 12, color: '#ADADAD', lineHeight: 17 },
  itemViewMore: { marginTop: 4, fontSize: 11, color: '#8A8A8A', fontWeight: '600' },
  itemUrlRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  itemUrl: { fontSize: 11, color: '#ADADAD', flex: 1 },
  itemActions: { flexDirection: 'row', gap: 6, marginTop: 2, flexShrink: 0 },
  itemActionBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  itemActionBtnDestructive: { backgroundColor: '#F8F8F8' },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    paddingVertical: 14,
    marginTop: 4,
  },
  addMoreText: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%', paddingBottom: 36 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHead: {
    flexDirection: 'row',
justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.3 },
  modalCancel: { fontSize: 14, color: '#ADADAD', fontWeight: '500', minWidth: 54 },
  modalSaveBtn: { backgroundColor: '#0A0A0A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, minWidth: 54, alignItems: 'center' },
  modalSaveBtnDisabled: { opacity: 0.6 },
  modalSave: { fontSize: 13, fontWeight: '700', color: '#FAFAFA' },
  modalBody: { paddingHorizontal: 20, paddingTop: 20 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2, marginBottom: 9, textTransform: 'uppercase' },
  textInput: { backgroundColor: '#F7F7F7', borderRadius: 13, borderWidth: 1.5, borderColor: '#EBEBEB', paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, color: '#0A0A0A', fontWeight: '500' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  filePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0A0A0A', borderRadius: 13, paddingVertical: 14, marginBottom: 12 },
  filePickerBtnText: { fontSize: 14, fontWeight: '700', color: '#FAFAFA' },
  selectedFile: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F5F5', borderRadius: 12, borderWidth: 1, borderColor: '#EBEBEB', padding: 12, marginBottom: 12 },
  selectedFileName: { fontSize: 13, fontWeight: '600', color: '#0A0A0A' },
  selectedFileUrl: { fontSize: 11, color: '#ADADAD', marginTop: 2 },
  orDivider: { fontSize: 11, color: '#C8C8C8', textAlign: 'center', fontWeight: '500', letterSpacing: 0.5, marginVertical: 12 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  busyCard: {
    width: '78%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6E6E6',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  busyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    color: '#0A0A0A',
    textAlign: 'center',
  },
  busySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#7A7A7A',
    textAlign: 'center',
    lineHeight: 18,
  },
  detailOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  detailBackdrop: { ...StyleSheet.absoluteFillObject },
  detailSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%', paddingBottom: 18 },
  detailHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  detailHeadTextWrap: { flex: 1, paddingRight: 16 },
  detailEyebrow: { fontSize: 9, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.3 },
  detailCloseBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  detailBody: { maxHeight: 360 },
  detailBodyContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, gap: 14 },
  detailBlock: { gap: 6 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2, textTransform: 'uppercase' },
  detailText: { fontSize: 14, color: '#222', lineHeight: 21 },
  detailMonoText: { fontSize: 13, color: '#222', lineHeight: 20, fontFamily: 'monospace' },
  detailActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 },
  detailActionBtnSecondary: { backgroundColor: '#F2F2F2' },
  detailActionBtnDestructive: { backgroundColor: '#0A0A0A' },
  detailActionBtnText: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  detailActionBtnTextDestructive: { fontSize: 13, fontWeight: '700', color: '#FFF' },
})