// lib/transpose.ts

// Chromatic scale: all 12 semitones
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NOTES: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
}

/**
 * Normalize a chord name by converting flats to sharps for consistent transposition
 * E.g., "Bb" -> "A#", "Gm" -> "G#m"
 */
function normalizeChord(chord: string): string {
  const baseNote = chord.slice(0, 2)
  const remainder = chord.slice(2)
  
  if (baseNote in FLAT_NOTES) {
    return FLAT_NOTES[baseNote] + remainder
  }
  return chord
}

/**
 * Extract the base note from a chord (e.g., "Gm7" -> "G")
 */
function getBaseNote(chord: string): string {
  // Handle both sharps and flats: e.g., "C#", "Db", "G", "Am"
  const match = chord.match(/^([A-G]#?|[A-G]b?)/)
  return match ? match[1] : chord
}

/**
 * Get the remainder of the chord after the base note (e.g., "m7", "sus4", "9")
 */
function getChordRemainder(chord: string): string {
  const baseNote = getBaseNote(chord)
  return chord.slice(baseNote.length)
}

/**
 * Transpose a single chord by a given number of semitones
 * @param chord - The chord to transpose (e.g., "G", "Dm", "F#m7")
 * @param semitones - Number of semitones to transpose (positive = up, negative = down)
 * @returns The transposed chord
 *
 * Example: transposeChord("G", 2) -> "A"
 * Example: transposeChord("Dm", -3) -> "Bm"
 */
export function transposeChord(chord: string, semitones: number): string {
  if (!chord || chord.trim() === '') return chord
  
  const normalized = normalizeChord(chord)
  const baseNote = getBaseNote(normalized)
  const remainder = getChordRemainder(normalized)
  
  // Find current index in chromatic scale
  const currentIndex = NOTES.indexOf(baseNote)
  if (currentIndex === -1) {
    console.warn(`Unknown chord: ${chord}`)
    return chord
  }
  
  // Calculate new index, wrapping around the 12-note scale
  const newIndex = (currentIndex + semitones + NOTES.length * 10) % 12
  const newBaseNote = NOTES[newIndex]
  
  return newBaseNote + remainder
}

/**
 * Transpose a block of text containing chords in [chord] format
 * Useful for transposing lyrics with embedded chords
 * 
 * @param text - Text with chords in [chord] format (e.g., "[G]Amazing [D]grace")
 * @param semitones - Number of semitones to transpose
 * @returns Text with transposed chords
 *
 * Example:
 * transposeText("[G]Amazing [D]grace", 2) -> "[A]Amazing [E]grace"
 */
// --- Nashville support ----------------------------------------------------
const ROMAN_TO_SEMITONE: Record<string, number> = {
  'I':   0,
  'bII': 1,
  'II':  2,
  'bIII':3,
  'III': 4,
  'IV':  5,
  'bV':  6,
  '#IV': 6,
  'V':   7,
  'bVI': 8,
  'VI':  9,
  'bVII':10,
  'VII': 11,
}

const ALL_ROMANS = Object.keys(ROMAN_TO_SEMITONE).sort((a, b) => b.length - a.length)
const ROMAN_PATTERN = ALL_ROMANS.map(r => r.replace('#', '\\#')).join('|')
const ROMAN_RE = new RegExp(`^(${ROMAN_PATTERN})(.*)$`, 'i')
const SEMITONE_TO_ROMAN: Record<number, string> = {
  0: 'I',
  1: 'bII',
  2: 'II',
  3: 'bIII',
  4: 'III',
  5: 'IV',
  6: 'bV',
  7: 'V',
  8: 'bVI',
  9: 'VI',
  10: 'bVII',
  11: 'VII',
}

function parseNashville(token: string): { numeral: string; modifiers: string; lowerCase: boolean } | null {
  const m = token.match(ROMAN_RE)
  if (!m) return null
  const rawNumeral = m[1]
  let modifiers = m[2] ?? ''
  const lowerCase = /[a-z]/.test(rawNumeral)

  // Canonicalise numeral to uppercase with optional leading b/# preserved
  const upper = rawNumeral.toUpperCase()
  const finalNumeral = rawNumeral.startsWith('b') || rawNumeral.startsWith('B')
    ? 'b' + upper.slice(1)
    : rawNumeral.startsWith('#')
    ? '#' + upper.slice(1)
    : upper

  if (!(finalNumeral in ROMAN_TO_SEMITONE)) return null

  // If user used lowercase numerals (e.g. "ii"), imply minor if no explicit modifier
  if (lowerCase && !/\bm(?![a-zA-Z])/.test(modifiers) && !/maj|dim|aug/.test(modifiers)) {
    modifiers = 'm' + modifiers
  }

  return { numeral: finalNumeral, modifiers, lowerCase }
}

function nashvilleToChord(token: string, targetKey: string): string | null {
  const parsed = parseNashville(token)
  if (!parsed) return null
  const semitone = ROMAN_TO_SEMITONE[parsed.numeral]
  if (semitone === undefined) return null

  // Determine target root canonical (use first note of targetKey)
  const base = getBaseNote(normalizeChord(targetKey))
  const rootIdx = NOTES.indexOf(base)
  if (rootIdx === -1) return null
  const note = NOTES[(rootIdx + semitone) % 12]

  return note + parsed.modifiers
}

/**
 * Transpose a block of text containing chords in [chord] format.
 * Supports both standard chords and Nashville numerals. When `targetKey`
 * is provided, Nashville numerals (e.g. [I], [ii]) are converted to actual
 * chord names in that key.
 */
export function transposeText(text: string, semitones: number, targetKey?: string): string {
  return text.replace(/\[([^\]]+)\]/g, (match, chord) => {
    // Try Nashville first (requires a targetKey to map to real chords)
    if (targetKey) {
      const maybe = nashvilleToChord(chord, targetKey)
      if (maybe) return `[${maybe}]`
    }

    const transposed = transposeChord(chord, semitones)
    return `[${transposed}]`
  })
}

/**
 * Detect whether a text block contains any Nashville numerals inside brackets
 */
export function hasNashville(text: string): boolean {
  if (!text) return false
  const matches = [...text.matchAll(/\[([^\]]+)\]/g)].map(m => m[1])
  for (const token of matches) {
    if (parseNashville(token)) return true
  }
  return false
}

