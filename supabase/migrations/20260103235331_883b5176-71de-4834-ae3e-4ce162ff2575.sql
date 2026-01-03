-- Fix generate-run inserts: remove the incorrect FK on generation_runs.project_id
-- Current FK points to editorial_projects, but /projects flow uses projects.id.
-- MVP: drop the FK to allow both project types. We will validate projectId in the function code.

ALTER TABLE public.generation_runs
  DROP CONSTRAINT IF EXISTS generation_runs_project_id_fkey;