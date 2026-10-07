import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getOrCreateScoutId } from '../lib/authHelper';

export type UserRole = 'scout' | 'creator';

export interface WalletTransaction {
  id: string;
  type: 'earned' | 'payout' | 'deposit' | 'escrow_hold' | 'refund';
  amount: number;
  title: string;
  place?: string;
  timestamp: number;
  status: 'completed' | 'processing';
}

interface UserContextType {
  balance: number;
  xp: number;
  level: number;
  tasksCompleted: number;
  role: UserRole;
  transactions: WalletTransaction[];
  hasCompletedOnboarding: boolean;
  isLoadingUser: boolean;
  userId: string | null;
  userEmail: string | null;
  completeOnboarding: (chosenRole: UserRole) => Promise<void>;
  setRole: (role: UserRole) => Promise<void>;
  refreshUserData: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [balance, setBalance] = useState<number>(0.0);
  const [xp, setXp] = useState<number>(0);
  const [tasksCompleted, setTasksCompleted] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [role, setRoleState] = useState<UserRole>('scout');
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const level = Math.max(1, Math.floor(xp / 200) + 1);

  const fetchUserData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUid = session?.user?.id || (await getOrCreateScoutId());

      if (currentUid) {
        setUserId(currentUid);
        if (session?.user?.email) setUserEmail(session.user.email);

        // Читаємо транзакції поточного користувача
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .select('id, amount, amount_cents, type, title, place, created_at')
          .eq('user_id', currentUid)
          .order('created_at', { ascending: false });

        if (!txError && txData) {
          let calculatedCents = 0;
          const mappedTxs: WalletTransaction[] = txData.map((tx: any) => {
            const cents = tx.amount_cents !== undefined && tx.amount_cents !== null
              ? tx.amount_cents
              : Math.round((Number(tx.amount) || 0) * 100);

            calculatedCents += cents;

            const isIncome = cents > 0;
            return {
              id: tx.id,
              type: isIncome ? 'earned' : 'payout',
              amount: Math.abs(cents) / 100,
              title: tx.title || (isIncome ? 'Ground Verification Payout' : 'Escrow Hold / Withdrawal'),
              place: tx.place || 'Verified Drop Location',
              timestamp: new Date(tx.created_at).getTime(),
              status: 'completed',
            };
          });

          setBalance(Math.max(0, calculatedCents / 100));
          setTransactions(mappedTxs);
        }

        // Кількість верифікованих сабмітів скаута
        const { count } = await supabase
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .eq('scout_id', currentUid)
          .eq('status', 'approved');

        if (count !== null && count !== undefined) {
          setTasksCompleted(count);
          setXp(count * 50);
        }
      }

      const savedRole = await AsyncStorage.getItem('@user_role');
      const savedOnboarding = await AsyncStorage.getItem('@user_onboarding_completed');

      if (savedRole) setRoleState(savedRole as UserRole);
      if (savedOnboarding) setHasCompletedOnboarding(savedOnboarding === 'true');
    } catch (e) {
      console.warn('Failed to sync user data with backend:', e);
    } finally {
      setIsLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchUserData();
      }
    });

    const txChannel = supabase
      .channel('realtime_transactions_sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        () => {
          fetchUserData();
        }
      )
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(txChannel);
    };
  }, [fetchUserData]);

  const completeOnboarding = async (chosenRole: UserRole) => {
    setRoleState(chosenRole);
    setHasCompletedOnboarding(true);
    await AsyncStorage.setItem('@user_role', chosenRole);
    await AsyncStorage.setItem('@user_onboarding_completed', 'true');
  };

  const setRole = async (newRole: UserRole) => {
    setRoleState(newRole);
    await AsyncStorage.setItem('@user_role', newRole);
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase sign out error:', e);
    }

    setHasCompletedOnboarding(false);
    setBalance(0);
    setXp(0);
    setTasksCompleted(0);
    setTransactions([]);

    await AsyncStorage.multiRemove([
      '@user_onboarding_completed',
      '@user_role',
    ]);
  };

  return (
    <UserContext.Provider
      value={{
        balance,
        xp,
        level,
        tasksCompleted,
        role,
        transactions,
        hasCompletedOnboarding,
        isLoadingUser,
        userId,
        userEmail,
        completeOnboarding,
        setRole,
        refreshUserData: fetchUserData,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};