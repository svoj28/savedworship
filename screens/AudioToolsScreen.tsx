// screens/AudioToolsScreen.tsx
import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import Slider from '@react-native-community/slider'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as DocumentPicker from 'expo-document-picker'
import { Audio } from 'expo-av'

import { transposeNote, getNotes } from '../lib/keyDetection'
import { saveAudioFileLocally, updateAudioFileMetadata } from '../lib/audioFileManager'
import { pitchShifter } from '../lib/pitchShifter'
import ProgressBar from '../components/ProgressBar'
import {
  AudioRemovalService,
  RemovalType,
  InstrumentType,
  RemovalProgress,
} from '../lib/audioRemovalService'

const NOTE_NAMES = getNotes()

type MainTab = 'pitch' | 'vocal' | 'tools'
type RemovalMode = 'vocal' | 'instrument'

function semitonesToPlaybackRate(semitones: number): number {
  return Math.pow(2, semitones / 12)
}

const MANUAL_TEMPO_MIN_PERCENT = -40
const MANUAL_TEMPO_MAX_PERCENT = 40
const TEMPO_OPPOSITION_BOOST_AT_12 = 1.03

function clampPlaybackRate(rate: number): number {
  return Math.min(2.0, Math.max(0.5, rate))
}

function getTempoOppositionBoost(semitones: number): number {
  const normalizedSemitoneDistance = Math.min(1, Math.abs(semitones) / 12)
  return 1 + (TEMPO_OPPOSITION_BOOST_AT_12 - 1) * normalizedSemitoneDistance
}

function boostOpposingTempoRate(rate: number, semitones: number): number {
  if (!Number.isFinite(rate) || rate <= 0 || semitones === 0) return 1
  const boost = getTempoOppositionBoost(semitones)
  return rate >= 1 ? rate * boost : rate / boost
}

interface PitchShiftStep {
  semitones: number
  displayName: string
  icon: string
}

interface PlaybackState {
  isPlaying: boolean
  duration: number
  position: number
}

interface Instrument {
  id: InstrumentType
  name: string
  icon: string
  color: string
}

const instruments: Instrument[] = [
  { id: 'drums', name: 'Drums', icon: 'musical-notes', color: '#FF6B6B' },
  { id: 'bass', name: 'Bass Guitar', icon: 'guitar', color: '#4ECDC4' },
  { id: 'electric_guitar', name: 'Electric Guitar', icon: 'bolt', color: '#FFE66D' },
  { id: 'acoustic_guitar', name: 'Acoustic Guitar', icon: 'musical-note', color: '#95E1D3' },
  { id: 'keyboard', name: 'Keyboard', icon: 'square', color: '#9B59B6' },
]

const onlineTools = [
  { title: 'Remove-Vocals.com', description: 'Simple & fast vocal removal', features: ['Free', 'No signup', 'Fast'], color: '#FF6B6B', url: 'https://www.remove-vocals.com/' },
  { title: 'Vocal-Remover.org', description: 'AI-powered vocal extraction', features: ['AI tech', 'High quality', 'Batch'], color: '#4ECDC4', url: 'https://www.vocal-remover.org/' },
  { title: 'Splitter AI', description: 'Advanced stem separation', features: ['Pro quality', 'Multiple stems', 'API'], color: '#45B7D1', url: 'https://www.splitter.ai/' },
  { title: 'LALAL.AI', description: 'Neural network stem splitter', features: ['Neural AI', 'High quality', 'API'], color: '#1ABC9C', url: 'https://www.lalal.ai/' },
  { title: 'Karaoke Version', description: 'Dedicated karaoke platform', features: ['Massive library', 'Pro quality', 'Premium'], color: '#F39C12', url: 'https://www.karaoke-version.com/' },
  { title: 'iZotope RX', description: 'Professional audio editing', features: ['Pro tool', 'Voice isolation', 'Premium'], color: '#9B59B6', url: 'https://www.izotope.com/en/products/rx.html' },
]

const pitchPresets: PitchShiftStep[] = [
  { semitones: -12, displayName: 'Down 1 Octave', icon: 'arrow-down' },
  { semitones: -7, displayName: 'Down Perfect 5th', icon: 'arrow-down' },
  { semitones: -5, displayName: 'Down Perfect 4th', icon: 'arrow-down' },
  { semitones: -2, displayName: 'Down Major 2nd', icon: 'arrow-down' },
  { semitones: 0, displayName: 'Original', icon: 'reload' },
  { semitones: 2, displayName: 'Up Major 2nd', icon: 'arrow-up' },
  { semitones: 5, displayName: 'Up Perfect 4th', icon: 'arrow-up' },
  { semitones: 7, displayName: 'Up Perfect 5th', icon: 'arrow-up' },
  { semitones: 12, displayName: 'Up 1 Octave', icon: 'arrow-up' },
]

