import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, fonts, borderRadius } from '../../src/utils/theme';
import FloatingTabBar from '../../src/components/FloatingTabBar';

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function PersonScreen() {
  const { id, name, photo } = useLocalSearchParams<{ id: string; name?: string; photo?: string }>();
  const router = useRouter();
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [personName, setPersonName] = useState(name || '');
  const [personPhoto, setPersonPhoto] = useState(photo || '');
  const { width: screenWidth } = useWindowDimensions();
  const numColumns = screenWidth >= 768 ? 6 : 3;
  const posterWidth = Math.floor((screenWidth - spacing.md * 2 - spacing.sm * (numColumns - 1)) / numColumns);
  const posterHeight = Math.floor(posterWidth * 1.5);

  useEffect(() => {
    fetchPersonMovies();
  }, [id]);

  const fetchPersonMovies = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/person/${id}/movies`);
      const data = await res.json();
      const movieList = data.results || data.cast || [];
      // Sort by popularity/vote count descending, filter to those with posters
      const sorted = movieList
        .filter((m: any) => m.poster_path)
        .sort((a: any, b: any) => (b.vote_count || 0) - (a.vote_count || 0));
      // Remove duplicates
      const seen = new Set();
      const unique = sorted.filter((m: any) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      setMovies(unique);
    } catch (err) {
      console.error('Failed to fetch person movies:', err);
    } finally {
      setLoading(false);
    }
  };

  const photoUri = personPhoto
    ? (personPhoto.startsWith('http') ? personPhoto : `https://image.tmdb.org/t/p/w185${personPhoto}`)
    : null;

  const renderMovie = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.movieCard, { width: posterWidth }]}
      onPress={() => router.push(`/movie/${item.id}`)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: `https://image.tmdb.org/t/p/w185${item.poster_path}` }}
        style={[styles.moviePoster, { width: posterWidth, height: posterHeight }]}
      />
      <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
      {item.release_date && (
        <Text style={styles.movieYear}>{item.release_date.substring(0, 4)}</Text>
      )}
      {item.vote_average > 0 && (
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={11} color="#F5A623" />
          <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.headerPhoto} />
          ) : (
            <View style={[styles.headerPhoto, styles.headerPhotoPlaceholder]}>
              <Ionicons name="person" size={22} color={colors.textLight} />
            </View>
          )}
          <Text style={styles.headerName} numberOfLines={1}>{personName}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={movies}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderMovie}
          numColumns={numColumns}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No movies found</Text>
            </View>
          }
        />
      )}
      <FloatingTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  headerPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  headerPhotoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.border,
  },
  headerName: {
    fontSize: fontSize.lg,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.md,
  },
  row: {
    justifyContent: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  movieCard: {
    marginBottom: spacing.xs,
  },
  moviePoster: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  movieTitle: {
    fontSize: fontSize.xs,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginTop: 4,
  },
  movieYear: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  ratingText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
});
