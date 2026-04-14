import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { colors } from '../../src/utils/theme';
import { useAuthStore } from '../../src/store/authStore';

export default function AuthLayout() {
  const { isAuthenticated } = useAuthStore();

  // If already authenticated, redirect away from auth screens immediately
  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
