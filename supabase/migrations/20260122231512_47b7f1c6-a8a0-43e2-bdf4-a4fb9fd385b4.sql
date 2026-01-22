-- Fix RLS policies for edge functions (service_role)
-- The current policies only allow 'public' role, but edge functions use 'service_role'

-- 1. Add service_role policy for scene_intent
CREATE POLICY "Service role full access on scene_intent"
ON public.scene_intent
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. Add service_role policy for narrative_state
CREATE POLICY "Service role full access on narrative_state"
ON public.narrative_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Add service_role policy for jobs
CREATE POLICY "Service role full access on jobs"
ON public.jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Also add authenticated users policy with project access for completeness
-- This ensures frontend can also read/write with proper access checks

-- Drop and recreate scene_intent policy to include WITH CHECK
DROP POLICY IF EXISTS "Users can manage scene intents" ON public.scene_intent;
CREATE POLICY "Users can manage scene intents"
ON public.scene_intent
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = scene_intent.project_id 
    AND (projects.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM project_members 
      WHERE project_members.project_id = projects.id 
      AND project_members.user_id = auth.uid()
    ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = scene_intent.project_id 
    AND (projects.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM project_members 
      WHERE project_members.project_id = projects.id 
      AND project_members.user_id = auth.uid()
    ))
  )
);

-- Drop and recreate narrative_state policy
DROP POLICY IF EXISTS "Users can manage their project narrative state" ON public.narrative_state;
CREATE POLICY "Users can manage their project narrative state"
ON public.narrative_state
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = narrative_state.project_id 
    AND (projects.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM project_members 
      WHERE project_members.project_id = projects.id 
      AND project_members.user_id = auth.uid()
    ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = narrative_state.project_id 
    AND (projects.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM project_members 
      WHERE project_members.project_id = projects.id 
      AND project_members.user_id = auth.uid()
    ))
  )
);