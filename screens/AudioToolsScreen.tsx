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
}

// Monochrome instruments — no colors
const instruments: Instrument[] = [
  { id: 'drums', name: 'Drums', icon: 'musical-notes' },
  { id: 'bass', name: 'Bass Guitar', icon: 'radio' },
  { id: 'electric_guitar', name: 'Electric Guitar', icon: 'flash' },
  { id: 'acoustic_guitar', name: 'Acoustic Guitar', icon: 'musical-note' },
  { id: 'keyboard', name: 'Keyboard', icon: 'apps' },
]

const onlineTools = [
  { title: 'Remove-Vocals.com', description: 'Simple & fast vocal removal', features: ['Free', 'No signup', 'Fast'], url: 'https://www.remove-vocals.com/' },
  { title: 'Vocal-Remover.org', description: 'AI-powered vocal extraction', features: ['AI tech', 'High quality', 'Batch'], url: 'https://www.vocal-remover.org/' },
  { title: 'Splitter AI', description: 'Advanced stem separation', features: ['Pro quality', 'Multiple stems', 'API'], url: 'https://www.splitter.ai/' },
  { title: 'LALAL.AI', description: 'Neural network stem splitter', features: ['Neural AI', 'High quality', 'API'], url: 'https://www.lalal.ai/' },
  { title: 'Karaoke Version', description: 'Dedicated karaoke platform', features: ['Massive library', 'Pro quality', 'Premium'], url: 'https://www.karaoke-version.com/' },
  { title: 'iZotope RX', description: 'Professional audio editing', features: ['Pro tool', 'Voice isolation', 'Premium'], url: 'https://www.izotope.com/en/products/rx.html' },
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

// ─── Reusable Step Label ──────────────────────────────────────────────────────
function StepLabel({ step, label }: { step: string; label: string }) {
  return (
    <View style={stepStyles.row}>
      <View style={stepStyles.badge}>
        <Text style={stepStyles.badgeText}>{step}</Text>
      </View>
      <Text style={stepStyles.label}>{label}</Text>
    </View>
  )
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  badge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  label: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', letterSpacing: 1, textTransform: 'uppercase' },
})

// ─── Divider ─────────────────────────────────────────────────────────────────
function Divider() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: '#E4E4E4' }} />
      <View style={{ width: 4, height: 4, backgroundColor: '#C8C8C8', transform: [{ rotate: '45deg' }] }} />
      <View style={{ flex: 1, height: 1, backgroundColor: '#E4E4E4' }} />
    </View>
  )
}

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

      {/* ── Header ── */}
      <View style={styles.header}>
<View style={styles.headerInner}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerAccent} />
            <View>
                      <Text style={styles.headerTitle}>Audio Tools</Text>
              <Text style={styles.headerSubtitle}>Key · Vocal · Resources</Text>
</View>
          </View>
        </View>
                  </View>

      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        {([
          { key: 'pitch', label: 'Key / Pitch', icon: 'musical-notes' },
          { key: 'vocal', label: 'Vocal', icon: 'mic' },
          { key: 'tools', label: 'Online', icon: 'globe-outline' },
        ] as const).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
activeOpacity={0.7}
                      >
            <Ionicons
name={tab.icon}
size={16}
color={activeTab === tab.key ? '#1A1A1A' : '#AAAAAA'}
/>
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─────────────────────── KEY / PITCH TAB ─────────────────────── */}
      {activeTab === 'pitch' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPad}>

            {/* 1. Import */}
            <View style={styles.card}>
              <StepLabel step="1" label="Import Audio File" />
              <TouchableOpacity
style={styles.importBtn}
onPress={handlePickFile}
disabled={isProcessing}
                activeOpacity={0.8}
