-- Add scene_number column if it doesn't exist
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_number INTEGER;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_scenes_scene_number ON scenes(scene_number);
CREATE INDEX IF NOT EXISTS idx_scenes_project_scene ON scenes(project_id, scene_number);