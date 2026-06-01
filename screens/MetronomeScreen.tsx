// screens/MetronomeScreen.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
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
import { useRole } from '../lib/useRole'
import { getPlaylistsByUserId, getPlaylistItems } from '../db/queries'
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
type MainTab = 'personal' | 'overall' | 'playlist'

// ═══════════════════════════════════════════════════════════════════════════════
// TIME SIGNATURE SYSTEM — music-theory accurate
// ═══════════════════════════════════════════════════════════════════════════════
//
// BPM always = quarter notes per minute (industry standard).
//
// THREE categories:
//
//  SIMPLE:      beat = denominator note (quarter for /4, eighth for /8)
//               each beat divides into 2 equal parts
//               beat_sec = (60/BPM) × (4/denominator)
//               Examples: 2/4, 3/4, 4/4
//
//  COMPOUND:    top number is a multiple of 3 (6, 9, 12)
//               real beats = top÷3  →  6/8=2 beats, 9/8=3, 12/8=4
//               beat = dotted note = 3 × denominator note
//               beat_sec = (60/BPM) × (4/denominator) × 3
//               (i.e. dotted-quarter at BPM 60 = 1.5 s)
//               Examples: 6/8, 9/8, 12/8
//
//  ASYMMETRIC:  irregular groupings of simple beats (all same duration)
//               beatGroups = [3,2] for 5/4 → 5 quarter beats, accented 3+2
//               Examples: 5/4, 7/8
//
// Accent levels (used in scheduleClickAtTime):
//   2 = STRONG  measure downbeat
//   1 = MEDIUM  sub-group downbeat (asymmetric meters only)
//   0 = WEAK    all other beats
// ═══════════════════════════════════════════════════════════════════════════════

type MeterType = 'simple' | 'compound' | 'asymmetric'

type TimeSignatureOption = {
  label: string
  numerator: number
  denominator: number
  meterType: MeterType
  // beatGroups:
  //   simple    → [1, 1, 1, 1] (one beat per slot, count = beatsPerMeasure)
  //   compound  → [3, 3] for 6/8 (sub-divisions per beat, count = beatsPerMeasure)
  //   asymmetric→ [3, 2] for 5/4 (how many unit-beats per accent group)
  beatGroups: number[]
  beatsPerMeasure: number   // how many scheduler clicks per measure
  description: string
}

// Compute one beat's duration in seconds given BPM and time signature
function calcBeatSec(bpm: number, sig: TimeSignatureOption): number {
  const quarterSec      = 60 / bpm
  const denominatorSec  = quarterSec * (4 / sig.denominator)
  if (sig.meterType === 'compound') {
    // dotted note = 3 × denominator note
    return denominatorSec * 3
  }
  // simple or asymmetric: beat = one denominator note
  return denominatorSec
}

// Build an accent pattern array[beatsPerMeasure] → 2|1|0
function buildAccentPattern(sig: TimeSignatureOption): number[] {
  const pattern: number[] = []

  if (sig.meterType === 'asymmetric') {
    // beatGroups = [3, 2] means first 3 beats form group 1, next 2 form group 2
    let beatIdx = 0
    sig.beatGroups.forEach((groupSize) => {
      for (let b = 0; b < groupSize; b++) {
        if (beatIdx === 0)      pattern.push(2)   // measure downbeat = STRONG
        else if (b === 0)       pattern.push(1)   // group downbeat   = MEDIUM
        else                    pattern.push(0)   // inner beat       = WEAK
        beatIdx++
      }
    })
  } else if (sig.meterType === 'compound') {
    // One click per dotted-beat; only beat 0 is accented
    for (let b = 0; b < sig.beatsPerMeasure; b++) {
      pattern.push(b === 0 ? 2 : 0)
    }
  } else {
    // Simple: beat 0 = STRONG; 4/4 beat 2 (0-indexed) = MEDIUM; rest = WEAK
    for (let b = 0; b < sig.beatsPerMeasure; b++) {
      if (b === 0)                                   pattern.push(2)
      else if (sig.beatsPerMeasure === 4 && b === 2) pattern.push(1)
      else                                           pattern.push(0)
    }
  }
  return pattern
}

const TIME_SIGNATURE_OPTIONS: TimeSignatureOption[] = [
  // ── Simple ───────────────────────────────────────────────────────────────────
  {
    label: '2/4',
    numerator: 2, denominator: 4,
    meterType: 'simple',
    beatGroups: [1, 1],
    beatsPerMeasure: 2,
    description: 'March · 2 quarter beats',
  },
  {
    label: '3/4',
    numerator: 3, denominator: 4,
    meterType: 'simple',
    beatGroups: [1, 1, 1],
    beatsPerMeasure: 3,
    description: 'Waltz · 3 quarter beats',
  },
  {
    label: '4/4',
    numerator: 4, denominator: 4,
    meterType: 'simple',
    beatGroups: [1, 1, 1, 1],
    beatsPerMeasure: 4,
    description: 'Common time · 4 quarter beats',
  },
  // ── Asymmetric simple ────────────────────────────────────────────────────────
  {
    label: '5/4',
    numerator: 5, denominator: 4,
    meterType: 'asymmetric',
    beatGroups: [3, 2],         // 5 quarter beats grouped 3+2
    beatsPerMeasure: 5,
    description: '5/4 (3+2) · "Take Five" · 5 quarter beats',
  },
  // ── Compound ─────────────────────────────────────────────────────────────────
  // 6/8 → 2 dotted-quarter beats (each = 3 eighth notes)
  // At BPM 120: dotted quarter = 1.5 × (60/120) = 0.75 s → 80 dotted-quarter BPM
  {
    label: '6/8',
    numerator: 6, denominator: 8,
    meterType: 'compound',
    beatGroups: [3, 3],         // 2 beats, each subdivided in 3
    beatsPerMeasure: 2,
    description: 'Compound duple · 2 dotted-quarter beats · Jig/Waltz feel',
  },
  // ── Asymmetric compound ──────────────────────────────────────────────────────
  // 7/8 → 7 eighth-note beats grouped 2+2+3 (asymmetric)
  {
    label: '7/8',
    numerator: 7, denominator: 8,
    meterType: 'asymmetric',
    beatGroups: [2, 2, 3],      // 7 eighth beats grouped 2+2+3
    beatsPerMeasure: 7,
    description: '7/8 (2+2+3) · Balkan / Prog · 7 eighth beats',
  },
  // 9/8 → 3 dotted-quarter beats
  {
    label: '9/8',
    numerator: 9, denominator: 8,
    meterType: 'compound',
    beatGroups: [3, 3, 3],
    beatsPerMeasure: 3,
    description: 'Compound triple · 3 dotted-quarter beats · Triple jig',
  },
  // 12/8 → 4 dotted-quarter beats
  {
    label: '12/8',
    numerator: 12, denominator: 8,
    meterType: 'compound',
    beatGroups: [3, 3, 3, 3],
    beatsPerMeasure: 4,
    description: 'Compound quadruple · 4 dotted-quarter beats · Shuffle / Blues',
  },
]

const DEFAULT_TIME_SIGNATURE = TIME_SIGNATURE_OPTIONS[2]
const resolveTimeSignatureOption = (label?: string | null) =>
  TIME_SIGNATURE_OPTIONS.find(option => option.label === label) ?? DEFAULT_TIME_SIGNATURE

// ─── Web Audio scheduler constants ────────────────────────────────────────────
const LOOKAHEAD_MS       = 25.0   // scheduler wake interval (ms)
const SCHEDULE_AHEAD_SEC = 0.1    // how far ahead to pre-schedule beats

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value?: string | null) => !!value && UUID_REGEX.test(value)

// ─── Preset types (unchanged) ─────────────────────────────────────────────────
interface MetronomePreset {
  id: string
  name: string
  bpm: number
  inCloud: boolean
  scope: PresetScope
  isPublic: boolean
  playlistNames?: string[]
  isOwnedByOther?: boolean
  ownerUserId?: string
  useTimeSignatures?: boolean
  timeSignatureLabel?: string | null
}

const DEFAULT_PRESETS = [
  { id: 'default-60',  name: '60 BPM',  bpm: 60,  inCloud: false },
  { id: 'default-90',  name: '90 BPM',  bpm: 90,  inCloud: false },
  { id: 'default-120', name: '120 BPM', bpm: 120, inCloud: false },
  { id: 'default-140', name: '140 BPM', bpm: 140, inCloud: false },
  { id: 'default-160', name: '160 BPM', bpm: 160, inCloud: false },
]