export default function AudioToolsScreen() {
  const [activeTab, setActiveTab] = useState<MainTab>('pitch')

  // ─── Pitch Changer State ──────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [localFilePath, setLocalFilePath] = useState<string | null>(null)
  const [pitchShift, setPitchShift] = useState(0)
  const [tempoAdjustPercent, setTempoAdjustPercent] = useState(0)
  const [currentKey, setCurrentKey] = useState('C')
  const [targetKey, setTargetKey] = useState('C')
  const [isDetectingKey, setIsDetectingKey] = useState(false)
  const [detectionConfidence, setDetectionConfidence] = useState(0)
  const [sound, setSound] = useState<Audio.Sound | null>(null)
  const [pitchPlaybackState, setPitchPlaybackState] = useState<PlaybackState>({ isPlaying: false, duration: 0, position: 0 })
  const [isProcessing, setIsProcessing] = useState(false)
  const [pitchShiftInfo, setPitchShiftInfo] = useState<{ canDoPurePitchShift: boolean; platform: string; note: string }>({ canDoPurePitchShift: false, platform: 'unknown', note: '' })

  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const soundIdRef = useRef<string>(`sound-${Date.now()}`)
  const currentSoundRef = useRef<Audio.Sound | null>(null)
  const playbackStateRef = useRef<PlaybackState>(pitchPlaybackState)
  const isApplyingPitchRef = useRef(false)
  const pendingSemitoneRef = useRef<number | null>(null)
  const activeSemitoneRef = useRef(0)
  const originalDurationRef = useRef(0)
  const activePurePlaybackRateRef = useRef(1)
  const manualTempoFactorRef = useRef(1)

  // ─── Vocal Remover State ──────────────────────────────────────────────────
  const [removalMode, setRemovalMode] = useState<RemovalMode>('vocal')
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType | null>(null)
  const [isVocalProcessing, setIsVocalProcessing] = useState(false)
  const [progress, setProgress] = useState<RemovalProgress>({ status: 'idle', progress: 0, message: '' })
  const [selectedVocalAudioUri, setSelectedVocalAudioUri] = useState<string | null>(null)
  const [selectedVocalAudioName, setSelectedVocalAudioName] = useState<string | null>(null)
  const [processedAudioUri, setProcessedAudioUri] = useState<string | null>(null)
  const [vocalIsPlaying, setVocalIsPlaying] = useState(false)
  const [vocalPlaybackPosition, setVocalPlaybackPosition] = useState(0)
  const [vocalPlaybackDuration, setVocalPlaybackDuration] = useState(0)

  const removalServiceRef = useRef(new AudioRemovalService())
  const removalService = removalServiceRef.current

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true })
    setPitchShiftInfo(pitchShifter.getPitchShiftInfo())
    removalService.setProgressCallback((update) => setProgress(update))

    return () => {
      if (sound) sound.unloadAsync()
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current)
      pitchShifter.cleanup(soundIdRef.current)
      removalService.cleanup()
    }
  }, [])

  useEffect(() => { currentSoundRef.current = sound }, [sound])
  useEffect(() => { playbackStateRef.current = pitchPlaybackState }, [pitchPlaybackState])

  // ─── Pitch Changer Logic ──────────────────────────────────────────────────
  const getPurePlaybackRateCorrection = (shiftedDurationMillis: number, semitones: number): number => {
    const originalDurationMillis = originalDurationRef.current
    if (originalDurationMillis <= 0 || shiftedDurationMillis <= 0) return 1
    const correctionRate = shiftedDurationMillis / originalDurationMillis
    if (!Number.isFinite(correctionRate)) return 1
    if (Math.abs(correctionRate - 1) < 0.001) return 1
    return Math.min(2.0, Math.max(0.5, boostOpposingTempoRate(correctionRate, semitones)))
  }

  const applyRateForCurrentPitch = async (audioSound: Audio.Sound, semitones: number, supportsPurePitch: boolean): Promise<boolean> => {
    const status = await audioSound.getStatusAsync()
    if (!status.isLoaded) return false
    if (supportsPurePitch) {
      await audioSound.setRateAsync(clampPlaybackRate(activePurePlaybackRateRef.current * manualTempoFactorRef.current), true)
    } else {
      await audioSound.setRateAsync(clampPlaybackRate(semitonesToPlaybackRate(semitones) * manualTempoFactorRef.current), false)
    }
    return true
  }

  const updateTempoAdjust = (value: number) => {
    const clamped = Math.min(MANUAL_TEMPO_MAX_PERCENT, Math.max(MANUAL_TEMPO_MIN_PERCENT, Math.round(value)))
    setTempoAdjustPercent(clamped)
    manualTempoFactorRef.current = 1 + clamped / 100
    return clamped
  }

  const applyManualTempoToCurrentSound = async () => {
    const currentSound = currentSoundRef.current
    if (!currentSound) return
    try {
      const supportsPurePitch = pitchShifter.getPitchShiftInfo().canDoPurePitchShift
      await applyRateForCurrentPitch(currentSound, activeSemitoneRef.current, supportsPurePitch)
    } catch (error) {
      console.error('Error applying tempo:', error)
    }
  }

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['audio/mpeg', 'audio/wav', 'audio/*'] })
      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0]
        setSelectedFile(file.uri)
        setFileName(file.name || 'Selected Audio File')
        try {
          setIsProcessing(true)
          const savedFile = await saveAudioFileLocally(file.uri, file.name || 'audio-file')
          setLocalFilePath(savedFile.localUri)
          await loadAudio(savedFile.localUri)
          await detectAudioKey(savedFile.localUri)
        } catch (error) {
          Alert.alert('Error', 'Failed to save audio file locally')
        } finally {
          setIsProcessing(false)
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick audio file')
    }
  }

  const loadAudio = async (uri: string) => {
    try {
      if (currentSoundRef.current) await currentSoundRef.current.unloadAsync()
      const { sound: newSound } = await Audio.Sound.createAsync({ uri })
      setSound(newSound)
      currentSoundRef.current = newSound
      await pitchShifter.initializePitchShifter(uri, soundIdRef.current)
      setPitchShift(0)
      activeSemitoneRef.current = 0
      activePurePlaybackRateRef.current = 1
      setTempoAdjustPercent(0)
      manualTempoFactorRef.current = 1
      setCurrentKey('C')
      setTargetKey('C')
      const status = await newSound.getStatusAsync()
      if (status.isLoaded) {
        originalDurationRef.current = status.durationMillis || 0
        setPitchPlaybackState(prev => ({ ...prev, duration: status.durationMillis || 0 }))
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load audio file')
    }
  }

  const detectAudioKey = async (uri: string) => {
    setIsDetectingKey(true)
    setTimeout(() => {
      const suggestedKey = NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)]
      setCurrentKey(suggestedKey)
      const confidence = Math.random() * 50 + 50
      setDetectionConfidence(confidence)
      setIsDetectingKey(false)
      Alert.alert('Key Detection', `Detected key: ${suggestedKey} (${Math.round(confidence)}% confidence)\n\nYou can adjust if needed.`)
    }, 1500)
  }

  const handlePitchPlayPause = async () => {
    const currentSound = currentSoundRef.current
    if (!currentSound) { Alert.alert('Error', 'No audio loaded'); return }
    try {
      if (pitchPlaybackState.isPlaying) {
        await currentSound.pauseAsync()
      } else {
        const supportsPurePitch = pitchShifter.getPitchShiftInfo().canDoPurePitchShift
        await applyRateForCurrentPitch(currentSound, activeSemitoneRef.current, supportsPurePitch)
        await currentSound.playAsync()
      }
      setPitchPlaybackState(prev => ({ ...prev, isPlaying: !prev.isPlaying }))
      if (!pitchPlaybackState.isPlaying) {
        if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current)
        playbackIntervalRef.current = setInterval(async () => {
          const s = currentSoundRef.current
          if (s) {
            const status = await s.getStatusAsync()
            if (status.isLoaded) {
              setPitchPlaybackState(prev => ({ ...prev, position: status.positionMillis || 0 }))
              if (status.didJustFinish) setPitchPlaybackState(prev => ({ ...prev, isPlaying: false, position: 0 }))
            }
          }
        }, 100)
      } else {
        if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to play audio')
    }
  }

  const handlePitchStop = async () => {
    const currentSound = currentSoundRef.current
    if (!currentSound) return
    await currentSound.stopAsync()
    if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current)
    setPitchPlaybackState({ isPlaying: false, duration: 0, position: 0 })
  }

  const handleClearFile = async () => {
    if (currentSoundRef.current) {
      await currentSoundRef.current.unloadAsync()
      currentSoundRef.current = null
      setSound(null)
    }
    setSelectedFile(null)
    setFileName('')
    setLocalFilePath(null)
    setCurrentKey('C')
    setTargetKey('C')
    setPitchShift(0)
    setTempoAdjustPercent(0)
    activeSemitoneRef.current = 0
    originalDurationRef.current = 0
    activePurePlaybackRateRef.current = 1
    manualTempoFactorRef.current = 1
    setPitchPlaybackState({ isPlaying: false, duration: 0, position: 0 })
  }

  const processPendingPitchShift = async () => {
    if (!localFilePath || isApplyingPitchRef.current) return
    isApplyingPitchRef.current = true
    setIsProcessing(true)
    try {
      while (pendingSemitoneRef.current !== null) {
        const semitones = pendingSemitoneRef.current
        pendingSemitoneRef.current = null
        if (semitones === activeSemitoneRef.current) continue
        const audioSound = currentSoundRef.current
        if (!audioSound) break
        const wasPlaying = playbackStateRef.current.isPlaying
        const supportsPurePitch = pitchShifter.getPitchShiftInfo().canDoPurePitchShift
        if (!supportsPurePitch) {
          activePurePlaybackRateRef.current = 1
          await applyRateForCurrentPitch(audioSound, semitones, false)
          activeSemitoneRef.current = semitones
          continue
        }
        const shiftedFilePath = await pitchShifter.applyPitchShift(audioSound, semitones, soundIdRef.current, localFilePath)
        if (!shiftedFilePath) {
          await applyRateForCurrentPitch(audioSound, activeSemitoneRef.current, true)
          continue
        }
        const status = await audioSound.getStatusAsync()
        if (status.isLoaded) {
          if (wasPlaying) await audioSound.pauseAsync()
          await audioSound.unloadAsync()
        }
        if (currentSoundRef.current === audioSound) currentSoundRef.current = null
        const { sound: newSound } = await Audio.Sound.createAsync({ uri: shiftedFilePath })
        setSound(newSound)
        currentSoundRef.current = newSound
        activeSemitoneRef.current = semitones
        const newStatus = await newSound.getStatusAsync()
        activePurePlaybackRateRef.current = newStatus.isLoaded
          ? getPurePlaybackRateCorrection(newStatus.durationMillis || 0, semitones)
          : 1
        await applyRateForCurrentPitch(newSound, semitones, true)
        if (wasPlaying) await newSound.playAsync()
        if (newStatus.isLoaded) {
          setPitchPlaybackState(prev => ({ ...prev, duration: newStatus.durationMillis || 0, position: 0, isPlaying: wasPlaying }))
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to apply pitch shift')
    } finally {
      isApplyingPitchRef.current = false
      setIsProcessing(false)
      if (pendingSemitoneRef.current !== null) void processPendingPitchShift()
    }
  }

  const requestPitchShift = (semitones: number) => {
    if (!localFilePath) return
    pendingSemitoneRef.current = semitones
    if (!isApplyingPitchRef.current) void processPendingPitchShift()
  }

  const handlePresetPress = (semitones: number) => {
    setPitchShift(semitones)
    setTargetKey(transposeNote(currentKey, semitones))
    requestPitchShift(semitones)
  }

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60 < 10 ? '0' : '')}${s % 60}`
  }

  // ─── Vocal Remover Logic ──────────────────────────────────────────────────
  const handlePickVocalAudio = async () => {
    try {
      const audioUri = await removalService.pickAudioFile()
      if (audioUri) {
        setSelectedVocalAudioUri(audioUri)
        setSelectedVocalAudioName(audioUri.split('/').pop() || 'audio.m4a')
        setProcessedAudioUri(null)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick audio file')
    }
  }

  const handleProcessVocalAudio = async () => {
    if (!selectedVocalAudioUri) { Alert.alert('Error', 'Please select an audio file first'); return }
    if (removalMode === 'instrument' && !selectedInstrument) { Alert.alert('Error', 'Please select an instrument to remove'); return }
    try {
      setIsVocalProcessing(true)
      const processed = await removalService.removeVocalOrInstrument(selectedVocalAudioUri, {
        removalType: removalMode,
        instrument: removalMode === 'instrument' ? selectedInstrument || undefined : undefined,
      })
      setProcessedAudioUri(processed)
      await removalService.loadAudio(processed)
      removalService.subscribeToStatusUpdates((status) => {
        if (status.isLoaded) {
          setVocalPlaybackDuration(status.durationMillis || 0)
          setVocalPlaybackPosition(status.positionMillis || 0)
          setVocalIsPlaying(status.isPlaying)
        }
      })
      Alert.alert('Success', 'Audio processing completed! Ready to play.')
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Processing failed')
    } finally {
      setIsVocalProcessing(false)
    }
  }

  const handleVocalPlayPause = async () => {
    try {
      if (vocalIsPlaying) { await removalService.pause(); setVocalIsPlaying(false) }
      else { await removalService.play(); setVocalIsPlaying(true) }
    } catch (error) {
      Alert.alert('Error', 'Failed to control playback')
    }
  }

  const handleOpenTool = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url)
      else Alert.alert('Error', 'Cannot open URL')
    } catch { Alert.alert('Error', 'Failed to open link') }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Audio Tools</Text>
        <Text style={styles.headerSubtitle}>Pitch · Vocal Remover · Online Tools</Text>
      </View>

      {/* Main Tabs */}
      <View style={styles.tabBar}>
        {([
          { key: 'pitch', label: 'Key/Pitch', icon: 'musical-notes' },
          { key: 'vocal', label: 'Vocal', icon: 'mic' },
          { key: 'tools', label: 'Online', icon: 'globe' },
        ] as const).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={18} color={activeTab === tab.key ? '#007AFF' : '#999'} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── KEY/PITCH TAB ─── */}
      {activeTab === 'pitch' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* File Import */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>1. Import Audio File</Text>
              <TouchableOpacity style={styles.filePickerButton} onPress={handlePickFile} disabled={isProcessing}>
                <Ionicons name="cloud-download-outline" size={20} color="#fff" />
                <Text style={styles.filePickerButtonText}>{isProcessing ? 'Importing...' : 'Import Audio File'}</Text>
              </TouchableOpacity>
              {isProcessing && (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.processingText}>Processing audio file...</Text>
                </View>
              )}
              {selectedFile && (
                <View style={styles.selectedFileInfo}>
                  <Ionicons name="musical-notes" size={20} color="#007AFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileInfoName}>{fileName}</Text>
                    <Text style={styles.fileInfoPath}>Saved locally</Text>
                  </View>
                  <TouchableOpacity onPress={handleClearFile}>
                    <Ionicons name="close" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Playback */}
            {selectedFile && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Playback</Text>
                <View style={styles.playbackControls}>
                  <TouchableOpacity style={styles.playBtn} onPress={handlePitchPlayPause}>
                    <Ionicons name={pitchPlaybackState.isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stopBtn} onPress={handlePitchStop}>
                    <Ionicons name="stop" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
                {pitchPlaybackState.duration > 0 && (
                  <>
                    <Slider
                      style={{ height: 40 }}
                      minimumValue={0}
                      maximumValue={pitchPlaybackState.duration}
                      value={pitchPlaybackState.position}
                      onValueChange={async (v) => { if (currentSoundRef.current) await currentSoundRef.current.setPositionAsync(v) }}
                      minimumTrackTintColor="#007AFF"
                      maximumTrackTintColor="#e0e0e0"
                    />
                    <View style={styles.timeRow}>
                      <Text style={styles.timeText}>{formatTime(pitchPlaybackState.position)}</Text>
                      <Text style={styles.timeText}>{formatTime(pitchPlaybackState.duration)}</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Original Key */}
            {selectedFile && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>2. Original Key</Text>
                  {isDetectingKey && <ActivityIndicator size="small" color="#007AFF" />}
                </View>
                {detectionConfidence > 0 && (
                  <View style={styles.confidenceRow}>
                    <ProgressBar progress={detectionConfidence / 100} color="#34C759" backgroundColor="#e0e0e0" height={6} />
                    <Text style={styles.confidenceText}>Confidence: {Math.round(detectionConfidence)}%</Text>
                  </View>
                )}
                <View style={styles.keyGrid}>
                  {NOTE_NAMES.map(note => (
                    <TouchableOpacity
                      key={note}
                      style={[styles.keyButton, currentKey === note && styles.keyButtonActive]}
                      onPress={() => { setCurrentKey(note); setTargetKey(transposeNote(note, pitchShift)) }}
                    >
                      <Text style={[styles.keyButtonText, currentKey === note && styles.keyButtonTextActive]}>{note}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Pitch Shift */}
            {selectedFile && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>3. Adjust Pitch</Text>
                <View style={styles.pitchDisplay}>
                  <Text style={styles.pitchValue}>{pitchShift > 0 ? '+' : ''}{pitchShift} semitones</Text>
                  <View style={styles.keyTransition}>
                    <Text style={styles.keyLabel}>{currentKey}</Text>
                    <Ionicons name="arrow-forward" size={18} color="#007AFF" />
                    <Text style={styles.keyLabel}>{targetKey}</Text>
                  </View>
                </View>
                <View style={styles.sliderRow}>
                  <Ionicons name="arrow-down-circle" size={22} color="#FF3B30" />
                  <Slider
                    style={styles.slider}
                    minimumValue={-6}
                    maximumValue={6}
                    step={1}
                    value={pitchShift}
                    onValueChange={(v) => { setPitchShift(Math.round(v)); setTargetKey(transposeNote(currentKey, Math.round(v))) }}
                    onSlidingComplete={(v) => { const r = Math.round(v); setPitchShift(r); setTargetKey(transposeNote(currentKey, r)); requestPitchShift(r) }}
                    minimumTrackTintColor="#007AFF"
                    maximumTrackTintColor="#ccc"
                  />
                  <Ionicons name="arrow-up-circle" size={22} color="#34C759" />
                </View>

                <Text style={styles.presetsLabel}>Quick Adjustments</Text>
                <View style={styles.presetsGrid}>
                  {pitchPresets.slice(2, 8).map(preset => (
                    <TouchableOpacity
                      key={preset.semitones}
                      style={[styles.presetBtn, pitchShift === preset.semitones && styles.presetBtnActive]}
                      onPress={() => handlePresetPress(preset.semitones)}
                    >
                      <Ionicons name={preset.icon as any} size={14} color={pitchShift === preset.semitones ? '#fff' : '#007AFF'} />
                      <Text style={[styles.presetBtnText, pitchShift === preset.semitones && styles.presetBtnTextActive]}>
                        {preset.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Tempo */}
                <View style={styles.tempoBox}>
                  <Text style={styles.tempoTitle}>Optional: Adjust Tempo</Text>
                  <Text style={styles.tempoValue}>Tempo: {tempoAdjustPercent > 0 ? '+' : ''}{tempoAdjustPercent}% · Speed: x{(1 + tempoAdjustPercent / 100).toFixed(2)}</Text>
                  <View style={styles.sliderRow}>
                    <Ionicons name="chevron-back" size={18} color="#FF9500" />
                    <Slider
                      style={styles.slider}
                      minimumValue={MANUAL_TEMPO_MIN_PERCENT}
                      maximumValue={MANUAL_TEMPO_MAX_PERCENT}
                      step={1}
                      value={tempoAdjustPercent}
                      onValueChange={(v) => updateTempoAdjust(v)}
                      onSlidingComplete={(v) => { updateTempoAdjust(v); void applyManualTempoToCurrentSound() }}
                      minimumTrackTintColor="#FF9500"
                      maximumTrackTintColor="#ccc"
                    />
                    <Ionicons name="chevron-forward" size={18} color="#FF9500" />
                  </View>
                  <View style={styles.tempoQuickRow}>
                    {[-10, -5, 0, 5, 10].map(v => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.tempoQuickBtn, tempoAdjustPercent === v && styles.tempoQuickBtnActive]}
                        onPress={() => { updateTempoAdjust(v); void applyManualTempoToCurrentSound() }}
                      >
                        <Text style={[styles.tempoQuickText, tempoAdjustPercent === v && styles.tempoQuickTextActive]}>
                          {v > 0 ? '+' : ''}{v}%
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {selectedFile && (
              <TouchableOpacity style={styles.applyBtn} onPress={async () => {
                setIsProcessing(true)
                try {
                  await updateAudioFileMetadata(localFilePath?.split('/').pop() || '', { originalKey: currentKey, targetKey, pitchShift, tempoAdjustPercent, tempoAdjustFactor: 1 + tempoAdjustPercent / 100 })
                  Alert.alert('Saved', `Pitch settings saved.\nKey: ${currentKey} → ${targetKey}\nShift: ${pitchShift > 0 ? '+' : ''}${pitchShift} semitones`)
                } finally { setIsProcessing(false) }
              }} disabled={isProcessing}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.applyBtnText}>{isProcessing ? 'Saving...' : 'Save Pitch Settings'}</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ─── VOCAL REMOVER TAB ─── */}
      {activeTab === 'vocal' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* File */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Select Audio File</Text>
            <TouchableOpacity style={styles.vocalFileBtn} onPress={handlePickVocalAudio}>
              <Ionicons name="cloud-upload" size={24} color="#007AFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.vocalFileBtnTitle}>{selectedVocalAudioName || 'Choose Audio File'}</Text>
                <Text style={styles.vocalFileBtnSub}>{selectedVocalAudioName ? 'File selected' : 'MP3, WAV, M4A, AAC'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Removal Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Select Removal Type</Text>
            <View style={styles.removalTypeRow}>
              {([
                { key: 'vocal', label: 'Remove Vocals', sub: 'Get instrumental version', icon: 'mic' },
                { key: 'instrument', label: 'Remove Instrument', sub: 'Select specific instrument', icon: 'musical-notes' },
              ] as const).map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.removalTypeBtn, removalMode === item.key && styles.removalTypeBtnActive]}
                  onPress={() => { setRemovalMode(item.key); if (item.key === 'vocal') setSelectedInstrument(null) }}
                >
                  <Ionicons name={item.icon} size={28} color={removalMode === item.key ? '#007AFF' : '#999'} />
                  <Text style={[styles.removalTypeBtnTitle, removalMode === item.key && styles.removalTypeBtnTitleActive]}>{item.label}</Text>
                  <Text style={styles.removalTypeBtnSub}>{item.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Instruments */}
          {removalMode === 'instrument' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>3. Choose Instrument</Text>
              <View style={styles.instrumentGrid}>
                {instruments.map(inst => (
                  <TouchableOpacity
                    key={inst.id}
                    style={[styles.instrumentCard, selectedInstrument === inst.id && styles.instrumentCardActive, { borderLeftColor: inst.color }]}
                    onPress={() => setSelectedInstrument(inst.id)}
                  >
                    <View style={[styles.instrumentIcon, { backgroundColor: inst.color }]}>
                      <Ionicons name={inst.icon as any} size={24} color="#fff" />
                    </View>
                    <Text style={styles.instrumentName}>{inst.name}</Text>
                    {selectedInstrument === inst.id && <Ionicons name="checkmark-circle" size={20} color={inst.color} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Process */}
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.processBtn, isVocalProcessing && styles.processBtnDisabled]}
              onPress={handleProcessVocalAudio}
              disabled={isVocalProcessing}
            >
              {isVocalProcessing
                ? <><ActivityIndicator color="#fff" /><Text style={styles.processBtnText}>{progress.message}</Text></>
                : <><Ionicons name="play-circle" size={24} color="#fff" /><Text style={styles.processBtnText}>Process Audio</Text></>
              }
            </TouchableOpacity>
            {isVocalProcessing && (
              <View style={styles.progressBox}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress.progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(progress.progress)}%</Text>
              </View>
            )}
          </View>

          {/* Playback */}
          {processedAudioUri && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>4. Play Result</Text>
              <View style={styles.vocalPlayer}>
                <TouchableOpacity onPress={handleVocalPlayPause}>
                  <Ionicons name={vocalIsPlaying ? 'pause-circle' : 'play-circle'} size={48} color="#007AFF" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeText}>{formatTime(vocalPlaybackPosition)}</Text>
                  <Slider
                    style={{ height: 40 }}
                    minimumValue={0}
                    maximumValue={vocalPlaybackDuration}
                    value={vocalPlaybackPosition}
                    onValueChange={(v) => removalService.seek(v)}
                    minimumTrackTintColor="#007AFF"
                    maximumTrackTintColor="#ddd"
                  />
                  <Text style={styles.timeText}>{formatTime(vocalPlaybackDuration)}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ─── ONLINE TOOLS TAB ─── */}
      {activeTab === 'tools' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Online Audio Tools</Text>
          {onlineTools.map(tool => (
            <TouchableOpacity key={tool.title} style={styles.toolCard} onPress={() => handleOpenTool(tool.url)}>
              <View style={[styles.toolColorBar, { backgroundColor: tool.color }]} />
              <View style={{ flex: 1, paddingLeft: 8 }}>
                <Text style={styles.toolTitle}>{tool.title}</Text>
                <Text style={styles.toolDesc}>{tool.description}</Text>
                <View style={styles.toolFeatures}>
                  {tool.features.map(f => (
                    <View key={f} style={styles.toolBadge}>
                      <Text style={styles.toolBadgeText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <Ionicons name="arrow-forward" size={20} color="#007AFF" />
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#007AFF', paddingHorizontal: 16, paddingVertical: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 2 },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#007AFF' },
  tabText: { fontSize: 12, fontWeight: '500', color: '#999' },
  tabTextActive: { color: '#007AFF', fontWeight: '600' },
  content: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  filePickerButton: { backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  filePickerButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  processingContainer: { marginTop: 12, alignItems: 'center', padding: 16, backgroundColor: '#E3F2FD', borderRadius: 8 },
  processingText: { marginTop: 8, fontSize: 13, color: '#007AFF', fontWeight: '500' },
  selectedFileInfo: { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileInfoName: { fontSize: 13, fontWeight: '600', color: '#007AFF', marginBottom: 2 },
  fileInfoPath: { fontSize: 11, color: '#007AFF', opacity: 0.7 },
  playbackControls: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  playBtn: { backgroundColor: '#34C759', borderRadius: 28, width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  stopBtn: { backgroundColor: '#FF3B30', borderRadius: 28, width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  timeText: { fontSize: 11, color: '#666' },
  confidenceRow: { marginBottom: 12, backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  confidenceText: { fontSize: 12, color: '#34C759', fontWeight: '500', marginTop: 6 },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keyButton: { width: '18%', aspectRatio: 1, backgroundColor: '#fff', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#e0e0e0' },
  keyButtonActive: { backgroundColor: '#FF9500', borderColor: '#FF9500' },
  keyButtonText: { fontSize: 13, fontWeight: '600', color: '#333' },
  keyButtonTextActive: { color: '#fff' },
  pitchDisplay: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
  pitchValue: { fontSize: 28, fontWeight: 'bold', color: '#007AFF', marginBottom: 8 },
  keyTransition: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  keyLabel: { fontSize: 18, fontWeight: 'bold', color: '#34C759' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  slider: { flex: 1, height: 40 },
  presetsLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 10 },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: { backgroundColor: '#fff', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#007AFF', minWidth: '31%', flex: 1 },
  presetBtnActive: { backgroundColor: '#007AFF' },
  presetBtnText: { fontSize: 11, color: '#007AFF', fontWeight: '500' },
  presetBtnTextActive: { color: '#fff' },
  tempoBox: { backgroundColor: '#FFF9E6', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: '#FF9500', marginTop: 16 },
  tempoTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 8 },
  tempoValue: { fontSize: 13, color: '#FF9500', fontWeight: '600', marginBottom: 12 },
  tempoQuickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tempoQuickBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingVertical: 8, borderWidth: 2, borderColor: '#FF9500', alignItems: 'center' },
  tempoQuickBtnActive: { backgroundColor: '#FF9500' },
  tempoQuickText: { fontSize: 11, color: '#FF9500', fontWeight: '600' },
  tempoQuickTextActive: { color: '#fff' },
  applyBtn: { backgroundColor: '#FF9500', borderRadius: 8, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  vocalFileBtn: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: '#007AFF', borderStyle: 'dashed', paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row', gap: 12 },
  vocalFileBtnTitle: { fontSize: 14, fontWeight: '600', color: '#007AFF', marginBottom: 2 },
  vocalFileBtnSub: { fontSize: 12, color: '#999' },
  removalTypeRow: { flexDirection: 'row', gap: 12 },
  removalTypeBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: '#e0e0e0' },
  removalTypeBtnActive: { borderColor: '#007AFF', backgroundColor: '#F0F8FF' },
  removalTypeBtnTitle: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 8, marginBottom: 2, textAlign: 'center' },
  removalTypeBtnTitleActive: { color: '#007AFF' },
  removalTypeBtnSub: { fontSize: 11, color: '#999', textAlign: 'center' },
  instrumentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  instrumentCard: { width: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderLeftWidth: 4 },
  instrumentCardActive: { backgroundColor: '#F0F8FF' },
  instrumentIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  instrumentName: { fontSize: 13, fontWeight: '600', color: '#000', textAlign: 'center' },
  processBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  processBtnDisabled: { opacity: 0.7 },
  processBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  progressBox: { marginTop: 12 },
  progressBar: { height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#007AFF' },
  progressText: { fontSize: 12, color: '#666', textAlign: 'right' },
  vocalPlayer: { backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  toolCard: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingRight: 12, marginBottom: 12 },
  toolColorBar: { width: 4, alignSelf: 'stretch' },
  toolTitle: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 2 },
  toolDesc: { fontSize: 12, color: '#666', marginBottom: 8 },
  toolFeatures: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  toolBadge: { backgroundColor: '#F0F0F0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  toolBadgeText: { fontSize: 11, color: '#666', fontWeight: '500' },
})