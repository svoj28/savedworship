// screens/ChordListsHomeScreen.tsx
/**
 * Main screen showing all artists with expandable song browsers
 * Allows users to browse songs by artist and navigate to ChordListScreen
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
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { getCurrentUser } from '../lib/auth'
import { query } from '../db/index'

interface Props {
  navigation: any
}

export default function ChordListsHomeScreen({ navigation }: Props) {
  const [artists, setArtists] = useState<any[]>([])
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set())
  const [artistSongs, setArtistSongs] = useState<{ [key: string]: any[] }>({})
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    React.useCallback(() => {
      loadArtists()
    }, [])
  )

  const loadArtists = async () => {
    try {
      setLoading(true)

      const rows: any[] = await query('SELECT DISTINCT id, name FROM artists ORDER BY name')
      setArtists(rows || [])
      
      // Load songs for each artist (only public chord lists)
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
      Alert.alert('Error', 'Failed to load artists')
    } finally {
      setLoading(false)
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
    // Navigate to AddSongScreen to create a new song
    navigation.navigate('AddSong', {})
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
      {artists.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No artists yet. Create one to get started!</Text>
        </View>
      ) : (
        <ScrollView style={styles.browseContainer}>
          {artists.filter(artist => (artistSongs[artist.id] || []).length > 0).map((artist) => (
            <View key={artist.id}>
              {/* Artist Header - Tappable */}
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

              {/* Songs List - Shown when Expanded */}
              {expandedArtists.has(artist.id) && (
                <View style={styles.artistSongsContainer}>
                  {(artistSongs[artist.id] || []).length === 0 ? (
                    <Text style={styles.noSongsText}>No songs yet</Text>
                  ) : (
                    (artistSongs[artist.id] || []).map((song) => (
                      <TouchableOpacity
                        key={song.id}
                        style={styles.songItem}
                        onPress={() => handleSelectSong(song)}
                      >
                        <Text style={styles.songItemTitle}>{song.title}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Floating Action Button - Navigate to AddSongScreen */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateSong}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
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
  browseContainer: {
    flex: 1,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
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
  songItem: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  songItemTitle: {
    fontSize: 14,
    color: '#333',
  },
  noSongsText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
})
