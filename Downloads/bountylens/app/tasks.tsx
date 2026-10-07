import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomNav } from '../components/BottomNav';
import { useBounties } from '../context/BountiesContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';

interface SubmissionItem {
  id: string;
  bounty_id: string;
  scout_id: string;
  media_path: string;
  distance_m: number;
  status: string;
  created_at: string;
}

export default function TasksScreen() {
  const router = useRouter();
  const { bounties, fetchBounties } = useBounties() as any;
  const { role } = useUser();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  const [submissionsByBounty, setSubmissionsByBounty] = useState<Record<string, SubmissionItem[]>>({});
  const [expandedBountyId, setExpandedBountyId] = useState<string | null>(null);
  const [processingSubId, setProcessingSubId] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const grouped: Record<string, SubmissionItem[]> = {};
        data.forEach((sub: SubmissionItem) => {
          if (!grouped[sub.bounty_id]) grouped[sub.bounty_id] = [];
          grouped[sub.bounty_id].push(sub);
        });
        setSubmissionsByBounty(grouped);
      }
    } catch (err) {
      console.warn('Failed to fetch submissions:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          setCurrentUserId(session.user.id);
        }
      } catch (err) {
        console.warn('Failed to load user in TasksScreen:', err);
      }
    })();
    fetchSubmissions();
  }, [fetchSubmissions]);

  const isBountyMine = (bounty: any) => {
    if (bounty.creator_id && currentUserId) {
      return String(bounty.creator_id) === String(currentUserId);
    }
    return bounty.creator === '@you';
  };

  const scoutActive = (bounties || []).filter((b: any) => b.status === 'active' || !b.completed);
  const scoutCompleted = (bounties || []).filter((b: any) => b.status === 'completed' || b.completed);

  const creatorActive = (bounties || []).filter((b: any) => isBountyMine(b) && (b.status === 'active' || !b.completed));
  const creatorCompleted = (bounties || []).filter((b: any) => isBountyMine(b) && (b.status === 'completed' || b.completed));

  const isCreator = role === 'creator';
  const displayedActive = isCreator ? creatorActive : scoutActive;
  const displayedCompleted = isCreator ? creatorCompleted : scoutCompleted;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // 1. Атомарний Approve через RPC без виклику completeBounty
  const handleApproveSubmission = async (bounty: any, sub: SubmissionItem) => {
    if (processingSubId) return;
    try {
      setProcessingSubId(sub.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const { error } = await supabase.rpc('review_submission', {
        p_submission_id: sub.id,
        p_approve: true,
        p_reason: null,
      });

      if (error) throw error;

      setSubmissionsByBounty((prev) => {
        const copy = { ...prev };
        delete copy[bounty.id];
        return copy;
      });

      if (typeof fetchBounties === 'function') {
        await fetchBounties();
      }

      Alert.alert('Approved', 'Scout has been rewarded and bounty marked complete.');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Approve Failed', err.message || 'Could not verify submission.');
    } finally {
      setProcessingSubId(null);
    }
  };

  // 2. Атомарний Reject через RPC
  const handleRejectSubmission = async (bountyId: string, subId: string) => {
    if (processingSubId) return;
    try {
      setProcessingSubId(subId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      const { error } = await supabase.rpc('review_submission', {
        p_submission_id: subId,
        p_approve: false,
        p_reason: 'wrong_subject',
      });

      if (error) throw error;

      setSubmissionsByBounty((prev) => {
        const copy = { ...prev };
        if (copy[bountyId]) {
          copy[bountyId] = copy[bountyId].filter((s) => s.id !== subId);
          if (copy[bountyId].length === 0) delete copy[bountyId];
        }
        return copy;
      });

      if (typeof fetchBounties === 'function') {
        await fetchBounties();
      }

      Alert.alert('Rejected', 'Submission was rejected. Bounty returned to radar.');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Reject Failed', err.message || 'Could not reject submission.');
    } finally {
      setProcessingSubId(null);
    }
  };

  // 3. Безпечне скасування баунті без виклику completeBounty
  const handleCancelBounty = (id: string) => {
    Alert.alert(
      'Cancel Bounty?',
      'Are you sure you want to pull down this bounty? Reserved escrow funds will be unlocked.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Cancel Bounty',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            try {
              const { error } = await supabase.rpc('cancel_bounty_secure', {
                p_bounty_id: id,
              });

              if (error) throw error;

              if (typeof fetchBounties === 'function') {
                await fetchBounties();
              }

              Alert.alert('Cancelled', 'Bounty closed and funds refunded to your balance.');
            } catch (err: any) {
              Alert.alert('Cancellation Error', err.message || 'Failed to cancel bounty.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTag, isCreator && { color: '#D97706' }]}>
            {isCreator ? 'CREATOR DISPATCH' : 'CITY RADAR'}
          </Text>
          <Text style={styles.headerTitle}>
            {isCreator ? 'My Postings' : 'Task Board'}
          </Text>
        </View>

        <View style={[styles.counterBadge, isCreator && styles.counterBadgeCreator]}>
          <Text style={[styles.counterBadgeText, isCreator && styles.counterBadgeTextCreator]}>
            {isCreator ? `${displayedActive.length} Active Orders` : `${scoutActive.length} Live Drops`}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'active' && styles.tabButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('active');
            }}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'active' && (isCreator ? styles.tabButtonTextActiveCreator : styles.tabButtonTextActiveScout),
              ]}
            >
              {isCreator ? `Active Drops (${displayedActive.length})` : `Radar (${displayedActive.length})`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('history');
            }}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'history' && (isCreator ? styles.tabButtonTextActiveCreator : styles.tabButtonTextActiveScout),
              ]}
            >
              {isCreator ? `Resolved (${displayedCompleted.length})` : `Cleared (${displayedCompleted.length})`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {activeTab === 'active' ? (
            displayedActive.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons
                  name={isCreator ? 'bullhorn-outline' : 'radar'}
                  size={44}
                  color={isCreator ? '#D97706' : '#6C7A71'}
                />
                <Text style={styles.emptyTitle}>
                  {isCreator ? 'No active orders deployed' : 'No active drops in sight'}
                </Text>
                <Text style={styles.emptySub}>
                  {isCreator
                    ? 'Tap the plus button below to deploy a bounty to local scouts.'
                    : 'Explore the map or wait for radar pings to catch drops.'}
                </Text>
              </View>
            ) : (
              displayedActive.map((bounty: any) => {
                const isMine = isBountyMine(bounty);
                const pendingList = submissionsByBounty[String(bounty.id)] || [];
                const hasPending = pendingList.length > 0;
                const isExpanded = expandedBountyId === String(bounty.id);

                return (
                  <View key={bounty.id} style={styles.bountyCard}>
                    <TouchableOpacity
                      activeOpacity={isMine ? 0.75 : 1}
                      onPress={() => {
                        if (isMine) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setExpandedBountyId(isExpanded ? null : String(bounty.id));
                        }
                      }}
                    >
                      <View style={styles.bountyCardTop}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View
                            style={[
                              styles.categoryPill,
                              isMine && styles.categoryPillMine,
                            ]}
                          >
                            <Text
                              style={[
                                styles.categoryText,
                                isMine && styles.categoryTextMine,
                              ]}
                            >
                              {isMine ? 'YOUR BOUNTY' : (bounty.category || 'GENERAL').toUpperCase()}
                            </Text>
                          </View>

                          {isMine && hasPending && (
                            <View style={styles.pendingBadge}>
                              <Text style={styles.pendingBadgeText}>
                                {pendingList.length} {pendingList.length === 1 ? 'Proof' : 'Proofs'}
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={[styles.rewardTag, isCreator && styles.rewardTagCreator]}>
                          <Text style={[styles.rewardAmount, isCreator && styles.rewardAmountCreator]}>
                            {isCreator ? 'Escrow: ' : '+'}
                            ${Number(bounty.reward).toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.bountyTitle}>{bounty.title}</Text>
                      <View style={styles.addressRow}>
                        <Ionicons name="location-outline" size={14} color="#6C7A71" />
                        <Text style={styles.bountyAddress} numberOfLines={1}>
                          {bounty.place || bounty.address}
                        </Text>
                      </View>

                      {isMine && hasPending && (
                        <View style={styles.clickToReviewRow}>
                          <Text style={styles.clickToReviewText}>
                            {isExpanded ? 'Hide submissions' : 'Tap to inspect submissions'}
                          </Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color="#D97706"
                          />
                        </View>
                      )}
                    </TouchableOpacity>

                    {isMine && isExpanded && hasPending && (
                      <View style={styles.submissionsBlock}>
                        <Text style={styles.submissionsBlockTitle}>INCOMING SCOUT SUBMISSIONS:</Text>

                        {pendingList.map((sub) => (
                          <View key={sub.id} style={styles.submissionItemCard}>
                            <Image
                              source={{ uri: sub.media_path }}
                              style={styles.submissionImage}
                              resizeMode="cover"
                            />

                            <View style={styles.subDetailsRow}>
                              <View style={styles.inlineInfoRow}>
                                <Ionicons name="locate-outline" size={13} color="#4B5563" />
                                <Text style={styles.subDistance}>Distance: {sub.distance_m}m</Text>
                              </View>
                              <Text style={styles.subDate}>
                                {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>

                            <View style={styles.reviewActionsRow}>
                              <TouchableOpacity
                                style={styles.rejectBtn}
                                activeOpacity={0.8}
                                disabled={processingSubId === sub.id}
                                onPress={() => handleRejectSubmission(String(bounty.id), sub.id)}
                              >
                                <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                                <Text style={styles.rejectBtnText}>Reject</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.approveBtn}
                                activeOpacity={0.8}
                                disabled={processingSubId === sub.id}
                                onPress={() => handleApproveSubmission(bounty, sub)}
                              >
                                {processingSubId === sub.id ? (
                                  <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                  <>
                                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                                    <Text style={styles.approveBtnText}>Approve & Payout</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={styles.bountyFooter}>
                      <View style={styles.timerWrap}>
                        <Ionicons name="time-outline" size={14} color="#6C7A71" />
                        <Text style={styles.timerText}>
                          {formatTimer(bounty.expiresInSeconds || 900)}
                        </Text>
                      </View>

                      <View style={styles.footerActions}>
                        {isCreator && isMine ? (
                          <TouchableOpacity
                            style={styles.cancelActionBtn}
                            activeOpacity={0.85}
                            onPress={() => handleCancelBounty(bounty.id)}
                          >
                            <Ionicons name="trash-outline" size={14} color="#DC2626" />
                            <Text style={styles.cancelActionText}>Cancel</Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={[styles.locateBtn, isCreator && styles.locateBtnCreator]}
                          activeOpacity={0.85}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            router.push({
                              pathname: '/',
                              params: {
                                focusId: bounty.id,
                                targetLat: bounty.latitude.toString(),
                                targetLng: bounty.longitude.toString(),
                              },
                            });
                          }}
                        >
                          <Ionicons
                            name="navigate-outline"
                            size={14}
                            color={isCreator ? '#D97706' : '#006C49'}
                          />
                          <Text style={[styles.locateBtnText, isCreator && styles.locateBtnTextCreator]}>
                            Locate
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )
          ) : displayedCompleted.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="checkbox-blank-badge-outline" size={44} color="#6C7A71" />
              <Text style={styles.emptyTitle}>
                {isCreator ? 'No completed orders yet' : 'No cleared tasks yet'}
              </Text>
              <Text style={styles.emptySub}>
                {isCreator
                  ? 'Completed photo checks and verified scout payouts will appear here.'
                  : 'Your verified photo submissions and cleared escrow rewards will appear here.'}
              </Text>
            </View>
          ) : (
            displayedCompleted.map((bounty: any) => (
              <View key={bounty.id} style={[styles.bountyCard, styles.bountyCardCompleted]}>
                <View style={styles.bountyCardTop}>
                  <View style={[styles.completedBadge, isCreator && styles.completedBadgeCreator]}>
                    <Ionicons
                      name="checkmark-done"
                      size={14}
                      color={isCreator ? '#D97706' : '#006C49'}
                    />
                    <Text style={[styles.completedBadgeText, isCreator && styles.completedBadgeTextCreator]}>
                      {isCreator ? 'Escrow Released' : 'Resolved & Paid'}
                    </Text>
                  </View>
                  <Text style={[styles.clearedAmount, isCreator && { color: '#D97706' }]}>
                    {isCreator ? 'Paid: ' : '+'}
                    ${Number(bounty.reward).toFixed(2)} USD
                  </Text>
                </View>

                <Text style={styles.bountyTitle}>{bounty.title}</Text>
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={14} color="#6C7A71" />
                  <Text style={styles.bountyAddress}>{bounty.place || bounty.address}</Text>
                </View>

                <View style={styles.completedFooter}>
                  <Text style={styles.completedTimestamp}>Verified by Creator</Text>
                  <View style={[styles.xpMiniBadge, isCreator && styles.xpMiniBadgeCreator]}>
                    <Text style={[styles.xpMiniText, isCreator && styles.xpMiniTextCreator]}>
                      {isCreator ? 'HOST DROP' : `+${bounty.xp} XP`}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <BottomNav activeTab="tasks" />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 14 : 20,
    paddingBottom: 14,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006C49',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1B22',
    marginTop: 2,
  },
  counterBadge: {
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  counterBadgeCreator: {
    backgroundColor: '#FEF3C7',
  },
  counterBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#006C49',
  },
  counterBadgeTextCreator: {
    color: '#D97706',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    gap: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F4F2FD',
    padding: 4,
    borderRadius: 18,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6C7A71',
  },
  tabButtonTextActiveScout: {
    color: '#006C49',
    fontWeight: '800',
  },
  tabButtonTextActiveCreator: {
    color: '#D97706',
    fontWeight: '800',
  },
  listContainer: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
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
  bountyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
    gap: 8,
  },
  bountyCardCompleted: {
    backgroundColor: '#FBF8FF',
  },
  bountyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryPillMine: {
    backgroundColor: '#FEF3C7',
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284C7',
  },
  categoryTextMine: {
    color: '#D97706',
  },
  pendingBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clickToReviewRow: {
    marginTop: 6,
    backgroundColor: '#FFFBEB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  clickToReviewText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
    textAlign: 'center',
  },
  submissionsBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F4F2FD',
    gap: 12,
  },
  submissionsBlockTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.6,
  },
  submissionItemCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  submissionImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  subDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subDistance: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  subDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  reviewActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    borderRadius: 12,
  },
  rejectBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
  },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 12,
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  rewardTag: {
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rewardTagCreator: {
    backgroundColor: '#FEF3C7',
  },
  rewardAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#006C49',
  },
  rewardAmountCreator: {
    color: '#D97706',
  },
  bountyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1B22',
  },
  bountyAddress: {
    fontSize: 12,
    color: '#6C7A71',
    flex: 1,
  },
  bountyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F2FD',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C7A71',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  cancelActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  cancelActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  locateBtnCreator: {
    backgroundColor: '#FEF3C7',
  },
  locateBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006C49',
  },
  locateBtnTextCreator: {
    color: '#D97706',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completedBadgeCreator: {
    backgroundColor: '#FEF3C7',
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#006C49',
  },
  completedBadgeTextCreator: {
    color: '#D97706',
  },
  clearedAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  completedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  completedTimestamp: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6C7A71',
  },
  xpMiniBadge: {
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  xpMiniBadgeCreator: {
    backgroundColor: '#FEF3C7',
  },
  xpMiniText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006C49',
  },
  xpMiniTextCreator: {
    color: '#D97706',
  },
});