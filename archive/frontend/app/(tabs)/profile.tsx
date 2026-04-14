import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api, { getPosterUrl } from '../../src/utils/api';
import { useAuthStore } from '../../src/store/authStore';
import Button from '../../src/components/Button';
import { colors, spacing, fontSize, borderRadius, fonts } from '../../src/utils/theme';
import { useTranslation } from '../../src/store/languageStore';

export default function ProfileScreen() {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { user, isAuthenticated, logout, updateUser } = useAuthStore();
  const [movies, setMovies] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditBio(user.bio || '');
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [moviesRes, chatsRes] = await Promise.all([
        api.get('/library'),
        api.get('/chats'),
      ]);
      setMovies(moviesRes.data.slice(0, 6));
      setChats(chatsRes.data);
    } catch (error) {
      console.error('Error fetching profile data:', error);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await api.put('/profile', {
        name: editName,
        bio: editBio,
      });
      updateUser(response.data);
      setEditMode(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to set a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setUploadingPicture(true);

        // Determine mime type
        const uri = asset.uri;
        const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        const base64Data = `data:${mimeType};base64,${asset.base64}`;

        const response = await api.put('/profile', {
          picture: base64Data,
        });
        updateUser(response.data);
        Alert.alert('Success', 'Profile picture updated!');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to update profile picture');
    } finally {
      setUploadingPicture(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="person" size={60} color={colors.border} />
        <Text style={styles.emptyTitle}>Sign In Required</Text>
        <Text style={styles.emptyText}>Please sign in to view your profile</Text>
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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickImage} activeOpacity={0.7}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color={colors.primary} />
            </View>
          )}
          {/* Camera overlay */}
          <View style={styles.cameraOverlay}>
            {uploadingPicture ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={16} color="#fff" />
            )}
          </View>
        </TouchableOpacity>

        {editMode ? (
          <View style={styles.editForm}>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
            />
            <TextInput
              style={[styles.editInput, styles.bioInput]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Add a bio..."
              multiline
            />
            <View style={styles.editButtons}>
              <Button
                title="Cancel"
                variant="outline"
                size="small"
                onPress={() => setEditMode(false)}
              />
              <Button
                title="Save"
                size="small"
                loading={saving}
                onPress={handleSaveProfile}
              />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            {user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditMode(true)}
            >
              <Ionicons name="pencil" size={14} color={colors.primary} />
              <Text style={styles.editButtonText}>{t('profile.editProfile')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <TouchableOpacity style={styles.stat} onPress={() => router.push('/(tabs)/library')} activeOpacity={0.6}>
          <Text style={styles.statValue}>{user?.movies_count || 0}</Text>
          <Text style={styles.statLabel}>Movies</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.stat} onPress={() => router.push('/user/followers')} activeOpacity={0.6}>
          <Text style={styles.statValue}>{user?.followers_count || 0}</Text>
          <Text style={styles.statLabel}>{t('profile.followers')}</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.stat} onPress={() => router.push('/user/following')} activeOpacity={0.6}>
          <Text style={styles.statValue}>{user?.following_count || 0}</Text>
          <Text style={styles.statLabel}>{t('profile.following')}</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Movies */}
      {movies.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Movies</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/library')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            data={movies}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.movieItem}
                onPress={() => router.push(`/movie/${item.tmdb_id}`)}
              >
                <Image
                  source={{ uri: getPosterUrl(item.poster_path, 'w185') || '' }}
                  style={styles.moviePoster}
                />
              </TouchableOpacity>
            )}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}

      {/* Chats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Messages</Text>
        {chats.length === 0 ? (
          <View style={styles.emptySectionContainer}>
            <Text style={styles.emptySectionText}>No messages yet</Text>
          </View>
        ) : (
          chats.slice(0, 3).map((chat) => (
            <TouchableOpacity
              key={chat.user_id}
              style={styles.chatItem}
              onPress={() => router.push(`/chat/${chat.user_id}`)}
            >
              {chat.user_picture ? (
                <Image source={{ uri: chat.user_picture }} style={styles.chatAvatar} />
              ) : (
                <View style={styles.chatAvatarPlaceholder}>
                  <Ionicons name="person" size={20} color={colors.primary} />
                </View>
              )}
              <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{chat.user_name}</Text>
                <Text style={styles.chatLastMessage} numberOfLines={1}>
                  {chat.last_message}
                </Text>
              </View>
              {chat.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{chat.unread_count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
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
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
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
  header: {
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    marginBottom: spacing.md,
    position: 'relative',
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
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.text,
  },
  email: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  bio: {
    fontSize: fontSize.md,
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  editButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  editForm: {
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  editInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bioInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  seeAll: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '500',
  },
  movieItem: {
    marginRight: spacing.sm,
  },
  moviePoster: {
    width: 80,
    height: 120,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  emptySectionContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptySectionText: {
    color: colors.textSecondary,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  chatAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  chatLastMessage: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    gap: spacing.sm,
  },
  logoutText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  bottomPadding: {
    height: spacing.xxl,
  },
});
