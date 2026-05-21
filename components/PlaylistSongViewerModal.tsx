import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
  Animated,
} from 'react-native'
import { ScrollView as HorizontalScroll } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Picker } from '@react-native-picker/picker'
import { getAllKeys, getTransposeDistance, transposeText } from '../lib/transpose'

const SCREEN_WIDTH = Dimensions.get('window').width

// ─── Section parsing (mirrors ChordListScreen) ────────────────────────────────

type SongSection = { id: string; label: string; content: string }

const SECTION_HEADER_PATTERN =
  /^(?:\[(.+?)\]|(intro|verse|chorus|bridge|pre[-\s]?chorus|hook|outro|coda)(?:\s*([0-9]+))?)\s*:??\s*$/i

function normalizeSectionLabel(rawLabel: string, fallbackIndex: number) {
  const cleaned = rawLabel.replace(/\[|\]/g, '').trim()
  const match = cleaned.match(
    /^(intro|verse|chorus|bridge|pre[-\s]?chorus|hook|outro|coda)\s*([0-9]+)?$/i
  )
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
    const match = trimmed.match(SECTION_HEADER_PATTERN)
    if (match) {
      const label = normalizeSectionLabel(
        match[1] || `${match[2] || 'Section'} ${match[3] || ''}`.trim(),
        sections.length
      )
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
 * Chords-only: keep only lines that have [chord] tokens,
 * extract just the chord names (no lyric text, no brackets).
 */
function extractChordsOnly(content: string): string {
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    const matches = [...line.matchAll(/\[([^\]]+)\]/g)]
    if (matches.length > 0) out.push(matches.map(m => m[1]).join('  '))
  }
  return out.join('\n')
}

/** Both mode: strip [] but keep chord text inline with lyrics. */
function renderBoth(content: string): string {
  return content.replace(/\[([^\]]+)\]/g, '$1 ')
}

const SCROLL_SPEEDS = [
  { label: 'Slow', value: 20 },
  { label: 'Med', value: 45 },
  { label: 'Fast', value: 80 },
]

// ─── Per-song content viewer (handles sections, scroll, auto-scroll) ──────────

interface SongPageProps {
  song: any
  index: number
  transposeKey: string
  viewMode: 'lyrics' | 'chords' | 'both'
  fontSize: number
  isActive: boolean
  scrollSpeedIndex: number
  isAutoScrolling: boolean
  onAutoScrollEnd: () => void
  onAutoScrollStopped: () => void
}

