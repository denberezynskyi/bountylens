import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useBounties } from '../context/BountiesContext';
import { useUser } from '../context/UserContext';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  { id: 'coffee', label: 'Coffee / Cafe', icon: 'coffee' },
  { id: 'store', label: 'Shop / Queue', icon: 'storefront-outline' },
  { id: 'parking', label: 'Parking / EV', icon: 'car-electric' },
  { id: 'landmark', label: 'City Spot', icon: 'castle' },
] as const;

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function CreateBountyScreen() {
  const router = useRouter();
  const { fetchBounties } = useBounties();
  const { balance, refreshUserData } = useUser();

  const [currentUserHandle, setCurrentUserHandle] = useState<string>('@host');

  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [reward, setReward] = useState('5.00');
  const [customReward, setCustomReward] = useState('');
  const [category, setCategory] = useState<'coffee' | 'store' | 'parking' | 'landmark'>('coffee');
  const [duration, setDuration] = useState(30);
  const [isDeploying, setIsDeploying] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (uid) {
          const savedHandle = await AsyncStorage.getItem(`@profile_username_${uid}`);
          setCurrentUserHandle(savedHandle || '@host');
        }
      } catch (err) {
        console.warn('Failed to load user in CreateBountyScreen:', err);
      }
    })();
  }, []);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    if (place.trim().length < 3 || targetCoords !== null) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingPlaces(true);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          place
        )}&addressdetails=1&limit=5&accept-language=en`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'BountyLens/1.0 (contact@bountylens.app)',
          },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setSuggestions(data);
        }
      } catch (err) {
        console.warn('Geocoding error:', err);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [place, targetCoords]);

  const handleUseCurrentLocation = async () => {
    try {
      setIsLocating(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant location access to use your current spot.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const readableAddress = address
        ? `${address.street || 'Current Spot'} ${address.streetNumber || ''}, ${address.city || ''}`
        : 'My Current Location';

      setPlace(readableAddress.trim());
      setTargetCoords({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
      setSuggestions([]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Location Error', 'Unable to retrieve current coordinates.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleSelectSuggestion = (item: Suggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shortName = item.display_name.split(',').slice(0, 3).join(',');
    setPlace(shortName);
    setTargetCoords({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    });
    setSuggestions([]);
  };

  const currentRewardNum = parseFloat(customReward.trim() ? customReward : reward) || 0;
  const isInsufficientFunds = currentRewardNum > balance;

  const handleDeploy = async () => {
    if (isDeploying) return;

    const rawVal = customReward.trim() ? customReward : reward;
    const rewardNum = parseFloat(rawVal);

    if (!title.trim() || !place.trim()) {
      Alert.alert('Missing Details', 'Please enter a title and location for this bounty.');
      return;
    }

    // ЖОРСТКА ПЕРЕВІРКА: заборона деплою без обраної локації
    if (!targetCoords) {
      Alert.alert(
        'Location Required',
        'Please select a location from the search suggestions dropdown or tap "My GPS Spot".'
      );
      return;
    }

    if (isNaN(rewardNum) || rewardNum < 1 || rewardNum > 500) {
      Alert.alert('Invalid Reward', 'Bounty reward must be between $1.00 and $500.00 USD.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      Alert.alert('Authentication Required', 'Please log in to post a bounty.');
      return;
    }

    if (rewardNum > balance) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Insufficient Escrow Balance',
        `You need $${rewardNum.toFixed(2)} USD to deploy this bounty, but your escrow wallet only has $${balance.toFixed(2)} USD.\n\nPlease claim welcome credits in your profile first.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Profile',
            onPress: () => {
              handleClose();
              router.push('/profile');
            },
          },
        ]
      );
      return;
    }

    setIsDeploying(true);

    try {
      // Атомарне створення баунті та резервування ескроу через серверний RPC
      const { error: rpcError } = await supabase.rpc('create_bounty_secure', {
        p_title: title.trim(),
        p_place: place.trim(),
        p_address: place.trim(),
        p_category: category,
        p_reward: Math.round(rewardNum * 100) / 100,
        p_xp: Math.round(rewardNum * 10),
        p_latitude: targetCoords.lat,
        p_longitude: targetCoords.lng,
        p_difficulty: rewardNum >= 8 ? 'Medium' : 'Quick',
        p_creator: currentUserHandle,
        p_description: `Target verified check for ${title.trim()}`,
        p_expires_minutes: duration,
      });

      if (rpcError) throw rpcError;

      if (typeof fetchBounties === 'function') {
        await fetchBounties();
      }

      await refreshUserData();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Deployment Error', e.message || 'Could not deploy bounty.');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
          <Ionicons name="close" size={24} color="#1A1B22" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTag}>CREATOR DISPATCH</Text>
          <Text style={styles.headerTitle}>Post City Bounty</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>WHAT DO YOU NEED VERIFIED?</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Check queue size / Coffee line status"
          placeholderTextColor="#94A3B8"
          value={title}
          onChangeText={setTitle}
        />

        {/* Location selector */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>LOCATION / ADDRESS (GLOBAL)</Text>
          <TouchableOpacity
            style={styles.locBadgeBtn}
            onPress={handleUseCurrentLocation}
            disabled={isLocating}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color="#D97706" />
            ) : (
              <>
                <Ionicons name="locate" size={13} color="#D97706" />
                <Text style={styles.locBadgeText}>My GPS Spot</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.input, targetCoords && styles.inputTargetSelected]}
          placeholder="Search any street, venue or city..."
          placeholderTextColor="#94A3B8"
          value={place}
          onChangeText={(text) => {
            setPlace(text);
            setTargetCoords(null);
          }}
        />

        {isSearchingPlaces && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#D97706" />
            <Text style={styles.loadingText}>Searching global places...</Text>
          </View>
        )}

        {/* Suggestion dropdown */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {suggestions.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.sugItem}
                onPress={() => handleSelectSuggestion(item)}
              >
                <Ionicons name="location-outline" size={16} color="#D97706" />
                <Text style={styles.sugText} numberOfLines={2}>
                  {item.display_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.catBtn, category === cat.id && styles.catBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCategory(cat.id as any);
              }}
            >
              <MaterialCommunityIcons
                name={cat.icon as any}
                size={20}
                color={category === cat.id ? '#FFFFFF' : '#D97706'}
              />
              <Text style={[styles.catText, category === cat.id && styles.catTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>REWARD FOR SCOUT (USD)</Text>
        <View style={styles.rewardRow}>
          {['3.00', '5.00', '10.00'].map((preset) => {
            const isSelected = !customReward && reward === preset;
            return (
              <TouchableOpacity
                key={preset}
                style={[styles.presetBtn, isSelected && styles.presetBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReward(preset);
                  setCustomReward('');
                }}
              >
                <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                  ${preset}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TextInput
            style={[styles.customRewardInput, !!customReward && styles.customRewardInputActive]}
            keyboardType="decimal-pad"
            value={customReward}
            onChangeText={(val) => {
              setCustomReward(val);
              if (val) setReward('');
            }}
            placeholder="$ Custom"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <Text style={styles.label}>EXPIRATION TIME</Text>
        <View style={styles.durationRow}>
          {[15, 30, 60].map((mins) => (
            <TouchableOpacity
              key={mins}
              style={[styles.durationBtn, duration === mins && styles.durationBtnActive]}
              onPress={() => setDuration(mins)}
            >
              <Text style={[styles.durationText, duration === mins && styles.durationTextActive]}>
                {mins} mins
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.deployBtn,
            (isInsufficientFunds || !targetCoords) && styles.deployBtnDisabled,
            isDeploying && { opacity: 0.7 },
          ]}
          activeOpacity={0.85}
          onPress={handleDeploy}
          disabled={isDeploying || isInsufficientFunds || !targetCoords}
        >
          {isDeploying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons
                name={!targetCoords ? 'map-marker-alert-outline' : isInsufficientFunds ? 'alert-circle-outline' : 'broadcast'}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.deployBtnText}>
                {!targetCoords
                  ? 'Select Location First'
                  : isInsufficientFunds
                  ? 'Insufficient Escrow Funds'
                  : 'Deploy Live Bounty'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EEF9',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7E5F4',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#1A1B22',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  content: {
    padding: 20,
    gap: 10,
    paddingBottom: 40,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6C7A71',
    letterSpacing: 0.5,
  },
  locBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  locBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#FDE68A',
    color: '#1A1B22',
  },
  inputTargetSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  loadingText: {
    fontSize: 12,
    color: '#6C7A71',
    fontWeight: '600',
  },
  suggestionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    overflow: 'hidden',
    marginTop: -4,
  },
  sugItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F2FD',
  },
  sugText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1B22',
    flex: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  catBtn: {
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  catBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  catText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1B22',
  },
  catTextActive: {
    color: '#FFFFFF',
  },
  rewardRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  presetBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  presetBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  presetText: {
    fontWeight: '800',
    color: '#1A1B22',
  },
  presetTextActive: {
    color: '#FFFFFF',
  },
  customRewardInput: {
    minWidth: 92,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    textAlign: 'center',
    fontWeight: '800',
    borderWidth: 1,
    borderColor: '#FDE68A',
    color: '#1A1B22',
    fontSize: 13,
  },
  customRewardInputActive: {
    borderColor: '#D97706',
    backgroundColor: '#FEF3C7',
    color: '#D97706',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  durationBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  durationText: {
    fontWeight: '700',
    color: '#1A1B22',
  },
  durationTextActive: {
    color: '#FFFFFF',
  },
  deployBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
    borderBottomWidth: 4,
    borderBottomColor: '#D97706',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  deployBtnDisabled: {
    backgroundColor: '#94A3B8',
    borderBottomColor: '#64748B',
    shadowOpacity: 0,
  },
  deployBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});