import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  Image,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNav } from '../components/BottomNav';
import { supabase } from '../lib/supabase';

const LOCAL_AVATARS: Record<string, any> = {
  fox: require('../assets/avatars/fox.png'),
  bear: require('../assets/avatars/bear.png'),
  raccoon: require('../assets/avatars/raccoon.png'),
  chick: require('../assets/avatars/chick.png'),
  bunny: require('../assets/avatars/bunny.png'),
  bird: require('../assets/avatars/bird.png'),
};

interface ProofPost {
  id: string;
  scoutName: string;
  scoutHandle: string;
  avatarKey: string;
  taskTitle: string;
  place: string;
  timeAgo: string;
  payout: number;
  xpEarned: number;
  imageUrl?: string | null;
  likes: number;
  isLiked?: boolean;
  latitude: number;
  longitude: number;
}

export default function LiveFeedScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<ProofPost[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLiveProofs = useCallback(async () => {
    try {
      // 1. Отримуємо завершені завдання з Supabase
      const { data: dbBounties, error } = await supabase
        .from('bounties')
        .select('*')
        .in('status', ['completed', 'approved'])
        .order('expires_at', { ascending: false });

      if (error) {
        console.warn('Error fetching completed bounties:', error.message);
      }

      const cloudPosts: ProofPost[] = (dbBounties || []).map((b: any) => {
        let displayImg = b.proof_image || b.proofImage;
        if (displayImg && !displayImg.startsWith('http')) {
          const { data } = supabase.storage.from('proofs').getPublicUrl(displayImg);
          displayImg = data?.publicUrl || displayImg;
        }

        const payoutValue = Number(b.reward_cents ? b.reward_cents / 100 : b.reward || 0);

        return {
          id: String(b.id),
          scoutName: b.creator && b.creator !== '@you' ? b.creator.replace('@', '') : 'Verified Scout',
          scoutHandle: b.creator || '@scout',
          avatarKey: 'raccoon',
          taskTitle: b.title,
          place: b.place || b.address || 'Local Spot',
          timeAgo: 'Recently',
          payout: payoutValue,
          xpEarned: b.xp || Math.round(payoutValue * 10),
          imageUrl: displayImg,
          likes: Number(b.likes_count || 0),
          isLiked: false,
          latitude: Number(b.latitude) || 50.7472,
          longitude: Number(b.longitude) || 25.3254,
        };
      });

      // 2. Отримуємо локальні свіжі пруфи
      let localProofs: ProofPost[] = [];
      try {
        const cached = await AsyncStorage.getItem('@city_live_proofs');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            localProofs = parsed.map((p) => ({
              id: String(p.id),
              scoutName: p.scoutName || 'You (Scout)',
              scoutHandle: p.scoutHandle || '@scout',
              avatarKey: p.avatarKey || 'raccoon',
              taskTitle: p.taskTitle,
              place: p.place || 'Local Spot',
              timeAgo: p.timeAgo || 'Just now',
              payout: Number(p.payout || 0),
              xpEarned: Number(p.xpEarned || 0),
              imageUrl: p.imageUrl,
              likes: Number(p.likes || 0),
              isLiked: false,
              latitude: Number(p.latitude) || 50.7472,
              longitude: Number(p.longitude) || 25.3254,
            }));
          }
        }
      } catch (e) {
        console.warn('Failed to parse cached proofs:', e);
      }

      // 3. Об'єднуємо та дедуплікуємо за ID
      const combined = [...localProofs, ...cloudPosts];
      const uniquePostsMap = new Map<string, ProofPost>();
      for (const item of combined) {
        if (!uniquePostsMap.has(item.id)) {
          uniquePostsMap.set(item.id, item);
        }
      }

      setPosts(Array.from(uniquePostsMap.values()));
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveProofs();
  }, [fetchLiveProofs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLiveProofs();
  };

  const handleLike = async (id: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPosts((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const isLiked = !item.isLiked;
          const updatedLikes = isLiked ? item.likes + 1 : Math.max(0, item.likes - 1);
          return {
            ...item,
            isLiked,
            likes: updatedLikes,
          };
        }
        return item;
      })
    );
  };

  const handleLocateSpot = async (item: ProofPost) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/',
      params: {
        targetLat: item.latitude.toString(),
        targetLng: item.longitude.toString(),
        focusId: item.id,
      },
    });
  };

  const renderPost = ({ item }: { item: ProofPost }) => {
    const avatar = LOCAL_AVATARS[item.avatarKey] || LOCAL_AVATARS.raccoon;

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.authorRow}>
            <View style={styles.avatarWrap}>
              <Image source={avatar} style={styles.avatarImg} />
              <View style={styles.greenDot} />
            </View>
            <View>
              <Text style={styles.scoutName}>{item.scoutName}</Text>
              <View style={styles.handleRow}>
                <Text style={styles.scoutHandle}>{item.scoutHandle}</Text>
                <Text style={styles.dotDivider}>•</Text>
                <Text style={styles.timeText}>{item.timeAgo}</Text>
              </View>
            </View>
          </View>

          <View style={styles.rewardBadge}>
            <Text style={styles.rewardText}>+${item.payout.toFixed(2)}</Text>
          </View>
        </View>

        {/* Title and location */}
        <View style={styles.titleSection}>
          <Text style={styles.taskTitle}>{item.taskTitle}</Text>
          <View style={styles.placePill}>
            <Ionicons name="location-sharp" size={13} color="#006C49" />
            <Text style={styles.placeText} numberOfLines={1}>
              {item.place}
            </Text>
          </View>
        </View>

        {/* Proof Photo */}
        {item.imageUrl ? (
          <View style={styles.photoContainer}>
            <Image source={{ uri: item.imageUrl }} style={styles.proofPhoto} />

            {/* Стильний бейдж підтвердження зі щитом */}
            <View style={styles.verifiedFloatingPill}>
              <MaterialCommunityIcons name="shield-check" size={15} color="#006C49" />
              <Text style={styles.verifiedFloatingText}>Verified Drop</Text>
            </View>
          </View>
        ) : null}

        {/* Card Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.xpPill}>
            <MaterialCommunityIcons name="flash" size={13} color="#006C49" />
            <Text style={styles.xpText}>+{item.xpEarned} XP Cleared</Text>
          </View>

          <View style={styles.actionsRight}>
            <TouchableOpacity
              style={[styles.likeBtn, item.isLiked && styles.likeBtnActive]}
              activeOpacity={0.8}
              onPress={() => handleLike(item.id)}
            >
              <Ionicons
                name={item.isLiked ? 'heart' : 'heart-outline'}
                size={16}
                color={item.isLiked ? '#EF4444' : '#6C7A71'}
              />
              <Text style={[styles.likeCount, item.isLiked && styles.likeCountActive]}>
                {item.likes}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locateBtn}
              activeOpacity={0.85}
              onPress={() => handleLocateSpot(item)}
            >
              <Ionicons name="navigate-outline" size={14} color="#006C49" />
              <Text style={styles.locateBtnText}>Locate</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTag}>CITY PULSE STREAM</Text>
          <Text style={styles.headerTitle}>Live Proofs</Text>
        </View>

        <View style={styles.liveStatusBadge}>
          <View style={styles.pulseDot} />
          <Text style={styles.liveStatusText}>Live Feed</Text>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#006C49"
            colors={['#006C49']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="camera-iris" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No verified drops yet</Text>
            <Text style={styles.emptySub}>Complete tasks around your area to populate the city feed.</Text>
          </View>
        }
      />

      <BottomNav activeTab="feed" />
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
    borderBottomWidth: 1,
    borderBottomColor: '#F0EEF9',
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006C49',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1A1B22',
    marginTop: 2,
  },
  liveStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  liveStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006C49',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 110,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#006C49',
    padding: 2,
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  greenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  scoutName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1B22',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoutHandle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C7A71',
  },
  dotDivider: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  timeText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  rewardBadge: {
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  rewardText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#006C49',
  },
  titleSection: {
    gap: 6,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1B22',
  },
  placePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F4F2FD',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  placeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  photoContainer: {
    width: '100%',
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  proofPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  verifiedFloatingPill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6FBF2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  verifiedFloatingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006C49',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F4F2FD',
    paddingTop: 10,
  },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  xpText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006C49',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F4F2FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  likeBtnActive: {
    backgroundColor: '#FEE2E2',
  },
  likeCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C7A71',
  },
  likeCountActive: {
    color: '#EF4444',
  },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  locateBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#006C49',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1B22',
  },
  emptySub: {
    fontSize: 13,
    color: '#6C7A71',
    textAlign: 'center',
    maxWidth: 240,
  },
});