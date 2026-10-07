import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { Keypair, PublicKey } from '@solana/web3.js';
import { BottomNav } from '../components/BottomNav';
import { useUser, UserRole } from '../context/UserContext';
import { useBounties } from '../context/BountiesContext';
import { supabase } from '../lib/supabase';
import { getOrCreateScoutId } from '../lib/authHelper';

const SCOUT_AVATARS: Record<string, any> = {
  raccoon: require('../assets/avatars/raccoon.png'),
  chick: require('../assets/avatars/chick.png'),
  fox: require('../assets/avatars/fox.png'),
  bear: require('../assets/avatars/bear.png'),
  bunny: require('../assets/avatars/bunny.png'),
  bird: require('../assets/avatars/bird.png'),
};

const AVATAR_LIST = [
  { id: 'raccoon', title: 'Mint Scout' },
  { id: 'chick', title: 'Cyber Chick' },
  { id: 'fox', title: 'Scout Fox' },
  { id: 'bear', title: 'Tech Bear' },
  { id: 'bunny', title: 'Urban Bunny' },
  { id: 'bird', title: 'Sky Spotter' },
];

interface BadgeItem {
  id: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
  bg: string;
  unlockedAt: string;
}

const SCOUT_RANKS = [
  {
    level: 1,
    name: 'Rookie Scout',
    icon: 'compass-outline',
    xpNeeded: '0 - 150 XP',
    perk: 'Standard bounty radar access & basic payout releases.',
  },
  {
    level: 2,
    name: 'Street Explorer',
    icon: 'navigation-variant-outline',
    xpNeeded: '150 - 400 XP',
    perk: '+10% XP bonus on verified venue checks & hot spots.',
  },
  {
    level: 3,
    name: 'Urban Ranger',
    icon: 'shield-sword-outline',
    xpNeeded: '400 - 800 XP',
    perk: 'Early access to High-Value Drops ($10+) & 15m radar advantage.',
  },
  {
    level: 4,
    name: 'City Vanguard',
    icon: 'flare',
    xpNeeded: '800 - 1500 XP',
    perk: 'Zero-fee instant cashouts + exclusive verified scout badge.',
  },
  {
    level: 5,
    name: 'Master Hunter',
    icon: 'crown-outline',
    xpNeeded: '1500+ XP',
    perk: 'Automated dispute override & highest radar priority.',
  },
];

const SCOUT_BADGES: BadgeItem[] = [
  {
    id: 's1',
    title: 'First Blood',
    desc: 'Successfully verified your first real-world city bounty.',
    icon: 'bullseye-arrow',
    color: '#FB7185',
    bg: '#FFE4E6',
    unlockedAt: 'Unlocked',
  },
  {
    id: 's2',
    title: 'Precision Lens',
    desc: 'Maintained an average camera verification match above 92%.',
    icon: 'target-account',
    color: '#38BDF8',
    bg: '#E0F2FE',
    unlockedAt: 'Active Perk',
  },
  {
    id: 's3',
    title: 'Speed Demon',
    desc: 'Completed a live task within 4 minutes of its deployment.',
    icon: 'lightning-bolt',
    color: '#FBBF24',
    bg: '#FEF3C7',
    unlockedAt: 'Top 5%',
  },
  {
    id: 's4',
    title: 'Night Owl',
    desc: 'Verified 3 urban drops between 10:00 PM and 4:00 AM.',
    icon: 'weather-night',
    color: '#10B981',
    bg: '#E6FBF2',
    unlockedAt: 'Master Rank',
  },
];

const CREATOR_BADGES: BadgeItem[] = [
  {
    id: 'c1',
    title: 'Generous Patron',
    desc: 'Funded and successfully paid out your first $50 to local scouts.',
    icon: 'hand-coin-outline',
    color: '#D97706',
    bg: '#FEF3C7',
    unlockedAt: 'Completed',
  },
  {
    id: 'c2',
    title: 'Flash Payer',
    desc: 'Zero escrow disputes with 100% instant auto-approval rating.',
    icon: 'lightning-bolt-circle',
    color: '#10B981',
    bg: '#E6FBF2',
    unlockedAt: 'Top Host',
  },
  {
    id: 'c3',
    title: 'Neighborhood Anchor',
    desc: 'Created recurring verification quests for local cafes & community spots.',
    icon: 'store-check-outline',
    color: '#6366F1',
    bg: '#EEF2FF',
    unlockedAt: 'Level 2 Hub',
  },
  {
    id: 'c4',
    title: 'High-Roller Drop',
    desc: 'Deployed high-priority bounty with single reward exceeding $15+.',
    icon: 'crown-outline',
    color: '#EC4899',
    bg: '#FDF2F8',
    unlockedAt: 'VIP Host',
  },
];

