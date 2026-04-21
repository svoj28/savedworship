import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  View,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  FlatList,
} from 'react-native'
import Slider from '@react-native-community/slider'
import * as FileSystem from 'expo-file-system/legacy'
import demucsAIService, { Stem } from '../lib/demucsAIService'
import audioRemovalService from '../lib/audioRemovalService'
import { Ionicons } from '@expo/vector-icons'
import { AVPlaybackStatus } from 'expo-av'

// ─── Types ───────────────────────────────────────────────────────────────────

type Stage = 'idle' | 'uploading' | 'separating' | 'generating' | 'ready' | 'error'

interface CachedFile {
  label: string
  path: string
  type: 'pitch' | 'instrument'
  semitones?: number
  removedInstrument?: string
}

interface StemCache {
  sessionId: string
  stems: Stem[]
  audioName: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PITCH_RANGE = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]

const INSTRUMENTS: { key: string; label: string; icon: string }[] = [
  { key: 'vocals', label: 'Vocals', icon: 'mic' },
  { key: 'drums', label: 'Drums', icon: 'radio' },
  { key: 'bass', label: 'Bass', icon: 'pulse' },
  { key: 'other', label: 'Other', icon: 'musical-note' },
]

// ─── Component ────────────────────────────────────────────────────────────────