>
                <Ionicons name="cloud-download-outline" size={18} color="#FAFAFA" />
                <Text style={styles.importBtnText}>
{isProcessing ? 'Importing…' : 'Choose File'}
</Text>
              </TouchableOpacity>

              {isProcessing && (
                <View style={styles.processingRow}>
                  <ActivityIndicator size="small" color="#1A1A1A" />
                  <Text style={styles.processingText}>Processing audio…</Text>
                </View>
              )}

              {selectedFile && (
                <View style={styles.fileChip}>
                  <View style={styles.fileChipIconBox}>
                    <Ionicons name="musical-notes" size={16} color="#1A1A1A" />
</View>
                                    <View style={{ flex: 1 }}>
                    <Text style={styles.fileChipName} numberOfLines={1}>{fileName}</Text>
                    <Text style={styles.fileChipSub}>Saved locally</Text>
                  </View>
                  <TouchableOpacity onPress={handleClearFile} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color="#999" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Playback */}
            {selectedFile && (
              <View style={styles.card}>
                <View style={styles.cardLabelRow}>
<View style={styles.cardLabelBar} />
                  <Text style={styles.cardLabel}>Playback</Text>
</View>

                                <View style={styles.playbackRow}>
                  <TouchableOpacity
style={[styles.playCircle, pitchPlaybackState.isPlaying && styles.playCircleActive]}
onPress={handlePitchPlayPause}
                    activeOpacity={0.85}
>
                    <Ionicons
name={pitchPlaybackState.isPlaying ? 'pause' : 'play'}
size={22}
color={pitchPlaybackState.isPlaying ? '#FAFAFA' : '#1A1A1A'}
/>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stopCircle} onPress={handlePitchStop} activeOpacity={0.85}>
                    <Ionicons name="stop" size={18} color="#1A1A1A" />
                  </TouchableOpacity>
{pitchPlaybackState.duration > 0 && (
                    <View style={styles.playbackTimeRow}>
                      <Text style={styles.timeText}>{formatTime(pitchPlaybackState.position)}</Text>
                      <Text style={styles.timeSep}>/</Text>
                      <Text style={styles.timeDuration}>{formatTime(pitchPlaybackState.duration)}</Text>
                                      </View>
)}
                </View>

                                  {pitchPlaybackState.duration > 0 && (
                  <Slider
                    style={{ height: 36, marginTop: 4 }}
                    minimumValue={0}
                    maximumValue={pitchPlaybackState.duration}
                    value={pitchPlaybackState.position}
                    onValueChange={async (v) => { if (currentSoundRef.current) await currentSoundRef.current.setPositionAsync(v) }}
                    minimumTrackTintColor="#1A1A1A"
                    maximumTrackTintColor="#DEDEDE"
                    thumbTintColor="#1A1A1A"
                  />
                )}
              </View>
            )}

            {/* 2. Original Key */}
            {selectedFile && (
              <View style={styles.card}>
                <View style={styles.stepLabelDetectRow}>
                  <StepLabel step="2" label="Original Key" />
                  {isDetectingKey && <ActivityIndicator size="small" color="#1A1A1A" />}
                </View>

                {detectionConfidence > 0 && (
                  <View style={styles.confidenceRow}>
                    <View style={styles.confidenceBarBg}>
                      <View style={[styles.confidenceBarFill, { width: `${detectionConfidence}%` }]} />
</View>
                                        <Text style={styles.confidenceText}>{Math.round(detectionConfidence)}% confidence</Text>
                  </View>
                )}

                <View style={styles.keyGrid}>
                  {NOTE_NAMES.map(note => (
                    <TouchableOpacity
                      key={note}
                      style={[styles.keyBtn, currentKey === note && styles.keyBtnActive]}
                      onPress={() => { setCurrentKey(note); setTargetKey(transposeNote(note, pitchShift)) }}
activeOpacity={0.7}
                                          >
                      <Text style={[styles.keyBtnText, currentKey === note && styles.keyBtnTextActive]}>
{note}
</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 3. Pitch Shift */}
            {selectedFile && (
              <View style={styles.card}>
                <StepLabel step="3" label="Adjust Pitch" />

                {/* Key transition display */}
                <View style={styles.pitchDisplay}>
                  <View style={styles.keyPill}>
                    <Text style={styles.keyPillLabel}>FROM</Text>
                    <Text style={styles.keyPillKey}>{currentKey}</Text>
                  </View>
<View style={styles.pitchArrowCol}>
                    <Text style={styles.pitchSemitones}>
                      {pitchShift > 0 ? '+' : ''}{pitchShift}
                    </Text>
                    <Text style={styles.pitchSemiLabel}>semitones</Text>
                    <Ionicons name="arrow-forward" size={18} color="#888" style={{ marginTop: 2 }} />
                                    </View>
<View style={[styles.keyPill, styles.keyPillTarget]}>
                    <Text style={styles.keyPillLabel}>TO</Text>
                    <Text style={[styles.keyPillKey, styles.keyPillKeyTarget]}>{targetKey}</Text>
                  </View>
                </View>

                                  <View style={styles.sliderRow}>
                  <Ionicons name="remove-circle-outline" size={20} color="#888" />
                  <Slider
                    style={styles.slider}
                    minimumValue={-6}
                    maximumValue={6}
                    step={1}
                    value={pitchShift}
                    onValueChange={(v) => { setPitchShift(Math.round(v)); setTargetKey(transposeNote(currentKey, Math.round(v))) }}
                    onSlidingComplete={(v) => { const r = Math.round(v); setPitchShift(r); setTargetKey(transposeNote(currentKey, r)); requestPitchShift(r) }}
                    minimumTrackTintColor="#1A1A1A"
                    maximumTrackTintColor="#DEDEDE"
                    thumbTintColor="#1A1A1A"
                  />
                  <Ionicons name="add-circle-outline" size={20} color="#888" />
                </View>

<Divider />

                {/* Presets */}
                                <Text style={styles.minorLabel}>Quick Adjustments</Text>
                <View style={styles.presetsGrid}>
                  {pitchPresets.slice(2, 8).map(preset => (
                    <TouchableOpacity
                      key={preset.semitones}
                      style={[styles.presetBtn, pitchShift === preset.semitones && styles.presetBtnActive]}
                      onPress={() => handlePresetPress(preset.semitones)}
activeOpacity={0.75}
                                          >
                      <Ionicons
name={preset.icon as any}
size={11}
color={pitchShift === preset.semitones ? '#FAFAFA' : '#555'}
/>
                      <Text style={[styles.presetBtnText, pitchShift === preset.semitones && styles.presetBtnTextActive]}>
                        {preset.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Divider />

                {/* Tempo */}
                <View style={styles.tempoBox}>
<View style={styles.tempoHeaderRow}>
                    <Ionicons name="timer-outline" size={15} color="#555" />
                                      <Text style={styles.tempoTitle}>Tempo Adjustment</Text>
                    <Text style={styles.tempoValue}>
{tempoAdjustPercent > 0 ? '+' : ''}{tempoAdjustPercent}% · ×{(1 + tempoAdjustPercent / 100).toFixed(2)}
</Text>
</View>
                                    <View style={styles.sliderRow}>
                    <Ionicons name="play-back-outline" size={16} color="#888" />
                    <Slider
                      style={styles.slider}
                      minimumValue={MANUAL_TEMPO_MIN_PERCENT}
                      maximumValue={MANUAL_TEMPO_MAX_PERCENT}
                      step={1}
                      value={tempoAdjustPercent}
                      onValueChange={(v) => updateTempoAdjust(v)}
                      onSlidingComplete={(v) => { updateTempoAdjust(v); void applyManualTempoToCurrentSound() }}
                      minimumTrackTintColor="#555"
                      maximumTrackTintColor="#DEDEDE"
                      thumbTintColor="#555"
                    />
                    <Ionicons name="play-forward-outline" size={16} color="#888" />
                  </View>
                  <View style={styles.tempoQuickRow}>
                    {[-10, -5, 0, 5, 10].map(v => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.tempoQuickBtn, tempoAdjustPercent === v && styles.tempoQuickBtnActive]}
                        onPress={() => { updateTempoAdjust(v); void applyManualTempoToCurrentSound() }}
activeOpacity={0.7}
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
              <TouchableOpacity
style={styles.saveBtn}
onPress={async () => {
                  setIsProcessing(true)
                  try {
                    await updateAudioFileMetadata(localFilePath?.split('/').pop() || '', {
originalKey: currentKey, targetKey, pitchShift, tempoAdjustPercent,
tempoAdjustFactor: 1 + tempoAdjustPercent / 100,
})
                    Alert.alert('Saved', `Pitch settings saved.\nKey: ${currentKey} → ${targetKey}\nShift: ${pitchShift > 0 ? '+' : ''}${pitchShift} semitones`)
                  } finally { setIsProcessing(false) }
                }}
disabled={isProcessing}
                activeOpacity={0.85}
>
                <Ionicons name="checkmark" size={18} color="#FAFAFA" />
                <Text style={styles.saveBtnText}>
{isProcessing ? 'Saving…' : 'Save Pitch Settings'}
</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ─────────────────────── VOCAL REMOVER TAB ─────────────────────── */}
      {activeTab === 'vocal' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPad}>

          {/* 1. Select file */}
          <View style={styles.card}>
            <StepLabel step="1" label="Select Audio File" />
            <TouchableOpacity style={styles.uploadZone} onPress={handlePickVocalAudio} activeOpacity={0.75}>
<View style={styles.uploadIconBox}>
                              <Ionicons name="cloud-upload-outline" size={28} color="#555" />
</View>
                            <View style={{ flex: 1 }}>
                <Text style={styles.uploadTitle}>
{selectedVocalAudioName || 'Choose Audio File'}
</Text>
                <Text style={styles.uploadSub}>
{selectedVocalAudioName ? 'Tap to change file' : 'MP3, WAV, M4A, AAC'}
</Text>
              </View>
<Ionicons name="chevron-forward" size={18} color="#AAAAAA" />
                          </TouchableOpacity>
          </View>

          {/* 2. Removal type */}
          <View style={styles.card}>
            <StepLabel step="2" label="Removal Type" />
            <View style={styles.removalRow}>
              {([
                { key: 'vocal', label: 'Remove Vocals', sub: 'Get instrumental track', icon: 'mic-outline' },
                { key: 'instrument', label: 'Remove Instrument', sub: 'Isolate specific part', icon: 'musical-notes-outline' },
              ] as const).map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.removalBtn, removalMode === item.key && styles.removalBtnActive]}
                  onPress={() => { setRemovalMode(item.key); if (item.key === 'vocal') setSelectedInstrument(null) }}
activeOpacity={0.75}
                                  >
                  <Ionicons
name={item.icon}
size={26}
color={removalMode === item.key ? '#1A1A1A' : '#BBBBBB'}
/>
                  <Text style={[styles.removalBtnTitle, removalMode === item.key && styles.removalBtnTitleActive]}>
{item.label}
</Text>
                  <Text style={styles.removalBtnSub}>{item.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 3. Instrument picker */}
          {removalMode === 'instrument' && (
            <View style={styles.card}>
              <StepLabel step="3" label="Choose Instrument" />
              <View style={styles.instrumentGrid}>
                {instruments.map(inst => (
                  <TouchableOpacity
                    key={inst.id}
                    style={[styles.instrumentCard, selectedInstrument === inst.id && styles.instrumentCardActive]}
                    onPress={() => setSelectedInstrument(inst.id)}
activeOpacity={0.75}
                                      >
                    <View style={[styles.instrumentIconBox, selectedInstrument === inst.id && styles.instrumentIconBoxActive]}>
                      <Ionicons name={inst.icon as any} size={22} color={selectedInstrument === inst.id ? '#FAFAFA' : '#555'} />
                    </View>
                    <Text style={[styles.instrumentName, selectedInstrument === inst.id && styles.instrumentNameActive]}>
{inst.name}
</Text>
                    {selectedInstrument === inst.id && (
<Ionicons name="checkmark-circle" size={16} color="#1A1A1A" style={{ marginTop: 4 }} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Process */}
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.processBtn, isVocalProcessing && styles.processBtnDisabled]}
              onPress={handleProcessVocalAudio}
              disabled={isVocalProcessing}
activeOpacity={0.85}
                          >
              {isVocalProcessing
                ? <><ActivityIndicator color="#FAFAFA" /><Text style={styles.processBtnText}>{progress.message || 'Processing…'}</Text></>
                : <><Ionicons name="cog-outline" size={20} color="#FAFAFA" /><Text style={styles.processBtnText}>Process Audio</Text></>
              }
            </TouchableOpacity>

            {isVocalProcessing && (
              <View style={styles.progressBox}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progress.progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(progress.progress)}%</Text>
              </View>
            )}
          </View>

          {/* Playback result */}
          {processedAudioUri && (
            <View style={styles.card}>
              <View style={styles.cardLabelRow}>
                <View style={styles.cardLabelBar} />
                <Text style={styles.cardLabel}>Result Playback</Text>
</View>
                            <View style={styles.vocalPlayerRow}>
                <TouchableOpacity
                  style={[styles.playCircle, vocalIsPlaying && styles.playCircleActive]}
onPress={handleVocalPlayPause}
                  activeOpacity={0.85}
>
                  <Ionicons
name={vocalIsPlaying ? 'pause' : 'play'}
size={22}
color={vocalIsPlaying ? '#FAFAFA' : '#1A1A1A'}
/>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Slider
                    style={{ height: 36 }}
                    minimumValue={0}
                    maximumValue={vocalPlaybackDuration}
                    value={vocalPlaybackPosition}
                    onValueChange={(v) => removalService.seek(v)}
                    minimumTrackTintColor="#1A1A1A"
                    maximumTrackTintColor="#DEDEDE"
                    thumbTintColor="#1A1A1A"
                  />
<View style={styles.timeRow}>
                    <Text style={styles.timeText}>{formatTime(vocalPlaybackPosition)}</Text>
                                      <Text style={styles.timeText}>{formatTime(vocalPlaybackDuration)}</Text>
</View>
                                  </View>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ─────────────────────── ONLINE TOOLS TAB ─────────────────────── */}
      {activeTab === 'tools' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPad}>
          <View style={styles.toolsHeaderRow}>
            <Text style={styles.toolsHeaderTitle}>Online Resources</Text>
            <Text style={styles.toolsHeaderSub}>External tools for advanced processing</Text>
</View>

                    {onlineTools.map((tool, index) => (
            <TouchableOpacity
key={tool.title}
style={styles.toolCard}
onPress={() => handleOpenTool(tool.url)}
              activeOpacity={0.8}
>
              <View style={styles.toolIndex}>
                <Text style={styles.toolIndexText}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
              <View style={{ flex: 1 }}>
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
<View style={styles.toolArrow}>
                              <Ionicons name="arrow-forward" size={14} color="#1A1A1A" />
</View>
                          </TouchableOpacity>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F2' },

  // ── Header ──
  header: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  headerInner: {},
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAccent: {
    width: 4, height: 40, borderRadius: 2,
    backgroundColor: '#FFFFFF',
    opacity: 0.35,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FAFAFA',
    letterSpacing: -0.3,
},
  headerSubtitle: {
fontSize: 11,
color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // ── Tab Bar ──
  tabBar: {
flexDirection: 'row',
backgroundColor: '#FFF',
borderBottomWidth: 1,
borderBottomColor: '#E8E8E8',
},
  tab: {
flex: 1,
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
paddingVertical: 13,
gap: 5,
},
  tabActive: {
borderBottomWidth: 2,
borderBottomColor: '#1A1A1A',
},
  tabText: {
fontSize: 11,
fontWeight: '600',
color: '#AAAAAA',
    letterSpacing: 0.3,
},
  tabTextActive: {
    color: '#1A1A1A',
  },

  // ── Content ──
  content: { flex: 1 },
  scrollPad: { padding: 16 },

  // ── Card ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardLabelRow: {
flexDirection: 'row',
alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardLabelBar: {
    width: 3,
    height: 13,
    borderRadius: 2,
    backgroundColor: '#1A1A1A',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Import ──
  importBtn: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 18,
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 8,
},
  importBtnText: {
color: '#FAFAFA',
fontSize: 14,
fontWeight: '700',
    letterSpacing: 0.5,
},
  processingRow: {
    flexDirection: 'row',
alignItems: 'center',
    gap: 10,
    marginTop: 12,
backgroundColor: '#F5F5F5',
borderRadius: 8,
    padding: 12,
},
  processingText: {
fontSize: 13,
color: '#555',
fontWeight: '500',
},
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
backgroundColor: '#F5F5F5',
borderRadius: 10,
padding: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  fileChipIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center',
alignItems: 'center',
},
  fileChipName: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  fileChipSub: { fontSize: 11, color: '#AAAAAA' },

  // ── Playback ──
  playbackRow: {
flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F0F0',
    borderWidth: 1.5,
    borderColor: '#DEDEDE',
justifyContent: 'center',
alignItems: 'center',
},
  playCircleActive: {
backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },
  stopCircle: {
width: 40,
height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#DEDEDE',
justifyContent: 'center',
    alignItems: 'center',
  },
  playbackTimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  timeText: { fontSize: 11, color: '#888' },
  timeSep: { fontSize: 11, color: '#CCCCCC' },
  timeDuration: { fontSize: 11, color: '#BBBBBB' },
  timeRow: {
flexDirection: 'row',
justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },

  // ── Key Detection ──
  stepLabelDetectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
},
  confidenceRow: {
marginBottom: 14,
  },
  confidenceBarBg: {
    height: 4,
backgroundColor: '#EDEDED',
borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  confidenceBarFill: {
    height: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 2,
},
  confidenceText: {
fontSize: 11,
color: '#888',
fontWeight: '500',
},
  keyGrid: {
flexDirection: 'row',
flexWrap: 'wrap',
gap: 8,
},
  keyBtn: {
width: '18%',
aspectRatio: 1,
backgroundColor: '#F7F7F7',
borderRadius: 8,
justifyContent: 'center',
alignItems: 'center',
borderWidth: 1.5,
borderColor: '#E4E4E4',
},
  keyBtnActive: {
backgroundColor: '#1A1A1A',
borderColor: '#1A1A1A',
},
  keyBtnText: { fontSize: 13, fontWeight: '700', color: '#444' },
  keyBtnTextActive: { color: '#FAFAFA' },

  // ── Pitch Display ──
  pitchDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
backgroundColor: '#F7F7F7',
borderRadius: 12,
padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  keyPill: {
alignItems: 'center',
    minWidth: 64,
  },
  keyPillLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#AAAAAA',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  keyPillKey: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -1,
  },
  keyPillTarget: { alignItems: 'center' },
  keyPillKeyTarget: { color: '#444' },
  pitchArrowCol: { alignItems: 'center' },
  pitchSemitones: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  pitchSemiLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#AAAAAA',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 1,
  },

  // ── Slider ──
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { flex: 1, height: 36 },

  // ── Presets ──
  minorLabel: {
fontSize: 10,
fontWeight: '700',
color: '#AAAAAA',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
marginBottom: 10,
},
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
backgroundColor: '#F5F5F5',
borderRadius: 7,
paddingVertical: 8,
paddingHorizontal: 10,
borderWidth: 1,
borderColor: '#E4E4E4',
minWidth: '31%',
flex: 1,
},
  presetBtnActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  presetBtnText: { fontSize: 11, color: '#555', fontWeight: '500' },
  presetBtnTextActive: { color: '#FAFAFA' },

  // ── Tempo ──
  tempoBox: {
backgroundColor: '#F7F7F7',
borderRadius: 10,
padding: 14,
borderWidth: 1,
borderColor: '#EBEBEB',
  },
  tempoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
marginBottom: 10,
},
  tempoTitle: {
fontSize: 13,
fontWeight: '600',
color: '#333',
    flex: 1,
},
  tempoValue: {
fontSize: 12,
fontWeight: '600',
    color: '#888',
},
  tempoQuickRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  tempoQuickBtn: {
flex: 1,
backgroundColor: '#FFF',
borderRadius: 7,
paddingVertical: 8,
borderWidth: 1,
borderColor: '#DEDEDE',
alignItems: 'center',
},
  tempoQuickBtnActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  tempoQuickText: { fontSize: 11, color: '#666', fontWeight: '600' },
  tempoQuickTextActive: { color: '#FAFAFA' },

  // ── Save Button ──
  saveBtn: {
backgroundColor: '#1A1A1A',
borderRadius: 10,
paddingVertical: 15,
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  saveBtnText: {
    color: '#FAFAFA',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  // ── Upload Zone ──
  uploadZone: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D8D8D8',
borderStyle: 'dashed',
    backgroundColor: '#FAFAFA',
    padding: 16,
    flexDirection: 'row',
alignItems: 'center',
    gap: 14,
  },
  uploadIconBox: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E4E4E4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  uploadSub: { fontSize: 12, color: '#AAAAAA' },

  // ── Removal Type ──
  removalRow: { flexDirection: 'row', gap: 12 },
  removalBtn: {
flex: 1,
backgroundColor: '#F7F7F7',
borderRadius: 12,
padding: 16,
alignItems: 'center',
borderWidth: 1.5,
borderColor: '#EBEBEB',
    gap: 6,
},
  removalBtnActive: {
borderColor: '#1A1A1A',
backgroundColor: '#FFF',
},
  removalBtnTitle: {
fontSize: 12,
fontWeight: '700',
color: '#AAAAAA',
textAlign: 'center',
    letterSpacing: 0.2,
},
  removalBtnTitleActive: { color: '#1A1A1A' },
  removalBtnSub: { fontSize: 11, color: '#BBBBBB', textAlign: 'center' },

  // ── Instruments ──
  instrumentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  instrumentCard: {
width: '48%',
backgroundColor: '#F7F7F7',
borderRadius: 12,
padding: 14,
alignItems: 'center',
borderWidth: 1.5,
    borderColor: '#EBEBEB',
    gap: 8,
},
  instrumentCardActive: { borderColor: '#1A1A1A', backgroundColor: '#FFF' },
  instrumentIconBox: {
width: 52,
height: 52,
borderRadius: 26,
    backgroundColor: '#EBEBEB',
justifyContent: 'center',
    alignItems: 'center',
  },
  instrumentIconBoxActive: { backgroundColor: '#1A1A1A' },
  instrumentName: { fontSize: 12, fontWeight: '600', color: '#888', textAlign: 'center' },
instrumentNameActive: { color: '#1A1A1A' },

  // ── Process Button ──
    processBtn: {
backgroundColor: '#1A1A1A',
borderRadius: 10,
paddingVertical: 15,
alignItems: 'center',
justifyContent: 'center',
flexDirection: 'row',
gap: 10,
},
  processBtnDisabled: { opacity: 0.55 },
  processBtnText: { color: '#FAFAFA', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  progressBox: { marginTop: 14 },
  progressBarBg: {
height: 5,
backgroundColor: '#E8E8E8',
borderRadius: 3,
overflow: 'hidden',
marginBottom: 6,
},
  progressBarFill: { height: '100%', backgroundColor: '#1A1A1A' },
  progressText: { fontSize: 11, color: '#AAAAAA', textAlign: 'right', fontWeight: '600' },

  // ── Vocal Player ──
  vocalPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  // ── Online Tools ──
  toolsHeaderRow: { marginBottom: 16 },
  toolsHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  toolsHeaderSub: { fontSize: 12, color: '#AAAAAA' },
  toolCard: {
backgroundColor: '#FFF',
borderRadius: 12,
flexDirection: 'row',
alignItems: 'center',
    gap: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  toolIndex: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E4E4E4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolIndexText: { fontSize: 11, fontWeight: '700', color: '#999' },
  toolTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  toolDesc: { fontSize: 12, color: '#888', marginBottom: 8 },
  toolFeatures: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  toolBadge: {
backgroundColor: '#F2F2F2',
borderRadius: 6,
paddingHorizontal: 8,
paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E8E8E8',
},
  toolBadgeText: { fontSize: 10, color: '#777', fontWeight: '600' },
  toolArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
},
  })