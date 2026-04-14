import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

interface UserCardProps {
  user: {
    user_id: string;
    name: string;
    email?: string;
    picture?: string;
    movies_count?: number;
    followers_count?: number;
  };
  onPress: () => void;
  showFollowButton?: boolean;
  isFollowing?: boolean;
  onFollowPress?: () => void;
}

export default function UserCard({
  user,
  onPress,
  showFollowButton = false,
  isFollowing = false,
  onFollowPress,
}: UserCardProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.avatar}>
        {user.picture ? (
          <Image source={{ uri: user.picture }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={24} color={colors.primary} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{user.name}</Text>
        {user.email && <Text style={styles.email}>{user.email}</Text>}
        {user.movies_count !== undefined && (
          <Text style={styles.stats}>{user.movies_count} movies</Text>
        )}
      </View>
      {showFollowButton && onFollowPress && (
        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followingButton]}
          onPress={onFollowPress}
        >
          <Text style={[styles.followText, isFollowing && styles.followingText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stats: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: 2,
  },
  followButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  followingButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  followingText: {
    color: colors.primary,
  },
});
