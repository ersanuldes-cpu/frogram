import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_mobile-frog-ram/artifacts/gwbmhxc7_IMG_5893.jpeg';

interface ShareCardProps {
  title: string;
  posterUrl: string;
  imdbRating?: number | string;
  omdbRating?: number | string;
  frgmRating?: number | string;
}

export default function ShareCard({
  title,
  posterUrl,
  imdbRating,
  omdbRating,
  frgmRating,
}: ShareCardProps) {
  return (
    <View style={styles.card} collapsable={false}>
      {/* FROGRAM Logo */}
      <View style={styles.logoContainer}>
        <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
      </View>

      {/* Movie Poster */}
      <View style={styles.posterContainer}>
        <Image source={{ uri: posterUrl }} style={styles.poster} />
      </View>

      {/* Movie Title */}
      <Text style={styles.title} numberOfLines={2}>{title}</Text>

      {/* Three Star Ratings */}
      <View style={styles.ratingsRow}>
        {imdbRating ? (
          <View style={styles.ratingItem}>
            <Ionicons name="star" size={20} color="#F5A623" />
            <Text style={[styles.ratingValue, { color: '#F5A623' }]}>{imdbRating}</Text>
            <Text style={styles.ratingLabel}>IMDB</Text>
          </View>
        ) : null}
        {omdbRating ? (
          <View style={styles.ratingItem}>
            <Ionicons name="star" size={20} color="#E74C3C" />
            <Text style={[styles.ratingValue, { color: '#E74C3C' }]}>
              {typeof omdbRating === 'number' ? omdbRating.toFixed(1) : omdbRating}
            </Text>
            <Text style={styles.ratingLabel}>RT</Text>
          </View>
        ) : null}
        {frgmRating ? (
          <View style={styles.ratingItem}>
            <Ionicons name="star" size={20} color="#FFD700" />
            <Text style={[styles.ratingValue, { color: '#FFD700' }]}>{frgmRating}</Text>
            <Text style={styles.ratingLabel}>FRGM</Text>
          </View>
        ) : null}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>frogram.com</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 340,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 16,
  },
  logo: {
    width: 200,
    height: 70,
    borderRadius: 10,
  },
  posterContainer: {
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  poster: {
    width: 200,
    height: 300,
    borderRadius: 12,
    backgroundColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 14,
  },
  ratingsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    width: '100%',
  },
  ratingItem: {
    alignItems: 'center',
    gap: 2,
  },
  ratingValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  ratingLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 14,
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
});
