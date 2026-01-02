-- ============================================
-- PHASE 3: CACHING + COST TRACKING TABLES
-- ============================================

-- 1. PROMPT CACHE TABLE
-- Stores successful generation results for reuse
CREATE TABLE IF NOT EXISTS public.prompt_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash TEXT NOT NULL,
  visual_dna_hash TEXT,
  anchor_id UUID REFERENCES reference_anchors(id) ON DELETE SET NULL,
  slot_type TEXT NOT NULL,
  cached_result_url TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  quality_score NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  UNIQUE(prompt_hash, visual_dna_hash, anchor_id)
);

CREATE INDEX idx_prompt_cache_hash ON prompt_cache(prompt_hash);
CREATE INDEX idx_prompt_cache_expires ON prompt_cache(expires_at);

-- 2. USER USAGE TABLE
-- Tracks generation costs per user per month
CREATE TABLE IF NOT EXISTS public.user_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  month DATE NOT NULL,
  generations_count INTEGER DEFAULT 0,
  generations_cost_usd NUMERIC(10,4) DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  storage_cost_usd NUMERIC(10,4) DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, month)
);

CREATE INDEX idx_user_usage_user_month ON user_usage(user_id, month);

-- 3. USER BUDGETS TABLE
-- Budget limits per user
CREATE TABLE IF NOT EXISTS public.user_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  daily_limit_usd NUMERIC(10,2) DEFAULT 10.00,
  monthly_limit_usd NUMERIC(10,2) DEFAULT 100.00,
  alert_threshold_percent INTEGER DEFAULT 80,
  pause_on_exceed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. GENERATION LOGS TABLE
-- Detailed log of every generation for analytics
CREATE TABLE IF NOT EXISTS public.generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  slot_id UUID,
  slot_type TEXT,
  engine TEXT DEFAULT 'gemini-3-pro-image',
  prompt_hash TEXT,
  cost_usd NUMERIC(10,4),
  duration_ms INTEGER,
  success BOOLEAN,
  from_cache BOOLEAN DEFAULT false,
  qc_score NUMERIC,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_generation_logs_user ON generation_logs(user_id, created_at DESC);
CREATE INDEX idx_generation_logs_project ON generation_logs(project_id, created_at DESC);
CREATE INDEX idx_generation_logs_character ON generation_logs(character_id);

-- 5. STYLE PRESETS TABLE
-- Cinematic style presets for projects
CREATE TABLE IF NOT EXISTS public.style_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'cinematic',
  preset_data JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_by UUID,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default cinematic presets
INSERT INTO style_presets (name, description, category, preset_data, is_system) VALUES
('Noir', 'Classic film noir with high contrast shadows', 'cinematic', '{
  "lighting": "high_contrast_shadows",
  "color_grade": "desaturated_blue_tint",
  "grain": "heavy_film_grain",
  "contrast": 1.4,
  "saturation": -0.3,
  "shadows_tint": "#1a1a2e"
}', true),
('Wes Anderson', 'Symmetrical compositions with pastel palette', 'cinematic', '{
  "composition": "perfectly_centered_symmetrical",
  "color_palette": "pastel_warm",
  "camera": "static_locked_off",
  "saturation": 0.2,
  "warmth": 1.1,
  "vignette": 0.1
}', true),
('Blade Runner', 'Neon-lit cyberpunk atmosphere', 'cinematic', '{
  "lighting": "neon_practical_lights",
  "atmosphere": "hazy_volumetric_fog",
  "color_grade": "teal_orange",
  "contrast": 1.2,
  "highlights_tint": "#ff6b35",
  "shadows_tint": "#00d4aa"
}', true),
('Vintage Film', 'Nostalgic film look with warm tones', 'cinematic', '{
  "fade": 0.2,
  "grain": "medium",
  "vignette": 0.3,
  "warmth": 1.15,
  "saturation": -0.1,
  "contrast": 0.95
}', true),
('Bleach Bypass', 'Desaturated high-contrast look', 'cinematic', '{
  "saturation": -0.4,
  "contrast": 1.5,
  "grain": "heavy",
  "highlights": 1.1,
  "shadows": 0.9
}', true),
('Golden Hour', 'Warm sunset lighting', 'cinematic', '{
  "warmth": 1.3,
  "saturation": 0.1,
  "shadows_tint": "#ff9500",
  "highlights_tint": "#ffcc00",
  "contrast": 1.1
}', true),
('Moonlight', 'Cool blue night atmosphere', 'cinematic', '{
  "warmth": 0.8,
  "saturation": -0.2,
  "shadows_tint": "#1e3a5f",
  "highlights_tint": "#87ceeb",
  "contrast": 1.2
}', true)
ON CONFLICT DO NOTHING;

-- 6. HELPER FUNCTIONS

