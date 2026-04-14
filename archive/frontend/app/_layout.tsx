import React, { useEffect, useState, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_400Regular_Italic,
} from '@expo-google-fonts/montserrat';
import {
  Oswald_400Regular,
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import { useAuthStore } from '../src/store/authStore';
import { useLanguageStore } from '../src/store/languageStore';
import { colors, spacing, fontSize } from '../src/utils/theme';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const loadUser = useAuthStore((state) => state.loadUser);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isGoogleAuthInProgress = useAuthStore((state) => state.isGoogleAuthInProgress);
  const initializeLanguage = useLanguageStore((state) => state.initialize);
  const router = useRouter();
  const segments = useSegments();
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    // Load fonts
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'Montserrat-Regular': Montserrat_400Regular,
          'Montserrat-Medium': Montserrat_500Medium,
          'Montserrat-SemiBold': Montserrat_600SemiBold,
          'Montserrat-Bold': Montserrat_700Bold,
          'Montserrat-ExtraBold': Montserrat_800ExtraBold,
          'Montserrat-Italic': Montserrat_400Regular_Italic,
          'Oswald-Regular': Oswald_400Regular,
          'Oswald-Medium': Oswald_500Medium,
          'Oswald-SemiBold': Oswald_600SemiBold,
          'Oswald-Bold': Oswald_700Bold,
        });
        await initializeLanguage();
        setFontsLoaded(true);
      } catch (e) {
        console.error('Error loading fonts:', e);
        setFontsLoaded(true); // Continue even if fonts fail
      }
    }
    loadFonts();
  }, []);

  useEffect(() => {
    // Check for OAuth session_id in URL hash on web
    const checkOAuthCallback = async () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash;
        const search = window.location.search;
        
        // Look for session_id in hash or query params
        let sessionId: string | null = null;
        
        if (hash && hash.includes('session_id=')) {
          const match = hash.match(/session_id=([^&]+)/);
          if (match) sessionId = match[1];
        }
        
        if (!sessionId && search && search.includes('session_id=')) {
          const params = new URLSearchParams(search);
          sessionId = params.get('session_id');
        }
        
        if (sessionId) {
          console.log('Found session_id, processing OAuth callback...');
          setIsProcessingAuth(true);
          try {
            await loginWithGoogle(sessionId);
            // Clear the hash/search from URL
            window.history.replaceState(null, '', window.location.pathname);
            console.log('OAuth login successful, redirecting to tabs...');
            router.replace('/(tabs)');
          } catch (error) {
            console.error('OAuth callback failed:', error);
            router.replace('/(auth)/login');
          } finally {
            setIsProcessingAuth(false);
          }
          return;
        }
      }
      
      // No OAuth callback, just load user normally
      await loadUser();
      setAuthChecked(true);
    };
    
    if (fontsLoaded) {
      checkOAuthCallback();
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  // Initial navigation after auth check
  useEffect(() => {
    if (!authChecked || isProcessingAuth) return;
    if (isAuthenticated) {
      router.replace('/(tabs)');
      // Reset google auth flag AFTER navigation with a delay
      // so the overlay stays visible until tabs are mounted
      if (isGoogleAuthInProgress) {
        setTimeout(() => {
          useAuthStore.getState().setGoogleAuthInProgress(false);
        }, 800);
      }
    }
  }, [authChecked, isAuthenticated]);

  // While fonts are loading, show full-screen loading (Stack can't render without fonts)
  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Determine if we need the overlay (Stack renders underneath for navigation to work)
  const showOverlay = isProcessingAuth || !authChecked || isGoogleAuthInProgress;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="movie/[id]" 
          options={{ 
            headerShown: true,
            headerTitle: '',
            headerTransparent: true,
            headerTintColor: colors.white,
          }} 
        />
        <Stack.Screen 
          name="series/[id]" 
          options={{ 
            headerShown: true,
            headerTitle: '',
            headerTransparent: true,
            headerTintColor: colors.white,
          }} 
        />
        <Stack.Screen 
          name="user/[id]" 
          options={{ 
            headerShown: true,
            headerTitle: 'Profile',
            headerTintColor: colors.primary,
          }} 
        />
        <Stack.Screen 
          name="chat/[id]" 
          options={{ 
            headerShown: true,
            headerTitle: 'Chat',
            headerTintColor: colors.primary,
          }} 
        />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="person/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="top100" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
      </Stack>
      {/* Full-screen overlay that covers the Stack during auth transitions */}
      {showOverlay && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {(isProcessingAuth || isGoogleAuthInProgress) ? 'Completing sign in...' : 'Loading...'}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    zIndex: 9999,
    elevation: 9999,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontFamily: 'Montserrat-Regular',
  },
});
