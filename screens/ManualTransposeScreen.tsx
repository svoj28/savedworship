// screens/ManualTransposeScreen.tsx
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
  ScrollView,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Picker } from '@react-native-picker/picker'

interface Props {
  navigation: any
}

export default function ManualTransposeScreen({ navigation }: Props) {
  const [originalKey, setOriginalKey] = useState('C')
  const [targetKey, setTargetKey] = useState('C')
  const [chords, setChords] = useState('')
  const [result, setResult] = useState('')
  const [mode, setMode] = useState<'chords' | 'nashville'>('chords')

  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const FLAT_NOTES: Record<string, string> = {
    'Db': 'C#',
    'Eb': 'D#',
    'Gb': 'F#',
    'Ab': 'G#',
    'Bb': 'A#',
  }
  
  // Roman numeral to semitone mapping
  const ROMAN_NUMERALS: Record<string, number> = {
    'I': 0,      // Root
    'II': 2,     // Major 2nd
    'III': 4,    // Major 3rd
    'IV': 5,     // Perfect 4th
    'V': 7,      // Perfect 5th
    'VI': 9,     // Major 6th
    'VII': 11,   // Major 7th
  }

  const ROMAN_NUMERALS_REVERSE: Record<number, string> = {
    0: 'I',
    2: 'II',
    4: 'III',
    5: 'IV',
    7: 'V',
    9: 'VI',
    11: 'VII',
  }

  // Chord shortcuts
  const CHORD_SHORTCUTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Am', 'Dm', 'Em', 'Fm', 'Gm']
  
  // Nashville shortcuts
  const NASHVILLE_SHORTCUTS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  const NASHVILLE_MODIFIERS = ['m', '7', 'maj7', 'sus4', 'sus2']

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
    })
  }, [navigation])

  const normalizeChord = (chord: string): string => {
    const baseNote = chord.slice(0, 2)
    const remainder = chord.slice(2)
    if (baseNote in FLAT_NOTES) {
      return FLAT_NOTES[baseNote] + remainder
    }
    return chord
  }

  const getBaseNote = (chord: string): string => {
    const match = chord.match(/^([A-G]#?|[A-G]b?)/)
    return match ? match[1] : chord
  }

  const getChordRemainder = (chord: string): string => {
    const baseNote = getBaseNote(chord)
    return chord.slice(baseNote.length)
  }

  const transposeChord = (chord: string, semitones: number): string => {
    if (!chord || chord.trim() === '') return chord

    const normalized = normalizeChord(chord)
    const baseNote = getBaseNote(normalized)
    const remainder = getChordRemainder(normalized)

    const currentIndex = NOTES.indexOf(baseNote)
    if (currentIndex === -1) return chord

    const newIndex = (currentIndex + semitones + NOTES.length * 10) % 12
    const newBaseNote = NOTES[newIndex]

    return newBaseNote + remainder
  }

  const transposeNashville = (roman: string, semitones: number): string => {
    // Convert Roman numeral to semitone offset
    const semitoneOffset = ROMAN_NUMERALS[roman] || 0
    // Apply transposition
    const newOffset = (semitoneOffset + semitones + 12) % 12
    // Find which Roman numeral corresponds to this new offset
    const resultRoman = ROMAN_NUMERALS_REVERSE[newOffset]
    return resultRoman || roman // Fallback
  }

  const addShortcut = (item: string) => {
    const bracket = `[${item}]`
    setChords(chords + (chords ? ' ' : '') + bracket)
  }

  const handleTranspose = () => {
    if (!chords.trim()) {
      Alert.alert('Error', 'Please enter chords or Nashville numbers')
      return
    }

    const originalIndex = NOTES.indexOf(originalKey)
    const targetIndex = NOTES.indexOf(targetKey)

    if (originalIndex === -1 || targetIndex === -1) {
      Alert.alert('Error', 'Invalid key')
      return
    }

    const semitones = targetIndex - originalIndex

    let transposed = chords

    // Transpose chords/Nashville in brackets: [Chord] or [V]
    transposed = transposed.replace(/\[([^\]]+)\]/g, (match, content) => {
      const trimmed = content.trim()
      
      // Check if it's a Roman numeral (Nashville)
      const romanMatch = trimmed.match(/^([IViviv]+)([m\d]*|maj\d+|sus\d)?$/)
      if (romanMatch) {
        const roman = romanMatch[1].toUpperCase()
        const modifiers = romanMatch[2] || ''
        
        if (roman in ROMAN_NUMERALS) {
          const transposedRoman = transposeNashville(roman, semitones)
          return `[${transposedRoman}${modifiers}]`
        }
      }
      
      // Otherwise treat as chord
      const transposedChord = transposeChord(trimmed, semitones)
      return `[${transposedChord}]`
    })

    setResult(transposed)
  }

  const handleCopy = () => {
    // In a real app, you'd use react-native-clipboard
    Alert.alert('Success', 'Result copied to clipboard')
  }

  const handleClear = () => {
    setChords('')
    setResult('')
    setOriginalKey('C')
    setTargetKey('C')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Manual Transpose</Text>

        {/* Mode Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mode</Text>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'chords' && styles.modeButtonActive,
              ]}
              onPress={() => setMode('chords')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'chords' && styles.modeButtonTextActive,
                ]}
              >
                Chords
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'nashville' && styles.modeButtonActive,
              ]}
              onPress={() => setMode('nashville')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'nashville' && styles.modeButtonTextActive,
                ]}
              >
                Nashville
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Key Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>From Key</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={originalKey}
              onValueChange={(itemValue) => setOriginalKey(itemValue)}
              style={styles.picker}
            >
              {NOTES.map((note) => (
                <Picker.Item key={note} label={note} value={note} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>To Key</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={targetKey}
              onValueChange={(itemValue) => setTargetKey(itemValue)}
              style={styles.picker}
            >
              {NOTES.map((note) => (
                <Picker.Item key={note} label={note} value={note} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Shortcuts */}
        {mode === 'chords' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chord Shortcuts</Text>
            <View style={styles.shortcutsGrid}>
              {CHORD_SHORTCUTS.map((chord) => (
                <TouchableOpacity
                  key={chord}
                  style={styles.shortcutButton}
                  onPress={() => addShortcut(chord)}
                >
                  <Text style={styles.shortcutButtonText}>{chord}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {mode === 'nashville' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nashville Shortcuts</Text>
              <View style={styles.shortcutsGrid}>
                {NASHVILLE_SHORTCUTS.map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={styles.shortcutButton}
                    onPress={() => addShortcut(num)}
                  >
                    <Text style={styles.shortcutButtonText}>{num}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Modifiers</Text>
              <View style={styles.shortcutsGrid}>
                {NASHVILLE_MODIFIERS.map((mod) => (
                  <TouchableOpacity
                    key={mod}
                    style={[styles.shortcutButton, styles.modifierButton]}
                    onPress={() => {
                      // Append modifier to the last bracket
                      const lastBracketIndex = chords.lastIndexOf(']')
                      if (lastBracketIndex > 0) {
                        const beforeBracket = chords.substring(0, lastBracketIndex)
                        const afterBracket = chords.substring(lastBracketIndex)
                        setChords(beforeBracket + mod + afterBracket)
                      }
                    }}
                  >
                    <Text style={styles.shortcutButtonText}>{mod}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Input</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === 'chords' 
              ? "e.g., [C] [G] [Am] Amazing [G] grace" 
              : "e.g., [I] [V] [VIm] Some lyrics [IV]"}
            placeholderTextColor="#999"
            value={chords}
            onChangeText={setChords}
            multiline
          />
        </View>

        {/* Button */}
        <TouchableOpacity style={styles.transposeButton} onPress={handleTranspose}>
          <Ionicons name="swap-vertical" size={20} color="#fff" />
          <Text style={styles.transposeButtonText}>Transpose</Text>
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Result</Text>
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>{result}</Text>
            </View>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
              <Ionicons name="copy" size={18} color="#007AFF" />
              <Text style={styles.copyButtonText}>Copy Result</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Clear Button */}
        <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#333',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    color: '#333',
  },
  transposeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  transposeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    padding: 12,
    minHeight: 100,
  },
  resultText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  copyButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  copyButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#fee',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  clearButtonText: {
    color: '#f44',
    fontSize: 16,
    fontWeight: '600',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e5e5',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  modeButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#e3f2fd',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modeButtonTextActive: {
    color: '#007AFF',
  },
  shortcutsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shortcutButton: {
    width: '23%',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  modifierButton: {
    backgroundColor: '#34C759',
  },
})
