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
  TextInput,
  Dimensions,
  Linking,
  Share,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import api, { getPosterUrl } from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import { useTranslation } from '../../src/store/languageStore';
import Button from '../../src/components/Button';
import RatingBar from '../../src/components/RatingBar';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import FloatingTabBar from '../../src/components/FloatingTabBar';

const { width, height } = Dimensions.get('window');

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { t, language } = useTranslation();
  const [series, setSeries] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inLibrary, setInLibrary] = useState(false);
  const [librarySeries, setLibrarySeries] = useState<any>(null);
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [displayRating, setDisplayRating] = useState(7.0);

  // Form states
  const [rating, setRating] = useState(7.0);
  const [shareLoading, setShareLoading] = useState(false);
  const [review, setReview] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Streaming links
  const [communityLinks, setCommunityLinks] = useState<any[]>([]);
  const [newStreamingUrl, setNewStreamingUrl] = useState('');
  const [addingLink, setAddingLink] = useState(false);

  const freeStreamingServices = [
    { name: 'Stremio', icon: 'film-outline', searchUrl: (title: string) => `https://web.stremio.com/#/search?search=${encodeURIComponent(title)}` },
    { name: 'Plex', icon: 'tv-outline', searchUrl: (title: string) => `https://watch.plex.tv/search?q=${encodeURIComponent(title)}` },
    { name: 'Tubi', icon: 'videocam-outline', searchUrl: (title: string) => `https://tubitv.com/search/${encodeURIComponent(title)}` },
  ];

  useEffect(() => {
    fetchSeries();
    fetchCommunityLinks();
  }, [id]);

  const fetchCommunityLinks = async () => {
    try {
      const response = await api.get(`/movies/${id}/streaming-links`);
      setCommunityLinks(response.data);
    } catch (error) {
      console.log('No community links');
    }
  };

  const fetchSeries = async () => {
    try {
      const response = await api.get(`/series/${id}`, { params: { lang: language } });
      setSeries(response.data);

      if (isAuthenticated) {
        try {
          const libraryCheck = await api.get(`/series-library/check/${id}`);
          setInLibrary(libraryCheck.data.in_library);
          if (libraryCheck.data.series) {
            setLibrarySeries(libraryCheck.data.series);
            setRating(libraryCheck.data.series.user_rating || 7.0);
            setDisplayRating(libraryCheck.data.series.user_rating || 7.0);
            setReview(libraryCheck.data.series.user_review || '');
            setPrivateNotes(libraryCheck.data.series.private_notes || '');
          }
          // Check watchlist
          const watchlistCheck = await api.get(`/series-watchlist/check/${id}`);
          setInWatchlist(watchlistCheck.data.in_watchlist);
        } catch (e) {
          // Library/watchlist check failed silently
        }
      }
    } catch (error) {
      console.error('Error fetching series:', error);
      Alert.alert('Error', 'Failed to load series details');
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
      const response = await api.post('/series-library/add', {
        tmdb_id: series.id,
        name: series.name,
        poster_path: series.poster_path,
        backdrop_path: series.backdrop_path,
        first_air_date: series.first_air_date,
        overview: series.overview,
        vote_average: series.vote_average,
        genres: series.genres?.map((g: any) => g.name) || [],
        number_of_seasons: series.number_of_seasons,
        number_of_episodes: series.number_of_episodes,
        user_rating: displayRating,
        user_review: review,
        private_notes: privateNotes,
      });
      setInLibrary(true);
      setInWatchlist(false);
      setLibrarySeries(response.data);
      Alert.alert(t('movie.success'), t('movie.movieAdded'));
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.detail || 'Failed to add series');
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
      await api.post('/series-watchlist/add', {
        tmdb_id: series.id,
        name: series.name,
        poster_path: series.poster_path,
        first_air_date: series.first_air_date,
        overview: series.overview,
        vote_average: series.vote_average,
        number_of_seasons: series.number_of_seasons,
        genres: series.genres?.map((g: any) => g.name) || [],
      });
      setInWatchlist(true);
      Alert.alert(t('movie.success'), t('movie.watchlistAdded'));
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.detail || 'Failed to add to watchlist');
    } finally {
      setAddingToWatchlist(false);
    }
  };

  const handleSaveRating = async () => {
    if (!librarySeries) return;
    setSaving(true);
    try {
      const response = await api.put(`/series-library/${librarySeries.id}/rate`, {
        rating,
        review,
        private_notes: privateNotes,
      });
      setLibrarySeries(response.data);
      Alert.alert('Success', 'Your rating has been saved!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save rating');
    } finally {
      setSaving(false);
    }
  };

  const handleWatchTrailer = () => {
    if (series.trailer_url) {
      Linking.openURL(series.trailer_url);
    } else {
      Alert.alert('No Trailer', 'Trailer not available for this series');
    }
  };

  const handleOpenStreaming = (url: string) => {
    Linking.openURL(url);
  };

  const handleAddCommunityLink = async () => {
    if (!newStreamingUrl.trim()) return;
    if (!newStreamingUrl.startsWith('http://') && !newStreamingUrl.startsWith('https://')) {
      Alert.alert('Error', 'URL must start with http:// or https://');
      return;
    }
    setAddingLink(true);
    try {
      const response = await api.post(`/movies/${id}/streaming-links`, {
        url: newStreamingUrl.trim(),
      });
      setCommunityLinks((prev) => [response.data, ...prev]);
      setNewStreamingUrl('');
      Alert.alert('Success', 'Link added!');
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

  const handleShareSeries = async () => {
    if (!series) return;
    setShareLoading(true);
    try {
      const tmdbId = series.id || id;
      const frgmRating = series.frgm_rating || '';
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const shareImageUrl = `${backendUrl}/api/series/${tmdbId}/share-image${frgmRating ? `?frgm=${frgmRating}` : ''}`;

      if (Platform.OS !== 'web') {
        const fileUri = FileSystem.documentDirectory + 'frogram_share.jpg';
        const download = await FileSystem.downloadAsync(shareImageUrl, fileUri);
        if (download.status === 200) {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(download.uri, {
              mimeType: 'image/jpeg',
              dialogTitle: `${series.name} - FROGRAM`,
              UTI: 'public.jpeg',
            });
            setShareLoading(false);
            return;
          }
        }
      }

      if (Platform.OS === 'web') {
        try {
          const response = await fetch(shareImageUrl);
          const blob = await response.blob();
          const file = new File([blob], `frogram_${series.name || 'series'}.jpg`, { type: 'image/jpeg' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `${series.name} - FROGRAM`,
            });
            setShareLoading(false);
            return;
          }
        } catch (webErr) {
          console.log('Web share error:', webErr);
        }
      }

      await Share.share({ message: `📺 ${series.name || 'Series'} - FROGRAM` });
    } catch (error: any) {
      if (!error?.message?.includes('cancel') && !error?.message?.includes('dismiss') && !error?.message?.includes('abort')) {
        console.log('Share error:', error);
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

  if (!series) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.text }}>Series not found</Text>
      </View>
    );
  }

  const backdropUrl = getPosterUrl(series.backdrop_path, 'w780');
  const posterUrl = getPosterUrl(series.poster_path, 'w342');
  const year = series.first_air_date ? new Date(series.first_air_date).getFullYear() : null;
  const watchProviders = series.watch_providers?.US || {};

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitle: '',
          headerTintColor: colors.white,
        }}
      />
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
                <Ionicons name="tv-outline" size={40} color={colors.textLight} />
              </View>
            )}
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{series.name}</Text>
              <View style={styles.meta}>
                {year && <Text style={styles.metaText}>{year}</Text>}
                {series.number_of_seasons && (
                  <Text style={styles.metaText}>{series.number_of_seasons} Season{series.number_of_seasons > 1 ? 's' : ''}</Text>
                )}
              </View>

              {/* Ratings Row */}
              <View style={styles.ratingsRow}>
                {series.imdb_rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color="#F5A623" />
                    <Text style={styles.ratingText}>{series.imdb_rating}</Text>
                    <Text style={styles.ratingLabel}>IMDB</Text>
                  </View>
                )}
                {series.omdb_rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color="#E74C3C" />
                    <Text style={styles.ratingText}>{series.omdb_rating.toFixed(1)}</Text>
                    <Text style={styles.ratingLabel}>RT</Text>
                  </View>
                )}
                {series.frgm_rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color={colors.frgmGreen} />
                    <Text style={[styles.ratingText, { color: colors.primary }]}>{series.frgm_rating}</Text>
                    <Text style={[styles.ratingLabel, { color: colors.primary }]}>FRGM</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Watch Trailer */}
          {series.trailer_url && (
            <TouchableOpacity style={styles.trailerButton} onPress={handleWatchTrailer}>
              <Ionicons name="play-circle" size={24} color={colors.white} />
              <Text style={styles.trailerButtonText}>Watch Trailer</Text>
            </TouchableOpacity>
          )}

          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShareSeries} activeOpacity={0.7}>
            <Ionicons name="share-social" size={22} color={colors.white} />
            <Text style={styles.shareButtonText}>Share Series</Text>
          </TouchableOpacity>

          {/* Genres */}
          {series.genres && series.genres.length > 0 && (
            <View style={styles.genresContainer}>
              {series.genres.map((genre: any) => (
                <View key={genre.id} style={styles.genreChip}>
                  <Text style={styles.genreText}>{genre.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Series Info */}
          {(series.number_of_seasons || series.number_of_episodes) && (
            <View style={styles.seriesInfoRow}>
              {series.number_of_seasons && (
                <View style={styles.seriesInfoItem}>
                  <Text style={styles.seriesInfoValue}>{series.number_of_seasons}</Text>
                  <Text style={styles.seriesInfoLabel}>Seasons</Text>
                </View>
              )}
              {series.number_of_episodes && (
                <View style={styles.seriesInfoItem}>
                  <Text style={styles.seriesInfoValue}>{series.number_of_episodes}</Text>
                  <Text style={styles.seriesInfoLabel}>Episodes</Text>
                </View>
              )}
              {series.status && (
                <View style={styles.seriesInfoItem}>
                  <Text style={styles.seriesInfoValue}>{series.status}</Text>
                  <Text style={styles.seriesInfoLabel}>Status</Text>
                </View>
              )}
            </View>
          )}

          {/* Overview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OVERVIEW</Text>
            <Text style={styles.overview}>{series.overview || 'No overview available.'}</Text>
          </View>

          {/* Rating & Action Buttons - Rate before adding (like movies) */}
          {!inLibrary && (
            <View style={styles.ratingSection}>
              <RatingBar
                value={displayRating}
                onValueChange={setDisplayRating}
                minimumValue={0}
                maximumValue={10}
                step={0.1}
                label={t('movie.rateThisMovie')}
              />
              <View style={styles.actionButtons}>
                <Button
                  title={t('movie.addToLibrary')}
                  onPress={handleAddToLibrary}
                  loading={addingToLibrary}
                  icon={<Ionicons name="add" size={20} color={colors.white} />}
                  style={{ flex: 1 }}
                />
              </View>
              {!inWatchlist && (
                <Button
                  title={t('movie.addToWatchlist')}
                  variant="outline"
                  onPress={handleAddToWatchlist}
                  loading={addingToWatchlist}
                  icon={<Ionicons name="bookmark-outline" size={20} color={colors.primary} />}
                  style={{ marginTop: spacing.sm }}
                />
              )}
              {inWatchlist && (
                <View style={styles.inWatchlistBadge}>
                  <Ionicons name="bookmark" size={16} color={colors.primary} />
                  <Text style={styles.inWatchlistText}>{t('movie.inWatchlist')}</Text>
                </View>
              )}
            </View>
          )}

          {/* Rating Section - Update rating when already in library */}
          {inLibrary && (
            <View style={styles.ratingSection}>
              <RatingBar
                value={rating}
                onValueChange={setRating}
                minimumValue={0}
                maximumValue={10}
                step={0.1}
                label={t('movie.yourRating')}
              />
              <Text style={styles.inputLabel}>{t('movie.addMessage')}</Text>
              <TextInput
                style={styles.reviewInput}
                placeholder={t('movie.addMessage')}
                placeholderTextColor={colors.textLight}
                value={review}
                onChangeText={setReview}
                multiline
                numberOfLines={4}
              />
              <Text style={styles.inputLabel}>Private Notes</Text>
              <TextInput
                style={styles.reviewInput}
                placeholder="Personal notes..."
                placeholderTextColor={colors.textLight}
                value={privateNotes}
                onChangeText={setPrivateNotes}
                multiline
                numberOfLines={3}
              />
              <Button
                title="Save Changes"
                onPress={handleSaveRating}
                loading={saving}
                style={{ marginTop: spacing.lg }}
              />
            </View>
          )}

          {/* Where to Watch */}
          <View style={styles.watchSection}>
            <View style={styles.watchHeader}>
              <Ionicons name="play-outline" size={20} color={colors.primary} />
              <Text style={styles.watchTitle}>Where to Watch</Text>
            </View>

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
              <Text style={styles.noProvidersText}>No streaming providers found for your region</Text>
            )}

            <View style={styles.watchDivider} />

            <Text style={styles.freeAltLabel}>Free alternatives:</Text>
            <View style={styles.freeChipsRow}>
              {freeStreamingServices.map((service) => (
                <TouchableOpacity
                  key={service.name}
                  style={styles.freeChip}
                  onPress={() => handleOpenStreaming(service.searchUrl(series.name))}
                  activeOpacity={0.7}
                >
                  <Ionicons name={service.icon as any} size={16} color={colors.text} />
                  <Text style={styles.freeChipName}>{service.name}</Text>
                  <Text style={styles.freeChipTag}>(free)</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.freeDisclaimer}>
              These are legal free streaming platforms. Availability may vary by region.
            </Text>

            {communityLinks.length > 0 && (
              <View>
                <View style={styles.watchDivider} />
                <Text style={styles.freeAltLabel}>Community links:</Text>
                {communityLinks.map((link) => (
                  <View key={link.id} style={styles.communityLinkItem}>
                    <TouchableOpacity
                      style={styles.communityLinkContent}
                      onPress={() => handleOpenStreaming(link.url)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="link-outline" size={16} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.communityLinkLabel} numberOfLines={1}>{link.label || link.url}</Text>
                        <Text style={styles.communityLinkUser}>Added by {link.user_name}</Text>
                      </View>
                    </TouchableOpacity>
                    {isAuthenticated && user?.user_id === link.user_id && (
                      <TouchableOpacity onPress={() => handleDeleteCommunityLink(link.id)} style={{ padding: spacing.sm }}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {isAuthenticated && (
              <View>
                <View style={styles.watchDivider} />
                <Text style={styles.freeAltLabel}>Add your own watch link:</Text>
                <TextInput
                  style={styles.watchLinkInput}
                  placeholder="https://..."
                  placeholderTextColor={colors.textLight}
                  value={newStreamingUrl}
                  onChangeText={setNewStreamingUrl}
                  keyboardType="url"
                  autoCapitalize="none"
                />
                <Text style={styles.watchLinkHint}>Add a link where you can watch this series (personal server, etc.)</Text>
                {newStreamingUrl.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.addLinkButton, addingLink && { opacity: 0.6 }]}
                    onPress={handleAddCommunityLink}
                    disabled={addingLink}
                  >
                    {addingLink ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                        <Text style={styles.addLinkButtonText}>Add Link</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Cast */}
          {series.credits?.cast && series.credits.cast.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>CAST</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {series.credits.cast.slice(0, 10).map((item: any) => (
                  <View key={item.id} style={styles.castItem}>
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
                    <Text style={styles.castName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.castCharacter} numberOfLines={1}>{item.character}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={{ height: spacing.xxl }} />
        </View>
      </ScrollView>
      <FloatingTabBar />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  backdropContainer: { height: height * 0.35 },
  backdrop: { width: '100%', height: '100%' },
  backdropGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  content: { marginTop: -80, paddingHorizontal: spacing.lg },
  posterRow: { flexDirection: 'row' },
  poster: { width: 120, height: 180, borderRadius: borderRadius.lg },
  noPoster: { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  titleContainer: { flex: 1, marginLeft: spacing.md, justifyContent: 'flex-end', paddingBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.text },
  meta: { flexDirection: 'row', marginTop: spacing.xs, gap: spacing.md },
  metaText: { fontSize: fontSize.md, color: colors.textSecondary },
  ratingsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm, gap: spacing.sm },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, gap: 4, flexShrink: 0 },
  ratingText: { fontSize: fontSize.sm, fontWeight: 'bold', color: colors.text },
  ratingLabel: { fontSize: fontSize.xs, color: colors.textSecondary, flexShrink: 0 },
  trailerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: borderRadius.lg, marginTop: spacing.lg, gap: spacing.sm },
  trailerButtonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  shareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1DA1F2', paddingVertical: spacing.md, borderRadius: borderRadius.lg, marginTop: spacing.md, gap: spacing.sm },
  shareButtonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
  genresContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, gap: spacing.sm },
  genreChip: { backgroundColor: colors.secondary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full },
  genreText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '500' },
  seriesInfoRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg },
  seriesInfoItem: { alignItems: 'center' },
  seriesInfoValue: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  seriesInfoLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  section: { marginTop: spacing.xl },
  sectionTitle: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.md, letterSpacing: 1 },
  overview: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 24 },
  actionButtons: { marginTop: spacing.lg, gap: spacing.md },
  inWatchlistBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  inWatchlistText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  ratingSection: { marginTop: spacing.xl, backgroundColor: colors.surface, padding: spacing.lg, borderRadius: borderRadius.lg },
  ratingSliderContainer: { alignItems: 'center' },
  ratingValue: { fontSize: 48, fontWeight: 'bold', color: colors.primary },
  slider: { width: '100%', height: 40 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: spacing.sm },
  sliderLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  inputLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  reviewInput: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, fontSize: fontSize.md, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border, color: colors.text },
  // Watch section styles
  watchSection: { marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  watchHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  watchTitle: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  noProvidersText: { fontSize: fontSize.md, color: colors.textSecondary },
  watchDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  freeAltLabel: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.sm },
  freeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  freeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, gap: 6 },
  freeChipName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  freeChipTag: { fontSize: fontSize.sm, color: colors.textSecondary },
  freeDisclaimer: { fontSize: fontSize.xs, color: colors.primary, fontStyle: 'italic', marginTop: spacing.xs },
  providerSection: { marginBottom: spacing.md },
  providerList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  providerItem: { alignItems: 'center', width: 60 },
  providerLogo: { width: 50, height: 50, borderRadius: borderRadius.md, backgroundColor: colors.surface },
  providerName: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
  communityLinkItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  communityLinkContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  communityLinkLabel: { fontSize: fontSize.md, fontWeight: '500', color: colors.primary },
  communityLinkUser: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  watchLinkInput: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, fontSize: fontSize.md, borderWidth: 1, borderColor: colors.border, color: colors.text },
  watchLinkHint: { fontSize: fontSize.xs, color: colors.primary, fontStyle: 'italic', marginTop: spacing.xs },
  addLinkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingVertical: 12, borderRadius: borderRadius.lg, marginTop: spacing.md, gap: spacing.sm },
  addLinkButtonText: { color: colors.white, fontWeight: '600', fontSize: fontSize.md },
  castItem: { width: 80, marginRight: spacing.md, alignItems: 'center' },
  castImage: { width: 70, height: 70, borderRadius: 35 },
  noCastImage: { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  castName: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, marginTop: spacing.xs, textAlign: 'center' },
  castCharacter: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
});
