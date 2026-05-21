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
import { Clipboard } from 'react-native'

// Monochrome palette - Formal & Professional
const COLORS = {
  black: '#1a1a1a',
  darkGray: '#333333',
  mediumGray: '#666666',
  lightGray: '#cccccc',
  veryLightGray: '#f0f0f0',
  offWhite: '#fafafa',
  white: '#ffffff',
}

interface Props {
  navigation: any
}

// ─── Music Theory Constants ────────────────────────────────────────────────────

// Canonical chromatic scale using sharps
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Enharmonic flat → sharp normalisation map
const FLAT_TO_SHARP: Record<string, string> = {
  'Cb': 'B',
  'Db': 'C#',
  'Eb': 'D#',
  'Fb': 'E',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
}

// Keys that conventionally prefer flat spelling
const FLAT_KEY_ROOTS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'])

// When outputting in a flat-preferring key, map sharps back to flats
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
}

// Nashville Roman numeral ↔ semitone (relative to root = 0)
// Covers all 12 semitones so no transposition can produce an unmapped value
const ROMAN_TO_SEMITONE: Record<string, number> = {
  'I':   0,
  'bII': 1,
  'II':  2,
  'bIII':3,
  'III': 4,
  'IV':  5,
  'bV':  6,
  '#IV': 6,  // enharmonic alias
  'V':   7,
  'bVI': 8,
  'VI':  9,
  'bVII':10,
  'VII': 11,
}

// Canonical output for each semitone (prefers common Nashville spellings)
const SEMITONE_TO_ROMAN: Record<number, string> = {
  0:  'I',
  1:  'bII',
  2:  'II',
  3:  'bIII',
  4:  'III',
  5:  'IV',
  6:  'bV',
  7:  'V',
  8:  'bVI',
  9:  'VI',
  10: 'bVII',
  11: 'VII',
}

// All valid Roman numeral tokens (order matters — longest first for regex)
const ALL_ROMANS = Object.keys(ROMAN_TO_SEMITONE).sort((a, b) => b.length - a.length)
const ROMAN_PATTERN = ALL_ROMANS.map(r => r.replace('#', '\\#')).join('|')

// ─── Chord parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a root note from the start of a string.
 * Returns { root, remainder } or null if no valid root found.
 * Handles: C  C#  Db  Bb  etc.
 */
function parseRoot(str: string): { root: string; remainder: string } | null {
  // Match a note letter optionally followed by # or b (but not 'b' if it's
  // followed by another letter that makes it look like a chord quality, e.g. "Bm" → root "B")
  const match = str.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return null

  let root = match[1]
  let remainder = match[2]

  // "Ab" is a flat — keep it. But "Bbm" → root "Bb", remainder "m".
  // Edge case: "Bb" alone → root "Bb". "B" alone → root "B". Already handled by regex.

  return { root, remainder }
}

/**
 * Normalise a root note to its sharp equivalent (canonical form).
 */
function normaliseRoot(root: string): string {
  return FLAT_TO_SHARP[root] ?? root
}

/**
 * Given a canonical (sharp) root note and a target key root, return the
 * preferred spelling (sharp or flat) for that key.
 */
function spellNote(canonicalNote: string, targetKeyRoot: string): string {
  if (FLAT_KEY_ROOTS.has(targetKeyRoot)) {
    return SHARP_TO_FLAT[canonicalNote] ?? canonicalNote
  }
  return canonicalNote
}

/**
 * Transpose a single chord string by `semitones`.
 * Handles: simple chords (Am), slash chords (G/B), suspended, maj7, add9, etc.
 * The chord quality/suffix is passed through unchanged.
 */
function transposeChord(chord: string, semitones: number, targetKeyRoot: string): string {
  if (!chord.trim()) return chord

  // Handle slash chords: transpose both sides independently
  const slashIdx = chord.indexOf('/')
  if (slashIdx !== -1) {
    const left  = chord.slice(0, slashIdx)
    const right = chord.slice(slashIdx + 1)
    return transposeChord(left, semitones, targetKeyRoot) + '/' + transposeChord(right, semitones, targetKeyRoot)
  }

  const parsed = parseRoot(chord)
  if (!parsed) return chord  // not a chord we recognise — pass through

  const { root, remainder } = parsed

  const canonical = normaliseRoot(root)
  const idx = SHARP_NOTES.indexOf(canonical)
  if (idx === -1) return chord  // unknown root — pass through

  const newIdx = ((idx + semitones) % 12 + 12) % 12
  const newCanonical = SHARP_NOTES[newIdx]
  const newRoot = spellNote(newCanonical, targetKeyRoot)

  return newRoot + remainder
}

// ─── Nashville parsing ─────────────────────────────────────────────────────────

