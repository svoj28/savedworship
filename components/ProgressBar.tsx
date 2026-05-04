import React, { useEffect, useRef } from 'react'
import { View, Text, Animated, StyleSheet } from 'react-native'

interface ProgressBarProps {
  progress: number // 0–1
  height?: number
  showLabel?: boolean
  label?: string
}

export default function ProgressBar({
  progress,
  height = 3,
  showLabel = false,
  label,
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(1, progress))
  const animatedWidth = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: clampedProgress,
      duration: 400,
      useNativeDriver: false,
    }).start()
  }, [clampedProgress])

  const widthInterpolated = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  const percent = Math.round(clampedProgress * 100)

  return (
    <View style={styles.wrapper}>
      {showLabel && (
        <View style={styles.labelRow}>
          {label ? (
            <Text style={styles.labelText}>{label}</Text>
          ) : (
            <View />
          )}
          <Text style={styles.percentText}>{percent}%</Text>
        </View>
      )}

      {/* Track */}
      <View style={[styles.track, { height }]}>
        {/* Fill */}
        <Animated.View
          style={[
            styles.fill,
            {
              height,
              width: widthInterpolated,
            },
          ]}
        />

        {/* Shimmer line at leading edge */}
        {clampedProgress > 0 && clampedProgress < 1 && (
          <Animated.View
            style={[
              styles.leadingEdge,
              {
                height,
                left: widthInterpolated,
              },
            ]}
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
  },
  percentText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.5)',
  },
  track: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#ffffff',
    borderRadius: 1,
  },
  leadingEdge: {
    position: 'absolute',
    top: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 1,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 4,
  },
})