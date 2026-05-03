// screens/ChordListsHomeScreen.tsx
/**
 * Main screen showing all artists with expandable song browsers
 * Allows users to browse songs by artist and navigate to ChordListScreen
 * Includes playlist functionality to categorize and combine songs
 * FAB navigates to AddSongScreen to create new songs
 */
import React, { useState } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  FlatList,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import { query } from '../db/index'
import { getPlaylistsByUserId, createPlaylist, deletePlaylist, getPlaylistItems, addToPlaylist, removeFromPlaylist } from '../db/queries'
import { PlaylistSongViewerModal } from '../components/PlaylistSongViewerModal'
import { useRole } from '../lib/useRole'

interface Props {
  navigation: any
}

interface Playlist {
  id: string
  userId: string
  title: string
  description?: string
  createdAt: number
  updatedAt: number
  synced: boolean
}

interface PlaylistItem {
  id: string
  playlistId: string
  chordListId?: string
  songId?: string
  position: number
  createdAt: number
  synced: boolean
}

export default function ChordListsHomeScreen({ navigation }: Props) {
  const [activeTab, setActiveTab] = useState<'artists' | 'playlists'>('artists')
  const [artists, setArtists] = useState<any[]>([])
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set())
  const [artistSongs, setArtistSongs] = useState<{ [key: string]: any[] }>({})
  const [loading, setLoading] = useState(true)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([])
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false)
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('')
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('')
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [showAddSongModal, setShowAddSongModal] = useState(false)
  const [addSongExpandedArtists, setAddSongExpandedArtists] = useState<Set<string>>(new Set())
  const [showSongViewer, setShowSongViewer] = useState(false)
  const [viewerStartIndex, setViewerStartIndex] = useState(0)
  const [viewerSongs, setViewerSongs] = useState<any[]>([])
  const { canManageChords } = useRole()

  useFocusEffect(
    React.useCallback(() => {
      loadData()
    }, [])
  )

  const loadData = async () => {
    try {
      setLoading(true)
      const user = await getCurrentUser()
      if (user) {
        setUserId(user.id)
        await Promise.all([loadArtists(), loadPlaylists(user.id)])
      }
    } catch (err) {
      console.error('Error loading data:', err)
      Alert.alert('Error', 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadArtists = async () => {
    try {
      const rows: any[] = await query('SELECT DISTINCT id, name FROM artists ORDER BY name')
      setArtists(rows || [])
      
      const songMap: { [key: string]: any[] } = {}
      for (const artist of rows || []) {
        const songRows: any[] = await query(
          `SELECT s.* FROM songs s 
           JOIN chord_lists cl ON s.chord_list_id = cl.id 
           WHERE cl.artist_id = ? AND cl.is_private = 0
           ORDER BY s.title`,
          [artist.id]
        )
        songMap[artist.id] = songRows || []
      }
      setArtistSongs(songMap)
    } catch (err) {
      console.error('Error loading artists:', err)
    }
  }

  const handleOpenSongViewer = async (startIndex: number) => {
  try {
    // Load full song content for all playlist items
    const songs = await Promise.all(
      playlistItems.map(async (item) => {
        if (!item.songId) return null
        const rows: any[] = await query('SELECT * FROM songs WHERE id = ?', [item.songId])
        return rows[0] ?? null
      })
    )
    setViewerSongs(songs.filter(Boolean))
    setViewerStartIndex(startIndex)
    setShowSongViewer(true)
  } catch (err) {
    Alert.alert('Error', 'Failed to load songs')
  }
}

  const loadPlaylists = async (userId: string) => {
    try {
      const userPlaylists = await getPlaylistsByUserId(userId)
      setPlaylists(userPlaylists)
    } catch (err) {
      console.error('Error loading playlists:', err)
    }
  }

  const loadPlaylistItems = async (playlistId: string) => {
    try {
      const items = await getPlaylistItems(playlistId)
      setPlaylistItems(items)
    } catch (err) {
      console.error('Error loading playlist items:', err)
    }
  }

  const toggleArtistExpand = (artistId: string) => {
    setExpandedArtists(prev => {
      const newSet = new Set(prev)
      if (newSet.has(artistId)) {
        newSet.delete(artistId)
      } else {
        newSet.add(artistId)
      }
      return newSet
    })
  }

  const handleSelectSong = (song: any) => {
    navigation.navigate('ChordList', { chordListId: song.chord_list_id })
  }

  const handleCreateSong = () => {
    navigation.navigate('AddSong', {})
  }

  const handleCreatePlaylist = async () => {
    if (!newPlaylistTitle.trim()) {
      Alert.alert('Error', 'Please enter a playlist name')
      return
    }

    try {
      await createPlaylist({
        userId,
        title: newPlaylistTitle,
        description: newPlaylistDesc,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        synced: false,
      })

      setNewPlaylistTitle('')
      setNewPlaylistDesc('')
      setShowCreatePlaylistModal(false)
      await loadPlaylists(userId)
      Alert.alert('Success', 'Playlist created!')
    } catch (err) {
      console.error('Error creating playlist:', err)
      Alert.alert('Error', 'Failed to create playlist')
    }
  }

  const handleDeletePlaylist = (playlistId: string) => {
    Alert.alert('Delete Playlist', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await deletePlaylist(playlistId)
            await loadPlaylists(userId)
            if (selectedPlaylist?.id === playlistId) {
              setSelectedPlaylist(null)
            }
            Alert.alert('Success', 'Playlist deleted!')
          } catch (err) {
            console.error('Error deleting playlist:', err)
            Alert.alert('Error', 'Failed to delete playlist')
          }
        },
        style: 'destructive',
      },
    ])
  }

  const handleSelectPlaylist = async (playlist: Playlist) => {
    setSelectedPlaylist(playlist)
    await loadPlaylistItems(playlist.id)
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
      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'artists' && styles.tabActive]}
          onPress={() => setActiveTab('artists')}
        >
          <Ionicons name="list" size={20} color={activeTab === 'artists' ? '#007AFF' : '#999'} />
          <Text style={[styles.tabLabel, activeTab === 'artists' && styles.tabLabelActive]}>Artists</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'playlists' && styles.tabActive]}
          onPress={() => setActiveTab('playlists')}
        >
          <Ionicons name="musical-note" size={20} color={activeTab === 'playlists' ? '#007AFF' : '#999'} />
          <Text style={[styles.tabLabel, activeTab === 'playlists' && styles.tabLabelActive]}>Playlists</Text>
        </TouchableOpacity>
      </View>

      {/* Artists Tab */}
      {activeTab === 'artists' && (
        <>
          {artists.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>No artists yet. Create one to get started!</Text>
            </View>
          ) : (
            <ScrollView style={styles.browseContainer}>
              {artists.filter(artist => (artistSongs[artist.id] || []).length > 0).map((artist) => (
                <View key={artist.id}>
                  <TouchableOpacity
                    style={styles.artistHeader}
                    onPress={() => toggleArtistExpand(artist.id)}
                  >
                    <Text style={styles.artistName}>{artist.name}</Text>
                    <Ionicons
                      name={expandedArtists.has(artist.id) ? 'chevron-up' : 'chevron-down'}
                      size={24}
                      color="#007AFF"
                    />
                  </TouchableOpacity>

                  {expandedArtists.has(artist.id) && (
                    <View style={styles.artistSongsContainer}>
                      {(artistSongs[artist.id] || []).length === 0 ? (
                        <Text style={styles.noSongsText}>No songs yet</Text>
                      ) : (
                        (artistSongs[artist.id] || []).map((song) => (
                          <View key={song.id} style={styles.songItemRow}>
                            <TouchableOpacity
                              style={styles.songItem}
                              onPress={() => handleSelectSong(song)}
                            >
                              <Text style={styles.songItemTitle}>{song.title}</Text>
                            </TouchableOpacity>
                            {selectedPlaylist && (
                              <TouchableOpacity
                                style={styles.addButton}
                                onPress={async () => {
                                  try {
                                    const maxPosition = playlistItems.length > 0 
                                      ? Math.max(...playlistItems.map(item => item.position)) + 1 
                                      : 0
                                    await addToPlaylist({
                                      playlistId: selectedPlaylist.id,
                                      songId: song.id,
                                      position: maxPosition,
                                      createdAt: Date.now(),
                                      synced: false,
                                      userId,
                                    })
                                    await loadPlaylistItems(selectedPlaylist.id)
                                    Alert.alert('Success', 'Song added to playlist!')
                                  } catch (err) {
                                    Alert.alert('Error', 'Failed to add song')
                                  }
                                }}
                              >
                                <Ionicons name="add" size={20} color="#007AFF" />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* Playlists Tab */}
      {activeTab === 'playlists' && (
        <>
          {!selectedPlaylist ? (
            <ScrollView style={styles.browseContainer}>
              {playlists.length === 0 ? (
                <View style={styles.center}>
                  <Ionicons name="musical-note" size={60} color="#CCC" />
                  <Text style={styles.emptyText}>No playlists yet</Text>
                </View>
              ) : (
                playlists.map((playlist) => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={styles.playlistCard}
                    onPress={() => handleSelectPlaylist(playlist)}
                  >
                    <View style={styles.playlistCardContent}>
                      <Text style={styles.playlistTitle}>{playlist.title}</Text>
                      {playlist.description && (
                        <Text style={styles.playlistDesc} numberOfLines={1}>{playlist.description}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeletePlaylist(playlist.id)}
                      style={styles.deletePlaylistButton}
                    >
                      <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          ) : (
            <View style={styles.playlistDetailContainer}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setSelectedPlaylist(null)}
              >
                <Ionicons name="chevron-back" size={24} color="#007AFF" />
                <Text style={styles.backButtonText}>{selectedPlaylist.title}</Text>
              </TouchableOpacity>

              {playlistItems.length === 0 ? (
                <View style={styles.center}>
                  <Text style={styles.emptyText}>No songs in this playlist</Text>
                </View>
              ) : (
                <FlatList
                  data={playlistItems}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingBottom: 100 }}
                  renderItem={({ item, index }) => {
                  const song = Object.values(artistSongs).flat().find(s => s.id === item.songId)
                  return (
                    <TouchableOpacity
                      style={styles.playlistItemRow}
                      onPress={() => handleOpenSongViewer(index)}  // ← make the whole row tappable
                    >
                      <Text style={styles.playlistItemNumber}>{index + 1}</Text>
                      <Text style={styles.playlistItemText}>
                        {song?.title ?? (item.songId ? `Song ${item.songId.substring(0, 8)}` : `Chord List ${item.chordListId?.substring(0, 8)}`)}
                      </Text>
                      <TouchableOpacity
                        onPress={async (e) => {
                          e.stopPropagation()
                          try {
                            await removeFromPlaylist(item.id)
                            await loadPlaylistItems(selectedPlaylist.id)
                          } catch (err) {
                            Alert.alert('Error', 'Failed to remove item')
                          }
                        }}
                      >
                        <Ionicons name="close" size={20} color="#FF3B30" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )
                }}
                />
              )}

              {/* Floating Add Song Button */}
              <TouchableOpacity
                style={styles.fab}
                onPress={() => setShowAddSongModal(true)}
              >
                <Ionicons name="add" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* FABs */}
      <View style={styles.fabContainer}>
        {activeTab === 'playlists' && !selectedPlaylist && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setShowCreatePlaylistModal(true)}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        )}
        {activeTab === 'artists' && canManageChords && (
          <TouchableOpacity
            style={styles.fab}
            onPress={handleCreateSong}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Create Playlist Modal */}
      <Modal visible={showCreatePlaylistModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCreatePlaylistModal(false)}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Playlist</Text>
              <TouchableOpacity onPress={handleCreatePlaylist}>
                <Text style={styles.createButton}>Create</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Playlist Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter playlist name"
                value={newPlaylistTitle}
                onChangeText={setNewPlaylistTitle}
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Enter description (optional)"
                value={newPlaylistDesc}
                onChangeText={setNewPlaylistDesc}
                multiline
                numberOfLines={3}
                placeholderTextColor="#999"
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showAddSongModal} transparent animationType="slide">
  <View style={styles.modalContainer}>
    <View style={styles.modalContent}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => setShowAddSongModal(false)}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>Add Song</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.modalBody}>
        {artists.filter(artist => (artistSongs[artist.id] || []).length > 0).map((artist) => (
          <View key={artist.id}>
            <TouchableOpacity
              style={styles.artistHeader}
              onPress={() => {
                setAddSongExpandedArtists(prev => {
                  const next = new Set(prev)
                  next.has(artist.id) ? next.delete(artist.id) : next.add(artist.id)
                  return next
                })
              }}
            >
              <Text style={styles.artistName}>{artist.name}</Text>
              <Ionicons
                name={addSongExpandedArtists.has(artist.id) ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#007AFF"
              />
            </TouchableOpacity>

            {addSongExpandedArtists.has(artist.id) && (
              <View style={styles.artistSongsContainer}>
                {(artistSongs[artist.id] || []).map((song) => (
                  <TouchableOpacity
                    key={song.id}
                    style={styles.modalSongItem}
                    onPress={async () => {
                      if (!selectedPlaylist) return
                      try {
                        const maxPosition = playlistItems.length > 0
                          ? Math.max(...playlistItems.map(i => i.position)) + 1
                          : 0
                        await addToPlaylist({
                          playlistId: selectedPlaylist.id,
                          songId: song.id,
                          position: maxPosition,
                          createdAt: Date.now(),
                          synced: false,
                          userId,
                        })
                        await loadPlaylistItems(selectedPlaylist.id)
                        setShowAddSongModal(false)
                        Alert.alert('Success', `"${song.title}" added to playlist!`)
                      } catch (err) {
                        Alert.alert('Error', 'Failed to add song')
                      }
                    }}
                  >
                    <Text style={styles.songItemTitle}>{song.title}</Text>
                    <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  </View>
</Modal>
<PlaylistSongViewerModal
  visible={showSongViewer}
  songs={viewerSongs}
  startIndex={viewerStartIndex}
  onClose={() => setShowSongViewer(false)}
/>
    </View>
    
  )
}

const styles = StyleSheet.create({
    modalSongItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  tabLabelActive: {
    color: '#007AFF',
  },
  browseContainer: {
    flex: 1,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  artistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  artistName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  artistSongsContainer: {
    backgroundColor: '#f9f9f9',
    paddingLeft: 20,
  },
  songItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  songItem: {
    flex: 1,
    paddingVertical: 5,
  },
  songItemTitle: {
    fontSize: 14,
    color: '#333',
  },
  addButton: {
    padding: 8,
  },
  noSongsText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  playlistCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 6,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  playlistCardContent: {
    flex: 1,
  },
  playlistTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  playlistDesc: {
    fontSize: 12,
    color: '#999',
  },
  deletePlaylistButton: {
    padding: 8,
  },
  playlistDetailContainer: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  playlistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  playlistItemNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    minWidth: 20,
  },
  playlistItemText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  cancelButton: {
    fontSize: 14,
    color: '#999',
  },
  createButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 80,
  },
})