function SongPage({
  song,
  index,
  transposeKey,
  viewMode,
  fontSize,
  isActive,
  scrollSpeedIndex,
  isAutoScrolling,
  onAutoScrollEnd,
  onAutoScrollStopped,
}: SongPageProps) {
  const contentScrollRef    = useRef<ScrollView | null>(null)
  const sectionNavScrollRef = useRef<ScrollView | null>(null)
  const sectionOffsetsRef     = useRef<Record<string, number>>({})
  const sectionPillOffsetsRef = useRef<Record<string, number>>({})
  const scrollYRef          = useRef(0)
  const contentHeightRef    = useRef(0)
  const scrollViewHeightRef = useRef(0)
  const autoScrollRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  // Build display content
  const displayContent = useMemo(() => {
    if (!song?.content) return ''
    const originalKey = song.key || 'C'
    const semitones = getTransposeDistance(originalKey, transposeKey)
    let content = semitones !== 0 ? transposeText(song.content, semitones) : song.content

    if (viewMode === 'lyrics') return content.replace(/\[([^\]]+)\]/g, '').trim()
    if (viewMode === 'chords') return extractChordsOnly(content)
    return content
  }, [song, transposeKey, viewMode])

  const parsedSections = useMemo(() => parseSongSections(displayContent), [displayContent])
  const hasSections = parsedSections.length > 1

  // Reset scroll when content changes
  useEffect(() => {
    sectionOffsetsRef.current = {}
    sectionPillOffsetsRef.current = {}
    setActiveSectionId(parsedSections[0]?.id ?? null)
    contentScrollRef.current?.scrollTo({ y: 0, animated: false })
    scrollYRef.current = 0
  }, [displayContent])

  // Auto-scroll: start/stop based on isActive + isAutoScrolling
  useEffect(() => {
    if (!isActive || !isAutoScrolling) {
      if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null }
      return
    }
    if (autoScrollRef.current) clearInterval(autoScrollRef.current)
    const speed = SCROLL_SPEEDS[scrollSpeedIndex].value
    const interval = 16
    const pixelsPerTick = (speed * interval) / 1000
    autoScrollRef.current = setInterval(() => {
      const maxScroll = contentHeightRef.current - scrollViewHeightRef.current
      if (scrollYRef.current >= maxScroll - 1) {
        clearInterval(autoScrollRef.current!)
        autoScrollRef.current = null
        onAutoScrollEnd()
        return
      }
      scrollYRef.current = Math.min(scrollYRef.current + pixelsPerTick, maxScroll)
      contentScrollRef.current?.scrollTo({ y: scrollYRef.current, animated: false })
    }, interval)
    return () => { if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null } }
  }, [isActive, isAutoScrolling, scrollSpeedIndex])

  const scrollToSection = (sectionId: string) => {
    setActiveSectionId(sectionId)
    const offset = sectionOffsetsRef.current[sectionId]
    if (typeof offset === 'number') {
      const y = Math.max(0, offset - 12)
      scrollYRef.current = y
      contentScrollRef.current?.scrollTo({ y, animated: true })
    }
    const pillX = sectionPillOffsetsRef.current[sectionId]
    if (typeof pillX === 'number') {
      sectionNavScrollRef.current?.scrollTo({ x: Math.max(0, pillX - 60), animated: true })
    }
  }

  const handleContentScroll = useCallback((e: any) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y
    const scrollY = e.nativeEvent.contentOffset.y
    let activeId = parsedSections[0]?.id ?? null
    for (const section of parsedSections) {
      const top = sectionOffsetsRef.current[section.id]
      if (typeof top === 'number' && scrollY >= top - 40) activeId = section.id
    }
    if (activeId !== activeSectionId) {
      setActiveSectionId(activeId)
      if (activeId) {
        const pillX = sectionPillOffsetsRef.current[activeId]
        if (typeof pillX === 'number') {
          sectionNavScrollRef.current?.scrollTo({ x: Math.max(0, pillX - 60), animated: true })
        }
      }
    }
    // If user scrolls manually during auto-scroll, stop it
    if (isAutoScrolling) onAutoScrollStopped()
  }, [parsedSections, activeSectionId, isAutoScrolling])

  const renderSectionContent = (content: string) => {
    if (viewMode === 'both') return renderBoth(content)
    return content
  }

  return (
    <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
      {/* Section Navigator */}
      {hasSections && (
        <View style={s.sectionNavBar}>
          <ScrollView
            ref={sectionNavScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.sectionNavContent}
          >
            {parsedSections.map((section, idx) => {
              const isActivePill = section.id === activeSectionId
              return (
                <TouchableOpacity
                  key={section.id}
                  style={[s.sectionPill, isActivePill && s.sectionPillActive]}
                  onPress={() => scrollToSection(section.id)}
                  activeOpacity={0.7}
                  onLayout={e => { sectionPillOffsetsRef.current[section.id] = e.nativeEvent.layout.x }}
                >
                  <View style={[s.sectionPillIdx, isActivePill && s.sectionPillIdxActive]}>
                    <Text style={[s.sectionPillIdxText, isActivePill && s.sectionPillIdxTextActive]}>
                      {idx + 1}
                    </Text>
                  </View>
                  <Text
                    style={[s.sectionPillText, isActivePill && s.sectionPillTextActive]}
                    numberOfLines={1}
                  >
                    {section.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      )}

      {/* Song content */}
      <ScrollView
        ref={contentScrollRef}
        style={s.contentScroll}
        contentContainerStyle={s.contentPad}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleContentScroll}
        onContentSizeChange={(_, h) => { contentHeightRef.current = h }}
        onLayout={e => { scrollViewHeightRef.current = e.nativeEvent.layout.height }}
      >
        <View style={s.songHeaderBlock}>
          <Text style={[s.songHeaderTitle, { fontSize: fontSize + 4 }]} numberOfLines={2}>
            {song?.title}
          </Text>
          <View style={s.keyBadgeInline}>
            <Text style={s.keyBadgeInlineText}>Key of {transposeKey}</Text>
          </View>
        </View>

        <View style={s.sectionList}>
          {parsedSections.map(section => (
            <View
              key={section.id}
              style={[s.sectionBlock, activeSectionId === section.id && s.sectionBlockActive]}
              onLayout={event => { sectionOffsetsRef.current[section.id] = event.nativeEvent.layout.y }}
            >
              <View style={s.sectionBadge}>
                <Text style={s.sectionBadgeText}>{section.label}</Text>
              </View>
              <Text style={[s.content, { fontSize, lineHeight: fontSize * 1.85 }]}>
                {renderSectionContent(section.content)}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface SongViewerProps {
  visible: boolean
  songs: any[]
  startIndex: number
  onClose: () => void
}

export function PlaylistSongViewerModal({ visible, songs, startIndex, onClose }: SongViewerProps) {
  const scrollRef = useRef<any>(null)
  const [currentIndex, setCurrentIndex]     = useState(0)
  const [transposeKeys, setTransposeKeys]   = useState<string[]>([])
  const [viewMode, setViewMode]             = useState<'lyrics' | 'chords' | 'both'>('both')
  const [fontSize, setFontSize]             = useState(15)
  const [showTransposePicker, setShowTransposePicker] = useState(false)
  const [isAutoScrolling, setIsAutoScrolling] = useState(false)
  const [scrollSpeedIndex, setScrollSpeedIndex] = useState(0)
  const scrollFadeAnim = useRef(new Animated.Value(0)).current

  // Keep refs for use inside callbacks
  const currentIndexRef = useRef(0)
  currentIndexRef.current = currentIndex

  useEffect(() => {
    if (visible && songs.length > 0) {
      setTransposeKeys(songs.map(s => s.key || 'C'))
      setCurrentIndex(startIndex)
      setViewMode('both')
      setIsAutoScrolling(false)
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: startIndex * SCREEN_WIDTH, animated: false })
      }, 50)
    }
  }, [visible, songs, startIndex])

  // Stop auto-scroll on song/mode change
  useEffect(() => { setIsAutoScrolling(false) }, [currentIndex, viewMode])

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
    if (index !== currentIndexRef.current) {
      setCurrentIndex(index)
      setIsAutoScrolling(false)
    }
  }

  const updateTransposeKey = (index: number, key: string) => {
    setTransposeKeys(prev => { const next = [...prev]; next[index] = key; return next })
  }

  const toggleAutoScroll = () => {
    const next = !isAutoScrolling
    setIsAutoScrolling(next)
    Animated.timing(scrollFadeAnim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start()
  }

  const handleAutoScrollEnd = useCallback(() => {
    const cur = currentIndexRef.current
    if (cur < songs.length - 1) {
      // Advance to next song, restart auto-scroll after brief pause
      const next = cur + 1
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true })
      setCurrentIndex(next)
      setTimeout(() => {
        setIsAutoScrolling(true)
        Animated.timing(scrollFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
      }, 1200)
    } else {
      setIsAutoScrolling(false)
      Animated.timing(scrollFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    }
  }, [songs.length])

  const handleAutoScrollStopped = useCallback(() => {
    setIsAutoScrolling(false)
    Animated.timing(scrollFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
  }, [])

  const currentSong  = songs[currentIndex]
  const originalKey  = currentSong?.key || 'C'
  const targetKey    = transposeKeys[currentIndex] || originalKey
  const isTransposed = originalKey !== targetKey

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={s.root}>

        {/* ── TOP HEADER ── */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={onClose} style={s.iconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-down" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <Text style={s.songCounter}>{currentIndex + 1} / {songs.length}</Text>
            <Text style={s.songTitle} numberOfLines={1}>{currentSong?.title ?? ''}</Text>
            {currentSong?.artist ? (
              <Text style={s.songArtist} numberOfLines={1}>{currentSong.artist}</Text>
            ) : null}
          </View>

          {/* Font size + auto-scroll controls */}
          <View style={s.headerRight}>
            <TouchableOpacity style={s.fontBtn} onPress={() => setFontSize(f => Math.max(11, f - 1))}>
              <Text style={s.fontBtnText}>A−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.fontBtn} onPress={() => setFontSize(f => Math.min(24, f + 1))}>
              <Text style={s.fontBtnTextLg}>A+</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.autoScrollBtn, isAutoScrolling && s.autoScrollBtnActive]}
              onPress={toggleAutoScroll}
            >
              <Ionicons
                name={isAutoScrolling ? 'pause' : 'play'}
                size={12}
                color={isAutoScrolling ? '#0a0a0a' : 'rgba(255,255,255,0.6)'}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.hairline} />

        {/* ── CONTROLS ROW: mode + transpose + speed ── */}
        <View style={s.controlsRow}>
          {/* View mode pills */}
          <View style={s.modeBar}>
            {(['lyrics', 'chords', 'both'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[s.modeTab, viewMode === mode && s.modeTabActive]}
                onPress={() => setViewMode(mode)}
                activeOpacity={0.7}
              >
                <Text style={[s.modeTabText, viewMode === mode && s.modeTabTextActive]}>
                  {mode === 'both' ? 'Both' : mode === 'chords' ? 'Chords' : 'Lyrics'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Transpose chip */}
          <TouchableOpacity
            style={s.transposeChip}
            onPress={() => setShowTransposePicker(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="musical-notes" size={11} color="rgba(255,255,255,0.5)" style={{ marginRight: 5 }} />
            <Text style={s.transposeChipText}>
              {originalKey}{isTransposed ? ` → ${targetKey}` : ''}
            </Text>
            <Ionicons name="chevron-down" size={10} color="rgba(255,255,255,0.3)" style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        </View>

        {/* Speed pills — only shown when auto-scrolling or recently toggled */}
        <Animated.View style={[s.speedRow, { opacity: scrollFadeAnim }]} pointerEvents={isAutoScrolling ? 'auto' : 'none'}>
          <Ionicons name="refresh" size={10} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
          <Text style={s.speedLabel}>Speed:</Text>
          {SCROLL_SPEEDS.map((sp, i) => (
            <TouchableOpacity
              key={sp.label}
              style={[s.speedPill, scrollSpeedIndex === i && s.speedPillActive]}
              onPress={() => setScrollSpeedIndex(i)}
              activeOpacity={0.75}
            >
              <Text style={[s.speedPillText, scrollSpeedIndex === i && s.speedPillTextActive]}>
                {sp.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* ── SWIPEABLE PAGES ── */}
        <HorizontalScroll
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={{ flex: 1 }}
          scrollEventThrottle={16}
        >
          {songs.map((song, index) => (
            <SongPage
              key={song.id ?? index}
              song={song}
              index={index}
              transposeKey={transposeKeys[index] || song.key || 'C'}
              viewMode={viewMode}
              fontSize={fontSize}
              isActive={index === currentIndex}
              scrollSpeedIndex={scrollSpeedIndex}
              isAutoScrolling={isAutoScrolling && index === currentIndex}
              onAutoScrollEnd={handleAutoScrollEnd}
              onAutoScrollStopped={handleAutoScrollStopped}
            />
          ))}
        </HorizontalScroll>

        {/* ── BOTTOM BAR ── */}
        <View style={s.bottomBar}>
          {songs.length > 1 && (
            <View style={s.dots}>
              {songs.map((_, i) => (
                <View key={i} style={[s.dot, i === currentIndex && s.dotActive]} />
              ))}
            </View>
          )}
          {songs.length > 1 && (
            <View style={s.navRow}>
              <TouchableOpacity
                style={[s.navBtn, currentIndex === 0 && s.navBtnDisabled]}
                onPress={() => {
                  if (currentIndex > 0) {
                    const next = currentIndex - 1
                    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true })
                    setCurrentIndex(next)
                  }
                }}
                disabled={currentIndex === 0}
              >
                <Ionicons name="chevron-back" size={18} color={currentIndex === 0 ? 'rgba(255,255,255,0.2)' : '#fff'} />
                <Text style={[s.navBtnText, currentIndex === 0 && s.navBtnTextDisabled]}>PREV</Text>
              </TouchableOpacity>

              <Text style={s.swipeHint}>swipe to navigate</Text>

              <TouchableOpacity
                style={[s.navBtn, currentIndex === songs.length - 1 && s.navBtnDisabled]}
                onPress={() => {
                  if (currentIndex < songs.length - 1) {
                    const next = currentIndex + 1
                    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true })
                    setCurrentIndex(next)
                  }
                }}
                disabled={currentIndex === songs.length - 1}
              >
                <Text style={[s.navBtnText, currentIndex === songs.length - 1 && s.navBtnTextDisabled]}>NEXT</Text>
                <Ionicons name="chevron-forward" size={18} color={currentIndex === songs.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff'} />
              </TouchableOpacity>
            </View>
          )}
        </View>

      </View>

      {/* ── TRANSPOSE MODAL ── */}
      <Modal visible={showTransposePicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHead}>
              <TouchableOpacity onPress={() => setShowTransposePicker(false)}>
                <Text style={s.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.modalTitle}>Transpose Key</Text>
              <TouchableOpacity onPress={() => setShowTransposePicker(false)}>
                <Text style={s.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={s.transposeInfo}>
              <Text style={s.transposeInfoText}>
                {`Original: ${originalKey}   →   Target: ${targetKey}`}
              </Text>
            </View>
            <View style={s.keyGrid}>
              {getAllKeys().map(key => (
                <TouchableOpacity
                  key={key}
                  style={[s.keyCell, targetKey === key && s.keyCellActive]}
                  onPress={() => updateTransposeKey(currentIndex, key)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.keyCellText, targetKey === key && s.keyCellTextActive]}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 58 : 40,
    paddingBottom: 14, paddingHorizontal: 20, backgroundColor: '#0a0a0a',
  },
  iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  songCounter: {
    fontSize: 10, letterSpacing: 2.5, color: 'rgba(255,255,255,0.35)',
    fontWeight: '600', marginBottom: 5, textTransform: 'uppercase',
  },
  songTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', letterSpacing: 0.3, textAlign: 'center' },
  songArtist: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3, letterSpacing: 1, textTransform: 'uppercase' },
  headerRight: { width: 72, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
  fontBtn: { padding: 4 },
  fontBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  fontBtnTextLg: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  autoScrollBtn: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  autoScrollBtnActive: { backgroundColor: '#ffffff' },

  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 20 },

  // Controls row
  controlsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  modeBar: {
    flex: 1, flexDirection: 'row',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6, overflow: 'hidden',
  },
  modeTab: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: 'transparent' },
  modeTabActive: { backgroundColor: '#ffffff' },
  modeTabText: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
  },
  modeTabTextActive: { color: '#0a0a0a' },
  transposeChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  transposeChipText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.3 },

  // Speed row
  speedRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 8, gap: 6,
  },
  speedLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: '600', letterSpacing: 1 },
  speedPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  speedPillActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  speedPillText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  speedPillTextActive: { color: '#0a0a0a' },

  // Section navigator
  sectionNavBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
  },
  sectionNavContent: { paddingHorizontal: 14, gap: 6, flexDirection: 'row', alignItems: 'center' },
  sectionPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 5,
  },
  sectionPillActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  sectionPillIdx: {
    width: 15, height: 15, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionPillIdxActive: { backgroundColor: 'rgba(0,0,0,0.2)' },
  sectionPillIdxText: { fontSize: 8, fontWeight: '800', color: 'rgba(255,255,255,0.6)' },
  sectionPillIdxTextActive: { color: '#0a0a0a' },
  sectionPillText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', maxWidth: 80 },
  sectionPillTextActive: { color: '#0a0a0a' },

  // Song header inside content
  songHeaderBlock: { marginBottom: 18, gap: 8 },
  songHeaderTitle: { fontWeight: '800', color: '#ffffff', letterSpacing: -0.5, lineHeight: 28 },
  keyBadgeInline: {
    alignSelf: 'flex-start', backgroundColor: '#ffffff',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  keyBadgeInlineText: { fontSize: 11, fontWeight: '700', color: '#0a0a0a', letterSpacing: 0.5 },

  // Sections
  sectionList: { gap: 16 },
  sectionBlock: {
    gap: 8, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  sectionBlockActive: { borderBottomColor: 'rgba(255,255,255,0.4)' },
  sectionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionBadgeText: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 },

  // Content
  contentScroll: { flex: 1 },
  contentPad: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 },
  content: {
    color: '#f5f5f5',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '400', letterSpacing: 0.2,
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: '#0a0a0a',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingTop: 12,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginBottom: 12 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { backgroundColor: '#ffffff', width: 20, borderRadius: 2.5 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4 },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: '#fff' },
  navBtnTextDisabled: { color: 'rgba(255,255,255,0.2)' },
  swipeHint: { fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' },

  // Transpose modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: -0.3 },
  modalCancel: { fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: '500', minWidth: 54 },
  modalDone: { fontSize: 14, fontWeight: '700', color: '#ffffff', minWidth: 54, textAlign: 'right' },
  transposeInfo: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', alignItems: 'center',
  },
  transposeInfoText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 16, gap: 8 },
  keyCell: {
    width: '22%', paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  keyCellActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  keyCellText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  keyCellTextActive: { color: '#0a0a0a' },
})