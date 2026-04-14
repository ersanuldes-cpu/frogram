import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Linking,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { useAuthStore } from '../../src/store/authStore';
import Button from '../../src/components/Button';
import Input from '../../src/components/Input';
import FrogLogo from '../../src/components/FrogLogo';
import LanguagePicker from '../../src/components/LanguagePicker';
import { useTranslation } from '../../src/store/languageStore';
import { colors, spacing, fontSize, borderRadius } from '../../src/utils/theme';

// Cinema background image
const CINEMA_BG = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&h=1200&fit=crop';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuthStore();
  const { t, language } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Invalid email';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await login(email, password);
      // Root layout auth guard handles navigation to /(tabs)
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    // Set global flag BEFORE opening browser — root layout shows loading screen
    useAuthStore.getState().setGoogleAuthInProgress(true);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const redirectUrl = `${window.location.origin}/api/auth-callback`;
        const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
        await Linking.openURL(authUrl);
      } else {
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const nativeReturnUrl = ExpoLinking.createURL('auth-callback');
        const backendCallback = `${backendUrl}/api/auth-callback?app_redirect=${encodeURIComponent(nativeReturnUrl)}`;
        const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(backendCallback)}`;
        const result = await WebBrowser.openAuthSessionAsync(authUrl, nativeReturnUrl);
        
        if (result.type === 'success' && result.url) {
          const url = result.url;
          let sessionId: string | null = null;
          
          const qIndex = url.indexOf('?');
          if (qIndex !== -1) {
            const search = url.substring(qIndex);
            const match = search.match(/session_id=([^&#]+)/);
            if (match) sessionId = match[1];
          }
          
          if (!sessionId) {
            const hashIndex = url.indexOf('#');
            if (hashIndex !== -1) {
              const hash = url.substring(hashIndex + 1);
              const match = hash.match(/session_id=([^&]+)/);
              if (match) sessionId = match[1];
            }
          }
          
          if (sessionId) {
            const { loginWithGoogle } = useAuthStore.getState();
            await loginWithGoogle(sessionId);
            // isGoogleAuthInProgress will be reset when root layout navigates to tabs
            return;
          } else {
            useAuthStore.getState().setGoogleAuthInProgress(false);
            Alert.alert('Error', 'Authentication failed - no session found');
            return;
          }
        }
        // User cancelled
        useAuthStore.getState().setGoogleAuthInProgress(false);
      }
    } catch (error: any) {
      console.error('Google login error:', error);
      useAuthStore.getState().setGoogleAuthInProgress(false);
      Alert.alert('Error', 'Could not complete Google login');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <LanguagePicker />
          </View>

          <View style={styles.header}>
            <FrogLogo size="large" />
            <Text style={styles.title}>{t('auth.signIn')}</Text>
            <Text style={styles.subtitle}>{t('auth.enterCredentials')}</Text>
          </View>

          {/* Google Login */}
          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin}>
            <Ionicons name="logo-google" size={20} color={colors.primary} />
            <Text style={styles.googleButtonText}>{t('auth.signInGoogle')}</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label={t('auth.email')}
              placeholder="name@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              icon="mail-outline"
              error={errors.email}
            />

            <Input
              label={t('auth.password')}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon="lock-closed-outline"
              error={errors.password}
            />

            <Button
              title={t('auth.login')}
              onPress={handleLogin}
              loading={loading}
              size="large"
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.noAccount')}</Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/register')}>
              <Text style={styles.footerLink}>{t('auth.register')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: spacing.lg,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  googleButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  form: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  footerLink: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
