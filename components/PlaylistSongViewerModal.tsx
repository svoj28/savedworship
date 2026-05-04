import React, { useEffect, useState, useRef } from 'react'
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
} from 'react-native'
import { ScrollView as HorizontalScroll } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Picker } from '@react-native-picker/picker'
import { getAllKeys, getTransposeDistance, transposeText } from '../lib/transpose'

const SCREEN_WIDTH = Dimensions.get('window').width

interface SongViewerProps {
  visible: boolean
  songs: any[]
  startIndex: number
  onClose: () => void
}

export function PlaylistSongViewerModal({ visible, songs, startIndex, onClose }: SongViewerProps) {
  const scrollRef = useRef<any>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [transposeKeys, setTransposeKeys] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'lyrics' | 'chords' | 'both'>('both')
  const [fontSize, setFontSize] = useState(15)

  useEffect(() => {
    if (visible && songs.length > 0) {
      setTransposeKeys(songs.map(s => s.key || 'C'))
      setCurrentIndex(startIndex)
      setViewMode('both')
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          x: startIndex * SCREEN_WIDTH,
          animated: false,
        })
      }, 50)
    }
  }, [visible, songs, startIndex])

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
    setCurrentIndex(index)
  }

  const getDisplayContent = (song: any, index: number) => {
    if (!song?.content) return ''
    const originalKey = song.key || 'C'
    const targetKey = transposeKeys[index] || originalKey
    const semitones = getTransposeDistance(originalKey, targetKey)
    let content = semitones !== 0 ? transposeText(song.content, semitones) : song.content

    if (viewMode === 'lyrics') {
      return content.replace(/\[([^\]]+)\]/g, '').trim()
    } else if (viewMode === 'chords') {
      const chords: string[] = []
      for (const match of content.matchAll(/\[([^\]]+)\]/g)) {
        chords.push(match[1])
      }
      return `Chords Used:\n\n${chords.join('   •   ')}`
    }
    return content
  }

  const updateTransposeKey = (index: number, key: string) => {
    setTransposeKeys(prev => {
      const next = [...prev]
      next[index] = key
      return next
    })
  }

  const currentSong = songs[currentIndex]
  const originalKey = currentSong?.key || 'C'
  const targetKey = transposeKeys[currentIndex] || originalKey
  const isTransposed = originalKey !== targetKey

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={s.root}>

        {/* ── TOP HEADER ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <Text style={s.songCounter}>{currentIndex + 1} / {songs.length}</Text>
            <Text style={s.songTitle} numberOfLines={1}>{currentSong?.title ?? ''}</Text>
            {currentSong?.artist ? (
              <Text style={s.songArtist} numberOfLines={1}>{currentSong.artist}</Text>
            ) : null}
          </View>

          {/* Font size controls */}
          <View style={s.fontControls}>
            <TouchableOpacity
              style={s.fontBtn}
              onPress={() => setFontSize(f => Math.max(11, f - 1))}
            >
              <Text style={s.fontBtnText}>A−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.fontBtn}
              onPress={() => setFontSize(f => Math.min(24, f + 1))}
            >
              <Text style={s.fontBtnTextLg}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── DIVIDER ── */}
        <View style={s.hairline} />

        {/* ── MODE SELECTOR ── */}
        <View style={s.modeBar}>
          {(['lyrics', 'chords', 'both'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[s.modeTab, viewMode === mode && s.modeTabActive]}
              onPress={() => setViewMode(mode)}
              activeOpacity={0.7}
            >
              <Text style={[s.modeTabText, viewMode === mode && s.modeTabTextActive]}>
                {mode === 'both' ? 'Lyrics + Chords' : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
            <View key={song.id ?? index} style={{ width: SCREEN_WIDTH, flex: 1 }}>

              {/* Transpose Bar */}
              <View style={s.transposeBar}>
                <View style={s.transposeLeft}>
                  <Text style={s.transposeCaption}>KEY</Text>
                  <View style={s.keyBadgeRow}>
                    <View style={s.keyBadge}>
                      <Text style={s.keyBadgeText}>{song.key || 'C'}</Text>
                    </View>
                    {isTransposed && index === currentIndex && (
                      <>
                        <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.4)" style={{ marginHorizontal: 6 }} />
                        <View style={[s.keyBadge, s.keyBadgeTransposed]}>
                          <Text style={[s.keyBadgeText, s.keyBadgeTextTransposed]}>
                            {transposeKeys[index] || song.key || 'C'}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>

                <View style={s.transposeRight}>
                  <Text style={s.transposeCaption}>TRANSPOSE TO</Text>
                  <Picker
                    style={s.picker}
                    dropdownIconColor="#fff"
                    selectedValue={transposeKeys[index] || song.key || 'C'}
                    onValueChange={(val) => updateTransposeKey(index, val)}
                    mode="dropdown"
                  >
                    {getAllKeys().map(k => (
                      <Picker.Item key={k} label={k} value={k} color={Platform.OS === 'ios' ? '#000' : '#fff'} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={s.contentDivider} />

              {/* Content */}
              <ScrollView
                style={s.contentScroll}
                contentContainerStyle={s.contentPad}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[s.content, { fontSize, lineHeight: fontSize * 1.85 }]}>
                  {getDisplayContent(song, index)}
                </Text>
              </ScrollView>
            </View>
          ))}
        </HorizontalScroll>

        {/* ── BOTTOM BAR ── */}
        <View style={s.bottomBar}>
          {/* Dot indicators */}
          {songs.length > 1 && (
            <View style={s.dots}>
              {songs.map((_, i) => (
                <View
                  key={i}
                  style={[s.dot, i === currentIndex && s.dotActive]}
                />
              ))}
            </View>
          )}

          {/* Navigation arrows (shown when multiple songs) */}
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
    </Modal>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 58 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#0a0a0a',
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  songCounter: {
    fontSize: 10,
    letterSpacing: 2.5,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  songTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  songArtist: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 3,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fontControls: {
    width: 60,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  fontBtn: {
    padding: 4,
  },
  fontBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  fontBtnTextLg: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 20,
  },

  // ── Mode Bar ──
  modeBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  modeTabActive: {
    backgroundColor: '#ffffff',
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  modeTabTextActive: {
    color: '#0a0a0a',
  },

  // ── Transpose ──
  transposeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  transposeLeft: {
    flex: 1,
  },
  transposeRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  transposeCaption: {
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '700',
    marginBottom: 5,
  },
  keyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  keyBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  keyBadgeTransposed: {
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  keyBadgeTextTransposed: {
    color: '#0a0a0a',
  },
  picker: {
    width: 130,
    height: 36,
    color: '#fff',
    marginTop: Platform.OS === 'android' ? -8 : 0,
  },

  contentDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 0,
  },

  // ── Content ──
  contentScroll: {
    flex: 1,
  },
  contentPad: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
  },
  content: {
    color: '#f5f5f5',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '400',
    letterSpacing: 0.2,
  },

  // ── Bottom Bar ──
  bottomBar: {
    backgroundColor: '#0a0a0a',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingTop: 12,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
    width: 20,
    borderRadius: 2.5,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#fff',
  },
  navBtnTextDisabled: {
    color: 'rgba(255,255,255,0.2)',
  },
  swipeHint: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.2)',
    textTransform: 'uppercase',
  },
})