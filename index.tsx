import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Dimensions, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../src/store/authStore';
import { useTranslation } from '../src/store/languageStore';
import Button from '../src/components/Button';
import FrogLogo from '../src/components/FrogLogo';
import FrogMascot from '../src/components/FrogMascot';
import LanguagePicker from '../src/components/LanguagePicker';
import { colors, spacing, fontSize, borderRadius, fonts } from '../src/utils/theme';

const { width, height } = Dimensions.get('window');

// Movie poster images from Unsplash (same as web)
const POSTER_IMAGES = [
  'https://images.unsplash.com/photo-1572700432881-42c60fe8c869?w=300&h=450&fit=crop',
  'https://images.unsplash.com/photo-1543390322-dac90ee96ec7?w=300&h=450&fit=crop',
  'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&h=450&fit=crop',
];

const FEATURES = [
  {
    icon: 'film-outline',
    title: 'Build Your Library',
    description: 'Save every movie you watch. Search any film worldwide and add it to your personal collection.',
  },
  {
    icon: 'star-outline',
    title: 'Rate & Review',
    description: 'Rate movies out of 10, compare with IMDB ratings, and write your personal reviews.',
  },
  {
    icon: 'people-outline',
    title: 'Connect & Share',
    description: 'Follow friends, explore their libraries, and discover new films through recommendations.',
  },
  {
    icon: 'chatbubble-outline',
    title: 'Recommend & Chat',
    description: 'Send movie recommendations to friends and chat about your favorite films.',
  },
];

export default function LandingScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { t, language } = useTranslation();

  // Auth redirect is handled by root _layout.tsx — no need here
  if (isLoading || isAuthenticated) {
    return (
      <View style={styles.loadingContainer}>
        <FrogLogo size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <FrogLogo size="small" />
          <View style={styles.headerSpacer} />
          <LanguagePicker />
          <View style={{ width: 12 }} />
          <TouchableOpacity style={styles.signInArea} onPress={() => router.push('/(auth)/login')}>
            <FrogMascot size={32} />
            <Text style={styles.signInLink}>{t('landing.signIn')}</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>{t('landing.tagline')}</Text>
          <Text style={styles.heroDescription}>
            {t('landing.features.rateDesc')}
          </Text>

          <View style={styles.heroButtons}>
            <Button
              title={t('landing.startCollection')}
              onPress={() => router.push('/(auth)/register')}
              size="large"
              icon={<Ionicons name="chevron-forward" size={18} color={colors.white} />}
            />
            <Button
              title={t('landing.signIn')}
              variant="outline"
              onPress={() => router.push('/(auth)/login')}
              size="large"
            />
          </View>
        </View>

        {/* Poster Images */}
        <View style={styles.posterSection}>
          {POSTER_IMAGES.map((uri, index) => (
            <View
              key={index}
              style={[
                styles.posterContainer,
                { transform: [{ rotate: `${(index - 1) * 5}deg` }] },
              ]}
            >
              <Image source={{ uri }} style={styles.poster} />
            </View>
          ))}
        </View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>EVERYTHING YOU NEED</Text>
          <Text style={styles.sectionSubtitle}>
            A complete movie tracking experience designed for true cinema lovers
          </Text>

          <View style={styles.featuresGrid}>
            {FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name={feature.icon as any} size={28} color={colors.primary} />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Search Section */}
        <View style={styles.searchSection}>
          <Text style={styles.sectionTitle}>SEARCH ANY MOVIE</Text>
          <Text style={styles.sectionSubtitle}>
            Find any movie from around the world. Select from official posters and add to your vault.
          </Text>
          <View style={styles.searchPreview}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <Text style={styles.searchPreviewText}>Search for any movie...</Text>
          </View>
        </View>

        {/* CTA Section */}
        <LinearGradient
          colors={['#0A0A0A', '#050505']}
          style={styles.ctaSection}
        >
          <Text style={styles.ctaTitle}>START YOUR</Text>
          <Text style={styles.ctaTitleAccent}>COLLECTION TODAY</Text>
          <Text style={styles.ctaSubtitle}>
            Join film enthusiasts who track, rate, and share their movie journey.
          </Text>
          <Button
            title="Create Free Account"
            onPress={() => router.push('/(auth)/register')}
            size="large"
          />
        </LinearGradient>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Made with Emergent</Text>
        </View>
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
    paddingHorizontal: 0,
    paddingLeft: 0,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerSpacer: {
    flex: 1,
  },
  signInLink: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  signInArea: {
    alignItems: 'center',
    gap: 4,
  },
  heroSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heroTitle: {
    fontSize: 36,
    fontFamily: fonts.headingBold,
    color: colors.text,
    lineHeight: 42,
    textTransform: 'uppercase',
  },
  heroTitleAccent: {
    fontSize: 36,
    fontFamily: fonts.headingBold,
    color: colors.primary,
    lineHeight: 42,
  },
  heroDescription: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    lineHeight: 26,
  },
  heroButtons: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  posterSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 220,
    marginVertical: spacing.xl,
  },
  posterContainer: {
    width: 120,
    height: 180,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginHorizontal: -20,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  featuresSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    fontSize: fontSize.xxl,
    fontFamily: fonts.headingBold,
    color: colors.primary,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  featuresGrid: {
    gap: spacing.md,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  featureTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  featureDescription: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  searchPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    marginTop: spacing.md,
  },
  searchPreviewText: {
    marginLeft: spacing.md,
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  ctaSection: {
    margin: spacing.lg,
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
  },
  ctaTitleAccent: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
  },
  ctaSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
});
