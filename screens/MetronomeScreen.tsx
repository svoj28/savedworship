// screens/MetronomeScreen.tsx
import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { Audio } from 'expo-av'
import Ionicons from '@expo/vector-icons/Ionicons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { getCurrentUser } from '../lib/auth'

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

const SCREEN_WIDTH = Dimensions.get('window').width
const PRESETS_STORAGE_KEY = 'metronome_presets'

interface MetronomePreset {
  id: string
  name: string
  bpm: number
  inCloud: boolean
}

const DEFAULT_PRESETS = [
  { id: 'default-60', name: '60 BPM', bpm: 60, inCloud: false },
  { id: 'default-90', name: '90 BPM', bpm: 90, inCloud: false },
  { id: 'default-120', name: '120 BPM', bpm: 120, inCloud: false },
  { id: 'default-140', name: '140 BPM', bpm: 140, inCloud: false },
  { id: 'default-160', name: '160 BPM', bpm: 160, inCloud: false },
]

export default function MetronomeScreen() {
  const [bpm, setBpm] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [tapTempo, setTapTempo] = useState<number[]>([])
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const beatCountRef = useRef(0)

  // Preset states
  const [presets, setPresets] = useState<MetronomePreset[]>([])
  const [activePreset, setActivePreset] = useState<MetronomePreset | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [savingToCloud, setSavingToCloud] = useState(false)
  const [uploadingPresetId, setUploadingPresetId] = useState<string | null>(null)

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
    loadPresets()

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ─── Preset persistence ────────────────────────────────────────────────────

  const loadPresets = async () => {
    try {
      // Load local presets
      const stored = await AsyncStorage.getItem(PRESETS_STORAGE_KEY)
      const localPresets: MetronomePreset[] = stored ? JSON.parse(stored) : []

      // Load cloud presets
      const user = await getCurrentUser()
      let cloudPresets: MetronomePreset[] = []
      if (user) {
        const { data } = await supabase
          .from('metronome_presets')
          .select('*')
          .eq('user_id', user.id)
        if (data) {
          cloudPresets = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            bpm: row.bpm,
            inCloud: true,
          }))
        }
      }

      // Merge — cloud presets override local ones with same id
      const cloudIds = new Set(cloudPresets.map(p => p.id))
      const mergedLocal = localPresets.filter(p => !cloudIds.has(p.id))
      setPresets([...mergedLocal, ...cloudPresets])
    } catch (err) {
      console.error('Error loading presets:', err)
      setPresets([])
    }
  }

  const savePresetsLocally = async (updatedPresets: MetronomePreset[]) => {
    try {
      await AsyncStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets))
    } catch (err) {
      console.error('Error saving presets locally:', err)
    }
  }

  const handleAddPreset = async () => {
    if (!newPresetName.trim()) {
      Alert.alert('Error', 'Please enter a preset name')
      return
    }

    const newPreset: MetronomePreset = {
      id: `local-${Date.now()}`,
      name: newPresetName.trim(),
      bpm,
      inCloud: false,
    }

    const updated = [...presets, newPreset]
    setPresets(updated)
    await savePresetsLocally(updated)
    setNewPresetName('')
    setShowAddModal(false)
    Alert.alert('Saved', `"${newPreset.name}" saved locally at ${bpm} BPM`)
  }

  const handleUploadPresetToCloud = async (preset: MetronomePreset) => {
    Alert.alert(
      'Upload to Cloud',
      `Save "${preset.name}" to cloud so it syncs across devices?`,
      [
        { text: 'Cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            try {
              setUploadingPresetId(preset.id)
              const user = await getCurrentUser()
              if (!user) {
                Alert.alert('Error', 'Not logged in')
                return
              }

              const { data, error } = await supabase
                .from('metronome_presets')
                .upsert({
                  id: preset.id.startsWith('local-') ? undefined : preset.id,
                  user_id: user.id,
                  name: preset.name,
                  bpm: preset.bpm,
                }, { onConflict: 'id' })
                .select()
                .single()

              if (error) throw error

              // Update local list with cloud id and inCloud flag
              const updated = presets.map(p =>
                p.id === preset.id
                  ? { ...p, id: data.id, inCloud: true }
                  : p
              )
              setPresets(updated)
              await savePresetsLocally(updated)
              Alert.alert('Success', `"${preset.name}" saved to cloud!`)
            } catch (err) {
              console.error('Upload preset error:', err)
              Alert.alert('Error', 'Failed to upload preset')
            } finally {
              setUploadingPresetId(null)
            }
          }
        }
      ]
    )
  }

  const handleDeletePreset = (preset: MetronomePreset) => {
    Alert.alert(
      'Delete Preset',
      `Delete "${preset.name}"?`,
      [
        { text: 'Cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from cloud if it's there
              if (preset.inCloud) {
                await supabase.from('metronome_presets').delete().eq('id', preset.id)
              }
              const updated = presets.filter(p => p.id !== preset.id)
              setPresets(updated)
              await savePresetsLocally(updated)
              if (activePreset?.id === preset.id) setActivePreset(null)
            } catch (err) {
              Alert.alert('Error', 'Failed to delete preset')
            }
          }
        }
      ]
    )
  }

  const handleSelectPreset = (preset: MetronomePreset) => {
    setBpm(preset.bpm)
    setActivePreset(preset)
    if (isPlaying) {
      stopMetronome()
    }
  }

  // ─── Metronome logic ───────────────────────────────────────────────────────

  const playClickSound = async () => {
    try {
      if (soundObject) {
        await soundObject.replayAsync()
      } else {
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
    const beatInterval = (60 / bpm) * 1000
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
    if (isPlaying) stopMetronome()
    else startMetronome()
  }

  const handleTapTempo = async () => {
    const now = Date.now()
    const recentTaps = tapTempo.filter((t) => now - t < 5000)
    if (recentTaps.length > 0) {
      const intervals: number[] = []
      for (let i = 1; i < recentTaps.length; i++) {
        intervals.push(recentTaps[i] - recentTaps[i - 1])
      }
      if (intervals.length > 0) {
        const averageInterval = intervals.reduce((a, b) => a + b) / intervals.length
        const calculatedBpm = Math.round(60000 / averageInterval)
        setBpm(Math.max(40, Math.min(300, calculatedBpm)))
        setActivePreset(null) // clear active preset since bpm changed manually
      }
    }
    await playClickSound()
    setTapTempo([...recentTaps, now])
  }

  const resetTapTempo = () => setTapTempo([])

  useEffect(() => {
    if (isPlaying) {
      stopMetronome()
      startMetronome()
    }
  }, [bpm])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* BPM Display */}
      <View style={styles.bpmDisplayContainer}>
        {activePreset && (
          <Text style={styles.activePresetName}>{activePreset.name}</Text>
        )}
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
          onValueChange={(value) => {
            setBpm(Math.round(value))
            setActivePreset(null)
          }}
          step={1}
          minimumTrackTintColor={COLORS.black}
          maximumTrackTintColor={COLORS.lightGray}
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

      {/* Beat Indicator */}
      {isPlaying && (
        <View style={styles.beatIndicator}>
          <View style={styles.beatDot} />
          <Text style={styles.beatText}>Playing</Text>
        </View>
      )}

      {/* Tap Tempo */}
      <View style={styles.tapTempoSection}>
        <Text style={styles.tapTempoLabel}>Tap Tempo</Text>
        <TouchableOpacity style={styles.tapTempoButton} onPress={handleTapTempo}>
          <Text style={styles.tapTempoButtonText}>Tap Here</Text>
        </TouchableOpacity>
        {tapTempo.length > 0 && (
          <TouchableOpacity style={styles.resetButton} onPress={resetTapTempo}>
            <Text style={styles.resetButtonText}>Reset ({tapTempo.length} taps)</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Default Presets */}
      <View style={styles.presetsContainer}>
        <Text style={styles.presetsLabel}>Quick BPM</Text>
        <View style={styles.presets}>
          {DEFAULT_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={[styles.presetButton, bpm === preset.bpm && !activePreset && styles.presetButtonActive]}
              onPress={() => handleSelectPreset(preset)}
            >
              <Text style={[styles.presetButtonText, bpm === preset.bpm && !activePreset && styles.presetButtonTextActive]}>
                {preset.bpm}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Custom Presets */}
      <View style={styles.customPresetsContainer}>
        <View style={styles.customPresetsHeader}>
          <Text style={styles.presetsLabel}>My Presets</Text>
          <TouchableOpacity
            style={styles.addPresetButton}
            onPress={() => {
              setNewPresetName('')
              setShowAddModal(true)
            }}
          >
            <Ionicons name="add-circle" size={28} color={COLORS.black} />
          </TouchableOpacity>
        </View>

        {presets.length === 0 ? (
          <Text style={styles.emptyPresetsText}>No presets yet. Tap + to add one.</Text>
        ) : (
          presets.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.customPresetCard,
                activePreset?.id === preset.id && styles.customPresetCardActive
              ]}
              onPress={() => handleSelectPreset(preset)}
            >
              <View style={styles.customPresetLeft}>
                <Text style={[
                  styles.customPresetName,
                  activePreset?.id === preset.id && styles.customPresetNameActive
                ]}>
                  {preset.name}
                </Text>
                <View style={styles.customPresetMeta}>
                  <Text style={[
                    styles.customPresetBpm,
                    activePreset?.id === preset.id && styles.customPresetBpmActive
                  ]}>
                    {preset.bpm} BPM
                  </Text>
                  {/* Cloud indicator */}
                  <View style={[styles.syncBadge, preset.inCloud ? styles.syncBadgeCloud : styles.syncBadgeLocal]}>
                    <Ionicons
                      name={preset.inCloud ? 'cloud-done-outline' : 'phone-portrait-outline'}
                      size={10}
                      color={COLORS.mediumGray}
                    />
                    <Text style={styles.syncBadgeText}>
                      {preset.inCloud ? 'Cloud' : 'Local'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.customPresetActions}>
                {/* Upload to cloud button — only if not already in cloud */}
                {!preset.inCloud && (
                  <TouchableOpacity
                    style={styles.cloudActionButton}
                    onPress={() => handleUploadPresetToCloud(preset)}
                    disabled={uploadingPresetId === preset.id}
                  >
                    {uploadingPresetId === preset.id
                      ? <ActivityIndicator size="small" color={COLORS.black} />
                      : <Ionicons name="cloud-upload-outline" size={20} color={COLORS.black} />
                    }
                  </TouchableOpacity>
                )}
                {/* Delete button */}
                <TouchableOpacity
                  style={styles.deleteActionButton}
                  onPress={() => handleDeletePreset(preset)}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.mediumGray} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Add Preset Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Save Preset</Text>
            <Text style={styles.modalSubtitle}>Current BPM: {bpm}</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Preset name (e.g. How Great Is Our God)"
              placeholderTextColor={COLORS.mediumGray}
              value={newPresetName}
              onChangeText={setNewPresetName}
              autoFocus
            />

            <Text style={styles.modalHint}>
              Presets are saved locally. You can optionally upload to cloud after saving.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleAddPreset}
              >
                <Text style={styles.saveButtonText}>Save Locally</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.offWhite,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  bpmDisplayContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
  },
  activePresetName: {
    fontSize: 14,
    color: COLORS.mediumGray,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  bpmLabel: {
    fontSize: 16,
    color: COLORS.mediumGray,
    marginBottom: 8,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  bpmValue: {
    fontSize: 76,
    fontWeight: '800',
    color: COLORS.black,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  slider: {
    flex: 1,
    marginHorizontal: 15,
    height: 40,
  },
  sliderLabel: {
    fontSize: 12,
    color: COLORS.mediumGray,
    width: 30,
    textAlign: 'center',
    fontWeight: '600',
  },
  playButton: {
    backgroundColor: COLORS.black,
    paddingVertical: 22,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
    elevation: 3,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  playButtonActive: {
    backgroundColor: COLORS.darkGray,
  },
  playButtonText: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  beatIndicator: {
    alignItems: 'center',
    marginBottom: 24,
  },
  beatDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.black,
    marginBottom: 12,
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  beatText: {
    fontSize: 15,
    color: COLORS.darkGray,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tapTempoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  tapTempoLabel: {
    fontSize: 16,
    color: COLORS.mediumGray,
    marginBottom: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tapTempoButton: {
    backgroundColor: COLORS.white,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.black,
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tapTempoButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.black,
    letterSpacing: 0.3,
  },
  resetButton: {
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.lightGray,
    backgroundColor: COLORS.offWhite,
  },
  resetButtonText: {
    fontSize: 12,
    color: COLORS.mediumGray,
    fontWeight: '600',
  },
  presetsContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  presetsLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  presets: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: 8,
  },
  presetButton: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.darkGray,
    backgroundColor: COLORS.white,
    elevation: 1,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  presetButtonActive: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.black,
  },
  presetButtonTextActive: {
    color: COLORS.white,
  },
  customPresetsContainer: {
    marginBottom: 20,
  },
  customPresetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  addPresetButton: {
    padding: 6,
  },
  emptyPresetsText: {
    color: COLORS.mediumGray,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 22,
    fontWeight: '500',
  },
  customPresetCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 16,
    marginBottom: 11,
    borderWidth: 1.5,
    borderColor: COLORS.veryLightGray,
    elevation: 1,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  customPresetCardActive: {
    backgroundColor: COLORS.offWhite,
    borderColor: COLORS.black,
    borderWidth: 2,
  },
  customPresetLeft: {
    flex: 1,
  },
  customPresetName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 5,
  },
  customPresetNameActive: {
    color: COLORS.black,
    fontWeight: '800',
  },
  customPresetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customPresetBpm: {
    fontSize: 13,
    color: COLORS.mediumGray,
    fontWeight: '600',
  },
  customPresetBpmActive: {
    color: COLORS.darkGray,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  syncBadgeCloud: {
    backgroundColor: COLORS.offWhite,
    borderColor: COLORS.lightGray,
  },
  syncBadgeLocal: {
    backgroundColor: COLORS.veryLightGray,
    borderColor: COLORS.lightGray,
  },
  syncBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.mediumGray,
  },
  customPresetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cloudActionButton: {
    padding: 9,
    borderRadius: 6,
    backgroundColor: COLORS.offWhite,
    borderWidth: 1,
    borderColor: COLORS.veryLightGray,
  },
  deleteActionButton: {
    padding: 9,
    borderRadius: 6,
    backgroundColor: COLORS.veryLightGray,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 26,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.mediumGray,
    fontWeight: '700',
    marginBottom: 22,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: COLORS.lightGray,
    borderRadius: 8,
    padding: 13,
    fontSize: 15,
    color: COLORS.black,
    marginBottom: 14,
    backgroundColor: COLORS.offWhite,
    fontWeight: '500',
  },
  modalHint: {
    fontSize: 12,
    color: COLORS.mediumGray,
    marginBottom: 22,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cancelButton: {
    backgroundColor: COLORS.veryLightGray,
  },
  cancelButtonText: {
    color: COLORS.black,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  saveButton: {
    backgroundColor: COLORS.black,
  },
  saveButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
})