const AIKeyPitchChangerScreen: React.FC = () => {
  const [audioUri, setAudioUri] = useState<string | null>(null)
  const [audioName, setAudioName] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [message, setMessage] = useState('Select an audio file to begin')
  const [errorMessage, setErrorMessage] = useState('')
  const [semitones, setSemitones] = useState(0)
  const [removedInstrument, setRemovedInstrument] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentUri, setCurrentUri] = useState<string | null>(null)
  const [stemCache, setStemCache] = useState<StemCache | null>(null)
  const [cachedFiles, setCachedFiles] = useState<CachedFile[]>([])
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationTotal, setGenerationTotal] = useState(0)
  const audioServiceRef = useRef(audioRemovalService)

  // ── Load cached files on mount ──────────────────────────────────────────────
  useEffect(() => {
    loadCachedFileIndex()
  }, [])

  const CACHE_INDEX_PATH = `${FileSystem.documentDirectory}ai-audio-cache-index.json`

  const loadCachedFileIndex = async () => {
    try {
      const raw = await FileSystem.readAsStringAsync(CACHE_INDEX_PATH)
      const files: CachedFile[] = JSON.parse(raw)
      // Filter out files that no longer exist
      const valid: CachedFile[] = []
      for (const f of files) {
        const info = await FileSystem.getInfoAsync(f.path)
        if (info.exists) valid.push(f)
      }
      setCachedFiles(valid)
    } catch {
      setCachedFiles([])
    }
  }

  const saveCachedFileIndex = async (files: CachedFile[]) => {
    await FileSystem.writeAsStringAsync(CACHE_INDEX_PATH, JSON.stringify(files))
    setCachedFiles(files)
  }

  // ── Pick audio ──────────────────────────────────────────────────────────────
  const handlePickAudio = useCallback(async () => {
    try {
      setErrorMessage('')
      const uri = await audioServiceRef.current.pickAudioFile()
      if (uri) {
        const name = uri.split('/').pop() || 'audio.m4a'
        setAudioUri(uri)
        setAudioName(name)
        setStemCache(null)
        setCurrentUri(null)
        setSemitones(0)
        setRemovedInstrument(null)
        setStage('idle')
        setMessage('Ready — tap "Process Audio" to separate stems')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to pick audio')
      setStage('error')
    }
  }, [])

  // ── Step 1: Separate stems ──────────────────────────────────────────────────
  const handleProcessAudio = useCallback(async () => {
    if (!audioUri) {
      Alert.alert('No file', 'Please select an audio file first')
      return
    }

    try {
      setStage('separating')
      setMessage('📤 Uploading audio...')

      const session = await demucsAIService.separateStems(audioUri, (msg) => {
        setMessage(msg)
      })

      if (!session) throw new Error('Stem separation failed')

      setStemCache({ sessionId: session.sessionId, stems: session.stems, audioName: audioName! })
      setMessage('✅ Stems separated! Generating all variants...')
      setStage('generating')

      // Step 2: Generate all pitch + instrument variants
      await generateAllVariants(session.stems, session.sessionId)
    } catch (err) {
      setStage('error')
      setErrorMessage(err instanceof Error ? err.message : 'Processing failed')
    }
  }, [audioUri, audioName])

  // ── Step 2: Generate all variants ──────────────────────────────────────────
  const generateAllVariants = async (stems: Stem[], sessionId: string) => {
    const newFiles: CachedFile[] = [...cachedFiles]
    const baseName = audioName?.replace(/\.[^.]+$/, '') || 'audio'

    // All pitch variants: -6 to +6 (excluding 0)
    const pitchJobs = PITCH_RANGE
    // All instrument removal variants
    const instrumentJobs = INSTRUMENTS.map(i => i.key)

    const total = pitchJobs.length + instrumentJobs.length
    setGenerationTotal(total)
    let done = 0

    // Generate pitch variants
    for (const st of pitchJobs) {
      setMessage(`🎵 Generating pitch ${st > 0 ? '+' : ''}${st}... (${done + 1}/${total})`)
      setGenerationProgress(done)
      try {
        const mixedPath = await mixStemsWithPitch(stems, sessionId, st)
        const label = `${baseName} ${st > 0 ? '+' : ''}${st} semitones`
        const dest = `${FileSystem.documentDirectory}${baseName}_pitch${st}.wav`
        await FileSystem.copyAsync({ from: mixedPath, to: dest })
        newFiles.push({ label, path: dest, type: 'pitch', semitones: st })
      } catch (e) {
        console.warn(`Pitch ${st} failed:`, e)
      }
      done++
    }

    // Generate instrument removal variants
    for (const instrument of instrumentJobs) {
      setMessage(`🎸 Removing ${instrument}... (${done + 1}/${total})`)
      setGenerationProgress(done)
      try {
        const filteredStems = stems.filter(s => s.name !== instrument)
        const mixPath = await demucsAIService.mixStems(sessionId, filteredStems)
        const label = `${baseName} (no ${instrument})`
        const dest = `${FileSystem.documentDirectory}${baseName}_no_${instrument}.wav`
        await FileSystem.copyAsync({ from: mixPath, to: dest })
        newFiles.push({ label, path: dest, type: 'instrument', removedInstrument: instrument })
      } catch (e) {
        console.warn(`Instrument removal ${instrument} failed:`, e)
      }
      done++
    }

    await saveCachedFileIndex(newFiles)
    setGenerationProgress(total)
    setStage('ready')
    setMessage('✅ All variants ready! Tap any file to play or save.')
  }

  // ── Mix stems with pitch shift ──────────────────────────────────────────────
  const mixStemsWithPitch = async (stems: Stem[], sessionId: string, st: number): Promise<string> => {
    // Call the pitch-shift endpoint with stems already separated
    // We pass all stems and semitone value
    // No timeout needed here — stems are already separated, mixing is fast
    const response = await fetch(`http://192.168.18.21:3000/api/ai/mix-stems-pitched`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stems, sessionId, semitones: st }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const filePath = `${FileSystem.cacheDirectory}pitched_${st}_${Date.now()}.wav`
    await FileSystem.writeAsStringAsync(filePath, data.audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    })
    return filePath
  }

  // ── Play a cached file ──────────────────────────────────────────────────────
  const handlePlay = useCallback(async (filePath: string) => {
    try {
      if (isPlaying && currentUri === filePath) {
        await audioServiceRef.current.pause()
        setIsPlaying(false)
      } else {
        await audioServiceRef.current.loadAudio(filePath)
        await audioServiceRef.current.play()
        setCurrentUri(filePath)
        setIsPlaying(true)
      }
    } catch (err) {
      console.error('Playback error:', err)
    }
  }, [isPlaying, currentUri])

  // ── Delete a cached file ────────────────────────────────────────────────────
  const handleDelete = useCallback(async (filePath: string) => {
    Alert.alert('Delete', 'Remove this saved file?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await FileSystem.deleteAsync(filePath, { idempotent: true })
            const updated = cachedFiles.filter(f => f.path !== filePath)
            await saveCachedFileIndex(updated)
            if (currentUri === filePath) {
              setIsPlaying(false)
              setCurrentUri(null)
            }
          } catch (e) {
            Alert.alert('Error', 'Could not delete file')
          }
        }
      }
    ])
  }, [cachedFiles, currentUri])

  // ─── Render ─────────────────────────────────────────────────────────────────

  const pitchFiles = cachedFiles.filter(f => f.type === 'pitch')
  const instrumentFiles = cachedFiles.filter(f => f.type === 'instrument')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="musical-notes" size={28} color="#FF9800" />
        <Text style={styles.title}>AI Audio Tools</Text>
        <Text style={styles.subtitle}>Pitch shift & instrument removal — process once, switch instantly</Text>
      </View>

      {/* File Picker */}
      <View style={styles.section}>
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handlePickAudio}>
          <Ionicons name="folder-open" size={20} color="white" />
          <Text style={styles.buttonText}>Select Audio File</Text>
        </TouchableOpacity>
        {audioName && <Text style={styles.selectedFile}>🎵 {audioName}</Text>}

        {audioUri && stage === 'idle' && (
          <TouchableOpacity style={[styles.button, styles.successButton]} onPress={handleProcessAudio}>
            <Ionicons name="sparkles" size={20} color="white" />
            <Text style={styles.buttonText}>Process Audio (separate stems)</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Separating stage */}
      {stage === 'separating' && (
        <View style={styles.section}>
          <ActivityIndicator size="large" color="#FF9800" />
          <Text style={styles.statusText}>{message}</Text>
          <Text style={styles.noteText}>This takes ~10 minutes on CPU. Only needed once per song.</Text>
        </View>
      )}

      {/* Generating stage */}
      {stage === 'generating' && (
        <View style={styles.section}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.statusText}>{message}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {
              width: generationTotal > 0
                ? `${(generationProgress / generationTotal) * 100}%`
                : '0%'
            }]} />
          </View>
          <Text style={styles.progressText}>{generationProgress}/{generationTotal} variants</Text>
        </View>
      )}

      {/* Error */}
      {stage === 'error' && (
        <View style={styles.errorSection}>
          <Ionicons name="alert-circle" size={32} color="#F44336" />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={() => { setStage('idle'); setErrorMessage('') }}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ready message */}
      {stage === 'ready' && (
        <View style={[styles.section, styles.successBanner]}>
          <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          <Text style={styles.successText}>{message}</Text>
        </View>
      )}

      {/* Pitch variants */}
      {pitchFiles.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎵 Pitch Variants</Text>
          <Text style={styles.sectionSubtitle}>Tap to play • Long press to delete</Text>
          {pitchFiles.map((file) => (
            <TouchableOpacity
              key={file.path}
              style={[styles.fileRow, currentUri === file.path && isPlaying && styles.fileRowActive]}
              onPress={() => handlePlay(file.path)}
              onLongPress={() => handleDelete(file.path)}
            >
              <Ionicons
                name={currentUri === file.path && isPlaying ? 'pause-circle' : 'play-circle'}
                size={28}
                color={currentUri === file.path && isPlaying ? '#FF9800' : '#ccc'}
              />
              <View style={styles.fileInfo}>
                <Text style={styles.fileLabel}>{file.label}</Text>
                <Text style={styles.fileSubLabel}>
                  {file.semitones! > 0 ? '+' : ''}{file.semitones} semitones
                </Text>
              </View>
              <Ionicons name="musical-notes" size={16} color="#FF9800" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Instrument removal variants */}
      {instrumentFiles.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎸 Instrument Removed</Text>
          <Text style={styles.sectionSubtitle}>Tap to play • Long press to delete</Text>
          {instrumentFiles.map((file) => (
            <TouchableOpacity
              key={file.path}
              style={[styles.fileRow, currentUri === file.path && isPlaying && styles.fileRowActive]}
              onPress={() => handlePlay(file.path)}
              onLongPress={() => handleDelete(file.path)}
            >
              <Ionicons
                name={currentUri === file.path && isPlaying ? 'pause-circle' : 'play-circle'}
                size={28}
                color={currentUri === file.path && isPlaying ? '#4CAF50' : '#ccc'}
              />
              <View style={styles.fileInfo}>
                <Text style={styles.fileLabel}>{file.label}</Text>
                <Text style={styles.fileSubLabel}>No {file.removedInstrument}</Text>
              </View>
              <Ionicons name="mic-off" size={16} color="#4CAF50" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Empty state */}
      {cachedFiles.length === 0 && stage === 'idle' && (
        <View style={styles.emptyState}>
          <Ionicons name="musical-notes-outline" size={48} color="#ddd" />
          <Text style={styles.emptyText}>No saved audio yet</Text>
          <Text style={styles.emptySubText}>Select a file and tap "Process Audio" to generate all pitch and instrument variants at once</Text>
        </View>
      )}

    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { paddingBottom: 40 },
  header: {
    backgroundColor: '#FF9800',
    padding: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: 'white', marginTop: 8 },
  subtitle: { fontSize: 12, color: '#FFE0B2', marginTop: 4, textAlign: 'center' },
  section: {
    margin: 15,
    marginBottom: 0,
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 2 },
  sectionSubtitle: { fontSize: 11, color: '#999', marginBottom: 12 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 13,
    borderRadius: 10,
    marginVertical: 6,
  },
  primaryButton: { backgroundColor: '#FF9800' },
  successButton: { backgroundColor: '#4CAF50' },
  buttonText: { color: 'white', fontSize: 14, fontWeight: '600' },
  selectedFile: { fontSize: 12, color: '#4CAF50', textAlign: 'center', marginTop: 6 },
  statusText: { fontSize: 14, color: '#555', textAlign: 'center', marginTop: 12 },
  noteText: { fontSize: 11, color: '#FF9800', textAlign: 'center', marginTop: 6, fontStyle: 'italic' },
  progressBar: {
    height: 6,
    backgroundColor: '#eee',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  progressText: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 6 },
  errorSection: {
    margin: 15,
    padding: 20,
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorText: { fontSize: 13, color: '#333', marginTop: 8, textAlign: 'center' },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  successText: { flex: 1, fontSize: 13, color: '#2E7D32', fontWeight: '500' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  fileRowActive: { backgroundColor: '#FFF8E1', borderRadius: 8 },
  fileInfo: { flex: 1 },
  fileLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
  fileSubLabel: { fontSize: 11, color: '#999', marginTop: 2 },
  emptyState: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyText: { fontSize: 16, color: '#ccc', fontWeight: '600', marginTop: 12 },
  emptySubText: { fontSize: 12, color: '#ccc', textAlign: 'center', marginTop: 8, lineHeight: 18 },
})

export default AIKeyPitchChangerScreen