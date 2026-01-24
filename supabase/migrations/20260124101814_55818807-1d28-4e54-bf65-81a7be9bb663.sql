-- Create series_bibles table for storing generated series bibles
CREATE TABLE public.series_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  
  -- Core content
  logline TEXT,
  premise TEXT,
  
  -- Artifact rules (JSON) - confirmed rules and undefined aspects
  artifact_rules JSONB DEFAULT '{"confirmed": [], "undefined": []}',
  
  -- Characters (JSON array) with arcs
  character_arcs JSONB DEFAULT '[]',
  
  -- Antagonism forces (JSON)
  antagonism JSONB DEFAULT '{}',
  
  -- Season structure (JSON)
  season_structure JSONB DEFAULT '{}',
  
  -- Episode template (JSON)
  episode_template JSONB DEFAULT '{}',
  
  -- Tone guidelines (JSON)
  tone_guidelines JSONB DEFAULT '{"promises": [], "red_lines": []}',
  
  -- Metadata
  source_script_id UUID REFERENCES scripts(id) ON DELETE SET NULL,
  generation_model TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Index for fast lookups
CREATE INDEX idx_series_bibles_project ON series_bibles(project_id);
CREATE INDEX idx_series_bibles_status ON series_bibles(status);

-- Enable RLS
ALTER TABLE series_bibles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own project bibles" ON series_bibles
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert to own projects" ON series_bibles
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own project bibles" ON series_bibles
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own project bibles" ON series_bibles
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- Trigger for updated_at
CREATE TRIGGER update_series_bibles_updated_at
  BEFORE UPDATE ON series_bibles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();