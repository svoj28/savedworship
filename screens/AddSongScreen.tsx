// screens/AddSongScreen.tsx
import React, { useState, useEffect, useRef } from 'react'
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
  StatusBar,
} from 'react-native'
import { execute, query } from '../db/index'
import { getCurrentUser } from '../lib/auth'
import uuid from 'react-native-uuid'
import Ionicons from '@expo/vector-icons/Ionicons'

interface Props {
  route: any
  navigation: any
}

const NASHVILLE_CHORDS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viiD', 'bI', 'bii', 'biii', 'bIV', 'bV', 'bvi', 'bviiD']
const COMMON_CHORDS   = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Dm', 'Am', 'Em', 'Gm', 'Cm', 'FM', 'C7', 'G7']
const ALL_KEYS        = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
                         'Db', 'Eb', 'Gb', 'Ab', 'Bb',
                         'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm']

export default function AddSongScreen({ route, navigation }: Props) {
  const { chordListId } = route.params || {}
  const [title, setTitle]             = useState('')
  const [artist, setArtist]           = useState('')
  const [originalKey, setOriginalKey] = useState('C')
  const [chords, setChords]           = useState('')
  const [lyrics, setLyrics]           = useState('')
  const [loading, setLoading]         = useState(false)
  const [useNashville, setUseNashville] = useState(false)
const [showKeyPicker, setShowKeyPicker] = useState(false)

  const artistRef  = useRef<TextInput>(null)
  const chordsRef  = useRef<TextInput>(null)
  const lyricsRef  = useRef<TextInput>(null)

  useEffect(() => {
    navigation.setOptions({       headerLeft: () => null     })
  }, [navigation])

  const handleAddChord = (chord: string) => {
    setChords(prev => prev ? `${prev}[${chord}] ` : `[${chord}] `)
  }

  const handleAddSong = async () => {
    if (!title.trim() || !originalKey.trim()) {
      Alert.alert('Error', 'Please fill in Title and Key')
      return
    }
    if (!chordListId && !artist.trim()) {
      Alert.alert('Error', 'Please enter an Artist name')
      return
    }

        let content = ''
    if (chords.trim())       content += chords.trim() + '\n\n'
    if (lyrics.trim())       content += lyrics.trim()

    if (!content.trim()) {
      Alert.alert('Error', 'Please add chords or lyrics')
      return
    }

    setLoading(true)
    try {
      const songId = uuid.v4() as string
      const now = Date.now()
      let finalChordListId = chordListId
      
            if (!chordListId) {
        const user = await getCurrentUser()
        if (!user) {           Alert.alert('Error', 'User not found');           setLoading(false);           return         }

                const artistRows: any[] = await query('SELECT id FROM artists WHERE name = ?', [artist.trim()])
        let artistId: string
        
        if (artistRows && artistRows.length > 0) {
          artistId = artistRows[0].id
        } else {
                    artistId = uuid.v4() as string
          await execute(
            'INSERT INTO artists (id, name, user_id, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?)',
            [artistId, artist.trim(), user.id, now, now, 0]
          )
        }

                finalChordListId = uuid.v4() as string
        await execute(
          'INSERT INTO chord_lists (id, title, artist_id, user_id, is_private, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [finalChordListId, title, artistId, user.id, 0, now, now, 0]
        )
      }
      
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

  const chordSet = useNashville ? NASHVILLE_CHORDS : COMMON_CHORDS

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color="#0A0A0A" />
        </TouchableOpacity>
        <View style={styles.headerMeta}>
          <Text style={styles.headerEyebrow}>NEW SONG</Text>
          <Text style={styles.headerTitle}>Add Song</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveHeaderBtn, loading && styles.saveHeaderBtnDisabled]}
          onPress={handleAddSong}
          disabled={loading}
          activeOpacity={0.8}
>
          <Text style={[styles.saveHeaderBtnText, loading && styles.saveHeaderBtnTextDisabled]}>
            {loading ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── SECTION: SONG INFO ─── */}
        <Text style={styles.sectionLabel}>SONG INFO</Text>

        <View style={styles.card}>
          {/* Title */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Title <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Song title"
            placeholderTextColor="#C4C4C4"
            value={title}
            onChangeText={setTitle}
            editable={!loading}
          returnKeyType="next"
              onSubmitEditing={() => artistRef.current?.focus()}
            />
          </View>

          <View style={styles.fieldDivider} />

          {/* Artist */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>
Artist {!chordListId && <Text style={styles.required}>*</Text>}
</Text>
          <TextInput
ref={artistRef}
            style={styles.fieldInput}
            placeholder={!chordListId ? 'Required' : 'Optional'}
            placeholderTextColor="#C4C4C4"
            value={artist}
            onChangeText={setArtist}
            editable={!loading}
          returnKeyType="next"
            />
          </View>

          <View style={styles.fieldDivider} />

          {/* Key */}
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => setShowKeyPicker(!showKeyPicker)}
            activeOpacity={0.7}
          >
            <Text style={styles.fieldLabel}>Key <Text style={styles.required}>*</Text></Text>
            <View style={styles.keyPickerTrigger}>
              <Text style={styles.keyPickerValue}>{originalKey}</Text>
              <Ionicons
                name={showKeyPicker ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#ADADAD"
              />
            </View>
          </TouchableOpacity>

          {showKeyPicker && (
          <View style={styles.keyGrid}>
{ALL_KEYS.map((key) => (
            <TouchableOpacity
key={key}
              style={[styles.keyCell, originalKey === key && styles.keyCellActive]}
                  onPress={() => { setOriginalKey(key); setShowKeyPicker(false) }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.keyCellText, originalKey === key && styles.keyCellTextActive]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ─── SECTION: CHORDS ─── */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>CHORDS</Text>

        {/* Chord system toggle */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segment, !useNashville && styles.segmentActive]}
              onPress={() => setUseNashville(false)}
activeOpacity={0.75}
            >
              <Text style={[styles.segmentText, !useNashville && styles.segmentTextActive]}>
                Standard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, useNashville && styles.segmentActive]}
              onPress={() => setUseNashville(true)}
activeOpacity={0.75}
            >
              <Text style={[styles.segmentText, useNashville && styles.segmentTextActive]}>
                Nashville
              </Text>
            </TouchableOpacity>
          </View>

          {/* Chord shortcut chips */}
                    <View style={styles.chordChips}>
            {chordSet.map((chord) => (
              <TouchableOpacity
                key={chord}
                style={styles.chordChip}
                onPress={() => handleAddChord(chord)}
activeOpacity={0.7}
              >
                <Text style={styles.chordChipText}>{chord}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chord input */}
        <View style={styles.card}>
          <Text style={styles.inputHint}>
            <Ionicons name="information-circle-outline" size={12} color="#C0C0C0" />
            {'  '}Wrap chords in brackets: [G]Amazing [D]grace
          </Text>
          <TextInput
ref={chordsRef}
            style={styles.multilineInput}
            placeholder="[G]Amazing [D]grace, how [Em]sweet the [C]sound…"
            placeholderTextColor="#D0D0D0"
            value={chords}
            onChangeText={setChords}
            multiline
            editable={!loading}
            textAlignVertical="top"
autoCorrect={false}
            autoCapitalize="none"
          />
</View>

{/* ─── SECTION: LYRICS ─── */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>LYRICS</Text>

        <View style={styles.card}>
          <TextInput
ref={lyricsRef}
            style={styles.multilineInput}
            placeholder="Enter song lyrics here…"
            placeholderTextColor="#D0D0D0"
            value={lyrics}
            onChangeText={setLyrics}
            multiline
            editable={!loading}
            textAlignVertical="top"
autoCapitalize="sentences"
          />
</View>

{/* ─── SUBMIT ─── */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleAddSong}
            disabled={loading}
          activeOpacity={0.82}
        >
          {loading
            ? <Text style={styles.submitBtnText}>Saving…</Text>
            : <>
                <Ionicons name="add" size={18} color="#FAFAFA" style={{ marginRight: 8 }} />
            <Text style={styles.submitBtnText}>Add Song            </Text>
</>
          }
          </TouchableOpacity>
        
        <View style={{ height: 50 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
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
  headerMeta: { flex: 1, gap: 2 },
  headerEyebrow: { fontSize: 9, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.4 },
  saveHeaderBtn: {
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 58,
    alignItems: 'center',
  },
  saveHeaderBtnDisabled: { backgroundColor: '#D0D0D0' },
  saveHeaderBtnText: { fontSize: 13, fontWeight: '700', color: '#FAFAFA' },
  saveHeaderBtnTextDisabled: { color: '#FFF' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Section labels
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C0C0C0',
letterSpacing: 1.8,
    marginBottom: 10,
  },
  required: { color: '#ADADAD' },

  // Card
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  
  // Field rows inside card
  fieldRow: {
    flexDirection: 'row',
        alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  fieldDivider: {
height: 1,
    backgroundColor: '#F4F4F4',
marginLeft: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A0A0A',
    width: 56,
    flexShrink: 0,
  },
  fieldInput: {
    flex: 1,
    fontSize: 14,
    color: '#0A0A0A',
    fontWeight: '500',
  padding: 0,
    textAlign: 'right',
  },

  // Key picker
  keyPickerTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  keyPickerValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  keyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
paddingVertical: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F4',
  },
  keyCell: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    borderWidth: 1,
    borderColor: '#EBEBEB',
    minWidth: 44,
    alignItems: 'center',
  },
  keyCellActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  keyCellText: { fontSize: 13, fontWeight: '700', color: '#555' },
  keyCellTextActive: { color: '#FAFAFA' },

  // Segmented control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
    gap: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#ADADAD' },
  segmentTextActive: { color: '#0A0A0A' },

  // Chord chips
  chordChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 12,
  },
  chordChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
borderRadius: 9,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  chordChipText: {
        fontSize: 13,
  fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: 0.1,
  },

  // Multiline input inside card
  inputHint: {
    fontSize: 11,
    color: '#C4C4C4',
    fontWeight: '500',
    paddingTop: 12,
    paddingBottom: 8,
    fontFamily: 'Courier New',
  },
  multilineInput: {
    fontSize: 14,
    color: '#0A0A0A',
    lineHeight: 24,
    minHeight: 130,
    paddingTop: 12,
    paddingBottom: 14,
    fontFamily: 'Courier New',
    textAlignVertical: 'top',
  },

  // Submit button
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  justifyContent: 'center',
    marginTop: 28,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#0A0A0A',
  },
  submitBtnDisabled: { backgroundColor: '#D0D0D0' },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#FAFAFA', letterSpacing: -0.2 },
})