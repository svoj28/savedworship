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
import { createSong } from '../db/queries'

interface Props {
  route: any
  navigation: any
}

const NASHVILLE_CHORDS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viiD', 'bI', 'bii', 'biii', 'bIV', 'bV', 'bvi', 'bviiD']
const COMMON_CHORDS    = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Dm', 'Am', 'Em', 'Gm', 'Cm', 'FM', 'C7', 'G7']
const ALL_KEYS         = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
                          'Db', 'Eb', 'Gb', 'Ab', 'Bb',
                          'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm']
const SONG_SECTIONS = [
  'Intro',
  'Verse 1', 'Verse 2', 'Verse 3',
  'Pre-Chorus',
  'Chorus', 'Chorus 2', 'Chorus 3',
  'Bridge',
  'Instrumental',
  'Outro',
  'Interlude',
  'Tag',
]

export default function AddSongScreen({ route, navigation }: Props) {
  const { chordListId } = route.params || {}
  const [title, setTitle]               = useState('')
  const [artist, setArtist]             = useState('')
  const [originalKey, setOriginalKey]   = useState('C')
  const [content, setContent]           = useState('') // unified editor
  const [youtubeUrl, setYoutubeUrl]     = useState('')
  const [loading, setLoading]           = useState(false)
  const [useNashville, setUseNashville] = useState(false)
  const [showKeyPicker, setShowKeyPicker] = useState(false)

  const artistRef  = useRef<TextInput>(null)
  const contentRef = useRef<TextInput>(null)
  // Track cursor position for chord/section insertion
  const cursorPosRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  useEffect(() => {
    navigation.setOptions({ headerLeft: () => null })
  }, [navigation])

  // Insert a chord at cursor position in the unified editor
  const handleInsertChord = (chord: string) => {
    const { start, end } = cursorPosRef.current
    const before = content.slice(0, start)
    const after = content.slice(end)
    const insertion = `[${chord}]`
    const newContent = before + insertion + after
    setContent(newContent)
    // Move cursor after the inserted chord
    const newPos = start + insertion.length
    cursorPosRef.current = { start: newPos, end: newPos }
    contentRef.current?.focus()
  }

  // Insert a section header at cursor position
  const handleInsertSection = (section: string) => {
  const { start } = cursorPosRef.current
  const before = content.slice(0, start)
  const after = content.slice(start)

  const header = section
  // Add blank line before header if there's content before it
  const prefix = before.length > 0 && !before.endsWith('\n\n')
    ? before.endsWith('\n') ? '\n' : '\n\n'
    : ''

  const newContent = before + prefix + header + '\n' + after
  setContent(newContent)

  const newPos = before.length + prefix.length + header.length + 1
  cursorPosRef.current = { start: newPos, end: newPos }
  contentRef.current?.focus()
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
  if (!content.trim()) {
    Alert.alert('Error', 'Please add chords or lyrics')
    return
  }

  const cleanedYoutubeUrl = youtubeUrl.trim()
  setLoading(true)
  try {
    const now = Date.now()
    let finalChordListId = chordListId

    const user = await getCurrentUser()
    if (!user) { Alert.alert('Error', 'User not found'); setLoading(false); return }

    if (!chordListId) {
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

    const songPayload = {
      chordListId: finalChordListId,
      title,
      content: content.trim(),
      key: originalKey,
      youtubeUrl: cleanedYoutubeUrl,
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      synced: false,
    }

    console.log('[AddSongScreen] creating song with payload:', { ...songPayload })
    await createSong(songPayload)
    console.log('[AddSongScreen] createSong returned, navigating back')
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
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
        {/* ─── SONG INFO ─── */}
        <Text style={styles.sectionLabel}>SONG INFO</Text>
        <View style={styles.card}>
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

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>YouTube</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="https://youtube.com/watch?..."
              placeholderTextColor="#C4C4C4"
              value={youtubeUrl}
              onChangeText={setYoutubeUrl}
              editable={!loading}
              returnKeyType="next"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <View style={styles.fieldDivider} />

          <TouchableOpacity style={styles.fieldRow} onPress={() => setShowKeyPicker(!showKeyPicker)} activeOpacity={0.7}>
            <Text style={styles.fieldLabel}>Key <Text style={styles.required}>*</Text></Text>
            <View style={styles.keyPickerTrigger}>
              <Text style={styles.keyPickerValue}>{originalKey}</Text>
              <Ionicons name={showKeyPicker ? 'chevron-up' : 'chevron-down'} size={14} color="#ADADAD" />
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
                  <Text style={[styles.keyCellText, originalKey === key && styles.keyCellTextActive]}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ─── SONG CONTENT (UNIFIED EDITOR) ─── */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>CHORDS & LYRICS</Text>

        {/* Chord system toggle */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity style={[styles.segment, !useNashville && styles.segmentActive]} onPress={() => setUseNashville(false)} activeOpacity={0.75}>
            <Text style={[styles.segmentText, !useNashville && styles.segmentTextActive]}>Standard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segment, useNashville && styles.segmentActive]} onPress={() => setUseNashville(true)} activeOpacity={0.75}>
            <Text style={[styles.segmentText, useNashville && styles.segmentTextActive]}>Nashville</Text>
          </TouchableOpacity>
        </View>

        {/* ─── UNIFIED EDITOR CARD ─── */}
        <View style={styles.editorCard}>

          {/* Chord shortcut chips */}
          <View style={styles.editorToolbar}>
            <Text style={styles.editorToolbarLabel}>CHORDS</Text>
            <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chordChips}>
              {chordSet.map((chord) => (
                <TouchableOpacity key={chord} style={styles.chordChip} onPress={() => handleInsertChord(chord)} activeOpacity={0.7}>
                  <Text style={styles.chordChipText}>{chord}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.editorDivider} />

          {/* Section header chips */}
          <View style={styles.editorToolbar}>
            <Text style={styles.editorToolbarLabel}>SECTIONS</Text>
            <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chordChips}>
              {SONG_SECTIONS.map((section) => (
                <TouchableOpacity key={section} style={[styles.chordChip, styles.sectionChip]} onPress={() => handleInsertSection(section)} activeOpacity={0.7}>
                  <Text style={[styles.chordChipText, styles.sectionChipText]}>{section}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.editorDivider} />

          {/* Format hint */}
          <View style={styles.formatHintRow}>
            <Ionicons name="information-circle-outline" size={12} color="#C0C0C0" />
            <Text style={styles.formatHintText}>Chords: [G]Amazing [D]grace · Sections: Verse 1</Text>
          </View>

          {/* The main text input */}
          <TextInput
            ref={contentRef}
            style={styles.editorInput}
            placeholder={'Verse 1\n[G]Amazing [D]grace, how [Em]sweet the [C]sound…\n\nChorus\n[G]That saved a [D]wretch like [C]me…'}
            placeholderTextColor="#D0D0D0"
            value={content}
            onChangeText={setContent}
            onSelectionChange={(e) => {
              cursorPosRef.current = e.nativeEvent.selection
            }}
            multiline
            editable={!loading}
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="none"
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
                <Text style={styles.submitBtnText}>Add Song</Text>
              </>
          }
        </TouchableOpacity>

        <View style={{ height: 50 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },

  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EBEBEB', gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  headerMeta: { flex: 1, gap: 2 },
  headerEyebrow: { fontSize: 9, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.4 },
  saveHeaderBtn: { backgroundColor: '#0A0A0A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, minWidth: 58, alignItems: 'center' },
  saveHeaderBtnDisabled: { backgroundColor: '#D0D0D0' },
  saveHeaderBtnText: { fontSize: 13, fontWeight: '700', color: '#FAFAFA' },
  saveHeaderBtnTextDisabled: { color: '#FFF' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#C0C0C0', letterSpacing: 1.8, marginBottom: 10 },
  required: { color: '#ADADAD' },

  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#EBEBEB', overflow: 'hidden', paddingHorizontal: 14 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  fieldDivider: { height: 1, backgroundColor: '#F4F4F4' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#0A0A0A', width: 56, flexShrink: 0 },
  fieldInput: { flex: 1, fontSize: 14, color: '#0A0A0A', fontWeight: '500', padding: 0, textAlign: 'right' },

  keyPickerTrigger: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  keyPickerValue: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 14, gap: 8, borderTopWidth: 1, borderTopColor: '#F4F4F4' },
  keyCell: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F2F2F2', borderWidth: 1, borderColor: '#EBEBEB', minWidth: 44, alignItems: 'center' },
  keyCellActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  keyCellText: { fontSize: 13, fontWeight: '700', color: '#555' },
  keyCellTextActive: { color: '#FAFAFA' },

  segmentedControl: { flexDirection: 'row', backgroundColor: '#F2F2F2', borderRadius: 12, padding: 3, marginBottom: 14, gap: 2 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segmentActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#ADADAD' },
  segmentTextActive: { color: '#0A0A0A' },

  // Unified editor card
  editorCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    overflow: 'hidden',
  },
  editorToolbar: {
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  editorToolbarLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C0C0C0',
    letterSpacing: 1.8,
  },
  editorDivider: { height: 1, backgroundColor: '#F4F4F4' },

  chordChips: { flexDirection: 'row', gap: 7, paddingRight: 14 },
  chordChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#F2F2F2',
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  chordChipText: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', letterSpacing: 0.1 },
  sectionChip: { backgroundColor: '#F7F7F0', borderColor: '#E8E8D8' },
  sectionChipText: { color: '#555533' },

  formatHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FAFAFA',
  },
  formatHintText: {
    fontSize: 11,
    color: '#C4C4C4',
    fontWeight: '500',
    fontFamily: 'Courier New',
    flex: 1,
  },

  editorInput: {
    fontSize: 14,
    color: '#0A0A0A',
    lineHeight: 24,
    minHeight: 220,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
    fontFamily: 'Courier New',
    textAlignVertical: 'top',
    borderTopWidth: 1,
    borderTopColor: '#F4F4F4',
  },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28, paddingVertical: 16, borderRadius: 16, backgroundColor: '#0A0A0A' },
  submitBtnDisabled: { backgroundColor: '#D0D0D0' },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#FAFAFA', letterSpacing: -0.2 },
})