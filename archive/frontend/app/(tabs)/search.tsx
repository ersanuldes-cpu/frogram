import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Keyboard,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getPosterUrl } from '../../src/utils/api';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { useTranslation } from '../../src/store/languageStore';

type MediaType = 'movies' | 'series';
type SearchBy = 'title' | 'actor' | 'director';

export default function SearchScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('movies');
  const [searchBy, setSearchBy] = useState<SearchBy>('title');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Title search results
  const [titleResults, setTitleResults] = useState<any[]>([]);
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [titleSearched, setTitleSearched] = useState(false);

  // Person suggestions (autocomplete dropdown)
  const [personSuggestions, setPersonSuggestions] = useState<any[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);

  // Selected person + their filmography
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [personResults, setPersonResults] = useState<any[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Dynamic poster sizing for 3-column grid
  const { width: screenWidth } = useWindowDimensions();
  const numCols = screenWidth >= 768 ? 6 : 3;
  const posterW = Math.floor((screenWidth - spacing.md * 2 - spacing.sm * (numCols - 1)) / numCols);
  const posterH = Math.floor(posterW * 1.5);

  // Auto-search effect
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setTitleResults([]);
      setTitleSearched(false);
      setPersonSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (searchBy === 'title') {
        searchByTitle(query.trim());
      } else {
        // For actor/director: show person suggestions as autocomplete
        fetchPersonSuggestions(query.trim());
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mediaType, searchBy]);

  // Reset when switching search mode
  useEffect(() => {
    setQuery('');
    setTitleResults([]);
    setTitleSearched(false);
    setPersonSuggestions([]);
    setSelectedPerson(null);
    setPersonResults([]);
  }, [searchBy, mediaType]);

  const searchByTitle = async (searchQuery: string) => {
    setLoadingTitle(true);
    setTitleSearched(true);
    try {
      const endpoint = mediaType === 'movies' ? '/movies/search' : '/series/search';
      const response = await api.get(endpoint, { params: { query: searchQuery, lang: language } });
      setTitleResults(response.data.results || []);
    } catch (error) {
      console.error('Title search error:', error);
      setTitleResults([]);
    } finally {
      setLoadingTitle(false);
    }
  };

  const fetchPersonSuggestions = async (searchQuery: string) => {
    setLoadingPersons(true);
    try {
      const response = await api.get('/search/person', { params: { query: searchQuery } });
      const people = response.data.results || [];

      // If searching by director, prioritize directing department
      let filtered = people;
      if (searchBy === 'director') {
        const directors = people.filter((p: any) => p.known_for_department === 'Directing');
        filtered = directors.length > 0 ? directors : people;
      }

      setPersonSuggestions(filtered.slice(0, 5));
    } catch (error) {
      console.error('Person search error:', error);
      setPersonSuggestions([]);
    } finally {
      setLoadingPersons(false);
    }
  };

  const handleSelectPerson = async (person: any) => {
    setSelectedPerson(person);
    setPersonSuggestions([]);
    setQuery(person.name);
    Keyboard.dismiss();
    setLoadingCredits(true);

    try {
      const endpoint = mediaType === 'movies'
        ? `/person/${person.id}/movies`
        : `/person/${person.id}/series`;
      const response = await api.get(endpoint, { params: { lang: language } });
      setPersonResults(response.data.results || []);
    } catch (error) {
      console.error('Credits fetch error:', error);
      setPersonResults([]);
    } finally {
      setLoadingCredits(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setTitleResults([]);
    setTitleSearched(false);
    setPersonSuggestions([]);
    setSelectedPerson(null);
    setPersonResults([]);
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    if (searchBy === 'title') {
      searchByTitle(query.trim());
    } else {
      fetchPersonSuggestions(query.trim());
    }
  };

  const getPlaceholder = () => {
    switch (searchBy) {
      case 'title': return t('search.placeholderTitle');
      case 'actor': return t('search.placeholderActor');
      case 'director': return t('search.placeholderDirector');
    }
  };

  // Render person suggestion card (autocomplete dropdown item)
  const renderPersonSuggestion = (person: any) => {
    const profileUrl = person.profile_path
      ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
      : null;
    const dept = person.known_for_department || 'Actor';

    return (
      <TouchableOpacity
        key={person.id}
        style={styles.personSuggestion}
        onPress={() => handleSelectPerson(person)}
        activeOpacity={0.7}
      >
        {profileUrl ? (
          <Image source={{ uri: profileUrl }} style={styles.personAvatar} />
        ) : (
          <View style={[styles.personAvatar, styles.noAvatar]}>
            <Ionicons name="person" size={22} color={colors.textLight} />
          </View>
        )}
        <View style={styles.personInfo}>
          <Text style={styles.personName}>{person.name.toUpperCase()}</Text>
          <Text style={styles.personDept}>{dept}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
      </TouchableOpacity>
    );
  };

  // Render selected person header card
  const renderSelectedPersonHeader = () => {
    if (!selectedPerson) return null;
    const profileUrl = selectedPerson.profile_path
      ? `https://image.tmdb.org/t/p/w185${selectedPerson.profile_path}`
      : null;
    const dept = selectedPerson.known_for_department || 'Actor';
    const count = personResults.length;

    return (
      <View style={styles.selectedPersonCard}>
        {profileUrl ? (
          <Image source={{ uri: profileUrl }} style={styles.selectedPersonAvatar} />
        ) : (
          <View style={[styles.selectedPersonAvatar, styles.noAvatar]}>
            <Ionicons name="person" size={28} color={colors.textLight} />
          </View>
        )}
        <View style={styles.selectedPersonInfo}>
          <Text style={styles.selectedPersonName}>{selectedPerson.name.toUpperCase()}</Text>
          <Text style={styles.selectedPersonDept}>
            {dept} · {count} {mediaType === 'movies' ? t('search.movies').toLowerCase() : t('search.series').toLowerCase()}
          </Text>
        </View>
      </View>
    );
  };

  // Render title search result (list item)
  const renderTitleItem = ({ item }: { item: any }) => {
    const posterUrl = getPosterUrl(item.poster_path, 'w185');
    const title = mediaType === 'movies' ? item.title : item.name;
    const dateField = mediaType === 'movies' ? item.release_date : item.first_air_date;
    const year = dateField ? new Date(dateField).getFullYear() : null;
    const route = mediaType === 'movies' ? `/movie/${item.id}` : `/series/${item.id}`;

    return (
      <TouchableOpacity
        style={styles.resultItem}
        onPress={() => {
          Keyboard.dismiss();
          router.push(route as any);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.posterContainer}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.resultPoster} resizeMode="cover" />
          ) : (
            <View style={styles.noResultPoster}>
              <Ionicons name={mediaType === 'movies' ? 'film-outline' : 'tv-outline'} size={30} color={colors.textLight} />
            </View>
          )}
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.resultMeta}>
            {year && <Text style={styles.resultYear}>{year}</Text>}
            {item.vote_average > 0 && (
              <View style={styles.resultRating}>
                <Ionicons name="star" size={12} color={colors.warning} />
                <Text style={styles.resultRatingText}>{item.vote_average.toFixed(1)}</Text>
              </View>
            )}
          </View>
          {item.overview && (
            <Text style={styles.resultOverview} numberOfLines={2}>{item.overview}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
      </TouchableOpacity>
    );
  };

  // Determine what content to show
  const isPersonSearch = searchBy === 'actor' || searchBy === 'director';
  const showPersonSuggestions = isPersonSearch && personSuggestions.length > 0 && !selectedPerson;
  const showPersonResults = isPersonSearch && selectedPerson && personResults.length > 0;
  const showTitleResults = searchBy === 'title' && titleSearched;

  return (
    <View style={styles.container}>
      {/* Compact Controls Area */}
      <View style={styles.controlsArea}>
        {/* Row 1: Media Type */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleChip, mediaType === 'movies' && styles.toggleChipActive]}
            onPress={() => setMediaType('movies')}
            activeOpacity={0.7}
          >
            <Ionicons name="film-outline" size={14} color={mediaType === 'movies' ? colors.white : colors.text} />
            <Text style={[styles.toggleText, mediaType === 'movies' && styles.toggleTextActive]}>{t('search.movies')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleChip, mediaType === 'series' && styles.toggleChipActive]}
            onPress={() => setMediaType('series')}
            activeOpacity={0.7}
          >
            <Ionicons name="tv-outline" size={14} color={mediaType === 'series' ? colors.white : colors.text} />
            <Text style={[styles.toggleText, mediaType === 'series' && styles.toggleTextActive]}>{t('search.series')}</Text>
          </TouchableOpacity>
        </View>

        {/* Row 2: Search By */}
        <View style={styles.filterRow}>
          {(['title', 'actor', 'director'] as SearchBy[]).map((type) => {
            const labelMap: Record<SearchBy, string> = {
              title: t('search.byTitle'),
              actor: t('search.byActor'),
              director: t('search.byDirector'),
            };
            return (
            <TouchableOpacity
              key={type}
              style={[styles.filterChip, searchBy === type && styles.filterChipActive]}
              onPress={() => setSearchBy(type)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, searchBy === type && styles.filterTextActive]}>
                {labelMap[type]}
              </Text>
            </TouchableOpacity>
            );
          })}
        </View>

        {/* Search Input Row */}
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={getPlaceholder()}
              placeholderTextColor={colors.textLight}
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (isPersonSearch && selectedPerson) {
                  setSelectedPerson(null);
                  setPersonResults([]);
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={clearSearch}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch} activeOpacity={0.7}>
            <Ionicons name="search" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <View style={styles.contentArea}>
        {/* Person autocomplete suggestions */}
        {showPersonSuggestions && (
          <View style={styles.suggestionsContainer}>
            {loadingPersons && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            {personSuggestions.map(renderPersonSuggestion)}
          </View>
        )}

        {/* Loading states */}
        {(loadingTitle || loadingCredits) && !showPersonSuggestions && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {/* Person selected: show person card + poster grid */}
        {showPersonResults && !loadingCredits && (
          <ScrollView
            contentContainerStyle={styles.posterScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderSelectedPersonHeader()}
            <View style={styles.posterGrid}>
              {personResults.map((item, idx) => {
                const posterUrl = getPosterUrl(item.poster_path, 'w342');
                const title = mediaType === 'movies' ? item.title : item.name;
                const route = mediaType === 'movies' ? `/movie/${item.id}` : `/series/${item.id}`;
                const year = (mediaType === 'movies' ? item.release_date : item.first_air_date);
                const yearStr = year ? new Date(year).getFullYear() : '';
                return (
                  <TouchableOpacity
                    key={`${item.id}_${idx}`}
                    style={[styles.posterCard, { width: posterW }]}
                    onPress={() => { Keyboard.dismiss(); router.push(route as any); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.posterImageWrap, { width: posterW, height: posterH }]}>
                      {posterUrl ? (
                        <Image source={{ uri: posterUrl }} style={[styles.posterImage, { width: posterW, height: posterH }]} resizeMode="cover" />
                      ) : (
                        <View style={[styles.posterImage, styles.noPosterImg, { width: posterW, height: posterH }]}>
                          <Ionicons name={mediaType === 'movies' ? 'film-outline' : 'tv-outline'} size={24} color={colors.textLight} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.posterTitle} numberOfLines={2}>{title}</Text>
                    {yearStr ? <Text style={styles.posterYear}>{yearStr}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Title search results - poster grid */}
        {showTitleResults && !loadingTitle && (
          titleResults.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.posterScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.posterGrid}>
                {titleResults.map((item, idx) => {
                  const posterUrl = getPosterUrl(item.poster_path, 'w342');
                  const title = mediaType === 'movies' ? item.title : item.name;
                  const route = mediaType === 'movies' ? `/movie/${item.id}` : `/series/${item.id}`;
                  const year = (mediaType === 'movies' ? item.release_date : item.first_air_date);
                  const yearStr = year ? new Date(year).getFullYear() : '';
                  return (
                    <TouchableOpacity
                      key={`${item.id}_${idx}`}
                      style={[styles.posterCard, { width: posterW }]}
                      onPress={() => { Keyboard.dismiss(); router.push(route as any); }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.posterImageWrap, { width: posterW, height: posterH }]}>
                        {posterUrl ? (
                          <Image source={{ uri: posterUrl }} style={[styles.posterImage, { width: posterW, height: posterH }]} resizeMode="cover" />
                        ) : (
                          <View style={[styles.posterImage, styles.noPosterImg, { width: posterW, height: posterH }]}>
                            <Ionicons name={mediaType === 'movies' ? 'film-outline' : 'tv-outline'} size={24} color={colors.textLight} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.posterTitle} numberOfLines={2}>{title}</Text>
                      {yearStr ? <Text style={styles.posterYear}>{yearStr}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.centerContainer}>
              <Ionicons name={mediaType === 'movies' ? 'film-outline' : 'tv-outline'} size={60} color={colors.border} />
              <Text style={styles.emptyTitle}>No Results</Text>
              <Text style={styles.emptyText}>Try searching with different keywords</Text>
            </View>
          )
        )}

        {/* Empty state when no search has been performed */}
        {!showPersonSuggestions && !showPersonResults && !showTitleResults && !loadingTitle && !loadingCredits && (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name={mediaType === 'movies' ? 'film-outline' : 'tv-outline'} size={40} color={colors.primaryLight} />
            </View>
            <Text style={styles.emptyTitle}>
              {mediaType === 'movies' ? t('search.emptyMovies') : t('search.emptySeries')}
            </Text>
            <Text style={styles.emptyText}>
              {t('search.emptyHint')}
            </Text>
          </View>
        )}

        {/* Person search but no results */}
        {isPersonSearch && selectedPerson && personResults.length === 0 && !loadingCredits && (
          <View style={styles.centerContainer}>
            {renderSelectedPersonHeader()}
            <Text style={styles.emptyText}>{t('search.noResultsFor')}</Text>
          </View>
        )}

        {/* Person suggestions empty (searched but found nothing) */}
        {isPersonSearch && !selectedPerson && query.length > 1 && personSuggestions.length === 0 && !loadingPersons && (
          <View style={styles.centerContainer}>
            <Ionicons name="person-outline" size={60} color={colors.border} />
            <Text style={styles.emptyTitle}>{t('search.noPersonFound')}</Text>
            <Text style={styles.emptyText}>{t('search.tryDifferent')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  controlsArea: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    marginTop: 6,
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: 4,
  },
  toggleChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  toggleTextActive: {
    color: colors.white,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  filterTextActive: {
    color: colors.white,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  searchButton: {
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: borderRadius.lg,
  },
  contentArea: {
    flex: 1,
    marginTop: spacing.xs,
  },
  // Person suggestions (autocomplete dropdown)
  suggestionsContainer: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  loadingRow: {
    padding: spacing.md,
    alignItems: 'center',
  },
  personSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  noAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.border,
  },
  personInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  personName: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  personDept: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Selected person header
  selectedPersonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedPersonAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
  selectedPersonInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  selectedPersonName: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  selectedPersonDept: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Poster grid for person filmography
  posterScrollContent: {
    paddingBottom: spacing.xl,
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  posterCard: {
    marginBottom: spacing.sm,
  },
  posterImageWrap: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  posterImage: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  noPosterImg: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterTitle: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.text,
    marginTop: 4,
  },
  posterYear: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  // Title search results
  list: {
    padding: spacing.md,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  posterContainer: {
    width: 70,
    height: 105,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  resultPoster: {
    width: 70,
    height: 105,
  },
  noResultPoster: {
    width: 70,
    height: 105,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  resultTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.md,
  },
  resultYear: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  resultRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  resultRatingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  resultOverview: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  // Empty states
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
