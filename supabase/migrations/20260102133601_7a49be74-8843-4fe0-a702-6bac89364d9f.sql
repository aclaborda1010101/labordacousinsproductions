-- Add profile_json column to props table for Bible profile storage
ALTER TABLE public.props 
ADD COLUMN IF NOT EXISTS profile_json JSONB DEFAULT '{}'::jsonb;