-- V15: Persist-First Script Architecture
-- Add columns for script run tracking, type, episode, meta, and updated_at

ALTER TABLE scripts 
ADD COLUMN IF NOT EXISTS script_run_id uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS script_type text DEFAULT 'film',
ADD COLUMN IF NOT EXISTS episode_number integer,
ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create unique index for upsert safety (project + run = unique attempt)
CREATE UNIQUE INDEX IF NOT EXISTS scripts_project_run_idx 
ON scripts(project_id, script_run_id);

-- Index for searching by project + episode
CREATE INDEX IF NOT EXISTS scripts_project_episode_idx 
ON scripts(project_id, episode_number) 
WHERE episode_number IS NOT NULL;

-- Index for searching by status
CREATE INDEX IF NOT EXISTS scripts_status_idx 
ON scripts(status);

-- Trigger to auto-update updated_at column
DROP TRIGGER IF EXISTS set_scripts_updated_at ON scripts;
CREATE TRIGGER set_scripts_updated_at
BEFORE UPDATE ON scripts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();