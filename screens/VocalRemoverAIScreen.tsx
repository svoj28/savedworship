import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Slider } from '@react-native-community/slider'
import demucsAIService, { Stem, StemSession } from '../lib/demucsAIService'
import audioRemovalService from '../lib/audioRemovalService'
import { Ionicons } from '@expo/vector-icons'

const stemColors: Record<string, string> = {
  vocals: '#FF6B6B',
  drums: '#FFE66D',
  bass: '#4ECDC4',
  other: '#A8E6CF',
  piano: '#9B59B6',
}

interface StageProps {
  stage: 'idle' | 'uploading' | 'processing' | 'ready' | 'error'
  message: string
  errorMessage?: string
}

const VocalRemoverAIScreen = () => {
  const [audioUri, setAudioUri] = useState<string | null>(null)
  const [stage, setStage] = useState<'idle' | 'uploading' | 'processing' | 'ready' | 'error'>(
    'idle'
  )
  const [message, setMessage] = useState('Select an audio file')
  const [errorMessage, setErrorMessage] = useState('')
  const [stemSession, setStemSession] = useState<StemSession | null>(null)
  const [stemLevels, setStemLevels] = useState<Record<string, number>>({
    vocals: 100,
    drums: 100,
    bass: 100,
    other: 100,
    piano: 100,
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRemovalServiceRef = useRef(audioRemovalService)

  const usage = demucsAIService.getUsageInfo()
  const isUnlimited = usage.isUnlimited

  /**
   * Pick audio file
   */
  const handlePickAudio = useCallback(async () => {
    try {
      setStage('idle')
      setErrorMessage('')
      const uri = await audioRemovalServiceRef.current.pickAudioFile()
      if (uri) {
        setAudioUri(uri)
        setMessage('Ready to separate stems')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to pick audio')
    }
  }, [])

  /**
   * Separate stems using Demucs AI
   */
  const handleSeparateStems = useCallback(async () => {
    if (!audioUri) {
      Alert.alert('Error', 'Please select an audio file')
      return
    }

    try {
      setStage('uploading')
      setErrorMessage('')

      // Check usage limit
      if (!demucsAIService.canUseFreeAI()) {
        const usage = demucsAIService.getUsageInfo()
        throw new Error(`Free AI limit reached (${usage.limit} per day)`)
      }

      const progress = (msg: string) => {
        setMessage(msg)
        if (msg.includes('Uploading')) setStage('uploading')
        else if (msg.includes('separating')) setStage('processing')
        else if (msg.includes('Receiving')) setStage('processing')
      }

      // Call Demucs AI
      const session = await demucsAIService.separateStems(audioUri, progress)

      if (session) {
        setStemSession(session)
        setStage('ready')
        setMessage('✅ Stems separated! Adjust the sliders to mix.')

        // Log stems received
        console.log('📊 Stems received:')
        session.stems.forEach((s) => {
          console.log(`  ${s.name}: ${s.base64.length} chars (base64)`)
        })
      }
    } catch (error) {
      setStage('error')
      setErrorMessage(error instanceof Error ? error.message : 'AI separation failed')
      console.error('❌ Error:', error)
    }
  }, [audioUri])

  /**
   * Update stem level with slider
   */
  const handleStemLevelChange = (stemName: string, value: number) => {
    setStemLevels((prev) => ({
      ...prev,
      [stemName]: Math.round(value),
    }))
  }

  /**
   * Mix selected stems
   */
  const handleMixStems = useCallback(async () => {
    if (!stemSession) return

    try {
      setStage('processing')
      setMessage('🎵 Mixing stems...')

      // Filter stems by level (if level > 0)
      const selectedStems = stemSession.stems.filter((s) => stemLevels[s.name] > 0)

      if (selectedStems.length === 0) {
        Alert.alert('Error', 'Please enable at least one stem')
        setStage('ready')
        return
      }

      // For now, just take the first selected stem as a demonstration
      // Real implementation would need a /api/ai/mix-stems endpoint
      const outputUri = await demucsAIService.mixStems(stemSession.sessionId, selectedStems)

      setMessage('✅ Mixed! Ready to play.')
      setStage('ready')

      // Store mixed audio for playback
      if (outputUri) {
        await audioRemovalServiceRef.current.loadAudio(outputUri)
      }
    } catch (error) {
      setStage('error')
      setErrorMessage(error instanceof Error ? error.message : 'Mixing failed')
      console.error('Error mixing:', error)
    }
  }, [stemSession, stemLevels])

  /**
   * Play/pause mixed audio
   */
  const handlePlayPause = useCallback(async () => {
    try {
      if (isPlaying) {
        await audioRemovalServiceRef.current.pause()
        setIsPlaying(false)
      } else {
        await audioRemovalServiceRef.current.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('Playback error:', error)
    }
  }, [isPlaying])

  /**
   * Save stem to device
   */
  const handleSaveStem = useCallback(
    async (stem: Stem) => {
      try {
        if (!stemSession) return
        setMessage(`💾 Saving ${stem.name}...`)
        const filePath = await demucsAIService.saveStem(stem, stemSession.sessionId)
        Alert.alert('Success', `${stem.name} saved to cache`)
        console.log('Saved to:', filePath)
      } catch (error) {
        Alert.alert('Error', `Failed to save ${stem.name}`)
        console.error('Save error:', error)
      }
    },
    [stemSession]
  )

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="sparkles" size={28} color="#9B59B6" />
        <Text style={styles.title}>AI Stem Separator</Text>
        <Text style={styles.subtitle}>Free AI-Powered Music Separation</Text>
      </View>

      {/* Usage Counter */}
      <View style={styles.usageContainer}>
        <View style={styles.usageBadge}>
          <Ionicons name="brain" size={20} color="#9B59B6" />
          <Text style={styles.usageText}>
            {isUnlimited ? '∞ Unlimited AI Usage' : `Uses: ${usage.remaining}/${usage.limit}`}
          </Text>
        </View>
      </View>

      {/* Stage: IDLE - Select Audio */}
      {stage === 'idle' && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handlePickAudio}
          >
            <Ionicons name="folder-open" size={20} color="white" />
            <Text style={styles.buttonText}>Select Audio File</Text>
          </TouchableOpacity>

          {audioUri && <Text style={styles.selectedFile}>✅ File selected</Text>}
        </View>
      )}

      {/* Stage: UPLOADING */}
      {stage === 'uploading' && (
        <View style={styles.section}>
          <ActivityIndicator size="large" color="#9B59B6" />
          <Text style={styles.statusText}>{message}</Text>
        </View>
      )}

      {/* Stage: PROCESSING */}
      {stage === 'processing' && (
        <View style={styles.section}>
          <ActivityIndicator size="large" color="#9B59B6" />
          <Text style={styles.statusText}>{message}</Text>
          <Text style={styles.processingNote}>
            ⏳ AI is processing your audio. This may take 1-2 minutes.
          </Text>
        </View>
      )}

      {/* Stage: READY - Stem Mixing */}
      {stage === 'ready' && stemSession && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adjust Stem Levels</Text>

          {stemSession.stems.map((stem) => (
            <View key={stem.name} style={styles.stemControl}>
              <View style={styles.stemHeader}>
                <View
                  style={[
                    styles.stemIcon,
                    { backgroundColor: stemColors[stem.name] },
                  ]}
                />
                <Text style={styles.stemName}>{stem.name.toUpperCase()}</Text>
                <Text style={styles.stemLevel}>{stemLevels[stem.name]}%</Text>
              </View>

              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={100}
                value={stemLevels[stem.name]}
                onValueChange={(value) => handleStemLevelChange(stem.name, value)}
                minimumTrackTintColor={stemColors[stem.name]}
                maximumTrackTintColor="#E0E0E0"
              />

              <TouchableOpacity
                style={styles.saveStemButton}
                onPress={() => handleSaveStem(stem)}
              >
                <Ionicons name="download" size={16} color="#9B59B6" />
                <Text style={styles.saveStemText}>Save Stem</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Mix Button */}
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, styles.mixButton]}
            onPress={handleMixStems}
          >
            <Ionicons name="musical-notes" size={20} color="white" />
            <Text style={styles.buttonText}>Mix Selected Stems</Text>
          </TouchableOpacity>

          {/* Playback Controls */}
          <View style={styles.playbackContainer}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handlePlayPause}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={20}
                color="white"
              />
              <Text style={styles.buttonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
            </TouchableOpacity>
          </View>

          {/* Message */}
          <Text style={styles.statusText}>{message}</Text>
        </View>
      )}

      {/* Stage: ERROR */}
      {stage === 'error' && (
        <View style={styles.errorSection}>
          <Ionicons name="alert-circle" size={40} color="#FF6B6B" />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => {
              setStage('idle')
              setErrorMessage('')
            }}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ About AI Stems</Text>
        <Text style={styles.infoText}>
          • Powered by Demucs (Meta's AI model){'\n'}
          • Separates into: Vocals, Drums, Bass, Other, Piano{'\n'}
          • Processing takes 1-2 minutes per song{'\n'}
          • 5 free AI operations per day{'\n'}
          • High accuracy AI-powered separation
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingBottom: 20,
  },
  header: {
    backgroundColor: '#9B59B6',
    padding: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#E8D5F2',
    marginTop: 5,
  },
  usageContainer: {
    margin: 15,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#9B59B6',
  },
  usageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  usageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  limitReachedText: {
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 8,
    fontWeight: '500',
  },
  section: {
    margin: 15,
    padding: 15,
    backgroundColor: 'white',
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  primaryButton: {
    backgroundColor: '#9B59B6',
  },
  secondaryButton: {
    backgroundColor: '#4ECDC4',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedFile: {
    fontSize: 12,
    color: '#4ECDC4',
    marginTop: 10,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  processingNote: {
    fontSize: 12,
    color: '#FF9800',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  stemControl: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  stemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  stemIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  stemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  stemLevel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9B59B6',
    minWidth: 40,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  saveStemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#9B59B6',
    borderRadius: 6,
    marginTop: 8,
  },
  saveStemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9B59B6',
  },
  mixButton: {
    marginTop: 15,
  },
  playbackContainer: {
    marginTop: 15,
  },
  errorSection: {
    margin: 15,
    padding: 20,
    backgroundColor: '#FFE5E5',
    borderRadius: 10,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF6B6B',
    marginTop: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
  infoSection: {
    margin: 15,
    padding: 15,
    backgroundColor: '#F0E6FF',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#9B59B6',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 20,
  },
})

export default VocalRemoverAIScreen
