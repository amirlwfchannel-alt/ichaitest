-- ════════════════════════════════════════════════════════════
-- Migration: visit_logs + RLS (idempotent)
-- Purpose: privacy-friendly, deduplicated visit tracking.
--   • One row per browser (visitor_id = random UUID in localStorage)
--   • New row only when last visit older than 30 minutes (session-based)
--   • No IP, no fingerprint, no PII stored
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- ═════════════════════════════════════ RPC for logging visits ═
CREATE OR REPLACE FUNCTION public.log_visit(p_visitor_id TEXT, p_path TEXT DEFAULT '/')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last TIMESTAMPTZ;
BEGIN
  SELECT MAX(created_at) INTO v_last
  FROM public.visit_logs
  WHERE visitor_id = p_visitor_id;

  -- Only log if no visit in the last 30 minutes (session dedup)
  IF v_last IS NULL OR v_last < NOW() - INTERVAL '30 minutes' THEN
    INSERT INTO public.visit_logs(visitor_id, path, created_at)
    VALUES (p_visitor_id, COALESCE(p_path, '/'), NOW());
  END IF;
END;
$$;

-- ═══ Table (create if missing) ═══
CREATE TABLE IF NOT EXISTS public.visit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══ Indexes ═══
CREATE INDEX IF NOT EXISTS idx_visit_logs_created ON public.visit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_visit_logs_visitor ON public.visit_logs(visitor_id);

-- ═══ Realtime: not needed for visits; keep publication untouched ═══

-- ═══ RLS: anon can ONLY call the RPC; no direct insert/select ═══
ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon cannot do anything directly" ON public.visit_logs;
CREATE POLICY "no_direct_anon_access"
  ON public.visit_logs
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- authenticated (admin) may read analytics
DROP POLICY IF EXISTS "authenticated read visits" ON public.visit_logs;
CREATE POLICY "authenticated_read_visits"
  ON public.visit_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- RPC execute rights
REVOKE ALL ON FUNCTION public.log_visit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_visit(TEXT, TEXT) TO anon, authenticated;
