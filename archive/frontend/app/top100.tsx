import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api, { getPosterUrl } from '../src/utils/api';
import { colors, spacing } from '../src/utils/theme';
import { useTranslation } from '../src/store/languageStore';
import FloatingTabBar from '../src/components/FloatingTabBar';

const FRGM100_LOGO = 'https://customer-assets.emergentagent.com/job_72047197-3356-404f-a7a0-17eb7ec71cb4/artifacts/bmjukugo_IMG_5916.jpeg';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GAP = 8;
const PAD = 12;
const IS_TABLET = SCREEN_WIDTH >= 768;
const NUM_COLUMNS = IS_TABLET ? 6 : 3;
// Dynamic card width: fills available space evenly in 3 columns
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 2 * PAD - (NUM_COLUMNS - 1) * GAP) / NUM_COLUMNS);
const POSTER_H = Math.floor(CARD_WIDTH * 1.5);
const GREEN = '#2E7D32';

interface TopMovie {
  rank: number;
  tmdb_id: number;
  title: string;
  poster_path: string;
  avg_rating: number;
  rating_count: number;
  imdb_rating?: number;
  omdb_rating?: number;
}

export default function Top100Screen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [movies, setMovies] = useState<TopMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTop100();
  }, []);

  const fetchTop100 = async () => {
    try {
      const { data } = await api.get('/movies/top100');
      setMovies(data);
    } catch (error) {
      console.log('Top 100 fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderMovie = ({ item }: { item: TopMovie }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/movie/${item.tmdb_id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.posterContainer}>
        <Image
          source={{ uri: getPosterUrl(item.poster_path, 'w342') || '' }}
          style={styles.poster}
        />
        {/* Rank badge - top left */}
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{item.rank}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
      {/* Star ratings below poster */}
      <View style={styles.ratingsRow}>
        {item.imdb_rating != null && (
          <View style={styles.ratingItem}>
            <Ionicons name="star" size={7} color={colors.imdbOrange} />
            <Text style={[styles.ratingText, { color: colors.imdbOrange }]}>{item.imdb_rating}</Text>
          </View>
        )}
        {item.omdb_rating != null && (
          <View style={styles.ratingItem}>
            <Ionicons name="star" size={7} color={colors.omdbRed} />
            <Text style={[styles.ratingText, { color: colors.omdbRed }]}>{item.omdb_rating}</Text>
          </View>
        )}
        <View style={styles.ratingItem}>
          <Ionicons name="star" size={7} color={colors.frgmGreen} />
          <Text style={[styles.ratingText, { color: colors.frgmGreen }]}>{item.avg_rating}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.outerContainer}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Image source={{ uri: FRGM100_LOGO }} style={styles.headerLogo} resizeMode="contain" />
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GREEN} />
          </View>
        ) : movies.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="film-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>No rated movies yet</Text>
            <Text style={styles.emptySubtext}>Rate movies to see them in the Top 100!</Text>
          </View>
        ) : (
          <FlatList
            data={movies}
            renderItem={renderMovie}
            keyExtractor={(item) => String(item.tmdb_id)}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
        <FloatingTabBar />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLogo: {
    width: 270,
    height: 84,
    borderRadius: 24,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#333',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtext: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  listContent: {
    paddingHorizontal: PAD,
    paddingBottom: 100,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
    justifyContent: 'flex-start',
  },
  card: {
    width: CARD_WIDTH,
  },
  posterContainer: {
    width: CARD_WIDTH,
    height: POSTER_H,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  rankBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: GREEN,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  rankText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  ratingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 3,
    paddingHorizontal: 1,
    flexWrap: 'wrap',
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  ratingText: {
    fontSize: 8,
    fontWeight: '700',
  },
  title: {
    color: '#333',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
    paddingHorizontal: 2,
  },
});
