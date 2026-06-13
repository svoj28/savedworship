// screens/ChordListScreen.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  StatusBar,
  Linking,
  Animated,
  RefreshControl,
} from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { useFocusEffect } from '@react-navigation/native'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as Clipboard from 'expo-clipboard'
import { Song, ChordList, Playlist, PlaylistItem } from '../db/models'
import { transposeText, getAllKeys, getTransposeDistance, hasNashville, transposeTextToNashville } from '../lib/transpose'
import { execute, query } from '../db/index'
import { subscribeToChanges } from '../lib/sync'  
import {
  getPlaylistsByUserId,
  getPlaylistItems,
  updatePlaylistItemPosition,
  getChordListById,
  getSongsByChordListId,
  removeFromPlaylist,
  deleteSong,
  deleteChordListRecord,
} from '../db/queries'
import { getCurrentUser } from '../lib/auth'
import { useRole } from '../lib/useRole'
import { supabase } from '../lib/supabase'
import { onTableChange } from '../lib/sync'
import YoutubePlayer from 'react-native-youtube-iframe'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { isChordListPublic } from '../lib/chordListPrivacy'

interface Props {
  route: any
  navigation: any
}

type ViewMode  = 'lyrics' | 'chords' | 'both'
type NotationMode = 'chords' | 'nashville'
type BrowseMode = 'single' | 'artist' | 'playlist'
type SongTab   = 'sheet' | 'video'

function extractYouTubeId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

const SECTION_HEADER_LINE_PATTERN = /^(intro|verse|chorus|bridge|pre[-\s]?chorus|hook|outro|coda)(?:\s*[0-9]+)?$/i

function isSectionHeaderLine(line: string): boolean {
  return SECTION_HEADER_LINE_PATTERN.test(line.trim())
}

type SongSection = {
  id: string
  label: string
  content: string
}

function normalizeSectionLabel(rawLabel: string, fallbackIndex: number) {
  const cleaned = rawLabel.trim()
  const match = cleaned.match(/^(intro|verse|chorus|bridge|pre[-\s]?chorus|hook|outro|coda)\s*([0-9]+)?$/i)
  if (!match) return cleaned || `Section ${fallbackIndex + 1}`
  const base = match[1].replace(/[-\s]/g, ' ')
  const number = match[2] ? ` ${match[2]}` : ''
  return `${base.charAt(0).toUpperCase()}${base.slice(1).toLowerCase()}${number}`
}

function parseSongSections(content: string): SongSection[] {
  const lines = content.split(/\r?\n/)
  const sections: SongSection[] = []
  let currentLabel = 'Full Song'
  let currentLines: string[] = []
  let foundAnyHeader = false

  const flush = (label: string) => {
    const body = currentLines.join('\n').trim()
    if (body) {
      sections.push({
        id: `${sections.length}-${label.toLowerCase().replace(/\s+/g, '-')}`,
        label,
        content: body,
      })
    }
    currentLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (isSectionHeaderLine(trimmed)) {
      const label = normalizeSectionLabel(trimmed, sections.length)
      if (currentLines.length > 0 || sections.length === 0) flush(currentLabel)
      currentLabel = label
      foundAnyHeader = true
      continue
    }
    currentLines.push(line)
  }

  flush(currentLabel)
  if (!foundAnyHeader) {
    return [{ id: 'full-song', label: 'Full Song', content: content.trim() }]
  }
  return sections.length > 0
    ? sections
    : [{ id: 'full-song', label: 'Full Song', content: content.trim() }]
}

/**
 * For 'chords' mode:
 * - Only keep lines that contain at least one [chord]
 * - Strip the [] brackets so only the chord name shows
 * - Remove any remaining non-chord text on that line
 *   (i.e. extract ONLY the chord tokens, space-separated)
 */
function extractChordsOnlyFromContent(content: string): string {
  const lines = content.split(/\r?\n/)
  const chordLines: string[] = []

  for (const line of lines) {
    const matches = [...line.matchAll(/\[([^\]]+)\]/g)]
    if (matches.length > 0) {
      // Only emit the chord names, no surrounding lyric text
      chordLines.push(matches.map(m => m[1].replace(/\/[A-G][#b]?$/, '')).join('  '))
    }
    // Lines with no [chord] tokens are silently dropped
  }

  return chordLines.join('\n')
}

function renderSongLines(content: string, mode: ViewMode) {
  const lines = content.split(/\r?\n/)
  const rendered: React.ReactNode[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const trimmed = rawLine.trim()

    if (!trimmed) {
      rendered.push(<View key={`blank-${index}`} style={styles.lineWrap} />)
      continue
    }

    if (isSectionHeaderLine(trimmed)) {
      rendered.push(
        <View key={`section-${index}`} style={styles.lineWrap}>
          <Text style={styles.sectionLine}>{trimmed}</Text>
        </View>
      )
      continue
    }

    let lineToRender = rawLine
    if (mode === 'lyrics') {
      lineToRender = rawLine.replace(/\[([^\]]+)\]/g, '').trim()
    } else if (mode === 'chords') {
  if (!/\[[^\]]+\]/.test(rawLine)) continue
  // Extract chord tokens and preserve slash between adjacent [X]/[Y] patterns
  lineToRender = rawLine
    .replace(/\[([^\]]+)\]\s*\/\s*\[([^\]]+)\]/g, '$1/$2') // [D]/[F#] → D/F#
    .replace(/\[([^\]]+)\]/g, '$1')                          // remaining [X] → X
    .replace(/[^A-G#b/\d°ø+\s]/g, '')                       // strip lyric chars
    .replace(/\s+/g, '  ')
    .trim()
  if (!lineToRender) continue
}else if (mode === 'both') {
      lineToRender = rawLine.replace(/\[([^\]]+)\]/g, '$1').trim()
    }

    if (lineToRender.trim()) {
      rendered.push(
        <View key={`line-${index}`} style={styles.lineWrap}>
          <Text style={styles.contentLine}>{lineToRender}</Text>
        </View>
      )
    }
  }

  return rendered
}

interface BrowseItem {
  id: string
  title: string
  type: 'song' | 'chord_list'
  chordListId?: string
  songId?: string
  position?: number
}

const SCROLL_SPEEDS = [
  { label: 'Slow', value: 20 },
  { label: 'Med',  value: 45 },
  { label: 'Fast', value: 80 },
]

