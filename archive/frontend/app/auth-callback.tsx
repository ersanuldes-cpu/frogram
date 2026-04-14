import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useRootNavigationState, useLocalSearchParams } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { useAuthStore } from '../src/store/authStore';
import { colors, fontSize, spacing } from '../src/utils/theme';

// This screen handles the OAuth callback for both web and native
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { loginWithGoogle } = useAuthStore();
  const rootNavigationState = useRootNavigationState();
  const hasProcessed = useRef(false);
  const [status, setStatus] = useState('Completing sign in...');

  useEffect(() => {
    // Wait for navigation to be ready before processing
    if (!rootNavigationState?.key) return;
    
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    
    handleCallback();
  }, [rootNavigationState?.key]);

  const handleCallback = async () => {
    try {
      let sessionId: string | null = null;
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Web: get session_id from URL hash or query params
        const hash = window.location.hash;
        if (hash) {
          const hashParams = new URLSearchParams(hash.replace(/^#\/?/, '').replace('auth-callback?', ''));
          sessionId = hashParams.get('session_id');
          if (!sessionId) {
            const match = hash.match(/session_id=([^&]+)/);
            if (match) sessionId = match[1];
          }
        }
        if (!sessionId) {
          const urlParams = new URLSearchParams(window.location.search);
          sessionId = urlParams.get('session_id');
        }
      } else {
        // Native: get session_id from deep link URL
        const url = await ExpoLinking.getInitialURL();
        if (url) {
          // Try hash fragment
          const hashIndex = url.indexOf('#');
          if (hashIndex !== -1) {
            const hash = url.substring(hashIndex + 1);
            const match = hash.match(/session_id=([^&]+)/);
            if (match) sessionId = match[1];
          }
          // Try query params
          if (!sessionId) {
            const parsed = ExpoLinking.parse(url);
            sessionId = parsed.queryParams?.session_id as string || null;
          }
        }
      }
      
      console.log('Session ID found:', sessionId);
      
      if (sessionId) {
        setStatus('Authenticating...');
        await loginWithGoogle(sessionId);
        setStatus('Success! Redirecting...');
        
        // Clear the hash from URL
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname);
        }
        
        // Small delay to ensure state is updated
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 200);
      } else {
        console.log('No session ID found in URL');
        setStatus('No session found, redirecting...');
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 200);
      }
    } catch (error) {
      console.error('Auth callback error:', error);
      setStatus('Authentication failed, redirecting...');
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 500);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  text: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
});