const isValidSolanaAddress = (address: string): boolean => {
  try {
    const trimmed = address.trim();
    if (!trimmed) return false;
    const pubkey = new PublicKey(trimmed);
    return PublicKey.isOnCurve(pubkey.toBuffer());
  } catch {
    return false;
  }
};

export default function ProfileScreen() {
  const router = useRouter();
  const {
  balance: contextBalance,
  xp,
  level,
  tasksCompleted,
  role,
  setRole,
  transactions,
  refreshUserData,
  logout,
} = useUser();

// Локальний баланс, щоб екран моментально реагував на кліки
  const [localBalance, setLocalBalance] = useState<number | null>(null);
  const balance = localBalance !== null ? localBalance : contextBalance;
  
  // Локальні транзакції для миттєвого відображення в лозі
  const [localTxs, setLocalTxs] = useState<any[]>([]);
  const allTransactions = [...localTxs, ...(transactions || [])];

  const { bounties } = useBounties();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);

  const [name, setName] = useState('Scout Explorer');
  const [username, setUsername] = useState('@scout');
  const [bio, setBio] = useState('Active Urban Scout & City Spotter');
  const [avatarKey, setAvatarKey] = useState('raccoon');

  // Real DB Stats
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dbStats, setDbStats] = useState({
    scoutApprovedCount: 0,
    scoutPendingCount: 0,
    creatorActiveCount: 0,
    creatorResolvedCount: 0,
  });

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [tempUsername, setTempUsername] = useState(username);
  const [tempBio, setTempBio] = useState(bio);
  const [tempAvatarKey, setTempAvatarKey] = useState(avatarKey);

  const [isRanksModalOpen, setIsRanksModalOpen] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);

  // Cashout / Deposit State
  const [isCashoutModalOpen, setIsCashoutModalOpen] = useState(false);
  const [customRecipient, setCustomRecipient] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const isCreator = role === 'creator';
  const currentBadges = isCreator ? CREATOR_BADGES : SCOUT_BADGES;

  const isAddressValid = isValidSolanaAddress(customRecipient);

  // Ініціалізація профілю та адреси
  useEffect(() => {
    (async () => {
      try {
        const uid = await getOrCreateScoutId();
        if (uid) {
          setCurrentUserId(uid);
          const savedName = await AsyncStorage.getItem(`@profile_name_${uid}`);
          const savedUsername = await AsyncStorage.getItem(`@profile_username_${uid}`);
          const savedBio = await AsyncStorage.getItem(`@profile_bio_${uid}`);
          const savedAvatar = await AsyncStorage.getItem(`@profile_avatar_key_${uid}`);

          if (savedName) setName(savedName);
          if (savedUsername) setUsername(savedUsername);
          if (savedBio) setBio(savedBio);
          if (savedAvatar && SCOUT_AVATARS[savedAvatar]) setAvatarKey(savedAvatar);
        }

        let storedSol = await AsyncStorage.getItem('@bountylens_solana_pubkey');
        if (!storedSol) {
          const kp = Keypair.generate();
          storedSol = kp.publicKey.toBase58();
          await AsyncStorage.setItem('@bountylens_solana_pubkey', storedSol);
        }
        setSolanaAddress(storedSol);
        setCustomRecipient(storedSol);
      } catch (err) {
        console.warn('Profile load error:', err);
      }
    })();
  }, []);

  const loadRealStats = async () => {
    try {
      const uid = await getOrCreateScoutId();
      if (!uid) return;

      const { data: scoutSubs } = await supabase
        .from('submissions')
        .select('id, status')
        .eq('scout_id', uid);

      const approved = scoutSubs?.filter((s) => s.status === 'approved')?.length || 0;
      const pending = scoutSubs?.filter((s) => s.status === 'pending')?.length || 0;

      const { data: creatorBounties } = await supabase
        .from('bounties')
        .select('id, status, creator')
        .or(`creator_id.eq.${uid},creator.eq.@you,creator.eq.${username}`);

      const cActive = creatorBounties?.filter((b) => b.status === 'active' || b.status === 'in_review')?.length || 0;
      const cResolved = creatorBounties?.filter((b) => b.status === 'completed')?.length || 0;

      setDbStats({
        scoutApprovedCount: approved,
        scoutPendingCount: pending,
        creatorActiveCount: cActive,
        creatorResolvedCount: cResolved,
      });
    } catch (err) {
      console.warn('Stats fetch error:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadRealStats();
      refreshUserData();
    }, [isCreator, username])
  );

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    await loadRealStats();
    await refreshUserData();
    setIsRefreshing(false);
  };

  const handleRoleToggle = async (newRole: UserRole) => {
    if (role === newRole) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setRole(newRole);
  };

  const handleSaveProfile = async () => {
    if (!tempName.trim()) {
      Alert.alert('Invalid Name', 'Name cannot be empty.');
      return;
    }
    const cleanUsername = tempUsername.startsWith('@') ? tempUsername : `@${tempUsername}`;
    setName(tempName.trim());
    setUsername(cleanUsername.trim());
    setBio(tempBio.trim());
    setAvatarKey(tempAvatarKey);

    if (currentUserId) {
      await AsyncStorage.setItem(`@profile_name_${currentUserId}`, tempName.trim());
      await AsyncStorage.setItem(`@profile_username_${currentUserId}`, cleanUsername.trim());
      await AsyncStorage.setItem(`@profile_bio_${currentUserId}`, tempBio.trim());
      await AsyncStorage.setItem(`@profile_avatar_key_${currentUserId}`, tempAvatarKey);
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsEditModalOpen(false);
  };

  const handleSolanaSettlement = async (isDeposit: boolean) => {
    if (!isAddressValid) {
      Alert.alert('Invalid Address', 'Please provide a valid Solana address.');
      return;
    }

    const amountNum = parseFloat(depositAmount) || 25.0;

    setIsProcessing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await AsyncStorage.setItem('@bountylens_solana_pubkey', customRecipient.trim());

      const shortAddr = `${customRecipient.slice(0, 4)}...${customRecipient.slice(-4)}`;

      if (isDeposit) {
        try {
          await supabase.rpc('claim_starter_points');
        } catch (_) {}

        // Додаємо запис поповнення в лог
        const newTx = {
          id: `tx_${Date.now()}`,
          title: `Solana Top Up (${shortAddr})`,
          amount: amountNum,
          type: 'earned',
          timestamp: new Date().toISOString(),
          place: 'Solana Devnet Pool',
        };
        setLocalTxs((prev) => [newTx, ...prev]);

        setLocalBalance((prev) => (prev !== null ? prev : balance) + amountNum);
        setDepositAmount('');

        Alert.alert(
          'Top Up Success',
          `$${amountNum.toFixed(2)} deposited from ${customRecipient.slice(0, 6)}...${customRecipient.slice(-6)}`
        );
      } else {
        const cashoutSum = balance;

        // Додаємо запис виведення в лог
        const newTx = {
          id: `tx_${Date.now()}`,
          title: `Solana Cash Out (${shortAddr})`,
          amount: cashoutSum,
          type: 'payout',
          timestamp: new Date().toISOString(),
          place: 'Instant Settlement',
        };
        setLocalTxs((prev) => [newTx, ...prev]);

        setLocalBalance(0);

        Alert.alert(
          'Cash Out Success',
          `$${cashoutSum.toFixed(2)} sent to ${customRecipient.slice(0, 6)}...${customRecipient.slice(-6)}`
        );
      }

      setIsCashoutModalOpen(false);
      refreshUserData();
    } catch (err: any) {
      Alert.alert('Transaction Error', err.message || 'Failed to process settlement.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account, earned bounties, and personal data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Permanently Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingAccount(true);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

              const { error } = await supabase.rpc('delete_user_account');
              if (error) throw error;

              if (currentUserId) {
                await AsyncStorage.removeItem(`@profile_name_${currentUserId}`);
                await AsyncStorage.removeItem(`@profile_username_${currentUserId}`);
                await AsyncStorage.removeItem(`@profile_bio_${currentUserId}`);
                await AsyncStorage.removeItem(`@profile_avatar_key_${currentUserId}`);
              }

              await logout();
              Alert.alert('Account Deleted', 'Your account has been removed.');
              router.replace('/onboarding');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not delete account.');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const displayCleared = dbStats.scoutApprovedCount || tasksCompleted || 0;
  const displayPending = dbStats.scoutPendingCount;
  const displayPosted = dbStats.creatorActiveCount || bounties.filter(b => (b as any).creator_id === currentUserId || b.creator === username).length;
  const displayResolved = dbStats.creatorResolvedCount;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isCreator ? 'Creator Hub' : 'Scout Profile'}
        </Text>
        <TouchableOpacity
          style={[styles.editProfileBtn, isCreator && styles.editProfileBtnCreator]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTempName(name);
            setTempUsername(username);
            setTempBio(bio);
            setTempAvatarKey(avatarKey);
            setIsEditModalOpen(true);
          }}
        >
          <Ionicons name="pencil" size={15} color={isCreator ? '#D97706' : '#006C49'} />
          <Text style={[styles.editProfileBtnText, isCreator && { color: '#D97706' }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handlePullRefresh} tintColor={isCreator ? '#D97706' : '#006C49'} />
        }
      >
        {/* User Card */}
        <View style={[styles.userCard, isCreator && styles.userCardCreator]}>
          <View style={styles.avatarContainer}>
            <Image
              source={SCOUT_AVATARS[avatarKey] || SCOUT_AVATARS.raccoon}
              style={[styles.avatarImage, isCreator && styles.avatarImageCreator]}
            />
            {isCreator ? (
              <View style={styles.creatorCrownBadge}>
                <MaterialCommunityIcons name="crown" size={11} color="#FFFFFF" />
              </View>
            ) : (
              <View style={styles.statusDot} />
            )}
          </View>

          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{name}</Text>
              {isCreator && (
                <View style={styles.hostBadge}>
                  <Text style={styles.hostBadgeText}>HOST</Text>
                </View>
              )}
            </View>
            <Text style={[styles.userHandle, isCreator && { color: '#D97706' }]}>{username}</Text>
            <Text style={styles.userBio}>{bio}</Text>
          </View>
        </View>

        {/* Role Switcher */}
        <View style={styles.roleSwitchContainer}>
          <TouchableOpacity
            style={[styles.roleSwitchBtn, !isCreator && styles.roleSwitchBtnActiveScout]}
            activeOpacity={0.85}
            onPress={() => handleRoleToggle('scout')}
          >
            <MaterialCommunityIcons
              name="compass-outline"
              size={18}
              color={!isCreator ? '#FFFFFF' : '#6C7A71'}
            />
            <Text style={[styles.roleSwitchText, !isCreator && styles.roleSwitchTextActive]}>
              Scout Mode
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleSwitchBtn, isCreator && styles.roleSwitchBtnActiveCreator]}
            activeOpacity={0.85}
            onPress={() => handleRoleToggle('creator')}
          >
            <MaterialCommunityIcons
              name="bullhorn-outline"
              size={18}
              color={isCreator ? '#FFFFFF' : '#6C7A71'}
            />
            <Text style={[styles.roleSwitchText, isCreator && styles.roleSwitchTextActive]}>
              Creator Mode
            </Text>
          </TouchableOpacity>
        </View>

        {/* Level & XP Card */}
        {!isCreator ? (
          <TouchableOpacity
            style={styles.levelCard}
            activeOpacity={0.88}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsRanksModalOpen(true);
            }}
          >
            <View style={styles.levelCardTop}>
              <View style={styles.levelBadge}>
                <MaterialCommunityIcons name="shield-star" size={20} color="#006C49" />
                <Text style={styles.levelBadgeText}>LEVEL {level || 1} SCOUT</Text>
              </View>
              <View style={styles.viewPerksBtn}>
                <Text style={styles.viewPerksText}>Ranks & Perks</Text>
                <Ionicons name="chevron-forward" size={14} color="#006C49" />
              </View>
            </View>

            <View style={styles.xpRow}>
              <Text style={styles.xpLabel}>CURRENT XP: {xp || 0}</Text>
              <Text style={styles.xpNext}>NEXT RANK AT {level * 200} XP</Text>
            </View>

            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(100, (((xp || 0) % 200) / 200) * 100)}%` },
                ]}
              />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.creatorPerkCard}>
            <View style={styles.creatorPerkHeader}>
              <MaterialCommunityIcons name="crown-circle" size={22} color="#D97706" />
              <Text style={styles.creatorPerkTitle}>Gold Verified Venue Hub</Text>
            </View>
            <Text style={styles.creatorPerkSub}>
              Instant camera verification active. Deployed bounties appear on local scout radars within seconds.
            </Text>
          </View>
        )}

        {/* Real Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statBox, isCreator ? styles.statBoxWalletCreator : styles.statBoxWallet]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsCashoutModalOpen(true);
            }}
          >
            <View style={styles.walletHeaderPill}>
              <View style={styles.solanaDot} />
              <Text style={styles.statLabel}>{isCreator ? 'SOL BALANCE' : 'SOL WALLET'}</Text>
            </View>
            <Text style={[styles.statValue, { color: isCreator ? '#D97706' : '#006C49' }]}>
              ${balance.toFixed(2)}
            </Text>
            <View style={[styles.cashoutPill, isCreator && { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.cashoutPillText, isCreator && { color: '#B45309' }]}>
                {isCreator ? 'Top Up ➔' : 'Cash Out ➔'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{isCreator ? 'ACTIVE' : 'CLEARED'}</Text>
            <Text style={[styles.statValue, { color: !isCreator && displayCleared > 0 ? '#006C49' : '#1A1B22' }]}>
              {isCreator ? displayPosted : displayCleared}
            </Text>
            <Text style={styles.statSub}>{isCreator ? 'Drops' : 'Approved'}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{isCreator ? 'RESOLVED' : 'REVIEW'}</Text>
            <Text style={[styles.statValue, { color: displayPending > 0 && !isCreator ? '#EF4444' : isCreator && displayResolved > 0 ? '#D97706' : '#1A1B22' }]}>
              {isCreator ? displayResolved : displayPending}
            </Text>
            <Text style={styles.statSub}>{isCreator ? 'Completed' : 'Pending'}</Text>
          </View>
        </View>

        {/* Transaction Log */}
        <View style={styles.txSectionHeader}>
          <Text style={styles.sectionTitle}>TRANSACTION LOG (SOLANA DEVNET)</Text>
          <TouchableOpacity onPress={() => handlePullRefresh()}>
            <Ionicons name="refresh" size={16} color="#6C7A71" />
          </TouchableOpacity>
        </View>

        <View style={styles.txContainer}>
          {allTransactions && allTransactions.length > 0 ? (
            allTransactions.slice(0, 5).map((t) => {
              const isIncome = t.type === 'earned';
              const dateStr = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <View key={t.id} style={styles.txRow}>
                  <View
                    style={[
                      styles.txIconWrap,
                      isIncome ? styles.txIconWrapEarn : styles.txIconWrapPayout,
                    ]}
                  >
                    <Ionicons
                      name={isIncome ? 'arrow-down-circle' : 'arrow-up-circle'}
                      size={20}
                      color={isIncome ? '#006C49' : '#DC2626'}
                    />
                  </View>
                  <View style={styles.txInfo}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.txTime} numberOfLines={1}>
                      {dateStr} • {t.place || 'Solana Settlement'}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, isIncome ? styles.txAmountEarn : styles.txAmountPayout]}>
                    {isIncome ? '+' : '-'}${t.amount.toFixed(2)}
                  </Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyTxText}>No on-chain transactions yet.</Text>
          )}
        </View>

        {/* Badges */}
        <Text style={styles.sectionTitle}>
          {isCreator ? 'CREATOR MILESTONES' : 'UNLOCKED BADGES'}
        </Text>
        <View style={styles.badgesGrid}>
          {currentBadges.map((badge) => (
            <TouchableOpacity
              key={badge.id}
              style={styles.badgeItem}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedBadge(badge);
              }}
            >
              <View style={[styles.badgeIconWrap, { backgroundColor: badge.bg }]}>
                <MaterialCommunityIcons name={badge.icon as any} size={28} color={badge.color} />
              </View>
              <Text style={styles.badgeTitle}>{badge.title}</Text>
              <Text style={styles.badgeStatusText}>{badge.unlockedAt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Settings & Account Actions */}
        <View style={styles.accountActionSection}>
          <TouchableOpacity
            style={styles.logoutBtn}
            activeOpacity={0.85}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={18} color="#1A1B22" />
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteAccountBtn}
            activeOpacity={0.85}
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
          >
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={17} color="#DC2626" />
                <Text style={styles.deleteAccountBtnText}>Delete Account & Data</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Cashout / Top Up Modal */}
      <Modal visible={isCashoutModalOpen} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ width: '100%' }}
            >
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {isCreator ? 'Top Up' : 'Cash Out'}
                  </Text>
                  <TouchableOpacity onPress={() => setIsCashoutModalOpen(false)}>
                    <Ionicons name="close" size={24} color="#1A1B22" />
                  </TouchableOpacity>
                </View>

                <View style={styles.withdrawSumBox}>
                  <Text style={styles.withdrawSumLabel}>
                    {isCreator ? 'COMMITTED BALANCE' : 'AVAILABLE REWARDS'}
                  </Text>
                  <Text
                    style={[
                      styles.withdrawSumAmount,
                      isCreator && { color: '#D97706' },
                    ]}
                  >
                    ${balance.toFixed(2)} USD
                  </Text>

                  {customRecipient.trim().length > 0 ? (
                    isAddressValid ? (
                      <Text style={styles.solanaAddressSub}>
                        {customRecipient.slice(0, 8)}...{customRecipient.slice(-8)}
                      </Text>
                    ) : (
                      <Text style={styles.invalidAddressText}>
                        Invalid Solana address
                      </Text>
                    )
                  ) : (
                    <Text style={styles.solanaAddressSubPlaceholder}>
                      Enter wallet address below
                    </Text>
                  )}
                </View>

                {isCreator ? (
                  <>
                    <View style={styles.labelRow}>
                      <Text style={styles.inputLabel}>AMOUNT (USD)</Text>
                      {/* Швидкі чіпи вибору сум */}
                      <View style={styles.quickChipsRow}>
                        {['10', '25', '50'].map((chip) => (
                          <TouchableOpacity
                            key={chip}
                            style={[
                              styles.chipBtn,
                              depositAmount === chip && styles.chipBtnActive,
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setDepositAmount(chip);
                            }}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                depositAmount === chip && styles.chipTextActive,
                              ]}
                            >
                              +${chip}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <TextInput
                      style={styles.textInput}
                      value={depositAmount}
                      onChangeText={setDepositAmount}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />

                    <Text style={styles.inputLabel}>SOLANA WALLET</Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        customRecipient.trim().length > 0 && !isAddressValid && styles.textInputError,
                      ]}
                      value={customRecipient}
                      onChangeText={(val) => {
                        setCustomRecipient(val);
                        if (isValidSolanaAddress(val)) {
                          setSolanaAddress(val);
                        }
                      }}
                      placeholder="Enter Solana Address..."
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.inputLabel}>SOLANA WALLET</Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        customRecipient.trim().length > 0 && !isAddressValid && styles.textInputError,
                      ]}
                      value={customRecipient}
                      onChangeText={(val) => {
                        setCustomRecipient(val);
                        if (isValidSolanaAddress(val)) {
                          setSolanaAddress(val);
                        }
                      }}
                      placeholder="Enter Solana Address..."
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </>
                )}

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    isCreator && { backgroundColor: '#F59E0B', borderBottomColor: '#D97706' },
                    ((isCreator && (!depositAmount || parseFloat(depositAmount) <= 0)) ||
                      (!isCreator && balance <= 0) ||
                      !isAddressValid) && styles.btnDisabled,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    Keyboard.dismiss();
                    handleSolanaSettlement(isCreator);
                  }}
                  disabled={
                    isProcessing ||
                    (isCreator && (!depositAmount || parseFloat(depositAmount) <= 0)) ||
                    (!isCreator && balance <= 0) ||
                    !isAddressValid
                  }
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {isCreator ? 'Confirm Top Up' : 'Confirm Cash Out'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
                <Ionicons name="close" size={24} color="#1A1B22" />
              </TouchableOpacity>
            </View>

            <View style={styles.bigPreviewBox}>
              <View
                style={[
                  styles.bigPreviewWrap,
                  isCreator && { borderColor: '#D97706' },
                ]}
              >
                <Image
                  source={SCOUT_AVATARS[tempAvatarKey] || SCOUT_AVATARS.raccoon}
                  style={styles.bigPreviewImg}
                />
              </View>
              <Text style={styles.bigPreviewLabel}>
                {isCreator ? 'Gold Host Preview' : 'Scout Preview'}
              </Text>
            </View>

            <Text style={styles.inputLabel}>CHOOSE YOUR 3D AVATAR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarPickerRow}>
              {AVATAR_LIST.map((item) => {
                const isSelected = tempAvatarKey === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.avatarOption,
                      isSelected && (isCreator ? styles.avatarOptionSelectedCreator : styles.avatarOptionSelected),
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTempAvatarKey(item.id);
                    }}
                  >
                    <Image source={SCOUT_AVATARS[item.id]} style={styles.avatarOptionImg} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.inputLabel}>FULL NAME</Text>
            <TextInput style={styles.textInput} value={tempName} onChangeText={setTempName} placeholder="Name" />

            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput style={styles.textInput} value={tempUsername} onChangeText={setTempUsername} placeholder="@handle" autoCapitalize="none" />

            <Text style={styles.inputLabel}>STATUS BIO</Text>
            <TextInput style={styles.textInput} value={tempBio} onChangeText={setTempBio} placeholder="Short bio" />

            <TouchableOpacity
              style={[
                styles.saveBtn,
                isCreator && { backgroundColor: '#F59E0B', borderBottomColor: '#D97706' },
              ]}
              activeOpacity={0.85}
              onPress={handleSaveProfile}
            >
              <Text style={styles.saveBtnText}>Save Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Ranks Modal */}
      <Modal visible={isRanksModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.ranksContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scout Levels & Perks</Text>
              <TouchableOpacity onPress={() => setIsRanksModalOpen(false)}>
                <Ionicons name="close" size={24} color="#1A1B22" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {SCOUT_RANKS.map((rk) => {
                const isCurrent = rk.level === (level || 1);
                const isUnlocked = rk.level <= (level || 1);

                return (
                  <View key={rk.level} style={[styles.rankCard, isCurrent && styles.rankCardActive]}>
                    <View style={styles.rankCardTop}>
                      <View style={styles.rankLabelWrap}>
                        <View style={[styles.rankIconCircle, isCurrent && styles.rankIconCircleActive]}>
                          <MaterialCommunityIcons
                            name={rk.icon as any}
                            size={20}
                            color={isCurrent ? '#FFFFFF' : '#006C49'}
                          />
                        </View>
                        <View>
                          <Text style={styles.rankName}>{rk.name}</Text>
                          <Text style={styles.rankXp}>{rk.xpNeeded}</Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.rankStatusBadge,
                          isCurrent
                            ? styles.rankStatusCurrent
                            : isUnlocked
                            ? styles.rankStatusUnlocked
                            : styles.rankStatusLocked,
                        ]}
                      >
                        <Text
                          style={[
                            styles.rankStatusText,
                            isCurrent && { color: '#FFFFFF' },
                            isUnlocked && !isCurrent && { color: '#006C49' },
                          ]}
                        >
                          {isCurrent ? 'ACTIVE' : isUnlocked ? 'CLEARED' : 'LOCKED'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rankPerkText}>{rk.perk}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Badge Modal */}
      <Modal visible={!!selectedBadge} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.badgeModalBox}>
            <View style={[styles.badgeModalIcon, { backgroundColor: selectedBadge?.bg }]}>
              <MaterialCommunityIcons
                name={(selectedBadge?.icon || 'star') as any}
                size={44}
                color={selectedBadge?.color}
              />
            </View>
            <Text style={styles.badgeModalTitle}>{selectedBadge?.title}</Text>
            <Text style={styles.badgeModalDesc}>{selectedBadge?.desc}</Text>
            <Text style={styles.badgeModalStatusText}>Status: {selectedBadge?.unlockedAt}</Text>
            <TouchableOpacity
              style={[
                styles.badgeCloseBtn,
                isCreator && { backgroundColor: '#F59E0B', borderBottomColor: '#D97706' },
              ]}
              onPress={() => setSelectedBadge(null)}
            >
              <Text style={styles.badgeCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <BottomNav activeTab="you" />
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
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1B22',
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  editProfileBtnCreator: {
    backgroundColor: '#FEF3C7',
  },
  editProfileBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#006C49',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  userCardCreator: {
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F4F2FD',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarImageCreator: {
    borderColor: '#D97706',
    borderWidth: 3,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  creatorCrownBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D97706',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    position: 'absolute',
    bottom: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1B22',
  },
  hostBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  hostBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#B45309',
  },
  userHandle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#006C49',
  },
  userBio: {
    fontSize: 12,
    color: '#6C7A71',
    marginTop: 2,
  },
  roleSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: '#F4F2FD',
    padding: 4,
    borderRadius: 18,
    gap: 4,
  },
  roleSwitchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },
  roleSwitchBtnActiveScout: {
    backgroundColor: '#006C49',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  roleSwitchBtnActiveCreator: {
    backgroundColor: '#D97706',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  roleSwitchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C7A71',
  },
  roleSwitchTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  levelCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
    gap: 10,
  },
  levelCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#006C49',
  },
  viewPerksBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewPerksText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#006C49',
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  xpLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1A1B22',
  },
  xpNext: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6C7A71',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#F4F2FD',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#006C49',
    borderRadius: 4,
  },
  creatorPerkCard: {
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    gap: 6,
  },
  creatorPerkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creatorPerkTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B45309',
  },
  creatorPerkSub: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    minHeight: 92,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  statBoxWallet: {
    borderWidth: 1.5,
    borderColor: '#10B981',
    backgroundColor: '#FAFFFD',
  },
  statBoxWalletCreator: {
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    backgroundColor: '#FFFDF9',
  },
  walletHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  solanaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  cashoutPill: {
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cashoutPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006C49',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6C7A71',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1B22',
  },
  statSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6C7A71',
  },
  txSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  txContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    padding: 12,
    gap: 10,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  txIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconWrapEarn: {
    backgroundColor: '#E6FBF2',
  },
  txIconWrapPayout: {
    backgroundColor: '#FEE2E2',
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1B22',
  },
  txTime: {
    fontSize: 11,
    color: '#6C7A71',
    marginTop: 1,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '900',
  },
  txAmountEarn: {
    color: '#006C49',
  },
  txAmountPayout: {
    color: '#DC2626',
  },
  emptyTxText: {
    fontSize: 12,
    color: '#6C7A71',
    textAlign: 'center',
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6C7A71',
    letterSpacing: 0.8,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeItem: {
    flexBasis: '48%',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    gap: 6,
  },
  badgeIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1B22',
  },
  badgeStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6C7A71',
  },
  accountActionSection: {
    gap: 10,
    marginTop: 8,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F4F2FD',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8E7F1',
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1B22',
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  deleteAccountBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    gap: 10,
  },
  ranksContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '80%',
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1B22',
  },
  withdrawSumBox: {
    backgroundColor: '#F4F2FD',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
  },
  withdrawSumLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6C7A71',
  },
  withdrawSumAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#006C49',
    marginTop: 2,
  },
  solanaAddressSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6C7A71',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  invalidAddressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 4,
  },
  solanaAddressSubPlaceholder: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A0AAB0',
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6C7A71',
    marginTop: 4,
  },
  bigPreviewBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    gap: 4,
  },
  bigPreviewWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F4F2FD',
    padding: 4,
    borderWidth: 3,
    borderColor: '#006C49',
  },
  bigPreviewImg: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
  },
  bigPreviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6C7A71',
  },
  avatarPickerRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 4,
    paddingVertical: 4,
  },
  avatarOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    borderWidth: 2,
    borderColor: '#E8E7F1',
    backgroundColor: '#FFFFFF',
  },
  avatarOptionSelected: {
    borderColor: '#006C49',
    transform: [{ scale: 1.08 }],
  },
  avatarOptionSelectedCreator: {
    borderColor: '#D97706',
    borderWidth: 3,
    transform: [{ scale: 1.08 }],
  },
  avatarOptionImg: {
    width: '100%',
    height: '100%',
    borderRadius: 27,
  },
  textInput: {
    backgroundColor: '#F4F2FD',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    color: '#1A1B22',
  },
  textInputError: {
    borderColor: '#EF4444',
  },
  saveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
    borderBottomWidth: 4,
    borderBottomColor: '#059669',
  },
  btnDisabled: {
    backgroundColor: '#CBD5E1',
    borderBottomColor: '#94A3B8',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  rankCard: {
    backgroundColor: '#F4F2FD',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    marginBottom: 10,
    gap: 8,
  },
  rankCardActive: {
    borderColor: '#006C49',
    backgroundColor: '#E6FBF2',
  },
  rankCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rankLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankIconCircleActive: {
    backgroundColor: '#006C49',
  },
  rankName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1B22',
  },
  rankXp: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6C7A71',
  },
  rankStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  rankStatusCurrent: {
    backgroundColor: '#006C49',
  },
  rankStatusUnlocked: {
    backgroundColor: '#E6FBF2',
  },
  rankStatusLocked: {
    backgroundColor: '#E8E8F1',
  },
  rankStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6C7A71',
  },
  rankPerkText: {
    fontSize: 12,
    color: '#3C4A42',
    lineHeight: 16,
  },
  badgeModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 28,
    marginBottom: 'auto',
    marginTop: 'auto',
    alignItems: 'center',
    gap: 10,
  },
  badgeModalIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1B22',
  },
  badgeModalDesc: {
    fontSize: 13,
    color: '#6C7A71',
    textAlign: 'center',
    lineHeight: 18,
  },
  badgeModalStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C7A71',
  },
  badgeCloseBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 9999,
    marginTop: 6,
    borderBottomWidth: 3,
    borderBottomColor: '#059669',
  },
  badgeCloseBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chipBtn: {
    backgroundColor: '#F4F2FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  chipBtnActive: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6C7A71',
  },
  chipTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
});