import React from 'react'
import { View, StyleSheet } from 'react-native'

interface ProgressBarProps {
  progress: number // 0-1
  height?: number
  color?: string
  backgroundColor?: string
}

export default function ProgressBar({
  progress,
  height = 6,
  color = '#34C759',
  backgroundColor = '#e0e0e0',
}: ProgressBarProps) {
  // Clamp progress between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress))

  return (
    <View style={[styles.container, { height, backgroundColor }]}>
      <View
        style={[
          styles.fill,
          {
            height,
            width: `${clampedProgress * 100}%`,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 3,
  },
  fill: {
    borderRadius: 3,
  },
})
