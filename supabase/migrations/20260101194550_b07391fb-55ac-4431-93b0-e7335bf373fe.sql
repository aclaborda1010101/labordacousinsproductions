-- CINEFORGE Studio Database Schema
-- Core enums
CREATE TYPE public.app_role AS ENUM ('owner', 'producer', 'director', 'writer', 'dp', 'sound', 'reviewer');
CREATE TYPE public.project_format AS ENUM ('series', 'mini', 'film');
CREATE TYPE public.quality_mode AS ENUM ('CINE', 'ULTRA');
CREATE TYPE public.priority_level AS ENUM ('P0', 'P1', 'P2');
CREATE TYPE public.job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'blocked');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.dailies_decision AS ENUM ('SELECT', 'FIX', 'REJECT', 'NONE');

-- User profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Role checking function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  format project_format NOT NULL DEFAULT 'series',
  episodes_count INTEGER NOT NULL DEFAULT 1,
  target_duration_min INTEGER NOT NULL DEFAULT 30,
  master_language TEXT NOT NULL DEFAULT 'en',
  target_languages TEXT[] DEFAULT ARRAY['en'],
  budget_cap_project_eur NUMERIC(12,2),
  budget_cap_episode_eur NUMERIC(12,2),
  budget_cap_scene_eur NUMERIC(12,2),
  bible_completeness_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = owner_id);

-- Project members
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'reviewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Function to check project access
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id
  )
$$;

CREATE POLICY "Members can view project members" ON public.project_members 
  FOR SELECT USING (public.has_project_access(auth.uid(), project_id));
CREATE POLICY "Owners can manage members" ON public.project_members 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  );

-- Style packs (Canon)
CREATE TABLE public.style_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  aspect_ratio TEXT DEFAULT '16:9',
  fps INTEGER DEFAULT 24,
  lens_style TEXT,
  grain_level TEXT DEFAULT 'subtle',
  color_palette JSONB DEFAULT '{}',
  lighting_rules JSONB DEFAULT '[]',
  forbidden_rules JSONB DEFAULT '[]',
  token TEXT,
  reference_urls JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.style_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for style packs" ON public.style_packs
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Characters (Canon)
CREATE TABLE public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  bio TEXT,
  arc TEXT,
  voice_card JSONB DEFAULT '{}',
  canon_rules JSONB DEFAULT '{}',
  expressions JSONB DEFAULT '[]',
  token TEXT,
  turnaround_urls JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for characters" ON public.characters
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Character outfits
CREATE TABLE public.character_outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  reference_urls JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.character_outfits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via character" ON public.character_outfits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.characters c 
      WHERE c.id = character_id AND public.has_project_access(auth.uid(), c.project_id)
    )
  );

-- Locations (Canon)
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  variants JSONB DEFAULT '{"day": true, "night": true, "weather": ["clear"]}',
  props JSONB DEFAULT '[]',
  sound_profile JSONB DEFAULT '{"room_tone": "", "ambience": ""}',
  token TEXT,
  reference_urls JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for locations" ON public.locations
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Scripts
CREATE TABLE public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  raw_text TEXT,
  file_url TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for scripts" ON public.scripts
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Scenes
CREATE TABLE public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  episode_no INTEGER NOT NULL DEFAULT 1,
  scene_no INTEGER NOT NULL,
  slugline TEXT NOT NULL,
  summary TEXT,
  beats JSONB DEFAULT '[]',
  character_ids UUID[] DEFAULT '{}',
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  time_of_day TEXT DEFAULT 'day',
  mood JSONB DEFAULT '{}',
  approved BOOLEAN DEFAULT false,
  quality_mode quality_mode NOT NULL DEFAULT 'CINE',
  priority priority_level NOT NULL DEFAULT 'P1',
  retry_override NUMERIC(4,2),
  padding_override NUMERIC(4,2),
  max_attempts_override INTEGER,
  estimated_cost JSONB DEFAULT '{}',
  approval_status approval_status DEFAULT 'pending',
  assigned_role app_role,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, episode_no, scene_no)
);

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for scenes" ON public.scenes
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Shots
CREATE TABLE public.shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE NOT NULL,
  shot_no INTEGER NOT NULL,
  shot_type TEXT NOT NULL DEFAULT 'medium',
  camera JSONB DEFAULT '{}',
  duration_target NUMERIC(6,2) DEFAULT 3.0,
  blocking JSONB DEFAULT '{}',
  dialogue_text TEXT,
  sound_plan JSONB DEFAULT '{}',
  approved BOOLEAN DEFAULT false,
  hero BOOLEAN DEFAULT false,
  effective_mode quality_mode NOT NULL DEFAULT 'CINE',
  estimated_cost JSONB DEFAULT '{}',
  approval_status approval_status DEFAULT 'pending',
  assigned_role app_role,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via scene" ON public.shots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.scenes s 
      WHERE s.id = scene_id AND public.has_project_access(auth.uid(), s.project_id)
    )
  );

