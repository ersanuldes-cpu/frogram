import React, { useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GREEN = '#1A6B33';

interface RatingBarProps {
  value: number;
  onValueChange: (val: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  label?: string;
}

export default function RatingBar({
  value,
  onValueChange,
  minimumValue = 0,
  maximumValue = 10,
  step = 0.1,
  label,
}: RatingBarProps) {
  const barRef = useRef<View>(null);
  const barLayoutRef = useRef({ x: 0, width: 0 });

  const clamp = useCallback((val: number) => {
    const stepped = Math.round(val / step) * step;
    return Math.max(minimumValue, Math.min(maximumValue, parseFloat(stepped.toFixed(1))));
  }, [step, minimumValue, maximumValue]);

  const handleTouch = useCallback((evt: GestureResponderEvent) => {
    const pageX = evt.nativeEvent.pageX;
    const { x: barX, width: barW } = barLayoutRef.current;
    if (barW <= 0) return;
    const localX = pageX - barX;
    const ratio = Math.max(0, Math.min(1, localX / barW));
    const newVal = clamp(minimumValue + ratio * (maximumValue - minimumValue));
    onValueChange(newVal);
  }, [clamp, minimumValue, maximumValue, onValueChange]);

  const adjust = useCallback((delta: number) => {
    onValueChange(clamp(value + delta));
  }, [value, clamp, onValueChange]);

  const fillPercent = ((value - minimumValue) / (maximumValue - minimumValue)) * 100;

  return (
    <View style={styles.container}>
      {/* Rating display */}
      <View style={styles.topRow}>
        {label && <Text style={styles.label}>{label}</Text>}
        <Text style={styles.ratingValue}>{value.toFixed(1)}</Text>
      </View>

      {/* Bar + buttons */}
      <View style={styles.barRow}>
        <TouchableOpacity style={styles.adjustBtn} onPress={() => adjust(-0.5)} activeOpacity={0.6}>
          <Ionicons name="remove" size={20} color={GREEN} />
        </TouchableOpacity>

        <View
          ref={barRef}
          style={styles.barContainer}
          onLayout={() => {
            // Use measure to get absolute position on screen
            barRef.current?.measure((x, y, width, height, pageX, pageY) => {
              barLayoutRef.current = { x: pageX, width };
            });
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleTouch}
          onResponderMove={handleTouch}
        >
          {/* Background track */}
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${fillPercent}%` }]} />
          </View>
          {/* Thumb */}
          <View style={[styles.thumb, { left: `${fillPercent}%` }]} />
          {/* Scale markers */}
          <View style={styles.markers}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <TouchableOpacity
                key={n}
                style={styles.marker}
                onPress={() => onValueChange(clamp(n))}
                activeOpacity={0.6}
              >
                <View style={styles.markerLine} />
                <Text style={styles.markerText}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.adjustBtn} onPress={() => adjust(0.5)} activeOpacity={0.6}>
          <Ionicons name="add" size={20} color={GREEN} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  ratingValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: GREEN,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  barContainer: {
    flex: 1,
    height: 60,
    justifyContent: 'center',
    paddingTop: 4,
  },
  track: {
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: GREEN,
    borderRadius: 5,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: '#fff',
    marginLeft: -12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  markers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  marker: {
    alignItems: 'center',
    width: 16,
  },
  markerLine: {
    width: 1,
    height: 4,
    backgroundColor: '#ccc',
  },
  markerText: {
    fontSize: 9,
    color: '#999',
    marginTop: 1,
  },
});
