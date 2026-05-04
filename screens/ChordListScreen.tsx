// screens/ChordListScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
StatusBar,
} from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Song, ChordList, Playlist, PlaylistItem } from '../db/models'
import { transposeText, transposeChord, getAllKeys, getTransposeDistance } from '../lib/transpose'
import { query, queryOne, execute, transaction } from '../db/index'
import { getPlaylistsByUserId, getPlaylistItems, updatePlaylistItemPosition } from '../db/queries'
import { getCurrentUser } from '../lib/auth'
import { useRole } from '../lib/useRole'

interface Props {
  route: any
  navigation: any
}

type ViewMode = 'lyrics' | 'chords' | 'both'
type BrowseMode = 'single' | 'artist' | 'playlist'

interface BrowseItem {
  id: string
  title: string
  type: 'song' | 'chord_list'
  chordListId?: string
  songId?: string
  position?: number
}

export default function ChordListScreen({ route, navigation }: Props) {
  const { chordListId } = route.params
  const [chordList, setChordList] = useState<any>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('both')
  const [transposeToKey, setTransposeToKey] = useState<string>('C')
  const [loading, setLoading] = useState(true)
  const [editingModalVisible, setEditingModalVisible] = useState(false)
  const [editingContent, setEditingContent] = useState('')
  const { canManageChords } = useRole()
  
    const [browseMode, setBrowseMode] = useState<BrowseMode>('single')
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [artistId, setArtistId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
const [showTransposePicker, setShowTransposePicker] = useState(false)

    useEffect(() => {
    navigation.setOptions({       headerLeft: () => null     })
  }, [navigation])

  useFocusEffect(
    React.useCallback(() => {
      loadChordList()
    }, [chordListId])
  )

  const loadChordList = async () => {
    try {
      setLoading(true)
            const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
                const userPlaylists = await getPlaylistsByUserId(user.id)
        setPlaylists(userPlaylists)
      }
      
            const listRow: any = await queryOne('SELECT * FROM chord_lists WHERE id = ?', [chordListId])
      if (listRow) {
        setChordList({
          id: listRow.id,
          title: listRow.title,
          artistId: listRow.artist_id,
          userId: listRow.user_id,
          isPrivate: Boolean(listRow.is_private),
          createdAt: listRow.created_at,
          updatedAt: listRow.updated_at,
          synced: Boolean(listRow._synced),
                  })
        setArtistId(listRow.artist_id)
      }

            const songRows: any[] = await query('SELECT * FROM songs WHERE chord_list_id = ? ORDER BY title', [chordListId])
            const mapped: Song[] = (songRows || []).map(row => ({
        id: row.id,
        chordListId: row.chord_list_id,
        title: row.title,
        content: row.content,
        key: row.key,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
        userId: row.user_id ?? '',
      }))
      setSongs(mapped)

            const initialItems: BrowseItem[] = mapped.map(song => ({
        id: song.id,
        title: song.title,
        type: 'song',
        songId: song.id,
        chordListId: song.chordListId,
      }))
      setBrowseItems(initialItems)

      if (mapped.length > 0) {
        setSelectedSongId(mapped[0].id)
        setCurrentItemIndex(0)
        setTransposeToKey(mapped[0].key || 'C')
      }
    } catch (err) {
      console.error('Error loading chord list:', err)
      Alert.alert('Error', 'Failed to load chord list')
    } finally {
      setLoading(false)
    }
  }

  const loadArtistSongs = async () => {
    if (!artistId) return
    try {
      const songRows: any[] = await query(
        `SELECT s.* FROM songs s
         JOIN chord_lists cl ON s.chord_list_id = cl.id
         WHERE cl.artist_id = ? AND cl.is_private = 0
         ORDER BY s.title`,
        [artistId]
      )
            const mapped: Song[] = (songRows || []).map(row => ({
        id: row.id,
        chordListId: row.chord_list_id,
        title: row.title,
        content: row.content,
        key: row.key,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
        userId: row.user_id ?? '',
      }))

      const items: BrowseItem[] = mapped.map(song => ({
        id: song.id,
        title: song.title,
        type: 'song',
        songId: song.id,
        chordListId: song.chordListId,
      }))

      setBrowseItems(items)
      if (items.length > 0) {
        setCurrentItemIndex(0)
        setSelectedSongId(items[0].id)
      }
    } catch (err) {
            Alert.alert('Error', 'Failed to load artist songs')
    }
  }

  const loadPlaylistSongs = async (playlistId: string) => {
    try {
      const playlistItems = await getPlaylistItems(playlistId)
            const items: BrowseItem[] = playlistItems.map((item, idx) => ({
        id: item.id,
        title: item.songId
? `Song ${item.songId.substring(0, 8)}`
: `Chord List ${item.chordListId?.substring(0, 8)}`,
        type: item.songId ? 'song' : 'chord_list',
        songId: item.songId,
        chordListId: item.chordListId,
        position: item.position,
      }))

      setBrowseItems(items)
      setSelectedPlaylistId(playlistId)
      if (items.length > 0) {
        setCurrentItemIndex(0)
        if (items[0].songId)           setSelectedSongId(items[0].songId)
              }
      setShowPlaylistModal(false)
    } catch (err) {
            Alert.alert('Error', 'Failed to load playlist')
    }
  }

  const handleBrowseModeChange = (mode: BrowseMode) => {
    setBrowseMode(mode)
        if (mode === 'single') {
      const initialItems: BrowseItem[] = songs.map(song => ({
        id: song.id,
        title: song.title,
        type: 'song',
        songId: song.id,
        chordListId: song.chordListId,
      }))
      setBrowseItems(initialItems)
      if (initialItems.length > 0) {
        setCurrentItemIndex(0)
        setSelectedSongId(initialItems[0].id)
      }
    } else if (mode === 'artist') {
      loadArtistSongs()
    } else {
      setShowPlaylistModal(true)
    }
  }

  const handlePreviousItem = () => {
    if (currentItemIndex > 0) {
      const newIndex = currentItemIndex - 1
      setCurrentItemIndex(newIndex)
      if (browseItems[newIndex].songId)         setSelectedSongId(browseItems[newIndex].songId!)
          }
  }

  const handleNextItem = () => {
    if (currentItemIndex < browseItems.length - 1) {
      const newIndex = currentItemIndex + 1
      setCurrentItemIndex(newIndex)
      if (browseItems[newIndex].songId)         setSelectedSongId(browseItems[newIndex].songId!)
          }
  }

  const handleMoveUp = async () => {
    if (currentItemIndex === 0 || !selectedPlaylistId) return
        try {
      const currentItem = browseItems[currentItemIndex]
      const previousItem = browseItems[currentItemIndex - 1]
            const tempPosition = currentItem.position || currentItemIndex
      await updatePlaylistItemPosition(currentItem.id, previousItem.position || currentItemIndex - 1)
      await updatePlaylistItemPosition(previousItem.id, tempPosition)
            await loadPlaylistSongs(selectedPlaylistId)
      setCurrentItemIndex(currentItemIndex - 1)
    } catch (err) {
            Alert.alert('Error', 'Failed to reorder items')
    }
  }

  const handleMoveDown = async () => {
    if (currentItemIndex >= browseItems.length - 1 || !selectedPlaylistId) return
        try {
      const currentItem = browseItems[currentItemIndex]
      const nextItem = browseItems[currentItemIndex + 1]
            const tempPosition = currentItem.position || currentItemIndex
      await updatePlaylistItemPosition(currentItem.id, nextItem.position || currentItemIndex + 1)
      await updatePlaylistItemPosition(nextItem.id, tempPosition)
            await loadPlaylistSongs(selectedPlaylistId)
      setCurrentItemIndex(currentItemIndex + 1)
    } catch (err) {
            Alert.alert('Error', 'Failed to reorder items')
    }
  }

  const selectedSong = songs.find((s) => s.id === selectedSongId)
  const currentBrowseItem = browseItems[currentItemIndex]

    const getDisplayContent = () => {
    if (!selectedSong) return ''
    let content = selectedSong.content
    const originalKey = selectedSong.key || 'C'
        const semitones = getTransposeDistance(originalKey, transposeToKey)
        if (semitones !== 0)       content = transposeText(content, semitones)
    
    if (viewMode === 'lyrics') {
      return content.replace(/\[([^\]]+)\]/g, '').trim()
    } else if (viewMode === 'chords') {
      const chords: string[] = []
      const chordMatches = content.matchAll(/\[([^\]]+)\]/g)
      for (const match of chordMatches)         chords.push(match[1])
            return `Chords used:\n${chords.join('  ·  ')}`
    } else {
      return content
    }
  }

  const handleEditSong = () => {
    if (!selectedSong) return
    setEditingContent(selectedSong.content)
    setEditingModalVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedSong) return
    try {
      await execute(        'UPDATE songs SET content = ?, updated_at = ? WHERE id = ?',         [editingContent, Date.now(), selectedSong.id]      )
      setEditingModalVisible(false)
      loadChordList()
    } catch (err) {
      Alert.alert('Error', 'Failed to save song')
    }
  }

  const handleDeleteSong = async () => {
    if (!selectedSong) return
    Alert.alert('Delete Song', 'Are you sure you want to delete this song?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
style: 'destructive',
        onPress: async () => {
          try {
            await execute('DELETE FROM songs WHERE id = ?', [selectedSong.id])
            navigation.navigate('ChordListsTab', { screen: 'ChordListsHome' })
          } catch (err) {
            Alert.alert('Error', 'Failed to delete song')
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A0A0A" />
<Text style={styles.loadingText}>Loading…</Text>
      </View>
    )
  }

  const isFirst = currentItemIndex === 0
  const isLast = currentItemIndex >= browseItems.length - 1

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />

      {/* ─── HEADER ─── */}
      <View style={styles.header}>
<TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={16} color="#0A0A0A" />
        </TouchableOpacity>

        <View style={styles.headerMeta}>
          <Text style={styles.headerEyebrow}>CHORD LIST</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
{chordList?.title || 'Chord List'}
</Text>
</View>

          {browseItems.length > 1 && (
<View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>
              {currentItemIndex + 1}/{browseItems.length}
            </Text>
</View>
          )}
              </View>

      {/* ─── BROWSE MODE TABS ─── */}
      <View style={styles.browseModeBar}>
        {(['single', 'artist', 'playlist'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.browseModeTab, browseMode === mode && styles.browseModeTabActive]}
            onPress={() => handleBrowseModeChange(mode)}
          activeOpacity={0.75}
          >
            <Ionicons
              name={
                mode === 'single' ? 'musical-note' :
                mode === 'artist' ? 'person' : 'list'
              }
              size={13}
              color={browseMode === mode ? '#FAFAFA' : '#ADADAD'}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.browseModeText, browseMode === mode && styles.browseModeTextActive]}>
              {mode === 'single' ? 'Single' : mode === 'artist' ? 'Artist' : 'Playlist'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── NAVIGATION CONTROLS ─── */}
      {browseItems.length > 1 && (
        <View style={styles.navBar}>
          <TouchableOpacity
            style={[styles.navArrow, isFirst && styles.navArrowDisabled]}
            onPress={handlePreviousItem}
            disabled={isFirst}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={isFirst ? '#D4D4D4' : '#0A0A0A'} />
          </TouchableOpacity>
          
          <View style={styles.navCenter}>
            <Text style={styles.navTitle} numberOfLines={1}>
              {currentBrowseItem?.title}
            </Text>
            <View style={styles.navDots}>
              {browseItems.slice(
                Math.max(0, currentItemIndex - 2),
                Math.min(browseItems.length, currentItemIndex + 3)
              ).map((_, i) => {
                const realIndex = Math.max(0, currentItemIndex - 2) + i
                return (
                  <View
                    key={realIndex}
                    style={[
                      styles.navDot,
                      realIndex === currentItemIndex && styles.navDotActive,
                    ]}
                  />
                )
              })}
            </View>
          </View>
          
          <TouchableOpacity
            style={[styles.navArrow, isLast && styles.navArrowDisabled]}
            onPress={handleNextItem}
            disabled={isLast}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={18} color={isLast ? '#D4D4D4' : '#0A0A0A'} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── PLAYLIST REORDER CONTROLS ─── */}
      {browseMode === 'playlist' && browseItems.length > 1 && (
        <View style={styles.reorderBar}>
          <TouchableOpacity
            style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
            onPress={handleMoveUp}
            disabled={isFirst}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={14} color={isFirst ? '#C4C4C4' : '#0A0A0A'} />
            <Text style={[styles.reorderBtnText, isFirst && styles.reorderBtnTextDisabled]}>Move Up</Text>
          </TouchableOpacity>

          <View style={styles.reorderDivider} />
          
          <TouchableOpacity
            style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
            onPress={handleMoveDown}
            disabled={isLast}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-down" size={14} color={isLast ? '#C4C4C4' : '#0A0A0A'} />
            <Text style={[styles.reorderBtnText, isLast && styles.reorderBtnTextDisabled]}>Move Down</Text>
          </TouchableOpacity>
        </View>
      )}

{/* ─── CONTROLS ROW: View Mode + Transpose ─── */}
      <View style={styles.controlsRow}>
      {/* View Mode Pills */}
      <View style={styles.viewModePills}>
        {(['lyrics', 'chords', 'both'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.pill, viewMode === mode && styles.pillActive]}
            onPress={() => setViewMode(mode)}
activeOpacity={0.75}
          >
            <Text               style={[                styles.pillText,                 viewMode === mode && styles.pillTextActive]}            >
              {mode === 'lyrics' ? 'Lyrics' : mode === 'chords' ? 'Chords' : 'Both'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transpose Chip */}
      <TouchableOpacity
style={styles.transposeChip}
          onPress={() => setShowTransposePicker(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="musical-notes" size={12} color="#555" style={{ marginRight: 5 }} />
        <Text style={styles.transposeChipText}>
{selectedSong?.key || 'C'} → {transposeToKey}
        </Text>
        <Ionicons name="chevron-down" size={11} color="#ADADAD" style={{ marginLeft: 3 }} />
        </TouchableOpacity>
      </View>

      {/* ─── SONG SELECTOR (when multiple songs in single mode) ─── */}
      {songs.length > 1 && browseMode === 'single' && (
        <View style={styles.songPickerWrap}>
<Ionicons name="musical-note" size={13} color="#B0B0B0" style={{ marginLeft: 14 }} />
          <Picker
style={styles.songPicker}
            selectedValue={selectedSongId}
            onValueChange={(value) => {
setSelectedSongId(value)
              const song = songs.find(s => s.id === value)
              if (song) setTransposeToKey(song.key || 'C')
            }}
            dropdownIconColor="#ADADAD"
          >
            {songs.map((song) => (
              <Picker.Item key={song.id} label={song.title} value={song.id} />
            ))}
          </Picker>
        </View>
      )}

      {/* ─── CONTENT AREA ─── */}
      <ScrollView
style={styles.contentArea}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* Song title */}
        {selectedSong && (
          <View style={styles.songHeader}>
            <Text style={styles.songTitle}>{selectedSong.title}</Text>
            <View style={styles.keyBadge}>
              <Text style={styles.keyBadgeText}>Key of {transposeToKey}</Text>
            </View>
          </View>
        )}

        <Text style={styles.content}>{getDisplayContent()}</Text>
      </ScrollView>

      {/* ─── BOTTOM ACTION BAR ─── */}
      {canManageChords && (
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleEditSong} activeOpacity={0.75}>
            <Ionicons name="pencil-outline" size={16} color="#0A0A0A" />
          <Text style={styles.actionBtnText}>Edit</Text>
        </TouchableOpacity>

          <View style={styles.actionDivider} />

        <TouchableOpacity
style={[styles.actionBtn, styles.actionBtnDestructive]}
onPress={handleDeleteSong}
            activeOpacity={0.75}
          >
            <Ionicons name="trash-outline" size={16} color="#888" />
          <Text style={[styles.actionBtnText, styles.actionBtnTextDestructive]}>Delete</Text>
        </TouchableOpacity>
      </View>
       )}
      
      {/* ─── TRANSPOSE PICKER MODAL ─── */}
      <Modal visible={showTransposePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => setShowTransposePicker(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Transpose Key</Text>
              <TouchableOpacity onPress={() => setShowTransposePicker(false)}>
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.transposeInfo}>
              <Text style={styles.transposeInfoText}>
                Original: <Text style={styles.transposeInfoKey}>{selectedSong?.key || 'C'}</Text>
                {'   →   '}
                Target: <Text style={styles.transposeInfoKey}>{transposeToKey}</Text>
              </Text>
            </View>

            <View style={styles.keyGrid}>
              {getAllKeys().map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.keyCell, transposeToKey === key && styles.keyCellActive]}
                  onPress={() => setTransposeToKey(key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.keyCellText, transposeToKey === key && styles.keyCellTextActive]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── PLAYLIST SELECTION MODAL ─── */}
      <Modal visible={showPlaylistModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <TouchableOpacity
                onPress={() => {
                  setShowPlaylistModal(false)
                  setBrowseMode('single')
                }}
              >
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Playlist</Text>
<View style={{ width: 54 }} />
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              {playlists.length === 0 ? (
<View style={styles.modalEmpty}>
                  <Ionicons name="musical-notes-outline" size={28} color="#D0D0D0" />
                <Text style={styles.modalEmptyText}>No playlists yet</Text>
</View>
              ) : (
                playlists.map((playlist, idx) => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={[
                      styles.playlistOption,
                      idx < playlists.length - 1 && styles.playlistOptionBorder,
                    ]}
                    onPress={() => loadPlaylistSongs(playlist.id)}
activeOpacity={0.7}
                  >
<View style={styles.playlistOptionNum}>
                      <Text style={styles.playlistOptionNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.playlistOptionText}>{playlist.title}</Text>
<Ionicons name="chevron-forward" size={15} color="#D4D4D4" />
                  </TouchableOpacity>
                ))
              )}
<View style={{ height: 20 }} />
            </ScrollView>
                      </View>
        </View>
      </Modal>

      {/* ─── EDIT MODAL ─── */}
      <Modal visible={editingModalVisible} animationType="slide">
        <View style={styles.editModalContainer}>
<StatusBar barStyle="dark-content" backgroundColor="#FFF" />
          <View style={styles.editModalHeader}>
            <TouchableOpacity
onPress={() => setEditingModalVisible(false)}
              style={styles.editModalHeaderBtn}
>
              <Text style={styles.editModalCancel}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.editModalTitleWrap}>
              <Text style={styles.editModalEyebrow}>EDITING</Text>
              <Text style={styles.editModalTitle} numberOfLines={1}>
                {selectedSong?.title}
              </Text>
            </View>
            <TouchableOpacity
onPress={handleSaveEdit}
              style={[styles.editModalHeaderBtn, styles.editModalSaveBtn]}
>
              <Text style={styles.editModalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.editFormatHint}>
            <Ionicons name="information-circle-outline" size={13} color="#B0B0B0" />
            <Text style={styles.editFormatHintText}>
              Wrap chords in brackets: [Am] [G] [C]
            </Text>
          </View>

          <TextInput
            style={styles.editInput}
            multiline
            value={editingContent}
            onChangeText={setEditingContent}
            placeholder="[Am] Amazing grace how [G] sweet the sound..."
            placeholderTextColor="#C8C8C8"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
  gap: 14,
  },
  loadingText: {
    fontSize: 12,
    letterSpacing: 1.4,
    color: '#ADADAD',
    textTransform: 'uppercase',
    fontWeight: '600',
  },

  // Header
  header: {
flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    gap: 12,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerMeta: {
    flex: 1,
    gap: 2,
  },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C0C0C0',
letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.4,
  },
  headerBadge: {
    backgroundColor: '#0A0A0A',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FAFAFA',
    letterSpacing: 0.5,
  },

  // Browse Mode Bar
  browseModeBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    gap: 8,
  },
  browseModeTab: {
    flex: 1,
flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
        borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  browseModeTabActive: {
    backgroundColor: '#0A0A0A',
  },
  browseModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ADADAD',
  },
  browseModeTextActive: {
    color: '#FAFAFA',
  },
  
  // Navigation Bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
        backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    gap: 8,
  },
  navArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  navArrowDisabled: {
    backgroundColor: '#F8F8F8',
    borderColor: '#F0F0F0',
  },
  navCenter: {
    flex: 1,
alignItems: 'center',
    gap: 6,
  },
  navTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: -0.1,
  },
  navDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  navDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
  },
  navDotActive: {
    width: 14,
    backgroundColor: '#0A0A0A',
  },

  // Reorder Bar
  reorderBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    alignItems: 'center',
  },
  reorderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#F5F5F5',
    gap: 6,
  },
  reorderBtnDisabled: {
    opacity: 0.45,
      },
  reorderBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  reorderBtnTextDisabled: {
    color: '#C4C4C4',
  },
  reorderDivider: {
    width: 10,
  },

  // Controls Row
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
gap: 10,
  },
  viewModePills: {
    flexDirection: 'row',
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  pill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
borderRadius: 8,
  },
  pillActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
