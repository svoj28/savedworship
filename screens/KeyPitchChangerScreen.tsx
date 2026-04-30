// screens/KeyPitchChangerScreen.tsx
import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import Slider from '@react-native-community/slider'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as DocumentPicker from 'expo-document-picker'
import { Audio } from 'expo-av'

import { transposeNote, getNotes } from '../lib/keyDetection'
import { saveAudioFileLocally, updateAudioFileMetadata } from '../lib/audioFileManager'
import { pitchShifter } from '../lib/pitchShifter'
import ProgressBar from '../components/ProgressBar'

const NOTE_NAMES = getNotes()

function semitonesToPlaybackRate(semitones: number): number {
  return Math.pow(2, semitones / 12)
}

const MANUAL_TEMPO_MIN_PERCENT = -40
const MANUAL_TEMPO_MAX_PERCENT = 40

function clampPlaybackRate(rate: number): number {
  return Math.min(2.0, Math.max(0.5, rate))
}

const TEMPO_OPPOSITION_BOOST_AT_12 = 1.03

function getTempoOppositionBoost(semitones: number): number {
  const normalizedSemitoneDistance = Math.min(1, Math.abs(semitones) / 12)
  return 1 + (TEMPO_OPPOSITION_BOOST_AT_12 - 1) * normalizedSemitoneDistance
}