/**
 * Parse a Nashville numeral token from the start of a string.
 * Handles: I  bII  #IV  VIm  Vmaj7  bVIIsus4  etc.
 * Also accepts lowercase: i  iv  vim  etc. (normalises to uppercase)
 */
function parseNashville(str: string): { numeral: string; modifiers: string } | null {
  // Build a regex that matches any known Roman numeral (with optional flat/sharp prefix)
  const re = new RegExp(`^(${ROMAN_PATTERN})(.*)$`, 'i')
  const match = str.match(re)
  if (!match) return null

  // Normalise case: the numeral part should be uppercase (but 'b'/'#' prefix stays)
  const rawNumeral = match[1]
  const modifiers  = match[2] ?? ''

  // Reconstruct canonical casing: leading b/#, then uppercase letters
  const numeralCanon = rawNumeral.replace(/([biIvV]+)/g, (m) => m.toUpperCase()).replace(/^B/, 'b')
  // Simpler: just uppercase and then fix the flat prefix
  const upperNum = rawNumeral.toUpperCase()
  // "BVII" → "bVII", "#IV" stays as-is
  const finalNumeral = rawNumeral.startsWith('b') || rawNumeral.startsWith('B')
    ? 'b' + upperNum.slice(1)
    : rawNumeral.startsWith('#')
    ? '#' + upperNum.slice(1)
    : upperNum

  if (!(finalNumeral in ROMAN_TO_SEMITONE)) return null
  return { numeral: finalNumeral, modifiers }
}

/**
 * Transpose a Nashville numeral by `semitones`.
 * Preserves modifiers (m, maj7, sus4, 7, etc.).
 */
function transposeNashville(token: string, semitones: number): string {
  const parsed = parseNashville(token)
  if (!parsed) return token

  const { numeral, modifiers } = parsed
  const currentSemitone = ROMAN_TO_SEMITONE[numeral]
  if (currentSemitone === undefined) return token

  const newSemitone = ((currentSemitone + semitones) % 12 + 12) % 12
  const newNumeral  = SEMITONE_TO_ROMAN[newSemitone]
  if (!newNumeral) return token

  return newNumeral + modifiers
}

// ─── Bracket transposition ─────────────────────────────────────────────────────

/**
 * Given the content inside [...], decide whether it's a Nashville numeral or a
 * regular chord and transpose accordingly.
 */