export default function ChordListScreen({ route, navigation }: Props) {
  const { chordListId } = route.params
  const [chordList, setChordList]               = useState<any>(null)
  const [songs, setSongs]                       = useState<Song[]>([])
  const [selectedSongId, setSelectedSongId]     = useState<string | null>(null)
  const [viewMode, setViewMode]                 = useState<ViewMode>('both')
  const [notationMode, setNotationMode]         = useState<NotationMode>('chords')
  const [transposeToKey, setTransposeToKey]     = useState<string>('C')
  const [loading, setLoading]                   = useState(true)
  const { canManageChords }                     = useRole()
  const [browseMode, setBrowseMode]             = useState<BrowseMode>('single')
  const [browseItems, setBrowseItems]           = useState<BrowseItem[]>([])
  const [currentItemIndex, setCurrentItemIndex] = useState(0)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [playlists, setPlaylists]               = useState<Playlist[]>([])
  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [artistId, setArtistId]                 = useState<string | null>(null)
  const [showTransposePicker, setShowTransposePicker] = useState(false)
  const [activeSongTab, setActiveSongTab]       = useState<SongTab>('sheet')
  const [showOptionsModal, setShowOptionsModal] = useState(false)
  const hasLoadedOnceRef = useRef(false)

  const contentScrollRef      = useRef<ScrollView | null>(null)

  const [isAutoScrolling, setIsAutoScrolling]   = useState(false)
  const [scrollSpeedIndex, setScrollSpeedIndex] = useState(0)
  const autoScrollRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollYRef          = useRef(0)
  const contentHeightRef    = useRef(0)
  const scrollViewHeightRef = useRef(0)
  const scrollFadeAnim      = useRef(new Animated.Value(0)).current

  // Keep a ref to the latest browseItems/currentItemIndex for use inside interval
  const browseItemsRef      = useRef<BrowseItem[]>([])
  const currentItemIndexRef = useRef(0)
  browseItemsRef.current      = browseItems
  currentItemIndexRef.current = currentItemIndex
  const selectedSongIdRef = useRef<string | null>(null)

  useEffect(() => { selectedSongIdRef.current = selectedSongId }, [selectedSongId])

  useEffect(() => {
  // Local invalidation listener — fires after sync writes to SQLite
  const u1 = onTableChange('chord_lists',    () => void loadChordList({ silent: true }))
  const u2 = onTableChange('songs',          () => void loadChordList({ silent: true }))
  const u3 = onTableChange('playlists',      () => void loadChordList({ silent: true }))
  const u4 = onTableChange('playlist_items', () => void loadChordList({ silent: true }))

  // Realtime subscription — triggers sync which then fires invalidateTable above
  let unsub: (() => void) | null = null
  getCurrentUser().then(user => {
    if (user) unsub = subscribeToChanges(user.id, () => {})
  })

  return () => {
    u1(); u2(); u3(); u4()
    unsub?.()
  }
}, [chordListId])

  useEffect(() => {
    navigation.setOptions({ headerLeft: () => null })
  }, [navigation])

  useFocusEffect(
    React.useCallback(() => { void loadChordList({ silent: hasLoadedOnceRef.current }) }, [chordListId])
  )

  useEffect(() => { stopAutoScroll() }, [selectedSongId, viewMode, notationMode, transposeToKey])

  // ── Auto-scroll ────────────────────────────────────────────────────────
  const startAutoScroll = useCallback(() => {
    if (autoScrollRef.current) clearInterval(autoScrollRef.current)
    setIsAutoScrolling(true)
    Animated.timing(scrollFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    const speed = SCROLL_SPEEDS[scrollSpeedIndex].value
    const interval = 16
    const pixelsPerTick = (speed * interval) / 1000
    autoScrollRef.current = setInterval(() => {
      const maxScroll = contentHeightRef.current - scrollViewHeightRef.current
      if (scrollYRef.current >= maxScroll - 1) {
        // ── AUTO-ADVANCE to next song when scroll reaches bottom ──
        const items   = browseItemsRef.current
        const curIdx  = currentItemIndexRef.current
          if (curIdx < items.length - 1) {
          stopAutoScroll()
          const newIndex = curIdx + 1
          setCurrentItemIndex(newIndex)
          if (items[newIndex].songId) setSelectedSongId(items[newIndex].songId!)
          // Restart scroll for the new song immediately
          startAutoScroll()
        } else {
          stopAutoScroll()
        }
        return
      }
      scrollYRef.current = Math.min(scrollYRef.current + pixelsPerTick, maxScroll)
      contentScrollRef.current?.scrollTo({ y: scrollYRef.current, animated: false })
    }, interval)
  }, [scrollSpeedIndex])

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null }
    setIsAutoScrolling(false)
    Animated.timing(scrollFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
  }, [])

  const toggleAutoScroll = () => {
    if (isAutoScrolling) stopAutoScroll()
    else startAutoScroll()
  }

  useEffect(() => { if (isAutoScrolling) startAutoScroll() }, [scrollSpeedIndex])
  useEffect(() => { return () => { if (autoScrollRef.current) clearInterval(autoScrollRef.current) } }, [])

  // ── Load data ──────────────────────────────────────────────────────────
