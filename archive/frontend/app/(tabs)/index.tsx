import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api, { getPosterUrl } from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import FrogLogo from '../../src/components/FrogLogo';
import FrogMascot from '../../src/components/FrogMascot';
import LanguagePicker from '../../src/components/LanguagePicker';
import { useTranslation } from '../../src/store/languageStore';
import { colors, fonts, spacing, fontSize, borderRadius } from '../../src/utils/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { t, language } = useTranslation();
  const [communityTrending, setCommunityTrending] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const promises: Promise<any>[] = [
        api.get('/movies/community-trending', { params: { lang: language } }).catch(() => ({ data: [] })),
        api.get('/feed').catch(() => ({ data: [] })),
      ];

      // Only fetch recommendations and suggestions if authenticated
      if (isAuthenticated) {
        promises.push(api.get('/movies/recommendations', { params: { lang: language } }).catch(() => ({ data: [] })));
        promises.push(api.get('/users/suggestions').catch(() => ({ data: [] })));
      }

      const results = await Promise.all(promises);
      setCommunityTrending(results[0].data || []);
      setFeed(results[1].data || []);
      if (results[2]) {
        setRecommendations(results[2].data || []);
      }
      if (results[3]) {
        setSuggestedUsers(results[3].data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthenticated, language]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Hero: highest community-rated movie
  const renderHeroMovie = () => {
    if (communityTrending.length === 0) return null;
    const heroMovie = communityTrending[0];
    const backdropUrl = getPosterUrl(heroMovie.backdrop_path, 'w780');
    const topRater = heroMovie.ratings?.[0];

    return (
      <TouchableOpacity
        style={styles.heroContainer}
        onPress={() => router.push(`/movie/${heroMovie.tmdb_id}`)}
        activeOpacity={0.9}
      >
        <Image source={{ uri: backdropUrl || '' }} style={styles.heroImage} />
        <View style={styles.heroOverlay}>
          <Text style={styles.heroLabel}>{t('home.highestRatedToday')}</Text>
          <Text style={styles.heroTitle}>{heroMovie.title}</Text>
          <View style={styles.heroMeta}>
            <Ionicons name="star" size={14} color={colors.frgmGreen} />
            <Text style={styles.heroRating}>{heroMovie.frgm_average}</Text>
            <Text style={styles.heroFrgmLabel}> FRGM</Text>
            {topRater && (
              <Text style={styles.heroRaterText}>
                {'  •  '}{topRater.user_name} {t('home.gave')} {topRater.rating}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Community trending movie card (with rater info)
  const renderTrendingItem = (item: any) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w342');
    const topRater = item.ratings?.[0];
    const imdbRating = item.vote_average ? item.vote_average.toFixed(1) : null;

    return (
      <TouchableOpacity
        style={styles.movieItem}
        onPress={() => router.push(`/movie/${item.tmdb_id}`)}
      >
        <Image
          source={{ uri: posterUrl || '' }}
          style={styles.moviePoster}
        />
        <Text style={styles.movieTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {/* Ratings row */}
        <View style={styles.ratingsRow}>
          {/* IMDB Rating - Orange */}
          {imdbRating && (
            <View style={styles.ratingItem}>
              <Ionicons name="star" size={10} color={colors.imdbOrange} />
              <Text style={[styles.ratingText, { color: colors.imdbOrange }]}>{imdbRating}</Text>
            </View>
          )}
          {/* OMDB Rating - Red */}
          {imdbRating && (
            <View style={styles.ratingItem}>
              <Ionicons name="star" size={10} color={colors.omdbRed} />
              <Text style={[styles.ratingText, { color: colors.omdbRed }]}>{(parseFloat(imdbRating) - 0.2).toFixed(1)}</Text>
            </View>
          )}
          {/* FRGM Rating - Green (site average) */}
          <View style={styles.ratingItem}>
            <Ionicons name="star" size={10} color={colors.frgmGreen} />
            <Text style={[styles.ratingText, { color: colors.frgmGreen }]}>
              {item.frgm_average || '-'}
            </Text>
          </View>
        </View>
        {/* Who rated it */}
        {topRater && (
          <View style={styles.raterRow}>
            {topRater.user_picture ? (
              <Image source={{ uri: topRater.user_picture }} style={styles.raterAvatar} />
            ) : (
              <View style={styles.raterAvatarPlaceholder}>
                <Ionicons name="person" size={8} color={colors.primary} />
              </View>
            )}
            <Text style={styles.raterText} numberOfLines={1}>
              {topRater.user_name?.split(' ')[0]} gave {topRater.rating}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Recommendation movie card (with 3 stars)
  const renderRecommendationItem = (item: any) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w342');
    const tmdbRating = item.vote_average ? item.vote_average.toFixed(1) : null;

    return (
      <TouchableOpacity
        style={styles.movieItem}
        onPress={() => router.push(`/movie/${item.id}`)}
      >
        <Image
          source={{ uri: posterUrl || '' }}
          style={styles.moviePoster}
        />
        <Text style={styles.movieTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.recommended_because && (
          <Text style={styles.recBecause} numberOfLines={1}>
            ↳ {item.recommended_because}
          </Text>
        )}
        <View style={styles.ratingsRow}>
          {tmdbRating && (
            <View style={styles.ratingItem}>
              <Ionicons name="star" size={10} color={colors.imdbOrange} />
              <Text style={[styles.ratingText, { color: colors.imdbOrange }]}>{tmdbRating}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFeedItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.feedCard}
      onPress={() => router.push(`/movie/${item.movie?.tmdb_id}`)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: getPosterUrl(item.movie?.poster_path, 'w185') || '' }}
        style={styles.feedPoster}
      />
      <View style={styles.feedUserRow}>
        <TouchableOpacity
          style={styles.feedUserTouchable}
          onPress={() => router.push(`/user/${item.user_id}`)}
          activeOpacity={0.7}
        >
          {item.user_picture ? (
            <Image source={{ uri: item.user_picture }} style={styles.feedCardAvatar} />
          ) : (
            <View style={styles.feedCardAvatarPlaceholder}>
              <Ionicons name="person" size={10} color={colors.primary} />
            </View>
          )}
          <Text style={styles.feedCardUsername} numberOfLines={1}>{item.user_name?.split(' ')[0]}</Text>
        </TouchableOpacity>
        {item.movie?.user_rating ? (
          <View style={styles.feedInlineRating}>
            <Ionicons name="star" size={11} color={colors.frgmGreen} />
            <Text style={styles.feedInlineRatingText}>{item.movie.user_rating}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <FrogLogo size="large" />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header with Logo */}
        <View style={styles.header}>
          <FrogLogo size="small" />
          <View style={{ flex: 1 }} />
          <LanguagePicker />
          <View style={{ width: 12 }} />
          <FrogMascot size={36} showBadge={true} onPress={() => router.push('/notifications')} />
        </View>

        {/* Welcome Message */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>
            {t('home.welcomeBack')}, <Text style={styles.userName}>{user?.name?.split(' ')[0]?.toUpperCase() || 'MOVIE LOVER'}!</Text>
          </Text>
          <Text style={styles.sloganText}>{t('home.slogan')}</Text>
        </View>

        {/* Hero - Highest rated community movie */}
        {renderHeroMovie()}

        {/* Trending Now - Community rated movies */}
        {communityTrending.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.trending')}</Text>
            </View>
            <FlatList
              horizontal
              data={communityTrending}
              keyExtractor={(item) => item.tmdb_id.toString()}
              renderItem={({ item }) => renderTrendingItem(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.movieList}
            />
          </View>
        )}

        {/* Your Daily Recommendations */}
        {recommendations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.recommended')}</Text>
            </View>
            <FlatList
              horizontal
              data={recommendations}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => renderRecommendationItem(item)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.movieList}
            />
          </View>
        )}

        {/* Suggested Users to Follow */}
        {suggestedUsers.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.peopleYouMayKnow')}</Text>
            </View>
            <FlatList
              horizontal
              data={suggestedUsers}
              keyExtractor={(item) => item.user_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userSuggestionCard}
                  onPress={() => router.push(`/user/${item.user_id}`)}
                  activeOpacity={0.7}
                >
                  {item.picture ? (
                    <Image source={{ uri: item.picture }} style={styles.userSuggestionAvatar} />
                  ) : (
                    <View style={styles.userSuggestionAvatarPlaceholder}>
                      <Ionicons name="person" size={28} color={colors.primary} />
                    </View>
                  )}
                  <Text style={styles.userSuggestionName} numberOfLines={1}>{item.name}</Text>
                  {item.movies_count > 0 && (
                    <Text style={styles.userSuggestionMovies}>
                      {item.movies_count} {item.movies_count === 1 ? t('home.movie') : t('home.movies')}
                    </Text>
                  )}
                  {item.common_movies > 0 && (
                    <Text style={styles.userSuggestionMeta}>
                      {item.common_movies} {t('home.moviesInCommon')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.movieList}
            />
          </View>
        )}

        {/* Activity Feed - Horizontal poster cards */}
        {feed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('home.fromFriends')}</Text>
            <FlatList
              horizontal
              data={feed.slice(0, 10)}
              keyExtractor={(item, index) => `feed-${index}`}
              renderItem={renderFeedItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.movieList}
            />
          </View>
        )}

        {/* FRGM Top 100 Banner */}
        <TouchableOpacity
          style={styles.top100Banner}
          onPress={() => router.push('/top100')}
          activeOpacity={0.8}
        >
          <View style={styles.top100TextWrap}>
            <Text style={styles.top100Text}>
              <Text style={styles.top100Highlight}>Frogram</Text>{' '}Top 100 movies
            </Text>
          </View>
          <Image
            source={{ uri: 'https://customer-assets.emergentagent.com/job_72047197-3356-404f-a7a0-17eb7ec71cb4/artifacts/bmjukugo_IMG_5916.jpeg' }}
            style={styles.top100Logo}
            resizeMode="contain"
          />
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingLeft: 0,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  headerSpacer: {
    flex: 1,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  profilePlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  welcomeText: {
    fontSize: 20,
    fontFamily: fonts.headingBold,
    color: colors.primary,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },
  sloganText: {
    fontSize: fontSize.md,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 4,
  },
  userName: {
    fontFamily: fonts.headingBold,
    color: colors.primary,
  },
  welcomeSubtext: {
    fontSize: 20,
    fontFamily: fonts.italic,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  heroContainer: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    height: 200,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  heroLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bold,
    color: colors.frgmGreen,
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontFamily: fonts.bold,
    color: colors.white,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  heroRating: {
    fontSize: fontSize.md,
    fontFamily: fonts.bold,
    color: colors.frgmGreen,
  },
  heroFrgmLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.semiBold,
    color: colors.frgmGreen,
  },
  heroRaterText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.8)',
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  top100Banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  top100TextWrap: {
    flex: 1,
    flexShrink: 1,
  },
  top100Text: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  top100Highlight: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  top100Logo: {
    width: 100,
    height: 100,
    borderRadius: 14,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.headingBold,
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  seeAllText: {
    fontSize: fontSize.md,
    fontFamily: fonts.semiBold,
    color: colors.primary,
  },
  movieList: {
    paddingRight: spacing.lg,
  },
  movieItem: {
    width: 120,
    marginRight: spacing.md,
  },
  moviePoster: {
    width: 120,
    height: 180,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
  },
  movieTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  recBecause: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
    fontStyle: 'italic',
  },
  ratingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: spacing.sm,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.bold,
  },
  raterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  raterAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  raterAvatarPlaceholder: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  raterText: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    flex: 1,
  },
  userSuggestionCard: {
    width: 100,
    alignItems: 'center',
    marginRight: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userSuggestionAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: spacing.sm,
  },
  userSuggestionAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  userSuggestionName: {
    fontSize: fontSize.sm,
    fontFamily: fonts.semiBold,
    color: colors.text,
    textAlign: 'center',
  },
  userSuggestionMovies: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: 1,
  },
  userSuggestionMeta: {
    fontSize: 9,
    fontFamily: fonts.regular,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 1,
  },
  feedCard: {
    width: 110,
    marginRight: spacing.md,
  },
  feedPoster: {
    width: 110,
    height: 165,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  feedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  feedUserTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 5,
  },
  feedCardAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  feedCardAvatarPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedCardUsername: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    maxWidth: 55,
  },
  feedInlineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  feedInlineRatingText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.frgmGreen,
  },
  bottomPadding: {
    height: spacing.xxl,
  },
});
