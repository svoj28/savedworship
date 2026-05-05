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
StatusBar,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
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
import { useRole } from '../lib/useRole'
import { notifyNewUpload } from '../lib/notifications'


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
  { key: 'conversation',  label: 'Important Messages',   icon: 'chatbubbles-outline', countKey: undefined,       countLabel: 'Messages needed to be pinned'   },
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

export default function ManagementScreen() {
  const [activeSection, setActiveSection] = useState<Section>(null)
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const { canManageContent } = useRole()

    const [lineups, setLineups] = useState<Lineup[]>([])
  const [files, setFiles] = useState<FileDropper[]>([])
  const [announcements, setAnnouncements] = useState<ImportantAnnouncement[]>([])
  const [versions, setVersions] = useState<VersionDropper[]>([])

    const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<FormData>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pickingFile, setPickingFile] = useState(false)

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

  const handleSubmit = async () => {
    if (!formData.title?.trim()) {       Alert.alert('Error', 'Please enter a title');       return }
    try {
      const now = Date.now()
      if (activeSection === 'lineup') {
        if (editingId)           await updateLineup(editingId, {             title: formData.title,             description: formData.description,             updatedAt: now           })
        else {           await createLineup({             title: formData.title,             description: formData.description,             userId,             createdAt: now,             updatedAt: now,             synced: false });           await notifyNewUpload(userId, formData.title)         }
      } else if (activeSection === 'files') {
        if (!formData.fileUrl?.trim()) {           Alert.alert('Error', 'Please enter a file URL');           return         }
        if (editingId)           await updateFileDropper(editingId, {             title: formData.title,             description: formData.description,             fileUrl: formData.fileUrl,             updatedAt: now           })
        else {           await createFileDropper({             title: formData.title,             description: formData.description,             fileUrl: formData.fileUrl,             userId,             createdAt: now,             updatedAt: now,             synced: false });           await notifyNewUpload(userId, formData.title)         }
      } else if (activeSection === 'announcements') {
        if (!formData.content?.trim()) {           Alert.alert('Error', 'Please enter announcement content');           return         }
        if (editingId)           await updateAnnouncement(editingId, {             title: formData.title,             content: formData.content,             updatedAt: now           })
        else {           await createImportantAnnouncement({             title: formData.title,             content: formData.content,             userId,             createdAt: now,             updatedAt: now,             synced: false });           await notifyNewUpload(userId, formData.title)         }
      } else if (activeSection === 'versions') {
        if (!formData.youtubeUrl?.trim()) {           Alert.alert('Error', 'Please enter a YouTube URL');           return         }
        if (editingId)           await updateVersionDropper(editingId, {             title: formData.title,             description: formData.description,             youtubeUrl: formData.youtubeUrl,             updatedAt: now           })
        else {           await createVersionDropper({             title: formData.title,             description: formData.description,             youtubeUrl: formData.youtubeUrl,             userId,             createdAt: now,             updatedAt: now,             synced: false });           await notifyNewUpload(userId, formData.title)         }
      }
      setShowForm(false);       setFormData({});       await loadData(userId)
    } catch (err) {       Alert.alert('Error', 'Failed to save item')     }
  }

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Item', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            if (activeSection === 'lineup') await deleteLineup(id)
            else if (activeSection === 'files') await deleteFileDropper(id)
            else if (activeSection === 'announcements') await deleteAnnouncement(id)
            else if (activeSection === 'versions') await deleteVersionDropper(id)
            await loadData(userId)
          } catch (err) {             Alert.alert('Error', 'Failed to delete item')           }
        },
      },
    ])
  }

  // ─── DASHBOARD ───
  if (!activeSection) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.dashboardContent}>
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
        {canManageContent ? (
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
            {canManageContent ? 'Tap + to add your first item' : 'No items have been added'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.itemsContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.itemsSectionLabel}>
            {items.length} {items.length === 1 ? 'ITEM' : 'ITEMS'}
          </Text>

          {items.map((item, idx) => (
          <View key={item.id} style={styles.itemCard}>
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
              </View>
            {canManageContent && (
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.itemActionBtn} onPress={() => handleEdit(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="pencil-outline" size={15} color="#0A0A0A" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.itemActionBtn, styles.itemActionBtnDestructive]} onPress={() => handleDelete(item.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="trash-outline" size={15} color="#C0C0C0" />
              </TouchableOpacity>
            </View>
            )}
          </View>
        ))}

         {canManageContent && (
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
              <TouchableOpacity onPress={handleSubmit} style={styles.modalSaveBtn}>
                <Text style={styles.modalSave}>Save</Text>
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

              {activeSection === 'announcements' && (
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
        </View>
  )
}

const styles = StyleSheet.create({
  container: {     flex: 1,     backgroundColor: '#FAFAFA' },

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
})