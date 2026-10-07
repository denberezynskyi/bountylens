import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBounties } from '../../context/BountiesContext';
import { uploadProofImage, supabase } from '../../lib/supabase';

const MAX_VERIFY_DISTANCE_METERS = 200;

function calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const bountyId = Array.isArray(params.id) ? params.id[0] : params.id;

  const { bounties } = useBounties();
  const [bountyData, setBountyData] = useState<any>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [isSelfBounty, setIsSelfBounty] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number; mocked: boolean } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(5);
  const [isCheckingGps, setIsCheckingGps] = useState(true);
  const [gpsBypassed, setGpsBypassed] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);

  // 1. Завантаження даних баунті та перевірка автора
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUid = session?.user?.id;

        let found = bounties.find((b) => String(b.id) === String(bountyId));

        if (!found || !found.creator_id) {
          const { data: dbBounty } = await supabase
            .from('bounties')
            .select('*')
            .eq('id', bountyId)
            .single();

          if (dbBounty) found = dbBounty;
        }

        if (isMounted && found) {
          setBountyData(found);

          const cId = found.creator_id ? String(found.creator_id) : '';
          const isCreatorMatch =
            found.creator === '@you' ||
            (currentUid && cId === String(currentUid));

          if (isCreatorMatch) {
            setIsSelfBounty(true);
          }
        }
      } catch (err) {
        console.warn('Scout verification check failed:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [bountyId, bounties]);

  const activeBounty = bountyData || bounties.find((b) => String(b.id) === String(bountyId));
  const rewardCash = activeBounty ? Number(activeBounty.reward) : 5.0;
  const rewardXP = activeBounty ? activeBounty.xp : 50;

  // 2. Реальний вимір GPS скаута без циклічного ре-рендера
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setIsCheckingGps(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (isMounted) {
            setDistanceMeters(__DEV__ ? 25 : 9999);
            setIsCheckingGps(false);
          }
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!isMounted) return;

        setUserPos({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          mocked: !!(loc as any).mocked,
        });

        if (loc.coords.accuracy) {
          setGpsAccuracy(Math.round(loc.coords.accuracy));
        }

        if (activeBounty?.latitude && activeBounty?.longitude) {
          const dist = calculateDistanceInMeters(
            loc.coords.latitude,
            loc.coords.longitude,
            activeBounty.latitude,
            activeBounty.longitude
          );
          setDistanceMeters(dist);
        } else {
          setDistanceMeters(15);
        }
      } catch (err) {
        if (isMounted) setDistanceMeters(__DEV__ ? 25 : 9999);
      } finally {
        if (isMounted) setIsCheckingGps(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeBounty?.id, activeBounty?.latitude, activeBounty?.longitude]);

  // Заборона зйомки, поки дистанція не розрахована (distanceMeters === null)
  const isTooFar =
    (!gpsBypassed || !__DEV__) &&
    (distanceMeters === null || distanceMeters > MAX_VERIFY_DISTANCE_METERS);

  const handleSnapPhoto = async () => {
    if (isSelfBounty) {
      Alert.alert('Prohibited', 'You cannot verify your own bounty drop.');
      return;
    }
    if (!cameraRef.current || isTakingPhoto || isTooFar) return;

    try {
      setIsTakingPhoto(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setPhotoBase64(photo.base64 || null);
      }
    } catch (error) {
      console.error('Photo capture failed:', error);
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const handleRetake = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhotoUri(null);
    setPhotoBase64(null);
  };

  // 3. Сабміт з реальними координатами скаута
  const handleSubmitReview = async () => {
    if (isSubmitting || !photoUri || !bountyId) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      Alert.alert('Authentication Required', 'Please log in to submit bounty proofs.');
      return;
    }

    if (isSelfBounty) {
      Alert.alert('Action Blocked', 'You cannot submit proof to your own bounty drop.');
      return;
    }

    if (!userPos) {
      Alert.alert('GPS Required', 'Waiting for accurate device location. Please try again.');
      return;
    }

    setIsSubmitting(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      let storagePath: string | null = null;
      if (photoBase64) {
        storagePath = await uploadProofImage(photoBase64, `bounty_${bountyId}`);
      }

      if (!storagePath) {
        throw new Error('Failed to upload proof image to storage. Please try again.');
      }

      // Передаємо РЕАЛЬНІ координати скаута
      const { error: rpcError } = await supabase.rpc('submit_proof_secure', {
        p_bounty_id: bountyId,
        p_media_path: storagePath,
        p_latitude: userPos.lat,
        p_longitude: userPos.lng,
        p_accuracy_m: gpsAccuracy,
        p_is_mocked: userPos.mocked,
      });

      if (rpcError) throw rpcError;

      try {
        const stored = await AsyncStorage.getItem('bountylens_sent_submissions');
        const sentList: string[] = stored ? JSON.parse(stored) : [];
        if (!sentList.includes(String(bountyId))) {
          sentList.push(String(bountyId));
          await AsyncStorage.setItem('bountylens_sent_submissions', JSON.stringify(sentList));
        }
      } catch (cacheErr) {
        console.warn('Storage cache error:', cacheErr);
      }

      router.replace({
        pathname: '/',
        params: { submittedId: String(bountyId) },
      });
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Submission Error', e.message || 'Failed to submit proof.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#10B981" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <MaterialCommunityIcons name="camera-off" size={64} color="#94A3B8" />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTag}>PROOF SUBMISSION</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activeBounty ? activeBounty.title : 'Bounty Spot'}
          </Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      {isSelfBounty ? (
        <View style={styles.selfBountyBanner}>
          <Ionicons name="shield-half" size={18} color="#92400E" />
          <Text style={styles.selfBountyText}>
            You created this drop. Hosts cannot submit proofs to their own bounties.
          </Text>
        </View>
      ) : (
        <View style={styles.gpsBanner}>
          {isCheckingGps ? (
            <View style={styles.gpsRow}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.gpsText}>Acquiring GPS location...</Text>
            </View>
          ) : isTooFar ? (
            <TouchableOpacity
              style={[styles.gpsRow, styles.gpsRowError]}
              activeOpacity={0.8}
              onPress={() => {
                if (__DEV__) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGpsBypassed(true);
                }
              }}
            >
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={styles.gpsTextError}>
                TOO FAR: {distanceMeters && distanceMeters > 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${distanceMeters ?? '---'} m`} away {__DEV__ ? '(Dev Bypass)' : ''}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.gpsRow, styles.gpsRowSuccess]}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.gpsTextSuccess}>
                In Zone ({distanceMeters ?? 15}m away) • Ready to shoot
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.cameraBox}>
        {photoUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: photoUri }} style={styles.previewImage} />
          </View>
        ) : (
          <CameraView ref={cameraRef} style={styles.cameraView} facing="back">
            {isSelfBounty ? (
              <View style={styles.lockOverlay}>
                <Ionicons name="hand-left" size={48} color="#F59E0B" />
                <Text style={[styles.lockTitle, { color: '#FBBF24' }]}>Host Drop Locked</Text>
                <Text style={styles.lockSub}>
                  This is your own active bounty. Scouts will submit live verification photos here.
                </Text>
              </View>
            ) : isTooFar ? (
              <View style={styles.lockOverlay}>
                <Ionicons name="lock-closed" size={44} color="#EF4444" />
                <Text style={styles.lockTitle}>Location Locked</Text>
                <Text style={styles.lockSub}>
                  Move closer than {MAX_VERIFY_DISTANCE_METERS}m to the bounty location.
                </Text>
                {__DEV__ && (
                  <TouchableOpacity
                    style={styles.bypassBtn}
                    onPress={() => setGpsBypassed(true)}
                  >
                    <Text style={styles.bypassBtnText}>Simulate On-Site GPS (DEV)</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                <Text style={styles.viewfinderText}>Align target scene in frame</Text>
              </View>
            )}
          </CameraView>
        )}
      </View>

      <View style={styles.rewardCard}>
        <View>
          <Text style={styles.rewardLabel}>REWARD UPON APPROVAL</Text>
          <Text style={styles.rewardAmount}>+${rewardCash.toFixed(2)} USD</Text>
        </View>
        <View style={styles.xpBadge}>
          <Text style={styles.xpBadgeText}>+{rewardXP} XP</Text>
        </View>
      </View>

      <View style={styles.bottomActions}>
        {!photoUri ? (
          <TouchableOpacity
            style={[styles.shutterBtn, (isTooFar || isSelfBounty || distanceMeters === null) && styles.shutterDisabled]}
            activeOpacity={0.8}
            onPress={handleSnapPhoto}
            disabled={isTakingPhoto || isTooFar || isCheckingGps || isSelfBounty || distanceMeters === null}
          >
            {isTakingPhoto ? (
              <ActivityIndicator color="#10B981" />
            ) : isTooFar || isSelfBounty || distanceMeters === null ? (
              <Ionicons name="lock-closed" size={28} color="#64748B" />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.claimRow}>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} disabled={isSubmitting}>
              <Ionicons name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.retakeText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitReviewBtn, (isSubmitting || isSelfBounty) && styles.submitReviewBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleSubmitReview}
              disabled={isSubmitting || isSelfBounty}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="send-check" size={20} color="#FFFFFF" />
                  <Text style={styles.submitReviewBtnText}>Send for Review</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121417',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  permBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
    flex: 1,
  },
  headerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  selfBountyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  selfBountyText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    flex: 1,
  },
  gpsBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  gpsRowError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  gpsRowSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  gpsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  gpsTextError: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
  },
  gpsTextSuccess: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
  },
  cameraBox: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cameraView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    padding: 22,
    borderRadius: 20,
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#EF4444',
  },
  lockSub: {
    fontSize: 12,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 17,
  },
  bypassBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 6,
  },
  bypassBtnText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  viewfinder: {
    width: '84%',
    height: '75%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  viewfinderText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10B981',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
  },
  rewardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
  },
  rewardAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FBBF24',
  },
  xpBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  xpBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  bottomActions: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  shutterBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    borderColor: '#64748B',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  retakeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  submitReviewBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 9999,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderBottomWidth: 4,
    borderBottomColor: '#059669',
  },
  submitReviewBtnDisabled: {
    backgroundColor: '#334155',
    borderBottomColor: '#1E293B',
    opacity: 0.7,
  },
  submitReviewBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});