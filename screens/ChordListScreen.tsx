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
import { Song, ChordList } from '../db/models'
import { transposeText, transposeChord, getAllKeys, getTransposeDistance } from '../lib/transpose'
import { query, queryOne, execute, transaction } from '../db/index'

interface Props {
  route: any
  navigation: any
}

type ViewMode = 'lyrics' | 'chords' | 'both'

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
      }

      // Load songs in this chord list
      console.log('Loading songs for chord list:', chordListId)
      const songRows: any[] = await query('SELECT * FROM songs WHERE chord_list_id = ? ORDER BY title', [chordListId])
      console.log('Loaded songs:', (songRows || []).length)
      
      const mapped: Song[] = (songRows || []).map(row => ({
        id: row.id,
        chordListId: row.chord_list_id,
        title: row.title,
        content: row.content,
        key: row.key,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
      }))
      setSongs(mapped)

      if (mapped.length > 0) {
        setSelectedSongId(mapped[0].id)
        setTransposeToKey(mapped[0].key || 'C')
      }
    } catch (err) {
      console.error('Error loading chord list:', err)
      Alert.alert('Error', 'Failed to load chord list')
    } finally {
      setLoading(false)
    }
  }

  const selectedSong = songs.find((s) => s.id === selectedSongId)

  // Process content based on view mode and transpose
  const getDisplayContent = () => {
    if (!selectedSong) return ''

    let content = selectedSong.content
    const originalKey = selectedSong.key || 'C'
    
    // Calculate semitone distance from original key to target key
    const semitones = getTransposeDistance(originalKey, transposeToKey)
    
    if (semitones !== 0) {
      content = transposeText(content, semitones)
    }

    if (viewMode === 'lyrics') {
      // Remove chords: [chord] -> ""
      return content.replace(/\[([^\]]+)\]/g, '').trim()
    } else if (viewMode === 'chords') {
      // Show only chords
      const chords: string[] = []
      const chordMatches = content.matchAll(/\[([^\]]+)\]/g)
      for (const match of chordMatches) {
        chords.push(match[1])
      }
      return `Chords in this song: ${chords.join(', ')}`
    } else {
      // 'both' - show lyrics with chords
      return content
    }
  }

  const handleAddSong = () => {
    // Navigate to add song screen
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
            // Navigate back to ChordListsHomeScreen
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{chordList?.title || 'Chord List'}</Text>
      </View>

      {/* View Mode Buttons */}
      <View style={styles.modeButtons}>
        {['lyrics', 'chords', 'both'].map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.modeButton, viewMode === mode && styles.modeButtonActive]}
            onPress={() => setViewMode(mode as ViewMode)}
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

      {/* Song Selection */}
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
      <TouchableOpacity
        style={styles.fab}
        onPress={handleAddSong}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

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
    color: '#007AFF',
    fontWeight: 'bold',
  },
  modalInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    textAlignVertical: 'top',
    color: '#333',
  },
})
