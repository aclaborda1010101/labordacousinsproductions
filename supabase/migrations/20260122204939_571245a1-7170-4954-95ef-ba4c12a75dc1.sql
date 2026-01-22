-- Scene repairs table for narrative validation system
CREATE TABLE scene_repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  scene_intent_id UUID REFERENCES scene_intent(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Scene context
  scene_number INTEGER,
  episode_number INTEGER DEFAULT 1,
  
  -- Diagnosis from narrative-validate
  issues JSONB NOT NULL DEFAULT '[]',
  failed_checks JSONB DEFAULT '[]',
  validation_score INTEGER DEFAULT 0,
  strategy TEXT CHECK (strategy IN ('rewrite', 'partial', 'accept_degraded')) DEFAULT 'rewrite',
  
  -- Retry control
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 2,
  status TEXT CHECK (status IN ('pending', 'repairing', 'done', 'failed', 'rejected')) DEFAULT 'pending',
  
  -- Result
  repaired_scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  repair_log JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_scene_repairs_pending ON scene_repairs(project_id, status) WHERE status = 'pending';
CREATE INDEX idx_scene_repairs_scene ON scene_repairs(scene_id);
CREATE INDEX idx_scene_repairs_project ON scene_repairs(project_id);

-- RLS
ALTER TABLE scene_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scene repairs for their projects"
ON scene_repairs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM project_members WHERE project_id = scene_repairs.project_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert scene repairs for their projects"
ON scene_repairs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM project_members WHERE project_id = scene_repairs.project_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update scene repairs for their projects"
ON scene_repairs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM project_members WHERE project_id = scene_repairs.project_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete scene repairs for their projects"
ON scene_repairs FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM project_members WHERE project_id = scene_repairs.project_id AND user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_scene_repairs_timestamp
BEFORE UPDATE ON scene_repairs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime for frontend subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE scene_repairs;

-- Add validation fields to scenes table
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS validation_score INTEGER;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS validation_status TEXT CHECK (validation_status IN ('pending', 'valid', 'needs_repair', 'repaired', 'rejected'));

-- Add validated status to scene_intent
ALTER TABLE scene_intent DROP CONSTRAINT IF EXISTS scene_intent_status_check;
ALTER TABLE scene_intent ADD CONSTRAINT scene_intent_status_check 
  CHECK (status IN ('pending', 'planning', 'planned', 'writing', 'written', 'needs_repair', 'repairing', 'validated', 'rejected'));