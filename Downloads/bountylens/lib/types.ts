export interface Bounty {
  id: string;
  author_id: string;
  title?: string;
  description?: string;
  reward: number;
  latitude: number;
  longitude: number;
  radius_meters?: number;
  status: 'open' | 'pending_review' | 'completed' | 'expired';
  created_at?: string;
  expires_at?: string;
}

export interface Submission {
  id: string;
  bounty_id: string;
  hunter_id: string;
  media_url: string;
  media_type: 'photo' | 'video';
  latitude: number;
  longitude: number;
  distance_meters?: number;
  is_mocked?: boolean;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
export type BountyStatus = 'open' | 'pending_review' | 'completed' | 'expired';

export interface ProofMedia {
  url: string;
  type: 'photo' | 'video';
  duration?: number;
}