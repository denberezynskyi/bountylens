import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUser } from '../context/UserContext';

interface BottomNavProps {
  activeTab?: 'explore' | 'tasks' | 'feed' | 'radar' | 'you';
}

export function BottomNav({ activeTab }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useUser();

  const isCreator = role === 'creator';
  const activeColor = isCreator ? '#D97706' : '#006C49';

  const handleNavigate = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (pathname !== path) {
      router.replace(path as any);
    }
  };

  const isExplore = activeTab ? activeTab === 'explore' : pathname === '/' || pathname === '/index';
  const isTasks = activeTab ? activeTab === 'tasks' : pathname === '/tasks';
  const isFeed = activeTab ? activeTab === 'feed' : pathname === '/feed';
  const isRadar = activeTab
    ? activeTab === 'radar'
    : pathname === '/notifications' || pathname === '/radar';
  const isProfile = activeTab ? activeTab === 'you' : pathname === '/profile';

  return (
    <View style={styles.navContainer} pointerEvents="box-none">
      <View style={[styles.floatingTabBar, isCreator && styles.floatingTabBarCreator]}>
        {/* Explore */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleNavigate('/')}
          activeOpacity={0.75}
        >
          <Ionicons
            name={isExplore ? 'compass' : 'compass-outline'}
            size={22}
            color={isExplore ? activeColor : '#8A958F'}
          />
          <Text style={[styles.tabText, isExplore && { color: activeColor, fontWeight: '800' }]}>
            Explore
          </Text>
          {isExplore && <View style={[styles.activeDot, { backgroundColor: activeColor }]} />}
        </TouchableOpacity>

        {/* Tasks / Orders */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleNavigate('/tasks')}
          activeOpacity={0.75}
        >
          <Ionicons
            name={isTasks ? 'checkbox' : 'checkbox-outline'}
            size={22}
            color={isTasks ? activeColor : '#8A958F'}
          />
          <Text style={[styles.tabText, isTasks && { color: activeColor, fontWeight: '800' }]}>
            {isCreator ? 'Orders' : 'Tasks'}
          </Text>
          {isTasks && <View style={[styles.activeDot, { backgroundColor: activeColor }]} />}
        </TouchableOpacity>

        {/* Center Action */}
        {isCreator ? (
          <TouchableOpacity
            style={[styles.centerBtn, styles.centerBtnCreator]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/create-bounty');
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.centerBtnInner, { backgroundColor: '#D97706' }]}>
              <Ionicons name="add" size={26} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.centerBtn, styles.centerBtnScout, isFeed && styles.centerBtnScoutActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleNavigate('/feed');
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.centerBtnInner, { backgroundColor: '#006C49' }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        )}

        {/* Radar */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleNavigate('/notifications')}
          activeOpacity={0.75}
        >
          <Ionicons
            name={isRadar ? 'radio' : 'radio-outline'}
            size={22}
            color={isRadar ? activeColor : '#8A958F'}
          />
          <Text style={[styles.tabText, isRadar && { color: activeColor, fontWeight: '800' }]}>
            Radar
          </Text>
          {isRadar && <View style={[styles.activeDot, { backgroundColor: activeColor }]} />}
        </TouchableOpacity>

        {/* You / Host */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => handleNavigate('/profile')}
          activeOpacity={0.75}
        >
          <Ionicons
            name={isProfile ? 'person' : 'person-outline'}
            size={22}
            color={isProfile ? activeColor : '#8A958F'}
          />
          <Text style={[styles.tabText, isProfile && { color: activeColor, fontWeight: '800' }]}>
            {isCreator ? 'Host' : 'You'}
          </Text>
          {isProfile && <View style={[styles.activeDot, { backgroundColor: activeColor }]} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 90,
  },
  floatingTabBar: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#EFEBF8',
    shadowColor: '#1A1B22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 8,
  },
  floatingTabBarCreator: {
    borderColor: '#FEF3C7',
    shadowColor: '#D97706',
    shadowOpacity: 0.1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A958F',
    marginTop: 3,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  centerBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    elevation: 6,
    padding: 3,
  },
  centerBtnScout: {
    shadowColor: '#006C49',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  centerBtnScoutActive: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  centerBtnCreator: {
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  centerBtnInner: {
    width: '100%',
    height: '100%',
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});