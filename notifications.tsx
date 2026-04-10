import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/utils/api';
import { useTranslation } from '../src/store/languageStore';
import { colors, spacing, fontSize, borderRadius } from '../src/utils/theme';
import FloatingTabBar from '../src/components/FloatingTabBar';

interface Notification {
  type: 'follow' | 'recommendation' | 'message';
  user_id?: string;
  user_name?: string;
  message: string;
  tmdb_id?: number;
  movie_title?: string;
  note?: string;
  unread_count?: number;
  created_at: string;
  read: boolean;
}

const getIcon = (type: string) => {
  switch (type) {
    case 'follow':
      return { name: 'person-add', color: '#4CAF50' };
    case 'recommendation':
      return { name: 'film', color: '#FF9800' };
    case 'message':
      return { name: 'chatbubble', color: '#2196F3' };
    default:
      return { name: 'notifications', color: colors.textSecondary };
  }
};

const getTimeAgo = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handlePress = (item: Notification) => {
    if (item.type === 'message' && item.user_id) {
      router.push(`/chat/${item.user_id}`);
    } else if (item.type === 'recommendation' && item.tmdb_id) {
      router.push(`/movie/${item.tmdb_id}`);
    } else if (item.type === 'follow' && item.user_id) {
      router.push(`/user/${item.user_id}`);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = getIcon(item.type);
    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.read && styles.unread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${icon.color}18` }]}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
        </View>
        <View style={styles.notifContent}>
          <Text style={styles.notifMessage} numberOfLines={2}>
            {item.message}
          </Text>
          {item.note && (
            <Text style={styles.notifNote} numberOfLines={1}>
              "{item.note}"
            </Text>
          )}
          <Text style={styles.notifTime}>{getTimeAgo(item.created_at)}</Text>
        </View>
        {item.type === 'message' && item.unread_count && item.unread_count > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{item.unread_count}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={56} color={colors.textLight} />
          <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
          <Text style={styles.emptySubtext}>
            {t('notifications.emptyDesc')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item, index) => `${item.type}-${item.user_id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
      <FloatingTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  list: {
    padding: spacing.md,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: {
    backgroundColor: '#F0FFF0',
    borderColor: '#C8E6C9',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  notifContent: {
    flex: 1,
  },
  notifMessage: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 20,
  },
  notifNote: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  notifTime: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 4,
  },
  countBadge: {
    backgroundColor: '#2196F3',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginRight: spacing.sm,
  },
  countText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
