-- =========================================================================
-- V70: CLEANUP ZOMBIE STATE + CREATE NARRATIVE ARCHITECTURE
-- =========================================================================

-- 1. CLEANUP: Mark zombie scripts as failed
UPDATE scripts 
SET status = 'failed', 
    meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{cleanup_reason}', '"zombie_cleanup_v70"')
WHERE status = 'generating' 
  AND created_at < NOW() - INTERVAL '30 minutes';

-- 2. CLEANUP: Clear expired project locks (using correct column: expires_at)
DELETE FROM project_locks 
WHERE expires_at < NOW();

-- 3. CLEANUP: Mark zombie background_tasks as failed
UPDATE background_tasks
SET status = 'failed',
    error = 'Zombie cleanup v70 - stuck process detected'
WHERE status IN ('running', 'pending')
  AND updated_at < NOW() - INTERVAL '15 minutes';

-- =========================================================================
-- 4. CREATE: narrative_state table (with hard anchors - Jarvis fix #1)
-- =========================================================================
CREATE TABLE IF NOT EXISTS narrative_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('film', 'series', 'ad')),
  
  -- Current unit
  unit_type TEXT NOT NULL DEFAULT 'episode',
  unit_ref TEXT NOT NULL DEFAULT '1',
  current_phase TEXT NOT NULL DEFAULT 'setup',
  
  -- Live narrative state (Lovable proposal)
  narrative_goal TEXT,
  emotional_delta TEXT,
  last_unit_summary TEXT,
  
  -- HARD ANCHORS (Jarvis critical fix #1)
  locked_facts JSONB DEFAULT '[]'::jsonb,
  forbidden_actions JSONB DEFAULT '[]'::jsonb,
  active_threads JSONB DEFAULT '[]'::jsonb,
  unresolved_questions JSONB DEFAULT '[]'::jsonb,
  
  -- Threads and arcs
  open_threads JSONB DEFAULT '[]'::jsonb,
  resolved_threads JSONB DEFAULT '[]'::jsonb,
  character_arcs JSONB DEFAULT '{}'::jsonb,
  
  -- Accumulated canon
  canon_facts JSONB DEFAULT '[]'::jsonb,
  
  -- Metrics
  scenes_generated INTEGER DEFAULT 0,
  pacing_meter NUMERIC DEFAULT 0.5,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id)
);

-- RLS for narrative_state
ALTER TABLE narrative_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their project narrative state"
ON narrative_state FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_narrative_state_timestamp
BEFORE UPDATE ON narrative_state
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================================================
-- 5. CREATE: scene_intent table (Jarvis critical fix #2)
-- =========================================================================
CREATE TABLE IF NOT EXISTS scene_intent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  narrative_state_id UUID REFERENCES narrative_state(id),
  
  -- Identification
  scene_number INTEGER NOT NULL,
  episode_number INTEGER DEFAULT 1,
  
  -- Intent (NO prose, structure only)
  intent_summary TEXT NOT NULL,
  emotional_turn TEXT,
  information_revealed JSONB DEFAULT '[]',
  information_hidden JSONB DEFAULT '[]',
  characters_involved JSONB DEFAULT '[]',
  thread_to_advance TEXT,
  
  -- Constraints
  constraints JSONB DEFAULT '{}'::jsonb,
  
  -- Job status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'writing', 'written', 'validated', 'failed')),
  job_id UUID,
  
  -- Result
  scene_id UUID REFERENCES scenes(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, episode_number, scene_number)
);

-- RLS for scene_intent
ALTER TABLE scene_intent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage scene intents"
ON scene_intent FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_scene_intent_timestamp
BEFORE UPDATE ON scene_intent
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================================================
-- 6. INDEXES for efficient queries
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_narrative_state_project 
ON narrative_state(project_id);

CREATE INDEX IF NOT EXISTS idx_scene_intent_project_episode 
ON scene_intent(project_id, episode_number);

CREATE INDEX IF NOT EXISTS idx_scene_intent_status 
ON scene_intent(status) 
WHERE status IN ('pending', 'writing');

-- Enable realtime for progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE scene_intent;