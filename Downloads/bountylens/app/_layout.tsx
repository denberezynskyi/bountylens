import 'react-native-get-random-values';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;
import React from 'react';
import { Stack } from 'expo-router';
import { UserProvider } from '../context/UserContext';
import { BountiesProvider } from '../context/BountiesContext';

export default function RootLayout() {
  return (
    <UserProvider>
      <BountiesProvider>
        <Stack
          initialRouteName="onboarding"
          screenOptions={{
            headerShown: false,
            animation: 'none',
          }}
        >
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="index" />
          <Stack.Screen name="tasks" />
          <Stack.Screen name="feed" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="profile" />
          <Stack.Screen
            name="review/[id]"
            options={{
              animation: 'slide_from_bottom',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="create-bounty"
            options={{
              animation: 'slide_from_bottom',
              presentation: 'modal',
            }}
          />
        </Stack>
      </BountiesProvider>
    </UserProvider>
  );
}