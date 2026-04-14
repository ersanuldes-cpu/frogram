import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getPosterUrl } from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import Button from '../../src/components/Button';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isAuthenticated, user: currentUser } = useAuthStore();
  const [user, setUser] = useState<any>(null);
  const [movies, setMovies] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, [id]);

  const fetchUserData = async () => {
    try {
      const [userRes, moviesRes] = await Promise.all([
        api.get(`/users/${id}`),
        api.get(`/library/user/${id}`),
      ]);
      setUser(userRes.data);
      setMovies(moviesRes.data);

      if (isAuthenticated) {
        const followRes = await api.get(`/users/${id}/follow-status`);
        setIsFollowing(followRes.data.is_following);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      Alert.alert('Error', 'Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to follow users', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        await api.delete(`/users/${id}/follow`);
        setIsFollowing(false);
        setUser((prev: any) => ({
          ...prev,
          followers_count: prev.followers_count - 1,
        }));
      } else {
        await api.post(`/users/${id}/follow`);
        setIsFollowing(true);
        setUser((prev: any) => ({
          ...prev,
          followers_count: prev.followers_count + 1,
        }));
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Action failed');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleChat = () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to send messages', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }
    router.push(`/chat/${id}`);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text>User not found</Text>
      </View>
    );
  }

  const isOwnProfile = currentUser?.user_id === user.user_id;

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: user.name,
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {user.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.name}>{user.name}</Text>
          {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          {!isOwnProfile && (
            <View style={styles.actions}>
              <Button
                title={isFollowing ? 'Following' : 'Follow'}
                variant={isFollowing ? 'outline' : 'primary'}
                onPress={handleFollow}
                loading={followLoading}
                icon={
                  isFollowing ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : (
                    <Ionicons name="person-add" size={18} color={colors.white} />
                  )
                }
              />
              <Button
                title="Message"
                variant="outline"
                onPress={handleChat}
                icon={<Ionicons name="chatbubble-outline" size={18} color={colors.primary} />}
              />
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.movies_count || 0}</Text>
            <Text style={styles.statLabel}>Movies</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.followers_count || 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.following_count || 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>

        {/* Movies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{user.name}'s Movies</Text>
          {movies.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>No movies yet</Text>
            </View>
          ) : (
            <View style={styles.moviesGrid}>
              {movies.map((movie) => (
                <TouchableOpacity
                  key={movie.id}
                  style={styles.movieItem}
                  onPress={() => router.push(`/movie/${movie.tmdb_id}`)}
                >
                  {movie.poster_path ? (
                    <Image
                      source={{ uri: getPosterUrl(movie.poster_path, 'w185') || '' }}
                      style={styles.moviePoster}
                    />
                  ) : (
                    <View style={[styles.moviePoster, styles.noPoster]}>
                      <Ionicons name="film-outline" size={24} color={colors.textLight} />
                    </View>
                  )}
                  {movie.user_rating && (
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={10} color={colors.primary} />
                      <Text style={styles.ratingText}>{movie.user_rating}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  header: {
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.text,
  },
  bio: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  section: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  moviesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  movieItem: {
    width: '33.33%',
    padding: spacing.xs,
  },
  moviePoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  noPoster: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 2,
  },
  ratingText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.primary,
  },
  bottomPadding: {
    height: spacing.xxl,
  },
});
