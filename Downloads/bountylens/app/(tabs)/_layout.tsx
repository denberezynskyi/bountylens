import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkInitialScreen = async () => {
      try {
        const hasCompletedOnboarding = await AsyncStorage.getItem('@has_seen_onboarding');

        if (!hasCompletedOnboarding) {
          // Если зашли впервые — гарантированно открываем онбординг
          router.replace('/onboarding' as any);
        } else {
          // Если уже проходили — сразу на карту
          router.replace('/');
        }
      } catch (err) {
        console.warn('Onboarding check error:', err);
      } finally {
        setIsReady(true);
      }
    };

    // Небольшой таймаут, чтобы навигационный стек Expo успел инициализироваться
    const timer = setTimeout(() => {
      checkInitialScreen();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Пока идет проверка статуса
  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FBF8FF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color="#006C49" />
      </View>
    );
  }

  const isOnboarding = pathname === '/onboarding';

  return (
    <Tabs
      initialRouteName="onboarding"
      screenOptions={{
        headerShown: false,
      }}
      tabBar={() => {
        if (isOnboarding) return null;

        return (
          <View style={styles.floatingTabBar}>
            <TouchableOpacity
              style={[styles.tabItem, pathname === '/' && styles.tabItemActive]}
              onPress={() => router.push('/onboarding')}
            >
              <Ionicons
                name="compass"
                size={20}
                color={pathname === '/' ? '#006C49' : '#6C7A71'}
              />
              <Text style={[styles.tabText, pathname === '/' && { color: '#006C49' }]}>
                Explore
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, pathname === '/tasks' && styles.tabItemActive]}
              onPress={() => router.push('/tasks')}
            >
              <Ionicons
                name="checkmark-done"
                size={20}
                color={pathname === '/tasks' ? '#006C49' : '#6C7A71'}
              />
              <Text style={[styles.tabText, pathname === '/tasks' && { color: '#006C49' }]}>
                Tasks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.lensFab}
              onPress={() => router.push('/review/1')}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={24} color="#FFFFFF" />
              <Text style={styles.lensFabText}>Lens</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, pathname === '/notifications' && styles.tabItemActive]}
              onPress={() => router.push('/notifications')}
            >
              <Ionicons
                name="radio-outline"
                size={20}
                color={pathname === '/notifications' ? '#006C49' : '#6C7A71'}
              />
              <Text style={[styles.tabText, pathname === '/notifications' && { color: '#006C49' }]}>
                Radar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, pathname === '/profile' && styles.tabItemActive]}
              onPress={() => router.push('/profile')}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={pathname === '/profile' ? '#006C49' : '#6C7A71'}
              />
              <Text style={[styles.tabText, pathname === '/profile' && { color: '#006C49' }]}>
                You
              </Text>
            </TouchableOpacity>
          </View>
        );
      }}
    >
      <Tabs.Screen 
        name="onboarding" 
        options={{ 
          tabBarStyle: { display: 'none' } 
        }} 
      />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen
        name="review/[id]"
        options={{
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingTabBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E6FBF2',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  tabItemActive: {
    backgroundColor: '#6FFBBE',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6C7A71',
    marginTop: 2,
  },
  lensFab: {
    backgroundColor: '#10B981',
    borderRadius: 22,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -10 }],
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  lensFabText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 1,
  },
});