shadowOffset: { width: 0, height: 1   },
  shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ADADAD',
  },
  pillTextActive: {
    color: '#0A0A0A',
  },
  transposeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  transposeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 0.1,
  },
  
  // Song Picker
  songPickerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  songPicker: {
    flex: 1,
    color: '#0A0A0A',
  },

  // Content Area
  contentArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  contentInner: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  songHeader: {
    marginBottom: 20,
    gap: 8,
  },
  songTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.6,
    lineHeight: 26,
  },
  keyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0A0A0A',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  keyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FAFAFA',
    letterSpacing: 0.5,
  },
  content: {
    fontSize: 15,
    lineHeight: 26,
    color: '#2A2A2A',
    fontFamily: 'Courier New',
letterSpacing: 0.1,
  },
  
  // Action Bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 0,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
    gap: 7,
  },
  actionBtnDestructive: {
    backgroundColor: '#F8F8F8',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  actionBtnTextDestructive: {
    color: '#999',
  },
  actionDivider: {
    width: 10,
  },

  // Modals shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.3,
  },
  modalCancel: {
    fontSize: 14,
    color: '#ADADAD',
    fontWeight: '500',
minWidth: 54,
  },
  modalDone: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
    minWidth: 54,
    textAlign: 'right',
  },
  modalScrollBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  modalEmptyText: {
    fontSize: 13,
    color: '#C0C0C0',
    fontWeight: '500',
  },

  // Transpose Key Grid
  transposeInfo: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F4',
    alignItems: 'center',
  },
  transposeInfoText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  transposeInfoKey: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0A0A0A',
  },
  keyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  keyCell: {
    width: '22%',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  keyCellActive: {
    backgroundColor: '#0A0A0A',
    borderColor: '#0A0A0A',
  },
  keyCellText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  keyCellTextActive: {
    color: '#FAFAFA',
  },

  // Playlist options
  playlistOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  playlistOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F4',
  },
  playlistOptionNum: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistOptionNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#888',
  },
  playlistOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  
  // Edit Modal
  editModalContainer: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  editModalHeader: {
    flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    gap: 12,
  },
  editModalHeaderBtn: {
    minWidth: 60,
  },
  editModalSaveBtn: {
    alignItems: 'flex-end',
  },
  editModalTitleWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  editModalEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C0C0C0',
    letterSpacing: 2,
  },
  editModalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0A0A0A',
letterSpacing: -0.2,
  },
  editModalCancel: {
    fontSize: 14,
    color: '#ADADAD',
    fontWeight: '500',
  },
  editModalSave: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0A0A0A',
  },
  editFormatHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#F7F7F7',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  editFormatHintText: {
    fontSize: 12,
    color: '#B0B0B0',
    fontWeight: '500',
    fontFamily: 'Courier New',
  },
  editInput: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    fontSize: 15,
    color: '#0A0A0A',
    textAlignVertical: 'top',
lineHeight: 26,
    fontFamily: 'Courier New',
  },
})