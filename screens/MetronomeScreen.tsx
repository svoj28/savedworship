// screens/MetronomeScreen.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { Audio } from 'expo-av'
import Ionicons from '@expo/vector-icons/Ionicons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { getCurrentUser } from '../lib/auth'
import { Audio as ExpoAudio } from 'expo-av'

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

type PresetScope = 'personal' | 'overall'

interface MetronomePreset {
  id: string
  name: string
  bpm: number
  inCloud: boolean
  scope: PresetScope
  isPublic: boolean
  isOwnedByOther?: boolean
}

const DEFAULT_PRESETS = [
  { id: 'default-60',  name: '60 BPM',  bpm: 60,  inCloud: false },
  { id: 'default-90',  name: '90 BPM',  bpm: 90,  inCloud: false },
  { id: 'default-120', name: '120 BPM', bpm: 120, inCloud: false },
  { id: 'default-140', name: '140 BPM', bpm: 140, inCloud: false },
  { id: 'default-160', name: '160 BPM', bpm: 160, inCloud: false },
]

// ─── Web Audio API lookahead scheduler constants ───────────────────────────
//
// This is the "web audio metronome" pattern (Chris Wilson, 2013) adapted for
// React Native / Expo.  The JS thread fires every LOOKAHEAD_MS and pre-
// schedules audio events up to SCHEDULE_AHEAD_SEC into the future using the
// AudioContext hardware clock.  The audio engine (not the JS event loop)
// actually fires the sound, so timing is sample-accurate regardless of GC
// pauses, re-renders, or setTimeout jitter.
//
const LOOKAHEAD_MS       = 25.0  // how often the scheduler wakes up (ms)
const SCHEDULE_AHEAD_SEC = 0.1   // how far ahead to schedule audio (sec)

