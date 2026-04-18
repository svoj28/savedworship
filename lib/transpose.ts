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
export function transposeText(text: string, semitones: number): string {
  // Match all chords in [chord] format
  return text.replace(/\[([^\]]+)\]/g, (match, chord) => {
    const transposed = transposeChord(chord, semitones)
    return `[${transposed}]`
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
