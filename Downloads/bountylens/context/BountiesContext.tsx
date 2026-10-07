import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface BountyItem {
  id: string;
  title: string;
  place: string;
  address?: string;
  category: 'coffee' | 'parking' | 'landmark' | 'store';
  reward: number;
  xp: number;
  expiresInSeconds: number;
  latitude: number;
  longitude: number;
  difficulty?: 'Quick' | 'Medium' | 'Complex';
  creator: string;
  creator_id?: string;
  completed?: boolean;
  completedAt?: string;
  proofImage?: string | null;
  durationMinutes?: number;
}

interface BountiesContextType {
  bounties: BountyItem[];
  completedBounties: BountyItem[];
  fetchBounties: () => Promise<void>;
  resetBounties: () => Promise<void>;
  isLoading: boolean;
}

const BountiesContext = createContext<BountiesContextType | undefined>(undefined);

export const BountiesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bounties, setBounties] = useState<BountyItem[]>([]);
  const [completedBounties, setCompletedBounties] = useState<BountyItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Конвертація рядка з БД в модель інтерфейсу
  const mapDbToBounty = (row: any): BountyItem => {
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : Date.now() + 1800 * 1000;
    const now = Date.now();
    const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

    const finalReward = row.reward !== undefined && row.reward !== null
      ? Number(row.reward)
      : row.reward_cents !== undefined && row.reward_cents !== null
      ? Number(row.reward_cents) / 100
      : 5.0;

    return {
      id: String(row.id),
      title: row.title || row.description || 'Verified Spot',
      place: row.place || row.address || 'City Location',
      address: row.address || row.place || 'City Location',
      category: row.category || 'coffee',
      reward: finalReward,
      xp: row.xp ? Number(row.xp) : Math.round(finalReward * 10),
      expiresInSeconds: remainingSeconds,
      latitude: Number(row.latitude) || 50.7472,
      longitude: Number(row.longitude) || 25.3254,
      difficulty: row.difficulty || 'Quick',
      creator: row.creator || '@host',
      creator_id: row.creator_id ? String(row.creator_id) : undefined,
      completed: row.status === 'completed',
      proofImage: row.proof_image || null,
    };
  };

  // Завантаження завдань із Supabase
  const fetchBounties = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('bounties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching bounties:', error);
        return;
      }

      if (data) {
        const active = data.filter((item) => item.status === 'active').map(mapDbToBounty);
        const completed = data.filter((item) => item.status === 'completed').map(mapDbToBounty);
        setBounties(active);
        setCompletedBounties(completed);
      }
    } catch (e) {
      console.warn('Network error fetching bounties:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBounties();

    const channel = supabase
      .channel('realtime_bounties')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bounties' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newItem = mapDbToBounty(payload.new);
            setBounties((prev) => [newItem, ...prev.filter((b) => b.id !== newItem.id)]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = mapDbToBounty(payload.new);
            if (updated.completed) {
              setBounties((prev) => prev.filter((b) => b.id !== updated.id));
              setCompletedBounties((prev) => [updated, ...prev.filter((b) => b.id !== updated.id)]);
            } else {
              setBounties((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            }
          } else if (payload.eventType === 'DELETE') {
            setBounties((prev) => prev.filter((b) => b.id !== String(payload.old.id)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Таймер зворотного відліку
  useEffect(() => {
    const timer = setInterval(() => {
      setBounties((prev) =>
        prev
          .map((b) => ({
            ...b,
            expiresInSeconds: Math.max(0, b.expiresInSeconds - 1),
          }))
          .filter((b) => b.expiresInSeconds > 0)
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const resetBounties = async () => {
    await fetchBounties();
  };

  return (
    <BountiesContext.Provider
      value={{
        bounties,
        completedBounties,
        fetchBounties,
        resetBounties,
        isLoading,
      }}
    >
      {children}
    </BountiesContext.Provider>
  );
};

export const useBounties = () => {
  const context = useContext(BountiesContext);
  if (!context) {
    throw new Error('useBounties must be used within a BountiesProvider');
  }
  return context;
};