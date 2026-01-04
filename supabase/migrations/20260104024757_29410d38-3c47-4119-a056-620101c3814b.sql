-- Add developer mode columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS developer_mode_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS developer_mode_enabled_at timestamptz NULL;

-- Create a policy to prevent direct client updates to developer_mode_enabled
-- Users can read their own profile but cannot directly update developer_mode fields
-- The edge function will use service role to bypass this

-- Drop existing update policy if it exists and recreate
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile except dev mode" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  AND (
    -- Prevent direct updates to developer_mode_enabled from client
    -- This check ensures the old value equals the new value for these fields
    -- In practice, service role bypasses RLS so edge functions can update
    developer_mode_enabled = (SELECT developer_mode_enabled FROM public.profiles WHERE user_id = auth.uid())
  )
);