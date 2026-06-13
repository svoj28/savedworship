// screens/NoteDetailScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Keyboard,
} from 'react-native'
import { execute, queryOne } from '../db/index'
import { getChordListById } from '../db/queries'
import Ionicons from '@expo/vector-icons/Ionicons'
import { onTableChange } from '../lib/sync'

interface Props {
  route: any
  navigation: any
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B',
}

function normalizeNote(note: string): string {
  return FLAT_TO_SHARP[note] ?? note
}

function transposeNote(note: string, semitones: number): string {
  const normalized = normalizeNote(note)
  const index = NOTES.indexOf(normalized)
  if (index === -1) return note
  return NOTES[(index + semitones + 12) % 12]
}

// Detects chords even without brackets — e.g. "Am", "G/B", "Cmaj7", "F#m"
function getChordRegex() {
  return /\b([A-G][b#]?)((?:maj|min|m|M|sus|aug|dim|add|dom)?(?:\d+)?(?:\/[A-G][b#]?)?)\b/g
}

function transposeContent(content: string, semitones: number): string {
  return content.replace(getChordRegex(), (match, root, suffix) => {
    if (/^[a-z]/.test(suffix) && !['m', 'maj', 'min', 'sus', 'aug', 'dim', 'add'].some(s => suffix.startsWith(s))) {
      return match
    }
    const transposedRoot = transposeNote(root, semitones)
    const slashMatch = suffix.match(/\/([A-G][b#]?)(.*)/)
    if (slashMatch) {
      const transposedBass = transposeNote(slashMatch[1], semitones)
      return `${transposedRoot}${suffix.replace(slashMatch[0], `/${transposedBass}${slashMatch[2]}`)}`
    }
    return `${transposedRoot}${suffix}`
  })
}

function detectKey(content: string): string | null {
  const matches = [...content.matchAll(getChordRegex())]
  if (matches.length === 0) return null
  const counts: Record<string, number> = {}
  for (const [, root] of matches) {
    const norm = normalizeNote(root)
    counts[norm] = (counts[norm] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}



export default function NoteDetailScreen({ route, navigation }: Props) {
  const { noteId } = route.params
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
const [savedAt, setSavedAt] = useState<Date | null>(null)
  const contentRef = useRef<TextInput>(null)
  const hasLoadedOnceRef = useRef(false)
  const [showTranspose, setShowTranspose] = useState(false)
const [semitones, setSemitones] = useState(0)
const [transposedContent, setTransposedContent] = useState('')
const detectedKey = detectKey(content)

  useEffect(() => {
    navigation.setOptions({       headerLeft: () => null     })
    void loadNote({ silent: hasLoadedOnceRef.current })
  }, [navigation])

  useEffect(() => {
    const unsub = onTableChange('chord_lists', () => {
      void loadNote({ silent: true })
    })

    return () => unsub()
  }, [noteId])

  useEffect(() => {
  if (semitones === 0) {
    setTransposedContent(content)
  } else {
    setTransposedContent(transposeContent(content, semitones))
  }
}, [content, semitones])
  
  const loadNote = async ({ silent = false }: { silent?: boolean } = {}) => {
  try {
    if (!silent) setLoading(true)
    // Always use local SQLite — private notes are not synced to Supabase
    const row = await queryOne('SELECT * FROM chord_lists WHERE id = ?', [noteId]) as any
    if (row) {
      setTitle(row.title ?? '')
      setContent(row.content ?? '')
      if (row.updated_at) setSavedAt(new Date(row.updated_at))
    }
  } catch (err) {
    console.error('Error loading note:', err)
    Alert.alert('Error', 'Failed to load note')
  } finally {
    hasLoadedOnceRef.current = true
    setLoading(false)
  }
}

  const handleSave = async () => {
  if (!title.trim()) {
    Alert.alert('Error', 'Please enter a title')
    return
  }
  try {
    const now = Date.now()
    await execute(
      'UPDATE chord_lists SET title = ?, content = ?, updated_at = ?, _synced = 0 WHERE id = ?',
      [title.trim(), content, now, noteId]
    )
    setHasChanges(false)
    setSavedAt(new Date(now))
    navigation.goBack()
  } catch (err) {
    console.error('Error saving note:', err)
    Alert.alert('Error', 'Failed to save note')
  }
}

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert('Discard Changes?', 'You have unsaved changes.', [
        { text: 'Keep Editing', style: 'cancel' },
        {           text: 'Discard', style: 'destructive',           onPress: () => navigation.goBack()         },
      ])
    } else {
      navigation.goBack()
    }
  }

  const wordCount = content.trim().length > 0
    ? content.trim().split(/\s+/).length
    : 0

  const charCount = content.length

  return (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={styles.container}
  >
    <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

    {/* ─── HEADER ─── */}
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={handleCancel}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={16} color="#0A0A0A" />
      </TouchableOpacity>

      <View style={styles.headerCenter}>
        <Text style={styles.headerEyebrow}>NOTE</Text>
        {hasChanges && <View style={styles.unsavedDot} />}
      </View>

      {/* <TouchableOpacity
  style={[styles.transposeToggleBtn, showTranspose && { backgroundColor: '#0A0A0A' }]}
  onPress={() => setShowTranspose(prev => !prev)}
  activeOpacity={0.75}
>
        <Ionicons name="musical-notes-outline" size={15} color={showTranspose ? '#FFF' : '#0A0A0A'} />
        <Text style={[styles.transposeToggleText, showTranspose && styles.transposeToggleTextActive]}>
          {semitones === 0 ? 'Transpose' : `+${semitones > 0 ? semitones : semitones}`}
        </Text>
      </TouchableOpacity> */}

        <TouchableOpacity
          style={[styles.saveBtn, hasChanges && styles.saveBtnActive]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={!hasChanges}
        >
          <Text style={[styles.saveBtnText, hasChanges && styles.saveBtnTextActive]}>Save</Text>
        </TouchableOpacity>
    </View>

    {/* ─── TRANSPOSE BAR ─── */}
    {showTranspose && (
      <View style={styles.transposeBar}>
        {detectedKey && (
          <Text style={styles.transposeKeyLabel}>
            Key: <Text style={styles.transposeKeyValue}>{detectedKey}</Text>
            {semitones !== 0 && (
              <Text style={styles.transposeKeyValue}>
                {' → '}{transposeNote(detectedKey, semitones)}
              </Text>
            )}
          </Text>
        )}
        <View style={styles.transposeControls}>
          <TouchableOpacity
            style={styles.transposeBtn}
            onPress={() => setSemitones(prev => prev - 1)}
            activeOpacity={0.75}
          >
            <Ionicons name="remove" size={18} color="#0A0A0A" />
          </TouchableOpacity>

          <View style={styles.semitoneDisplay}>
            <Text style={styles.semitoneValue}>
              {semitones > 0 ? `+${semitones}` : semitones}
            </Text>
            <Text style={styles.semitoneLabel}>semitones</Text>
          </View>

          <TouchableOpacity
            style={styles.transposeBtn}
            onPress={() => setSemitones(prev => prev + 1)}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={18} color="#0A0A0A" />
          </TouchableOpacity>

          {semitones !== 0 && (
            <TouchableOpacity
              style={styles.transposeClearBtn}
              onPress={() => setSemitones(0)}
              activeOpacity={0.75}
            >
              <Text style={styles.transposeClearText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )}

    {/* ─── EDITOR ─── */}
    <ScrollView
      style={styles.editorScroll}
      contentContainerStyle={styles.editorContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <TextInput
        style={styles.titleInput}
        placeholder="Untitled"
        placeholderTextColor="#D4D4D4"
        value={title}
        onChangeText={(text) => { setTitle(text); setHasChanges(true) }}
        returnKeyType="next"
        onSubmitEditing={() => contentRef.current?.focus()}
        blurOnSubmit={false}
      />

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.metaText}>
          {content.trim().length > 0
            ? `${content.trim().split(/\s+/).length} words  ·  ${content.length} chars`
            : savedAt
              ? `Last saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'New note'}
        </Text>
        <View style={styles.divider} />
      </View>

      {/* Show transposed read-only view OR editable input */}
      {showTranspose && semitones !== 0 ? (
        <View style={styles.transposedPreview}>
          <Text style={styles.transposedPreviewLabel}>TRANSPOSED VIEW</Text>
          <Text style={styles.transposedText}>{transposedContent}</Text>
        </View>
      ) : (
        <TextInput
          ref={contentRef}
          style={styles.contentInput}
          placeholder="Start writing…"
          placeholderTextColor="#D0D0D0"
          value={content}
          onChangeText={(text) => { setContent(text); setHasChanges(true) }}
          multiline
          textAlignVertical="top"
          autoCorrect
          autoCapitalize="sentences"
          scrollEnabled={false}
        />
      )}
    </ScrollView>
  </KeyboardAvoidingView>
)
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    backgroundColor: '#FFF',
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C0C0C0',
    letterSpacing: 2.5,
  },
  unsavedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0A0A0A',
  },
  transposeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
  },
  transposeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  transposeToggleTextActive: {
    color: '#FFF',
  },
  saveBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F2F2F2',
    minWidth: 58,
    alignItems: 'center',
  },
  saveBtnActive: {
    backgroundColor: '#0A0A0A',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C0C0C0',
  },
  saveBtnTextActive: {
    color: '#FAFAFA',
  },

  // Transpose bar
  transposeBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    gap: 10,
  },
  transposeKeyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ABABAB',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  transposeKeyValue: {
    color: '#0A0A0A',
    fontWeight: '800',
  },
  transposeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  transposeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  semitoneDisplay: {
    alignItems: 'center',
    minWidth: 72,
  },
  semitoneValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.5,
  },
  semitoneLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#BDBDBD',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  transposeClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0A0A0A',
  },
  transposeClearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },

  // Editor
  editorScroll: {
    flex: 1,
  },
  editorContent: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 60,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0A0A0A',
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 16,
    padding: 0,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#C8C8C8',
    letterSpacing: 0.3,
  },
  contentInput: {
    fontSize: 15,
    color: '#2A2A2A',
    lineHeight: 26,
    padding: 0,
    fontWeight: '400',
    minHeight: 300,
  },

  // Transposed preview
  transposedPreview: {
    backgroundColor: '#F8F8F8',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  transposedPreviewLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#BDBDBD',
    letterSpacing: 2,
    marginBottom: 12,
  },
  transposedText: {
    fontSize: 15,
    color: '#2A2A2A',
    lineHeight: 26,
    fontWeight: '400',
  },
})