-- Add token tracking columns to generation_logs
ALTER TABLE public.generation_logs
ADD COLUMN IF NOT EXISTS input_tokens integer,
ADD COLUMN IF NOT EXISTS output_tokens integer,
ADD COLUMN IF NOT EXISTS total_tokens integer,
ADD COLUMN IF NOT EXISTS model text,
ADD COLUMN IF NOT EXISTS episode_id uuid REFERENCES public.episodes(id),
ADD COLUMN IF NOT EXISTS scene_id uuid REFERENCES public.scenes(id);

-- Create index for cost analysis by episode/scene
CREATE INDEX IF NOT EXISTS idx_generation_logs_episode ON public.generation_logs(episode_id);
CREATE INDEX IF NOT EXISTS idx_generation_logs_scene ON public.generation_logs(scene_id);
CREATE INDEX IF NOT EXISTS idx_generation_logs_slot_type ON public.generation_logs(slot_type);

-- Add category column for better breakdown
ALTER TABLE public.generation_logs
ADD COLUMN IF NOT EXISTS category text DEFAULT 'other';

COMMENT ON COLUMN public.generation_logs.input_tokens IS 'Input tokens consumed';
COMMENT ON COLUMN public.generation_logs.output_tokens IS 'Output tokens generated';
COMMENT ON COLUMN public.generation_logs.total_tokens IS 'Total tokens used';
COMMENT ON COLUMN public.generation_logs.category IS 'Cost category: script, character, location, keyframe, shot, other';