// screens/NoteDetailScreen.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { execute, queryOne } from '../db/index'

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

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
    })
    loadNote()
  }, [navigation])

  const loadNote = async () => {
    try {
      const row: any = await queryOne('SELECT * FROM chord_lists WHERE id = ?', [noteId])
      if (row) {
        setTitle(row.title)
        setContent(row.content || '')
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
      await execute(
        'UPDATE chord_lists SET title = ?, content = ?, updated_at = ? WHERE id = ?',
        [title.trim(), content, Date.now(), noteId]
      )
      setHasChanges(false)
      navigation.goBack()
    } catch (err) {
      console.error('Error saving note:', err)
      Alert.alert('Error', 'Failed to save note')
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert('Discard Changes?', 'You have unsaved changes', [
        { text: 'Keep Editing' },
        {
          text: 'Discard',
          onPress: () => navigation.goBack(),
          style: 'destructive',
        },
      ])
    } else {
      navigation.goBack()
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelButton}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButtonContainer}
        >
          <Text style={styles.saveButton}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <TextInput
          style={styles.titleInput}
          placeholder="Title"
          placeholderTextColor="#ccc"
          value={title}
          onChangeText={(text) => {
            setTitle(text)
            setHasChanges(true)
          }}
        />

        <TextInput
          style={styles.contentInput}
          placeholder="Start typing..."
          placeholderTextColor="#ccc"
          value={content}
          onChangeText={(text) => {
            setContent(text)
            setHasChanges(true)
          }}
          multiline
          textAlignVertical="top"
        />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  cancelButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  saveButtonContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
})