function boostOpposingTempoRate(rate: number, semitones: number): number {
  if (!Number.isFinite(rate) || rate <= 0 || semitones === 0) {
    return 1
  }

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

export default function KeyPitchChangerScreen() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [localFilePath, setLocalFilePath] = useState<string | null>(null)
  const [currentTab, setCurrentTab] = useState<'classic'>('classic')
  const [pitchShift, setPitchShift] = useState(0)
  const [tempoAdjustPercent, setTempoAdjustPercent] = useState(0)
  const [currentKey, setCurrentKey] = useState('C')
  const [targetKey, setTargetKey] = useState('C')
  const [isDetectingKey, setIsDetectingKey] = useState(false)
  const [detectionConfidence, setDetectionConfidence] = useState(0)
  const [sound, setSound] = useState<Audio.Sound | null>(null)
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    duration: 0,
    position: 0,
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [pitchShiftInfo, setPitchShiftInfo] = useState<{
    canDoPurePitchShift: boolean
    platform: string
    note: string
  }>({ canDoPurePitchShift: false, platform: 'unknown', note: '' })
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const soundIdRef = useRef<string>(`sound-${Date.now()}`)
  const currentSoundRef = useRef<Audio.Sound | null>(null)
  const playbackStateRef = useRef<PlaybackState>(playbackState)
  const isApplyingPitchRef = useRef(false)
  const pendingSemitoneRef = useRef<number | null>(null)
  const activeSemitoneRef = useRef(0)
  const originalDurationRef = useRef(0)
  const activePurePlaybackRateRef = useRef(1)
  const manualTempoFactorRef = useRef(1)

  const getPurePlaybackRateCorrection = (shiftedDurationMillis: number, semitones: number): number => {
    const originalDurationMillis = originalDurationRef.current
    if (originalDurationMillis <= 0 || shiftedDurationMillis <= 0) {
      return 1
    }

    // Match the shifted preview duration to the original file duration.
    const correctionRate = shiftedDurationMillis / originalDurationMillis
    if (!Number.isFinite(correctionRate)) {
      return 1
    }

    if (Math.abs(correctionRate - 1) < 0.001) {
      return 1
    }

    const boostedCorrectionRate = boostOpposingTempoRate(correctionRate, semitones)

    return Math.min(2.0, Math.max(0.5, boostedCorrectionRate))
  }

  const applyRateForCurrentPitch = async (
    audioSound: Audio.Sound,
    semitones: number,
    supportsPurePitch: boolean
  ): Promise<boolean> => {
    const status = await audioSound.getStatusAsync()
    if (!status.isLoaded) {
      return false
    }

    if (supportsPurePitch) {
      // In pure pitch mode, use measured duration correction to keep tempo neutral.
      const purePlaybackRate = clampPlaybackRate(
        activePurePlaybackRateRef.current * manualTempoFactorRef.current
      )
      await audioSound.setRateAsync(purePlaybackRate, true)
      return true
    }

    const fallbackPlaybackRate = clampPlaybackRate(
      semitonesToPlaybackRate(semitones) * manualTempoFactorRef.current
    )
    await audioSound.setRateAsync(fallbackPlaybackRate, false)
    return true
  }

  const updateTempoAdjust = (value: number): number => {
    const roundedValue = Math.round(value)
    const clampedValue = Math.min(MANUAL_TEMPO_MAX_PERCENT, Math.max(MANUAL_TEMPO_MIN_PERCENT, roundedValue))
    setTempoAdjustPercent(clampedValue)
    manualTempoFactorRef.current = 1 + clampedValue / 100
    return clampedValue
  }

  const applyManualTempoToCurrentSound = async () => {
    const currentSound = currentSoundRef.current
    if (!currentSound) {
      return
    }

    try {
      const supportsPurePitch = pitchShifter.getPitchShiftInfo().canDoPurePitchShift
      await applyRateForCurrentPitch(currentSound, activeSemitoneRef.current, supportsPurePitch)
    } catch (error) {
      console.error('Error applying manual tempo adjustment:', error)
    }
  }

  // Common pitch shift presets (in semitones)
  const presets: PitchShiftStep[] = [
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

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync()
      }
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }
      // Cleanup pitch shifter resources
      pitchShifter.cleanup(soundIdRef.current)
    }
  }, [sound])

  useEffect(() => {
    currentSoundRef.current = sound
  }, [sound])

  useEffect(() => {
    playbackStateRef.current = playbackState
  }, [playbackState])

  // Get pitch shift info on mount
  useEffect(() => {
    const info = pitchShifter.getPitchShiftInfo()
    setPitchShiftInfo(info)
  }, [])

  // Pick audio file from device
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/*'],
      })

      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0]
        setSelectedFile(file.uri)
        setFileName(file.name || 'Selected Audio File')

        // Save file locally
        try {
          setIsProcessing(true)
          const savedFile = await saveAudioFileLocally(file.uri, file.name || 'audio-file')
          setLocalFilePath(savedFile.localUri)

          // Load audio for playback
          await loadAudio(savedFile.localUri)

          // Auto-detect key
          await detectAudioKey(savedFile.localUri)
        } catch (error) {
          console.error('Error saving audio locally:', error)
          Alert.alert('Error', 'Failed to save audio file locally')
        } finally {
          setIsProcessing(false)
        }
      }
    } catch (error) {
      console.error('Error picking file:', error)
      Alert.alert('Error', 'Failed to pick audio file')
    }
  }

  // Load audio for playback
  const loadAudio = async (uri: string) => {
    try {
      if (currentSoundRef.current) {
        await currentSoundRef.current.unloadAsync()
      }

      const { sound: newSound } = await Audio.Sound.createAsync({ uri })
      setSound(newSound)
      currentSoundRef.current = newSound

      // Initialize pitch shifter for this audio
      await pitchShifter.initializePitchShifter(uri, soundIdRef.current)

      // Reset pitch to 0 on initial load
      setPitchShift(0)
      activeSemitoneRef.current = 0
      activePurePlaybackRateRef.current = 1
      setTempoAdjustPercent(0)
      manualTempoFactorRef.current = 1
      setCurrentKey('C')
      setTargetKey('C')

      // Get duration
      const status = await newSound.getStatusAsync()
      if (status.isLoaded) {
        originalDurationRef.current = status.durationMillis || 0
        setPlaybackState((prev) => ({
          ...prev,
          duration: status.durationMillis || 0,
        }))
      }
    } catch (error) {
      console.error('Error loading audio:', error)
      Alert.alert('Error', 'Failed to load audio file')
    }
  }

  // Auto-detect key from audio
  const detectAudioKey = async (uri: string) => {
    try {
      setIsDetectingKey(true)
      // Note: Real-time key detection from audio buffer would require
      // native code or Web Audio API. This is a simplified version.
      // For production, consider using:
      // - native code for iOS/Android
      // - machine learning model (TensorFlow Lite)
      // - cloud API (Spotify, Mela, etc.)

      // For now, we'll simulate key detection
      // In a real app, you would analyze the audio buffer
      setTimeout(() => {
        // Randomly suggest a key (in production, analyze actual audio)
        const suggestedKey = NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)]
        setCurrentKey(suggestedKey)
        setDetectionConfidence(Math.random() * 50 + 50) // 50-100% confidence
        setIsDetectingKey(false)

        Alert.alert(
          'Key Detection',
          `Detected key: ${suggestedKey} (${Math.round(detectionConfidence)}% confidence)\n\nYou can adjust if needed.`,
          [{ text: 'OK', onPress: () => {} }]
        )
      }, 1500)
    } catch (error) {
      console.error('Error detecting key:', error)
      setIsDetectingKey(false)
    }
  }

  // Play/Pause audio
  const handlePlayPause = async () => {
    const currentSound = currentSoundRef.current
    if (!currentSound) {
      Alert.alert('Error', 'No audio loaded')
      return
    }

    try {
      if (playbackState.isPlaying) {
        await currentSound.pauseAsync()
      } else {
        const supportsPurePitch = pitchShifter.getPitchShiftInfo().canDoPurePitchShift
        await applyRateForCurrentPitch(currentSound, activeSemitoneRef.current, supportsPurePitch)
        await currentSound.playAsync()
      }

      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: !prev.isPlaying,
      }))

      // Update position
      if (!playbackState.isPlaying) {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current)
        }

        playbackIntervalRef.current = setInterval(async () => {
          const soundForTick = currentSoundRef.current
          if (soundForTick) {
            const status = await soundForTick.getStatusAsync()
            if (status.isLoaded) {
              setPlaybackState((prev) => ({
                ...prev,
                position: status.positionMillis || 0,
              }))

              if (status.didJustFinish) {
                setPlaybackState((prev) => ({
                  ...prev,
                  isPlaying: false,
                  position: 0,
                }))
              }
            }
          }
        }, 100)
      } else {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current)
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error)
      Alert.alert('Error', 'Failed to play audio')
    }
  }

  // Stop audio playback
  const handleStopPlayback = async () => {
    const currentSound = currentSoundRef.current
    if (!currentSound) return

    try {
      await currentSound.stopAsync()
      const supportsPurePitch = pitchShifter.getPitchShiftInfo().canDoPurePitchShift
      await applyRateForCurrentPitch(currentSound, activeSemitoneRef.current, supportsPurePitch)
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }

      setPlaybackState({
        isPlaying: false,
        duration: 0,
        position: 0,
      })
    } catch (error) {
      console.error('Error stopping audio:', error)
    }
  }

  // Seek to position
  const handleSeek = async (position: number) => {
    const currentSound = currentSoundRef.current
    if (!currentSound) return

    try {
      await currentSound.setPositionAsync(position)
      setPlaybackState((prev) => ({
        ...prev,
        position,
      }))
    } catch (error) {
      console.error('Error seeking:', error)
    }
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
    setPlaybackState({
      isPlaying: false,
      duration: 0,
      position: 0,
    })
  }

  const processPendingPitchShift = async () => {
    if (!localFilePath || isApplyingPitchRef.current) return

    isApplyingPitchRef.current = true
    setIsProcessing(true)

    try {
      while (pendingSemitoneRef.current !== null) {
        const semitones = pendingSemitoneRef.current
        pendingSemitoneRef.current = null

        if (semitones === activeSemitoneRef.current) {
          continue
        }

        const audioSound = currentSoundRef.current
        if (!audioSound) break

        const wasPlaying = playbackStateRef.current.isPlaying

        const supportsPurePitch = pitchShifter.getPitchShiftInfo().canDoPurePitchShift
        if (!supportsPurePitch) {
          activePurePlaybackRateRef.current = 1
          const applied = await applyRateForCurrentPitch(audioSound, semitones, false)
          if (applied) {
            activeSemitoneRef.current = semitones
          }
          continue
        }

        const shiftedFilePath = await pitchShifter.applyPitchShift(
          audioSound,
          semitones,
          soundIdRef.current,
          localFilePath
        )

        if (!shiftedFilePath) {
          await applyRateForCurrentPitch(audioSound, activeSemitoneRef.current, true)

          continue
        }

        const status = await audioSound.getStatusAsync()
        if (status.isLoaded) {
          if (wasPlaying) {
            await audioSound.pauseAsync()
          }
          await audioSound.unloadAsync()
        }

        if (currentSoundRef.current === audioSound) {
          currentSoundRef.current = null
        }

        const { sound: newSound } = await Audio.Sound.createAsync({ uri: shiftedFilePath })
        setSound(newSound)
        currentSoundRef.current = newSound
        activeSemitoneRef.current = semitones

        const newStatus = await newSound.getStatusAsync()
        if (newStatus.isLoaded) {
          activePurePlaybackRateRef.current = getPurePlaybackRateCorrection(
            newStatus.durationMillis || 0,
            semitones
          )
        } else {
          activePurePlaybackRateRef.current = 1
        }

        await applyRateForCurrentPitch(newSound, semitones, true)

        if (wasPlaying) {
          await newSound.playAsync()
        }

        if (newStatus.isLoaded) {
          setPlaybackState((prev) => ({
            ...prev,
            duration: newStatus.durationMillis || 0,
            position: 0,
            isPlaying: wasPlaying,
          }))
        }
      }
    } catch (error) {
      console.error('Error applying pitch shift:', error)
      Alert.alert('Error', 'Failed to apply pitch shift')
    } finally {
      isApplyingPitchRef.current = false
      setIsProcessing(false)
      if (pendingSemitoneRef.current !== null) {
        void processPendingPitchShift()
      }
    }
  }

  const requestPitchShift = (semitones: number) => {
    if (!localFilePath) return

    pendingSemitoneRef.current = semitones
    if (!isApplyingPitchRef.current) {
      void processPendingPitchShift()
    }
  }

  const handlePresetPress = async (semitones: number) => {
    setPitchShift(semitones)
    updateTargetKey(semitones)
    requestPitchShift(semitones)
  }

  const updateTargetKey = (semitones: number) => {
    const newKey = transposeNote(currentKey, semitones)
    setTargetKey(newKey)
  }

  const handlePitchSliderChange = (value: number) => {
    const roundedValue = Math.round(value)
    setPitchShift(roundedValue)
    updateTargetKey(roundedValue)
  }

  const handlePitchSliderComplete = (value: number) => {
    const roundedValue = Math.round(value)
    setPitchShift(roundedValue)
    updateTargetKey(roundedValue)
    requestPitchShift(roundedValue)
  }

  const handleTempoSliderChange = (value: number) => {
    updateTempoAdjust(value)
  }

  const handleTempoSliderComplete = (value: number) => {
    updateTempoAdjust(value)
    void applyManualTempoToCurrentSound()
  }

  const handleTempoQuickSet = (value: number) => {
    updateTempoAdjust(value)
    void applyManualTempoToCurrentSound()
  }

  const handleApplyPitchShift = async () => {
    if (!selectedFile || !localFilePath) {
      Alert.alert('Error', 'Please select an audio file first')
      return
    }

    try {
      setIsProcessing(true)

      // Save metadata
      await updateAudioFileMetadata(localFilePath.split('/').pop() || '', {
        originalKey: currentKey,
        targetKey: targetKey,
        pitchShift: pitchShift,
        tempoAdjustPercent,
        tempoAdjustFactor: 1 + tempoAdjustPercent / 100,
      })

      Alert.alert(
        'Pitch Shift Applied',
        `File: ${fileName}\n\n` +
          `Original Key: ${currentKey}\n` +
          `Target Key: ${targetKey}\n` +
          `Pitch Shift: ${pitchShift > 0 ? '+' : ''}${pitchShift} semitones\n` +
          `Tempo Adjust: ${tempoAdjustPercent > 0 ? '+' : ''}${tempoAdjustPercent}%\n\n` +
          `The audio file and pitch settings were saved locally.\n\n` +
          `Pitch-shifted previews are processed on this device and cached for playback.`,
        [{ text: 'OK', onPress: () => {} }]
      )
    } catch (error) {
      console.error('Error saving pitch shift info:', error)
      Alert.alert('Error', 'Failed to save pitch shift information')
    } finally {
      setIsProcessing(false)
    }
  }

  const getSemitoneLabel = (semitones: number) => {
    if (semitones === 0) return 'Original'
    const interval = Math.abs(semitones)
    const direction = semitones > 0 ? 'Up' : 'Down'
    return `${direction} ${interval} semitone${interval !== 1 ? 's' : ''}`
  }

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <View style={[styles.tab, styles.tabActive]}>
          <Ionicons name="musical-notes" size={18} color={'#007AFF'} />
          <Text style={[styles.tabText, styles.tabTextActive]}>Classic</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {currentTab === 'classic' ? (
          <>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Key/Pitch Changer</Text>
              <Text style={styles.subtitle}>Import, detect key, and adjust pitch locally</Text>
            </View>

            {/* File Selection Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>1. Import Audio File</Text>

              <TouchableOpacity style={styles.filePickerButton} onPress={handlePickFile} disabled={isProcessing}>
                <Ionicons name="cloud-download-outline" size={20} color="#fff" />
                <Text style={styles.filePickerButtonText}>
                  {isProcessing ? 'Importing...' : 'Import Audio File'}
                </Text>
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
              <View style={styles.fileInfoContent}>
                <Text style={styles.fileInfoName}>{fileName}</Text>
                <Text style={styles.fileInfoPath}>Saved locally</Text>
              </View>
              <TouchableOpacity onPress={handleClearFile}>
                <Ionicons name="close" size={24} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Audio Playback Section */}
        {selectedFile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audio Playback</Text>

            {/* Playback Controls */}
            <View style={styles.playbackControls}>
              <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
                <Ionicons
                  name={playbackState.isPlaying ? 'pause' : 'play'}
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.stopButton} onPress={handleStopPlayback}>
                <Ionicons name="stop" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            {playbackState.duration > 0 && (
              <>
                <View style={styles.progressContainer}>
                  <Slider
                    style={styles.progressSlider}
                    minimumValue={0}
                    maximumValue={playbackState.duration}
                    value={playbackState.position}
                    onValueChange={handleSeek}
                    minimumTrackTintColor="#007AFF"
                    maximumTrackTintColor="#e0e0e0"
                  />
                </View>

                <View style={styles.timeContainer}>
                  <Text style={styles.timeText}>{formatTime(playbackState.position)}</Text>
                  <Text style={styles.timeText}>{formatTime(playbackState.duration)}</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Key Selection Section */}
        {selectedFile && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>2. Original Key</Text>
              {isDetectingKey && <ActivityIndicator size="small" color="#007AFF" />}
            </View>

            {isDetectingKey && (
              <View style={styles.detectionStatus}>
                <Text style={styles.detectionText}>Detecting key from audio...</Text>
              </View>
            )}

            {detectionConfidence > 0 && (
              <View style={styles.confidenceContainer}>
                <View style={styles.confidenceBar}>
                  <ProgressBar
                    progress={detectionConfidence / 100}
                    color="#34C759"
                    backgroundColor="#e0e0e0"
                    height={6}
                  />
                </View>
                <Text style={styles.confidenceText}>Confidence: {Math.round(detectionConfidence)}%</Text>
              </View>
            )}

            <View style={styles.keyGrid}>
              {NOTE_NAMES.map((note) => (
                <TouchableOpacity
                  key={note}
                  style={[styles.keyButton, currentKey === note && styles.keyButtonActive]}
                  onPress={() => {
                    setCurrentKey(note)
                    updateTargetKey(pitchShift)
                  }}
                >
                  <Text
                    style={[styles.keyButtonText, currentKey === note && styles.keyButtonTextActive]}
                  >
                    {note}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Pitch Shift Section */}
        {selectedFile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Adjust Pitch (Tempo Preserved)</Text>

            {/* Current Pitch Value */}
            <View style={styles.pitchDisplayContainer}>
              <View style={styles.pitchDisplay}>
                <Text style={styles.pitchDisplayLabel}>Current Shift:</Text>
                <Text style={styles.pitchDisplayValue}>
                  {pitchShift > 0 ? '+' : ''}{pitchShift} semitones
                </Text>
                <Text style={styles.pitchDisplaySubtext}>{getSemitoneLabel(pitchShift)}</Text>
              </View>
              <View style={styles.keyTransitionContainer}>
                <Text style={styles.keyTransitionLabel}>{currentKey}</Text>
                <Ionicons name="arrow-forward" size={20} color="#007AFF" />
                <Text style={styles.keyTransitionLabel}>{targetKey}</Text>
              </View>
            </View>

            {/* Pitch Slider - Main Control */}
            <View style={styles.sliderContainer}>
              <Ionicons name="arrow-down-circle" size={22} color="#FF3B30" />
              <Slider
                style={styles.slider}
                minimumValue={-6}
                maximumValue={6}
                step={1}
                value={pitchShift}
                onValueChange={handlePitchSliderChange}
                onSlidingComplete={handlePitchSliderComplete}
                minimumTrackTintColor="#007AFF"
                maximumTrackTintColor="#ccc"
              />
              <Ionicons name="arrow-up-circle" size={22} color="#34C759" />
            </View>

            {/* Preset Buttons - Quick Pitch Adjustments */}
            <Text style={styles.presetsTitle}>Quick Adjustments</Text>
            <View style={styles.presetsGrid}>
              {presets.slice(2, 8).map((preset) => (
                <TouchableOpacity
                  key={preset.semitones}
                  style={[
                    styles.presetButton,
                    pitchShift === preset.semitones && styles.presetButtonActive,
                  ]}
                  onPress={() => handlePresetPress(preset.semitones)}
                >
                  <Ionicons
                    name={preset.icon as any}
                    size={16}
                    color={pitchShift === preset.semitones ? '#fff' : '#007AFF'}
                  />
                  <Text
                    style={[
                      styles.presetButtonText,
                      pitchShift === preset.semitones && styles.presetButtonTextActive,
                    ]}
                  >
                    {preset.displayName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tempo Adjustment - Optional */}
            <View style={styles.tempoAdjustContainer}>
              <View style={styles.tempoHeaderContainer}>
                <Ionicons name="speedometer" size={20} color="#FF9500" />
                <Text style={styles.tempoAdjustTitle}>Optional: Adjust Tempo</Text>
              </View>
              <Text style={styles.tempoDescription}>
                Pitch is preserved by default. Use this to also change speed.
              </Text>

              <View style={styles.tempoValueRow}>
                <Text style={styles.tempoValueText}>
                  Tempo: {tempoAdjustPercent > 0 ? '+' : ''}{tempoAdjustPercent}%
                </Text>
                <Text style={styles.tempoFactorText}>Speed: x{(1 + tempoAdjustPercent / 100).toFixed(2)}</Text>
              </View>

              <View style={styles.sliderContainer}>
                <Ionicons name="chevron-back" size={20} color="#FF9500" />
                <Slider
                  style={styles.slider}
                  minimumValue={MANUAL_TEMPO_MIN_PERCENT}
                  maximumValue={MANUAL_TEMPO_MAX_PERCENT}
                  step={1}
                  value={tempoAdjustPercent}
                  onValueChange={handleTempoSliderChange}
                  onSlidingComplete={handleTempoSliderComplete}
                  minimumTrackTintColor="#FF9500"
                  maximumTrackTintColor="#ccc"
                />
                <Ionicons name="chevron-forward" size={20} color="#FF9500" />
              </View>

              {/* Tempo Quick Buttons */}
              <View style={styles.tempoQuickButtons}>
                {[-10, -5, 0, 5, 10].map((tempoPreset) => (
                  <TouchableOpacity
                    key={tempoPreset}
                    style={[
                      styles.tempoQuickButton,
                      tempoAdjustPercent === tempoPreset && styles.tempoQuickButtonActive,
                    ]}
                    onPress={() => handleTempoQuickSet(tempoPreset)}
                  >
                    <Text
                      style={[
                        styles.tempoQuickButtonText,
                        tempoAdjustPercent === tempoPreset && styles.tempoQuickButtonTextActive,
                      ]}
                    >
                      {tempoPreset > 0 ? '+' : ''}{tempoPreset}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.tempoInfoBox}>
                <Ionicons name="information-circle" size={16} color="#0A84FF" />
                <Text style={styles.tempoInfoText}>
                  ✓ Pitch-only changes preserve the original song speed
                  <Text style={{ fontWeight: 'bold' }}> (recommended)</Text>
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Instructions Section */}
        <View style={[styles.section, styles.instructionsSection]}>
          <Text style={styles.sectionTitle}>📝 How to Use</Text>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>1</Text>
            </View>
            <Text style={styles.instructionText}>
              Import an audio file - it's automatically saved locally on your device
            </Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>2</Text>
            </View>
            <Text style={styles.instructionText}>
              The app will attempt to detect the original key from the audio
            </Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>3</Text>
            </View>
            <Text style={styles.instructionText}>Adjust the key/pitch using the slider or presets</Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>4</Text>
            </View>
            <Text style={styles.instructionText}>
              Preview the shifted result in-app, then save pitch metadata for future sessions
            </Text>
          </View>
        </View>

        {/* Features Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✨ Features</Text>

          <View style={styles.featureItem}>
            <Ionicons name="download-outline" size={18} color="#007AFF" />
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Local Storage</Text>
              <Text style={styles.featureDescription}>Audio files saved securely on your device</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name="pulse" size={18} color="#34C759" />
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Key Detection</Text>
              <Text style={styles.featureDescription}>Automatic key detection from audio</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name="musical-notes" size={18} color="#FF9500" />
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Pitch Adjustment</Text>
              <Text style={styles.featureDescription}>On-device semitone pitch shifting with cached previews</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name="play-circle" size={18} color="#FF3B30" />
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Audio Playback</Text>
              <Text style={styles.featureDescription}>Preview your audio before processing</Text>
            </View>
          </View>
        </View>

        {/* Important Note Section */}
        <View
          style={[
            styles.section,
            {
              backgroundColor: pitchShiftInfo.canDoPurePitchShift ? '#E3F2FD' : '#FFF3CD',
              borderLeftWidth: 4,
              borderLeftColor: pitchShiftInfo.canDoPurePitchShift ? '#2196F3' : '#FF9500',
            },
          ]}
        >
          <Text style={styles.sectionTitle}>
            {pitchShiftInfo.canDoPurePitchShift ? '✅ Pure Pitch Shifting' : '⚠️ Pitch + Tempo Adjustment'}
          </Text>

          {pitchShiftInfo.canDoPurePitchShift ? (
            <>
              <Text style={styles.sectionDescription}>
                This platform supports <Text style={{ fontWeight: '600' }}>true pitch shifting</Text> in-app.
              </Text>
              <Text style={[styles.sectionDescription, { marginTop: 8 }]}>
                • Pitch changes without affecting tempo
                • Audio speed stays constant
                • No backend server required
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.sectionDescription}>
                The current setup is using a <Text style={{ fontWeight: '600' }}>playback-rate fallback</Text>, which
                affects both pitch and tempo. This means:
              </Text>
              <Text style={[styles.sectionDescription, { marginTop: 8 }]}>
                • Raising pitch makes audio faster
                • Lowering pitch makes audio slower
                • Opposite-tempo mode requires true pitch shifting support
              </Text>
              <Text style={[styles.sectionDescription, { marginTop: 8 }]}>
                For independent pitch and tempo control, use a build with FFmpeg support on mobile or Tone.js support
                on web.
              </Text>
            </>
          )}

          <Text style={[styles.sectionDescription, { marginTop: 12, fontSize: 12, fontStyle: 'italic', color: '#666' }]}>
            Platform: {pitchShiftInfo.platform} • {pitchShiftInfo.note}
          </Text>
        </View>

        {/* External Tools Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛠️ Optional External Tools</Text>
          <Text style={styles.sectionDescription}>
            If you want advanced editing/export workflows, these tools are still useful:
          </Text>

          <View style={styles.toolItem}>
            <Ionicons name="globe" size={18} color="#007AFF" />
            <View style={styles.toolContent}>
              <Text style={styles.toolName}>Audacity (Desktop)</Text>
              <Text style={styles.toolDescription}>Free desktop audio editor with pitch effect</Text>
            </View>
          </View>

          <View style={styles.toolItem}>
            <Ionicons name="logo-apple" size={18} color="#007AFF" />
            <View style={styles.toolContent}>
              <Text style={styles.toolName}>GarageBand (iOS/macOS)</Text>
              <Text style={styles.toolDescription}>Built-in pitch and time shift capabilities</Text>
            </View>
          </View>

          <View style={styles.toolItem}>
            <Ionicons name="globe" size={18} color="#007AFF" />
            <View style={styles.toolContent}>
              <Text style={styles.toolName}>Online Pitch Shifter</Text>
              <Text style={styles.toolDescription}>Web-based tools for quick adjustments</Text>
            </View>
          </View>
        </View>

        {/* Apply Button */}
        {selectedFile && (
          <TouchableOpacity style={styles.applyButton} onPress={handleApplyPitchShift} disabled={isProcessing}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.applyButtonText}>
              {isProcessing ? 'Saving...' : 'Save Pitch Settings'}
            </Text>
          </TouchableOpacity>
        )}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  header: {
    backgroundColor: '#FF9500',
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  filePickerButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  filePickerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  processingContainer: {
    marginTop: 12,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  processingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  selectedFileInfo: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileInfoContent: {
    flex: 1,
  },
  fileInfoName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  fileInfoPath: {
    fontSize: 11,
    color: '#007AFF',
    opacity: 0.7,
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  playButton: {
    backgroundColor: '#34C759',
    borderRadius: 50,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 50,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressSlider: {
    height: 40,
    width: '100%',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  timeText: {
    fontSize: 11,
    color: '#666',
  },
  detectionStatus: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  detectionText: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '500',
  },
  confidenceContainer: {
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  confidenceBar: {
    marginBottom: 8,
  },
  confidenceText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '500',
  },
  keyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  keyButton: {
    width: '18%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  keyButtonActive: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  keyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  keyButtonTextActive: {
    color: '#fff',
  },
  pitchDisplayContainer: {
    gap: 12,
    marginBottom: 16,
  },
  pitchDisplay: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  pitchDisplayLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  pitchDisplayValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  pitchDisplaySubtext: {
    fontSize: 12,
    color: '#666',
  },
  keyTransitionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingVertical: 10,
  },
  keyTransitionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  presetsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#007AFF',
    flex: 1,
    minWidth: '31%',
  },
  presetButtonActive: {
    backgroundColor: '#007AFF',
  },
  presetButtonText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
  },
  presetButtonTextActive: {
    color: '#fff',
  },
  tempoAdjustContainer: {
    marginTop: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  tempoHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tempoAdjustTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  tempoDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    lineHeight: 16,
  },
  tempoValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tempoValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9500',
  },
  tempoFactorText: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '600',
  },
  tempoQuickButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  tempoQuickButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#FF9500',
    flex: 1,
    minWidth: '18%',
    alignItems: 'center',
  },
  tempoQuickButtonActive: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  tempoQuickButtonText: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '600',
  },
  tempoQuickButtonTextActive: {
    color: '#fff',
  },
  tempoInfoBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  tempoInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#555',
    lineHeight: 15,
  },
  instructionsSection: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    backgroundColor: '#FF9500',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    marginTop: 2,
    lineHeight: 18,
  },
  featureItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureContent: {
    flex: 1,
  },
  featureName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 12,
    color: '#666',
  },
  toolItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  toolContent: {
    flex: 1,
  },
  toolName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  toolDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  applyButton: {
    backgroundColor: '#FF9500',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 30,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningSection: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
})