export function chordToNashville(token: string, sourceKey: string): string | null {
  if (parseNashville(token)) return token

  const sourceBase = getBaseNote(normalizeChord(sourceKey))
  const sourceIndex = NOTES.indexOf(sourceBase)
  const chord = normalizeChord(token)
  const chordBase = getBaseNote(chord)
  const chordIndex = NOTES.indexOf(chordBase)

  if (sourceIndex === -1 || chordIndex === -1) return null

  const semitone = (chordIndex - sourceIndex + 12) % 12
  const numeral = SEMITONE_TO_ROMAN[semitone]
  if (!numeral) return null

  const remainder = getChordRemainder(chord)
  const isMinor = /^m(?!aj)/i.test(remainder) || /^min/i.test(remainder)
  const strippedRemainder = isMinor
    ? remainder.replace(/^min/i, '').replace(/^m(?!aj)/i, '')
    : remainder

  return (isMinor ? numeral.toLowerCase() : numeral) + strippedRemainder
}

export function transposeTextToNashville(text: string, sourceKey: string): string {
  return text.replace(/\[([^\]]+)\]/g, (match, chord) => {
    const converted = chordToNashville(chord, sourceKey)
    return converted ? `[${converted}]` : match
  })
}

/**
 * Get semitone distance from one key to another
 * Useful for displaying transpose information
 * 
 * @param fromKey - Starting key (e.g., "G")
 * @param toKey - Target key (e.g., "A")
 * @returns Semitone distance (positive = up, negative = down)
 *
 * Example: getTransposeDistance("G", "A") -> 2
 */
export function getTransposeDistance(fromKey: string, toKey: string): number {
  const fromNormalized = normalizeChord(fromKey)
  const toNormalized = normalizeChord(toKey)
  
  const fromIndex = NOTES.indexOf(getBaseNote(fromNormalized))
  const toIndex = NOTES.indexOf(getBaseNote(toNormalized))
  
  if (fromIndex === -1 || toIndex === -1) {
    console.warn(`Invalid keys: ${fromKey}, ${toKey}`)
    return 0
  }
  
  let distance = toIndex - fromIndex
  // Normalize to -6 to +6 range for shortest path
  if (distance > 6) distance -= 12
  if (distance < -6) distance += 12
  
  return distance
}

/**
 * Get all possible keys (for display in transpose UI)
 */
export function getAllKeys(): string[] {
  return NOTES
}

/**
 * Get relative minor key for a major key
 * E.g., C -> Am, G -> Em
 */
export function getRelativeMinor(majorKey: string): string {
  const normalized = normalizeChord(majorKey)
  const baseNote = getBaseNote(normalized)
  const index = NOTES.indexOf(baseNote)
  
  if (index === -1) return majorKey
  
  // Relative minor is 3 semitones down (9 semitones up)
  const minorIndex = (index + 9) % 12
  return NOTES[minorIndex] + 'm'
}