export default function MetronomeScreen() {
  const [bpm, setBpm] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [beatFlash, setBeatFlash] = useState(false)

  // ── Audio context (Web Audio API) ──────────────────────────────────────────
  // expo-av exposes the underlying AudioContext on web; on native we use the
  // same JS API via react-native-web-audio or the global AudioContext shim
  // that Expo includes.  If AudioContext is unavailable we fall back to the
  // original replayAsync() approach automatically (see playClick()).
  const audioCtxRef        = useRef<AudioContext | null>(null)
  const schedulerTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextBeatTimeRef    = useRef(0)   // AudioContext.currentTime of next beat
  const isPlayingRef       = useRef(false)
  const bpmRef             = useRef(120)

  // Fallback: preloaded sound for platforms without AudioContext
  const soundRef = useRef<Audio.Sound | null>(null)

  // Preset states
  const [presets, setPresets] = useState<MetronomePreset[]>([])
  const [activePreset, setActivePreset] = useState<MetronomePreset | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [newPresetScope, setNewPresetScope] = useState<PresetScope>('personal')
  const [newPresetIsPublic, setNewPresetIsPublic] = useState(false)
  const [uploadingPresetId, setUploadingPresetId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<PresetScope>('personal')
  const [publicPresets, setPublicPresets] = useState<MetronomePreset[]>([])

  // Keep bpmRef in sync with bpm state
  useEffect(() => { bpmRef.current = bpm }, [bpm])

  // ─── Initialise audio ──────────────────────────────────────────────────────
  useEffect(() => {
    const setup = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        })

        // Try to obtain a Web Audio API context (works on Expo web & on native
        // builds that include the AudioContext shim).
        const AudioContextClass =
          (window as any)?.AudioContext ||
          (window as any)?.webkitAudioContext ||
          null

        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass()
        } else {
          // Native fallback: preload the WAV file
          const { sound } = await Audio.Sound.createAsync(
            require('../assets/sounds/click.wav'),
            { shouldPlay: false, volume: 1.0 }
          )
          soundRef.current = sound
        }
      } catch (err) {
        console.error('Error initialising audio:', err)
      }
    }
    setup()
    loadPresets()

    return () => {
      stopMetronome()
      audioCtxRef.current?.close()
      soundRef.current?.unloadAsync()
    }
  }, [])

  // ─── Core click synthesis ──────────────────────────────────────────────────
  //
  // When AudioContext is available we synthesise a crisp click directly in the
  // audio graph, scheduled to fire at `time` (an AudioContext.currentTime
  // value).  This is sample-accurate — the audio engine handles it, not JS.
  //
  // The click is a short band-pass filtered noise burst that sounds similar to
  // a woodblock and cuts through well at any tempo.

  const scheduleClickAtTime = useCallback((time: number) => {
    const ctx = audioCtxRef.current
    if (!ctx) return

    // --- Noise burst ---
    const bufferSize = ctx.sampleRate * 0.04  // 40 ms of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    // Band-pass filter: centres around 1 kHz, gives a "click" character
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1000
    filter.Q.value = 0.8

    // Gain envelope: instant attack, fast exponential decay
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(1.0, time)
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.04)

    noise.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)
    noise.start(time)
    noise.stop(time + 0.04)
  }, [])

  // Fallback for native without AudioContext: fire replayAsync() immediately
  const playClickFallback = async () => {
    try {
      await soundRef.current?.replayAsync()
    } catch (err) {
      console.error('Fallback click error:', err)
    }
  }

  // ─── Lookahead scheduler ───────────────────────────────────────────────────
  //
  // The scheduler runs on a short setTimeout loop (LOOKAHEAD_MS).  Every time
  // it wakes up it looks SCHEDULE_AHEAD_SEC into the future and pre-schedules
  // any beats that fall in that window via the AudioContext clock.
  //
  // Visuals (beatFlash) are driven by a separate setTimeout computed from the
  // same AudioContext clock, so they stay in sync with the audio.

  const schedulerLoop = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!isPlayingRef.current) return

    const intervalSec = 60 / bpmRef.current

    if (ctx) {
      // ── Web Audio path: sample-accurate scheduling ──
      while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        scheduleClickAtTime(nextBeatTimeRef.current)

        // Schedule the visual flash to fire at the same wall-clock moment
        const visualDelayMs = Math.max(0, (nextBeatTimeRef.current - ctx.currentTime) * 1000)
        setTimeout(() => {
          if (isPlayingRef.current) setBeatFlash(f => !f)
        }, visualDelayMs)

        nextBeatTimeRef.current += intervalSec
      }
    } else {
      // ── Fallback path: drift-corrected setTimeout ──
      // (same technique as the original code, kept for platforms without AudioContext)
      playClickFallback()
      setBeatFlash(f => !f)
      // nextBeatTimeRef holds a Date.now() value in the fallback path
      nextBeatTimeRef.current += intervalSec * 1000
      const delay = Math.max(0, nextBeatTimeRef.current - Date.now())
      schedulerTimerRef.current = setTimeout(schedulerLoop, delay)
      return  // early return — the fallback manages its own timer
    }

    // Re-arm the scheduler
    schedulerTimerRef.current = setTimeout(schedulerLoop, LOOKAHEAD_MS)
  }, [scheduleClickAtTime])

  // ─── Start / stop ──────────────────────────────────────────────────────────

  const startScheduler = useCallback((overrideBpm?: number) => {
    if (overrideBpm !== undefined) bpmRef.current = overrideBpm

    const ctx = audioCtxRef.current
    if (ctx) {
      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') ctx.resume()
      // Start the first beat exactly one lookahead window from now so the
      // scheduler loop has time to schedule it before it's due.
      nextBeatTimeRef.current = ctx.currentTime
    } else {
      // Fallback: anchor to wall clock
      nextBeatTimeRef.current = Date.now()
    }

    isPlayingRef.current = true
    schedulerLoop()
  }, [schedulerLoop])

  const stopScheduler = useCallback(() => {
    isPlayingRef.current = false
    if (schedulerTimerRef.current) {
      clearTimeout(schedulerTimerRef.current)
      schedulerTimerRef.current = null
    }
  }, [])

  const startMetronome = () => {
    setIsPlaying(true)
    startScheduler()
  }

  const stopMetronome = () => {
    setIsPlaying(false)
    stopScheduler()
  }

  const toggleMetronome = () => {
    if (isPlayingRef.current) stopMetronome()
    else startMetronome()
  }

  // Seamlessly apply BPM changes while playing.
  // Because we use a lookahead window, we just let the next scheduler tick
  // pick up the new bpmRef value — no restart needed, no audible glitch.
  // (For very large BPM jumps, a brief restart avoids a long gap or overlap.)
  useEffect(() => {
    if (!isPlayingRef.current) return

    const ctx = audioCtxRef.current
    if (ctx) {
      // Just update the ref; the scheduler reads bpmRef on every tick
      // so the change takes effect within the next LOOKAHEAD_MS window.
      bpmRef.current = bpm
    } else {
      // Fallback: restart drift-corrected timer with new BPM
      stopScheduler()
      startScheduler(bpm)
    }
  }, [bpm])

  // ─── Preset persistence ────────────────────────────────────────────────────

  const getPresetsKey = (userId: string) => `metronome_presets_${userId}`

  const loadPresets = async () => {
    try {
      const user = await getCurrentUser()
      if (!user) return

      const PRESETS_KEY = getPresetsKey(user.id)
      const stored = await AsyncStorage.getItem(PRESETS_KEY)
      const allLocalPresets: MetronomePreset[] = stored ? JSON.parse(stored) : []
      const localPresets = allLocalPresets.filter(p => !p.isOwnedByOther)

      let ownCloudPresets: MetronomePreset[] = []
      let fetchedPublicPresets: MetronomePreset[] = []

      const { data: ownData } = await supabase
        .from('metronome_presets')
        .select('*')
        .eq('user_id', user.id)

      if (ownData) {
        ownCloudPresets = ownData.map((row: any) => ({
          id: row.id,
          name: row.name,
          bpm: row.bpm,
          inCloud: true,
          scope: row.scope ?? 'personal',
          isPublic: row.is_public ?? false,
          isOwnedByOther: false,
        }))
      }

      const { data: publicData } = await supabase
        .from('metronome_presets')
        .select('*')
        .neq('user_id', user.id)
        .eq('scope', 'overall')
        .eq('is_public', true)

      if (publicData) {
        fetchedPublicPresets = publicData.map((row: any) => ({
          id: row.id,
          name: row.name,
          bpm: row.bpm,
          inCloud: true,
          scope: 'overall' as PresetScope,
          isPublic: true,
          isOwnedByOther: true,
        }))
      }

      const cloudIds = new Set(ownCloudPresets.map(p => p.id))
      const mergedLocal = localPresets.filter(p => !cloudIds.has(p.id))
      const ownPresets = [...mergedLocal, ...ownCloudPresets]

      setPresets(ownPresets)
      setPublicPresets(fetchedPublicPresets)
      await savePresetsLocally(ownPresets)
    } catch (err) {
      console.error('Error loading presets:', err)
      setPresets([])
      setPublicPresets([])
    }
  }

  const savePresetsLocally = async (updatedPresets: MetronomePreset[]) => {
    try {
      const user = await getCurrentUser()
      if (!user) return
      const PRESETS_KEY = getPresetsKey(user.id)
      await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(updatedPresets))
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
      scope: newPresetScope,
      isPublic: newPresetScope === 'overall' ? newPresetIsPublic : false,
    }

    const updated = [...presets, newPreset]
    setPresets(updated)
    await savePresetsLocally(updated)
    setNewPresetName('')
    setNewPresetScope('personal')
    setNewPresetIsPublic(false)
    setShowAddModal(false)
    setActiveTab(newPresetScope)

    if (newPresetScope === 'overall') {
      try {
        const user = await getCurrentUser()
        if (!user) {
          Alert.alert('Saved locally', `"${newPreset.name}" saved at ${bpm} BPM. Sign in to sync to cloud.`)
          return
        }

        const { data, error } = await supabase
          .from('metronome_presets')
          .insert({
            user_id: user.id,
            name: newPreset.name,
            bpm: newPreset.bpm,
            scope: 'overall',
            is_public: newPreset.isPublic,
          })
          .select()
          .single()

        if (error) throw error

        const synced = updated.map(p =>
          p.id === newPreset.id ? { ...p, id: data.id, inCloud: true } : p
        )
        setPresets(synced)
        await savePresetsLocally(synced)
        Alert.alert('Synced', `"${newPreset.name}" saved and synced to cloud at ${bpm} BPM`)
      } catch (err) {
        console.error('Auto-sync failed:', err)
        Alert.alert('Saved locally', `"${newPreset.name}" saved at ${bpm} BPM but cloud sync failed.`)
      }
    } else {
      Alert.alert('Saved', `"${newPreset.name}" saved locally at ${bpm} BPM`)
    }
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
              if (!user) { Alert.alert('Error', 'Not logged in'); return }

              const { data, error } = await supabase
                .from('metronome_presets')
                .upsert({
                  id: preset.id.startsWith('local-') ? undefined : preset.id,
                  user_id: user.id,
                  name: preset.name,
                  bpm: preset.bpm,
                  scope: preset.scope,
                  is_public: preset.isPublic,
                }, { onConflict: 'id' })
                .select()
                .single()

              if (error) throw error

              const updated = presets.map(p =>
                p.id === preset.id ? { ...p, id: data.id, inCloud: true } : p
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

  const handleTogglePublic = async (preset: MetronomePreset) => {
    const nextIsPublic = !preset.isPublic
    const updated = presets.map(p => p.id === preset.id ? { ...p, isPublic: nextIsPublic } : p)
    setPresets(updated)
    await savePresetsLocally(updated)

    if (preset.inCloud) {
      try {
        await supabase.from('metronome_presets').update({ is_public: nextIsPublic }).eq('id', preset.id)
      } catch (err) {
        console.error('Failed to update visibility in cloud:', err)
      }
    }
  }

  const handleDeletePreset = (preset: MetronomePreset) => {
    Alert.alert('Delete Preset', `Delete "${preset.name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
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
    ])
  }

  const handleSelectPreset = (preset: MetronomePreset) => {
    setBpm(preset.bpm)
    setActivePreset(preset)
    if (isPlayingRef.current) {
      // For AudioContext path: just update bpmRef, scheduler adapts automatically
      bpmRef.current = preset.bpm
      // For fallback path: restart
      if (!audioCtxRef.current) {
        stopScheduler()
        startScheduler(preset.bpm)
      }
    }
  }

  // ─── Derived lists ────────────────────────────────────────────────────────

  const personalPresets   = presets.filter(p => !p.scope || p.scope === 'personal')
  const ownOverallPresets = presets.filter(p => p.scope === 'overall')
  const overallPresets    = [...ownOverallPresets, ...publicPresets]
  const tabPresets        = activeTab === 'personal' ? personalPresets : overallPresets

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
          <View style={[styles.beatDot, beatFlash && styles.beatDotFlash]} />
          <Text style={styles.beatText}>Playing</Text>
        </View>
      )}

      {/* Default / Quick BPM Presets */}
      <View style={styles.presetsContainer}>
        <Text style={styles.presetsLabel}>Quick BPM</Text>
        <View style={styles.presets}>
          {DEFAULT_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.presetButton,
                bpm === preset.bpm && !activePreset && styles.presetButtonActive,
              ]}
              onPress={() => handleSelectPreset({ ...preset, scope: 'personal', isPublic: false })}
            >
              <Text style={[
                styles.presetButtonText,
                bpm === preset.bpm && !activePreset && styles.presetButtonTextActive,
              ]}>
                {preset.bpm}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── My Presets ──────────────────────────────────────────────── */}
      <View style={styles.customPresetsContainer}>
        <View style={styles.customPresetsHeader}>
          <Text style={styles.presetsLabel}>My Presets</Text>
          <TouchableOpacity
            style={styles.addPresetButton}
            onPress={() => {
              setNewPresetName('')
              setNewPresetScope(activeTab)
              setNewPresetIsPublic(false)
              setShowAddModal(true)
            }}
          >
            <Ionicons name="add-circle" size={28} color={COLORS.black} />
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'personal' && styles.tabActive]}
            onPress={() => setActiveTab('personal')}
          >
            <Ionicons name="person-outline" size={14} color={activeTab === 'personal' ? COLORS.white : COLORS.mediumGray} />
            <Text style={[styles.tabText, activeTab === 'personal' && styles.tabTextActive]}>Personal</Text>
            {personalPresets.length > 0 && (
              <View style={[styles.tabBadge, activeTab === 'personal' && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === 'personal' && styles.tabBadgeTextActive]}>
                  {personalPresets.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'overall' && styles.tabActive]}
            onPress={() => setActiveTab('overall')}
          >
            <Ionicons name="globe-outline" size={14} color={activeTab === 'overall' ? COLORS.white : COLORS.mediumGray} />
            <Text style={[styles.tabText, activeTab === 'overall' && styles.tabTextActive]}>Overall</Text>
            {overallPresets.length > 0 && (
              <View style={[styles.tabBadge, activeTab === 'overall' && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === 'overall' && styles.tabBadgeTextActive]}>
                  {overallPresets.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.tabDescription}>
          {activeTab === 'personal'
            ? 'Private presets only visible to you.'
            : 'Your presets + public presets from other users.'}
        </Text>

        {tabPresets.length === 0 ? (
          <Text style={styles.emptyPresetsText}>
            {activeTab === 'personal'
              ? 'No personal presets yet. Tap + to add one.'
              : 'No overall presets yet. Tap + to add one.'}
          </Text>
        ) : (
          tabPresets.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.customPresetCard,
                activePreset?.id === preset.id && styles.customPresetCardActive,
              ]}
              onPress={() => handleSelectPreset(preset)}
            >
              <View style={styles.customPresetLeft}>
                <Text style={[
                  styles.customPresetName,
                  activePreset?.id === preset.id && styles.customPresetNameActive,
                ]}>
                  {preset.name}
                </Text>

                <View style={styles.customPresetMeta}>
                  <Text style={[
                    styles.customPresetBpm,
                    activePreset?.id === preset.id && styles.customPresetBpmActive,
                  ]}>
                    {preset.bpm} BPM
                  </Text>

                  <View style={[styles.syncBadge, preset.inCloud ? styles.syncBadgeCloud : styles.syncBadgeLocal]}>
                    <Ionicons name={preset.inCloud ? 'cloud-done-outline' : 'phone-portrait-outline'} size={10} color={COLORS.mediumGray} />
                    <Text style={styles.syncBadgeText}>{preset.inCloud ? 'Cloud' : 'Local'}</Text>
                  </View>

                  {preset.scope === 'overall' && (
                    <View style={[styles.syncBadge, preset.isPublic ? styles.publicBadge : styles.privateBadge]}>
                      <Ionicons name={preset.isPublic ? 'eye-outline' : 'eye-off-outline'} size={10} color={preset.isPublic ? COLORS.darkGray : COLORS.mediumGray} />
                      <Text style={[styles.syncBadgeText, preset.isPublic && styles.syncBadgeTextPublic]}>
                        {preset.isPublic ? 'Public' : 'Private'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.customPresetActions}>
                {!preset.inCloud && !preset.isOwnedByOther && (
                  <TouchableOpacity
                    style={styles.cloudActionButton}
                    onPress={() => handleUploadPresetToCloud(preset)}
                    disabled={uploadingPresetId === preset.id}
                  >
                    {uploadingPresetId === preset.id
                      ? <ActivityIndicator size="small" color={COLORS.black} />
                      : <Ionicons name="cloud-upload-outline" size={18} color={COLORS.black} />
                    }
                  </TouchableOpacity>
                )}

                {!preset.isOwnedByOther && (
                  <TouchableOpacity
                    style={styles.deleteActionButton}
                    onPress={() => handleDeletePreset(preset)}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.mediumGray} />
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* ── Add Preset Modal ─────────────────────────────────────────── */}
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

            <Text style={styles.modalFieldLabel}>Save to</Text>
            <View style={styles.scopePicker}>
              <TouchableOpacity
                style={[styles.scopeOption, newPresetScope === 'personal' && styles.scopeOptionActive]}
                onPress={() => setNewPresetScope('personal')}
              >
                <Ionicons name="person-outline" size={16} color={newPresetScope === 'personal' ? COLORS.white : COLORS.darkGray} />
                <Text style={[styles.scopeOptionText, newPresetScope === 'personal' && styles.scopeOptionTextActive]}>Personal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scopeOption, newPresetScope === 'overall' && styles.scopeOptionActive]}
                onPress={() => setNewPresetScope('overall')}
              >
                <Ionicons name="globe-outline" size={16} color={newPresetScope === 'overall' ? COLORS.white : COLORS.darkGray} />
                <Text style={[styles.scopeOptionText, newPresetScope === 'overall' && styles.scopeOptionTextActive]}>Overall</Text>
              </TouchableOpacity>
            </View>

            {newPresetScope === 'overall' && (
              <View style={styles.publicToggleRow}>
                <View style={styles.publicToggleLeft}>
                  <Ionicons name={newPresetIsPublic ? 'eye-outline' : 'eye-off-outline'} size={18} color={COLORS.darkGray} />
                  <View>
                    <Text style={styles.publicToggleLabel}>{newPresetIsPublic ? 'Public' : 'Private'}</Text>
                    <Text style={styles.publicToggleHint}>
                      {newPresetIsPublic ? 'Anyone can see this preset' : 'Only you can see this preset'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={newPresetIsPublic}
                  onValueChange={setNewPresetIsPublic}
                  trackColor={{ false: COLORS.lightGray, true: COLORS.black }}
                  thumbColor={COLORS.white}
                />
              </View>
            )}

            <Text style={styles.modalHint}>
              Presets are saved locally first. You can upload to cloud after saving.
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
  beatDotFlash: {
    backgroundColor: COLORS.mediumGray,
  },
  beatText: {
    fontSize: 15,
    color: COLORS.darkGray,
    fontWeight: '700',
    letterSpacing: 0.3,
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

  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.veryLightGray,
    borderRadius: 8,
    padding: 3,
    marginBottom: 8,
    gap: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 6,
    gap: 5,
  },
  tabActive: {
    backgroundColor: COLORS.black,
    elevation: 2,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.mediumGray,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: COLORS.white,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: COLORS.mediumGray,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.mediumGray,
  },
  tabBadgeTextActive: {
    color: COLORS.white,
  },
  tabDescription: {
    fontSize: 12,
    color: COLORS.mediumGray,
    fontWeight: '500',
    marginBottom: 14,
    fontStyle: 'italic',
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
    flexWrap: 'wrap',
    gap: 6,
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
  publicBadge: {
    backgroundColor: '#f0f8f0',
    borderColor: '#c8e6c9',
  },
  privateBadge: {
    backgroundColor: COLORS.veryLightGray,
    borderColor: COLORS.lightGray,
  },
  syncBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.mediumGray,
  },
  syncBadgeTextPublic: {
    color: '#388e3c',
  },

  customPresetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    marginBottom: 18,
    backgroundColor: COLORS.offWhite,
    fontWeight: '500',
  },
  modalFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.darkGray,
    marginBottom: 8,
    letterSpacing: 0.2,
  },

  scopePicker: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  scopeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.lightGray,
    backgroundColor: COLORS.offWhite,
  },
  scopeOptionActive: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  scopeOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.darkGray,
  },
  scopeOptionTextActive: {
    color: COLORS.white,
  },

  publicToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.veryLightGray,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  publicToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  publicToggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 2,
  },
  publicToggleHint: {
    fontSize: 11,
    color: COLORS.mediumGray,
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