import { Platform } from 'react-native';

export const colors = {
  // FROGRAM Brand Colors - matching www.frog-ram.com exactly
  primary: '#1A6B33',        // Main green
  primaryDark: '#147A2D',    // Darker green for hover
  primaryLight: '#6B8F7A',   // Light green-gray for secondary text
  secondary: '#E8F5E9',      // Very light green background
  accent: '#1A6B33',
  
  // Background colors
  background: '#FFFFFF',
  surface: '#F8F9FA',        // Light gray surface
  
  // Text colors
  text: '#4A4A4A',           // Main text (dark gray)
  textSecondary: '#6B8F7A',  // Secondary text (green-gray)
  textLight: '#999999',
  
  // Rating colors
  imdbOrange: '#F5A623',     // IMDB orange star
  omdbRed: '#E74C3C',        // OMDB/RT red star
  frgmGreen: '#4CAF50',      // FRGM green star (lighter green)
  
  // UI colors
  border: '#E5E7EB',
  error: '#D32F2F',
  success: '#1A6B33',
  warning: '#F5A623',
  
  // Neutrals
  white: '#FFFFFF',
  black: '#050505',
  overlay: 'rgba(0, 0, 0, 0.5)',
  cardShadow: 'rgba(0, 0, 0, 0.1)',
};

export const fonts = {
  // Body text - Montserrat
  regular: 'Montserrat-Regular',
  medium: 'Montserrat-Medium',
  semiBold: 'Montserrat-SemiBold',
  bold: 'Montserrat-Bold',
  extraBold: 'Montserrat-ExtraBold',
  italic: 'Montserrat-Italic',
  // Headings - Oswald (condensed, heavy)
  headingRegular: 'Oswald-Regular',
  headingMedium: 'Oswald-Medium',
  headingSemiBold: 'Oswald-SemiBold',
  headingBold: 'Oswald-Bold',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
  hero: 40,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};
