-- 1. УДАЛЯЕМ СТАРЫЕ АРТЕФАКТЫ ИЗ 002 И ПЕРЕГРУЗКИ
DROP FUNCTION IF EXISTS public._settle_submission(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.wallet_summary();
DROP FUNCTION IF EXISTS public.create_bounty_secure(text, text, text, text, numeric, integer, double precision, double precision, text, text, text, integer);
DROP FUNCTION IF EXISTS public.submit_proof_secure(uuid, text, double precision, double precision, numeric, boolean);
DROP FUNCTION IF EXISTS public.review_submission(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.cancel_bounty_secure(uuid);
DROP FUNCTION IF EXISTS public.claim_starter_points();
DROP FUNCTION IF EXISTS public.calculate_distance_m(double precision, double precision, double precision, double precision);
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS reject_reason text;

-- 2. СЕРВЕРНЫЙ HAVERSINE
CREATE OR REPLACE FUNCTION public.calculate_distance_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
)
RETURNS numeric 
LANGUAGE plpgsql 
IMMUTABLE 
SET search_path = public AS $$
DECLARE
  r constant numeric := 6371000;
  phi1 numeric := radians(lat1);
  phi2 numeric := radians(lat2);
  dphi numeric := radians(lat2 - lat1);
  dlam numeric := radians(lon2 - lon1);
  a numeric;
  c numeric;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;
  a := sin(dphi/2)^2 + cos(phi1) * cos(phi2) * sin(dlam/2)^2;
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  RETURN ROUND(r * c);
END;
$$;

-- 3. RLS И ПОЛИТИКИ ДОСТУПА
ALTER TABLE public.bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read bounties" ON public.bounties;
DROP POLICY IF EXISTS "Users view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users view relevant submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users view own notifications" ON public.radar_notifications;

-- Читать баунти могут только авторизованные (anon закрыт)
CREATE POLICY "Auth read bounties" ON public.bounties
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users view own transactions" ON public.transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text);

CREATE POLICY "Users view relevant submissions" ON public.submissions
  FOR SELECT TO authenticated 
  USING (
    scout_id = auth.uid()::text OR 
    EXISTS (SELECT 1 FROM public.bounties b WHERE b.id = submissions.bounty_id AND b.creator_id = auth.uid()::text)
  );

CREATE POLICY "Users view own notifications" ON public.radar_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text);

-- ПРЯМАЯ МОДИФИКАЦИЯ ЗАПРЕЩЕНА ДЛЯ ВСЕХ
REVOKE INSERT, UPDATE, DELETE ON public.bounties FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.submissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.radar_notifications FROM anon, authenticated;

-- anon лишен SELECT прав на все таблицы
REVOKE ALL ON public.bounties FROM anon;
REVOKE ALL ON public.submissions FROM anon;
REVOKE ALL ON public.transactions FROM anon;
REVOKE ALL ON public.radar_notifications FROM anon;

GRANT SELECT ON public.bounties TO authenticated;
GRANT SELECT ON public.submissions TO authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT SELECT ON public.radar_notifications TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_starter_grant 
ON public.transactions(user_id) WHERE type = 'starter_grant';

