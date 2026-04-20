// screens/MetronomeScreen.tsx
import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { Audio } from 'expo-av'

const SCREEN_WIDTH = Dimensions.get('window').width

export default function MetronomeScreen() {
  const [bpm, setBpm] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tapTempo, setTapTempo] = useState<number[]>([])
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const beatCountRef = useRef(0)

  // Initialize audio
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        })
      } catch (err) {
        console.error('Error initializing audio:', err)
      }
    }

    initializeAudio()

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  /**
   * Generate a simple click sound using Audio API
   * For production, you might want to use pre-recorded audio files
   */
  const playClickSound = async () => {
    try {
      // Create a simple beep using Tone.js or similar, or use a pre-recorded file
      // For now, we'll create a sound programmatically
      // In production, load from assets: require('./assets/click.wav')

      if (soundObject) {
        await soundObject.replayAsync()
      } else {
        // Simplified: load a click sound file from assets
        // You'll need to add an audio file to assets/sounds/click.wav
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/sounds/click.wav'),
          { shouldPlay: false }
        )
        setSoundObject(sound)
        await sound.playAsync()
      }
    } catch (err) {
      console.error('Error playing sound:', err)
    }
  }

  const startMetronome = async () => {
    setIsPlaying(true)
    beatCountRef.current = 0

    const beatInterval = (60 / bpm) * 1000 // Convert BPM to milliseconds

    timerRef.current = setInterval(async () => {
      beatCountRef.current += 1
      await playClickSound()
    }, beatInterval)
  }

  const stopMetronome = () => {
    setIsPlaying(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const toggleMetronome = () => {
    if (isPlaying) {
      stopMetronome()
    } else {
      startMetronome()
    }
  }

  /**
   * Tap Tempo: Track taps and calculate average BPM
   * If more than 5 seconds pass between taps, reset
   */
  const handleTapTempo = async () => {
    const now = Date.now()
    const recentTaps = tapTempo.filter((t) => now - t < 5000)

    if (recentTaps.length > 0) {
      // Calculate intervals between taps
      const intervals: number[] = []
      for (let i = 1; i < recentTaps.length; i++) {
        intervals.push(recentTaps[i] - recentTaps[i - 1])
      }

      if (intervals.length > 0) {
        const averageInterval = intervals.reduce((a, b) => a + b) / intervals.length
        const calculatedBpm = Math.round(60000 / averageInterval)
        setBpm(Math.max(40, Math.min(300, calculatedBpm)))
      }
    }

    // Play a subtle click for tap feedback
    await playClickSound()

    setTapTempo([...recentTaps, now])
  }

  const resetTapTempo = () => {
    setTapTempo([])
  }

  useEffect(() => {
    // Update interval when BPM changes while playing
    if (isPlaying) {
      stopMetronome()
      startMetronome()
    }
  }, [bpm])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Metronome</Text>

      {/* BPM Display */}
      <View style={styles.bpmDisplayContainer}>
        <Text style={styles.bpmLabel}>BPM</Text>
        <Text style={styles.bpmValue}>{bpm}</Text>
      </View>

      {/* BPM Slider */}
      <View style={styles.sliderContainer}>
        <Text style={styles.sliderLabel}>40</Text>
        <Slider
          style={styles.slider}
          minimumValue={40}
          maximumValue={300}
          value={bpm}
          onValueChange={(value) => setBpm(Math.round(value))}
          step={1}
          minimumTrackTintColor="#007AFF"
          maximumTrackTintColor="#ddd"
        />
        <Text style={styles.sliderLabel}>300</Text>
      </View>

      {/* Play/Stop Button */}
      <TouchableOpacity
        style={[styles.playButton, isPlaying && styles.playButtonActive]}
        onPress={toggleMetronome}
      >
        <Text style={styles.playButtonText}>
          {isPlaying ? 'Stop' : 'Start'}
        </Text>
      </TouchableOpacity>

      {/* Tap Tempo Section */}
      <View style={styles.tapTempoSection}>
        <Text style={styles.tapTempoLabel}>Tap Tempo</Text>
        <TouchableOpacity
          style={styles.tapTempoButton}
          onPress={handleTapTempo}
        >
          <Text style={styles.tapTempoButtonText}>Tap Here</Text>
        </TouchableOpacity>
        {tapTempo.length > 0 && (
          <TouchableOpacity
            style={styles.resetButton}
            onPress={resetTapTempo}
          >
            <Text style={styles.resetButtonText}>Reset ({tapTempo.length} taps)</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Beat Indicator */}
      {isPlaying && (
        <View style={styles.beatIndicator}>
          <View style={styles.beatDot} />
          <Text style={styles.beatText}>Playing</Text>
        </View>
      )}

      {/* Preset BPMs */}
      <View style={styles.presetsContainer}>
        <Text style={styles.presetsLabel}>Presets</Text>
        <View style={styles.presets}>
          {[60, 90, 120, 140, 160].map((tempo) => (
            <TouchableOpacity
              key={tempo}
              style={[styles.presetButton, bpm === tempo && styles.presetButtonActive]}
              onPress={() => setBpm(tempo)}
            >
              <Text style={[styles.presetButtonText, bpm === tempo && styles.presetButtonTextActive]}>
                {tempo}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 30,
    textAlign: 'center',
  },
  bpmDisplayContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  bpmLabel: {
    fontSize: 16,
    color: '#999',
    marginBottom: 5,
  },
  bpmValue: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  slider: {
    flex: 1,
    marginHorizontal: 15,
    height: 40,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#999',
    width: 30,
    textAlign: 'center',
  },
  playButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  playButtonActive: {
    backgroundColor: '#34C759',
  },
  playButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  tapTempoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  tapTempoLabel: {
    fontSize: 16,
    color: '#999',
    marginBottom: 15,
  },
  tapTempoButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  tapTempoButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  resetButton: {
    marginTop: 15,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resetButtonText: {
    fontSize: 12,
    color: '#999',
  },
  beatIndicator: {
    alignItems: 'center',
    marginBottom: 30,
  },
  beatDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#34C759',
    marginBottom: 10,
  },
  beatText: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: 'bold',
  },
  presetsContainer: {
    alignItems: 'center',
  },
  presetsLabel: {
    fontSize: 16,
    color: '#999',
    marginBottom: 15,
  },
  presets: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  presetButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  presetButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  presetButtonTextActive: {
    color: '#fff',
  },
})
