import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

// Using the exact FROGRAM logo image with rounded corners
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_mobile-frog-ram/artifacts/gwbmhxc7_IMG_5893.jpeg';

interface FrogLogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  variant?: 'default' | 'white';
}

export default function FrogLogo({ size = 'medium', showText = true, variant = 'default' }: FrogLogoProps) {
  // 100% bigger sizes (doubled)
  const sizes = {
    small: { width: 192, height: 67, borderRadius: 12 },
    medium: { width: 360, height: 130, borderRadius: 20 },
    large: { width: 520, height: 190, borderRadius: 28 },
  };

  const { width, height, borderRadius } = sizes[size];

  return (
    <View style={styles.container}>
      <Image 
        source={{ uri: LOGO_URL }} 
        style={{ width, height, borderRadius }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
