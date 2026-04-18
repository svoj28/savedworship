// screens/AddSongScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native'
import { Song } from '../db/models'
import { execute, query } from '../db/index'
import { getCurrentUser } from '../lib/auth'
import uuid from 'react-native-uuid'

interface Props {
  route: any
  navigation: any
}

// Nashville number system chords
const NASHVILLE_CHORDS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viiD', 'bI', 'bii', 'biii', 'bIV', 'bV', 'bvi', 'bviiD']
const COMMON_CHORDS = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Dm', 'Am', 'Em', 'Gm', 'Cm', 'FM', 'C7', 'G7']

export default function AddSongScreen({ route, navigation }: Props) {
  const { chordListId } = route.params || {}
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [originalKey, setOriginalKey] = useState('C')
  const [chords, setChords] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [loading, setLoading] = useState(false)
  const [showChordSuggestions, setShowChordSuggestions] = useState(false)
  const [useNashville, setUseNashville] = useState(false)

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
    })
  }, [navigation])

  const handleAddChord = (chord: string) => {
    setChords(prev => prev + `[${chord}] `)
  }

  const handleAddSong = async () => {
    if (!title.trim() || !originalKey.trim()) {
      Alert.alert('Error', 'Please fill in Title and Original Key')
      return
    }

    // If no chordListId, we need artist name
    if (!chordListId && !artist.trim()) {
      Alert.alert('Error', 'Please enter an Artist name')
      return
    }

    // Combine chords and lyrics into content
    let content = ''
    if (chords.trim()) {
      content += `Chords: ${chords}\n\n`
    }
    if (lyrics.trim()) {
      content += lyrics
    }

    if (!content.trim()) {
      Alert.alert('Error', 'Please add either chords or lyrics')
      return
    }

    setLoading(true)

    try {
      const songId = uuid.v4()
      const now = Date.now()
      let finalChordListId = chordListId
      
      // If no chordListId, create a new chord list first
      if (!chordListId) {
        const user = await getCurrentUser()
        if (!user) {
          Alert.alert('Error', 'User not found')
          setLoading(false)
          return
        }

        // Get or create artist
        const artistRows: any[] = await query('SELECT id FROM artists WHERE name = ?', [artist.trim()])
        let artistId: string
        
        if (artistRows && artistRows.length > 0) {
          artistId = artistRows[0].id
        } else {
          // Create new artist
          artistId = uuid.v4()
          await execute(
            'INSERT INTO artists (id, name, user_id, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?)',
            [artistId, artist.trim(), user.id, now, now, 0]
          )
        }

        // Create chord list (public, is_private=0)
        finalChordListId = uuid.v4()
        await execute(
          'INSERT INTO chord_lists (id, title, artist_id, user_id, is_private, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [finalChordListId, title, artistId, user.id, 0, now, now, 0]
        )
      }
      
      // Insert song
      await execute(
        'INSERT INTO songs (id, chord_list_id, title, content, key, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [songId, finalChordListId, title, content, originalKey, now, now, 0]
      )

      navigation.goBack()
    } catch (err) {
      console.error('Error adding song:', err)
      Alert.alert('Error', 'Failed to add song')
    } finally {
      setLoading(false)
    }
  }

  const chordSuggestions = useNashville ? NASHVILLE_CHORDS : COMMON_CHORDS

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView>
        <View style={styles.content}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="Song title"
            placeholderTextColor="#999"
            value={title}
            onChangeText={setTitle}
            editable={!loading}
          />

          <Text style={styles.label}>Artist {!chordListId && '*'}</Text>
          <TextInput
            style={styles.input}
            placeholder={!chordListId ? 'Artist name (required)' : 'Artist name (optional)'}
            placeholderTextColor="#999"
            value={artist}
            onChangeText={setArtist}
            editable={!loading}
          />

          <Text style={styles.label}>Original Key *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., C, G, Dm, D, A"
            placeholderTextColor="#999"
            value={originalKey}
            onChangeText={setOriginalKey}
            editable={!loading}
          />

          {/* Chord System Toggle */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, !useNashville && styles.toggleButtonActive]}
              onPress={() => setUseNashville(false)}
            >
              <Text style={[styles.toggleText, !useNashville && styles.toggleTextActive]}>
                Standard Chords
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, useNashville && styles.toggleButtonActive]}
              onPress={() => setUseNashville(true)}
            >
              <Text style={[styles.toggleText, useNashville && styles.toggleTextActive]}>
                Nashville Numbers
              </Text>
            </TouchableOpacity>
          </View>

          {/* Chord Shortcuts */}
          <Text style={styles.label}>Chord Shortcuts</Text>
          <View style={styles.chordShortcuts}>
            {chordSuggestions.map((chord) => (
              <TouchableOpacity
                key={chord}
                style={styles.chordButton}
                onPress={() => handleAddChord(chord)}
              >
                <Text style={styles.chordButtonText}>{chord}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Chords</Text>
          <Text style={styles.hint}>
            Use [chord] format, e.g.: [G]Amazing [D]grace, or use the shortcuts above
          </Text>
          <TextInput
            style={[styles.input, styles.contentInput]}
            placeholder="Enter chords in [chord] format"
            placeholderTextColor="#999"
            value={chords}
            onChangeText={setChords}
            multiline
            editable={!loading}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Lyrics</Text>
          <TextInput
            style={[styles.input, styles.contentInput]}
            placeholder="Enter song lyrics"
            placeholderTextColor="#999"
            value={lyrics}
            onChangeText={setLyrics}
            multiline
            editable={!loading}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.disabledButton]}
            onPress={handleAddSong}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Adding...' : 'Add Song'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  contentInput: {
    height: 150,
    textAlignVertical: 'top',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginVertical: 20,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
  },
  toggleText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#fff',
  },
  chordShortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
  },
  chordButton: {
    backgroundColor: '#E8F4F8',
    borderColor: '#007AFF',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chordButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 13,
  },
  button: {
    marginTop: 30,
    marginBottom: 40,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
})
