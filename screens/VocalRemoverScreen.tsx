// screens/VocalRemoverScreen.tsx
import React, { useState } from 'react'
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
  TextInput,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'

interface RemoverTool {
  id: string
  name: string
  description: string
  url: string
  icon: string
  features: string[]
  color: string
}

interface RemovalOption {
  id: string
  type: 'vocal' | 'instrument'
  name: string
  description: string
  icon: string
}

export default function VocalRemoverScreen() {
  const [selectedTool, setSelectedTool] = useState<RemoverTool | null>(null)
  const [removalMode, setRemovalMode] = useState<'vocal' | 'instrument'>('vocal')

  const removalOptions: RemovalOption[] = [
    {
      id: 'vocal-removal',
      type: 'vocal',
      name: 'Remove Vocals',
      description: 'Extract instrumental version from songs',
      icon: 'mic',
    },
    {
      id: 'instrument-removal',
      type: 'instrument',
      name: 'Remove Instruments',
      description: 'Extract vocal-only version from songs',
      icon: 'musical-notes',
    },
    {
      id: 'stem-separation',
      type: 'instrument',
      name: 'Stem Separation',
      description: 'Separate drums, bass, vocals, and more',
      icon: 'git-compare',
    },
  ]

  const removerTools: RemoverTool[] = [
    {
      id: 'remove-vocals',
      name: 'Remove Vocals',
      description: 'Simple & fast vocal removal online tool',
      url: 'https://www.remove-vocals.com/',
      icon: 'globe',
      features: ['Free', 'No signup', 'Fast processing', 'Download MP3/WAV'],
      color: '#FF6B6B',
    },
    {
      id: 'vocal-remover-online',
      name: 'Vocal Remover Online',
      description: 'AI-powered vocal extraction and removal',
      url: 'https://www.vocal-remover.org/',
      icon: 'globe',
      features: ['AI technology', 'High quality', 'Batch processing', 'Free tier'],
      color: '#4ECDC4',
    },
    {
      id: 'splitter-ai',
      name: 'Splitter AI',
      description: 'Advanced stem separation with AI',
      url: 'https://www.splitter.ai/',
      icon: 'globe',
      features: ['Professional quality', 'Multiple stems', 'Cloud storage', 'API available'],
      color: '#45B7D1',
    },
    {
      id: 'karaoke-version',
      name: 'Karaoke Version',
      description: 'Dedicated karaoke and backing track platform',
      url: 'https://www.karaoke-version.com/',
      icon: 'globe',
      features: ['Massive library', 'Professional quality', 'Subscription', 'Multiple formats'],
      color: '#F39C12',
    },
    {
      id: 'izotope-rx',
      name: 'iZotope RX',
      description: 'Professional audio editing and restoration',
      url: 'https://www.izotope.com/en/products/rx.html',
      icon: 'globe',
      features: ['Professional tool', 'Voice isolation', 'Audio repair', 'Premium'],
      color: '#9B59B6',
    },
    {
      id: 'lalal-ai',
      name: 'LALAL.AI',
      description: 'Neural network-based stem splitter',
      url: 'https://www.lalal.ai/',
      icon: 'globe',
      features: ['Neural AI', 'High quality', 'Batch processing', 'API & SDK'],
      color: '#1ABC9C',
    },
  ]

  const handleOpenTool = async (url: string, toolName: string) => {
    try {
      const supported = await Linking.canOpenURL(url)
      if (supported) {
        await Linking.openURL(url)
      } else {
        Alert.alert('Error', `Cannot open ${toolName}`)
      }
    } catch (err) {
      console.error('Error opening URL:', err)
      Alert.alert('Error', 'Failed to open link')
    }
  }

  const handleToolPress = (tool: RemoverTool) => {
    setSelectedTool(tool)
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Vocal & Instrument Remover</Text>
        <Text style={styles.subtitle}>Remove vocals or instruments from songs for practice</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Removal Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What do you want to remove?</Text>
          <View style={styles.optionsGrid}>
            {removalOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.optionCard}
                onPress={() => setRemovalMode(option.type)}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons
                    name={option.icon as any}
                    size={28}
                    color={removalMode === option.type ? '#007AFF' : '#999'}
                  />
                </View>
                <Text style={[styles.optionName, removalMode === option.type && styles.optionNameActive]}>
                  {option.name}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Available Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Tools</Text>
          <Text style={styles.sectionDescription}>
            Choose an online tool to process your audio files
          </Text>

          {removerTools.map((tool) => (
            <TouchableOpacity
              key={tool.id}
              style={styles.toolCard}
              onPress={() => handleToolPress(tool)}
            >
              <View style={[styles.toolColorBar, { backgroundColor: tool.color }]} />
              <View style={styles.toolContent}>
                <Text style={styles.toolName}>{tool.name}</Text>
                <Text style={styles.toolDescription}>{tool.description}</Text>

                {/* Features */}
                <View style={styles.featuresContainer}>
                  {tool.features.slice(0, 3).map((feature, idx) => (
                    <View key={idx} style={styles.featureBadge}>
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.openButton}
                onPress={() => handleOpenTool(tool.url, tool.name)}
              >
                <Ionicons name="arrow-forward" size={20} color="#007AFF" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tips Section */}
        <View style={[styles.section, styles.tipsSection]}>
          <Text style={styles.sectionTitle}>💡 Tips for Best Results</Text>

          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Use high-quality audio files for better separation results
            </Text>
          </View>

          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Stereo files typically give better results than mono
            </Text>
          </View>

          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Try multiple tools if you're not satisfied with the first result
            </Text>
          </View>

          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Download and save your processed files for practice sessions
            </Text>
          </View>

          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.tipText}>
              Combine with chord charts for effective practice
            </Text>
          </View>
        </View>

        {/* Use Cases */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Use Cases</Text>

          <View style={styles.useCaseItem}>
            <Text style={styles.useCaseTitle}>Practice Vocals</Text>
            <Text style={styles.useCaseDescription}>
              Remove backing vocals/instruments to practice your part independently
            </Text>
          </View>

          <View style={styles.useCaseItem}>
            <Text style={styles.useCaseTitle}>Learn Instruments</Text>
            <Text style={styles.useCaseDescription}>
              Remove instruments to isolate and learn the vocal melody
            </Text>
          </View>

          <View style={styles.useCaseItem}>
            <Text style={styles.useCaseTitle}>Create Backing Tracks</Text>
            <Text style={styles.useCaseDescription}>
              Remove vocals to create custom backing tracks for your worship team
            </Text>
          </View>

          <View style={styles.useCaseItem}>
            <Text style={styles.useCaseTitle}>Arrange Songs</Text>
            <Text style={styles.useCaseDescription}>
              Isolate individual instruments to understand the arrangement better
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Tool Details Modal */}
      <Modal visible={selectedTool !== null} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelectedTool(null)}>
                <Ionicons name="close" size={28} color="#007AFF" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{selectedTool?.name}</Text>
              <TouchableOpacity onPress={() => handleOpenTool(selectedTool?.url || '', selectedTool?.name || '')}>
                <Ionicons name="open" size={28} color="#007AFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={[styles.modalColorBar, { backgroundColor: selectedTool?.color }]} />

              <Text style={styles.modalDescription}>{selectedTool?.description}</Text>

              <Text style={styles.modalSectionTitle}>Features</Text>
              {selectedTool?.features.map((feature, idx) => (
                <View key={idx} style={styles.featureListItem}>
                  <Ionicons name="checkmark" size={20} color="#34C759" />
                  <Text style={styles.featureListText}>{feature}</Text>
                </View>
              ))}

              <TouchableOpacity
                style={styles.modalOpenButton}
                onPress={() => handleOpenTool(selectedTool?.url || '', selectedTool?.name || '')}
              >
                <Ionicons name="globe" size={20} color="#fff" />
                <Text style={styles.modalOpenButtonText}>Visit {selectedTool?.name}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
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
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  optionsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  optionCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  optionIconContainer: {
    marginBottom: 8,
  },
  optionName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  optionNameActive: {
    color: '#007AFF',
  },
  optionDescription: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },
  toolCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toolColorBar: {
    width: 4,
    height: '100%',
    position: 'absolute',
    left: 0,
  },
  toolContent: {
    flex: 1,
    padding: 12,
    paddingLeft: 16,
  },
  toolName: {
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
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  featureBadge: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  featureText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  openButton: {
    paddingRight: 12,
  },
  tipsSection: {
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  useCaseItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
  },
  useCaseTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  useCaseDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: 60,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  modalColorBar: {
    height: 4,
    marginBottom: 16,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  modalDescription: {
    fontSize: 14,
    color: '#333',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 10,
  },
  featureListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  featureListText: {
    fontSize: 13,
    color: '#333',
  },
  modalOpenButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  modalOpenButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
})
