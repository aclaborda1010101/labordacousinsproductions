-- Fix: Editorial events - add project access check on INSERT with proper type cast
DROP POLICY IF EXISTS "Users can insert editorial events" ON public.editorial_events;

CREATE POLICY "Users can insert editorial events for accessible projects"
ON public.editorial_events
FOR INSERT
WITH CHECK (
  public.has_project_access(auth.uid(), project_id::uuid)
);