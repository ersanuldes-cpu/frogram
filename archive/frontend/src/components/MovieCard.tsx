import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import { getPosterUrl } from '../utils/api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.md * 3) / 2;

interface MovieCardProps {
  movie: {
    id?: number;
    tmdb_id?: number;
    title: string;
    poster_path: string | null;
    vote_average?: number;
    user_rating?: number;
    release_date?: string;
  };
  onPress: () => void;
  showRating?: boolean;
}

export default function MovieCard({ movie, onPress, showRating = true }: MovieCardProps) {
  const posterUrl = getPosterUrl(movie.poster_path, 'w342');
  const rating = movie.user_rating || movie.vote_average;
  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.posterContainer}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.poster} />
        ) : (
          <View style={styles.noPoster}>
            <Ionicons name="film-outline" size={40} color={colors.textLight} />
          </View>
        )}
        {showRating && rating !== undefined && rating > 0 && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color={colors.warning} />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{movie.title}</Text>
        {year && <Text style={styles.year}>{year}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    marginBottom: spacing.md,
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2/3,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  noPoster: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  ratingBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: 2,
  },
  ratingText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  info: {
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  year: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
