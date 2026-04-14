import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../store/languageStore';

const GREEN = '#1A6B33';
const GRAY = '#999';

export default function FloatingTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const TABS = [
    { route: '/(tabs)', label: t('tabs.home'), icon: 'home' as const, match: ['/', '/(tabs)'] },
    { route: '/(tabs)/search', label: t('tabs.search'), icon: 'search' as const, match: ['/search'] },
    { route: '/(tabs)/library', label: t('tabs.movies'), icon: 'film' as const, match: ['/library'] },
    { route: '/(tabs)/watchlist', label: t('tabs.watchlist'), icon: 'bookmark' as const, match: ['/watchlist'] },
    { route: '/(tabs)/social', label: t('tabs.social'), icon: 'people' as const, match: ['/social'] },
    { route: '/(tabs)/profile', label: t('tabs.profile'), icon: 'person' as const, match: ['/profile'] },
  ];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 4 }]}>
      {TABS.map((tab) => {
        const isActive = tab.match.some(m => pathname === m);
        return (
          <TouchableOpacity
            key={tab.route}
            style={styles.tab}
            onPress={() => router.push(tab.route as any)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon}
              size={22}
              color={isActive ? GREEN : GRAY}
            />
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: GRAY,
    marginTop: 2,
  },
  labelActive: {
    color: GREEN,
  },
});
