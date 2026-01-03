-- Drop the FK that points to editorial_projects
ALTER TABLE public.generation_runs DROP CONSTRAINT IF EXISTS generation_runs_project_id_fkey;

-- Make project_id a text field to support both project types (projects and editorial_projects)
-- For MVP, we remove the FK constraint to allow flexibility
-- The RLS policy will handle access control

-- Update the RLS policy to check both project tables
DROP POLICY IF EXISTS "Users can manage generation runs in their projects" ON public.generation_runs;

CREATE POLICY "Users can manage generation runs in their projects" 
ON public.generation_runs 
FOR ALL 
USING (
  -- Check editorial_projects ownership
  EXISTS (
    SELECT 1 FROM editorial_projects p
    WHERE p.id = generation_runs.project_id AND p.owner_id = auth.uid()
  )
  OR
  -- Check projects ownership/membership
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = generation_runs.project_id AND has_project_access(auth.uid(), p.id)
  )
);