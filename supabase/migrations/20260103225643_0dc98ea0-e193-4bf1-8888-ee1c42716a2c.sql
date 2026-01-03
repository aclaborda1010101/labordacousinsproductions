-- Create user_experience_profiles table for adaptive UX
CREATE TABLE public.user_experience_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Explicit profile selection
  declared_profile TEXT NOT NULL DEFAULT 'EXPLORER' 
    CHECK (declared_profile IN ('EXPLORER', 'CREATOR', 'PROFESSIONAL')),
  
  -- Inferred profile from behavior (can differ from declared)
  inferred_profile TEXT NOT NULL DEFAULT 'EXPLORER'
    CHECK (inferred_profile IN ('EXPLORER', 'CREATOR', 'PROFESSIONAL')),
  
  -- Confidence in inference (0-1, increases with more data)
  inference_confidence DECIMAL(3,2) DEFAULT 0.0,
  
  -- Onboarding questionnaire answers (for initial detection)
  onboarding_answers JSONB DEFAULT '{}',
  
  -- Timestamp tracking
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Unique constraint: one profile per user
  CONSTRAINT unique_user_profile UNIQUE(user_id)
);

-- Create user_telemetry_signals table for invisible cognitive tracking
CREATE TABLE public.user_telemetry_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Signal type categorization
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'help_request',           -- User asked for help
    'warning_ignored',        -- User ignored a system warning
    'warning_accepted',       -- User accepted a system suggestion
    'phase_completed_solo',   -- User completed phase without assistance
    'advanced_feature_used',  -- User used advanced functionality
    'structural_reversion',   -- User reverted a structural decision
    'coherence_violation',    -- System detected incoherence
    'time_anomaly',           -- Unusual time in a phase (too fast/slow)
    'editorial_intervention'  -- System had to intervene
  )),
  
  -- Signal context
  context JSONB DEFAULT '{}',
  
  -- Severity/weight for aggregation (1-10)
  weight INTEGER DEFAULT 5 CHECK (weight >= 1 AND weight <= 10),
  
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create project_user_profiles table for per-project UX settings
CREATE TABLE public.project_user_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- UX guidance level for this project (can evolve)
  guidance_level TEXT NOT NULL DEFAULT 'EXPLORER'
    CHECK (guidance_level IN ('EXPLORER', 'CREATOR', 'PROFESSIONAL')),
  
  -- Phase-specific overrides (some phases may need more/less guidance)
  phase_overrides JSONB DEFAULT '{}',
  
  -- Aggregated signals for this project
  help_requests_count INTEGER DEFAULT 0,
  warnings_ignored_count INTEGER DEFAULT 0,
  warnings_accepted_count INTEGER DEFAULT 0,
  phases_completed_solo INTEGER DEFAULT 0,
  structural_reversions INTEGER DEFAULT 0,
  coherence_violations INTEGER DEFAULT 0,
  
  -- Last computed metrics
  last_metrics_updated TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_project_user UNIQUE(project_id, user_id)
);

-- Enable RLS
ALTER TABLE public.user_experience_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_telemetry_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_experience_profiles (users can only see/edit their own)
CREATE POLICY "Users can view their own experience profile"
  ON public.user_experience_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own experience profile"
  ON public.user_experience_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own experience profile"
  ON public.user_experience_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for user_telemetry_signals
CREATE POLICY "Users can view their own signals"
  ON public.user_telemetry_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own signals"
  ON public.user_telemetry_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for project_user_profiles
CREATE POLICY "Users can view their project profiles"
  ON public.project_user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their project profiles"
  ON public.project_user_profiles FOR ALL
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_telemetry_user ON public.user_telemetry_signals(user_id);
CREATE INDEX idx_telemetry_project ON public.user_telemetry_signals(project_id);
CREATE INDEX idx_telemetry_type ON public.user_telemetry_signals(signal_type);
CREATE INDEX idx_project_user_profiles_project ON public.project_user_profiles(project_id);
CREATE INDEX idx_project_user_profiles_user ON public.project_user_profiles(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_experience_profiles_updated_at
  BEFORE UPDATE ON public.user_experience_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_user_profiles_updated_at
  BEFORE UPDATE ON public.project_user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();