// screens/KeyPitchChangerScreen.tsx
import React, { useState } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  Slider,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as DocumentPicker from 'expo-document-picker'

const SEMITONES = [-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

interface PitchShiftStep {
  semitones: number
  displayName: string
  icon: string
}

export default function KeyPitchChangerScreen() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [pitchShift, setPitchShift] = useState(0)
  const [currentKey, setCurrentKey] = useState('C')
  const [targetKey, setTargetKey] = useState('C')

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

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/*'],
      })

      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0]
        setSelectedFile(file.uri)
        setFileName(file.name || 'Selected Audio File')
      }
    } catch (error) {
      console.error('Error picking file:', error)
      Alert.alert('Error', 'Failed to pick audio file')
    }
  }

  const handleClearFile = () => {
    setSelectedFile(null)
    setFileName('')
  }

  const handlePresetPress = (semitones: number) => {
    setPitchShift(semitones)
    updateTargetKey(semitones)
  }

  const updateTargetKey = (semitones: number) => {
    const currentIndex = NOTE_NAMES.indexOf(currentKey)
    const newIndex = (currentIndex + semitones + 120) % 12
    setTargetKey(NOTE_NAMES[newIndex])
  }

  const handlePitchChange = (value: number) => {
    const roundedValue = Math.round(value)
    setPitchShift(roundedValue)
    updateTargetKey(roundedValue)
  }

  const handleApplyPitchShift = () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select an audio file first')
      return
    }

    Alert.alert(
      'Pitch Shift Tool',
      `To adjust the pitch by ${pitchShift > 0 ? '+' : ''}${pitchShift} semitones:\n\n` +
      `• Use an external audio editing tool (Audacity, GarageBand, etc.)\n` +
      `• Or upload to an online pitch shifter\n` +
      `• Target key: ${targetKey}`,
      [
        { text: 'Cancel', onPress: () => {} },
        { text: 'OK', onPress: () => {} },
      ]
    )
  }

  const getSemitoneLabel = (semitones: number) => {
    if (semitones === 0) return 'Original'
    const interval = Math.abs(semitones)
    const direction = semitones > 0 ? 'Up' : 'Down'
    return `${direction} ${interval} semitone${interval !== 1 ? 's' : ''}`
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Key/Pitch Changer</Text>
          <Text style={styles.subtitle}>Adjust the pitch of your audio files</Text>
        </View>

        {/* File Selection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Select Audio File</Text>

          <TouchableOpacity style={styles.filePickerButton} onPress={handlePickFile}>
            <Ionicons name="document-outline" size={20} color="#fff" />
            <Text style={styles.filePickerButtonText}>Pick Audio File</Text>
          </TouchableOpacity>

          {selectedFile && (
            <View style={styles.selectedFileInfo}>
              <Ionicons name="musical-notes" size={20} color="#007AFF" />
              <View style={styles.fileInfoContent}>
                <Text style={styles.fileInfoName}>{fileName}</Text>
                <Text style={styles.fileInfoUri}>{selectedFile.substring(0, 50)}...</Text>
              </View>
              <TouchableOpacity onPress={handleClearFile}>
                <Ionicons name="close" size={24} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Key Selection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Select Original Key</Text>

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
                <Text style={[styles.keyButtonText, currentKey === note && styles.keyButtonTextActive]}>
                  {note}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Pitch Shift Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Adjust Pitch</Text>

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

          {/* Slider */}
          <View style={styles.sliderContainer}>
            <Ionicons name="arrow-down-circle" size={20} color="#FF3B30" />
            <Slider
              style={styles.slider}
              minimumValue={-12}
              maximumValue={12}
              step={1}
              value={pitchShift}
              onValueChange={handlePitchChange}
              minimumTrackTintColor="#007AFF"
              maximumTrackTintColor="#ccc"
            />
            <Ionicons name="arrow-up-circle" size={20} color="#34C759" />
          </View>

          {/* Preset Buttons */}
          <Text style={styles.presetsTitle}>Quick Adjustments</Text>
          <View style={styles.presetsGrid}>
            {presets.map((preset) => (
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
        </View>

        {/* Instructions Section */}
        <View style={[styles.section, styles.instructionsSection]}>
          <Text style={styles.sectionTitle}>📝 How to Use</Text>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>1</Text>
            </View>
            <Text style={styles.instructionText}>Select an audio file (MP3, WAV, etc.)</Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>2</Text>
            </View>
            <Text style={styles.instructionText}>Choose the original key of the song</Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>3</Text>
            </View>
            <Text style={styles.instructionText}>Adjust the pitch using the slider or presets</Text>
          </View>

          <View style={styles.instructionItem}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>4</Text>
            </View>
            <Text style={styles.instructionText}>
              Use external audio tools to process the file with the specified pitch shift
            </Text>
          </View>
        </View>

        {/* External Tools Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛠️ External Pitch Shifters</Text>
          <Text style={styles.sectionDescription}>
            For actual audio processing, use these tools:
          </Text>

          <View style={styles.toolItem}>
            <Ionicons name="globe" size={18} color="#007AFF" />
            <Text style={styles.toolName}>Audacity (Desktop)</Text>
            <Text style={styles.toolDescription}>Free audio editor with pitch shift effect</Text>
          </View>

          <View style={styles.toolItem}>
            <Ionicons name="globe" size={18} color="#007AFF" />
            <Text style={styles.toolName}>GarageBand (macOS/iOS)</Text>
            <Text style={styles.toolDescription}>Built-in pitch and time shift capabilities</Text>
          </View>

          <View style={styles.toolItem}>
            <Ionicons name="globe" size={18} color="#007AFF" />
            <Text style={styles.toolName}>Online Pitch Shifter</Text>
            <Text style={styles.toolDescription}>Web-based tools for quick pitch adjustments</Text>
          </View>
        </View>

        {/* Apply Button */}
        <TouchableOpacity style={styles.applyButton} onPress={handleApplyPitchShift}>
          <Ionicons name="musical-notes" size={20} color="#fff" />
          <Text style={styles.applyButtonText}>Calculate Pitch Shift</Text>
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
  fileInfoUri: {
    fontSize: 11,
    color: '#007AFF',
    opacity: 0.7,
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
  toolItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    gap: 8,
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
})
