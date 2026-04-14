import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  Dimensions,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import RatingBar from '../../src/components/RatingBar';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import api, { getPosterUrl } from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import Button from '../../src/components/Button';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { useTranslation } from '../../src/store/languageStore';
import FloatingTabBar from '../../src/components/FloatingTabBar';

const { width, height } = Dimensions.get('window');

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t, language } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inLibrary, setInLibrary] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [libraryMovie, setLibraryMovie] = useState<any>(null);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  
  // Form states
  const [rating, setRating] = useState(7.0);
  const [displayRating, setDisplayRating] = useState(7.0);
  const [review, setReview] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [watchLink, setWatchLink] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Streaming links states
  const [communityLinks, setCommunityLinks] = useState<any[]>([]);
  const [newStreamingUrl, setNewStreamingUrl] = useState('');
  const [newStreamingLabel, setNewStreamingLabel] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  
  // Modal states
  const [recommendModalVisible, setRecommendModalVisible] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [following, setFollowing] = useState<any[]>([]);
  const [recommendMessage, setRecommendMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  useEffect(() => {
    fetchMovie();
  }, [id, language]);

  useEffect(() => {
    fetchCommunityLinks();
  }, [id]);

  const fetchCommunityLinks = async () => {
    try {
      const response = await api.get(`/movies/${id}/streaming-links`);
      setCommunityLinks(response.data);
    } catch (error) {
      console.log('No community links yet');
    }
  };

  // Predefined FREE streaming services (matching frog-ram.com)
  const freeStreamingServices = [
    { name: 'Stremio', icon: 'film-outline', searchUrl: (title: string) => `https://web.stremio.com/#/search?search=${encodeURIComponent(title)}` },
    { name: 'Plex', icon: 'tv-outline', searchUrl: (title: string) => `https://watch.plex.tv/search?q=${encodeURIComponent(title)}` },
    { name: 'Tubi', icon: 'videocam-outline', searchUrl: (title: string) => `https://tubitv.com/search/${encodeURIComponent(title)}` },
  ];

  const handleOpenStreaming = (url: string) => {
    Linking.openURL(url);
  };

  const handleAddCommunityLink = async () => {
    if (!newStreamingUrl.trim()) {
      Alert.alert('Error', 'Please enter a URL');
      return;
    }
    if (!newStreamingUrl.startsWith('http://') && !newStreamingUrl.startsWith('https://')) {
      Alert.alert('Error', 'URL must start with http:// or https://');
      return;
    }

    setAddingLink(true);
    try {
      const response = await api.post(`/movies/${id}/streaming-links`, {
        url: newStreamingUrl.trim(),
        label: newStreamingLabel.trim() || undefined,
      });
      setCommunityLinks((prev) => [response.data, ...prev]);
      setNewStreamingUrl('');
      setNewStreamingLabel('');
      Alert.alert(t('movie.success'), t('movie.linkAdded'));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add link');
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteCommunityLink = async (linkId: string) => {
    try {
      await api.delete(`/streaming-links/${linkId}`);
      setCommunityLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (error) {
      Alert.alert('Error', 'Failed to delete link');
    }
  };

  const fetchMovie = async () => {
    try {
      const response = await api.get(`/movies/${id}`, { params: { lang: language } });
      setMovie(response.data);

      if (isAuthenticated) {
        const [libraryCheck, watchlistCheck, followingRes] = await Promise.all([
          api.get(`/library/check/${id}`),
          api.get(`/watchlist/check/${id}`).catch(() => ({ data: { in_watchlist: false } })),
          api.get('/following'),
        ]);
        
        setInLibrary(libraryCheck.data.in_library);
        if (libraryCheck.data.movie) {
          setLibraryMovie(libraryCheck.data.movie);
          const r = libraryCheck.data.movie.user_rating || 7.0;
          setRating(r);
          setDisplayRating(r);
          setReview(libraryCheck.data.movie.user_review || '');
          setPrivateNotes(libraryCheck.data.movie.private_notes || '');
          setWatchLink(libraryCheck.data.movie.watch_link || '');
        }
        
        setInWatchlist(watchlistCheck.data?.in_watchlist || false);
        setFollowing(followingRes.data);
      }
    } catch (error) {
      console.error('Error fetching movie:', error);
      Alert.alert('Error', 'Failed to load movie details');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToLibrary = async () => {
    if (!isAuthenticated) {
      Alert.alert(t('movie.signInRequired'), t('movie.signInToAdd'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.signIn'), onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }

    setAddingToLibrary(true);
    try {
      const response = await api.post('/library/add', {
        tmdb_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        release_date: movie.release_date,
        overview: movie.overview,
        vote_average: movie.vote_average,
        genres: movie.genres?.map((g: any) => g.name) || [],
        user_rating: rating,
        user_review: review,
        private_notes: privateNotes,
        watch_link: watchLink,
        imdb_id: movie.imdb_id,
        director: director?.name || null,
      });
      setInLibrary(true);
      setInWatchlist(false);
      setLibraryMovie(response.data);
      Alert.alert(t('movie.success'), t('movie.movieAdded'));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add movie');
    } finally {
      setAddingToLibrary(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!isAuthenticated) {
      Alert.alert(t('movie.signInRequired'), t('movie.signInToWatchlist'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.signIn'), onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }

    setAddingToWatchlist(true);
    try {
      const response = await api.post('/watchlist/add', {
        tmdb_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date,
        overview: movie.overview,
        vote_average: movie.vote_average,
        imdb_id: movie.imdb_id,
      });
      setInWatchlist(true);
      Alert.alert(t('movie.success'), t('movie.watchlistAdded'));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add to watchlist');
    } finally {
      setAddingToWatchlist(false);
    }
  };

  const handleSaveRating = async () => {
    if (!libraryMovie) return;
    
    setSaving(true);
    try {
      const response = await api.put(`/library/${libraryMovie.id}/rate`, {
        rating,
        review,
        private_notes: privateNotes,
        watch_link: watchLink,
      });
      setLibraryMovie(response.data);
      Alert.alert(t('movie.success'), t('movie.ratingSaved'));
    } catch (error) {
      Alert.alert('Error', 'Failed to save rating');
    } finally {
      setSaving(false);
    }
  };

  const handleWatchTrailer = () => {
    if (movie.trailer_url) {
      Linking.openURL(movie.trailer_url);
    } else {
      Alert.alert('', t('movie.noTrailer'));
    }
  };

  const handleRecommend = async () => {
    if (!selectedUser) {
      Alert.alert('', t('movie.noFriends'));
      return;
    }

    try {
      await api.post('/recommendations', {
        to_user_id: selectedUser.user_id,
        tmdb_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        message: recommendMessage,
      });
      setRecommendModalVisible(false);
      setSelectedUser(null);
      setRecommendMessage('');
      Alert.alert(t('movie.success'), `${t('movie.recommendedTo')} ${selectedUser.name}!`);
    } catch (error) {
      Alert.alert(t('common.error'), t('movie.shareError'));
    }
  };

  const handleShareMovie = async () => {
    if (!movie) return;
    setShareLoading(true);
    try {
      const tmdbId = movie.id || id;
      
      // Green star only if user rated (library) or FRGM community avg exists
      let frgmValue = '';
      if (inLibrary && libraryMovie?.user_rating) {
        frgmValue = String(libraryMovie.user_rating);
      } else if (movie.frgm_rating) {
        frgmValue = String(movie.frgm_rating);
      }
      
      const queryParams = frgmValue ? `?frgm=${frgmValue}` : '';
      const fileUri = FileSystem.cacheDirectory + `frogram_share_${tmdbId}.jpg`;

      if (Platform.OS === 'web') {
        // Web: fetch and share via Web Share API
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const shareImageUrl = `${backendUrl}/api/movies/${tmdbId}/share-image${queryParams}`;
        try {
          const response = await fetch(shareImageUrl);
          if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
          const blob = await response.blob();
          const jpegBlob = new Blob([blob], { type: 'image/jpeg' });
          const file = new File([jpegBlob], `frogram_${movie.title || 'movie'}.jpg`, { type: 'image/jpeg' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `${movie.title} - FROGRAM`,
              text: `${movie.title} - FROGRAM`,
            });
            setShareLoading(false);
            return;
          }
        } catch (webErr: any) {
          if (webErr?.name === 'AbortError' || webErr?.message?.includes('cancel') || webErr?.message?.includes('abort')) {
            setShareLoading(false);
            return;
          }
        }
        // Web text fallback
        await Share.share({ message: `🎬 ${movie.title || 'Movie'} - FROGRAM` });
      } else {
        // Native Android/iOS: Download binary directly to file
        try {
          const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
          const downloadUrl = `${backendUrl}/api/movies/${tmdbId}/share-image${queryParams}`;
          
          const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);
          
          if (downloadResult.status !== 200) throw new Error('Download failed');
          
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'image/jpeg',
              dialogTitle: `${movie.title} - FROGRAM`,
              UTI: 'public.jpeg',
            });
          } else {
            // Sharing not available, fallback to text share
            await Share.share({ message: `🎬 ${movie.title || 'Movie'} - FROGRAM` });
          }
        } catch (nativeErr: any) {
          console.log('Native share error:', nativeErr?.message);
          // If the image share fails, fallback to text share
          if (!nativeErr?.message?.includes('cancel') && !nativeErr?.message?.includes('dismiss')) {
            await Share.share({ message: `🎬 ${movie.title || 'Movie'} - FROGRAM` });
          }
        }
      }
    } catch (error: any) {
      if (!error?.message?.includes('cancel') && !error?.message?.includes('dismiss') && !error?.message?.includes('abort')) {
        console.log('Share error:', error);
        Alert.alert(t('common.error'), t('movie.shareError'));
      }
    } finally {
      setShareLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!movie) {
    return (
      <View style={styles.loadingContainer}>
        <Text>{t('movie.movieNotFound')}</Text>
      </View>
    );
  }

  const backdropUrl = getPosterUrl(movie.backdrop_path, 'w780');
  const posterUrl = getPosterUrl(movie.poster_path, 'w342');
  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;
  const runtime = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : null;

  // Get watch providers for US region
  const watchProviders = movie.watch_providers?.US || {};

  // Extract director from credits crew
  const director = movie.credits?.crew?.find((c: any) => c.job === 'Director');
  const directorPhotoUrl = director?.profile_path
    ? `https://image.tmdb.org/t/p/w185${director.profile_path}`
    : null;

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: '',
          headerTintColor: colors.white,
        }}
      />
      <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Backdrop */}
        <View style={styles.backdropContainer}>
          {backdropUrl ? (
            <Image source={{ uri: backdropUrl }} style={styles.backdrop} />
          ) : (
            <View style={[styles.backdrop, { backgroundColor: colors.primaryDark }]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)', colors.background]}
            style={styles.backdropGradient}
          />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.posterRow}>
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={styles.poster} />
            ) : (
              <View style={[styles.poster, styles.noPoster]}>
                <Ionicons name="film-outline" size={40} color={colors.textLight} />
              </View>
            )}
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{movie.title}</Text>
              <View style={styles.meta}>
                {year && <Text style={styles.metaText}>{year}</Text>}
                {runtime && <Text style={styles.metaText}>{runtime}</Text>}
              </View>
              
              {/* Ratings Row */}
              <View style={styles.ratingsRow}>
                {movie.imdb_rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color="#F5A623" />
                    <Text style={styles.ratingText}>{movie.imdb_rating}</Text>
                    <Text style={styles.ratingLabel}>IMDB</Text>
                  </View>
                )}
                {movie.omdb_rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color="#E74C3C" />
                    <Text style={styles.ratingText}>{movie.omdb_rating.toFixed(1)}</Text>
                    <Text style={styles.ratingLabel}>RT</Text>
                  </View>
                )}
                {movie.frgm_rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color={colors.primary} />
                    <Text style={[styles.ratingText, { color: colors.primary }]}>{movie.frgm_rating}</Text>
                    <Text style={[styles.ratingLabel, { color: colors.primary }]}>FRGM</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Director */}
          {director && (
            <TouchableOpacity
              style={styles.directorSection}
              onPress={() => router.push(`/person/${director.id}?name=${encodeURIComponent(director.name)}&photo=${encodeURIComponent(director.profile_path || '')}`)}
              activeOpacity={0.7}
            >
              {directorPhotoUrl ? (
                <Image source={{ uri: directorPhotoUrl }} style={styles.directorPhoto} />
              ) : (
                <View style={[styles.directorPhoto, styles.directorPhotoPlaceholder]}>
                  <Ionicons name="person" size={20} color={colors.textLight} />
                </View>
              )}
              <View style={styles.directorInfo}>
                <Text style={styles.directorLabel}>{t('movie.director')}</Text>
                <Text style={styles.directorName}>{director.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          {/* Watch Trailer Button */}
          {movie.trailer_url && (
            <TouchableOpacity style={styles.trailerButton} onPress={handleWatchTrailer}>
              <Ionicons name="play-circle" size={24} color={colors.white} />
              <Text style={styles.trailerButtonText}>{t('movie.watchTrailer')}</Text>
            </TouchableOpacity>
          )}

          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShareMovie} activeOpacity={0.7} disabled={shareLoading}>
            {shareLoading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="share-social" size={22} color={colors.white} />
            )}
            <Text style={styles.shareButtonText}>{shareLoading ? t('movie.creatingImage') : t('movie.shareMovie')}</Text>
          </TouchableOpacity>

          {/* Genres */}
          {movie.genres && movie.genres.length > 0 && (
            <View style={styles.genresContainer}>
              {movie.genres.map((genre: any) => (
                <View key={genre.id} style={styles.genreChip}>
                  <Text style={styles.genreText}>{genre.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Overview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('movie.overview').toUpperCase()}</Text>
            <Text style={styles.overview}>{movie.overview || t('movie.overview')}</Text>
          </View>

          {/* Add to Library/Watchlist Buttons */}
          {!inLibrary && (
            <View style={styles.addSection}>
              {/* Rating slider before adding */}
              <RatingBar
                value={displayRating}
                onValueChange={(val) => { setDisplayRating(val); setRating(val); }}
                label={t('movie.yourRating')}
              />
              <View style={styles.actionButtons}>
                <Button
                  title={t('movie.addToLibrary')}
                  onPress={handleAddToLibrary}
                  loading={addingToLibrary}
                  icon={<Ionicons name="add" size={20} color={colors.white} />}
                  style={styles.addButton}
                />
                {!inWatchlist && (
                  <Button
                    title={t('movie.addToWatchlist')}
                    variant="outline"
                    onPress={handleAddToWatchlist}
                    loading={addingToWatchlist}
                    icon={<Ionicons name="bookmark-outline" size={20} color={colors.primary} />}
                    style={styles.watchlistButton}
                  />
                )}
                {inWatchlist && (
                  <View style={styles.inWatchlistBadge}>
                    <Ionicons name="bookmark" size={16} color={colors.primary} />
                    <Text style={styles.inWatchlistText}>{t('movie.inWatchlist')}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* In Library Badge + Update Rating */}
          {inLibrary && (
            <View style={styles.inLibrarySection}>
              <View style={styles.inLibraryBadge}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <Text style={styles.inLibraryText}>{t('movie.inLibrary')}</Text>
              </View>
              <RatingBar
                value={displayRating}
                onValueChange={(val) => { setDisplayRating(val); setRating(val); }}
                label={t('movie.yourRating')}
              />
              <TouchableOpacity style={styles.updateBtn} onPress={handleSaveRating} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={styles.updateBtnText}>{t('common.save')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Where to Watch - matching frog-ram.com design */}
          <View style={styles.watchSection}>
            <View style={styles.watchHeader}>
              <Ionicons name="play-outline" size={20} color={colors.primary} />
              <Text style={styles.watchTitle}>{t('movie.whereToWatch')}</Text>
            </View>
            
            {/* TMDB Watch Providers */}
            {watchProviders.flatrate && watchProviders.flatrate.length > 0 ? (
              <View style={styles.providerSection}>
                <View style={styles.providerList}>
                  {watchProviders.flatrate.slice(0, 5).map((p: any) => (
                    <View key={p.provider_id} style={styles.providerItem}>
                      <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w92${p.logo_path}` }}
                        style={styles.providerLogo}
                      />
                      <Text style={styles.providerName}>{p.provider_name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={styles.noProvidersText}>{t('movie.noProviders')}</Text>
            )}

            {/* Divider */}
            <View style={styles.watchDivider} />

            {/* Free alternatives */}
            <Text style={styles.freeAltLabel}>{t('movie.freeAlternatives')}</Text>
            <View style={styles.freeChipsRow}>
              {freeStreamingServices.map((service) => (
                <TouchableOpacity
                  key={service.name}
                  style={styles.freeChip}
                  onPress={() => handleOpenStreaming(service.searchUrl(movie.title))}
                  activeOpacity={0.7}
                >
                  <Ionicons name={service.icon as any} size={16} color={colors.text} />
                  <Text style={styles.freeChipName}>{service.name}</Text>
                  <Text style={styles.freeChipTag}>{t('movie.free')}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.freeDisclaimer}>
              {t('movie.freeDisclaimer')}
            </Text>

            {/* Community Links */}
            {communityLinks.length > 0 && (
              <View style={styles.communitySection}>
                <View style={styles.watchDivider} />
                <Text style={styles.freeAltLabel}>{t('movie.communityLinks')}</Text>
                {communityLinks.map((link) => (
                  <View key={link.id} style={styles.communityLinkItem}>
                    <TouchableOpacity
                      style={styles.communityLinkContent}
                      onPress={() => handleOpenStreaming(link.url)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="link-outline" size={16} color={colors.primary} />
                      <View style={styles.communityLinkTextWrap}>
                        <Text style={styles.communityLinkLabel} numberOfLines={1}>
                          {link.label || link.url}
                        </Text>
                        <Text style={styles.communityLinkUser} numberOfLines={1}>
                          {t('movie.addedBy')} {link.user_name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {isAuthenticated && user?.user_id === link.user_id && (
                      <TouchableOpacity
                        onPress={() => handleDeleteCommunityLink(link.id)}
                        style={styles.deleteLinkBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Add your own watch link */}
            {isAuthenticated && (
              <View style={styles.addWatchLinkSection}>
                <View style={styles.watchDivider} />
                <Text style={styles.addWatchLabel}>{t('movie.addWatchLink')}</Text>
                <TextInput
                  style={styles.watchLinkInput}
                  placeholder="https://..."
                  placeholderTextColor={colors.textLight}
                  value={newStreamingUrl}
                  onChangeText={setNewStreamingUrl}
                  keyboardType="url"
                  autoCapitalize="none"
                />
                <Text style={styles.watchLinkHint}>
                  {t('movie.watchLinkHint')}
                </Text>
                {newStreamingUrl.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.addLinkButton, addingLink && styles.addLinkButtonDisabled]}
                    onPress={handleAddCommunityLink}
                    disabled={addingLink}
                    activeOpacity={0.7}
                  >
                    {addingLink ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                        <Text style={styles.addLinkButtonText}>{t('movie.addLink')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Recommend Button */}
          {isAuthenticated && (
            <TouchableOpacity
              style={styles.recommendButton}
              onPress={() => setRecommendModalVisible(true)}
            >
              <Ionicons name="share-outline" size={20} color={colors.primary} />
              <Text style={styles.recommendButtonText}>{t('movie.recommend')}</Text>
            </TouchableOpacity>
          )}

          {/* Cast */}
          {movie.credits?.cast && movie.credits.cast.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('movie.cast').toUpperCase()}</Text>
              <FlatList
                horizontal
                data={movie.credits.cast.slice(0, 10)}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.castItem}
                    onPress={() => router.push(`/person/${item.id}?name=${encodeURIComponent(item.name)}&photo=${encodeURIComponent(item.profile_path || '')}`)}
                    activeOpacity={0.7}
                  >
                    {item.profile_path ? (
                      <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w185${item.profile_path}` }}
                        style={styles.castImage}
                      />
                    ) : (
                      <View style={[styles.castImage, styles.noCastImage]}>
                        <Ionicons name="person" size={24} color={colors.textLight} />
                      </View>
                    )}
                    <Text style={styles.castName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.castCharacter} numberOfLines={1}>
                      {item.character}
                    </Text>
                  </TouchableOpacity>
                )}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
      <FloatingTabBar />
      </View>

      {/* Recommend Modal */}
      <Modal
        visible={recommendModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRecommendModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('movie.recommend')}</Text>
            {following.length === 0 ? (
              <Text style={styles.noFriendsText}>{t('movie.noFriends')}</Text>
            ) : (
              <>
                <FlatList
                  data={following}
                  keyExtractor={(item) => item.user_id}
                  style={styles.friendsList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.friendItem,
                        selectedUser?.user_id === item.user_id && styles.selectedFriend,
                      ]}
                      onPress={() => setSelectedUser(item)}
                    >
                      {item.picture ? (
                        <Image source={{ uri: item.picture }} style={styles.friendAvatar} />
                      ) : (
                        <View style={styles.friendAvatarPlaceholder}>
                          <Ionicons name="person" size={16} color={colors.primary} />
                        </View>
                      )}
                      <Text style={styles.friendName}>{item.name}</Text>
                      {selectedUser?.user_id === item.user_id && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  )}
                />
                <TextInput
                  style={styles.reviewInput}
                  placeholder={t('movie.addMessage')}
                  value={recommendMessage}
                  onChangeText={setRecommendMessage}
                  multiline
                />
              </>
            )}
            <View style={styles.modalButtons}>
              <Button
                title={t('common.cancel')}
                variant="outline"
                onPress={() => {
                  setRecommendModalVisible(false);
                  setSelectedUser(null);
                  setRecommendMessage('');
                }}
              />
              <Button
                title={t('movie.send')}
                onPress={handleRecommend}
                disabled={!selectedUser}
              />
            </View>
          </View>
        </View>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  backdropContainer: {
    height: height * 0.35,
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  backdropGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  content: {
    marginTop: -80,
    paddingHorizontal: spacing.lg,
  },
  posterRow: {
    flexDirection: 'row',
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: borderRadius.lg,
  },
  noPoster: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.text,
  },
  meta: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  metaText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  ratingsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: 4,
    flexShrink: 0,
  },
  ratingText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    color: colors.text,
  },
  ratingLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  // Director section
  directorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  directorPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
  },
  directorPhotoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.border,
  },
  directorInfo: {
    flex: 1,
  },
  directorLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  directorName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  trailerButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1DA1F2',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  shareButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  genreChip: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  genreText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  overview: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  actionButtons: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  addSection: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  addButton: {
    width: '100%',
  },
  watchlistButton: {
    width: '100%',
  },
  inWatchlistBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  inWatchlistText: {
    color: colors.primary,
    fontWeight: '600',
  },
  inLibrarySection: {
    marginTop: spacing.lg,
    backgroundColor: '#F0FFF0',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  inLibraryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  inLibraryText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: 'center',
  },
  updateBtnText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  linkInput: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  providerSection: {
    marginBottom: spacing.md,
  },
  providerLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  providerList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  providerItem: {
    alignItems: 'center',
    width: 60,
  },
  providerLogo: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  providerName: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  customLinkSection: {
    marginTop: spacing.md,
  },
  noProviders: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  // Where to Watch - matching frog-ram.com design
  watchSection: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  watchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  watchTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
  },
  noProvidersText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  watchDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  freeAltLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  freeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  freeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: 6,
  },
  freeChipName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  freeChipTag: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  freeDisclaimer: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  communitySection: {
    marginTop: 0,
  },
  communityLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  communityLinkContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  communityLinkTextWrap: {
    flex: 1,
  },
  communityLinkLabel: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.primary,
  },
  communityLinkUser: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  deleteLinkBtn: {
    padding: spacing.sm,
  },
  addWatchLinkSection: {
    marginTop: 0,
  },
  addWatchLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  watchLinkInput: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  watchLinkHint: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  addLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  addLinkButtonDisabled: {
    opacity: 0.6,
  },
  addLinkButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  recommendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xl,
  },
  recommendButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  castItem: {
    width: 80,
    marginRight: spacing.md,
    alignItems: 'center',
  },
  castImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  noCastImage: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  castName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  castCharacter: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomPadding: {
    height: spacing.xxl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  noFriendsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.lg,
  },
  friendsList: {
    maxHeight: 200,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  selectedFriend: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  friendAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
    marginLeft: spacing.md,
    color: colors.text,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
