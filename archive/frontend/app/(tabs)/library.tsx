import React, { useState, useEffect, useCallback } from 'react';
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
  Dimensions,
  TextInput,
  Share,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api, { getPosterUrl } from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { useTranslation } from '../../src/store/languageStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GAP = 8;
const PAD = 12;
const IS_TABLET = SCREEN_WIDTH >= 768;
const NUM_COLUMNS = IS_TABLET ? 6 : 3;
// Dynamic card width to fill screen evenly
const POSTER_W = Math.floor((SCREEN_WIDTH - 2 * PAD - (NUM_COLUMNS - 1) * GAP) / NUM_COLUMNS);
const POSTER_H = Math.floor(POSTER_W * 1.5);
const MINI_W = 45;
const MINI_H = 67;
const MINI_COLUMNS = Math.max(4, Math.floor((SCREEN_WIDTH - PAD * 2 + 4) / (MINI_W + 4)));
const GREEN = '#2E7D32';
const PAGE_SIZE = 30;
const GRID_SIDE_PAD = PAD;

type ViewMode = 'grid' | 'frogseye' | 'list';
type FilterBy = 'all' | 'director' | 'actor' | 'country';
type LibTab = 'movies' | 'series';

export default function LibraryScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [libTab, setLibTab] = useState<LibTab>('movies');
  const [movies, setMovies] = useState<any[]>([]);
  const [filteredMovies, setFilteredMovies] = useState<any[]>([]);
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searching, setSearching] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [sharingList, setSharingList] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLibrary = async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      const [movieRes, seriesRes] = await Promise.all([
        api.get('/library'),
        api.get('/series-library').catch(() => ({ data: [] })),
      ]);
      // Sort movies by user_rating (FRGM) highest to lowest
      const sorted = (movieRes.data || []).sort((a: any, b: any) => {
        const rA = a.user_rating ?? 0;
        const rB = b.user_rating ?? 0;
        return rB - rA;
      });
      setMovies(sorted);
      setFilteredMovies(sorted);
      setSeriesList(seriesRes.data || []);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error fetching library:', error);
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
    setSearchQuery('');
    fetchLibrary();
  };

  // Local search - instant, no API call needed
  const doSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setFilteredMovies(movies);
      setCurrentPage(1);
      return;
    }
    const q = query.toLowerCase().trim();
    const results = movies.filter(m => {
      if (filterBy === 'director') {
        return m.director?.toLowerCase().includes(q);
      } else if (filterBy === 'actor') {
        return (m.cast || []).some((c: string) => c.toLowerCase().includes(q));
      } else if (filterBy === 'country') {
        return (m.production_countries || []).some((c: string) => c.toLowerCase().includes(q));
      }
      // 'all' — search everything
      return (
        m.title?.toLowerCase().includes(q) ||
        m.director?.toLowerCase().includes(q) ||
        (m.cast || []).some((c: string) => c.toLowerCase().includes(q)) ||
        (m.production_countries || []).some((c: string) => c.toLowerCase().includes(q))
      );
    });
    setFilteredMovies(results);
    setCurrentPage(1);
  }, [movies, filterBy]);

  // Run search whenever query or filter changes
  useEffect(() => {
    doSearch(searchQuery);
  }, [searchQuery, filterBy, doSearch]);

  const handleRemoveMovie = async (movieId: string) => {
    Alert.alert(t('common.delete'), t('library.holdToRemove'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/library/${movieId}`);
            const updated = movies.filter((m) => m.id !== movieId);
            setMovies(updated);
            setFilteredMovies(updated);
          } catch (error) {
            Alert.alert(t('common.error'), 'Failed to remove movie');
          }
        },
      },
    ]);
  };

  const handleShareFrogsEye = async () => {
    setSharingImage(true);
    try {
      const posterPaths = filteredMovies.map(m => m.poster_path).filter(Boolean);
      if (posterPaths.length === 0) {
        Alert.alert('Error', 'No movie posters to share');
        setSharingImage(false);
        return;
      }
      
      const response = await api.post('/share/collage', {
        poster_paths: posterPaths,
        title: `${user?.name || 'FROGRAM'} - ${t('library.title')}`,
      }, { headers: { 'Accept': 'application/json' } });
      
      const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const fileUri = FileSystem.cacheDirectory + 'frogram_collage.jpg';
      
      // Try download approach first (most reliable on native)
      if (response.data.download_id) {
        try {
          const downloadResult = await FileSystem.downloadAsync(
            `${API_BASE}/api/share/download/${response.data.download_id}`,
            fileUri
          );
          if (downloadResult.status === 200) {
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(downloadResult.uri, { mimeType: 'image/jpeg' });
            }
            return;
          }
        } catch (dlErr) {
          console.log('Download approach failed, trying base64:', dlErr);
        }
      }
      
      // Fallback: use base64 write
      const base64 = response.data.base64;
      if (!base64) throw new Error('No image data received');
      
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg' });
      }
    } catch (error: any) {
      console.error('Share collage error:', error?.message || error);
      Alert.alert('Error', `Share failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setSharingImage(false);
    }
  };

  const handleShareList = async () => {
    setSharingList(true);
    try {
      const movieData = filteredMovies.map(m => ({
        title: m.title,
        user_rating: m.user_rating,
        year: m.release_date?.substring(0, 4) || '',
        director: m.director || '',
      }));
      if (movieData.length === 0) {
        Alert.alert('Error', 'No movies to share');
        setSharingList(false);
        return;
      }
      
      const response = await api.post('/share/list-image', {
        movies: movieData,
        title: `${user?.name || 'FROGRAM'} - ${t('library.title')}`,
      }, { headers: { 'Accept': 'application/json' } });
      
      const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const fileUri = FileSystem.cacheDirectory + 'frogram_list.jpg';
      
      // Try download approach first (most reliable on native)
      if (response.data.download_id) {
        try {
          const downloadResult = await FileSystem.downloadAsync(
            `${API_BASE}/api/share/download/${response.data.download_id}`,
            fileUri
          );
          if (downloadResult.status === 200) {
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(downloadResult.uri, { mimeType: 'image/jpeg' });
            }
            return;
          }
        } catch (dlErr) {
          console.log('Download approach failed, trying base64:', dlErr);
        }
      }
      
      // Fallback: use base64 write
      const base64 = response.data.base64;
      if (!base64) throw new Error('No image data received');
      
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg' });
      }
    } catch (error: any) {
      console.error('Share list error:', error?.message || error);
      Alert.alert(t('common.error'), `Share failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setSharingList(false);
    }
  };

  const filterOptions: { key: FilterBy; label: string; icon: string }[] = [
    { key: 'all', label: t('common.search'), icon: 'search' },
    { key: 'director', label: t('movie.director'), icon: 'videocam' },
    { key: 'actor', label: t('movie.cast'), icon: 'people' },
    { key: 'country', label: '🌍', icon: 'globe' },
  ];

  // ===================== PAGINATION =====================
  const totalPages = Math.ceil(filteredMovies.length / PAGE_SIZE);
  const paginatedMovies = filteredMovies.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // ===================== RENDER FUNCTIONS =====================

  const renderGridMovie = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w342');
    const userRating = item.user_rating;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/movie/${item.tmdb_id}`)}
        onLongPress={() => handleRemoveMovie(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.posterContainer}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.poster} />
          ) : (
            <View style={styles.noPoster}>
              <Ionicons name="film-outline" size={28} color="#bbb" />
            </View>
          )}
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {userRating != null && (
            <View style={styles.inlineRating}>
              <Ionicons name="star" size={10} color={colors.frgmGreen} />
              <Text style={styles.inlineRatingText}>{userRating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderMiniMovie = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w92');
    return (
      <TouchableOpacity
        style={styles.miniCard}
        onPress={() => router.push(`/movie/${item.tmdb_id}`)}
        activeOpacity={0.8}
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.miniPoster} />
        ) : (
          <View style={styles.miniNoPoster}>
            <Ionicons name="film" size={14} color="#bbb" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderListMovie = ({ item, index }: { item: any; index: number }) => {
    const userRating = item.user_rating;
    const director = item.director || '';
    const year = item.release_date ? ` (${item.release_date.substring(0, 4)})` : '';
    const globalIndex = (currentPage - 1) * PAGE_SIZE + index + 1;
    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() => router.push(`/movie/${item.tmdb_id}`)}
        onLongPress={() => handleRemoveMovie(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.listIndex}>
          <Text style={styles.listIndexText}>{globalIndex}</Text>
        </View>
        <View style={styles.listInfo}>
          <Text style={styles.listTitle} numberOfLines={1}>{item.title}{year}</Text>
          {director ? <Text style={styles.listDirector} numberOfLines={1}>{t('movie.director')}: {director}</Text> : null}
        </View>
        {userRating != null && (
          <View style={styles.listRating}>
            <Ionicons name="star" size={12} color={colors.frgmGreen} />
            <Text style={styles.listRatingText}>{userRating.toFixed(1)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ===================== HEADER COMPONENT =====================
  const LibraryHeader = () => (
    <View style={styles.headerSection}>
      {/* Library / Series Toggle Tabs */}
      <View style={styles.libTabRow}>
        <TouchableOpacity
          style={[styles.libTab, libTab === 'movies' && styles.libTabActive]}
          onPress={() => { setLibTab('movies'); setViewMode('grid'); }}
          activeOpacity={0.7}
        >
          <Ionicons name="film" size={16} color={libTab === 'movies' ? '#fff' : GREEN} />
          <Text style={[styles.libTabText, libTab === 'movies' && styles.libTabTextActive]}>{t('library.title')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.libTab, libTab === 'series' && styles.libTabActive]}
          onPress={() => { setLibTab('series'); setViewMode('grid'); }}
          activeOpacity={0.7}
        >
          <Ionicons name="tv" size={16} color={libTab === 'series' ? '#fff' : GREEN} />
          <Text style={[styles.libTabText, libTab === 'series' && styles.libTabTextActive]}>{t('seriesLibrary.title')}</Text>
        </TouchableOpacity>
      </View>

      {libTab === 'movies' && (
        <>
          {/* View Mode Toggle + Share Buttons */}
          <View style={styles.headerRow}>
            <Text style={styles.countText}>{filteredMovies.length} {t('library.movies')}{totalPages > 1 ? ` • Page ${currentPage}/${totalPages}` : ''}</Text>
            <View style={styles.headerActions}>
              {/* Frog's Eye Button */}
              <TouchableOpacity
                style={[styles.viewBtn, viewMode === 'frogseye' && styles.viewBtnActive]}
                onPress={() => setViewMode(viewMode === 'frogseye' ? 'grid' : 'frogseye')}
              >
                <Ionicons name="eye" size={18} color={viewMode === 'frogseye' ? '#fff' : GREEN} />
              </TouchableOpacity>
              {/* List Button */}
              <TouchableOpacity
                style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
                onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              >
                <Ionicons name="list" size={18} color={viewMode === 'list' ? '#fff' : GREEN} />
              </TouchableOpacity>
              {/* Share Buttons (visible in all modes) */}
              {(viewMode === 'frogseye' || viewMode === 'grid') && (
                <TouchableOpacity style={styles.shareBtn} onPress={handleShareFrogsEye} disabled={sharingImage}>
                  {sharingImage ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="share-outline" size={16} color="#fff" />}
                </TouchableOpacity>
              )}
              {viewMode === 'list' && (
                <TouchableOpacity style={styles.shareBtn} onPress={handleShareList} disabled={sharingList}>
                  {sharingList ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="share-outline" size={16} color="#fff" />}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );

  // ===================== PAGINATION FOOTER =====================
  const PaginationFooter = () => {
    if (totalPages <= 1) return null;
    return (
      <View style={styles.paginationContainer}>
        <TouchableOpacity
          style={[styles.paginationBtn, currentPage <= 1 && styles.paginationBtnDisabled]}
          onPress={goToPrevPage}
          disabled={currentPage <= 1}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={currentPage <= 1 ? '#ccc' : '#fff'} />
          <Text style={[styles.paginationBtnText, currentPage <= 1 && styles.paginationBtnTextDisabled]}>Previous</Text>
        </TouchableOpacity>
        <Text style={styles.paginationInfo}>{currentPage} / {totalPages}</Text>
        <TouchableOpacity
          style={[styles.paginationBtn, currentPage >= totalPages && styles.paginationBtnDisabled]}
          onPress={goToNextPage}
          disabled={currentPage >= totalPages}
          activeOpacity={0.7}
        >
          <Text style={[styles.paginationBtnText, currentPage >= totalPages && styles.paginationBtnTextDisabled]}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color={currentPage >= totalPages ? '#ccc' : '#fff'} />
        </TouchableOpacity>
      </View>
    );
  };

  // ===================== SERIES RENDER =====================
  const renderSeriesItem = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w342');
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/series/${item.tmdb_id}`)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: posterUrl || '' }}
          style={styles.posterContainer}
          resizeMode="cover"
        />
        <Text style={styles.movieTitle} numberOfLines={1}>{item.title || item.name}</Text>
        {item.user_rating && (
          <View style={styles.starsRow}>
            <Ionicons name="star" size={10} color={colors.frgmGreen} />
            <Text style={[styles.starText, { color: colors.frgmGreen }]}>{item.user_rating}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ===================== MAIN RENDER =====================

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="film" size={60} color={colors.border} />
        <Text style={styles.emptyTitle}>{t('auth.signIn')}</Text>
        <TouchableOpacity style={styles.signInButton} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.signInButtonText}>{t('auth.login')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {libTab === 'series' ? (
        <FlatList
          data={seriesList}
          keyExtractor={(item, index) => `series-${item.tmdb_id || index}`}
          renderItem={renderSeriesItem}
          numColumns={NUM_COLUMNS}
          key={`series-grid-${NUM_COLUMNS}`}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListHeaderComponent={<LibraryHeader />}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="tv-outline" size={60} color="#ccc" />
              <Text style={styles.emptyTitle}>{t('seriesLibrary.empty')}</Text>
              <Text style={styles.emptyText}>{t('seriesLibrary.emptyDesc')}</Text>
            </View>
          }
        />
      ) : movies.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="film-outline" size={60} color="#ccc" />
          <Text style={styles.emptyTitle}>{t('library.empty')}</Text>
          <Text style={styles.emptyText}>{t('library.emptyDesc')}</Text>
          <TouchableOpacity style={styles.searchButton} onPress={() => router.push('/(tabs)/search')}>
            <Ionicons name="search" size={20} color="#fff" />
            <Text style={styles.searchButtonText}>{t('search.title')}</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'frogseye' ? (
        <FlatList
          data={paginatedMovies}
          keyExtractor={(item) => item.id}
          renderItem={renderMiniMovie}
          numColumns={MINI_COLUMNS}
          key={`mini-${MINI_COLUMNS}`}
          columnWrapperStyle={styles.miniRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListHeaderComponent={<LibraryHeader />}
          ListFooterComponent={<PaginationFooter />}
        />
      ) : viewMode === 'list' ? (
        <FlatList
          data={paginatedMovies}
          keyExtractor={(item) => item.id}
          renderItem={renderListMovie}
          key="list-view"
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListHeaderComponent={<LibraryHeader />}
          ListFooterComponent={<PaginationFooter />}
        />
      ) : (
        <FlatList
          data={paginatedMovies}
          keyExtractor={(item) => item.id}
          renderItem={renderGridMovie}
          numColumns={NUM_COLUMNS}
          key={`grid-${NUM_COLUMNS}`}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListHeaderComponent={<LibraryHeader />}
          ListFooterComponent={<PaginationFooter />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 6, textAlign: 'center' },

  // Library/Series Toggle Tabs
  libTabRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  libTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: GREEN,
    backgroundColor: '#fff',
  },
  libTabActive: {
    backgroundColor: GREEN,
  },
  libTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: GREEN,
  },
  libTabTextActive: {
    color: '#fff',
  },
  signInButton: { marginTop: 20, backgroundColor: GREEN, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12 },
  signInButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  searchButton: { marginTop: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: GREEN, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, gap: 8 },
  searchButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Header section
  headerSection: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countText: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  viewBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  viewBtnActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1DA1F2',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    paddingVertical: 2,
  },
  filterRow: {
    marginBottom: 4,
  },
  filterContent: {
    gap: 8,
    paddingRight: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // Grid view
  listContent: {
    paddingHorizontal: GRID_SIDE_PAD,
    paddingBottom: 100,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
    justifyContent: 'flex-start',
  },
  card: {
    width: POSTER_W,
  },
  posterContainer: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
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
    backgroundColor: '#e8e8e8',
  },
  ratingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
    paddingHorizontal: 2,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 9,
    fontWeight: '700',
  },
  title: {
    color: '#333',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: POSTER_W,
    marginTop: 4,
    paddingHorizontal: 2,
    gap: 3,
  },
  inlineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  inlineRatingText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.frgmGreen,
  },

  // Frog's eye mini view
  miniRow: {
    gap: 4,
    marginBottom: 4,
    justifyContent: 'flex-start',
  },
  miniCard: {
    width: MINI_W,
    height: MINI_H,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
  },
  miniPoster: {
    width: '100%',
    height: '100%',
  },
  miniNoPoster: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ddd',
  },

  // List view
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  listIndex: {
    width: 28,
    alignItems: 'center',
  },
  listIndexText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
  },
  listInfo: {
    flex: 1,
    marginLeft: 8,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  listDirector: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  listRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
  },
  listRatingText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.frgmGreen,
  },

  // Pagination
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 16,
    marginTop: 8,
  },
  paginationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 4,
    minWidth: 100,
    justifyContent: 'center',
  },
  paginationBtnDisabled: {
    backgroundColor: '#E0E0E0',
  },
  paginationBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  paginationBtnTextDisabled: {
    color: '#ccc',
  },
  paginationInfo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
});
