import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNav } from '../components/BottomNav';
import { useBounties, BountyItem } from '../context/BountiesContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  { id: 'hot', label: 'Hot Drops', icon: 'fire' },
  { id: 'coffee', label: 'Cafe & Line', icon: 'coffee' },
  { id: 'parking', label: 'Parking / EV', icon: 'car-electric' },
  { id: 'landmark', label: 'Landmarks', icon: 'castle' },
] as const;

export default function ExploreScreen() {
  const router = useRouter();
  const { hasCompletedOnboarding, isLoadingUser, role, balance, refreshUserData } = useUser();
  const { bounties, fetchBounties } = useBounties() as any;

  const isCreator = role === 'creator';
  const primaryThemeColor = isCreator ? '#D97706' : '#006C49';

  useEffect(() => {
    if (!isLoadingUser && !hasCompletedOnboarding) {
      router.replace('/onboarding');
    }
  }, [hasCompletedOnboarding, isLoadingUser]);

  const mapRef = useRef<MapView>(null);
  const handledTargetRef = useRef<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserHandle, setCurrentUserHandle] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBounty, setSelectedBounty] = useState<BountyItem | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [mySubmittedBountyIds, setMySubmittedBountyIds] = useState<string[]>([]);

  const { focusId, targetLat, targetLng, submittedId } = useLocalSearchParams<{
    focusId?: string;
    targetLat?: string;
    targetLng?: string;
    submittedId?: string;
  }>();

  // Завантажуємо реальну сесію користувача
  const loadIdentity = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (uid) {
        setCurrentUserId(uid);
        const savedHandle = await AsyncStorage.getItem(`@profile_username_${uid}`);
        if (savedHandle) setCurrentUserHandle(savedHandle);
        if (session.user.email) {
          setCurrentUserHandle((prev) => prev || `@${session.user.email!.split('@')[0]}`);
        }
      }
    } catch (e) {
      console.warn('Identity load error:', e);
    }
  };

  useEffect(() => {
    loadIdentity();
  }, []);

  useEffect(() => {
    if (submittedId) {
      setMySubmittedBountyIds((prev) => Array.from(new Set([...prev, String(submittedId)])));
    }
  }, [submittedId]);

  // Перевірка авторства виключно за сесійним ID
  const checkIsMine = useCallback(
    (bounty: any) => {
      if (!bounty) return false;
      if (bounty.creator === '@you') return true;
      if (currentUserId && bounty.creator_id && String(bounty.creator_id) === String(currentUserId)) {
        return true;
      }
      return false;
    },
    [currentUserId]
  );

  // Для Scout приховуємо власні завдання
  const visibleBounties = (bounties || []).filter((bounty: any) => {
    const isMine = checkIsMine(bounty);
    if (!isCreator && isMine) {
      return false;
    }
    return true;
  });

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const refreshData = async () => {
        try {
          const localSent = await AsyncStorage.getItem('bountylens_sent_submissions');
          const localList: string[] = localSent ? JSON.parse(localSent) : [];

          const { data: { session } } = await supabase.auth.getSession();
          const uid = session?.user?.id;
          if (uid && isMounted) {
            setCurrentUserId(uid);
          }

          if (uid) {
            // Тягнемо лише власні сабміти скаута
            const { data: mySubmissions } = await supabase
              .from('submissions')
              .select('bounty_id')
              .eq('scout_id', uid);

            if (isMounted && mySubmissions) {
              const dbSentList = mySubmissions.map((s: any) => String(s.bounty_id));
              setMySubmittedBountyIds(Array.from(new Set([...localList, ...dbSentList])));
            }

            // Для кріейтора підраховуємо вхідні pending
            const { data: pendingForMe } = await supabase
              .from('submissions')
              .select('bounty_id')
              .eq('status', 'pending');

            if (isMounted && pendingForMe) {
              const counts: Record<string, number> = {};
              pendingForMe.forEach((row: any) => {
                if (row.bounty_id) {
                  const bId = String(row.bounty_id);
                  counts[bId] = (counts[bId] || 0) + 1;
                }
              });
              setPendingCounts(counts);
            }
          }
        } catch (err) {
          console.warn('Map sync error:', err);
        }
      };

      refreshData();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  useEffect(() => {
    if (targetLat && targetLng) {
      const targetKey = `${targetLat}_${targetLng}_${focusId || ''}`;
      if (handledTargetRef.current === targetKey) return;
      handledTargetRef.current = targetKey;

      const lat = parseFloat(targetLat);
      const lng = parseFloat(targetLng);

      if (!isNaN(lat) && !isNaN(lng)) {
        setTimeout(() => {
          mapRef.current?.animateToRegion(
            {
              latitude: lat - 0.002,
              longitude: lng,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            },
            700
          );

          if (focusId) {
            const target = visibleBounties.find((b: any) => String(b.id) === String(focusId));
            if (target) setSelectedBounty(target);
          }

          router.setParams({ targetLat: '', targetLng: '', focusId: '' });
        }, 150);
      }
    }
  }, [focusId, targetLat, targetLng, visibleBounties]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserCoords({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch (e) {
        console.warn('Location fetch error:', e);
      }
    })();
  }, []);

  const focusOnCoordinates = (lat: number, lng: number) => {
    mapRef.current?.animateToRegion(
      {
        latitude: lat - 0.003,
        longitude: lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      450
    );
  };

  const handleRecenter = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userCoords) {
      mapRef.current?.animateToRegion(
        {
          latitude: userCoords.latitude,
          longitude: userCoords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        450
      );
    }
  };

  const handleCategoryPress = (catId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedCategory === catId) {
      setSelectedCategory(null);
      setSelectedBounty(null);
      return;
    }
    setSelectedCategory(catId);

    const matchedBounty =
      catId === 'hot'
        ? visibleBounties.reduce((max: any, b: any) => (b.reward > max.reward ? b : max), visibleBounties[0])
        : visibleBounties.find((b: any) => b.category === catId);

    if (matchedBounty) {
      setSelectedBounty(matchedBounty);
      focusOnCoordinates(matchedBounty.latitude, matchedBounty.longitude);
    }
  };

  const handleMarkerPress = (bounty: BountyItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBounty(bounty);
    setSelectedCategory(bounty.category);
    focusOnCoordinates(bounty.latitude, bounty.longitude);
  };

  const handleDismissCard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBounty(null);
  };

  // АТОМАРНЕ СКАСУВАННЯ БАУНТІ ЧЕРЕЗ СЕРВЕРНИЙ RPC
  const handleCancelMyBounty = (bountyId: string) => {
    Alert.alert(
      'Cancel Bounty?',
      'Are you sure you want to take down this bounty? Reserved escrow funds will be unlocked.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            try {
              const { error } = await supabase.rpc('cancel_bounty_secure', {
                p_bounty_id: bountyId,
              });

              if (error) {
                Alert.alert('Cancellation Error', error.message || 'Could not cancel bounty.');
                return;
              }

              Alert.alert('Cancelled', 'Bounty cancelled and escrow refunded to your budget.');
              setSelectedBounty(null);

              if (typeof fetchBounties === 'function') {
                await fetchBounties();
              }
              if (typeof refreshUserData === 'function') {
                await refreshUserData();
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel bounty.');
            }
          },
        },
      ]
    );
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getPinIcon = (cat: BountyItem['category']) => {
    switch (cat) {
      case 'coffee':
        return 'coffee';
      case 'parking':
        return 'car-electric';
      case 'landmark':
        return 'castle';
      case 'store':
        return 'storefront-outline';
      default:
        return 'fire';
    }
  };

  const activeCard = selectedBounty;
  const isCardMine = activeCard ? checkIsMine(activeCard) : false;
  const activePendingCount = activeCard ? pendingCounts[String(activeCard.id)] || 0 : 0;
  const isAlreadySubmitted =
    activeCard && !isCardMine ? mySubmittedBountyIds.includes(String(activeCard.id)) : false;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={[styles.balancePill, isCreator && styles.balancePillCreator]}>
          <Text style={[styles.balanceLabel, isCreator && { color: '#B45309' }]}>
            {isCreator ? 'ESCROW BUDGET' : 'WALLET'}
          </Text>
          <Text style={[styles.balanceValue, { color: primaryThemeColor }]}>
            ${balance.toFixed(2)}
          </Text>
        </View>

        <View style={styles.topRightActions}>
          <TouchableOpacity
            style={[styles.iconBtn, isCreator && styles.iconBtnCreator]}
            activeOpacity={0.85}
            onPress={handleRecenter}
          >
            <Ionicons name="locate" size={20} color={primaryThemeColor} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Bar */}
      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.catChip,
                  isCreator && styles.catChipCreator,
                  isActive && (isCreator ? styles.catChipActiveCreator : styles.catChipActiveScout),
                ]}
                onPress={() => handleCategoryPress(cat.id)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={cat.icon as any}
                  size={16}
                  color={isActive ? '#FFFFFF' : primaryThemeColor}
                />
                <Text style={[styles.catText, isActive && styles.catTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Map View */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={styles.map}
          showsUserLocation={true}
          showsMyLocationButton={false}
          initialRegion={{
            latitude: userCoords?.latitude || 50.7472,
            longitude: userCoords?.longitude || 25.3254,
            latitudeDelta: 0.035,
            longitudeDelta: 0.035,
          }}
          onPress={() => {
            if (selectedBounty) setSelectedBounty(null);
          }}
        >
          {visibleBounties.map((bounty: any) => {
            const isSelected = selectedBounty?.id === bounty.id;
            const isMine = checkIsMine(bounty);
            const pendingNum = pendingCounts[String(bounty.id)] || 0;
            const hasSent = !isMine && mySubmittedBountyIds.includes(String(bounty.id));

            return (
              <Marker
                key={`bounty_pin_${bounty.id}_${isMine ? 'MINE' : hasSent ? 'SENT' : 'ACTIVE'}_${isSelected ? 'SEL' : 'NO'}`}
                coordinate={{
                  latitude: bounty.latitude,
                  longitude: bounty.longitude,
                }}
                tracksViewChanges={false}
                onPress={() => handleMarkerPress(bounty)}
              >
                <View style={[styles.markerContainer, isSelected && styles.markerContainerActive]}>
                  {pendingNum > 0 && isMine && (
                    <View style={styles.markerBadgeCounter}>
                      <Text style={styles.markerBadgeCounterText}>{pendingNum}</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.markerIconWrap,
                      hasSent
                        ? styles.markerIconSent
                        : isMine
                        ? styles.markerIconCreator
                        : styles.markerIconScout,
                      isSelected &&
                        (hasSent
                          ? styles.markerIconSentActive
                          : isMine
                          ? styles.markerIconCreatorActive
                          : styles.markerIconScoutActive),
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={hasSent ? 'clock-check-outline' : (getPinIcon(bounty.category) as any)}
                      size={16}
                      color={hasSent || isSelected ? '#FFFFFF' : isMine ? '#D97706' : primaryThemeColor}
                    />
                  </View>

                  <View
                    style={[
                      styles.markerPriceBadge,
                      hasSent
                        ? styles.markerPriceSent
                        : isMine
                        ? styles.markerPriceCreator
                        : styles.markerPriceScout,
                      isSelected &&
                        (hasSent
                          ? styles.markerPriceSentActive
                          : isMine
                          ? styles.markerPriceCreatorActive
                          : styles.markerPriceScoutActive),
                    ]}
                  >
                    <Text style={styles.markerPriceText}>
                      {hasSent ? 'SENT' : isMine ? 'YOU' : `$${Number(bounty.reward).toFixed(0)}`}
                    </Text>
                  </View>
                </View>
              </Marker>
            );
          })}
        </MapView>
      </View>

      {/* Selected Card */}
      {activeCard && (
        <View style={styles.bountyCardOverlay} pointerEvents="box-none">
          <View style={[styles.bountyCard, isCardMine && styles.bountyCardCreator]}>
            <View style={styles.cardHeader}>
              <View style={styles.badgeRow}>
                {isCardMine ? (
                  <View style={styles.myBadge}>
                    <Text style={styles.myBadgeText}>YOUR HOST DROP</Text>
                  </View>
                ) : isAlreadySubmitted ? (
                  <View style={styles.submittedBadge}>
                    <Text style={styles.submittedBadgeText}>REVIEW SUBMITTED</Text>
                  </View>
                ) : (
                  <View style={[styles.catBadge, isCreator && styles.catBadgeCreator]}>
                    <Text style={[styles.catBadgeText, isCreator && { color: '#B45309' }]}>
                      {activeCard.category.toUpperCase()}
                    </Text>
                  </View>
                )}

                {activePendingCount > 0 && isCardMine && (
                  <View style={styles.cardPendingBadge}>
                    <Text style={styles.cardPendingBadgeText}>
                      NEW SUBMISSIONS: {activePendingCount}
                    </Text>
                  </View>
                )}

                <View style={styles.timerBadge}>
                  <Ionicons name="time-outline" size={13} color="#DC2626" />
                  <Text style={styles.timerText}>
                    {formatTimer(activeCard.expiresInSeconds || 900)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeCardBtn}
                onPress={handleDismissCard}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color="#6C7A71" />
              </TouchableOpacity>
            </View>

            <Text style={styles.cardTitle}>{activeCard.title}</Text>
            <Text style={styles.cardPlace}>📍 {activeCard.place}</Text>

            <View style={styles.cardBottom}>
              <View>
                <Text style={styles.rewardSub}>
                  {isCardMine ? 'ESCROW ALLOCATED' : 'EARN REWARD'}
                </Text>
                <Text style={[styles.rewardCash, { color: primaryThemeColor }]}>
                  ${Number(activeCard.reward).toFixed(2)}{' '}
                  <Text style={styles.rewardXp}>({activeCard.xp} XP)</Text>
                </Text>
              </View>

              {isCardMine ? (
                <TouchableOpacity
                  style={styles.cancelBountyBtn}
                  activeOpacity={0.85}
                  onPress={() => handleCancelMyBounty(activeCard.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.cancelBountyText}>Cancel Bounty</Text>
                </TouchableOpacity>
              ) : isAlreadySubmitted ? (
                <View style={styles.disabledActionBtn}>
                  <Ionicons name="hourglass-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.disabledActionBtnText}>Review Pending</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, isCreator && styles.actionBtnCreator]}
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push(`/review/${activeCard.id}`);
                  }}
                >
                  <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Verify Now</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}

      <BottomNav activeTab="explore" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF8FF',
  },
  topHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 16,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balancePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E7E5F4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  balancePillCreator: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF9',
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6C7A71',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7E5F4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconBtnCreator: {
    borderColor: '#FDE68A',
  },
  categoryBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 116 : 76,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E7E5F4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  catChipCreator: {
    borderColor: '#FDE68A',
  },
  catChipActiveScout: {
    backgroundColor: '#006C49',
    borderColor: '#006C49',
  },
  catChipActiveCreator: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  catText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1B22',
  },
  catTextActive: {
    color: '#FFFFFF',
  },
  mapWrap: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  markerContainerActive: {
    transform: [{ scale: 1.15 }],
  },
  markerBadgeCounter: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 10,
    elevation: 6,
  },
  markerBadgeCounterText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  markerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  markerIconScout: {
    borderColor: '#006C49',
  },
  markerIconScoutActive: {
    backgroundColor: '#006C49',
    borderColor: '#10B981',
  },
  markerIconCreator: {
    borderColor: '#D97706',
  },
  markerIconCreatorActive: {
    backgroundColor: '#D97706',
    borderColor: '#F59E0B',
  },
  markerIconSent: {
    borderColor: '#DC2626',
    backgroundColor: '#EF4444',
  },
  markerIconSentActive: {
    backgroundColor: '#DC2626',
    borderColor: '#991B1B',
  },
  markerPriceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: -6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  markerPriceScout: {
    backgroundColor: '#10B981',
  },
  markerPriceScoutActive: {
    backgroundColor: '#059669',
  },
  markerPriceCreator: {
    backgroundColor: '#F59E0B',
  },
  markerPriceCreatorActive: {
    backgroundColor: '#D97706',
  },
  markerPriceSent: {
    backgroundColor: '#DC2626',
  },
  markerPriceSentActive: {
    backgroundColor: '#B91C1C',
  },
  markerPriceText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 10,
  },
  bountyCardOverlay: {
    position: 'absolute',
    bottom: 92,
    left: 16,
    right: 16,
    zIndex: 30,
  },
  bountyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#F0EEF9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  bountyCardCreator: {
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOpacity: 0.12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  catBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  catBadgeCreator: {
    backgroundColor: '#FEF3C7',
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006C49',
  },
  myBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  myBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  submittedBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  submittedBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
  },
  cardPendingBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardPendingBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  closeCardBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F4F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1B22',
    marginTop: 2,
  },
  cardPlace: {
    fontSize: 13,
    color: '#6C7A71',
    marginTop: 2,
    marginBottom: 14,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F4F2FD',
    paddingTop: 12,
  },
  rewardSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6C7A71',
  },
  rewardCash: {
    fontSize: 18,
    fontWeight: '900',
  },
  rewardXp: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C7A71',
  },
  actionBtn: {
    backgroundColor: '#006C49',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  actionBtnCreator: {
    backgroundColor: '#D97706',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  disabledActionBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  disabledActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cancelBountyBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  cancelBountyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});