export default function MetronomeScreen() {
  const { role } = useRole()
  const [bpm, setBpm] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [beatFlash, setBeatFlash] = useState(false)
  const defaultTimeSignature = TIME_SIGNATURE_OPTIONS[2]
  const resolveSelectedTimeSignature = (label?: string | null) =>
    TIME_SIGNATURE_OPTIONS.find(option => option.label === label) ?? defaultTimeSignature

  // ── Audio context ─────────────────────────────────────────────────────────
  const audioCtxRef        = useRef<AudioContext | null>(null)
  const schedulerTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextBeatTimeRef    = useRef(0)
  const beatInMeasureRef   = useRef(0)
  const isPlayingRef       = useRef(false)
  const bpmRef             = useRef(120)

  // ── Time signature refs — read directly inside schedulerLoop (no stale closures) ──
  const sigRef        = useRef<TimeSignatureOption>(defaultTimeSignature)
  const useTimeSigRef = useRef(false)

  // Fallback sounds
  const soundRef       = useRef<Audio.Sound | null>(null)
  const accentSoundRef = useRef<Audio.Sound | null>(null)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [presets, setPresets] = useState<MetronomePreset[]>([])
  const [activePreset, setActivePreset] = useState<MetronomePreset | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPreset, setEditingPreset] = useState<MetronomePreset | null>(null)
  const [menuPreset, setMenuPreset] = useState<MetronomePreset | null>(null)
  const [showPresetMenu, setShowPresetMenu] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const lastPreviewAtRef = useRef<number>(0)
  const [showSaveBar, setShowSaveBar] = useState(false)
  const [showTimeSignatureModal, setShowTimeSignatureModal] = useState(false)
  const [useTimeSignatures, setUseTimeSignatures] = useState(false)
  const [selectedTimeSignature, setSelectedTimeSignature] = useState<TimeSignatureOption>(defaultTimeSignature)
  const [newPresetScope, setNewPresetScope] = useState<PresetScope>('personal')
  const [newPresetPlaylistName, setNewPresetPlaylistName] = useState('')
  const [newPresetIsPublic, setNewPresetIsPublic] = useState(true)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [playlistPickerPreset, setPlaylistPickerPreset] = useState<MetronomePreset | null>(null)
  const [playlistPickerName, setPlaylistPickerName] = useState('')
  const [playlistPickerNames, setPlaylistPickerNames] = useState<string[]>([])
  const [playlistPickerScope, setPlaylistPickerScope] = useState<PresetScope>('personal')
  const [playlistPickerMode, setPlaylistPickerMode] = useState<'assign' | 'field'>('assign')
  const [uploadingPresetId, setUploadingPresetId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<MainTab>('personal')
  const [playlistScopeTab, setPlaylistScopeTab] = useState<PresetScope>('personal')
  const [publicPresets, setPublicPresets] = useState<MetronomePreset[]>([])
  const [openPlaylistNames, setOpenPlaylistNames] = useState<Record<string, boolean>>({})
  const [chordlistPlaylists, setChordlistPlaylists] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [playlistOrder, setPlaylistOrder] = useState<Record<string, string[]>>({})

  const isManagerOrSuperadmin = role === 'manager' || role === 'superadmin'
  const canUseOverallPlaylists = isManagerOrSuperadmin
  const canCreateOverallPreset = isManagerOrSuperadmin

  const isPresetOwner = useCallback((preset: MetronomePreset) => {
    if (preset.ownerUserId && currentUserId) return preset.ownerUserId === currentUserId
    return !preset.isOwnedByOther
  }, [currentUserId])

  const canModifyPreset = useCallback((preset: MetronomePreset) => {
    if (preset.scope === 'personal') return isPresetOwner(preset)
    if (preset.scope === 'overall') return isManagerOrSuperadmin
    return false
  }, [isManagerOrSuperadmin, isPresetOwner])

  const ensureCanModifyPreset = useCallback((preset: MetronomePreset, actionLabel: string) => {
    if (canModifyPreset(preset)) return true
    if (preset.scope === 'overall') {
      Alert.alert('Permission Denied', `Only manager and superadmin can ${actionLabel.toLowerCase()} overall presets.`)
      return false
    }
    Alert.alert('Permission Denied', `Only the creator can ${actionLabel.toLowerCase()} personal presets.`)
    return false
  }, [canModifyPreset])

  // ── Keep refs in sync with state ──────────────────────────────────────────
  useEffect(() => { bpmRef.current = bpm }, [bpm])
  useEffect(() => { sigRef.current = selectedTimeSignature }, [selectedTimeSignature])
  useEffect(() => { useTimeSigRef.current = useTimeSignatures }, [useTimeSignatures])

  // ── Initialise audio ──────────────────────────────────────────────────────
  useEffect(() => {
    const setup = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        })

        const AudioContextClass =
          (window as any)?.AudioContext ||
          (window as any)?.webkitAudioContext ||
          null

        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass()
        } else {
          const { sound } = await Audio.Sound.createAsync(
            require('../assets/sounds/click.wav'),
            { shouldPlay: false, volume: 1.0 }
          )
          soundRef.current = sound

          const { sound: accentSound } = await Audio.Sound.createAsync(
            require('../assets/sounds/click.wav'),
            { shouldPlay: false, volume: 1.0 }
          )
          await accentSound.setRateAsync(1.7, false)
          accentSoundRef.current = accentSound
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
      accentSoundRef.current?.unloadAsync()
    }
  }, [])

  // ─── Click synthesis — 3 accent levels ────────────────────────────────────
  //
  //  accentLevel 2 = STRONG  → bright, loud  (measure downbeat)
  //  accentLevel 1 = MEDIUM  → mid, moderate (sub-group downbeat in asymmetric)
  //  accentLevel 0 = WEAK    → dull, quiet   (all other beats)
  //
  const scheduleClickAtTime = useCallback((time: number, accentLevel: number = 0) => {
    const ctx = audioCtxRef.current
    if (!ctx) return

    const bufferSize = ctx.sampleRate * 0.04   // 40 ms noise burst
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    // Brighter = higher freq; duller = lower freq
    filter.frequency.value = accentLevel === 2 ? 1600 : accentLevel === 1 ? 1200 : 900
    filter.Q.value = accentLevel === 2 ? 1.2 : 0.9

    const gainNode = ctx.createGain()
    const gainVal  = accentLevel === 2 ? 1.0 : accentLevel === 1 ? 0.72 : 0.50
    gainNode.gain.setValueAtTime(gainVal, time)
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.04)

    noise.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(ctx.destination)
    noise.start(time)
    noise.stop(time + 0.04)
  }, [])

  const playClickFallback = async (strong = false, medium = false) => {
    try {
      const soundToPlay = (strong || medium) ? accentSoundRef.current : soundRef.current
      await soundToPlay?.replayAsync()
    } catch (err) {
      console.error('Fallback click error:', err)
    }
  }

  // ─── Lookahead scheduler ───────────────────────────────────────────────────
  //
  // Reads time signature data from refs (sigRef, useTimeSigRef) so it always
  // sees the current value without needing to restart or re-create the callback.
  //
  const schedulerLoop = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!isPlayingRef.current) return

    const sig        = sigRef.current
    const useTS      = useTimeSigRef.current
    const currentBpm = bpmRef.current

    // One beat duration in seconds (music-theory correct)
    const oneBeatSec = useTS ? calcBeatSec(currentBpm, sig) : (60 / currentBpm)

    // Accent pattern for the measure (or single click if time sigs are off)
    const accentPattern = useTS ? buildAccentPattern(sig) : [2]

    if (ctx) {
      // ── Web Audio path ──────────────────────────────────────────────────
      while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        const beatIdx   = beatInMeasureRef.current % accentPattern.length
        const accentLvl = accentPattern[beatIdx]

        scheduleClickAtTime(nextBeatTimeRef.current, accentLvl)

        // Sync visual flash to audio timing
        const visualDelayMs = Math.max(0, (nextBeatTimeRef.current - ctx.currentTime) * 1000)
        setTimeout(() => {
          if (isPlayingRef.current) setBeatFlash(f => !f)
        }, visualDelayMs)

        nextBeatTimeRef.current += oneBeatSec
        beatInMeasureRef.current = (beatInMeasureRef.current + 1) % accentPattern.length
      }
    } else {
      // ── Fallback path (drift-corrected setTimeout) ───────────────────────
      const beatIdx   = beatInMeasureRef.current % accentPattern.length
      const accentLvl = accentPattern[beatIdx]
      playClickFallback(accentLvl >= 2, accentLvl === 1)
      setBeatFlash(f => !f)

      nextBeatTimeRef.current += oneBeatSec * 1000   // ms
      beatInMeasureRef.current = (beatInMeasureRef.current + 1) % accentPattern.length
      const delay = Math.max(0, nextBeatTimeRef.current - Date.now())
      schedulerTimerRef.current = setTimeout(schedulerLoop, delay)
      return
    }

    schedulerTimerRef.current = setTimeout(schedulerLoop, LOOKAHEAD_MS)
  }, [scheduleClickAtTime])

  // ─── Start / stop ──────────────────────────────────────────────────────────

  const startScheduler = useCallback((overrideBpm?: number) => {
    if (overrideBpm !== undefined) bpmRef.current = overrideBpm
    beatInMeasureRef.current = 0   // always restart measure phase on start

    const ctx = audioCtxRef.current
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume()
      nextBeatTimeRef.current = ctx.currentTime
    } else {
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

  const startMetronome = () => { setIsPlaying(true); startScheduler() }
  const stopMetronome  = () => { setIsPlaying(false); stopScheduler() }
  const toggleMetronome = () => {
    if (isPlayingRef.current) stopMetronome()
    else startMetronome()
  }

  // ── BPM changes while playing ─────────────────────────────────────────────
  useEffect(() => {
    if (!isPlayingRef.current) return
    bpmRef.current = bpm
    // AudioContext: scheduler reads bpmRef on each tick — no restart needed
    // Fallback: restart with new BPM
    if (!audioCtxRef.current) {
      stopScheduler()
      startScheduler(bpm)
    }
  }, [bpm])

  // ── Real-time time signature change ──────────────────────────────────────
  //
  // Update refs first (so the scheduler sees new values immediately),
  // then reset the beat-in-measure counter so the new pattern starts clean.
  // The AudioContext scheduler picks up sigRef on its very next tick (within
  // LOOKAHEAD_MS = 25 ms) with zero audible glitch.
  // The fallback path needs an explicit restart to reset its drift timer.
  //
  useEffect(() => {
    sigRef.current        = selectedTimeSignature
    useTimeSigRef.current = useTimeSignatures

    // Reset measure position so the new pattern always starts on beat 1
    beatInMeasureRef.current = 0

    if (isPlayingRef.current && !audioCtxRef.current) {
      // Fallback: restart drift-corrected timer
      stopScheduler()
      startScheduler()
    }
    // AudioContext path: no restart needed — scheduler reads sigRef next tick ✓
  }, [useTimeSignatures, selectedTimeSignature])

  // ─── Preset persistence ────────────────────────────────────────────────────

  const getPresetsKey = (userId: string) => `metronome_presets_${userId}`

  const getPlaylistOrderKey = (userId: string) => `metronome_playlist_order_${userId}`

const loadPlaylistOrder = async (userId: string) => {
  try {
    const stored = await AsyncStorage.getItem(getPlaylistOrderKey(userId))
    if (stored) setPlaylistOrder(JSON.parse(stored))
  } catch {}
}

const savePlaylistOrder = async (order: Record<string, string[]>) => {
  try {
    const user = await getCurrentUser()
    if (!user) return
    await AsyncStorage.setItem(getPlaylistOrderKey(user.id), JSON.stringify(order))
  } catch {}
}

  const loadPresets = async () => {
    try {
      const user = await getCurrentUser()
      if (!user) return
      setCurrentUserId(user.id)
      await loadPlaylistOrder(user.id)

      const PRESETS_KEY = getPresetsKey(user.id)
      const stored = await AsyncStorage.getItem(PRESETS_KEY)
      const allLocalPresets: MetronomePreset[] = stored ? JSON.parse(stored) : []

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
          scope: getEffectivePresetScope({
            scope: row.scope ?? 'personal',
            playlistNames: (row.playlist_name || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          }),
          isPublic: getEffectivePresetScope({
            scope: row.scope ?? 'personal',
            playlistNames: (row.playlist_name || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          }) === 'overall',
          playlistNames: (row.playlist_name || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          isOwnedByOther: false,
          ownerUserId: row.user_id,
          useTimeSignatures: !!row.use_time_signatures,
          timeSignatureLabel: row.time_signature_label ?? null,
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
          playlistNames: (row.playlist_name || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          isOwnedByOther: true,
          ownerUserId: row.user_id,
          useTimeSignatures: !!row.use_time_signatures,
          timeSignatureLabel: row.time_signature_label ?? null,
        }))
      }

      const remoteCloudIds = new Set([...ownCloudPresets, ...fetchedPublicPresets].map(p => p.id))
      const mergedLocal = allLocalPresets
        .filter(p => !remoteCloudIds.has(p.id))
        .map(normalizePresetVisibility)
      const ownPresets = [...mergedLocal, ...ownCloudPresets].map(normalizePresetVisibility)
      const uniqueOwnPresets = ownPresets.reduce<MetronomePreset[]>((items, preset) => {
        if (!items.some(existing => existing.id === preset.id)) items.push(preset)
        return items
      }, [])

      setPresets(uniqueOwnPresets)
      setPublicPresets(fetchedPublicPresets)
      try {
        const cls = await getPlaylistsByUserId(user.id)
        const playlistsWithItems = await Promise.all(
          (cls || []).map(async (playlist: any) => {
            try {
              const items = await getPlaylistItems(playlist.id)
              return (items?.length || 0) > 0 ? playlist : null
            } catch {
              return null
            }
          })
        )
        const titles = playlistsWithItems
          .filter(Boolean)
          .map((r: any) => r.title)
          .filter(Boolean)
        setChordlistPlaylists(titles)
      } catch (e) {
        console.warn('Failed to load chordlist playlists:', e)
        setChordlistPlaylists([])
      }
      await savePresetsLocally(uniqueOwnPresets)
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

  const resetPresetForm = (preset?: MetronomePreset | null) => {
    setEditingPreset(preset ?? null)
    setNewPresetName(preset?.name ?? '')
    setNewPresetScope(preset?.scope ?? (activeTab === 'overall' ? 'overall' : 'personal'))
    setNewPresetPlaylistName(preset?.playlistNames?.[0] ?? '')
    setNewPresetIsPublic(preset?.scope === 'overall' ? true : false)
    setUseTimeSignatures(!!preset?.useTimeSignatures)
    setSelectedTimeSignature(resolveSelectedTimeSignature(preset?.timeSignatureLabel))
    setShowAddModal(!preset)
    setShowEditModal(!!preset)
  }

  const openPlaylistPicker = (preset: MetronomePreset | null, mode: 'assign' | 'field' = 'assign') => {
    const presetPlaylistNames = (preset?.playlistNames ?? []).filter(name => canUseOverallPlaylists || getPlaylistScope(name) === 'personal')
    setPlaylistPickerPreset(preset)
    setPlaylistPickerNames(presetPlaylistNames)
    setPlaylistPickerName(presetPlaylistNames[0] ?? '')
    setPlaylistPickerScope('personal')
    setPlaylistPickerMode(mode)
    setShowPlaylistPicker(true)
  }

  const closePlaylistPicker = () => {
    setShowPlaylistPicker(false)
    setPlaylistPickerPreset(null)
    setPlaylistPickerName('')
    setPlaylistPickerNames([])
    setPlaylistPickerScope('personal')
    setPlaylistPickerMode('assign')
  }

  const getScopedPlaylistName = (name: string, scope: PresetScope) => {
    const trimmed = name.trim()
    if (!trimmed) return ''
    return scope === 'overall' ? `Overall: ${trimmed}` : trimmed
  }

  const getPlaylistScope = (name: string): PresetScope =>
    name.trim().toLowerCase().startsWith('overall:') ? 'overall' : 'personal'

  const getPlaylistDisplayName = (name: string) =>
    name.replace(/^overall:\s*/i, '').trim()

  const getCanonicalPlaylistName = (name: string, scope: PresetScope) => {
    const display = getPlaylistDisplayName(name)
    return scope === 'overall' ? `Overall: ${display}` : display
  }

  const getScopedPlaylistNamesForCopy = (playlistNames: string[] | undefined, scope: PresetScope) => {
    const displayNames = (playlistNames ?? [])
      .map(name => getPlaylistDisplayName(name).trim())
      .filter(Boolean)
    return Array.from(new Set(displayNames.map(name => getCanonicalPlaylistName(name, scope))))
  }

  const getEffectivePresetScope = (preset: Pick<MetronomePreset, 'scope' | 'playlistNames'>): PresetScope => {
    const hasOverallPlaylist = (preset.playlistNames ?? []).some(name => getPlaylistScope(name) === 'overall')
    return hasOverallPlaylist ? 'overall' : preset.scope
  }

  const normalizePresetVisibility = (preset: MetronomePreset): MetronomePreset => ({
    ...preset,
    isPublic: preset.scope === 'overall',
  })

  const getPresetCopyFingerprint = (preset: MetronomePreset) =>
    [
      preset.scope,
      preset.name.trim().toLowerCase(),
      String(preset.bpm),
      getScopedPlaylistNamesForCopy(preset.playlistNames, preset.scope).sort().join('|'),
    ].join('::')

  const getPresetPairKey = (preset: Pick<MetronomePreset, 'name' | 'bpm' | 'playlistNames'>) =>
    [
      preset.name.trim().toLowerCase(),
      String(preset.bpm),
      getScopedPlaylistNamesForCopy(preset.playlistNames, 'personal').sort().join('|'),
    ].join('::')

  const makePresetCopy = (preset: MetronomePreset, scope: PresetScope): MetronomePreset => ({
    ...preset,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scope,
    isPublic: scope === 'overall',
    playlistNames: getScopedPlaylistNamesForCopy(preset.playlistNames, scope),
    inCloud: false,
    isOwnedByOther: false,
    ownerUserId: currentUserId ?? preset.ownerUserId,
  })

  const getCurrentTimeSignatureState = () => ({
    useTimeSignatures,
    timeSignatureLabel: useTimeSignatures ? selectedTimeSignature.label : null,
  })

  const savePresetPlaylist = async (preset: MetronomePreset, playlistNames: string[] | string) => {
    const incomingNames = Array.isArray(playlistNames) ? playlistNames : [playlistNames]
    const names = incomingNames.map(name => name.trim()).filter(Boolean)
    if (names.some(name => getPlaylistScope(name) === 'overall') && !canUseOverallPlaylists) {
      Alert.alert('Permission Denied', 'Only manager and superadmin can add presets to overall playlists.')
      return false
    }

    const existing = preset.playlistNames ?? []
    const nextPlaylistNames = Array.from(new Set([...existing, ...names]))
    const nextScope = getEffectivePresetScope({ scope: preset.scope, playlistNames: nextPlaylistNames })
    const forcePersonalCopy = preset.scope === 'overall'
    const hasDirectEditPermission = canModifyPreset(preset) && !forcePersonalCopy
    const existingPersonalCopy = presets.find(existingPreset =>
      existingPreset.scope === 'personal' && getPresetPairKey(existingPreset) === getPresetPairKey(preset)
    ) ?? null

    const nextPreset = forcePersonalCopy
      ? existingPersonalCopy
        ? {
            ...existingPersonalCopy,
            name: preset.name,
            bpm: preset.bpm,
            scope: 'personal' as PresetScope,
            isPublic: false,
            playlistNames: nextPlaylistNames,
          }
        : {
            ...makePresetCopy(preset, 'personal'),
            name: preset.name,
            bpm: preset.bpm,
            scope: 'personal' as PresetScope,
            isPublic: false,
            playlistNames: nextPlaylistNames,
          }
      : hasDirectEditPermission
        ? { ...preset, scope: nextScope, isPublic: nextScope === 'overall', playlistNames: nextPlaylistNames }
        : existingPersonalCopy
          ? {
              ...existingPersonalCopy,
              name: preset.name,
              bpm: preset.bpm,
              scope: 'personal' as PresetScope,
              isPublic: false,
              playlistNames: nextPlaylistNames,
            }
          : {
              ...makePresetCopy(preset, 'personal'),
              name: preset.name,
              bpm: preset.bpm,
              scope: 'personal' as PresetScope,
              isPublic: false,
              playlistNames: nextPlaylistNames,
            }

    const updated = forcePersonalCopy
      ? existingPersonalCopy
        ? presets.map(p => p.id === existingPersonalCopy.id ? nextPreset : p)
        : [...presets, nextPreset]
      : hasDirectEditPermission
        ? presets.map(p => p.id === preset.id ? nextPreset : p)
        : existingPersonalCopy
          ? presets.map(p => p.id === existingPersonalCopy.id ? nextPreset : p)
          : [...presets, nextPreset]
    setPresets(updated)
    await savePresetsLocally(updated)

    const persistTargetId = hasDirectEditPermission
      ? (preset.inCloud && isUuid(preset.id) ? preset.id : undefined)
      : (forcePersonalCopy && existingPersonalCopy?.inCloud && isUuid(existingPersonalCopy.id) ? existingPersonalCopy.id : undefined)
        || (!forcePersonalCopy && existingPersonalCopy?.inCloud && isUuid(existingPersonalCopy.id) ? existingPersonalCopy.id : undefined)

    const cloudRow = await persistPreset(nextPreset, persistTargetId)
    if (cloudRow) {
      const synced = hasDirectEditPermission
        ? updated.map(p => p.id === preset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true } : p)
        : existingPersonalCopy
          ? updated.map(p => p.id === existingPersonalCopy.id ? { ...nextPreset, id: cloudRow.id, inCloud: true } : p)
          : updated.map(p => p.id === nextPreset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true } : p)
      setPresets(synced)
      await savePresetsLocally(synced)
      await loadPresets()
      setActivePreset(synced.find(p => p.id === cloudRow.id) ?? nextPreset)
      return true
    }
    await showCloudFailAlert(nextPreset, 'Save Playlist')
    return false
  }

  const handleRemovePresetFromPlaylist = async (preset: MetronomePreset, playlistName?: string) => {
    if (!ensureCanModifyPreset(preset, 'Update Playlist')) return
    if (!playlistName) { await savePresetPlaylist(preset, ''); return }
    const existing = preset.playlistNames ?? []
    const next = existing.filter(n => n !== playlistName)
    if (preset.scope === 'personal' && next.length === 0) {
      try {
        if (preset.inCloud && isUuid(preset.id)) {
          await supabase.from('metronome_presets').delete().eq('id', preset.id)
        }
        const updated = presets.filter(p => p.id !== preset.id)
        setPresets(updated)
        await savePresetsLocally(updated)
        if (activePreset?.id === preset.id) setActivePreset(null)
      } catch (err) {
        Alert.alert('Error', 'Failed to delete preset')
      }
      return
    }
    const nextPreset = { ...preset, playlistNames: next }
    const updated = presets.map(p => p.id === preset.id ? nextPreset : p)
    setPresets(updated)
    await savePresetsLocally(updated)
    const cloudRow = await persistPreset(nextPreset, preset.inCloud && isUuid(preset.id) ? preset.id : undefined)
    if (cloudRow) {
      const synced = updated.map(p => p.id === preset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true } : p)
      setPresets(synced)
      await savePresetsLocally(synced)
      await loadPresets()
    }
  }

  const handleSavePlaylistFromPicker = async () => {
    const newName = playlistPickerName.trim()
    const effectivePickerScope = canUseOverallPlaylists ? playlistPickerScope : 'personal'
    const scopedNewName = newName ? getScopedPlaylistName(newName, effectivePickerScope) : ''
    const selections = Array.from(new Set([...(playlistPickerNames || []), ...(scopedNewName ? [scopedNewName] : [])])).filter(Boolean)
    if (selections.length === 0) { Alert.alert('Error', 'Enter a playlist name or choose one from the list'); return }

    if (playlistPickerMode === 'field' || !playlistPickerPreset) {
      setNewPresetPlaylistName(selections[0])
      closePlaylistPicker()
      return
    }
    await savePresetPlaylist(playlistPickerPreset, selections)
    closePlaylistPicker()
  }

  const handleQuickAddPlaylist = async () => {
    const targetPreset = activePreset ?? null
    if (!targetPreset) { Alert.alert('Add Playlist', 'Select a preset first, then add it to a playlist.'); return }
    openPlaylistPicker(targetPreset)
  }

  const togglePlaylistAccordion = (name: string) =>
    setOpenPlaylistNames(prev => ({ ...prev, [name]: !prev[name] }))

  const handleReorderPlaylistPreset = async (playlistName: string, fromIndex: number, direction: 'up' | 'down') => {
  const group = getOrderedPlaylistGroup(playlistName)
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
  if (toIndex < 0 || toIndex >= group.length) return
  const newGroup = [...group]
  const [moved] = newGroup.splice(fromIndex, 1)
  newGroup.splice(toIndex, 0, moved)
  const newOrder = { ...playlistOrder, [playlistName]: newGroup.map(p => p.id) }
  setPlaylistOrder(newOrder)
  await savePlaylistOrder(newOrder)
}

const getOrderedPlaylistGroup = (playlistName: string): MetronomePreset[] => {
  const group = playlistGroups[playlistName] || []
  const order = playlistOrder[playlistName]
  if (!order || order.length === 0) return group
  const indexed = Object.fromEntries(group.map(p => [p.id, p]))
  const ordered = order.map(id => indexed[id]).filter(Boolean)
  // append any newly added presets not yet in order
  const inOrder = new Set(order)
  const extras = group.filter(p => !inOrder.has(p.id))
  return [...ordered, ...extras]
}

  const handleChangePlaylistScope = async (playlistName: string, targetScope: PresetScope) => {
    const currentScope = getPlaylistScope(playlistName)
    if (currentScope === targetScope) return
    if (targetScope === 'overall' && !isManagerOrSuperadmin) {
      Alert.alert('Permission Denied', 'Only manager and superadmin can copy personal playlists to overall.')
      return
    }

    const groupItems = playlistGroups[playlistName] || []
    if (groupItems.length === 0) return

    let workingPresets = [...presets]
    let copiedCount = 0, skippedCount = 0, duplicateCount = 0

    for (const item of groupItems) {
      let sourcePreset = workingPresets.find(p => p.id === item.id)
      if (!sourcePreset) {
        // fall back to playlistSource (which includes public presets)
        sourcePreset = (playlistSource || []).find(p => p.id === item.id)
        if (sourcePreset) console.warn('handleChangePlaylistScope: using playlistSource as source for copy', item.id)
      }
      if (!sourcePreset) { console.warn('handleChangePlaylistScope: skipping - preset not found in local or playlist source', item.id); skippedCount++; continue }

      if (targetScope === 'overall' && !isManagerOrSuperadmin) { console.warn('handleChangePlaylistScope: skipping - no permission to copy to overall', item.id); skippedCount++; continue }

      const nextPreset = makePresetCopy(sourcePreset, targetScope)
      if (workingPresets.some(existing => getPresetCopyFingerprint(existing) === getPresetCopyFingerprint(nextPreset))) {
        duplicateCount++; continue
      }
      workingPresets = [...workingPresets, nextPreset]
      copiedCount++
      try {
        const cloudRow = await persistPreset(nextPreset)
        if (cloudRow) {
          workingPresets = workingPresets.map(p =>
            p.id === nextPreset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true, ownerUserId: cloudRow.user_id ?? nextPreset.ownerUserId } : p
          )
        }
      } catch (err) {
        console.warn('Failed to sync playlist copy for preset:', sourcePreset.id, err)
      }
    }

    if (copiedCount === 0) {
      const message = duplicateCount > 0 ? 'A matching copy already exists for this playlist.'
        : skippedCount > 0 ? 'No presets could be copied from this playlist. Skipped items were not found locally or you lack permission to copy them.'
        : 'Nothing to copy for this playlist.'
      Alert.alert('No Changes', message)
      return
    }

    setPresets(workingPresets)
    await savePresetsLocally(workingPresets)
    await loadPresets()
    const parts = [
      `${copiedCount} copy${copiedCount === 1 ? '' : 'ies'} created`,
      duplicateCount > 0 ? `${duplicateCount} already existed` : '',
      skippedCount > 0 ? `${skippedCount} skipped` : '',
    ].filter(Boolean)
    Alert.alert('Playlist Updated', parts.join('. '))
  }

  const persistPreset = async (preset: MetronomePreset, existingId?: string, forcedScope?: PresetScope) => {
    const user = await getCurrentUser()
    if (!user) return null
    const effectiveScope = forcedScope ?? getEffectivePresetScope(preset)

    const payload: any = {
      user_id: user.id,
      name: preset.name,
      bpm: preset.bpm,
      scope: effectiveScope,
      is_public: effectiveScope === 'overall',
      playlist_name: (preset.playlistNames && preset.playlistNames.length) ? preset.playlistNames.join(',') : '',
      use_time_signatures: !!preset.useTimeSignatures,
      time_signature_label: preset.useTimeSignatures ? (preset.timeSignatureLabel ?? null) : null,
    }
    if (isUuid(preset.id)) payload.id = preset.id

    if (existingId && isUuid(existingId)) {
      const updatePayload: any = {
        name: preset.name, bpm: preset.bpm, scope: effectiveScope,
        is_public: effectiveScope === 'overall',
        playlist_name: (preset.playlistNames && preset.playlistNames.length) ? preset.playlistNames.join(',') : '',
        use_time_signatures: !!preset.useTimeSignatures,
        time_signature_label: preset.useTimeSignatures ? (preset.timeSignatureLabel ?? null) : null,
      }
      const { data, error } = await supabase.from('metronome_presets').update(updatePayload).eq('id', existingId).select()
      if (error) {
        console.warn('persistPreset UPDATE error', error)
        if (error.code === '42501') { Alert.alert('Cloud Permission Denied', 'Supabase denied update (RLS).'); return null }
        Alert.alert('Cloud Error', `${error.message || 'Unknown error'} (${error.code || 'no-code'})`)
        throw error
      }
      return Array.isArray(data) ? data[0] ?? null : data ?? null
    }

    const { data, error } = await supabase.from('metronome_presets').insert(payload).select()
    if (error) {
      console.warn('persistPreset INSERT error', error)
      if (error.code === '42501') { Alert.alert('Cloud Permission Denied', 'Supabase denied insert (RLS).'); return null }
      Alert.alert('Cloud Error', `${error.message || 'Unknown error'} (${error.code || 'no-code'})`)
      throw error
    }
    return Array.isArray(data) ? data[0] ?? null : data ?? null
  }

  const handleAddPreset = async () => {
    if (!newPresetName.trim()) { Alert.alert('Error', 'Please enter a preset name'); return }
    if (newPresetScope === 'overall' && !canCreateOverallPreset) {
      Alert.alert('Permission Denied', 'Only manager and superadmin can create overall presets.')
      return
    }

    const newPreset: MetronomePreset = {
      id: `local-${Date.now()}`,
      name: newPresetName.trim(),
      bpm,
      inCloud: false,
      scope: newPresetScope,
      isPublic: newPresetScope === 'overall' ? true : false,
      playlistNames: newPresetPlaylistName.trim() ? [newPresetPlaylistName.trim()] : [],
      ownerUserId: currentUserId ?? undefined,
      ...getCurrentTimeSignatureState(),
    }

    const updated = [...presets, newPreset]
    setPresets(updated)
    await savePresetsLocally(updated)
    setEditingPreset(null); setNewPresetName(''); setNewPresetScope('personal')
    setNewPresetPlaylistName(''); setNewPresetIsPublic(false)
    setShowAddModal(false); setShowEditModal(false)
    setActiveTab(newPresetScope)

    if (newPresetScope === 'overall') {
      try {
        const data = await persistPreset(newPreset)
        if (!data) { Alert.alert('Saved locally', `"${newPreset.name}" saved at ${bpm} BPM. Sign in to sync to cloud.`); return }
        const synced = updated.map(p => p.id === newPreset.id ? { ...p, id: data.id, inCloud: true, isPublic: true } : p)
        setPresets(synced); await savePresetsLocally(synced)
        Alert.alert('Synced', `"${newPreset.name}" saved and synced to cloud at ${bpm} BPM`)
      } catch (err) {
        console.error('Auto-sync failed:', err)
        Alert.alert('Saved locally', `"${newPreset.name}" saved at ${bpm} BPM but cloud sync failed.`)
      }
    } else {
      Alert.alert('Saved', `"${newPreset.name}" saved locally at ${bpm} BPM`)
    }
  }

  const handleSavePresetEdit = async () => {
    if (!editingPreset) return
    if (!ensureCanModifyPreset(editingPreset, 'Edit')) return
    if (!newPresetName.trim()) { Alert.alert('Error', 'Please enter a preset name'); return }

    const scopeChanged = editingPreset.scope !== newPresetScope
    const nextPlaylistNames = newPresetPlaylistName.trim()
      ? [newPresetPlaylistName.trim()]
      : (editingPreset.playlistNames ?? [])

    const nextPreset: MetronomePreset = scopeChanged
      ? {
          ...makePresetCopy(editingPreset, newPresetScope),
          name: newPresetName.trim(),
          bpm,
          playlistNames: nextPlaylistNames,
          ...getCurrentTimeSignatureState(),
        }
      : {
          ...editingPreset,
          name: newPresetName.trim(),
          bpm,
          scope: newPresetScope,
          isPublic: newPresetScope === 'overall',
          playlistNames: nextPlaylistNames,
          ...getCurrentTimeSignatureState(),
        }

    const updated = scopeChanged
      ? [...presets, nextPreset]
      : presets.map(p => p.id === editingPreset.id ? nextPreset : p)
    const pairKey = getPresetPairKey(editingPreset)
    const linkedPresets = presets.filter(p => p.id !== editingPreset.id && getPresetPairKey(p) === pairKey)

    setPresets(updated); await savePresetsLocally(updated)

    try {
      const cloudRow = await persistPreset(
        nextPreset,
        scopeChanged && editingPreset.inCloud && isUuid(editingPreset.id) ? undefined : (editingPreset.inCloud && isUuid(editingPreset.id) ? editingPreset.id : undefined)
      )
      const syncLinkedPreset = async (linkedPreset: MetronomePreset) => {
        const linkedNextPreset = {
          ...linkedPreset,
          name: newPresetName.trim(),
          bpm,
          playlistNames: nextPlaylistNames,
        }
        const linkedCloudRow = await persistPreset(
          linkedNextPreset,
          linkedPreset.inCloud && isUuid(linkedPreset.id) ? linkedPreset.id : undefined,
          linkedPreset.scope
        )
        return linkedCloudRow
          ? { ...linkedNextPreset, id: linkedCloudRow.id, inCloud: true, ownerUserId: linkedCloudRow.user_id ?? linkedNextPreset.ownerUserId }
          : linkedNextPreset
      }

      if (cloudRow) {
        const synced = scopeChanged
          ? updated.map(p => p.id === nextPreset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true, ownerUserId: cloudRow.user_id ?? nextPreset.ownerUserId } : p)
          : updated.map(p => p.id === editingPreset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true } : p)
        let finalPresets = synced
        for (const linkedPreset of linkedPresets) {
          const syncedLinkedPreset = await syncLinkedPreset(linkedPreset)
          finalPresets = finalPresets.map(p => p.id === linkedPreset.id ? syncedLinkedPreset : p)
        }
        setPresets(finalPresets); await savePresetsLocally(finalPresets); await loadPresets()
      } else {
        console.warn('Preset edit saved locally but did not sync to Supabase.')
        await showCloudFailAlert(nextPreset, 'Save')
      }
      Alert.alert('Saved', scopeChanged ? `"${nextPreset.name}" copied to ${newPresetScope}` : `"${nextPreset.name}" updated`)
    } catch (err) {
      console.error('Failed to save preset edit:', err)
      await showCloudFailAlert(nextPreset, 'Save')
    } finally {
      setEditingPreset(null); setShowEditModal(false); setNewPresetName('')
      setNewPresetScope('personal'); setNewPresetPlaylistName(''); setNewPresetIsPublic(false)
    }
  }

  const handleUploadPresetToCloud = async (preset: MetronomePreset) => {
    Alert.alert('Upload to Cloud', `Save "${preset.name}" to cloud so it syncs across devices?`, [
      { text: 'Cancel' },
      {
        text: 'Upload',
        onPress: async () => {
          try {
            setUploadingPresetId(preset.id)
            const user = await getCurrentUser()
            if (!user) { Alert.alert('Error', 'Not logged in'); return }
            const cloudRow = await persistPreset(preset, preset.inCloud && isUuid(preset.id) ? preset.id : undefined)
            if (!cloudRow) {
              Alert.alert('Saved locally', `"${preset.name}" saved locally but cloud sync failed.`)
            } else {
              const updated = presets.map(p => p.id === preset.id ? { ...p, id: cloudRow.id, inCloud: true } : p)
              setPresets(updated); await savePresetsLocally(updated)
              Alert.alert('Success', `"${preset.name}" saved to cloud!`)
            }
          } catch (err) {
            console.error('Upload preset error:', err)
            Alert.alert('Error', 'Failed to upload preset')
          } finally {
            setUploadingPresetId(null)
          }
        }
      }
    ])
  }

  const handleCopyPresetToOwn = async (preset: MetronomePreset) => {
    try {
      setUploadingPresetId(preset.id)
      const user = await getCurrentUser()
      if (!user) { Alert.alert('Error', 'Not logged in'); return }
      const effectiveScope = getEffectivePresetScope(preset)
      const payload: any = {
        user_id: user.id, name: preset.name, bpm: preset.bpm,
        scope: effectiveScope, is_public: effectiveScope === 'overall',
        playlist_name: (preset.playlistNames && preset.playlistNames.length) ? preset.playlistNames[0] : '',
        use_time_signatures: !!preset.useTimeSignatures,
        time_signature_label: preset.useTimeSignatures ? (preset.timeSignatureLabel ?? null) : null,
      }
      const { data, error } = await supabase.from('metronome_presets').insert(payload).select().single()
      if (error) throw error
      const updated = presets.map(p => p.id === preset.id ? { ...p, id: data.id, inCloud: true, isOwnedByOther: false } : p)
      const exists = presets.some(p => p.id === preset.id)
      const final = exists ? updated : [...presets, { ...preset, id: data.id, inCloud: true, isOwnedByOther: false }]
      setPresets(final); await savePresetsLocally(final)
      Alert.alert('Success', `"${preset.name}" copied to your presets and uploaded.`)
    } catch (err) {
      console.error('Copy preset error:', err)
      Alert.alert('Error', 'Failed to copy preset to your account')
    } finally {
      setUploadingPresetId(null)
    }
  }

  const showCloudFailAlert = async (preset: MetronomePreset, actionLabel = 'Save') => {
    try {
      const user = await getCurrentUser()
      Alert.alert(
        'Cloud Sync Failed',
        `${actionLabel} failed to sync to Supabase.\nPreset id: ${preset.id}\nUser id: ${user?.id ?? 'not signed in'}`,
        [
          { text: 'Cancel' },
          { text: 'Retry Upload', onPress: () => handleUploadPresetToCloud(preset) },
          { text: 'Show Debug', onPress: () => {
            Alert.alert('Debug', `Preset id: ${preset.id}\nuser: ${user?.id ?? 'not signed in'}`)
          } }
        ]
      )
    } catch (e) {
      Alert.alert('Cloud Sync Failed', 'Failed to show debug info')
    }
  }

  const handleTogglePublic = async (preset: MetronomePreset) => {
    if (preset.scope === 'overall') return
    const nextIsPublic = !preset.isPublic
    const updated = presets.map(p => p.id === preset.id ? { ...p, isPublic: nextIsPublic } : p)
    setPresets(updated); await savePresetsLocally(updated)
    if (preset.inCloud) {
      try { await supabase.from('metronome_presets').update({ is_public: nextIsPublic }).eq('id', preset.id) }
      catch (err) { console.error('Failed to update visibility in cloud:', err) }
    }
  }

  const handleChangePresetScope = async (preset: MetronomePreset, scope: PresetScope) => {
    if (preset.scope === scope) return
    if (scope === 'overall' && !isManagerOrSuperadmin) {
      Alert.alert('Permission Denied', 'Only manager and superadmin can copy personal presets to overall.')
      return
    }
    if (scope === 'personal') {
      if (preset.scope !== 'overall') return

      const existingCopy = presets.find(existing =>
        existing.scope === 'personal' && getPresetPairKey(existing) === getPresetPairKey(preset)
      )

      if (existingCopy) {
        setActivePreset(existingCopy)
        Alert.alert('Already Copied', `A personal copy of "${preset.name}" already exists.`)
        return
      }

      const nextPreset = makePresetCopy(preset, 'personal')
      const updated = [...presets, nextPreset]
      setPresets(updated)
      await savePresetsLocally(updated)

      try {
        const cloudRow = await persistPreset(nextPreset)
        if (cloudRow) {
          const synced = updated.map(p =>
            p.id === nextPreset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true, ownerUserId: cloudRow.user_id ?? nextPreset.ownerUserId } : p
          )
          setPresets(synced)
          await savePresetsLocally(synced)
          await loadPresets()
          setActivePreset(synced.find(p => p.id === cloudRow.id) ?? nextPreset)
          return
        }
        await showCloudFailAlert(nextPreset, 'Copy')
      } catch (err) {
        console.error('Failed to copy preset scope to personal:', err)
        await showCloudFailAlert(nextPreset, 'Copy')
      }
      return
    }

    const nextPreset = makePresetCopy(preset, scope)
    if (presets.some(existing => getPresetCopyFingerprint(existing) === getPresetCopyFingerprint(nextPreset))) {
      Alert.alert('Already Copied', `A ${scope} copy of "${preset.name}" already exists.`)
      return
    }

    let updated = [...presets, nextPreset]
    setPresets(updated); await savePresetsLocally(updated)
    try {
      const cloudRow = await persistPreset(nextPreset)
      if (cloudRow) {
        updated = updated.map(p =>
          p.id === nextPreset.id ? { ...nextPreset, id: cloudRow.id, inCloud: true, ownerUserId: cloudRow.user_id ?? nextPreset.ownerUserId } : p
        )
        setPresets(updated); await savePresetsLocally(updated); await loadPresets()
        return
      }
      await showCloudFailAlert(nextPreset, 'Copy')
    } catch (err) {
      console.error('Failed to copy preset scope:', err)
      await showCloudFailAlert(nextPreset, 'Copy')
    }
  }

  const handleDeletePreset = (preset: MetronomePreset) => {
    if (!ensureCanModifyPreset(preset, 'Delete')) return
    Alert.alert('Delete Preset', `Delete "${preset.name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            if (preset.inCloud) await supabase.from('metronome_presets').delete().eq('id', preset.id)
            const updated = presets.filter(p => p.id !== preset.id)
            setPresets(updated); await savePresetsLocally(updated)
            if (activePreset?.id === preset.id) setActivePreset(null)
          } catch (err) { Alert.alert('Error', 'Failed to delete preset') }
        }
      }
    ])
  }

  const handleDeletePresetFromMenu = (preset: MetronomePreset) => {
    if (preset.scope === 'overall') { handleDeletePreset(preset); return }
    if (!preset.isOwnedByOther) { handleDeletePreset(preset); return }
    Alert.alert('Remove Preset', `Remove "${preset.name}" from your list?`, [
      { text: 'Cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const updated = presets.filter(p => p.id !== preset.id)
          setPresets(updated); await savePresetsLocally(updated)
          if (activePreset?.id === preset.id) setActivePreset(null)
        }
      }
    ])
  }

  const handleEditPresetPress = (preset: MetronomePreset) => {
    if (!ensureCanModifyPreset(preset, 'Edit')) return
    setEditingPreset(preset); setNewPresetName(preset.name)
    setNewPresetScope(preset.scope); setNewPresetPlaylistName(preset.playlistNames?.[0] ?? '')
    setNewPresetIsPublic(preset.scope === 'overall' ? true : preset.isPublic)
    setUseTimeSignatures(!!preset.useTimeSignatures)
    setSelectedTimeSignature(resolveSelectedTimeSignature(preset.timeSignatureLabel))
    setBpm(preset.bpm); setShowEditModal(true)
  }

  const openPresetMenu  = (preset: MetronomePreset) => { setMenuPreset(preset); setShowPresetMenu(true) }
  const closePresetMenu = () => { setShowPresetMenu(false); setMenuPreset(null) }

  const handleSelectPreset = (preset: MetronomePreset) => {
    setBpm(preset.bpm)
    setActivePreset(preset)
    setUseTimeSignatures(!!preset.useTimeSignatures)
    setSelectedTimeSignature(resolveSelectedTimeSignature(preset.timeSignatureLabel))
    if (isPlayingRef.current) {
      bpmRef.current = preset.bpm
      if (!audioCtxRef.current) { stopScheduler(); startScheduler(preset.bpm) }
    }
  }

  const PREVIEW_THROTTLE_MS = 220
  const playPreviewClick = () => {
    const now = Date.now()
    if (now - lastPreviewAtRef.current < PREVIEW_THROTTLE_MS) return
    lastPreviewAtRef.current = now
    const ctx = audioCtxRef.current
    if (ctx) { try { scheduleClickAtTime(ctx.currentTime + 0.02, 2) } catch { playClickFallback(true) } }
    else { playClickFallback(true) }
  }

  const handleModalSliderChange = (value: number) => {
    setBpm(Math.round(value))
    playPreviewClick()
  }

  const adjustBpm = (delta: number) => {
    setBpm(prev => Math.max(40, Math.min(300, prev + delta)))
    setActivePreset(null)
  }

  useEffect(() => {
    if (!activePreset) { setShowSaveBar(false); return }
    setShowSaveBar(bpm !== activePreset.bpm)
  }, [bpm, activePreset])

  const handleSaveBpmChangeForActivePreset = async () => {
    if (!activePreset) return
    if (!ensureCanModifyPreset(activePreset, 'Update BPM')) return
    const updatedPreset: MetronomePreset = {
      ...activePreset,
      bpm,
      ...getCurrentTimeSignatureState(),
    }
    const updated = presets.map(p => p.id === activePreset.id ? updatedPreset : p)
    setPresets(updated); await savePresetsLocally(updated)
    try {
      const shouldSync = activePreset.inCloud || updatedPreset.scope === 'overall'
      if (shouldSync) {
        const cloudRow = await persistPreset(updatedPreset, activePreset.inCloud && isUuid(activePreset.id) ? activePreset.id : undefined)
        if (cloudRow) {
          const synced = updated.map(p => p.id === activePreset.id ? { ...updatedPreset, id: cloudRow.id, inCloud: true } : p)
          setPresets(synced); await savePresetsLocally(synced)
          setActivePreset(synced.find(p => p.id === cloudRow.id) ?? updatedPreset)
        } else { setActivePreset(updatedPreset); await showCloudFailAlert(updatedPreset, 'Save BPM') }
      } else { setActivePreset(updatedPreset) }
      Alert.alert('Saved', `"${updatedPreset.name}" updated to ${updatedPreset.bpm} BPM`)
    } catch (err) {
      console.error('Failed to persist BPM change:', err)
      await showCloudFailAlert(updatedPreset, 'Save BPM'); setActivePreset(updatedPreset)
    } finally { setShowSaveBar(false) }
  }

  const handleRevertBpmChange = () => {
    if (!activePreset) return
    setBpm(activePreset.bpm); setShowSaveBar(false)
  }

  // ─── Derived lists ─────────────────────────────────────────────────────────
  const personalPresets   = presets.filter(p => !p.scope || p.scope === 'personal')
  const ownOverallPresets = presets.filter(p => p.scope === 'overall')
  const overallPresets    = [...ownOverallPresets, ...publicPresets]
  const playlistSource    = [...presets, ...publicPresets]
    .filter(preset => preset.scope === 'overall' || isPresetOwner(preset))
    .reduce<MetronomePreset[]>((items, preset) => {
    if (!items.some(existing => existing.id === preset.id)) items.push(preset)
    return items
  }, [])
  const playlistGroups = playlistSource.reduce<Record<string, MetronomePreset[]>>((groups, preset) => {
    const names = (preset.playlistNames && preset.playlistNames.length) ? preset.playlistNames : ['Unassigned']
    names.forEach(name => {
      const key = (name || 'Unassigned').trim() || 'Unassigned'
      if (!groups[key]) groups[key] = []
      groups[key].push(preset)
    })
    return groups
  }, {})
  const playlistNames         = Object.keys(playlistGroups).sort((a, b) => a.localeCompare(b))
  const visiblePlaylistNames  = playlistNames.filter(name => name !== 'Unassigned')
  const combinedPlaylistNames = Array.from(new Set([...visiblePlaylistNames, ...chordlistPlaylists])).sort((a, b) => a.localeCompare(b))
  const personalPlaylistNames = combinedPlaylistNames.filter(name => getPlaylistScope(name) === 'personal')
  const overallPlaylistNames  = combinedPlaylistNames.filter(name => getPlaylistScope(name) === 'overall')
  const playlistPickerExistingNames = canUseOverallPlaylists ? combinedPlaylistNames : personalPlaylistNames
  const scopedPlaylistNames   = playlistScopeTab === 'personal' ? personalPlaylistNames : overallPlaylistNames
  const tabPresets            = activeTab === 'personal' ? personalPresets
    : activeTab === 'overall' ? overallPresets : []
  const normalizedSearch = searchText.trim().toLowerCase()

  const presetMatchesSearch = useCallback((preset: MetronomePreset) => {
    if (!normalizedSearch) return true
    const playlistNameText = (preset.playlistNames || []).join(' ').toLowerCase()
    return [preset.name, `${preset.bpm}`, playlistNameText]
      .some(value => value.toLowerCase().includes(normalizedSearch))
  }, [normalizedSearch])

  const filteredTabPresets = useMemo(() => tabPresets.filter(presetMatchesSearch), [presetMatchesSearch, tabPresets])
  const filteredScopedPlaylistNames = useMemo(() => {
    if (!normalizedSearch) return scopedPlaylistNames

    return scopedPlaylistNames.filter(name => {
      if (name.toLowerCase().includes(normalizedSearch)) return true
      return (playlistGroups[name] || []).some(presetMatchesSearch)
    })
  }, [normalizedSearch, playlistGroups, presetMatchesSearch, scopedPlaylistNames])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* BPM Display */}
        <View style={styles.bpmDisplayContainer}>
          {activePreset && <Text style={styles.activePresetName}>{activePreset.name}</Text>}
          <Text style={styles.bpmLabel}>BPM</Text>
          <Text style={styles.bpmValue}>{bpm}</Text>
        </View>

        {/* BPM Slider */}
        <View style={styles.sliderContainer}>
          <TouchableOpacity style={styles.bpmStepButton} onPress={() => adjustBpm(-1)}>
            <Ionicons name="remove" size={18} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={styles.sliderLabel}>40</Text>
          <Slider
            style={styles.slider}
            minimumValue={40} maximumValue={300} value={bpm}
            onValueChange={(value) => { setBpm(Math.round(value)); setActivePreset(null) }}
            step={1}
            minimumTrackTintColor={COLORS.black}
            maximumTrackTintColor={COLORS.lightGray}
          />
          <Text style={styles.sliderLabel}>300</Text>
          <TouchableOpacity style={styles.bpmStepButton} onPress={() => adjustBpm(1)}>
            <Ionicons name="add" size={18} color={COLORS.black} />
          </TouchableOpacity>
        </View>

        {/* Time Signature Card */}
        <View style={styles.timeSignatureCard}>
          <View style={styles.timeSignatureCardLeft}>
            <Text style={styles.timeSignatureCardTitle}>Time Signatures</Text>
            <Text style={styles.timeSignatureCardSubtitle}>
              {useTimeSignatures
                ? `On · ${selectedTimeSignature.label} · ${selectedTimeSignature.description}`
                : 'Off · steady quarter-note clicks'}
            </Text>
          </View>
          <TouchableOpacity style={styles.timeSignatureCardButton} onPress={() => setShowTimeSignatureModal(true)}>
            <Ionicons name="musical-notes-outline" size={16} color={COLORS.black} />
            <Text style={styles.timeSignatureCardButtonText}>Choose</Text>
          </TouchableOpacity>
        </View>

        {/* Play/Stop Button */}
        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={toggleMetronome}
        >
          <Text style={styles.playButtonText}>{isPlaying ? 'Stop' : 'Start'}</Text>
        </TouchableOpacity>

        {/* Beat Indicator */}
        {isPlaying && (
          <View style={styles.beatIndicator}>
            <View style={[styles.beatDot, beatFlash && styles.beatDotFlash]} />
            <Text style={styles.beatText}>
              {useTimeSignatures ? `${selectedTimeSignature.label} · ${selectedTimeSignature.beatsPerMeasure} beats/measure` : 'Playing'}
            </Text>
          </View>
        )}

        {/* Quick BPM Presets */}
        <View style={styles.presetsContainer}>
          <Text style={styles.presetsLabel}>Quick BPM</Text>
          <View style={styles.presets}>
            {DEFAULT_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetButton, bpm === preset.bpm && !activePreset && styles.presetButtonActive]}
                onPress={() => handleSelectPreset({ ...preset, scope: 'personal', isPublic: false })}
              >
                <Text style={[styles.presetButtonText, bpm === preset.bpm && !activePreset && styles.presetButtonTextActive]}>
                  {preset.bpm}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── My Presets ───────────────────────────────────────────────── */}
        <View style={styles.customPresetsContainer}>
          <View style={styles.customPresetsHeader}>
            <Text style={styles.presetsLabel}>My Presets</Text>
            <View style={styles.headerActions}>
              {(activeTab !== 'overall' || canCreateOverallPreset) && (
                <TouchableOpacity
                  style={styles.addPresetButton}
                  onPress={() => {
                    setEditingPreset(null); setNewPresetName('')
                    setNewPresetScope(activeTab === 'overall' ? 'overall' : 'personal')
                    setNewPresetPlaylistName(''); setNewPresetIsPublic(false)
                    setShowAddModal(true)
                  }}
                >
                  <Ionicons name="add-circle" size={28} color={COLORS.black} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.veryLightGray }}>
            <Ionicons name="search-outline" size={16} color={COLORS.mediumGray} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: COLORS.black, fontWeight: '600', padding: 0 }}
              placeholder={activeTab === 'playlist' ? 'Search playlist names or presets…' : 'Search presets…'}
              placeholderTextColor={COLORS.mediumGray}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.mediumGray} />
              </TouchableOpacity>
            )}
          </View>

          {/* Tab bar */}
          <View style={styles.tabBar}>
            <TouchableOpacity style={[styles.tab, activeTab === 'personal' && styles.tabActive]} onPress={() => setActiveTab('personal')}>
              <Ionicons name="person-outline" size={14} color={activeTab === 'personal' ? COLORS.white : COLORS.mediumGray} />
              <Text style={[styles.tabText, activeTab === 'personal' && styles.tabTextActive]}>Personal</Text>
              {personalPresets.length > 0 && (
                <View style={[styles.tabBadge, activeTab === 'personal' && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, activeTab === 'personal' && styles.tabBadgeTextActive]}>{personalPresets.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab === 'overall' && styles.tabActive]} onPress={() => setActiveTab('overall')}>
              <Ionicons name="globe-outline" size={14} color={activeTab === 'overall' ? COLORS.white : COLORS.mediumGray} />
              <Text style={[styles.tabText, activeTab === 'overall' && styles.tabTextActive]}>Overall</Text>
              {overallPresets.length > 0 && (
                <View style={[styles.tabBadge, activeTab === 'overall' && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, activeTab === 'overall' && styles.tabBadgeTextActive]}>{overallPresets.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab === 'playlist' && styles.tabActive]} onPress={() => setActiveTab('playlist')}>
              <Ionicons name="albums-outline" size={14} color={activeTab === 'playlist' ? COLORS.white : COLORS.mediumGray} />
              <Text style={[styles.tabText, activeTab === 'playlist' && styles.tabTextActive]}>Playlist</Text>
              {combinedPlaylistNames.length > 0 && (
                <View style={[styles.tabBadge, activeTab === 'playlist' && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, activeTab === 'playlist' && styles.tabBadgeTextActive]}>{combinedPlaylistNames.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.tabDescription}>
            {activeTab === 'personal' ? 'Private presets only visible to you.'
              : activeTab === 'overall' ? 'Your presets + public presets from other users. Overall presets are always public.'
              : 'Named playlist groups for your metronome presets.'}
          </Text>

          {/* Playlist tab content */}
          {activeTab === 'playlist' ? (
            <>
              <View style={styles.playlistScopeTabBar}>
                <TouchableOpacity
                  style={[styles.playlistScopeTabButton, playlistScopeTab === 'personal' && styles.playlistScopeTabButtonActive]}
                  onPress={() => setPlaylistScopeTab('personal')}
                >
                  <Ionicons name="person-outline" size={14} color={playlistScopeTab === 'personal' ? COLORS.white : COLORS.mediumGray} />
                  <Text style={[styles.playlistScopeTabButtonText, playlistScopeTab === 'personal' && styles.playlistScopeTabButtonTextActive]}>
                    Personal ({personalPlaylistNames.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.playlistScopeTabButton, playlistScopeTab === 'overall' && styles.playlistScopeTabButtonActive]}
                  onPress={() => setPlaylistScopeTab('overall')}
                >
                  <Ionicons name="globe-outline" size={14} color={playlistScopeTab === 'overall' ? COLORS.white : COLORS.mediumGray} />
                  <Text style={[styles.playlistScopeTabButtonText, playlistScopeTab === 'overall' && styles.playlistScopeTabButtonTextActive]}>
                    Overall ({overallPlaylistNames.length})
                  </Text>
                </TouchableOpacity>
              </View>

{scopedPlaylistNames.length === 0 ? (
  <View style={styles.emptyPlaylistState}>
    <Ionicons name="albums-outline" size={28} color={COLORS.mediumGray} />
    <Text style={styles.emptyPlaylistTitle}>
      {normalizedSearch ? 'No matches found' : `No ${playlistScopeTab} playlists yet`}
    </Text>
    <Text style={styles.emptyPlaylistText}>
      {normalizedSearch
        ? 'Try a different search term.'
        : 'Add a playlist from the button above, or assign a preset to a playlist from its menu.'}
    </Text>
  </View>
) : (
  filteredScopedPlaylistNames.map(name => (
    <View key={name} style={styles.playlistSection}>
      {(() => {
        const nameScope = getPlaylistScope(name)
        return (
          <TouchableOpacity style={styles.playlistAccordionHeader} onPress={() => togglePlaylistAccordion(name)}>
            <View style={styles.playlistAccordionHeaderLeft}>
              <Ionicons name={openPlaylistNames[name] ? 'chevron-down' : 'chevron-forward'} size={16} color={COLORS.mediumGray} />
              <Text style={styles.playlistSectionTitle}>{getPlaylistDisplayName(name)}</Text>
              <View style={[styles.playlistScopeBadge, getPlaylistScope(name) === 'overall' ? styles.playlistScopeBadgeOverall : styles.playlistScopeBadgePersonal]}>
                <Text style={styles.playlistScopeBadgeText}>{getPlaylistScope(name) === 'overall' ? 'Overall' : 'Personal'}</Text>
              </View>
            </View>
            <View style={styles.playlistAccordionHeaderRight}>
              {nameScope === 'overall' && isManagerOrSuperadmin && (
                <View style={styles.playlistHeaderScopeActions}>
                  <TouchableOpacity style={styles.playlistHeaderScopeButton} onPress={(e) => { e.stopPropagation(); handleChangePlaylistScope(name, 'personal') }}>
                    <Ionicons name="person-outline" size={12} color={COLORS.black} />
                  </TouchableOpacity>
                </View>
              )}
              {nameScope === 'personal' && isManagerOrSuperadmin && (
                <View style={styles.playlistHeaderScopeActions}>
                  <TouchableOpacity style={styles.playlistHeaderScopeButton} onPress={(e) => { e.stopPropagation(); handleChangePlaylistScope(name, 'overall') }}>
                    <Ionicons name="globe-outline" size={12} color={COLORS.black} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.playlistAccordionCount}>
                <Text style={styles.playlistAccordionCountText}>{(playlistGroups[name] || []).length}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )
      })()}

      {openPlaylistNames[name] && (
        <View style={styles.playlistAccordionBody}>
          {getOrderedPlaylistGroup(name).map((preset, presetIdx) => {
            const orderedGroup = getOrderedPlaylistGroup(name)
            const isFirst = presetIdx === 0
            const isLast = presetIdx === orderedGroup.length - 1
            return (
              <TouchableOpacity
                key={preset.id}
                style={[styles.playlistPresetCard, activePreset?.id === preset.id && styles.customPresetCardActive]}
                onPress={() => handleSelectPreset(preset)}
              >
                <View style={styles.playlistPresetBody}>
                  <View style={styles.playlistPresetTopRow}>
                    <Text style={[styles.playlistPresetName, activePreset?.id === preset.id && styles.playlistPresetNameActive]} numberOfLines={2}>
                      {preset.name}
                    </Text>
                    <View style={[styles.playlistPresetScopePill, preset.scope === 'overall' ? styles.playlistPresetScopeOverall : styles.playlistPresetScopePersonal]}>
                      <Ionicons name={preset.scope === 'overall' ? 'globe-outline' : 'person-outline'} size={11} color={preset.scope === 'overall' ? COLORS.black : COLORS.mediumGray} />
                      <Text style={styles.playlistPresetScopeText}>{preset.scope === 'overall' ? 'Overall' : 'Personal'}</Text>
                    </View>
                  </View>
                  <View style={styles.playlistPresetMetaRow}>
                    <Text style={[styles.playlistPresetBpm, activePreset?.id === preset.id && styles.playlistPresetBpmActive]}>{preset.bpm} BPM</Text>
                    <View style={[styles.syncBadge, preset.inCloud ? styles.syncBadgeCloud : styles.syncBadgeLocal]}>
                      <Ionicons name={preset.inCloud ? 'cloud-done-outline' : 'phone-portrait-outline'} size={10} color={COLORS.mediumGray} />
                      <Text style={styles.syncBadgeText}>{preset.inCloud ? 'Cloud' : 'Local'}</Text>
                    </View>
                  </View>
                  <View style={styles.playlistPresetFooterRow}>
                    <View style={styles.playlistPresetActionsLeft}>
                      {preset.scope === 'overall' && isManagerOrSuperadmin && (
                        <TouchableOpacity style={styles.scopeInlineButton} onPress={() => handleChangePresetScope(preset, 'personal')}>
                          <Ionicons name="person-outline" size={14} color={COLORS.black} />
                          <Text style={styles.scopeInlineButtonText}>Personal</Text>
                        </TouchableOpacity>
                      )}
                      {preset.scope === 'personal' && isManagerOrSuperadmin && (
                        <TouchableOpacity style={styles.scopeInlineButton} onPress={() => handleChangePresetScope(preset, 'overall')}>
                          <Ionicons name="globe-outline" size={14} color={COLORS.black} />
                          <Text style={styles.scopeInlineButtonText}>Overall</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.customPresetActions}>
                      <View style={styles.reorderBtns}>
                        <TouchableOpacity
                          style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                          onPress={() => handleReorderPlaylistPreset(name, presetIdx, 'up')}
                          disabled={isFirst}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="chevron-up" size={13} color={isFirst ? COLORS.lightGray : COLORS.black} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                          onPress={() => handleReorderPlaylistPreset(name, presetIdx, 'down')}
                          disabled={isLast}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="chevron-down" size={13} color={isLast ? COLORS.lightGray : COLORS.black} />
                        </TouchableOpacity>
                      </View>
                      {/* <TouchableOpacity style={styles.inlineActionButton} onPress={() => openPlaylistPicker(preset, 'assign')}>
                        <Ionicons name="add" size={16} color={COLORS.black} />
                      </TouchableOpacity> */}
                      {/* {canModifyPreset(preset) && (
                        <TouchableOpacity style={styles.inlineActionButton} onPress={() => handleRemovePresetFromPlaylist(preset, name)}>
                          <Ionicons name="remove" size={16} color={COLORS.black} />
                        </TouchableOpacity>
                      )} */}
                      <TouchableOpacity style={styles.menuButton} onPress={() => openPresetMenu(preset)}>
                        <Ionicons name="ellipsis-vertical" size={18} color={COLORS.black} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  ))
)}
            </>
          ) : filteredTabPresets.length === 0 ? (
            <Text style={styles.emptyPresetsText}>
              {normalizedSearch
                ? 'No matches found. Try a different search term.'
                : activeTab === 'personal'
                  ? 'No personal presets yet. Tap + to add one.'
                  : 'No overall presets yet. Tap + to add one.'}
            </Text>
          ) : (
            filteredTabPresets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[styles.customPresetCard, activePreset?.id === preset.id && styles.customPresetCardActive]}
                onPress={() => handleSelectPreset(preset)}
              >
                <View style={styles.customPresetLeft}>
                  <Text style={[styles.customPresetName, activePreset?.id === preset.id && styles.customPresetNameActive]}>
                    {preset.name}
                  </Text>
                  <View style={styles.customPresetMeta}>
                    <Text style={[styles.customPresetBpm, activePreset?.id === preset.id && styles.customPresetBpmActive]}>
                      {preset.bpm} BPM
                    </Text>
                    <View style={[styles.syncBadge, preset.inCloud ? styles.syncBadgeCloud : styles.syncBadgeLocal]}>
                      <Ionicons name={preset.inCloud ? 'cloud-done-outline' : 'phone-portrait-outline'} size={10} color={COLORS.mediumGray} />
                      <Text style={styles.syncBadgeText}>{preset.inCloud ? 'Cloud' : 'Local'}</Text>
                    </View>
                    {preset.scope === 'overall' && (
                      <View style={[styles.syncBadge, styles.publicBadge]}>
                        <Ionicons name="eye-outline" size={10} color={COLORS.darkGray} />
                        <Text style={[styles.syncBadgeText, styles.syncBadgeTextPublic]}>Public</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.customPresetActions}>
                  {activeTab === 'personal' && preset.scope === 'personal' && isManagerOrSuperadmin && (
                    <TouchableOpacity style={styles.scopeInlineButton} onPress={() => handleChangePresetScope(preset, 'overall')}>
                      <Ionicons name="globe-outline" size={14} color={COLORS.black} />
                      <Text style={styles.scopeInlineButtonText}>Overall</Text>
                    </TouchableOpacity>
                  )}
                  {activeTab === 'overall' && preset.scope === 'overall' && (
                    <TouchableOpacity style={styles.scopeInlineButton} onPress={() => handleChangePresetScope(preset, 'personal')}>
                      <Ionicons name="person-outline" size={14} color={COLORS.black} />
                      <Text style={styles.scopeInlineButtonText}>Personal</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.menuButton} onPress={() => openPresetMenu(preset)}>
                    <Ionicons name="ellipsis-vertical" size={18} color={COLORS.black} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* ── Modals ─────────────────────────────────────────────────────────── */}

        {/* Preset Menu */}
        <Modal visible={showPresetMenu} transparent animationType="fade" onRequestClose={closePresetMenu}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={closePresetMenu}>
            <View style={styles.menuSheet}>
              <Text style={styles.menuTitle}>{menuPreset?.name}</Text>
              {menuPreset && canModifyPreset(menuPreset) && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { if (menuPreset) handleEditPresetPress(menuPreset); closePresetMenu() }}>
                  <Ionicons name="pencil-outline" size={18} color={COLORS.black} />
                  <Text style={styles.menuItemText}>Edit</Text>
                </TouchableOpacity>
              )}
              {menuPreset && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { const p = menuPreset; closePresetMenu(); openPlaylistPicker(p, 'assign') }}>
                  <Ionicons name="albums-outline" size={18} color={COLORS.black} />
                  <Text style={styles.menuItemText}>Add to Playlist</Text>
                </TouchableOpacity>
              )}
              {menuPreset && !menuPreset.inCloud && !menuPreset.isOwnedByOther && canModifyPreset(menuPreset) && (
                <TouchableOpacity style={styles.menuItem} onPress={async () => { const p = menuPreset; closePresetMenu(); await handleUploadPresetToCloud(p) }}>
                  <Ionicons name="cloud-upload-outline" size={18} color={COLORS.black} />
                  <Text style={styles.menuItemText}>Upload to Cloud</Text>
                </TouchableOpacity>
              )}
              {menuPreset && canModifyPreset(menuPreset) && (
                <TouchableOpacity style={styles.menuItemDestructive} onPress={() => { const p = menuPreset; closePresetMenu(); handleDeletePresetFromMenu(p) }}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.mediumGray} />
                  <Text style={styles.menuItemTextDestructive}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Playlist Picker */}
        <Modal visible={showPlaylistPicker} transparent animationType="slide" onRequestClose={closePlaylistPicker}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Add to Playlist</Text>
              <Text style={styles.modalSubtitle}>
                {playlistPickerMode === 'field' ? 'Pick a playlist name for this preset.' : 'Choose a playlist to assign this preset to.'}
              </Text>
              {combinedPlaylistNames.length > 0 && (
                <View style={styles.playlistChoiceList}>
                  <Text style={styles.modalFieldLabel}>{canUseOverallPlaylists ? 'Existing playlists' : 'Existing personal playlists'}</Text>
                  <ScrollView style={styles.playlistChoiceScroll}>
                    {playlistPickerExistingNames.map(name => {
                      const selected = playlistPickerNames.includes(name)
                      return (
                        <TouchableOpacity
                          key={name}
                          style={[styles.playlistChoiceItem, selected && { backgroundColor: COLORS.veryLightGray }]}
                          onPress={() => setPlaylistPickerNames(prev => {
                            const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name)
                            return Array.from(next)
                          })}
                        >
                          <Ionicons name={selected ? 'checkmark-circle' : 'bookmark-outline'} size={16} color={COLORS.black} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={styles.playlistChoiceText}>{getPlaylistDisplayName(name)}</Text>
                              <View style={[styles.playlistScopeBadge, getPlaylistScope(name) === 'overall' ? styles.playlistScopeBadgeOverall : styles.playlistScopeBadgePersonal]}>
                                <Text style={styles.playlistScopeBadgeText}>{getPlaylistScope(name) === 'overall' ? 'Overall' : 'Personal'}</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                </View>
              )}
              <Text style={styles.modalFieldLabel}>Or create a new playlist</Text>
              <Text style={styles.modalFieldLabel}>Playlist type</Text>
              <View style={styles.scopePicker}>
                <TouchableOpacity style={[styles.scopeOption, playlistPickerScope === 'personal' && styles.scopeOptionActive]} onPress={() => setPlaylistPickerScope('personal')}>
                  <Ionicons name="person-outline" size={16} color={playlistPickerScope === 'personal' ? COLORS.white : COLORS.darkGray} />
                  <Text style={[styles.scopeOptionText, playlistPickerScope === 'personal' && styles.scopeOptionTextActive]}>Personal</Text>
                </TouchableOpacity>
                {canUseOverallPlaylists && (
                  <TouchableOpacity style={[styles.scopeOption, playlistPickerScope === 'overall' && styles.scopeOptionActive]} onPress={() => setPlaylistPickerScope('overall')}>
                    <Ionicons name="globe-outline" size={16} color={playlistPickerScope === 'overall' ? COLORS.white : COLORS.darkGray} />
                    <Text style={[styles.scopeOptionText, playlistPickerScope === 'overall' && styles.scopeOptionTextActive]}>Overall</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder={playlistPickerScope === 'overall' ? 'New overall playlist name' : 'New personal playlist name'}
                placeholderTextColor={COLORS.mediumGray}
                value={playlistPickerName} onChangeText={setPlaylistPickerName}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closePlaylistPicker}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSavePlaylistFromPicker}>
                  <Text style={styles.saveButtonText}>{playlistPickerMode === 'field' ? 'Use Playlist' : 'Save Playlist'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Time Signature Modal */}
        <Modal visible={showTimeSignatureModal} transparent animationType="slide" onRequestClose={() => setShowTimeSignatureModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Time Signatures</Text>
              <Text style={styles.modalSubtitle}>
                Accent the downbeat and sub-group beats. Changes take effect immediately.
              </Text>

              <View style={styles.timeSignatureSwitchRow}>
                <View style={styles.timeSignatureSwitchLeft}>
                  <Text style={styles.modalFieldLabel}>Use time signatures</Text>
                  <Text style={styles.timeSignatureHint}>When off, every beat sounds the same (quarter-note pulse).</Text>
                </View>
                <Switch
                  value={useTimeSignatures}
                  onValueChange={setUseTimeSignatures}
                  trackColor={{ false: COLORS.lightGray, true: COLORS.black }}
                  thumbColor={COLORS.white}
                />
              </View>

              {/* Legend */}
              <View style={styles.timeSignatureLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.black }]} />
                  <Text style={styles.legendText}>Strong (beat 1)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.mediumGray }]} />
                  <Text style={styles.legendText}>Medium (sub-group)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.lightGray }]} />
                  <Text style={styles.legendText}>Weak</Text>
                </View>
              </View>

              <Text style={styles.modalFieldLabel}>Choose a signature</Text>
              <ScrollView style={styles.timeSignatureScroll} contentContainerStyle={styles.timeSignatureGrid}>
                {TIME_SIGNATURE_OPTIONS.map(option => {
                  const selected = selectedTimeSignature.label === option.label
                  // Build a mini accent-dot display
                  const accentPat = buildAccentPattern(option)
                  return (
                    <TouchableOpacity
                      key={option.label}
                      style={[styles.timeSignatureChoice, selected && styles.timeSignatureChoiceActive]}
                      onPress={() => { setSelectedTimeSignature(option); setUseTimeSignatures(true) }}
                    >
                      <View style={styles.timeSignatureChoiceHeader}>
                        <Text style={[styles.timeSignatureChoiceText, selected && styles.timeSignatureChoiceTextActive]}>
                          {option.label}
                        </Text>
                        <View style={[styles.meterTypeBadge,
                          option.meterType === 'compound' ? styles.meterTypeBadgeCompound
                          : option.meterType === 'asymmetric' ? styles.meterTypeBadgeAsymmetric
                          : styles.meterTypeBadgeSimple
                        ]}>
                          <Text style={styles.meterTypeBadgeText}>
                            {option.meterType === 'compound' ? 'Compound'
                              : option.meterType === 'asymmetric' ? 'Asymmetric'
                              : 'Simple'}
                          </Text>
                        </View>
                      </View>
                      {/* Accent pattern dots */}
                      <View style={styles.accentDots}>
                        {accentPat.map((level, i) => (
                          <View key={i} style={[
                            styles.accentDot,
                            level === 2 ? styles.accentDotStrong
                            : level === 1 ? styles.accentDotMedium
                            : styles.accentDotWeak,
                            selected && level === 2 && styles.accentDotStrongActive,
                            selected && level === 1 && styles.accentDotMediumActive,
                            selected && level === 0 && styles.accentDotWeakActive,
                          ]} />
                        ))}
                      </View>
                      <Text style={[styles.timeSignatureChoiceBeats, selected && styles.timeSignatureChoiceBeatsActive]}>
                        {option.description}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowTimeSignatureModal(false)}>
                  <Text style={styles.cancelButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Add/Edit Preset Modal */}
        <Modal visible={showAddModal || showEditModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editingPreset ? 'Edit Preset' : 'Save Preset'}</Text>
              <Text style={styles.modalSubtitle}>Current BPM: {bpm}</Text>
              <View style={styles.modalBpmRow}>
                <Text style={styles.modalBpmLabel}>Edit BPM: <Text style={styles.modalBpmValue}>{bpm}</Text></Text>
                <Slider
                  style={styles.modalSlider}
                  minimumValue={40} maximumValue={300} step={1} value={bpm}
                  onValueChange={(value) => setBpm(Math.round(value))}
                  minimumTrackTintColor={COLORS.black} maximumTrackTintColor={COLORS.lightGray}
                />
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Preset name (e.g. How Great Is Our God)"
                placeholderTextColor={COLORS.mediumGray}
                value={newPresetName} onChangeText={setNewPresetName} autoFocus
              />
              <View style={styles.timeSignatureCard}>
                <View style={styles.timeSignatureCardLeft}>
                  <Text style={styles.timeSignatureCardTitle}>Time Signatures</Text>
                  <Text style={styles.timeSignatureCardSubtitle}>
                    {useTimeSignatures
                      ? `On · ${selectedTimeSignature.label} · ${selectedTimeSignature.description}`
                      : 'Off · steady quarter-note clicks'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Switch
                    value={useTimeSignatures}
                    onValueChange={setUseTimeSignatures}
                    trackColor={{ false: COLORS.lightGray, true: COLORS.black }}
                    thumbColor={COLORS.white}
                  />
                  <TouchableOpacity style={styles.timeSignatureCardButton} onPress={() => setShowTimeSignatureModal(true)}>
                    <Ionicons name="musical-notes-outline" size={16} color={COLORS.black} />
                    <Text style={styles.timeSignatureCardButtonText}>Choose</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.modalFieldLabel}>Playlist</Text>
              <TouchableOpacity style={styles.playlistPickerButton} onPress={() => openPlaylistPicker(editingPreset ?? null, 'field')}>
                <Ionicons name="albums-outline" size={18} color={COLORS.black} />
                <Text style={styles.playlistPickerButtonText}>
                  {newPresetPlaylistName.trim() ? newPresetPlaylistName.trim() : 'Add to Playlist'}
                </Text>
              </TouchableOpacity>
              {!!newPresetPlaylistName.trim() && (
                <TouchableOpacity onPress={() => setNewPresetPlaylistName('')} style={styles.clearPlaylistButton}>
                  <Text style={styles.clearPlaylistButtonText}>Clear playlist</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.modalHint}>Presets are saved locally first. You can upload to cloud after saving.</Text>
              <View style={styles.modalButtons}>
                {editingPreset && (
                  <TouchableOpacity
                    style={[styles.modalButton, styles.deleteButton]}
                    onPress={() => { const p = editingPreset; setShowEditModal(false); setEditingPreset(null); handleDeletePreset(p) }}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => { setShowAddModal(false); setShowEditModal(false); setEditingPreset(null) }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={editingPreset ? handleSavePresetEdit : handleAddPreset}
                >
                  <Text style={styles.saveButtonText}>{editingPreset ? 'Save Changes' : 'Save Locally'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.offWhite },
  content: { padding: 20, paddingBottom: 40 },

  bpmDisplayContainer: { alignItems: 'center', marginBottom: 24, paddingVertical: 16 },
  activePresetName: { fontSize: 14, color: COLORS.mediumGray, fontWeight: '700', marginBottom: 6, letterSpacing: 0.3 },
  bpmLabel: { fontSize: 16, color: COLORS.mediumGray, marginBottom: 8, fontWeight: '600', letterSpacing: 0.4 },
  bpmValue: { fontSize: 76, fontWeight: '800', color: COLORS.black },

  sliderContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  slider: { flex: 1, marginHorizontal: 15, height: 40 },
  sliderLabel: { fontSize: 12, color: COLORS.mediumGray, width: 30, textAlign: 'center', fontWeight: '600' },
  bpmStepButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.lightGray },

  timeSignatureCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.veryLightGray, marginBottom: 22 },
  timeSignatureCardLeft: { flex: 1 },
  timeSignatureCardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.black, marginBottom: 4 },
  timeSignatureCardSubtitle: { fontSize: 12, color: COLORS.mediumGray, fontWeight: '500' },
  timeSignatureCardButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.veryLightGray, borderWidth: 1, borderColor: COLORS.lightGray },
  timeSignatureCardButtonText: { fontSize: 13, fontWeight: '800', color: COLORS.black },

  playButton: { backgroundColor: COLORS.black, paddingVertical: 22, borderRadius: 8, alignItems: 'center', marginBottom: 24, elevation: 3, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4 },
  playButtonActive: { backgroundColor: COLORS.darkGray },
  playButtonText: { fontSize: 26, fontWeight: '800', color: COLORS.white, letterSpacing: 0.5 },

  beatIndicator: { alignItems: 'center', marginBottom: 24 },
  beatDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.black, marginBottom: 12, elevation: 2, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 2 },
  beatDotFlash: { backgroundColor: COLORS.mediumGray },
  beatText: { fontSize: 15, color: COLORS.darkGray, fontWeight: '700', letterSpacing: 0.3 },

  presetsContainer: { alignItems: 'center', marginBottom: 32 },
  presetsLabel: { fontSize: 16, fontWeight: '800', color: COLORS.black, marginBottom: 14, letterSpacing: 0.3 },
  presets: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', gap: 8 },
  presetButton: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.darkGray, backgroundColor: COLORS.white, elevation: 1, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  presetButtonActive: { backgroundColor: COLORS.black, borderColor: COLORS.black },
  presetButtonText: { fontSize: 14, fontWeight: '700', color: COLORS.black },
  presetButtonTextActive: { color: COLORS.white },

  customPresetsContainer: { marginBottom: 20 },
  customPresetsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addPresetButton: { padding: 6 },
  addPlaylistButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORS.veryLightGray, borderWidth: 1, borderColor: COLORS.lightGray },
  addPlaylistButtonText: { fontSize: 12, fontWeight: '800', color: COLORS.black },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.veryLightGray },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.black, fontWeight: '600', padding: 0 },

  tabBar: { flexDirection: 'row', backgroundColor: COLORS.veryLightGray, borderRadius: 8, padding: 3, marginBottom: 8, gap: 3, flexWrap: 'wrap' },
  tab: { flexGrow: 1, flexBasis: '30%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 6, gap: 5 },
  tabActive: { backgroundColor: COLORS.black, elevation: 2, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2 },
  tabText: { fontSize: 13, fontWeight: '700', color: COLORS.mediumGray, letterSpacing: 0.2 },
  tabTextActive: { color: COLORS.white },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.lightGray, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeActive: { backgroundColor: COLORS.mediumGray },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.mediumGray },
  tabBadgeTextActive: { color: COLORS.white },
  tabDescription: { fontSize: 12, color: COLORS.mediumGray, fontWeight: '500', marginBottom: 14, fontStyle: 'italic' },

  playlistScopeTabBar: { flexDirection: 'row', backgroundColor: COLORS.veryLightGray, borderRadius: 8, padding: 3, marginBottom: 12, gap: 3 },
  playlistScopeTabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 6 },
  playlistScopeTabButtonActive: { backgroundColor: COLORS.black },
  playlistScopeTabButtonText: { fontSize: 12, fontWeight: '700', color: COLORS.mediumGray },
  playlistScopeTabButtonTextActive: { color: COLORS.white },

  emptyPresetsText: { color: COLORS.mediumGray, fontSize: 14, textAlign: 'center', paddingVertical: 22, fontWeight: '500' },
  emptyPlaylistState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: COLORS.veryLightGray, backgroundColor: COLORS.white, gap: 10 },
  emptyPlaylistTitle: { fontSize: 16, fontWeight: '800', color: COLORS.black },
  emptyPlaylistText: { fontSize: 13, lineHeight: 19, color: COLORS.mediumGray, textAlign: 'center', fontWeight: '500' },
  emptyPlaylistButton: { marginTop: 6, backgroundColor: COLORS.black, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  emptyPlaylistButtonText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },

  playlistSection: { marginBottom: 14 },
  playlistAccordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4 },
  playlistAccordionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  playlistAccordionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playlistHeaderScopeActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playlistHeaderScopeButton: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.lightGray, backgroundColor: COLORS.offWhite },
  playlistAccordionCount: { minWidth: 24, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: COLORS.veryLightGray, alignItems: 'center', justifyContent: 'center' },
  playlistAccordionCountText: { fontSize: 11, fontWeight: '800', color: COLORS.mediumGray },
  playlistAccordionBody: { paddingLeft: 10 },
  playlistSectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: COLORS.mediumGray, textTransform: 'uppercase', marginBottom: 8 },
  playlistScopeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  playlistScopeBadgePersonal: { backgroundColor: COLORS.veryLightGray, borderColor: COLORS.lightGray },
  playlistScopeBadgeOverall: { backgroundColor: '#eef5ff', borderColor: '#c7d9ff' },
  playlistScopeBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.mediumGray, letterSpacing: 0.2 },

  customPresetCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 8, padding: 16, marginBottom: 11, borderWidth: 1.5, borderColor: COLORS.veryLightGray, elevation: 1, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  customPresetCardActive: { backgroundColor: COLORS.offWhite, borderColor: COLORS.black, borderWidth: 2 },
  customPresetLeft: { flex: 1 },
  customPresetName: { fontSize: 15, fontWeight: '700', color: COLORS.black, marginBottom: 5 },
  customPresetNameActive: { color: COLORS.black, fontWeight: '800' },
  customPresetMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  customPresetBpm: { fontSize: 13, color: COLORS.mediumGray, fontWeight: '600' },
  customPresetBpmActive: { color: COLORS.darkGray },

  reorderBtns: { flexDirection: 'column', gap: 2 },
reorderBtn: {
  width: 24, height: 24, borderRadius: 6,
  backgroundColor: COLORS.veryLightGray,
  borderWidth: 1, borderColor: COLORS.lightGray,
  justifyContent: 'center', alignItems: 'center',
},
reorderBtnDisabled: { opacity: 0.35 },

  playlistPresetCard: { backgroundColor: COLORS.white, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: COLORS.veryLightGray, elevation: 1, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  playlistPresetBody: { gap: 10 },
  playlistPresetTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  playlistPresetName: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '800', color: COLORS.black },
  playlistPresetNameActive: { color: COLORS.black },
  playlistPresetScopePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  playlistPresetScopePersonal: { backgroundColor: COLORS.veryLightGray, borderColor: COLORS.lightGray },
  playlistPresetScopeOverall: { backgroundColor: '#eef5ff', borderColor: '#c7d9ff' },
  playlistPresetScopeText: { fontSize: 10, fontWeight: '800', color: COLORS.mediumGray },
  playlistPresetMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  playlistPresetBpm: { fontSize: 13, fontWeight: '700', color: COLORS.darkGray },
  playlistPresetBpmActive: { color: COLORS.black },
  playlistPresetFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  playlistPresetActionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 1 },

  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  syncBadgeCloud: { backgroundColor: COLORS.offWhite, borderColor: COLORS.lightGray },
  syncBadgeLocal: { backgroundColor: COLORS.veryLightGray, borderColor: COLORS.lightGray },
  publicBadge: { backgroundColor: '#f0f8f0', borderColor: '#c8e6c9' },
  syncBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.mediumGray },
  syncBadgeTextPublic: { color: '#388e3c' },

  customPresetActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scopeInlineButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: COLORS.offWhite, borderWidth: 1, borderColor: COLORS.lightGray },
  scopeInlineButtonText: { fontSize: 11, fontWeight: '800', color: COLORS.black },
  inlineActionButton: { padding: 9, borderRadius: 6, backgroundColor: COLORS.veryLightGray, borderWidth: 1, borderColor: COLORS.lightGray },
  menuButton: { padding: 9, borderRadius: 6, backgroundColor: COLORS.offWhite, borderWidth: 1, borderColor: COLORS.veryLightGray },

  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  menuSheet: { backgroundColor: COLORS.white, padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  menuTitle: { fontSize: 16, fontWeight: '800', color: COLORS.black, marginBottom: 14 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  menuItemDestructive: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, marginTop: 4 },
  menuItemText: { fontSize: 15, fontWeight: '700', color: COLORS.black },
  menuItemTextDestructive: { fontSize: 15, fontWeight: '700', color: COLORS.mediumGray },

  playlistPickerButton: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: COLORS.lightGray, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 13, backgroundColor: COLORS.offWhite, marginBottom: 8 },
  playlistPickerButtonText: { fontSize: 14, fontWeight: '700', color: COLORS.black },
  clearPlaylistButton: { alignSelf: 'flex-start', marginBottom: 14 },
  clearPlaylistButtonText: { fontSize: 12, color: COLORS.mediumGray, fontWeight: '700' },
  playlistChoiceList: { marginBottom: 12 },
  playlistChoiceScroll: { maxHeight: 160, borderWidth: 1, borderColor: COLORS.veryLightGray, borderRadius: 8, backgroundColor: COLORS.offWhite },
  playlistChoiceItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.veryLightGray },
  playlistChoiceText: { fontSize: 14, fontWeight: '700', color: COLORS.black },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.white, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 26 },
  modalTitle: { fontSize: 21, fontWeight: '800', color: COLORS.black, marginBottom: 6, letterSpacing: 0.3 },
  modalSubtitle: { fontSize: 14, color: COLORS.mediumGray, fontWeight: '700', marginBottom: 22 },
  modalInput: { borderWidth: 1.5, borderColor: COLORS.lightGray, borderRadius: 8, padding: 13, fontSize: 15, color: COLORS.black, marginBottom: 18, backgroundColor: COLORS.offWhite, fontWeight: '500' },
  modalFieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.darkGray, marginBottom: 8, letterSpacing: 0.2 },
  modalHint: { fontSize: 12, color: COLORS.mediumGray, marginBottom: 22, fontStyle: 'italic', fontWeight: '500' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 15, borderRadius: 8, alignItems: 'center', elevation: 2, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  cancelButton: { backgroundColor: COLORS.veryLightGray },
  cancelButtonText: { color: COLORS.black, fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
  saveButton: { backgroundColor: COLORS.black },
  saveButtonText: { color: COLORS.white, fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
  deleteButton: { backgroundColor: COLORS.veryLightGray, borderColor: COLORS.lightGray },
  deleteButtonText: { color: COLORS.mediumGray, fontWeight: '800' },

  modalBpmRow: { marginBottom: 14 },
  modalBpmLabel: { fontSize: 13, color: COLORS.darkGray, fontWeight: '700', marginBottom: 8 },
  modalBpmValue: { fontSize: 13, color: COLORS.black, fontWeight: '900' },
  modalSlider: { width: '100%', height: 40 },

  timeSignatureSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, paddingVertical: 10 },
  timeSignatureSwitchLeft: { flex: 1 },
  timeSignatureHint: { fontSize: 12, color: COLORS.mediumGray, fontWeight: '500' },

  // Legend
  timeSignatureLegend: { flexDirection: 'row', gap: 16, marginBottom: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: COLORS.mediumGray, fontWeight: '600' },

  timeSignatureScroll: { maxHeight: 320 },
  timeSignatureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 10 },

  timeSignatureChoice: { width: '48%', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.lightGray, backgroundColor: COLORS.offWhite },
  timeSignatureChoiceActive: { backgroundColor: COLORS.black, borderColor: COLORS.black },
  timeSignatureChoiceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  timeSignatureChoiceText: { fontSize: 18, fontWeight: '800', color: COLORS.black },
  timeSignatureChoiceTextActive: { color: COLORS.white },
  timeSignatureChoiceBeats: { fontSize: 10, fontWeight: '600', color: COLORS.mediumGray, marginTop: 6 },
  timeSignatureChoiceBeatsActive: { color: COLORS.lightGray },

  // Meter type badge inside time sig card
  meterTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  meterTypeBadgeSimple: { backgroundColor: '#e8f5e9' },
  meterTypeBadgeCompound: { backgroundColor: '#e3f2fd' },
  meterTypeBadgeAsymmetric: { backgroundColor: '#fff3e0' },
  meterTypeBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.darkGray },

  // Accent dot row in time sig choice
  accentDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  accentDotStrong: { backgroundColor: COLORS.black },
  accentDotMedium: { backgroundColor: COLORS.mediumGray },
  accentDotWeak: { backgroundColor: COLORS.lightGray },
  accentDotStrongActive: { backgroundColor: COLORS.white },
  accentDotMediumActive: { backgroundColor: COLORS.lightGray },
  accentDotWeakActive: { backgroundColor: COLORS.darkGray },

  scopePicker: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  scopeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.lightGray, backgroundColor: COLORS.offWhite },
  scopeOptionActive: { backgroundColor: COLORS.black, borderColor: COLORS.black },
  scopeOptionText: { fontSize: 14, fontWeight: '700', color: COLORS.darkGray },
  scopeOptionTextActive: { color: COLORS.white },
})