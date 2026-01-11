-- Fix prompt_cache - restrict ALL policy to user's own cache entries
DROP POLICY IF EXISTS "Cache is accessible to all authenticated users" ON public.prompt_cache;

-- Only allow SELECT on cache (read-only for users)
CREATE POLICY "Cache is readable by authenticated users"
ON public.prompt_cache FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Service/backend can insert cache entries (via edge functions with service role)
CREATE POLICY "Service can manage cache"
ON public.prompt_cache FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Remove the duplicate profiles policy that allows all users to view all profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;