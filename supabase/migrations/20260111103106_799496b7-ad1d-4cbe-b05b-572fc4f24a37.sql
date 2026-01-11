-- Fix editorial_events RLS policies - restrict to user's projects only
DROP POLICY IF EXISTS "Users can insert editorial events" ON public.editorial_events;
DROP POLICY IF EXISTS "Users can view their project events" ON public.editorial_events;

-- Restrict INSERT to user's accessible projects only
CREATE POLICY "Users can insert events for their projects"
ON public.editorial_events FOR INSERT
WITH CHECK (
  has_project_access(auth.uid(), project_id::uuid)
);

-- Restrict SELECT to user's accessible projects only  
CREATE POLICY "Users can view their project events"
ON public.editorial_events FOR SELECT
USING (
  has_project_access(auth.uid(), project_id::uuid)
);

-- Fix profiles table RLS - restrict to own profile or project collaborators
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

-- Users can view profiles of project collaborators
CREATE POLICY "Users can view collaborator profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = p.id AND pm.user_id = profiles.user_id
    )
  )
  OR
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_members pm2
      WHERE pm2.project_id = pm.project_id AND pm2.user_id = profiles.user_id
    )
  )
  OR
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.owner_id = profiles.user_id
    AND EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    )
  )
);