-- Increment user usage
CREATE OR REPLACE FUNCTION increment_user_usage(
  p_user_id UUID,
  p_month DATE,
  p_cost NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_usage (user_id, month, generations_count, generations_cost_usd, total_cost_usd)
  VALUES (p_user_id, p_month, 1, p_cost, p_cost)
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    generations_count = user_usage.generations_count + 1,
    generations_cost_usd = user_usage.generations_cost_usd + p_cost,
    total_cost_usd = user_usage.total_cost_usd + p_cost,
    updated_at = NOW();
END;
$$;

-- Check if user can generate (within budget)
CREATE OR REPLACE FUNCTION can_user_generate(p_user_id UUID)
RETURNS TABLE(allowed BOOLEAN, reason TEXT, usage_today NUMERIC, limit_today NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget RECORD;
  v_today_usage NUMERIC;
  v_month_usage NUMERIC;
BEGIN
  -- Get user budget
  SELECT * INTO v_budget FROM user_budgets WHERE user_id = p_user_id;
  
  -- If no budget set, allow
  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 'No budget limits set'::TEXT, 0::NUMERIC, 999::NUMERIC;
    RETURN;
  END IF;
  
  -- Get today's usage
  SELECT COALESCE(SUM(cost_usd), 0) INTO v_today_usage
  FROM generation_logs
  WHERE user_id = p_user_id
    AND created_at >= CURRENT_DATE;
  
  -- Check daily limit
  IF v_budget.pause_on_exceed AND v_today_usage >= v_budget.daily_limit_usd THEN
    RETURN QUERY SELECT false, 'Daily budget exceeded'::TEXT, v_today_usage, v_budget.daily_limit_usd;
    RETURN;
  END IF;
  
  -- Get month usage
  SELECT COALESCE(total_cost_usd, 0) INTO v_month_usage
  FROM user_usage
  WHERE user_id = p_user_id
    AND month = DATE_TRUNC('month', CURRENT_DATE)::DATE;
  
  -- Check monthly limit
  IF v_budget.pause_on_exceed AND v_month_usage >= v_budget.monthly_limit_usd THEN
    RETURN QUERY SELECT false, 'Monthly budget exceeded'::TEXT, v_today_usage, v_budget.daily_limit_usd;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, 'OK'::TEXT, v_today_usage, v_budget.daily_limit_usd;
END;
$$;

-- Get cached result
CREATE OR REPLACE FUNCTION get_cached_generation(
  p_prompt_hash TEXT,
  p_visual_dna_hash TEXT DEFAULT NULL,
  p_anchor_id UUID DEFAULT NULL
)
RETURNS TABLE(cached_url TEXT, quality NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT pc.cached_result_url, pc.quality_score
  FROM prompt_cache pc
  WHERE pc.prompt_hash = p_prompt_hash
    AND (p_visual_dna_hash IS NULL OR pc.visual_dna_hash = p_visual_dna_hash)
    AND (p_anchor_id IS NULL OR pc.anchor_id = p_anchor_id)
    AND pc.expires_at > NOW()
    AND pc.quality_score >= 80
  ORDER BY pc.quality_score DESC, pc.last_used_at DESC
  LIMIT 1;
  
  -- Update usage if found
  IF FOUND THEN
    UPDATE prompt_cache
    SET usage_count = usage_count + 1, last_used_at = NOW()
    WHERE prompt_hash = p_prompt_hash;
  END IF;
END;
$$;

-- Save to cache
CREATE OR REPLACE FUNCTION save_to_cache(
  p_prompt_hash TEXT,
  p_visual_dna_hash TEXT,
  p_anchor_id UUID,
  p_slot_type TEXT,
  p_result_url TEXT,
  p_quality_score NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO prompt_cache (prompt_hash, visual_dna_hash, anchor_id, slot_type, cached_result_url, quality_score)
  VALUES (p_prompt_hash, p_visual_dna_hash, p_anchor_id, p_slot_type, p_result_url, p_quality_score)
  ON CONFLICT (prompt_hash, visual_dna_hash, anchor_id)
  DO UPDATE SET
    cached_result_url = p_result_url,
    quality_score = GREATEST(prompt_cache.quality_score, p_quality_score),
    usage_count = prompt_cache.usage_count + 1,
    last_used_at = NOW(),
    expires_at = NOW() + INTERVAL '30 days';
END;
$$;

-- Clean expired cache
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM prompt_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Enable RLS
ALTER TABLE prompt_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Cache is accessible to all authenticated users"
ON prompt_cache FOR ALL TO authenticated USING (true);

CREATE POLICY "Users can view their own usage"
ON user_usage FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can view their own budget"
ON user_budgets FOR ALL TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can view their own logs"
ON generation_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can insert logs"
ON generation_logs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can view style presets"
ON style_presets FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users can create custom presets"
ON style_presets FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());