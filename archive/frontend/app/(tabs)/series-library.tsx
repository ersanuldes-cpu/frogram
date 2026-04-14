import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getPosterUrl } from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { useTranslation } from '../../src/store/languageStore';

export default function SeriesLibraryScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLibrary = async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/series-library');
      setSeriesList(response.data);
    } catch (error) {
      console.error('Error fetching series library:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [isAuthenticated]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLibrary();
  };

  const handleRemoveSeries = async (seriesId: string) => {
    Alert.alert('Remove Series', 'Are you sure you want to remove this series from your library?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/series-library/${seriesId}`);
            setSeriesList(seriesList.filter((s) => s.id !== seriesId));
          } catch (error) {
            Alert.alert('Error', 'Failed to remove series');
          }
        },
      },
    ]);
  };

  const renderSeries = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w342');
    const year = item.first_air_date ? new Date(item.first_air_date).getFullYear() : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/series/${item.tmdb_id}` as any)}
        activeOpacity={0.8}
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.poster} />
        ) : (
          <View style={styles.noPoster}>
            <Ionicons name="tv-outline" size={30} color={colors.textLight} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
          <View style={styles.cardMeta}>
            {year && <Text style={styles.cardYear}>{year}</Text>}
            {item.number_of_seasons && (
              <Text style={styles.cardYear}>{item.number_of_seasons} Season{item.number_of_seasons > 1 ? 's' : ''}</Text>
            )}
          </View>
          <View style={styles.ratings}>
            {item.vote_average > 0 && (
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingLabel}>TMDB</Text>
                <Ionicons name="star" size={12} color={colors.warning} />
                <Text style={styles.ratingValue}>{item.vote_average.toFixed(1)}</Text>
              </View>
            )}
            {item.user_rating !== null && item.user_rating !== undefined && (
              <View style={[styles.ratingBadge, styles.userRatingBadge]}>
                <Text style={styles.ratingLabel}>YOU</Text>
                <Ionicons name="star" size={12} color={colors.primary} />
                <Text style={[styles.ratingValue, styles.userRatingValue]}>{item.user_rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveSeries(item.id)}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="tv" size={60} color={colors.border} />
        <Text style={styles.emptyTitle}>Sign In Required</Text>
        <Text style={styles.emptyText}>Please sign in to view your series library</Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {seriesList.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="tv-outline" size={60} color={colors.border} />
          <Text style={styles.emptyTitle}>No Series Yet</Text>
          <Text style={styles.emptyText}>Start adding series to build your collection</Text>
          <TouchableOpacity style={styles.searchButton} onPress={() => router.push('/(tabs)/search')}>
            <Ionicons name="search" size={20} color={colors.white} />
            <Text style={styles.searchButtonText}>Search Series</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={seriesList}
          keyExtractor={(item) => item.id}
          renderItem={renderSeries}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <Text style={styles.countText}>
              {seriesList.length} series in your library
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  signInButton: { marginTop: spacing.lg, backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.lg },
  signInButtonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  searchButton: { marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.lg, gap: spacing.sm },
  searchButtonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  list: { padding: spacing.md },
  countText: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  card: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  poster: { width: 80, height: 120, borderRadius: borderRadius.md, backgroundColor: colors.surface },
  noPoster: { width: 80, height: 120, borderRadius: borderRadius.md, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: spacing.md },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.sm },
  cardYear: { fontSize: fontSize.sm, color: colors.textSecondary },
  ratings: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, gap: 4 },
  userRatingBadge: { backgroundColor: colors.secondary },
  ratingLabel: { fontSize: 9, fontWeight: '600', color: colors.textLight },
  ratingValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  userRatingValue: { color: colors.primary },
  removeButton: { padding: spacing.sm },
});