const loadChordList = async ({ silent = false }: { silent?: boolean } = {}) => {
  try {
    if (!silent) setLoading(true)
    const user = await getCurrentUser()
    if (user) setPlaylists(await getPlaylistsByUserId(user.id))

    const clRecord = await getChordListById(chordListId)
    if (clRecord) { setChordList(clRecord); setArtistId(clRecord.artistId) }

    const songRows = await getSongsByChordListId(chordListId)
    const mapped: Song[] = (songRows || []).map(row => ({
      id: row.id,
      chordListId: row.chordListId,
      title: row.title,
      content: row.content,
      key: row.key,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      synced: row.synced,
      userId: row.userId ?? '',
      youtubeUrl: row.youtubeUrl,
    }))

    setSongs(mapped)
    setBrowseItems(mapped.map(song => ({
      id: song.id, title: song.title, type: 'song',
      songId: song.id, chordListId: song.chordListId,
    })))

    const currentId = selectedSongIdRef.current
    const stillValid = currentId && mapped.find(s => s.id === currentId)
    if (!stillValid && mapped.length > 0) {
      setSelectedSongId(mapped[0].id)
      // If the song content uses Nashville numerals, do not auto-set the target key
      if (!hasNashville(mapped[0].content || '')) {
        setTransposeToKey(mapped[0].key || 'C')
      }
      setCurrentItemIndex(0)
    }
  } catch (err) {
    console.error('Error loading chord list:', err)
    Alert.alert('Error', 'Failed to load chord list')
  } finally {
    hasLoadedOnceRef.current = true
    if (!silent) setLoading(false)
  }
}

  const { refreshing, onRefresh } = usePullToRefresh(() => loadChordList({ silent: true }))

  const loadArtistSongs = async () => {
    if (!artistId) return
    try {
      const { data: clRows } = await supabase
        .from('chord_lists').select('id, is_private').eq('artist_id', artistId)
      const clIds = (clRows || []).filter(isChordListPublic).map(r => r.id)
      let songRows: any[] = []
      if (clIds.length > 0) {
        const { data } = await supabase
          .from('songs').select('*').in('chord_list_id', clIds).order('title')
        songRows = data || []
      }
      const mapped: Song[] = (songRows || []).map(row => ({
        id: row.id, chordListId: row.chord_list_id, title: row.title,
        content: row.content, key: row.key,
        createdAt: row.created_at, updatedAt: row.updated_at,
        synced: Boolean(row._synced), userId: row.user_id ?? '',
        youtubeUrl: row.youtube_url,
      }))
      if (mapped.length === 0) {
        const localRows: any[] = await query(
          `SELECT s.* FROM songs s JOIN chord_lists cl ON s.chord_list_id = cl.id
           WHERE cl.artist_id = ? AND cl.is_private = 0 ORDER BY s.title`,
          [artistId]
        )
        const fb: Song[] = (localRows || []).map(row => ({
          id: row.id, chordListId: row.chord_list_id, title: row.title,
          content: row.content, key: row.key, createdAt: row.created_at,
          updatedAt: row.updated_at, synced: Boolean(row._synced),
          userId: row.user_id ?? '', youtubeUrl: row.youtube_url,
        }))
        const fbItems: BrowseItem[] = fb.map(song => ({
          id: song.id, title: song.title, type: 'song',
          songId: song.id, chordListId: song.chordListId,
        }))
        setBrowseItems(fbItems)
        if (fbItems.length > 0) { setCurrentItemIndex(0); setSelectedSongId(fbItems[0].id!) }
        return
      }
      const items: BrowseItem[] = mapped.map(song => ({
        id: song.id, title: song.title, type: 'song',
        songId: song.id, chordListId: song.chordListId,
      }))
      setBrowseItems(items)
      if (items.length > 0) { setCurrentItemIndex(0); setSelectedSongId(items[0].id!) }
    } catch { Alert.alert('Error', 'Failed to load artist songs') }
  }

  const resolveTitle = async (id: string, type: 'song' | 'chord_list'): Promise<string> => {
    const table = type === 'song' ? 'songs' : 'chord_lists'
    const fallback = type === 'song' ? `Song ${id.substring(0, 8)}` : `Chord List ${id.substring(0, 8)}`
    try {
      const rows: any[] = await query(`SELECT title FROM ${table} WHERE id = ?`, [id])
      if (rows[0]?.title) return rows[0].title
    } catch {}
    try {
      const { data } = await supabase.from(table).select('title').eq('id', id).single()
      if (data?.title) return data.title
    } catch {}
    return fallback
  }

  const fetchSongForViewer = async (songId: string): Promise<Song | null> => {
    try {
      const rows: any[] = await query('SELECT * FROM songs WHERE id = ?', [songId])
      if (rows[0]) {
        const r = rows[0]
        return {
          id: r.id,
          chordListId: r.chord_list_id ?? r.chordListId,
          title: r.title,
          content: r.content,
          key: r.key,
          createdAt: r.created_at ?? r.createdAt,
          updatedAt: r.updated_at ?? r.updatedAt,
          synced: Boolean(r._synced ?? r.synced),
          userId: r.user_id ?? r.userId ?? '',
          youtubeUrl: r.youtube_url ?? r.youtubeUrl,
        }
      }
    } catch {}
    try {
      const { data } = await supabase.from('songs').select('*').eq('id', songId).single()
      if (data) {
        return {
          id: data.id,
          chordListId: data.chord_list_id,
          title: data.title,
          content: data.content,
          key: data.key,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          synced: Boolean(data._synced),
          userId: data.user_id ?? '',
          youtubeUrl: data.youtube_url,
        }
      }
    } catch {}
    return null
  }

  const loadPlaylistSongs = async (playlistId: string) => {
    try {
      const playlistItems = await getPlaylistItems(playlistId)

      const [resolvedTitles, fetchedSongs] = await Promise.all([
        Promise.all(
          playlistItems.map(item =>
            item.songId
              ? resolveTitle(item.songId, 'song')
              : item.chordListId
              ? resolveTitle(item.chordListId, 'chord_list')
              : Promise.resolve('Unknown')
          )
        ),
        Promise.all(
          playlistItems.map(item =>
            item.songId ? fetchSongForViewer(item.songId) : Promise.resolve(null)
          )
        ),
      ])

      const items: BrowseItem[] = playlistItems.map((item, i) => ({
        id: item.id,
        title: resolvedTitles[i],
        type: item.songId ? 'song' : 'chord_list',
        songId: item.songId,
        chordListId: item.chordListId,
        position: item.position,
      }))

      const newSongs = fetchedSongs.filter(Boolean) as Song[]
      if (newSongs.length > 0) {
        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id))
          const toAdd = newSongs.filter(s => !existingIds.has(s.id))
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev
        })
      }

      setBrowseItems(items)
      setSelectedPlaylistId(playlistId)
      if (items.length > 0) {
        setCurrentItemIndex(0)
        if (items[0].songId) {
          setSelectedSongId(items[0].songId)
          const firstSong = fetchedSongs[0]
          if (firstSong && !hasNashville(firstSong.content || '')) {
            setTransposeToKey(firstSong.key || 'C')
          }
        }
      }
      setShowPlaylistModal(false)
    } catch { Alert.alert('Error', 'Failed to load playlist') }
  }

  const handleBrowseModeChange = (mode: BrowseMode) => {
    setBrowseMode(mode)
    if (mode === 'single') {
      const items: BrowseItem[] = songs.map(s => ({
        id: s.id, title: s.title, type: 'song', songId: s.id, chordListId: s.chordListId,
      }))
      setBrowseItems(items)
      if (items.length > 0) { setCurrentItemIndex(0); setSelectedSongId(items[0].id) }
    } else if (mode === 'artist') {
      loadArtistSongs()
    } else {
      setShowOptionsModal(false)
      setShowPlaylistModal(true)
    }
  }

  const handlePreviousItem = () => {
    if (currentItemIndex > 0) {
      const newIndex = currentItemIndex - 1
      setCurrentItemIndex(newIndex)
      if (browseItems[newIndex].songId) setSelectedSongId(browseItems[newIndex].songId!)
    }
  }
  const handleNextItem = () => {
    if (currentItemIndex < browseItems.length - 1) {
      const newIndex = currentItemIndex + 1
      setCurrentItemIndex(newIndex)
      if (browseItems[newIndex].songId) setSelectedSongId(browseItems[newIndex].songId!)
    }
  }

  const getCopyTextForSection = (section: SongSection) => {
    if (viewMode === 'chords') return extractChordsOnlyFromContent(section.content)
    if (viewMode === 'lyrics') return section.content.replace(/\[([^\]]+)\]/g, '').trim()
    // both
    return section.content.replace(/\[([^\]]+)\]/g, '$1').trim()
  }

  const handleCopy = async () => {
    if (!selectedSong) {
      Alert.alert('Nothing to copy', 'No song selected')
      return
    }
    try {
      const text = parsedSections.map(s => `${s.label}\n\n${getCopyTextForSection(s)}`).join('\n\n')
      await Clipboard.setStringAsync(text)
      Alert.alert('Copied', 'Chord list copied to clipboard')
    } catch (err) {
      console.error('Copy failed', err)
      Alert.alert('Error', 'Failed to copy to clipboard')
    }
  }

  const handleMoveUp = async () => {
    if (currentItemIndex === 0 || !selectedPlaylistId) return
    try {
      const cur  = browseItems[currentItemIndex]
      const prev = browseItems[currentItemIndex - 1]
      await updatePlaylistItemPosition(cur.id, prev.position ?? currentItemIndex - 1)
      await updatePlaylistItemPosition(prev.id, cur.position ?? currentItemIndex)
      await loadPlaylistSongs(selectedPlaylistId)
      setCurrentItemIndex(currentItemIndex - 1)
    } catch { Alert.alert('Error', 'Failed to reorder items') }
  }

  const handleMoveDown = async () => {
    if (currentItemIndex >= browseItems.length - 1 || !selectedPlaylistId) return
    try {
      const cur  = browseItems[currentItemIndex]
      const next = browseItems[currentItemIndex + 1]
      await updatePlaylistItemPosition(cur.id, next.position ?? currentItemIndex + 1)
      await updatePlaylistItemPosition(next.id, cur.position ?? currentItemIndex)
      await loadPlaylistSongs(selectedPlaylistId)
      setCurrentItemIndex(currentItemIndex + 1)
    } catch { Alert.alert('Error', 'Failed to reorder items') }
  }

  const handleEditSong = () => {
    if (!selectedSong) return
    setShowOptionsModal(false)
    navigation.navigate('SongEditor', {
      songId: selectedSong.id,
      chordListId: selectedSong.chordListId,
    })
  }

  const handleDeleteSong = async () => {
    if (!selectedSong) return
    setShowOptionsModal(false)
    // If we are viewing a playlist, remove the song from that playlist only.
    // If after removal the song is not present in any playlist, delete the song record itself.
    Alert.alert('Delete Song', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (selectedPlaylistId) {
              // remove from current playlist only
              const items = await getPlaylistItems(selectedPlaylistId)
              const item = items.find(i => i.songId === selectedSong.id)
              if (item) {
                await removeFromPlaylist(item.id)
                // reload playlist view
                await loadPlaylistSongs(selectedPlaylistId)
                // check if song exists in any other playlist
                const referencing = await query('SELECT id FROM playlist_items WHERE song_id = ?', [selectedSong.id])
                if (!referencing || referencing.length === 0) {
                  // no longer referenced: delete song record
                  await deleteSong(selectedSong.id)
                  navigation.navigate('ChordListsTab', { screen: 'ChordListsHome' })
                } else {
                  Alert.alert('Removed', 'Song removed from playlist')
                }
                return
              }
            }

            // No playlist context or not found in current playlist: delete the song itself
            await deleteSong(selectedSong.id)

            // If this was the last song in the chord list, remove the chord list row too.
            const remainingSongs = await getSongsByChordListId(selectedSong.chordListId)
            if (!remainingSongs || remainingSongs.length === 0) {
              await deleteChordListRecord(selectedSong.chordListId)
            }

            navigation.navigate('ChordListsTab', { screen: 'ChordListsHome' })
          } catch (err) {
            console.error('Failed to delete song:', err)
            Alert.alert('Error', 'Failed to delete song')
          }
        },
      },
    ])
  }

  const selectedSong      = songs.find(s => s.id === selectedSongId) ?? songs[0] ?? null
  const currentBrowseItem = browseItems[currentItemIndex]

  const displayContent = useMemo(() => {
    if (!selectedSong) return ''
    const sourceKey = selectedSong.key || 'C'
    let content = selectedSong.content || ''
    if (notationMode === 'nashville') {
      content = transposeTextToNashville(content, sourceKey)
    } else {
      const semitones = getTransposeDistance(sourceKey, transposeToKey)
      // Always convert Nashville numerals to real chords for the selected target key
      // even when semitones == 0 (i.e., target == original). This makes Nashville
      // content transposable in all keys and visible when in Nashville form.
      if (semitones !== 0 || hasNashville(content)) content = transposeText(content, semitones, transposeToKey)
    }
    return content
  }, [selectedSong, transposeToKey, notationMode])

  const parsedSections = useMemo(() => parseSongSections(displayContent), [displayContent])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null)

  const visibleSections = useMemo(() => {
    if (!focusedSectionId) return parsedSections
    return parsedSections.filter(section => section.id === focusedSectionId)
  }, [focusedSectionId, parsedSections])

  useEffect(() => {
    setActiveSectionId(parsedSections[0]?.id ?? null)
    setFocusedSectionId(null)
  }, [parsedSections])

  const scrollToSection = (sectionId: string) => {
    setActiveSectionId(sectionId)
    setFocusedSectionId(sectionId)
    scrollYRef.current = 0
    contentScrollRef.current?.scrollTo({ y: 0, animated: true })
  }

  const showAllSections = () => {
    setFocusedSectionId(null)
    setActiveSectionId(parsedSections[0]?.id ?? null)
    scrollYRef.current = 0
    contentScrollRef.current?.scrollTo({ y: 0, animated: true })
  }

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ y: 0, animated: false })
    scrollYRef.current = 0
  }, [selectedSongId, viewMode, transposeToKey, displayContent])

  const handleContentScroll = useCallback((e: any) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y
  }, [])

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A0A0A" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    )
  }

  const isFirst     = currentItemIndex === 0
  const isLast      = currentItemIndex >= browseItems.length - 1
  const youtubeUrl  = selectedSong?.youtubeUrl?.trim() || ''
  const youtubeId   = extractYouTubeId(youtubeUrl)
  const hasVideo    = Boolean(youtubeId)
  const hasOptions  = canManageChords || browseItems.length > 1 || playlists.length > 0 || hasVideo || parsedSections.length > 1
  const showMainControls = false

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />

      {/* ─── HEADER ─── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color="#0A0A0A" />
        </TouchableOpacity>
        <View style={styles.headerMeta}>
          <Text style={styles.headerEyebrow}>CHORD LIST</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {chordList?.title || 'Chord List'}
          </Text>
        </View>
        {browseItems.length > 1 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>
              {currentItemIndex + 1}/{browseItems.length}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleCopy}
          activeOpacity={0.7}
        >
          <Ionicons name="copy-outline" size={16} color="#0A0A0A" />
        </TouchableOpacity>
        {hasOptions && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowOptionsModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color="#0A0A0A" />
          </TouchableOpacity>
        )}
      </View>

      {/* ─── NAV CONTROLS ─── */}
      {browseItems.length > 1 && (
        <View style={styles.navBar}>
          <TouchableOpacity
            style={[styles.navArrow, isFirst && styles.navArrowDisabled]}
            onPress={handlePreviousItem} disabled={isFirst} activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={isFirst ? '#D4D4D4' : '#0A0A0A'} />
          </TouchableOpacity>
          <View style={styles.navCenter}>
            <Text style={styles.navTitle} numberOfLines={1}>{currentBrowseItem?.title}</Text>
            <View style={styles.navDots}>
              {browseItems
                .slice(Math.max(0, currentItemIndex - 2), Math.min(browseItems.length, currentItemIndex + 3))
                .map((_, i) => {
                  const realIndex = Math.max(0, currentItemIndex - 2) + i
                  return (
                    <View
                      key={realIndex}
                      style={[styles.navDot, realIndex === currentItemIndex && styles.navDotActive]}
                    />
                  )
                })}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.navArrow, isLast && styles.navArrowDisabled]}
            onPress={handleNextItem} disabled={isLast} activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={18} color={isLast ? '#D4D4D4' : '#0A0A0A'} />
          </TouchableOpacity>
        </View>
      )}

      {showMainControls && (
        <View style={styles.songTabBar}>
          <TouchableOpacity
            style={[styles.songTab, activeSongTab === 'sheet' && styles.songTabActive]}
            onPress={() => setActiveSongTab('sheet')} activeOpacity={0.75}
          >
            <Ionicons name="document-text-outline" size={14}
              color={activeSongTab === 'sheet' ? '#0A0A0A' : '#ADADAD'} style={{ marginRight: 5 }} />
            <Text style={[styles.songTabText, activeSongTab === 'sheet' && styles.songTabTextActive]}>
              Sheet
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.songTab, activeSongTab === 'video' && styles.songTabActive, !hasVideo && styles.songTabDisabled]}
            onPress={() => hasVideo && setActiveSongTab('video')}
            activeOpacity={hasVideo ? 0.75 : 1}
          >
            <Ionicons name="logo-youtube" size={14}
              color={activeSongTab === 'video' ? '#FF0000' : '#ADADAD'} style={{ marginRight: 5 }} />
            <Text style={[styles.songTabText, activeSongTab === 'video' && styles.songTabTextActive, !hasVideo && styles.songTabTextDisabled]}>
              Video{!hasVideo ? ' (none)' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {showMainControls && activeSongTab === 'video' && hasVideo && (
        <View style={styles.videoContainer}>
          <YoutubePlayer height={220} videoId={youtubeId!} play={false} />
          <View style={styles.videoMeta}>
            <Text style={styles.videoSongTitle} numberOfLines={1}>{selectedSong?.title}</Text>
            <TouchableOpacity
              style={styles.openYoutubeBtn}
              onPress={() => {
                const url = /^https?:\/\//i.test(youtubeUrl) ? youtubeUrl : `https://${youtubeUrl}`
                Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open YouTube'))
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-youtube" size={14} color="#FF0000" />
              <Text style={styles.openYoutubeBtnText}>Open in YouTube</Text>
              <Ionicons name="open-outline" size={13} color="#888" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── SHEET TAB ─── */}
      {activeSongTab === 'sheet' && (
        <>
          {showMainControls && (
            <>
              <View style={styles.controlsRow}>
                <View style={styles.viewModePills}>
                  {(['lyrics', 'chords', 'both'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.pill, viewMode === mode && styles.pillActive]}
                      onPress={() => setViewMode(mode)} activeOpacity={0.75}
                    >
                      <Text numberOfLines={1} style={[styles.pillText, viewMode === mode && styles.pillTextActive]}>
                        {mode === 'lyrics' ? 'Lyrics' : mode === 'chords' ? 'Chords' : 'Both'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Notation pills row — full width */}
              <View style={styles.notationRow}>
                <Text style={styles.notationLabel}>Notation</Text>
                <View style={styles.notationPills}>
                  {(['chords', 'nashville'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.pillCompact, notationMode === mode && styles.pillActive]}
                      onPress={() => setNotationMode(mode)}
                      activeOpacity={0.75}
                    >
                      <Text numberOfLines={1} style={[styles.pillText, notationMode === mode && styles.pillTextActive]}>
                        {mode === 'chords' ? 'Chords' : 'Nashville'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Transpose chip + scroll button row — below the pills */}
              <View style={styles.notationControlsRow}>
                <View style={{ flex: 1 }}>
                  {notationMode === 'chords' ? (
                    <TouchableOpacity
                      style={styles.transposeChip}
                      onPress={() => setShowTransposePicker(true)} activeOpacity={0.75}
                    >
                      <Ionicons name="musical-notes" size={12} color="#555" style={{ marginRight: 5 }} />
                      <Text style={styles.transposeChipText}>{selectedSong?.key || 'C'}{' → '}{transposeToKey}</Text>
                      <Ionicons name="chevron-down" size={11} color="#ADADAD" style={{ marginLeft: 3 }} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.scrollIconBtn, isAutoScrolling && styles.scrollIconBtnActive]}
                  onPress={toggleAutoScroll}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isAutoScrolling ? 'pause' : 'play'}
                    size={14}
                    color={isAutoScrolling ? '#FAFAFA' : '#0A0A0A'}
                  />
                </TouchableOpacity>
              </View>
            </>
          )}

          {parsedSections.length > 1 && selectedSong && (
            <View style={styles.sectionNavBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionNavScrollContent}>
                <TouchableOpacity
                  style={[styles.sectionNavPill, !focusedSectionId && styles.sectionNavPillActive]}
                  onPress={showAllSections}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sectionNavIndex, !focusedSectionId && styles.sectionNavIndexActive]}>
                    <Text style={[styles.sectionNavIndexText, !focusedSectionId && styles.sectionNavIndexTextActive]}>A</Text>
                  </View>
                  <Text style={[styles.sectionNavPillText, !focusedSectionId && styles.sectionNavPillTextActive]} numberOfLines={1}>
                    All
                  </Text>
                </TouchableOpacity>
                {parsedSections.map((section, idx) => {
                  const isActive = section.id === activeSectionId
                  return (
                    <TouchableOpacity
                      key={section.id}
                      style={[styles.sectionNavPill, isActive && styles.sectionNavPillActive]}
                      onPress={() => scrollToSection(section.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.sectionNavIndex, isActive && styles.sectionNavIndexActive]}>
                        <Text style={[styles.sectionNavIndexText, isActive && styles.sectionNavIndexTextActive]}>{idx + 1}</Text>
                      </View>
                      <Text style={[styles.sectionNavPillText, isActive && styles.sectionNavPillTextActive]} numberOfLines={1}>
                        {section.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          )}

          {/* Song Picker */}
          {songs.length > 1 && browseMode === 'single' && (
            <View style={styles.songPickerWrap}>
              <Ionicons name="musical-note" size={13} color="#B0B0B0" style={{ marginLeft: 14 }} />
              <Picker
                style={styles.songPicker}
                selectedValue={selectedSongId}
                onValueChange={value => {
                  setSelectedSongId(value)
                  const song = songs.find(s => s.id === value)
                  if (song && !hasNashville(song.content || '')) {
                    setTransposeToKey(song.key || 'C')
                  }
                }}
                dropdownIconColor="#ADADAD"
              >
                {songs.map(song => (
                  <Picker.Item key={song.id} label={song.title} value={song.id} />
                ))}
              </Picker>
            </View>
          )}

          {/* Content Area */}
          <View style={{ flex: 1 }}>
            <ScrollView
              ref={contentScrollRef}
              style={styles.contentArea}
              contentContainerStyle={styles.contentInner}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={handleContentScroll}
              onContentSizeChange={(_, h) => { contentHeightRef.current = h }}
              onLayout={e => { scrollViewHeightRef.current = e.nativeEvent.layout.height }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {/* {selectedSong && (
                <View style={styles.songHeader}>
                  <Text style={styles.songTitle}>{selectedSong.title}</Text>
                  <View style={styles.keyBadge}>
                    <Text style={styles.keyBadgeText}>Key of {transposeToKey}</Text>
                  </View>
                </View>
              )} */}

              {selectedSong ? (
                <View style={styles.songContentBlock}>
                  {visibleSections.map(section => (
                    <View key={section.id} style={styles.sectionBlock}>
                      <View style={styles.sectionBadge}>
                        <Text style={styles.sectionBadgeText}>{section.label}</Text>
                      </View>
                      <View style={styles.sectionContentBlock}>
                        {renderSongLines(section.content, viewMode)}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptySongState}>
                  <Ionicons name="musical-note-outline" size={24} color="#C8C8C8" />
                  <Text style={styles.emptySongTitle}>No songs found</Text>
                  <Text style={styles.emptySongSubtitle}>
                    This chord list does not have any songs attached yet.
                  </Text>
                </View>
              )}
              <View style={{ height: 80 }} />
            </ScrollView>

            {/* Auto-scroll badge */}
            <Animated.View style={[styles.scrollingBadge, { opacity: scrollFadeAnim }]}>
              <Ionicons name="refresh" size={10} color="#FAFAFA" style={{ marginRight: 4 }} />
              <Text style={styles.scrollingBadgeText}>
                Scrolling · {SCROLL_SPEEDS[scrollSpeedIndex].label}
              </Text>
            </Animated.View>
          </View>
        </>
      )}

      {/* ═══ OPTIONS MODAL (⋯) ═══ */}
      <Modal visible={showOptionsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <View style={{ width: 54 }} />
              <Text style={styles.modalTitle}>Options</Text>
              <TouchableOpacity onPress={() => setShowOptionsModal(false)}>
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScrollBody}>
              <View style={{ paddingVertical: 8, paddingHorizontal: 4 }}>
                <Text style={[styles.optionSectionLabel, { marginLeft: 16 }]}>VIEW & CONTROLS</Text>

                <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                  <View style={styles.songTabBar}>
                    <TouchableOpacity
                      style={[styles.songTab, activeSongTab === 'sheet' && styles.songTabActive]}
                      onPress={() => setActiveSongTab('sheet')} activeOpacity={0.75}
                    >
                      <Ionicons name="document-text-outline" size={14}
                        color={activeSongTab === 'sheet' ? '#0A0A0A' : '#ADADAD'} style={{ marginRight: 5 }} />
                      <Text style={[styles.songTabText, activeSongTab === 'sheet' && styles.songTabTextActive]}>Sheet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.songTab, activeSongTab === 'video' && styles.songTabActive, !hasVideo && styles.songTabDisabled]}
                      onPress={() => hasVideo && setActiveSongTab('video')}
                      activeOpacity={hasVideo ? 0.75 : 1}
                    >
                      <Ionicons name="logo-youtube" size={14}
                        color={activeSongTab === 'video' ? '#FF0000' : '#ADADAD'} style={{ marginRight: 5 }} />
                      <Text style={[styles.songTabText, activeSongTab === 'video' && styles.songTabTextActive, !hasVideo && styles.songTabTextDisabled]}>Video{!hasVideo ? ' (none)' : ''}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.controlsRow}>
                    <View style={styles.viewModePills}>
                      {(['lyrics', 'chords', 'both'] as const).map(mode => (
                        <TouchableOpacity
                          key={mode}
                          style={[styles.pill, viewMode === mode && styles.pillActive]}
                          onPress={() => setViewMode(mode)} activeOpacity={0.75}
                        >
                          <Text numberOfLines={1} style={[styles.pillText, viewMode === mode && styles.pillTextActive]}>
                            {mode === 'lyrics' ? 'Lyrics' : mode === 'chords' ? 'Chords' : 'Both'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Notation pills row — full width */}
                  <View style={styles.notationRow}>
                    <Text style={styles.notationLabel}>Notation</Text>
                      <View style={styles.notationPills}>
                      {(['chords', 'nashville'] as const).map(mode => (
                        <TouchableOpacity
                          key={mode}
                          style={[styles.pillCompact, notationMode === mode && styles.pillActive]}
                          onPress={() => setNotationMode(mode)}
                          activeOpacity={0.75}
                        >
                          <Text numberOfLines={1} style={[styles.pillText, notationMode === mode && styles.pillTextActive]}>
                            {mode === 'chords' ? 'Chords' : 'Nashville'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Transpose chip + scroll button row — below the pills */}
                  <View style={styles.notationControlsRow}>
                    <View style={{ flex: 1 }}>
                      {notationMode === 'chords' ? (
                        <TouchableOpacity
                          style={styles.transposeChip}
                          onPress={() => setShowTransposePicker(true)} activeOpacity={0.75}
                        >
                          <Ionicons name="musical-notes" size={12} color="#555" style={{ marginRight: 5 }} />
                          <Text style={styles.transposeChipText}>{selectedSong?.key || 'C'}{' → '}{transposeToKey}</Text>
                          <Ionicons name="chevron-down" size={11} color="#ADADAD" style={{ marginLeft: 3 }} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[styles.scrollIconBtn, isAutoScrolling && styles.scrollIconBtnActive]}
                      onPress={toggleAutoScroll}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={isAutoScrolling ? 'pause' : 'play'} size={14} color={isAutoScrolling ? '#FAFAFA' : '#0A0A0A'} />
                    </TouchableOpacity>
                  </View>

                  {songs.length > 1 && browseMode === 'single' && (
                    <View style={styles.songPickerWrap}>
                      <Ionicons name="musical-note" size={13} color="#B0B0B0" style={{ marginLeft: 14 }} />
                      <Picker
                        style={styles.songPicker}
                        selectedValue={selectedSongId}
                        onValueChange={value => {
                          setSelectedSongId(value)
                          const song = songs.find(s => s.id === value)
                          if (song && !hasNashville(song.content || '')) {
                            setTransposeToKey(song.key || 'C')
                          }
                        }}
                        dropdownIconColor="#ADADAD"
                      >
                        {songs.map(song => (
                          <Picker.Item key={song.id} label={song.title} value={song.id} />
                        ))}
                      </Picker>
                    </View>
                  )}

                  {activeSongTab === 'video' && hasVideo && (
                    <View style={{ paddingTop: 10 }}>
                      <TouchableOpacity
                        style={styles.openYoutubeBtn}
                        onPress={() => {
                          const url = /^https?:\/\//i.test(youtubeUrl) ? youtubeUrl : `https://${youtubeUrl}`
                          Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open YouTube'))
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="logo-youtube" size={14} color="#FF0000" />
                        <Text style={styles.openYoutubeBtnText}>Open in YouTube</Text>
                        <Ionicons name="open-outline" size={13} color="#888" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>

              {/* Browse Mode
              <View style={styles.optionSection}>
                <Text style={styles.optionSectionLabel}>BROWSE MODE</Text>
                <View style={styles.browseModeBar}>
                  {(['single', 'artist', 'playlist'] as const).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.browseModeTab, browseMode === mode && styles.browseModeTabActive]}
                      onPress={() => handleBrowseModeChange(mode)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={mode === 'single' ? 'musical-note' : mode === 'artist' ? 'person' : 'list'}
                        size={13}
                        color={browseMode === mode ? '#FAFAFA' : '#ADADAD'}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.browseModeText, browseMode === mode && styles.browseModeTextActive]}>
                        {mode === 'single' ? 'Single' : mode === 'artist' ? 'Artist' : 'Playlist'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View> */}

              {/* Auto-scroll speed */}
              <View style={styles.optionSection}>
                <Text style={styles.optionSectionLabel}>AUTO-SCROLL SPEED</Text>
                <View style={styles.speedPillsRow}>
                  {SCROLL_SPEEDS.map((s, i) => (
                    <TouchableOpacity
                      key={s.label}
                      style={[styles.speedPill, scrollSpeedIndex === i && styles.speedPillActive]}
                      onPress={() => setScrollSpeedIndex(i)} activeOpacity={0.75}
                    >
                      <Text style={[styles.speedPillText, scrollSpeedIndex === i && styles.speedPillTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Reorder (playlist mode) */}
              {browseMode === 'playlist' && browseItems.length > 1 && (
                <View style={styles.optionSection}>
                  <Text style={styles.optionSectionLabel}>REORDER IN PLAYLIST</Text>
                  <View style={styles.reorderBar}>
                    <TouchableOpacity
                      style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                      onPress={handleMoveUp} disabled={isFirst} activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-up" size={14} color={isFirst ? '#C4C4C4' : '#0A0A0A'} />
                      <Text style={[styles.reorderBtnText, isFirst && styles.reorderBtnTextDisabled]}>Move Up</Text>
                    </TouchableOpacity>
                    <View style={styles.reorderDivider} />
                    <TouchableOpacity
                      style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                      onPress={handleMoveDown} disabled={isLast} activeOpacity={0.7}
                    >
                      <Ionicons name="arrow-down" size={14} color={isLast ? '#C4C4C4' : '#0A0A0A'} />
                      <Text style={[styles.reorderBtnText, isLast && styles.reorderBtnTextDisabled]}>Move Down</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Song actions */}
              {canManageChords && activeSongTab === 'sheet' && (
                <View style={styles.optionSection}>
                  <Text style={styles.optionSectionLabel}>SONG</Text>
                  <View style={styles.songActionGroup}>
                    <TouchableOpacity style={styles.songActionRow} onPress={handleEditSong} activeOpacity={0.7}>
                      <Ionicons name="pencil-outline" size={16} color="#0A0A0A" />
                      <Text style={styles.songActionText}>Edit song</Text>
                      <Ionicons name="chevron-forward" size={14} color="#D4D4D4" />
                    </TouchableOpacity>
                    <View style={styles.songActionDivider} />
                    <TouchableOpacity style={styles.songActionRow} onPress={handleDeleteSong} activeOpacity={0.7}>
                      <Ionicons name="trash-outline" size={16} color="#E05252" />
                      <Text style={[styles.songActionText, { color: '#E05252' }]}>Delete song</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── TRANSPOSE MODAL ─── */}
      <Modal visible={showTransposePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => setShowTransposePicker(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Transpose Key</Text>
              <TouchableOpacity onPress={() => setShowTransposePicker(false)}>
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.transposeInfo}>
              <Text style={styles.transposeInfoText}>
                {`Original: ${selectedSong?.key || 'C'}   →   Target: ${transposeToKey}`}
              </Text>
            </View>
            <View style={styles.keyGrid}>
              {getAllKeys().map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.keyCell, transposeToKey === key && styles.keyCellActive]}
                  onPress={() => setTransposeToKey(key)} activeOpacity={0.7}
                >
                  <Text style={[styles.keyCellText, transposeToKey === key && styles.keyCellTextActive]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── PLAYLIST MODAL ─── */}
      <Modal visible={showPlaylistModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <TouchableOpacity onPress={() => { setShowPlaylistModal(false); setBrowseMode('single') }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Playlist</Text>
              <View style={{ width: 54 }} />
            </View>
            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              {playlists.length === 0 ? (
                <View style={styles.modalEmpty}>
                  <Ionicons name="musical-notes-outline" size={28} color="#D0D0D0" />
                  <Text style={styles.modalEmptyText}>No playlists yet</Text>
                </View>
              ) : (
                playlists.map((playlist, idx) => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={[styles.playlistOption, idx < playlists.length - 1 && styles.playlistOptionBorder]}
                    onPress={() => loadPlaylistSongs(playlist.id)} activeOpacity={0.7}
                  >
                    <View style={styles.playlistOptionNum}>
                      <Text style={styles.playlistOptionNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.playlistOptionText}>{playlist.title}</Text>
                    <Ionicons name="chevron-forward" size={15} color="#D4D4D4" />
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  loadingContainer: { flex: 1, backgroundColor: '#FAFAFA', justifyContent: 'center', alignItems: 'center', gap: 14 },
  loadingText: { fontSize: 12, letterSpacing: 1.4, color: '#ADADAD', textTransform: 'uppercase', fontWeight: '600' },

  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EBEBEB', gap: 10 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  headerMeta: { flex: 1, gap: 2 },
  headerEyebrow: { fontSize: 9, fontWeight: '700', color: '#C0C0C0', letterSpacing: 2 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.4 },
  headerBadge: { backgroundColor: '#F2F2F2', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#EBEBEB' },
  headerBadgeText: { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 0.5 },

  navBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EBEBEB', gap: 8 },
  navArrow: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EBEBEB' },
  navArrowDisabled: { backgroundColor: '#F8F8F8', borderColor: '#F0F0F0' },
  navCenter: { flex: 1, alignItems: 'center', gap: 6 },
  navTitle: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.1 },
  navDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  navDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#E0E0E0' },
  navDotActive: { width: 14, backgroundColor: '#0A0A0A' },

  songTabBar: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EBEBEB', gap: 8 },
  songTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: '#F2F2F2' },
  songTabActive: { backgroundColor: '#FAFAFA', borderWidth: 1.5, borderColor: '#0A0A0A' },
  songTabDisabled: { opacity: 0.5 },
  songTabText: { fontSize: 13, fontWeight: '600', color: '#ADADAD' },
  songTabTextActive: { color: '#0A0A0A' },
  songTabTextDisabled: { color: '#CCCCCC' },

  videoContainer: { flex: 1, backgroundColor: '#0A0A0A' },
  videoMeta: { padding: 20, gap: 12, backgroundColor: '#111' },
  videoSongTitle: { fontSize: 18, fontWeight: '800', color: '#FAFAFA', letterSpacing: -0.4 },
  openYoutubeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  openYoutubeBtnText: { fontSize: 13, fontWeight: '600', color: '#CCC' },

  controlsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EBEBEB', gap: 8 },
  // Pills fill the full width of their container (viewModePills or notationPills)
  viewModePills: { flexDirection: 'row', flex: 1, backgroundColor: '#F2F2F2', borderRadius: 10, padding: 3, gap: 2 },
  notationRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 10 },
  notationLabel: { fontSize: 11, fontWeight: '800', color: '#ADADAD', letterSpacing: 0.9, textTransform: 'uppercase' },
  notationPills: { flexDirection: 'row', flex: 1, backgroundColor: '#F2F2F2', borderRadius: 10, padding: 3, gap: 2, alignItems: 'center' },
  // pill: flex: 1 so each pill expands equally to fill its parent (viewModePills or notationPills)
  pill: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, justifyContent: 'center' },
  pillCompact: { paddingVertical: 8, alignItems: 'center', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', minWidth: 86 },
  notationRowContainer: { position: 'relative', paddingTop: 6 },
  notationRowInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  transposeChipWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', top: 18 },
  notationControlsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 14, paddingBottom: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#EBEBEB' },
  pillActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  pillText: { fontSize: 12, fontWeight: '600', color: '#ADADAD' },
  pillTextActive: { color: '#0A0A0A' },
  transposeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#EBEBEB' },
  transposeChipText: { fontSize: 12, fontWeight: '700', color: '#333', letterSpacing: 0.1 },
  scrollIconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EBEBEB' },
  scrollIconBtnActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },

  scrollingBadge: { position: 'absolute', bottom: 14, left: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0A0A', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  scrollingBadgeText: { fontSize: 11, fontWeight: '700', color: '#FAFAFA' },

  songPickerWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EBEBEB' },
  songPicker: { flex: 1, color: '#0A0A0A' },

  contentArea: { flex: 1, backgroundColor: '#FAFAFA' },
  contentInner: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  songHeader: { marginBottom: 20, gap: 8 },
  songTitle: { fontSize: 22, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.6, lineHeight: 26 },
  keyBadge: { alignSelf: 'flex-start', backgroundColor: '#0A0A0A', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  keyBadgeText: { fontSize: 11, fontWeight: '700', color: '#FAFAFA', letterSpacing: 0.5 },
  content: { fontSize: 15, lineHeight: 26, color: '#2A2A2A', fontFamily: 'Courier New', letterSpacing: 0.1 },
  songContentBlock: { paddingVertical: 4 },
  lineWrap: { marginBottom: 8 },
  contentLine: { fontSize: 16, lineHeight: 32, color: '#232323', fontFamily: 'Courier New', letterSpacing: 0.2 },
  sectionLine: { fontSize: 16, lineHeight: 34, color: '#0A0A0A', fontWeight: '900', fontFamily: 'Courier New', letterSpacing: 0.3 },
  sectionNavBar: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EBEBEB', paddingVertical: 10 },
  sectionNavScrollContent: { paddingHorizontal: 14, gap: 7, flexDirection: 'row', alignItems: 'center' },
  sectionNavPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F2F2F2', borderWidth: 1, borderColor: '#EBEBEB', gap: 6 },
  sectionNavPillActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  sectionNavIndex: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  sectionNavIndexActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionNavIndexText: { fontSize: 9, fontWeight: '800', color: '#888' },
  sectionNavIndexTextActive: { color: '#FAFAFA' },
  sectionNavPillText: { fontSize: 12, fontWeight: '700', color: '#555', maxWidth: 90 },
  sectionNavPillTextActive: { color: '#FAFAFA' },
  sectionBlock: { gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  sectionBadge: { alignSelf: 'flex-start', backgroundColor: '#F2F2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#E8E8E8' },
  sectionBadgeText: { fontSize: 11, fontWeight: '800', color: '#0A0A0A', letterSpacing: 0.4 },
  sectionContentBlock: { gap: 0 },
  emptySongState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 42, gap: 8 },
  emptySongTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A' },
  emptySongSubtitle: { fontSize: 12, color: '#A8A8A8', textAlign: 'center', lineHeight: 18 },

  optionSection: { paddingHorizontal: 20, paddingTop: 18 },
  optionSectionLabel: { fontSize: 10, fontWeight: '700', color: '#ADADAD', letterSpacing: 1.5, marginBottom: 10 },
  browseModeBar: { flexDirection: 'row', gap: 8 },
  browseModeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#F2F2F2' },
  browseModeTabActive: { backgroundColor: '#0A0A0A' },
  browseModeText: { fontSize: 12, fontWeight: '600', color: '#ADADAD' },
  browseModeTextActive: { color: '#FAFAFA' },
  speedPillsRow: { flexDirection: 'row', gap: 8 },
  speedPill: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#F2F2F2', borderWidth: 1, borderColor: '#EBEBEB' },
  speedPillActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  speedPillText: { fontSize: 13, fontWeight: '600', color: '#888' },
  speedPillTextActive: { color: '#FAFAFA' },
  reorderBar: { flexDirection: 'row', alignItems: 'center' },
  reorderBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 9, backgroundColor: '#F5F5F5', gap: 6 },
  reorderBtnDisabled: { opacity: 0.45 },
  reorderBtnText: { fontSize: 13, fontWeight: '600', color: '#0A0A0A' },
  reorderBtnTextDisabled: { color: '#C4C4C4' },
  reorderDivider: { width: 10 },
  songActionGroup: { borderRadius: 12, backgroundColor: '#F5F5F5', overflow: 'hidden', borderWidth: 1, borderColor: '#EBEBEB' },
  songActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  songActionText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  songActionDivider: { height: 1, backgroundColor: '#EBEBEB', marginHorizontal: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.3 },
  modalCancel: { fontSize: 14, color: '#ADADAD', fontWeight: '500', minWidth: 54 },
  modalDone: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', minWidth: 54, textAlign: 'right' },
  modalScrollBody: { paddingHorizontal: 20, paddingTop: 8 },
  modalEmpty: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  modalEmptyText: { fontSize: 13, color: '#C0C0C0', fontWeight: '500' },

  transposeInfo: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F4F4F4', alignItems: 'center' },
  transposeInfoText: { fontSize: 13, color: '#888', fontWeight: '500' },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  keyCell: { width: '22%', paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#F2F2F2', borderWidth: 1, borderColor: '#EBEBEB' },
  keyCellActive: { backgroundColor: '#0A0A0A', borderColor: '#0A0A0A' },
  keyCellText: { fontSize: 14, fontWeight: '700', color: '#555' },
  keyCellTextActive: { color: '#FAFAFA' },

  playlistOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  playlistOptionBorder: { borderBottomWidth: 1, borderBottomColor: '#F4F4F4' },
  playlistOptionNum: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  playlistOptionNumText: { fontSize: 12, fontWeight: '800', color: '#888' },
  playlistOptionText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
})