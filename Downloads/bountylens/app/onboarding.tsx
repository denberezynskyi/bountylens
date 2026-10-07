import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { useUser, UserRole } from '../context/UserContext';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const { width } = Dimensions.get('window');
const HERO_IMAGE = require('../assets/screen.png');

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useUser();
  const [selectedRole, setSelectedRole] = useState<UserRole>('scout');

  // Auth modal states
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'verify'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  const handleSelectRole = (role: UserRole) => {
    if (selectedRole !== role) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedRole(role);
    }
  };

  const handleOpenAuth = (mode: 'signin' | 'signup') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAuthMode(mode);
    setOtpCode('');
    setIsAuthModalVisible(true);
  };

  const handleEmailAuth = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      Alert.alert('Required Fields', 'Please enter both your email and password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    setIsLoadingAuth(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              role: selectedRole,
            },
          },
        });

        if (error) throw error;

        // Якщо підтвердження увімкнене в Supabase — сесії не буде (потрібен код)
        if (data.user && !data.session) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setAuthMode('verify');
          Alert.alert(
            'Check Your Inbox',
            `A 6-digit confirmation code was sent to ${cleanEmail}. Enter it below to activate your account.`
          );
        } else {
          // Якщо сесія створилась одразу
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await completeOnboarding(selectedRole);
          setIsAuthModalVisible(false);
          router.replace('/');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password,
        });

        if (error) throw error;

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await completeOnboarding(selectedRole);
        setIsAuthModalVisible(false);
        router.replace('/');
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Authentication Error', err.message || 'Unable to authenticate. Please check your credentials.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanEmail = email.trim();
    const cleanCode = otpCode.trim();

    // Дозволяємо коди від 6 до 10 знаків
    if (!cleanCode || cleanCode.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the verification code sent to your email.');
      return;
    }

    setIsLoadingAuth(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'signup',
      });

      if (error) throw error;

      if (data.session) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await completeOnboarding(selectedRole);
        setIsAuthModalVisible(false);
        router.replace('/');
      } else {
        throw new Error('Verification session not established. Please try logging in.');
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Verification Failed', err.message || 'The code entered is incorrect or expired.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleResendOtp = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      Alert.alert('Missing Email', 'Please enter your email to resend code.');
      return;
    }

    try {
      setIsLoadingAuth(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      });

      if (error) throw error;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Dispatched', `A fresh verification code was sent to ${cleanEmail}.`);
    } catch (err: any) {
      Alert.alert('Resend Failed', err.message || 'Could not resend email.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleSocialAuth = async (provider: 'google') => {
    try {
      setIsLoadingAuth(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Повертаємо жорстку схему додатку, яка стояла від самого початку
      const redirectUrl = 'bountylens://';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (result.type === 'success' && result.url) {
          const rawUrl = result.url;
          const params = new URLSearchParams(
            rawUrl.includes('#') ? rawUrl.split('#')[1] : rawUrl.split('?')[1]
          );
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }

          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await completeOnboarding(selectedRole);
          setIsAuthModalVisible(false);
          router.replace('/');
        }
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('OAuth Error', err.message || `Failed to sign in with ${provider}`);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Artwork */}
        <View style={styles.heroWrap}>
          <Image
            source={HERO_IMAGE}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['#FBF8FF', 'rgba(251, 248, 255, 0)']}
            style={styles.topGradientFade}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(251, 248, 255, 0)', '#FBF8FF']}
            style={styles.bottomGradientFade}
            pointerEvents="none"
          />
        </View>

        {/* Header Block */}
        <View style={styles.headerBlock}>
          <View
            style={[
              styles.badgePill,
              selectedRole === 'creator' && { backgroundColor: '#FEF3C7' },
            ]}
          >
            <MaterialCommunityIcons
              name={selectedRole === 'creator' ? 'bullhorn' : 'compass'}
              size={14}
              color={selectedRole === 'creator' ? '#D97706' : '#006C49'}
            />
            <Text
              style={[
                styles.badgePillText,
                selectedRole === 'creator' && { color: '#D97706' },
              ]}
            >
              {selectedRole === 'creator' ? 'LOCAL HOST HUB' : 'NEIGHBORHOOD QUESTS'}
            </Text>
          </View>
          <Text style={styles.titleText}>Join the Scout Network</Text>
          <Text style={styles.subText}>
            Choose your role to explore, verify ground spots, and earn daily rewards.
          </Text>
        </View>

        {/* Role Cards Selection */}
        <View style={styles.rolesRow}>
          {/* Scout Card */}
          <TouchableOpacity
            style={[
              styles.roleCard,
              selectedRole === 'scout' && styles.roleCardActiveScout,
            ]}
            activeOpacity={0.88}
            onPress={() => handleSelectRole('scout')}
          >
            <View style={styles.roleCardTop}>
              <View
                style={[
                  styles.roleIconWrap,
                  selectedRole === 'scout'
                    ? { backgroundColor: '#E6FBF2' }
                    : { backgroundColor: '#F4F2FD' },
                ]}
              >
                <MaterialCommunityIcons
                  name="compass-outline"
                  size={24}
                  color={selectedRole === 'scout' ? '#006C49' : '#6C7A71'}
                />
              </View>

              <View
                style={[
                  styles.checkCircle,
                  selectedRole === 'scout'
                    ? styles.checkCircleActiveScout
                    : styles.checkCircleInactive,
                ]}
              >
                {selectedRole === 'scout' && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
            </View>

            <View style={styles.roleTextGroup}>
              <View style={styles.roleTitleRow}>
                <Text style={styles.roleTitle}>Scout</Text>
                {selectedRole === 'scout' && (
                  <MaterialCommunityIcons name="check-decagram" size={16} color="#006C49" />
                )}
              </View>
              <Text
                style={[
                  styles.roleBadgeText,
                  { color: selectedRole === 'scout' ? '#006C49' : '#6C7A71' },
                ]}
              >
                Earn Bounties
              </Text>
              <Text style={styles.roleDesc} numberOfLines={2}>
                Find hidden spots, snap proof & collect coin rewards daily.
              </Text>
            </View>

            <View style={styles.roleCardFooter}>
              <View style={styles.tagTextRow}>
                <MaterialCommunityIcons name="cash" size={13} color="#006C49" />
                <Text style={styles.tagText}>Active Tasks</Text>
              </View>
              <View style={styles.todayPill}>
                <Text style={styles.todayPillText}>+48 today</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Creator Card */}
          <TouchableOpacity
            style={[
              styles.roleCard,
              selectedRole === 'creator' && styles.roleCardActiveCreator,
            ]}
            activeOpacity={0.88}
            onPress={() => handleSelectRole('creator')}
          >
            <View style={styles.roleCardTop}>
              <View
                style={[
                  styles.roleIconWrap,
                  selectedRole === 'creator'
                    ? { backgroundColor: '#FEF3C7' }
                    : { backgroundColor: '#F4F2FD' },
                ]}
              >
                <MaterialCommunityIcons
                  name="map-marker-radius-outline"
                  size={24}
                  color={selectedRole === 'creator' ? '#D97706' : '#6C7A71'}
                />
              </View>

              <View
                style={[
                  styles.checkCircle,
                  selectedRole === 'creator'
                    ? styles.checkCircleActiveCreator
                    : styles.checkCircleInactive,
                ]}
              >
                {selectedRole === 'creator' && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
            </View>

            <View style={styles.roleTextGroup}>
              <View style={styles.roleTitleRow}>
                <Text style={styles.roleTitle}>Creator</Text>
                {selectedRole === 'creator' && (
                  <MaterialCommunityIcons name="coffee-outline" size={16} color="#D97706" />
                )}
              </View>
              <Text
                style={[
                  styles.roleBadgeText,
                  { color: selectedRole === 'creator' ? '#D97706' : '#6C7A71' },
                ]}
              >
                Post Drops
              </Text>
              <Text style={styles.roleDesc} numberOfLines={2}>
                Create micro-quests for local spots, cafes & community events.
              </Text>
            </View>

            <View style={styles.roleCardFooter}>
              <View style={styles.tagTextRow}>
                <MaterialCommunityIcons name="bullhorn-outline" size={13} color="#D97706" />
                <Text style={[styles.tagText, { color: '#B45309' }]}>Hosts & Venues</Text>
              </View>
              <View style={[styles.todayPill, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.todayPillText, { color: '#B45309' }]}>Free</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Community Trust Banner */}
        <View style={styles.trustBanner}>
          <View style={styles.trustAvatarsGroup}>
            <View style={[styles.miniAvatarBubble, { backgroundColor: '#FFE4E6' }]}>
              <Text style={styles.miniAvatarEmoji}>🦊</Text>
            </View>
            <View style={[styles.miniAvatarBubble, { backgroundColor: '#E6FBF2', marginLeft: -8 }]}>
              <Text style={styles.miniAvatarEmoji}>🦝</Text>
            </View>
            <View style={[styles.miniAvatarBubble, { backgroundColor: '#FEF3C7', marginLeft: -8 }]}>
              <Text style={styles.miniAvatarEmoji}>🐥</Text>
            </View>
          </View>

          <View style={styles.trustTextGroup}>
            <Text style={styles.trustTitle}>12,480 Local Explorers</Text>
            <Text style={styles.trustSub}>Active in your neighborhood</Text>
          </View>

          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={14} color="#006C49" />
            <Text style={styles.ratingText}>4.9</Text>
          </View>
        </View>

        {/* Main Action Button */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            selectedRole === 'creator' && styles.primaryButtonCreator,
          ]}
          activeOpacity={0.85}
          onPress={() => handleOpenAuth('signup')}
        >
          <Text style={styles.primaryButtonText}>
            {selectedRole === 'scout'
              ? 'Get Started as Scout →'
              : 'Get Started as Creator →'}
          </Text>
        </TouchableOpacity>

        {/* Sign In Link */}
        <View style={styles.signInRow}>
          <Text style={styles.signInQuestion}>Already registered? </Text>
          <TouchableOpacity onPress={() => handleOpenAuth('signin')}>
            <Text style={styles.signInAction}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Auth Modal */}
      <Modal visible={isAuthModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTag, selectedRole === 'creator' && { color: '#D97706' }]}>
                  {authMode === 'verify'
                    ? 'SECURITY CHECK'
                    : authMode === 'signup'
                    ? selectedRole === 'creator'
                      ? 'NEW VENUE HOST'
                      : 'NEW OPERATOR'
                    : 'SECURE ACCESS'}
                </Text>
                <Text style={styles.modalTitle}>
                  {authMode === 'verify'
                    ? 'Verify Email'
                    : authMode === 'signup'
                    ? 'Create Account'
                    : 'Welcome Back'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsAuthModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#1A1B22" />
              </TouchableOpacity>
            </View>

            {authMode === 'verify' ? (
              /* Verification Code State */
              <View style={styles.verifyContainer}>
                <Text style={styles.verifySubText}>
                  Enter the 6-digit confirmation token sent to{' '}
                  <Text style={{ fontWeight: '800', color: '#1A1B22' }}>{email.trim()}</Text>
                </Text>

                <TextInput
                  style={[styles.otpInputField, { letterSpacing: 4, fontSize: 18 }]}
                  placeholder="17018252"
                  placeholderTextColor="#94A3B8"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus
                />

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    selectedRole === 'creator' && {
                      backgroundColor: '#F59E0B',
                      borderBottomColor: '#D97706',
                    },
                    isLoadingAuth && { opacity: 0.7 },
                  ]}
                  disabled={isLoadingAuth}
                  onPress={handleVerifyOtp}
                >
                  {isLoadingAuth ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Confirm Code & Launch</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  <TouchableOpacity onPress={handleResendOtp} disabled={isLoadingAuth}>
                    <Text style={[styles.resendText, selectedRole === 'creator' && { color: '#D97706' }]}>
                      Didn't get code? Resend
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setAuthMode('signup')}>
                    <Text style={styles.backLinkText}>Edit Email</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Regular Sign In / Sign Up Form */
              <>
                <TouchableOpacity
                  style={styles.googleFullBtn}
                  onPress={() => handleSocialAuth('google')}
                  disabled={isLoadingAuth}
                  activeOpacity={0.8}
                >
                  <Ionicons name="logo-google" size={18} color="#EA4335" />
                  <Text style={styles.googleFullBtnText}>Continue with Google</Text>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or continue with email</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder={selectedRole === 'creator' ? 'host@venue.com' : 'scout@city.net'}
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />

                  <Text style={styles.inputLabel}>PASSWORD</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="••••••••"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    selectedRole === 'creator' && {
                      backgroundColor: '#F59E0B',
                      borderBottomColor: '#D97706',
                    },
                    isLoadingAuth && { opacity: 0.7 },
                  ]}
                  disabled={isLoadingAuth}
                  onPress={handleEmailAuth}
                >
                  {isLoadingAuth ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {authMode === 'signup'
                        ? selectedRole === 'creator'
                          ? 'Register Host Hub & Enter'
                          : 'Create Account & Enter'
                        : 'Sign In to Radar'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchAuthRow}
                  onPress={() => setAuthMode(authMode === 'signup' ? 'signin' : 'signup')}
                >
                  <Text
                    style={[
                      styles.switchAuthText,
                      selectedRole === 'creator' && { color: '#D97706' },
                    ]}
                  >
                    {authMode === 'signup'
                      ? 'Already have an account? Sign In'
                      : "Don't have an account? Create one"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF8FF',
  },
  scrollContent: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  heroWrap: {
    width: width,
    height: 250,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  topGradientFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  bottomGradientFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 45,
  },
  headerBlock: {
    alignItems: 'center',
    marginTop: -4,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8E7F1',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    marginBottom: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006C49',
    letterSpacing: 0.5,
  },
  titleText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1B22',
    letterSpacing: -0.3,
  },
  subText: {
    fontSize: 13,
    color: '#6C7A71',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
    marginTop: 4,
  },
  rolesRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  roleCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    justifyContent: 'space-between',
    minHeight: 190,
  },
  roleCardActiveScout: {
    borderColor: '#006C49',
    shadowColor: '#10B981',
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  roleCardActiveCreator: {
    borderColor: '#D97706',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  roleCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActiveScout: {
    backgroundColor: '#006C49',
  },
  checkCircleActiveCreator: {
    backgroundColor: '#D97706',
  },
  checkCircleInactive: {
    borderWidth: 2,
    borderColor: '#E8E7F1',
  },
  roleTextGroup: {
    gap: 2,
    marginVertical: 8,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1B22',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  roleDesc: {
    fontSize: 11,
    color: '#6C7A71',
    lineHeight: 14,
    marginTop: 2,
  },
  roleCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F4F2FD',
    paddingTop: 8,
  },
  tagTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#006C49',
  },
  todayPill: {
    backgroundColor: '#E6FBF2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006C49',
  },
  trustBanner: {
    width: width - 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F2FD',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 20,
  },
  trustAvatarsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniAvatarBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarEmoji: {
    fontSize: 12,
  },
  trustTextGroup: {
    flex: 1,
    marginLeft: 10,
  },
  trustTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A1B22',
  },
  trustSub: {
    fontSize: 10,
    color: '#6C7A71',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#006C49',
  },
  primaryButton: {
    width: width - 40,
    backgroundColor: '#10B981',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: '#059669',
  },
  primaryButtonCreator: {
    backgroundColor: '#F59E0B',
    borderBottomColor: '#D97706',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  signInQuestion: {
    fontSize: 13,
    color: '#6C7A71',
  },
  signInAction: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1B22',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#006C49',
    letterSpacing: 0.8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1A1B22',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyContainer: {
    gap: 12,
    paddingVertical: 8,
  },
  verifySubText: {
    fontSize: 13,
    color: '#6C7A71',
    lineHeight: 18,
  },
  otpInputField: {
    backgroundColor: '#F4F2FD',
    borderRadius: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
    color: '#1A1B22',
    borderWidth: 1.5,
    borderColor: '#E8E7F1',
    marginVertical: 4,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  resendText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#006C49',
  },
  backLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C7A71',
    textDecorationLine: 'underline',
  },
  googleFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E7F1',
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 4,
  },
  googleFullBtnText: {
    color: '#1A1B22',
    fontSize: 14,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E8E7F1',
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  formGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6C7A71',
    letterSpacing: 0.5,
  },
  inputField: {
    backgroundColor: '#F4F2FD',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    color: '#1A1B22',
    marginBottom: 6,
  },
  submitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: '#059669',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  switchAuthRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchAuthText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#006C49',
  },
});