-- 4. CREATE BOUNTY (С NULL-GUARD И ТОЧНОСТЬЮ ДО ЦЕНТОВ)
CREATE OR REPLACE FUNCTION public.create_bounty_secure(
  p_title text,
  p_place text,
  p_address text,
  p_category text,
  p_reward numeric,
  p_xp integer,
  p_latitude double precision,
  p_longitude double precision,
  p_difficulty text,
  p_creator text,
  p_description text,
  p_expires_minutes integer DEFAULT 60
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_balance numeric;
  v_bounty_id uuid;
  v_reward_cents integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Строгая проверка входных параметров
  IF p_reward IS NULL OR p_reward < 1.0 OR p_reward > 500.0 OR p_reward <> ROUND(p_reward, 2) THEN
    RAISE EXCEPTION 'Reward out of bounds';
  END IF;

  IF p_expires_minutes IS NULL OR p_expires_minutes NOT BETWEEN 5 AND 1440 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid location';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Invalid title';
  END IF;

  v_reward_cents := ROUND(p_reward * 100)::integer;

  -- Блокируем кошелек пользователя для предотвращения race condition
  PERFORM pg_advisory_xact_lock(hashtext(v_uid));

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.transactions
  WHERE user_id = v_uid;

  IF v_balance < p_reward THEN
    RAISE EXCEPTION 'Insufficient balance to fund bounty';
  END IF;

  INSERT INTO public.bounties (
    title, place, address, category, reward, reward_cents,
    xp, latitude, longitude, difficulty, creator, creator_id,
    description, status, expires_at
  ) VALUES (
    trim(p_title), trim(p_place), trim(p_address), p_category, p_reward, v_reward_cents,
    p_xp, p_latitude, p_longitude, p_difficulty, p_creator, v_uid,
    p_description, 'active', now() + (p_expires_minutes || ' minutes')::interval
  ) RETURNING id INTO v_bounty_id;

  INSERT INTO public.transactions (
    user_id, amount, amount_cents, type, title, place, bounty_id
  ) VALUES (
    v_uid, -p_reward, -v_reward_cents, 'escrow_hold', 'Bounty Escrow Hold', p_place, v_bounty_id::text
  );

  RETURN v_bounty_id;
END;
$$;

-- 5. SUBMIT PROOF (С NULL-GUARD И ПРОВЕРКОЙ ВРЕМЕНИ)
CREATE OR REPLACE FUNCTION public.submit_proof_secure(
  p_bounty_id uuid,
  p_media_path text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric DEFAULT 5,
  p_is_mocked boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_bounty public.bounties%ROWTYPE;
  v_sub_id uuid;
  v_dist numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL OR p_accuracy_m IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180
     OR p_media_path IS NULL OR length(trim(p_media_path)) = 0 THEN
    RAISE EXCEPTION 'Invalid input';
  END IF;

  IF p_is_mocked IS TRUE THEN RAISE EXCEPTION 'Mocked GPS location prohibited'; END IF;
  IF p_accuracy_m > 100 THEN RAISE EXCEPTION 'GPS signal accuracy is too poor'; END IF;

  SELECT * INTO v_bounty FROM public.bounties WHERE id = p_bounty_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Bounty not found'; END IF;
  IF v_bounty.status != 'active' THEN RAISE EXCEPTION 'Bounty is not active'; END IF;
  IF v_bounty.expires_at < now() THEN RAISE EXCEPTION 'Bounty has expired'; END IF;
  IF v_bounty.creator_id = v_uid THEN RAISE EXCEPTION 'Cannot claim your own bounty'; END IF;

  v_dist := public.calculate_distance_m(p_latitude, p_longitude, v_bounty.latitude, v_bounty.longitude);
  IF v_dist IS NULL OR v_dist > 200 THEN
    RAISE EXCEPTION 'Too far from target location';
  END IF;

  INSERT INTO public.submissions (
    bounty_id, scout_id, media_path, media_type, accuracy_m, distance_m, status, is_mocked
  ) VALUES (
    p_bounty_id, v_uid, p_media_path, 'image', p_accuracy_m, v_dist, 'pending', false
  ) RETURNING id INTO v_sub_id;

  UPDATE public.bounties
  SET status = 'in_review', claimed_by = v_uid, proof_image = p_media_path
  WHERE id = p_bounty_id;

  INSERT INTO public.radar_notifications (
    user_id, target_role, title, message, type, amount
  ) VALUES (
    v_bounty.creator_id, 'creator', 'Proof Submitted', 'A scout submitted proof for ' || v_bounty.title, 'creator_review', v_bounty.reward
  );

  RETURN v_sub_id;
END;
$$;

-- 6. REVIEW SUBMISSION (С ПРОВЕРКОЙ BOUNTY NOT FOUND)
CREATE OR REPLACE FUNCTION public.review_submission(
  p_submission_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := auth.uid()::text;
  s public.submissions%ROWTYPE;
  b public.bounties%ROWTYPE;
  v_fee_cents integer;
  v_net_cents integer;
  v_net numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO s FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found'; END IF;

  SELECT * INTO b FROM public.bounties WHERE id = s.bounty_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bounty not found'; END IF;
  IF b.creator_id <> v_uid THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO s FROM public.submissions WHERE id = p_submission_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Already reviewed'; END IF;

  IF p_approve THEN
    v_fee_cents := (b.reward_cents * 10) / 100;
    v_net_cents := b.reward_cents - v_fee_cents;
    v_net := ROUND(v_net_cents::numeric / 100.0, 2);

    INSERT INTO public.transactions (user_id, amount, amount_cents, type, title, place, bounty_id)
    VALUES (s.scout_id, v_net, v_net_cents, 'payout', 'Bounty Reward: ' || b.title, b.place, b.id::text);

    UPDATE public.submissions SET status = 'approved', reviewed_at = now() WHERE id = s.id;
    UPDATE public.bounties SET status = 'completed' WHERE id = b.id;

    INSERT INTO public.radar_notifications (user_id, target_role, title, message, type, amount)
    VALUES (s.scout_id, 'scout', 'Bounty Approved', 'Reward credited for ' || b.title, 'payout', v_net);
  ELSE
    IF COALESCE(p_reason, '') NOT IN ('wrong_place', 'unclear_media', 'wrong_subject', 'inappropriate', 'other') THEN
      RAISE EXCEPTION 'reason_required';
    END IF;

    UPDATE public.submissions SET status = 'rejected', reject_reason = p_reason, reviewed_at = now() WHERE id = s.id;
    UPDATE public.bounties SET status = 'active', claimed_by = NULL WHERE id = b.id;

    INSERT INTO public.radar_notifications (user_id, target_role, title, message, type)
    VALUES (s.scout_id, 'scout', 'Submission Rejected', 'Reason: ' || p_reason, 'rejected');
  END IF;
END;
$$;

-- 7. CANCEL BOUNTY
CREATE OR REPLACE FUNCTION public.cancel_bounty_secure(p_bounty_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_bounty public.bounties%ROWTYPE;
BEGIN
  SELECT * INTO v_bounty FROM public.bounties WHERE id = p_bounty_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Bounty not found'; END IF;
  IF v_bounty.creator_id != v_uid THEN RAISE EXCEPTION 'Only creator can cancel bounty'; END IF;
  IF v_bounty.status != 'active' THEN RAISE EXCEPTION 'Cannot cancel bounty with pending submissions or already completed'; END IF;

  UPDATE public.bounties SET status = 'cancelled' WHERE id = p_bounty_id;

  INSERT INTO public.transactions (
    user_id, amount, amount_cents, type, title, place, bounty_id
  ) VALUES (
    v_uid, v_bounty.reward, v_bounty.reward_cents, 'refund', 'Bounty Cancelled Refund', v_bounty.place, p_bounty_id::text
  );

  RETURN true;
END;
$$;

-- 8. CLAIM STARTER POINTS
CREATE OR REPLACE FUNCTION public.claim_starter_points()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.transactions (user_id, amount, amount_cents, type, title)
  VALUES (v_uid, 25.00, 2500, 'starter_grant', 'Welcome Escrow Credits');

  RETURN 25.00;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Starter points already claimed';
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_bounty_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_proof_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_submission TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_bounty_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_starter_points TO authenticated;