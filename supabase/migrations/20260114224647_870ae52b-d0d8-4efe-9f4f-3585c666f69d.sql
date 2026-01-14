-- Fix outline persistence: add missing columns used by generate-outline-light / outline-worker
ALTER TABLE public.project_outlines
  ADD COLUMN IF NOT EXISTS narrative_mode text,
  ADD COLUMN IF NOT EXISTS density_targets jsonb,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_chars integer,
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS substage text,
  ADD COLUMN IF NOT EXISTS progress integer,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_detail text;