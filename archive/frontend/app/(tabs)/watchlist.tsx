import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '../../src/store/authStore';
import { useTranslation } from '../../src/store/languageStore';
import api, { getPosterUrl } from '../../src/utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH >= 768;
const NUM_COLUMNS = IS_TABLET ? 6 : 3;
const GAP = 8;
const PAD = 12;
// Dynamic card width to fill screen evenly
const POSTER_W = Math.floor((SCREEN_WIDTH - 2 * PAD - (NUM_COLUMNS - 1) * GAP) / NUM_COLUMNS);
const POSTER_H = Math.floor(POSTER_W * 1.5);
const GRID_SIDE_PAD = PAD;
const GREEN = '#2E7D32';
const MINI_W = 45;
const MINI_H = 67;
const MINI_COLUMNS = Math.max(4, Math.floor((SCREEN_WIDTH - PAD * 2 + 4) / (MINI_W + 4)));

type ViewMode = 'grid' | 'frogseye' | 'list';
type WatchlistTab = 'movies' | 'series';

export default function WatchlistScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [seriesWatchlist, setSeriesWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sharingList, setSharingList] = useState(false);
  const [activeTab, setActiveTab] = useState<WatchlistTab>('movies');

  const fetchWatchlist = async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      const [moviesRes, seriesRes] = await Promise.all([
        api.get('/watchlist'),
        api.get('/series-watchlist'),
      ]);
      setWatchlist(moviesRes.data || []);
      setSeriesWatchlist(seriesRes.data || []);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchWatchlist();
    }, [isAuthenticated])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchWatchlist();
  };

  const handleRemove = (item: any) => {
    const isSeries = activeTab === 'series';
    const title = isSeries ? item.name : item.title;
    Alert.alert(
      'Remove from Watchlist',
      `Remove "${title}" from your watchlist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isSeries) {
                await api.delete(`/series-watchlist/${item.id}`);
                setSeriesWatchlist((prev) => prev.filter((m) => m.id !== item.id));
              } else {
                await api.delete(`/watchlist/${item.id}`);
                setWatchlist((prev) => prev.filter((m) => m.id !== item.id));
              }
            } catch (e) {
              console.error('Error removing from watchlist:', e);
            }
          },
        },
      ]
    );
  };

  const shareImageFromApi = async (endpoint: string, body: any, filename: string) => {
    // Step 1: Generate image on backend
    const response = await api.post(`/${endpoint}`, body, {
      headers: { 'Accept': 'application/json' },
    });
    
    const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const fileUri = FileSystem.cacheDirectory + filename;
    
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
  };

  const handleShareList = async () => {
    setSharingList(true);
    try {
      const currentList = activeTab === 'series' ? seriesWatchlist : watchlist;
      const label = activeTab === 'series' ? 'Series Watchlist' : 'Watchlist';
      const shareTitle = `${user?.name || 'FROGRAM'} - ${label}`;

      if (viewMode === 'frogseye' || viewMode === 'grid') {
        const posterPaths = currentList.map(m => m.poster_path).filter(Boolean);
        if (posterPaths.length === 0) {
          Alert.alert('Error', 'No posters to share');
          setSharingList(false);
          return;
        }
        await shareImageFromApi('share/collage', { poster_paths: posterPaths, title: shareTitle }, 'frogram_watchlist_collage.jpg');
      } else {
        const movieData = currentList.map(m => ({
          title: activeTab === 'series' ? (m.name || m.title) : m.title,
          year: m.year || '',
        }));
        if (movieData.length === 0) {
          Alert.alert('Error', 'No items to share');
          setSharingList(false);
          return;
        }
        await shareImageFromApi('share/list-image', { movies: movieData, title: shareTitle }, 'frogram_watchlist_list.jpg');
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to generate share image. Please try again.');
    } finally {
      setSharingList(false);
    }
  };

  // Helper: route + title based on active tab
  const getItemTitle = (item: any) => activeTab === 'series' ? (item.name || item.title) : item.title;
  const getItemRoute = (item: any): any => activeTab === 'series' ? `/series/${item.tmdb_id}` : `/movie/${item.tmdb_id}`;

  // ============== RENDER GRID ITEM ==============
  const renderGridItem = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w342');
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(getItemRoute(item))}
        onLongPress={() => handleRemove(item)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: posterUrl || '' }} style={styles.poster} resizeMode="cover" />
        <Text style={styles.title} numberOfLines={1}>{getItemTitle(item)}</Text>
        <View style={styles.starsRow}>
          {item.imdb_rating != null && (
            <View style={styles.starItem}>
              <Ionicons name="star" size={9} color="#F5A623" />
              <Text style={[styles.starText, { color: '#F5A623' }]}>{item.imdb_rating}</Text>
            </View>
          )}
          {item.omdb_rating != null && (
            <View style={styles.starItem}>
              <Ionicons name="star" size={9} color="#E74C3C" />
              <Text style={[styles.starText, { color: '#E74C3C' }]}>{item.omdb_rating}</Text>
            </View>
          )}
          {item.vote_average != null && item.vote_average > 0 && !item.omdb_rating && (
            <View style={styles.starItem}>
              <Ionicons name="star" size={9} color="#E74C3C" />
              <Text style={[styles.starText, { color: '#E74C3C' }]}>{Math.round(item.vote_average * 10) / 10}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ============== RENDER FROGSEYE ITEM ==============
  const renderFrogseyeItem = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w92');
    return (
      <TouchableOpacity
        style={styles.miniCard}
        onPress={() => router.push(getItemRoute(item))}
        onLongPress={() => handleRemove(item)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: posterUrl || '' }} style={styles.miniPoster} resizeMode="cover" />
      </TouchableOpacity>
    );
  };

  // ============== RENDER LIST ITEM ==============
  const renderListItem = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w92');
    return (
      <TouchableOpacity
        style={styles.listCard}
        onPress={() => router.push(getItemRoute(item))}
        onLongPress={() => handleRemove(item)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: posterUrl || '' }} style={styles.listPoster} resizeMode="cover" />
        <View style={styles.listInfo}>
          <Text style={styles.listTitle} numberOfLines={2}>{getItemTitle(item)}</Text>
          {item.year && <Text style={styles.listYear}>{item.year}</Text>}
          <View style={styles.starsRow}>
            {item.imdb_rating != null && (
              <View style={styles.starItem}>
                <Ionicons name="star" size={10} color="#F5A623" />
                <Text style={[styles.starText, { color: '#F5A623' }]}>{item.imdb_rating}</Text>
              </View>
            )}
            {item.omdb_rating != null && (
              <View style={styles.starItem}>
                <Ionicons name="star" size={10} color="#E74C3C" />
                <Text style={[styles.starText, { color: '#E74C3C' }]}>{item.omdb_rating}</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={() => handleRemove(item)} style={styles.removeBtn}>
          <Ionicons name="close-circle" size={20} color="#E74C3C" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ============== HEADER with view toggles ==============
  const activeList = activeTab === 'movies' ? watchlist : seriesWatchlist;
  const activeCount = activeList.length;
  const countLabel = activeTab === 'movies' ? 'movies' : 'series';

  const ListHeader = () => (
    <View>
      {/* Movies / Series Tab Toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'movies' && styles.tabBtnActive]}
          onPress={() => setActiveTab('movies')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'movies' && styles.tabBtnTextActive]}>
            {t('search.movies')} ({watchlist.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'series' && styles.tabBtnActive]}
          onPress={() => setActiveTab('series')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'series' && styles.tabBtnTextActive]}>
            {t('search.series')} ({seriesWatchlist.length})
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.headerRow}>
        <Text style={styles.headerCount}>{activeCount} {countLabel} to watch</Text>
        <View style={styles.viewToggles}>
        <TouchableOpacity
          style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnActive]}
          onPress={() => setViewMode('grid')}
        >
          <Ionicons name="grid" size={16} color={viewMode === 'grid' ? '#fff' : GREEN} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewBtn, viewMode === 'frogseye' && styles.viewBtnActive]}
          onPress={() => setViewMode('frogseye')}
        >
          <Ionicons name="eye" size={16} color={viewMode === 'frogseye' ? '#fff' : GREEN} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
          onPress={() => setViewMode('list')}
        >
          <Ionicons name="list" size={16} color={viewMode === 'list' ? '#fff' : GREEN} />
        </TouchableOpacity>
        {/* Share */}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShareList} disabled={sharingList}>
          {sharingList ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="share-outline" size={16} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="bookmark-outline" size={60} color="#ccc" />
        <Text style={styles.emptyTitle}>Sign in to see your watchlist</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.loginBtnText}>Sign In</Text>
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

  if (activeList.length === 0 && !loading) {
    return (
      <View style={styles.container}>
        <View>
          {/* Movies / Series Tab Toggle */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'movies' && styles.tabBtnActive]}
              onPress={() => setActiveTab('movies')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'movies' && styles.tabBtnTextActive]}>
                {t('search.movies')} ({watchlist.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'series' && styles.tabBtnActive]}
              onPress={() => setActiveTab('series')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'series' && styles.tabBtnTextActive]}>
                {t('search.series')} ({seriesWatchlist.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <Ionicons name="bookmark-outline" size={60} color="#ccc" />
          <Text style={styles.emptyTitle}>
            {activeTab === 'movies' ? 'No movies in watchlist' : 'No series in watchlist'}
          </Text>
          <Text style={styles.emptyText}>
            {activeTab === 'movies' 
              ? 'Search for movies and add them to your watchlist' 
              : 'Search for series and add them to your watchlist'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {viewMode === 'grid' && (
        <FlatList
          data={activeList}
          keyExtractor={(item) => item.id}
          renderItem={renderGridItem}
          numColumns={NUM_COLUMNS}
          key={`wl-grid-${NUM_COLUMNS}-${activeTab}`}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListHeaderComponent={<ListHeader />}
        />
      )}
      {viewMode === 'frogseye' && (
        <FlatList
          data={activeList}
          keyExtractor={(item) => item.id}
          renderItem={renderFrogseyeItem}
          numColumns={MINI_COLUMNS}
          key={`wl-frogseye-${MINI_COLUMNS}-${activeTab}`}
          columnWrapperStyle={styles.miniRow}
          contentContainerStyle={styles.miniListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListHeaderComponent={<ListHeader />}
        />
      )}
      {viewMode === 'list' && (
        <FlatList
          data={activeList}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={styles.listViewContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListHeaderComponent={<ListHeader />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 6, textAlign: 'center' },
  loginBtn: {
    marginTop: 16,
    backgroundColor: GREEN,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  loginBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  headerCount: {
    fontSize: Platform.OS === 'android' ? 11 : 13,
    fontWeight: '600',
    color: '#666',
  },
  viewToggles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  viewBtnActive: {
    backgroundColor: GREEN,
  },
  shareBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: GREEN,
    marginLeft: 4,
  },
  // Grid styles
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
    alignItems: 'center',
  },
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
    textAlign: 'center',
    width: POSTER_W,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  starItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  starText: {
    fontSize: 9,
    fontWeight: '700',
  },
  // Frogseye styles
  miniListContent: {
    paddingHorizontal: PAD,
    paddingBottom: 100,
  },
  miniRow: {
    gap: 4,
    marginBottom: 4,
    justifyContent: 'flex-start',
  },
  miniCard: {
    width: MINI_W,
    alignItems: 'center',
  },
  miniPoster: {
    width: MINI_W,
    height: MINI_H,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  // List styles
  listViewContent: {
    paddingHorizontal: PAD,
    paddingBottom: 100,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  listPoster: {
    width: 50,
    height: 75,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  listInfo: {
    flex: 1,
    marginLeft: 12,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  listYear: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  removeBtn: {
    padding: 8,
  },
  // Tab toggle styles
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: PAD,
    paddingTop: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: GREEN,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabBtnTextActive: {
    color: '#fff',
  },
});
