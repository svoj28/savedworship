import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
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
  const scrollRef = React.useRef<any>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [transposeKeys, setTransposeKeys] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'lyrics' | 'chords' | 'both'>('both')

  // Initialize transpose keys and scroll to start index
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
      return `Chords: ${chords.join(', ')}`
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

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide">
      <View style={viewerStyles.container}>

        {/* Header */}
        <View style={viewerStyles.header}>
          <TouchableOpacity onPress={onClose} style={viewerStyles.closeButton}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={viewerStyles.headerCenter}>
            <Text style={viewerStyles.headerTitle} numberOfLines={1}>
              {songs[currentIndex]?.title ?? ''}
            </Text>
            <Text style={viewerStyles.headerSub}>
              {currentIndex + 1} of {songs.length}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* View Mode Tabs */}
        <View style={viewerStyles.modeBar}>
          {(['lyrics', 'chords', 'both'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[viewerStyles.modeTab, viewMode === mode && viewerStyles.modeTabActive]}
              onPress={() => setViewMode(mode)}
            >
              <Text style={[viewerStyles.modeTabText, viewMode === mode && viewerStyles.modeTabTextActive]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Swipeable Song Pages */}
        <HorizontalScroll
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={{ flex: 1 }}
        >
          {songs.map((song, index) => (
            <View key={song.id ?? index} style={{ width: SCREEN_WIDTH, flex: 1 }}>

              {/* Transpose Row */}
              <View style={viewerStyles.transposeRow}>
                <Text style={viewerStyles.transposeLabel}>
                  {song.key || 'C'} → {transposeKeys[index] || song.key || 'C'}
                </Text>
                <Picker
                  style={viewerStyles.picker}
                  selectedValue={transposeKeys[index] || song.key || 'C'}
                  onValueChange={(val) => updateTransposeKey(index, val)}
                >
                  {getAllKeys().map(k => (
                    <Picker.Item key={k} label={k} value={k} />
                  ))}
                </Picker>
              </View>

              {/* Lyrics/Chords Content */}
              <ScrollView
                style={viewerStyles.contentScroll}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              >
                <Text style={viewerStyles.content}>
                  {getDisplayContent(song, index)}
                </Text>
              </ScrollView>
            </View>
          ))}
        </HorizontalScroll>

        {/* Swipe hint dots */}
        {songs.length > 1 && (
          <View style={viewerStyles.dots}>
            {songs.map((_, i) => (
              <View
                key={i}
                style={[viewerStyles.dot, i === currentIndex && viewerStyles.dotActive]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  )
}

const viewerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 55,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a2e',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  modeBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 3,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#007AFF',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  modeTabTextActive: {
    color: '#fff',
  },
  transposeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    paddingLeft: 12,
  },
  transposeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    minWidth: 80,
  },
  picker: {
    flex: 1,
    color: '#fff',
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    fontSize: 15,
    lineHeight: 26,
    color: '#f0f0f0',
    fontFamily: 'Courier New',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    backgroundColor: '#1a1a2e',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: '#007AFF',
    width: 18,
  },
})