-- Keyframes
CREATE TABLE public.keyframes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id UUID REFERENCES public.shots(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT,
  prompt_text TEXT,
  seed BIGINT,
  version INTEGER DEFAULT 1,
  approved BOOLEAN DEFAULT false,
  locks JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.keyframes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via shot" ON public.keyframes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.shots sh
      JOIN public.scenes sc ON sc.id = sh.scene_id
      WHERE sh.id = shot_id AND public.has_project_access(auth.uid(), sc.project_id)
    )
  );

-- Renders
CREATE TABLE public.renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id UUID REFERENCES public.shots(id) ON DELETE CASCADE NOT NULL,
  engine TEXT DEFAULT 'veo',
  status job_status DEFAULT 'queued',
  take_label TEXT DEFAULT 'A',
  video_url TEXT,
  audio_url TEXT,
  prompt_text TEXT,
  refs JSONB DEFAULT '{}',
  params JSONB DEFAULT '{}',
  locked BOOLEAN DEFAULT false,
  rating JSONB DEFAULT '{}',
  cost_estimate NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via shot" ON public.renders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.shots sh
      JOIN public.scenes sc ON sc.id = sh.scene_id
      WHERE sh.id = shot_id AND public.has_project_access(auth.uid(), sc.project_id)
    )
  );

-- QC Reports
CREATE TABLE public.qc_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE,
  shot_id UUID REFERENCES public.shots(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  issues JSONB DEFAULT '[]',
  fix_notes JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qc_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for QC" ON public.qc_reports
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Episode QC
CREATE TABLE public.episode_qc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  episode_no INTEGER NOT NULL,
  score INTEGER DEFAULT 0,
  summary JSONB DEFAULT '{}',
  waivers JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, episode_no)
);

ALTER TABLE public.episode_qc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for episode QC" ON public.episode_qc
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Cost assumptions
CREATE TABLE public.cost_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL UNIQUE,
  padding_low NUMERIC(4,2) DEFAULT 0.10,
  padding_expected NUMERIC(4,2) DEFAULT 0.15,
  padding_high NUMERIC(4,2) DEFAULT 0.20,
  retry_cine_low NUMERIC(4,2) DEFAULT 0.10,
  retry_cine_expected NUMERIC(4,2) DEFAULT 0.15,
  retry_cine_high NUMERIC(4,2) DEFAULT 0.25,
  retry_ultra_low NUMERIC(4,2) DEFAULT 0.20,
  retry_ultra_expected NUMERIC(4,2) DEFAULT 0.40,
  retry_ultra_high NUMERIC(4,2) DEFAULT 0.60,
  retry_hero_low NUMERIC(4,2) DEFAULT 0.15,
  retry_hero_expected NUMERIC(4,2) DEFAULT 0.25,
  retry_hero_high NUMERIC(4,2) DEFAULT 0.45,
  max_attempts_cine INTEGER DEFAULT 3,
  max_attempts_ultra INTEGER DEFAULT 4,
  max_attempts_hero INTEGER DEFAULT 4,
  price_per_sec NUMERIC(10,4) DEFAULT 0.05,
  currency TEXT DEFAULT 'EUR',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for costs" ON public.cost_assumptions
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Jobs queue
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  status job_status DEFAULT 'queued',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  backoff_sec INTEGER DEFAULT 60,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for jobs" ON public.jobs
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Dailies sessions
CREATE TABLE public.dailies_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dailies_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for dailies" ON public.dailies_sessions
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Dailies items
CREATE TABLE public.dailies_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.dailies_sessions(id) ON DELETE CASCADE NOT NULL,
  render_id UUID REFERENCES public.renders(id) ON DELETE CASCADE NOT NULL,
  decision dailies_decision DEFAULT 'NONE',
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dailies_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via session" ON public.dailies_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.dailies_sessions ds
      WHERE ds.id = session_id AND public.has_project_access(auth.uid(), ds.project_id)
    )
  );

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  episode_no INTEGER,
  priority priority_level DEFAULT 'P1',
  title TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'todo',
  linked_entity_type TEXT,
  linked_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for tasks" ON public.tasks
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Comments
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for comments" ON public.comments
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Frame notes
CREATE TABLE public.frame_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  render_id UUID REFERENCES public.renders(id) ON DELETE CASCADE NOT NULL,
  timestamp_sec NUMERIC(8,2) NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.frame_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via render" ON public.frame_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.renders r
      JOIN public.shots sh ON sh.id = r.shot_id
      JOIN public.scenes sc ON sc.id = sh.scene_id
      WHERE r.id = render_id AND public.has_project_access(auth.uid(), sc.project_id)
    )
  );

-- Decisions log (audit trail)
CREATE TABLE public.decisions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.decisions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project access for log" ON public.decisions_log
  FOR ALL USING (public.has_project_access(auth.uid(), project_id));

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_style_packs_updated_at BEFORE UPDATE ON public.style_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON public.scenes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shots_updated_at BEFORE UPDATE ON public.shots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cost_assumptions_updated_at BEFORE UPDATE ON public.cost_assumptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();