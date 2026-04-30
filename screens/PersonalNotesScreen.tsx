// screens/PersonalNotesScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  FlatList,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { ChordList, Artist } from '../db/models'
import { getCurrentUser } from '../lib/auth'
import { query, execute } from '../db/index'
import uuid from 'react-native-uuid'

interface Props {
  navigation: any
}

export default function PersonalNotesScreen({ navigation }: Props) {
  const [chordLists, setChordLists] = useState<ChordList[]>([])
  const [filteredLists, setFilteredLists] = useState<ChordList[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [artists, setArtists] = useState<Artist[]>([])

  // Load personal notes on screen focus
  useFocusEffect(
    React.useCallback(() => {
      loadPersonalNotes()
    }, [])
  )

  const loadPersonalNotes = async () => {
    try {
      setLoading(true)

      // Get current user
      const user = await getCurrentUser()
      if (!user) {
        Alert.alert('Error', 'Not authenticated')
        return
      }

      setUserId(user.id)

      // Load all chord lists for this user that are marked as private
      console.log('Loading chord lists for user:', user.id)
      const listRows: any[] = await query(
        'SELECT * FROM chord_lists WHERE user_id = ? AND is_private = 1 ORDER BY title',
        [user.id]
      )
      console.log('Loaded chord lists:', listRows.length)

      const mapped: ChordList[] = (listRows || []).map(row => ({
        id: row.id,
        title: row.title,
        artistId: row.artist_id,
        userId: row.user_id,
        isPrivate: Boolean(row.is_private),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
      }))

      setChordLists(mapped)
      setFilteredLists(mapped)

      // Load artists for dropdown
      console.log('Loading artists for user:', user.id)
      const artistRows: any[] = await query(
        'SELECT * FROM artists WHERE user_id = ? ORDER BY name',
        [user.id]
      )
      console.log('Loaded artists:', artistRows.length)

      const mappedArtists: Artist[] = (artistRows || []).map(row => ({
        id: row.id,
        name: row.name,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        synced: Boolean(row._synced),
      }))

      setArtists(mappedArtists)
    } catch (err) {
      console.error('Error loading personal notes:', err)
      Alert.alert('Error', 'Failed to load personal notes')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (text: string) => {
    setSearchText(text)
    const filtered = chordLists.filter(
      (list) =>
        list.title.toLowerCase().includes(text.toLowerCase())
    )
    setFilteredLists(filtered)
  }

  const handleCreateList = async () => {
    if (!newListTitle.trim()) {
      Alert.alert('Error', 'Please enter a title')
      return
    }

    if (!userId) return

    try {
      let artistId = selectedArtist
      const now = Date.now()

      if (!artistId || artistId === 'new') {
        // Create a generic "Personal" artist
        artistId = uuid.v4()
        await execute(
          'INSERT INTO artists (id, name, user_id, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?)',
          [artistId, 'Personal', userId, now, now, 0]
        )
      }

      // Create new chord list
      const listId = uuid.v4()
      await execute(
        'INSERT INTO chord_lists (id, title, artist_id, user_id, is_private, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [listId, newListTitle, artistId, userId, 1, now, now, 0]
      )

      setNewListTitle('')
      setSelectedArtist(null)
      setShowCreateModal(false)
      loadPersonalNotes()
    } catch (err) {
      console.error('Error creating chord list:', err)
      Alert.alert('Error', 'Failed to create chord list')
    }
  }

  const handleDeleteList = async (listId: string) => {
    Alert.alert('Delete', 'Delete this chord list?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            // Delete songs in this list first
            await execute('DELETE FROM songs WHERE chord_list_id = ?', [listId])
            // Delete the chord list
            await execute('DELETE FROM chord_lists WHERE id = ?', [listId])
            loadPersonalNotes()
          } catch (err) {
            Alert.alert('Error', 'Failed to delete chord list')
          }
        },
      },
    ])
  }

  const handleSelectList = (list: ChordList) => {
    // Navigate to NoteDetailScreen to edit the note
    navigation.navigate('NoteDetail', { noteId: list.id })
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
      {/* <View style={styles.header}>
        <Text style={styles.title}>Notes</Text>
      </View> */}

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes..."
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={handleSearch}
        />
      </View>

      {/* Notes List */}
      {filteredLists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyText}>
            {chordLists.length === 0 ? 'No notes yet' : 'No results'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredLists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.noteCard}
              onPress={() => handleSelectList(item)}
            >
              <View style={styles.noteCardContent}>
                <Text style={styles.noteTitle}>{item.title}</Text>
                <Text style={styles.noteDate}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.noteDeleteButton}
                onPress={(e) => {
                  e.stopPropagation()
                  handleDeleteList(item.id)
                }}
              >
                <Text style={styles.noteDeleteIcon}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create Modal */}
      {showCreateModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create New Chord List</Text>

            <TextInput
              style={styles.input}
              placeholder="Title"
              placeholderTextColor="#999"
              value={newListTitle}
              onChangeText={setNewListTitle}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowCreateModal(false)
                  setNewListTitle('')
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreateList}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
  },
  searchContainer: {
    padding: 12,
    backgroundColor: '#fff',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  listContainer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteCard: {
    backgroundColor: '#fff',
    marginHorizontal: 6,
    marginVertical: 6,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  noteCardContent: {
    flex: 1,
    paddingRight: 12,
  },
  noteTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  noteDate: {
    fontSize: 13,
    color: '#999',
  },
  noteDeleteButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  noteDeleteIcon: {
    fontSize: 20,
    color: '#ccc',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
    lineHeight: 36,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 14,
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  createButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
})
