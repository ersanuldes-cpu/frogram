import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import UserCard from '../../src/components/UserCard';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';
import { useTranslation } from '../../src/store/languageStore';

type TabType = 'discover' | 'following' | 'followers' | 'recommendations';

export default function SocialScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!isAuthenticated) return;

    try {
      const [followingRes, followersRes, recsRes] = await Promise.all([
        api.get('/following'),
        api.get('/followers'),
        api.get('/recommendations'),
      ]);
      setFollowing(followingRes.data);
      setFollowers(followersRes.data);
      setRecommendations(recsRes.data);
      setFollowingIds(new Set(followingRes.data.map((u: any) => u.user_id)));
    } catch (error) {
      console.error('Error fetching social data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/users/search', { params: { query } });
      setUsers(response.data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (userId: string) => {
    try {
      if (followingIds.has(userId)) {
        await api.delete(`/users/${userId}/follow`);
        setFollowingIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        setFollowing((prev) => prev.filter((u) => u.user_id !== userId));
      } else {
        await api.post(`/users/${userId}/follow`);
        setFollowingIds((prev) => new Set(prev).add(userId));
        fetchData();
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Action failed');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const renderTabs = () => (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      style={styles.tabs}
      contentContainerStyle={styles.tabsContent}
    >
      {[
        { key: 'discover', label: t('social.discover') || 'Discover' },
        { key: 'following', label: t('social.following') || 'Following', count: following.length },
        { key: 'followers', label: t('social.followers') || 'Followers', count: followers.length },
        { key: 'recommendations', label: t('social.recs') || 'Recs', count: recommendations.filter((r) => !r.read).length },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.activeTab]}
          onPress={() => setActiveTab(tab.key as TabType)}
        >
          <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
            {tab.label}
          </Text>
          {tab.count !== undefined && tab.count > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{tab.count}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderDiscoverTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor={colors.textLight}
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            searchUsers(text);
          }}
        />
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : users.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={50} color={colors.border} />
          <Text style={styles.emptyText}>Search for users to connect with</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onPress={() => router.push(`/user/${item.user_id}`)}
              showFollowButton
              isFollowing={followingIds.has(item.user_id)}
              onFollowPress={() => handleFollow(item.user_id)}
            />
          )}
        />
      )}
    </View>
  );

  const renderUsersTab = (data: any[], emptyMessage: string) => (
    <View style={styles.tabContent}>
      {data.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={50} color={colors.border} />
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onPress={() => router.push(`/user/${item.user_id}`)}
              showFollowButton={activeTab === 'followers'}
              isFollowing={followingIds.has(item.user_id)}
              onFollowPress={() => handleFollow(item.user_id)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );

  const renderRecommendationsTab = () => (
    <View style={styles.tabContent}>
      {recommendations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="gift-outline" size={50} color={colors.border} />
          <Text style={styles.emptyText}>No recommendations yet</Text>
        </View>
      ) : (
        <FlatList
          data={recommendations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.recCard, !item.read && styles.unreadRecCard]}
              onPress={async () => {
                if (!item.read) {
                  await api.put(`/recommendations/${item.id}/read`);
                  setRecommendations((prev) =>
                    prev.map((r) => (r.id === item.id ? { ...r, read: true } : r))
                  );
                }
                router.push(`/movie/${item.tmdb_id}`);
              }}
            >
              <View style={styles.recHeader}>
                {item.from_user_picture ? (
                  <Image source={{ uri: item.from_user_picture }} style={styles.recAvatar} />
                ) : (
                  <View style={styles.recAvatarPlaceholder}>
                    <Ionicons name="person" size={16} color={colors.primary} />
                  </View>
                )}
                <View style={styles.recUserInfo}>
                  <Text style={styles.recUserName}>{item.from_user_name}</Text>
                  <Text style={styles.recAction}>recommended a movie</Text>
                </View>
              </View>
              <View style={styles.recContent}>
                <Image
                  source={{ uri: `https://image.tmdb.org/t/p/w185${item.poster_path}` }}
                  style={styles.recPoster}
                />
                <View style={styles.recMovieInfo}>
                  <Text style={styles.recMovieTitle}>{item.title}</Text>
                  {item.message && <Text style={styles.recMessage}>"{item.message}"</Text>}
                </View>
              </View>
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="people" size={60} color={colors.border} />
        <Text style={styles.emptyTitle}>Sign In Required</Text>
        <Text style={styles.emptyText}>Please sign in to connect with friends</Text>
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderTabs()}
      {activeTab === 'discover' && renderDiscoverTab()}
      {activeTab === 'following' && renderUsersTab(following, 'Not following anyone yet')}
      {activeTab === 'followers' && renderUsersTab(followers, 'No followers yet')}
      {activeTab === 'recommendations' && renderRecommendationsTab()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  signInButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  signInButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  tabs: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
    maxHeight: 48,
  },
  tabsContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    gap: 4,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  activeTabText: {
    color: colors.primary,
  },
  tabBadge: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
    padding: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  recCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadRecCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  recAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  recAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recUserInfo: {
    marginLeft: spacing.sm,
  },
  recUserName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  recAction: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  recContent: {
    flexDirection: 'row',
  },
  recPoster: {
    width: 60,
    height: 90,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  recMovieInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  recMovieTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  recMessage: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
});
