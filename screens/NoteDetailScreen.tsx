// screens/NoteDetailScreen.tsx
import React, { useState, useEffect, useRef } from 'react'
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
} from 'react-native'
import { execute } from '../db/index'
import { getChordListById } from '../db/queries'
import Ionicons from '@expo/vector-icons/Ionicons'
import { onTableChange } from '../lib/sync'

interface Props {
  route: any
  navigation: any
}

export default function NoteDetailScreen({ route, navigation }: Props) {
  const { noteId } = route.params
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
const [savedAt, setSavedAt] = useState<Date | null>(null)
  const contentRef = useRef<TextInput>(null)

  useEffect(() => {
    navigation.setOptions({       headerLeft: () => null     })
    loadNote()
  }, [navigation])

  useEffect(() => {
    const unsub = onTableChange('chord_lists', () => {
      loadNote()
    })

    return () => unsub()
  }, [noteId])

  const loadNote = async () => {
    try {
      const row = await getChordListById(noteId)
      if (row) {
        setTitle(row.title)
        setContent((row as any).content || '')
if ((row as any).updatedAt) setSavedAt(new Date((row as any).updatedAt))
      }
    } catch (err) {
      console.error('Error loading note:', err)
      Alert.alert('Error', 'Failed to load note')
    } finally {
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
        'UPDATE chord_lists SET title = ?, content = ?, updated_at = ? WHERE id = ?',
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
          {hasChanges && (
            <View style={styles.unsavedDot} />
          )}
        </View>

        <TouchableOpacity
style={[styles.saveBtn, hasChanges && styles.saveBtnActive]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={!hasChanges}
        >
          <Text style={[styles.saveBtnText, hasChanges && styles.saveBtnTextActive]}>
Save
</Text>
        </TouchableOpacity>
      </View>

{/* ─── EDITOR ─── */}
      <View style={styles.editor}>
{/* Title */}
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

{/* Divider with meta */}
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.metaText}>
            {wordCount > 0
              ? `${wordCount} word${wordCount !== 1 ? 's' : ''}  ·  ${charCount} chars`
              : savedAt
                ? `Last saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'New note'}
          </Text>
          <View style={styles.divider} />
        </View>

        {/* Content */}
        <TextInput
ref={contentRef}
          style={styles.contentInput}
          placeholder="Start writing…"
          placeholderTextColor="#D0D0D0"
          value={content}
          onChangeText={(text) => {             setContent(text);             setHasChanges(true)           }}
          multiline
          textAlignVertical="top"
autoCorrect
          autoCapitalize="sentences"
        />
      </View>
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
  
  // Editor
  editor: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
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
    flex: 1,
    fontSize: 15,
    color: '#2A2A2A',
    lineHeight: 26,
    padding: 0,
    fontWeight: '400',
  },
})