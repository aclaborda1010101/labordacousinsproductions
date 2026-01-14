-- Fix RLS policies for scene_camera_plan
-- Current policies use project_members which is empty, blocking all queries
-- New policies use projects.owner_id to match the pattern used by other tables

-- Drop existing policies (based on project_members)
DROP POLICY IF EXISTS "Users can view camera plans for their projects" ON scene_camera_plan;
DROP POLICY IF EXISTS "Users can insert camera plans for their projects" ON scene_camera_plan;
DROP POLICY IF EXISTS "Users can update camera plans for their projects" ON scene_camera_plan;
DROP POLICY IF EXISTS "Users can delete camera plans for their projects" ON scene_camera_plan;

-- Create new policies (based on projects.owner_id)
CREATE POLICY "Users can view camera plans in their projects" ON scene_camera_plan
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = scene_camera_plan.project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert camera plans in their projects" ON scene_camera_plan
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = scene_camera_plan.project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update camera plans in their projects" ON scene_camera_plan
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = scene_camera_plan.project_id
        AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete camera plans in their projects" ON scene_camera_plan
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = scene_camera_plan.project_id
        AND p.owner_id = auth.uid()
    )
  );