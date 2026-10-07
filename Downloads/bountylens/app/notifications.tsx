import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomNav } from '../components/BottomNav';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';
import { getOrCreateScoutId } from '../lib/authHelper';

const cleanText = (str?: string | null): string => {
  if (!str) return '';
  return str
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/[🔥📡💰❌📍⚡️✔️✨]/g, '')
    .trim();
};

interface PulseEvent {
  id: string;
  type: 'completed' | 'urgent_drop' | 'payout' | 'creator_review' | 'rejected' | 'bounty_completed';
  title: string;
  subtitle: string;
  timeAgo: string;
  targetRole?: 'scout' | 'creator';
  reward?: number;
  latitude?: number;
  longitude?: number;
}

export default function RadarScreen() {
  const router = useRouter();
  const { role } = useUser();
  const [liveEvents, setLiveEvents] = useState<PulseEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isCreator = role === 'creator';
  const primaryThemeColor = isCreator ? '#D97706' : '#006C49';

  const fetchLiveNotifications = async () => {
    try {
      const uid = await getOrCreateScoutId();
      if (!uid) return;

      const { data, error } = await supabase
        .from('radar_notifications')
        .select('*')
        .eq('user_id', String(uid))
        .eq('target_role', role)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        const mapped: PulseEvent[] = data.map((item: any) => ({
          id: String(item.id),
          type: item.type as any,
          title: cleanText(item.title),
          subtitle: cleanText(item.message),
          targetRole: item.target_role,
          timeAgo: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reward: item.amount ? Number(item.amount) : undefined,
        }));

        setLiveEvents(mapped);
      }
    } catch (err) {
      console.warn('Notifications fetch error:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLiveNotifications();
    }, [role])
  );

  useEffect(() => {
    let activeChannel: any = null;

    (async () => {
      const uid = await getOrCreateScoutId();
      if (!uid) return;

      const channelName = `radar_${uid}_${role}_${Date.now()}`;
      activeChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'radar_notifications' },
          (payload) => {
            const newItem = payload.new as any;
            if (
              newItem &&
              String(newItem.user_id) === String(uid) &&
              newItem.target_role === role
            ) {
              const formatted: PulseEvent = {
                id: String(newItem.id),
                type: newItem.type,
                title: cleanText(newItem.title),
                subtitle: cleanText(newItem.message),
                targetRole: newItem.target_role,
                timeAgo: new Date(newItem.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                reward: newItem.amount ? Number(newItem.amount) : undefined,
              };
              setLiveEvents((prev) => [formatted, ...prev]);
            }
          }
        )
        .subscribe();
    })();

    return () => {
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
    };
  }, [role]);

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    await fetchLiveNotifications();
    setIsRefreshing(false);
  };

  const getEventIcon = (type: string) => {
    if (isCreator) {
      switch (type) {
        case 'creator_review':
          return <Ionicons name="document-text-outline" size={22} color="#D97706" />;
        case 'bounty_completed':
          return <Ionicons name="shield-checkmark-outline" size={22} color="#D97706" />;
        case 'urgent_drop':
          return <Ionicons name="radio-outline" size={22} color="#D97706" />;
        default:
          return <Ionicons name="checkmark-done-circle-outline" size={22} color="#D97706" />;
      }
    }

    switch (type) {
      case 'payout':
        return <Ionicons name="wallet-outline" size={22} color="#006C49" />;
      case 'rejected':
        return <Ionicons name="close-circle-outline" size={22} color="#DC2626" />;
      case 'urgent_drop':
        return <Ionicons name="flash-outline" size={22} color="#006C49" />;
      default:
        return <Ionicons name="checkmark-circle-outline" size={22} color="#006C49" />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTag, { color: primaryThemeColor }]}>
            {isCreator ? 'HOST TELEMETRY RADAR' : 'CITY PULSE RADAR'}
          </Text>
          <Text style={styles.headerTitle}>
            {isCreator ? 'Dispatch Feed' : 'Live Activity Feed'}
          </Text>
        </View>

        <View style={[styles.radarStatusPill, isCreator && styles.radarStatusPillCreator]}>
          <View style={[styles.pulseDot, { backgroundColor: isCreator ? '#F59E0B' : '#10B981' }]} />
          <Text style={[styles.radarStatusText, { color: primaryThemeColor }]}>
            {isCreator ? 'Host Channel' : 'Scout Channel'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handlePullRefresh} tintColor={primaryThemeColor} />
        }
      >
        {liveEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name={isCreator ? 'radio-outline' : 'notifications-outline'}
              size={42}
              color={isCreator ? '#D97706' : '#6C7A71'}
            />
            <Text style={styles.emptyTitle}>
              {isCreator ? 'No telemetry alerts' : 'Radar quiet'}
            </Text>
            <Text style={styles.emptySub}>
              {isCreator
                ? 'Incoming verifications and completed escrow orders will arrive here.'
                : 'Verified submissions and cleared wallet payouts will arrive here in real time.'}
            </Text>
          </View>
        ) : (
          liveEvents.map((item) => (
            <View
              key={item.id}
              style={[
                styles.eventCard,
                isCreator && styles.eventCardCreator,
                item.type === 'rejected' && styles.eventCardRejected,
              ]}
            >
              <View
                style={[
                  styles.eventIconWrap,
                  isCreator && styles.eventIconWrapCreator,
                  item.type === 'rejected' && styles.eventIconWrapRejected,
                ]}
              >
                {getEventIcon(item.type)}
              </View>

              <View style={styles.eventBody}>
                <View style={styles.eventTop}>
                  <Text style={styles.eventTitle}>{cleanText(item.title)}</Text>
                  <Text style={styles.eventTime}>{item.timeAgo}</Text>
                </View>

                <Text style={styles.eventSub}>{cleanText(item.subtitle)}</Text>

                {item.type === 'urgent_drop' && (
                  <View style={styles.actionRow}>
                    <Text style={[styles.rewardText, isCreator && { color: '#D97706' }]}>
                      {isCreator ? 'Escrow: ' : 'Earn +'}${item.reward?.toFixed(2)}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.actionBtnPrimary,
                        isCreator && styles.actionBtnPrimaryCreator,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        if (isCreator) {
                          router.push('/tasks');
                        } else {
                          router.push({
                            pathname: '/',
                            params: item.latitude && item.longitude
                              ? { targetLat: item.latitude.toString(), targetLng: item.longitude.toString() }
                              : undefined,
                          });
                        }
                      }}
                    >
                      <Ionicons
                        name={isCreator ? 'list-outline' : 'compass-outline'}
                        size={14}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionBtnText}>
                        {isCreator ? 'Manage Drop' : 'View on Map'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {(item.type === 'payout' || item.type === 'bounty_completed') && (
                  <View style={styles.actionRow}>
                    <Text
                      style={[
                        styles.payoutStatus,
                        isCreator && { color: '#D97706' },
                      ]}
                    >
                      Status: {isCreator ? 'DISBURSED' : 'CLEARED'}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.actionBtnWallet,
                        isCreator && styles.actionBtnWalletCreator,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/profile');
                      }}
                    >
                      <Ionicons
                        name="wallet-outline"
                        size={14}
                        color={primaryThemeColor}
                      />
                      <Text
                        style={[
                          styles.actionBtnWalletText,
                          { color: primaryThemeColor },
                        ]}
                      >
                        {isCreator ? 'Escrow Ledger' : 'Check Wallet'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {item.type === 'rejected' && (
                  <View style={styles.actionRow}>
                    <Text style={[styles.payoutStatus, { color: '#DC2626' }]}>
                      Status: REJECTED
                    </Text>
                    <TouchableOpacity
                      style={[styles.actionBtnWallet, { backgroundColor: '#FEE2E2' }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/');
                      }}
                    >
                      <Ionicons name="map-outline" size={14} color="#DC2626" />
                      <Text style={[styles.actionBtnWalletText, { color: '#DC2626' }]}>
                        Find New Spots
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <BottomNav activeTab="radar" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF8FF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 14 : 20,
    paddingBottom: 14,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1B22',
    marginTop: 2,
  },
  radarStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  radarStatusPillCreator: {
    backgroundColor: '#FEF3C7',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  radarStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1B22',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 12,
    color: '#6C7A71',
    textAlign: 'center',
    lineHeight: 18,
  },
  eventCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  eventCardCreator: {
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
  },
  eventCardRejected: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFDFD',
  },
  eventIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F4F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIconWrapCreator: {
    backgroundColor: '#FFFDF9',
  },
  eventIconWrapRejected: {
    backgroundColor: '#FEE2E2',
  },
  eventBody: {
    flex: 1,
    gap: 4,
  },
  eventTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1B22',
    flex: 1,
  },
  eventTime: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6C7A71',
  },
  eventSub: {
    fontSize: 12,
    color: '#6C7A71',
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F2FD',
  },
  rewardText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#006C49',
  },
  payoutStatus: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006C49',
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#006C49',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    borderBottomWidth: 3,
    borderBottomColor: '#004B33',
  },
  actionBtnPrimaryCreator: {
    backgroundColor: '#D97706',
    borderBottomColor: '#B45309',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionBtnWallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  actionBtnWalletCreator: {
    backgroundColor: '#FEF3C7',
  },
  actionBtnWalletText: {
    fontSize: 12,
    fontWeight: '800',
  },
});