function transposeBracketContent(
  content: string,
  semitones: number,
  targetKeyRoot: string,
): string {
  const trimmed = content.trim()

  // Try Nashville first (Roman numeral with optional leading b/#)
  const nashvilleParsed = parseNashville(trimmed)
  if (nashvilleParsed) {
    return transposeNashville(trimmed, semitones)
  }

  // Otherwise treat as a regular chord
  return transposeChord(trimmed, semitones, targetKeyRoot)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManualTransposeScreen({ navigation }: Props) {
  const [originalKey, setOriginalKey] = useState('C')
  const [targetKey, setTargetKey] = useState('C')
  const [chords, setChords] = useState('')
  const [result, setResult] = useState('')
  const [mode, setMode] = useState<'chords' | 'nashville'>('chords')

  // Display notes for the key pickers (include common flats for UX)
  const PICKER_NOTES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']

  const CHORD_SHORTCUTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Am', 'Dm', 'Em', 'Fm', 'Gm', 'Bm', 'C#m', 'F#m']
  const NASHVILLE_SHORTCUTS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  const NASHVILLE_MODIFIERS = ['m', '7', 'maj7', 'sus4', 'sus2', 'dim', 'aug', '2']

  useEffect(() => {
    navigation.setOptions({ headerLeft: () => null })
  }, [navigation])

  const addShortcut = (item: string) => {
    const bracket = `[${item}]`
    setChords(prev => prev + (prev ? ' ' : '') + bracket)
  }

  const handleTranspose = () => {
    if (!chords.trim()) {
      Alert.alert('Error', 'Please enter chords or Nashville numbers')
      return
    }

    // Resolve picker values to canonical (sharp) for semitone calculation
    const fromRoot = normaliseRoot(originalKey)
    const toRoot   = normaliseRoot(targetKey)

    const fromIdx = SHARP_NOTES.indexOf(fromRoot)
    const toIdx   = SHARP_NOTES.indexOf(toRoot)

    if (fromIdx === -1 || toIdx === -1) {
      Alert.alert('Error', 'Invalid key selection')
      return
    }

    const semitones = ((toIdx - fromIdx) + 12) % 12

    const transposed = chords.replace(/\[([^\]]+)\]/g, (_match, content) => {
      return '[' + transposeBracketContent(content, semitones, targetKey) + ']'
    })

    setResult(transposed)
  }

  const handleCopy = () => {
    try {
      Clipboard.setString(result)
      Alert.alert('Copied', 'Result copied to clipboard')
    } catch {
      Alert.alert('Error', 'Failed to copy to clipboard')
    }
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
              style={[styles.modeButton, mode === 'chords' && styles.modeButtonActive]}
              onPress={() => setMode('chords')}
            >
              <Text style={[styles.modeButtonText, mode === 'chords' && styles.modeButtonTextActive]}>
                Chords
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'nashville' && styles.modeButtonActive]}
              onPress={() => setMode('nashville')}
            >
              <Text style={[styles.modeButtonText, mode === 'nashville' && styles.modeButtonTextActive]}>
                Nashville
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Key Selection */}
        <View style={styles.keyRow}>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={styles.sectionTitle}>From Key</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={originalKey}
                onValueChange={setOriginalKey}
                style={styles.picker}
              >
                {PICKER_NOTES.map(note => (
                  <Picker.Item key={note} label={note} value={note} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.keyArrow}>
            <Ionicons name="arrow-forward" size={20} color={COLORS.mediumGray} />
          </View>

          <View style={[styles.section, { flex: 1 }]}>
            <Text style={styles.sectionTitle}>To Key</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={targetKey}
                onValueChange={setTargetKey}
                style={styles.picker}
              >
                {PICKER_NOTES.map(note => (
                  <Picker.Item key={note} label={note} value={note} />
                ))}
              </Picker>
            </View>
          </View>
        </View>

        {/* Shortcuts */}
        {mode === 'chords' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chord Shortcuts</Text>
            <View style={styles.shortcutsGrid}>
              {CHORD_SHORTCUTS.map(chord => (
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
                {NASHVILLE_SHORTCUTS.map(num => (
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
                {NASHVILLE_MODIFIERS.map(mod => (
                  <TouchableOpacity
                    key={mod}
                    style={[styles.shortcutButton, styles.modifierButton]}
                    onPress={() => {
                      setChords(prev => {
                        const lastBracket = prev.lastIndexOf(']')
                        if (lastBracket < 0) return prev
                        return prev.slice(0, lastBracket) + mod + prev.slice(lastBracket)
                      })
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
            placeholder={
              mode === 'chords'
                ? 'e.g., [C] [G] [Am] Amazing [G] grace'
                : 'e.g., [I] [V] [VIm] Some lyrics [IV]'
            }
            placeholderTextColor={COLORS.mediumGray}
            value={chords}
            onChangeText={setChords}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Transpose Button */}
        <TouchableOpacity style={styles.transposeButton} onPress={handleTranspose}>
          <Ionicons name="swap-vertical" size={20} color={COLORS.white} />
          <Text style={styles.transposeButtonText}>Transpose</Text>
        </TouchableOpacity>

        {/* Result */}
        {result ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Result</Text>
            <View style={styles.resultBox}>
              <Text style={styles.resultText}>{result}</Text>
            </View>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
              <Ionicons name="copy" size={18} color={COLORS.black} />
              <Text style={styles.copyButtonText}>Copy Result</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Clear */}
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
    backgroundColor: COLORS.offWhite,
  },
  content: {
    padding: 18,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 26,
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 0,
  },
  keyArrow: {
    paddingTop: 46,
    paddingHorizontal: 2,
  },
  pickerContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.lightGray,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  picker: {
    height: 52,
    color: COLORS.black,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.lightGray,
    padding: 14,
    fontSize: 15,
    minHeight: 110,
    color: COLORS.black,
    fontWeight: '500',
    elevation: 1,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  transposeButton: {
    backgroundColor: COLORS.black,
    borderRadius: 8,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 26,
    elevation: 3,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  transposeButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  resultBox: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.lightGray,
    padding: 14,
    minHeight: 110,
    elevation: 1,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  resultText: {
    fontSize: 15,
    color: COLORS.black,
    lineHeight: 23,
    fontWeight: '500',
  },
  copyButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.black,
    backgroundColor: COLORS.offWhite,
  },
  copyButtonText: {
    color: COLORS.black,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  clearButton: {
    backgroundColor: COLORS.veryLightGray,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 1.5,
    borderColor: COLORS.lightGray,
  },
  clearButtonText: {
    color: COLORS.mediumGray,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.darkGray,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    elevation: 1,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  modeButtonActive: {
    borderColor: COLORS.black,
    backgroundColor: COLORS.black,
    borderWidth: 2,
  },
  modeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.mediumGray,
  },
  modeButtonTextActive: {
    color: COLORS.white,
    fontWeight: '800',
  },
  shortcutsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  shortcutButton: {
    minWidth: '22%',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  shortcutButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  modifierButton: {
    backgroundColor: COLORS.darkGray,
  },
})