// screens/VocalRemoverScreenNew.tsx
import React, { useState, useEffect } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
} from 'react-native'
import Slider from '@react-native-community/slider'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  AudioRemovalService,
  RemovalType,
  InstrumentType,
  RemovalProgress,
} from '../lib/audioRemovalService'
import { Audio } from 'expo-av'

type RemovalMode = 'vocal' | 'instrument'

interface Instrument {
  id: InstrumentType
  name: string
  icon: string
  color: string
}

const instruments: Instrument[] = [
  { id: 'drums', name: 'Drums', icon: 'musical-notes', color: '#FF6B6B' },
  { id: 'bass', name: 'Bass Guitar', icon: 'guitar', color: '#4ECDC4' },
  { id: 'electric_guitar', name: 'Electric Guitar', icon: 'bolt', color: '#FFE66D' },
  { id: 'acoustic_guitar', name: 'Acoustic Guitar', icon: 'musical-note', color: '#95E1D3' },
  { id: 'keyboard', name: 'Keyboard', icon: 'square', color: '#9B59B6' },
]

export default function VocalRemoverScreenNew() {
  const [currentTab, setCurrentTab] = useState<'processor' | 'tools'>('processor')
  const [removalMode, setRemovalMode] = useState<RemovalMode>('vocal')
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<RemovalProgress>({
    status: 'idle',
    progress: 0,
    message: '',
  })
  const [selectedAudioUri, setSelectedAudioUri] = useState<string | null>(null)
  const [selectedAudioName, setSelectedAudioName] = useState<string | null>(null)
  const [processedAudioUri, setProcessedAudioUri] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackPosition, setPlaybackPosition] = useState(0)
  const [playbackDuration, setPlaybackDuration] = useState(0)
  // Backend removed: instantiate without remote backend URL
  const removalService = new AudioRemovalService()

  useEffect(() => {
    return () => {
      removalService.cleanup()
    }
  }, [])

  useEffect(() => {
    removalService.setProgressCallback((update) => {
      setProgress(update)
    })
  }, [])

  const handlePickAudio = async () => {
    try {
      const audioUri = await removalService.pickAudioFile()
      if (audioUri) {
        const fileName = audioUri.split('/').pop() || 'audio.m4a'
        setSelectedAudioUri(audioUri)
        setSelectedAudioName(fileName)
        setProcessedAudioUri(null)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick audio file')
    }
  }

  const handleProcessAudio = async () => {
    if (!selectedAudioUri) {
      Alert.alert('Error', 'Please select an audio file first')
      return
    }

    if (removalMode === 'instrument' && !selectedInstrument) {
      Alert.alert('Error', 'Please select an instrument to remove')
      return
    }

    try {
      setIsProcessing(true)
      const processed = await removalService.removeVocalOrInstrument(selectedAudioUri, {
        removalType: removalMode,
        instrument: removalMode === 'instrument' ? selectedInstrument || undefined : undefined,
      })

      setProcessedAudioUri(processed)
      await removalService.loadAudio(processed)

      // Subscribe to playback updates
      removalService.subscribeToStatusUpdates((status) => {
        if (status.isLoaded) {
          setPlaybackDuration(status.durationMillis || 0)
          setPlaybackPosition(status.positionMillis || 0)
          setIsPlaying(status.isPlaying)
        }
      })

      Alert.alert('Success', 'Audio processing completed! Ready to play.')
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Processing failed')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        await removalService.pause()
        setIsPlaying(false)
      } else {
        await removalService.play()
        setIsPlaying(true)
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to control playback')
    }
  }

  const handleSeek = async (value: number) => {
    try {
      await removalService.seek(value)
    } catch (error) {
      console.error('Seek error:', error)
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`
  }

  const handleOpenTool = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url)
      if (supported) {
        await Linking.openURL(url)
      } else {
        Alert.alert('Error', 'Cannot open URL')
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to open link')
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Vocal & Instrument Remover</Text>
        <Text style={styles.subtitle}>Remove or isolate audio components</Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'processor' && styles.tabActive]}
          onPress={() => setCurrentTab('processor')}
        >
          <Ionicons name="musical-notes" size={18} color={currentTab === 'processor' ? '#007AFF' : '#999'} />
          <Text style={[styles.tabText, currentTab === 'processor' && styles.tabTextActive]}>
            Processor
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'tools' && styles.tabActive]}
          onPress={() => setCurrentTab('tools')}
        >
          <Ionicons name="grid" size={18} color={currentTab === 'tools' ? '#007AFF' : '#999'} />
          <Text style={[styles.tabText, currentTab === 'tools' && styles.tabTextActive]}>
            Online Tools
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {currentTab === 'processor' ? (
          <>
            {/* File Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>1. Select Audio File</Text>
              <TouchableOpacity style={styles.fileButton} onPress={handlePickAudio}>
                <Ionicons name="cloud-upload" size={24} color="#007AFF" />
                <View style={styles.fileButtonText}>
                  <Text style={styles.fileButtonTitle}>
                    {selectedAudioName || 'Choose Audio File'}
                  </Text>
                  <Text style={styles.fileButtonSubtitle}>
                    {selectedAudioName ? 'File selected' : 'MP3, WAV, M4A, AAC'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Removal Type Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>2. Select Removal Type</Text>
              <View style={styles.removalTypeContainer}>
                <TouchableOpacity
                  style={[
                    styles.removalTypeButton,
                    removalMode === 'vocal' && styles.removalTypeButtonActive,
                  ]}
                  onPress={() => {
                    setRemovalMode('vocal')
                    setSelectedInstrument(null)
                  }}
                >
                  <Ionicons
                    name="mic"
                    size={28}
                    color={removalMode === 'vocal' ? '#007AFF' : '#999'}
                  />
                  <Text
                    style={[
                      styles.removalTypeTitle,
                      removalMode === 'vocal' && styles.removalTypeTitleActive,
                    ]}
                  >
                    Remove Vocals
                  </Text>
                  <Text style={styles.removalTypeDescription}>Get instrumental version</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.removalTypeButton,
                    removalMode === 'instrument' && styles.removalTypeButtonActive,
                  ]}
                  onPress={() => setRemovalMode('instrument')}
                >
                  <Ionicons
                    name="musical-notes"
                    size={28}
                    color={removalMode === 'instrument' ? '#007AFF' : '#999'}
                  />
                  <Text
                    style={[
                      styles.removalTypeTitle,
                      removalMode === 'instrument' && styles.removalTypeTitleActive,
                    ]}
                  >
                    Remove Instrument
                  </Text>
                  <Text style={styles.removalTypeDescription}>Select specific instrument</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Instrument Selection */}
            {removalMode === 'instrument' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>3. Choose Instrument to Remove</Text>
                <View style={styles.instrumentGrid}>
                  {instruments.map((instrument) => (
                    <TouchableOpacity
                      key={instrument.id}
                      style={[
                        styles.instrumentCard,
                        selectedInstrument === instrument.id && styles.instrumentCardActive,
                        { borderLeftColor: instrument.color },
                      ]}
                      onPress={() => setSelectedInstrument(instrument.id)}
                    >
                      <View style={[styles.instrumentIcon, { backgroundColor: instrument.color }]}>
                        <Ionicons name={instrument.icon as any} size={24} color="#fff" />
                      </View>
                      <Text style={styles.instrumentName}>{instrument.name}</Text>
                      {selectedInstrument === instrument.id && (
                        <Ionicons name="checkmark-circle" size={20} color={instrument.color} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Process Button */}
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.processButton, isProcessing && styles.processButtonDisabled]}
                onPress={handleProcessAudio}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.processButtonText}>{progress.message}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="play-circle" size={24} color="#fff" />
                    <Text style={styles.processButtonText}>Process Audio</Text>
                  </>
                )}
              </TouchableOpacity>

              {isProcessing && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progress.progress}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>{Math.round(progress.progress)}%</Text>
                </View>
              )}
            </View>

            {/* Audio Player */}
            {processedAudioUri && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>4. Play Result</Text>
                <View style={styles.playerContainer}>
                  <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
                    <Ionicons
                      name={isPlaying ? 'pause-circle' : 'play-circle'}
                      size={48}
                      color="#007AFF"
                    />
                  </TouchableOpacity>

                  <View style={styles.playerControls}>
                    <Text style={styles.timeText}>{formatTime(playbackPosition)}</Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={playbackDuration}
                      value={playbackPosition}
                      onValueChange={handleSeek}
                      minimumTrackTintColor="#007AFF"
                      maximumTrackTintColor="#ddd"
                      thumbTintColor="#007AFF"
                    />
                    <Text style={styles.timeText}>{formatTime(playbackDuration)}</Text>
                  </View>
                </View>

                <View style={styles.infoContainer}>
                  <Ionicons name="information-circle" size={20} color="#17C" />
                  <Text style={styles.infoText}>
                    The quality of removal depends on your audio file and the tool used.
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Online Tools */}
            <View style={styles.toolsGrid}>
              <ToolCard
                title="Remove-Vocals.com"
                description="Simple & fast vocal removal"
                features={['Free', 'No signup', 'Fast']}
                color="#FF6B6B"
                url="https://www.remove-vocals.com/"
                onPress={() => handleOpenTool('https://www.remove-vocals.com/')}
              />

              <ToolCard
                title="Vocal-Remover.org"
                description="AI-powered vocal extraction"
                features={['AI tech', 'High quality', 'Batch']}
                color="#4ECDC4"
                url="https://www.vocal-remover.org/"
                onPress={() => handleOpenTool('https://www.vocal-remover.org/')}
              />

              <ToolCard
                title="Splitter AI"
                description="Advanced stem separation"
                features={['Pro quality', 'Multiple stems', 'API']}
                color="#45B7D1"
                url="https://www.splitter.ai/"
                onPress={() => handleOpenTool('https://www.splitter.ai/')}
              />

              <ToolCard
                title="LALAL.AI"
                description="Neural network stem splitter"
                features={['Neural AI', 'High quality', 'API']}
                color="#1ABC9C"
                url="https://www.lalal.ai/"
                onPress={() => handleOpenTool('https://www.lalal.ai/')}
              />

              <ToolCard
                title="Karaoke Version"
                description="Dedicated karaoke platform"
                features={['Massive library', 'Pro quality', 'Premium']}
                color="#F39C12"
                url="https://www.karaoke-version.com/"
                onPress={() => handleOpenTool('https://www.karaoke-version.com/')}
              />

              <ToolCard
                title="iZotope RX"
                description="Professional audio editing"
                features={['Pro tool', 'Voice isolation', 'Premium']}
                color="#9B59B6"
                url="https://www.izotope.com/en/products/rx.html"
                onPress={() => handleOpenTool('https://www.izotope.com/en/products/rx.html')}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

interface ToolCardProps {
  title: string
  description: string
  features: string[]
  color: string
  url: string
  onPress: () => void
}

function ToolCard({ title, description, features, color, url, onPress }: ToolCardProps) {
  return (
    <TouchableOpacity style={styles.toolCard} onPress={onPress}>
      <View style={[styles.toolColorBar, { backgroundColor: color }]} />
      <View style={styles.toolContent}>
        <Text style={styles.toolTitle}>{title}</Text>
        <Text style={styles.toolDescription}>{description}</Text>
        <View style={styles.toolFeatures}>
          {features.map((feature, idx) => (
            <View key={idx} style={styles.toolFeatureBadge}>
              <Text style={styles.toolFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>
      <Ionicons name="arrow-forward" size={20} color="#007AFF" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
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
  fileButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  fileButtonText: {
    flex: 1,
  },
  fileButtonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 2,
  },
  fileButtonSubtitle: {
    fontSize: 12,
    color: '#999',
  },
  removalTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  removalTypeButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  removalTypeButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  removalTypeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
    marginBottom: 2,
  },
  removalTypeTitleActive: {
    color: '#007AFF',
  },
  removalTypeDescription: {
    fontSize: 11,
    color: '#999',
  },
  instrumentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  instrumentCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  instrumentCardActive: {
    backgroundColor: '#F0F8FF',
  },
  instrumentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  instrumentName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  processButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  processButtonDisabled: {
    opacity: 0.7,
  },
  processButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  playerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    padding: 8,
  },
  playerControls: {
    flex: 1,
  },
  slider: {
    height: 40,
    marginVertical: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  infoContainer: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  toolsGrid: {
    gap: 12,
  },
  toolCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingRight: 12,
  },
  toolColorBar: {
    width: 4,
    height: '100%',
  },
  toolContent: {
    flex: 1,
    paddingLeft: 8,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  toolDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  toolFeatures: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  toolFeatureBadge: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  toolFeatureText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
})
