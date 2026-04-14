import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/utils/theme';
import { useLanguageStore, useTranslation } from '../../src/store/languageStore';

export default function TabsLayout() {
  const { t, language } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          flex: 1,
        },
        headerStyle: {
          backgroundColor: colors.white,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
          headerTitle: t('search.title'),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.movies'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="film" size={size} color={color} />
          ),
          headerTitle: t('library.title'),
        }}
      />
      <Tabs.Screen
        name="series-library"
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none', width: 0, height: 0 },
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: t('tabs.watchlist'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark" size={size} color={color} />
          ),
          headerTitle: t('tabs.watchlist'),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: t('tabs.social'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
          headerTitle: t('social.title'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          headerTitle: t('profile.title'),
        }}
      />
    </Tabs>
  );
}
