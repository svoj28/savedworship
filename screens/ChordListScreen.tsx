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
} from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Song, ChordList, Playlist, PlaylistItem } from '../db/models'
import { transposeText, transposeChord, getAllKeys, getTransposeDistance } from '../lib/transpose'
import { query, queryOne, execute, transaction } from '../db/index'
import { getPlaylistsByUserId, getPlaylistItems, updatePlaylistItemPosition } from '../db/queries'
import { getCurrentUser } from '../lib/auth'

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
  
  // New state for browse features
  const [browseMode, setBrowseMode] = useState<BrowseMode>('single')
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [isReordering, setIsReordering] = useState(false)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [artistId, setArtistId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Load chord list and songs
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
    })
  }, [navigation])

  useFocusEffect(
    React.useCallback(() => {
      loadChordList()
    }, [chordListId])
  )

  const loadChordList = async () => {
    try {
      setLoading(true)
      
      // Get current user
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
        // Load playlists
        const userPlaylists = await getPlaylistsByUserId(user.id)
        setPlaylists(userPlaylists)
      }
      
      // Load the chord list
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

      // Load songs in this chord list
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

      // Set initial browse items
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
        title: `${song.title} (${song.key || 'C'})`,
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
      console.error('Error loading artist songs:', err)
      Alert.alert('Error', 'Failed to load artist songs')
    }
  }

  const loadPlaylistSongs = async (playlistId: string) => {
    try {
      const playlistItems = await getPlaylistItems(playlistId)
      
      // Create browse items with position info
      const items: BrowseItem[] = playlistItems.map((item, idx) => ({
        id: item.id,
        title: `${idx + 1}. ${item.songId ? `Song ${item.songId.substring(0, 8)}` : `Chord List ${item.chordListId?.substring(0, 8)}`}`,
        type: item.songId ? 'song' : 'chord_list',
        songId: item.songId,
        chordListId: item.chordListId,
        position: item.position,
      }))

      setBrowseItems(items)
      setSelectedPlaylistId(playlistId)
      if (items.length > 0) {
        setCurrentItemIndex(0)
        if (items[0].songId) {
          setSelectedSongId(items[0].songId)
        }
      }
      setShowPlaylistModal(false)
    } catch (err) {
      console.error('Error loading playlist songs:', err)
      Alert.alert('Error', 'Failed to load playlist')
    }
  }

  const handleBrowseModeChange = (mode: BrowseMode) => {
    setBrowseMode(mode)
    setIsReordering(false)
    
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
    } else if (mode === 'playlist') {
      setShowPlaylistModal(true)
    }
  }

  const handlePreviousItem = () => {
    if (currentItemIndex > 0) {
      const newIndex = currentItemIndex - 1
      setCurrentItemIndex(newIndex)
      if (browseItems[newIndex].songId) {
        setSelectedSongId(browseItems[newIndex].songId!)
      }
    }
  }

  const handleNextItem = () => {
    if (currentItemIndex < browseItems.length - 1) {
      const newIndex = currentItemIndex + 1
      setCurrentItemIndex(newIndex)
      if (browseItems[newIndex].songId) {
        setSelectedSongId(browseItems[newIndex].songId!)
      }
    }
  }

  const handleMoveUp = async () => {
    if (currentItemIndex === 0 || !selectedPlaylistId) return
    
    try {
      const currentItem = browseItems[currentItemIndex]
      const previousItem = browseItems[currentItemIndex - 1]
      
      // Swap positions
      const tempPosition = currentItem.position || currentItemIndex
      await updatePlaylistItemPosition(currentItem.id, previousItem.position || currentItemIndex - 1)
      await updatePlaylistItemPosition(previousItem.id, tempPosition)
      
      // Reload playlist
      await loadPlaylistSongs(selectedPlaylistId)
      setCurrentItemIndex(currentItemIndex - 1)
    } catch (err) {
      console.error('Error moving item up:', err)
      Alert.alert('Error', 'Failed to reorder items')
    }
  }

  const handleMoveDown = async () => {
    if (currentItemIndex >= browseItems.length - 1 || !selectedPlaylistId) return
    
    try {
      const currentItem = browseItems[currentItemIndex]
      const nextItem = browseItems[currentItemIndex + 1]
      
      // Swap positions
      const tempPosition = currentItem.position || currentItemIndex
      await updatePlaylistItemPosition(currentItem.id, nextItem.position || currentItemIndex + 1)
      await updatePlaylistItemPosition(nextItem.id, tempPosition)
      
      // Reload playlist
      await loadPlaylistSongs(selectedPlaylistId)
      setCurrentItemIndex(currentItemIndex + 1)
    } catch (err) {
      console.error('Error moving item down:', err)
      Alert.alert('Error', 'Failed to reorder items')
    }
  }

  const selectedSong = songs.find((s) => s.id === selectedSongId)
  const currentBrowseItem = browseItems[currentItemIndex]

  // Process content based on view mode and transpose
  const getDisplayContent = () => {
    if (!selectedSong) return ''

    let content = selectedSong.content
    const originalKey = selectedSong.key || 'C'
    
    const semitones = getTransposeDistance(originalKey, transposeToKey)
    
    if (semitones !== 0) {
      content = transposeText(content, semitones)
    }

    if (viewMode === 'lyrics') {
      return content.replace(/\[([^\]]+)\]/g, '').trim()
    } else if (viewMode === 'chords') {
      const chords: string[] = []
      const chordMatches = content.matchAll(/\[([^\]]+)\]/g)
      for (const match of chordMatches) {
        chords.push(match[1])
      }
      return `Chords in this song: ${chords.join(', ')}`
    } else {
      return content
    }
  }

  const handleAddSong = () => {
    navigation.navigate('AddSong', { chordListId })
  }

  const handleEditSong = () => {
    if (!selectedSong) return
    setEditingContent(selectedSong.content)
    setEditingModalVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedSong) return

    try {
      await execute(
        'UPDATE songs SET content = ?, updated_at = ? WHERE id = ?',
        [editingContent, Date.now(), selectedSong.id]
      )
      setEditingModalVisible(false)
      loadChordList()
    } catch (err) {
      Alert.alert('Error', 'Failed to save song')
    }
  }

  const handleDeleteSong = async () => {
    if (!selectedSong) return

    Alert.alert('Delete Song', 'Are you sure you want to delete this song?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header with Title and Position */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{chordList?.title || 'Chord List'}</Text>
          {browseItems.length > 1 && (
            <Text style={styles.position}>
              {currentItemIndex + 1} of {browseItems.length}
            </Text>
          )}
        </View>
      </View>

      {/* Browse Mode Tabs */}
      <View style={styles.browseModeContainer}>
        {(['single', 'artist', 'playlist'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.browseModeTab, browseMode === mode && styles.browseModeTabActive]}
            onPress={() => handleBrowseModeChange(mode)}
          >
            <Text style={[styles.browseModeText, browseMode === mode && styles.browseModeTextActive]}>
              {mode === 'single' ? 'Single' : mode === 'artist' ? 'Artist' : 'Playlist'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Navigation Controls for Browse Mode */}
      {browseItems.length > 1 && (
        <View style={styles.navigationControls}>
          <TouchableOpacity
            style={[styles.navButton, currentItemIndex === 0 && styles.navButtonDisabled]}
            onPress={handlePreviousItem}
            disabled={currentItemIndex === 0}
          >
            <Ionicons name="chevron-back" size={24} color={currentItemIndex === 0 ? '#ccc' : '#007AFF'} />
          </TouchableOpacity>
          
          <Text style={styles.currentItemTitle}>{currentBrowseItem?.title}</Text>
          
          <TouchableOpacity
            style={[styles.navButton, currentItemIndex >= browseItems.length - 1 && styles.navButtonDisabled]}
            onPress={handleNextItem}
            disabled={currentItemIndex >= browseItems.length - 1}
          >
            <Ionicons name="chevron-forward" size={24} color={currentItemIndex >= browseItems.length - 1 ? '#ccc' : '#007AFF'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Reorder Controls for Playlist Mode */}
      {browseMode === 'playlist' && browseItems.length > 1 && (
        <View style={styles.reorderControls}>
          <TouchableOpacity
            style={[styles.reorderButton, currentItemIndex === 0 && styles.reorderButtonDisabled]}
            onPress={handleMoveUp}
            disabled={currentItemIndex === 0}
          >
            <Ionicons name="arrow-up" size={20} color={currentItemIndex === 0 ? '#ccc' : '#FF9500'} />
            <Text style={[styles.reorderButtonText, currentItemIndex === 0 && styles.reorderButtonTextDisabled]}>Move Up</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.reorderButton, currentItemIndex >= browseItems.length - 1 && styles.reorderButtonDisabled]}
            onPress={handleMoveDown}
            disabled={currentItemIndex >= browseItems.length - 1}
          >
            <Ionicons name="arrow-down" size={20} color={currentItemIndex >= browseItems.length - 1 ? '#ccc' : '#FF9500'} />
            <Text style={[styles.reorderButtonText, currentItemIndex >= browseItems.length - 1 && styles.reorderButtonTextDisabled]}>Move Down</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* View Mode Buttons */}
      <View style={styles.modeButtons}>
        {(['lyrics', 'chords', 'both'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.modeButton, viewMode === mode && styles.modeButtonActive]}
            onPress={() => setViewMode(mode)}
          >
            <Text
              style={[
                styles.modeButtonText,
                viewMode === mode && styles.modeButtonTextActive,
              ]}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transpose Control */}
      <View style={styles.transposeSection}>
        <Text style={styles.label}>
          Transpose: {selectedSong?.key || 'C'} → {transposeToKey}
        </Text>
        <View style={styles.transposeControls}>
          <Picker
            style={styles.picker}
            selectedValue={transposeToKey}
            onValueChange={(value) => setTransposeToKey(value)}
          >
            {getAllKeys().map((key) => (
              <Picker.Item key={key} label={key} value={key} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Song Selection Picker */}
      {songs.length > 0 && (
        <View style={styles.songPicker}>
          <Picker
            selectedValue={selectedSongId}
            onValueChange={(value) => setSelectedSongId(value)}
          >
            {songs.map((song) => (
              <Picker.Item key={song.id} label={song.title} value={song.id} />
            ))}
          </Picker>
        </View>
      )}

      {/* Content Display */}
      <ScrollView style={styles.contentArea}>
        <Text style={styles.content}>{getDisplayContent()}</Text>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton} onPress={handleEditSong}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleDeleteSong}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Action Button */}
      {/* <TouchableOpacity
        style={styles.fab}
        onPress={handleAddSong}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity> */}

      {/* Playlist Selection Modal */}
      <Modal visible={showPlaylistModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.playlistModalContent}>
            <Text style={styles.modalTitle}>Select Playlist</Text>
            <ScrollView style={styles.playlistList}>
              {playlists.length === 0 ? (
                <Text style={styles.emptyText}>No playlists available</Text>
              ) : (
                playlists.map((playlist) => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={styles.playlistOption}
                    onPress={() => loadPlaylistSongs(playlist.id)}
                  >
                    <Text style={styles.playlistOptionText}>{playlist.title}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowPlaylistModal(false)
                setBrowseMode('single')
              }}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={editingModalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditingModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Song</Text>
            <TouchableOpacity onPress={handleSaveEdit}>
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalInput}
            multiline
            value={editingContent}
            onChangeText={setEditingContent}
            placeholder="Enter lyrics with chords in [chord] format"
            placeholderTextColor="#ccc"
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  position: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  browseModeContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 5,
    paddingVertical: 8,
  },
  browseModeTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginHorizontal: 3,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  browseModeTabActive: {
    backgroundColor: '#007AFF',
  },
  browseModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  browseModeTextActive: {
    color: '#fff',
  },
  navigationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
  },
  navButton: {
    padding: 8,
    borderRadius: 6,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  currentItemTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  reorderControls: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 10,
  },
  reorderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#FFF3E0',
    gap: 6,
  },
  reorderButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#f0f0f0',
  },
  reorderButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9500',
  },
  reorderButtonTextDisabled: {
    color: '#999',
  },
  modeButtons: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  transposeSection: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  transposeControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transposeButton: {
    width: 50,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transposeButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  picker: {
    flex: 1,
    marginHorizontal: 10,
  },
  songPicker: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  contentArea: {
    flex: 1,
    padding: 15,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    fontFamily: 'Courier New',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
    elevation: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  playlistModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 15,
    paddingBottom: 20,
    maxHeight: '70%',
  },
  playlistList: {
    maxHeight: 300,
    paddingHorizontal: 15,
  },
  playlistOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  playlistOptionText: {
    fontSize: 14,
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalCloseButton: {
    marginHorizontal: 15,
    marginTop: 15,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCancel: {
    fontSize: 16,
    color: '#007AFF',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  modalInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    color: '#333',
    textAlignVertical: 'top',
  },
})
