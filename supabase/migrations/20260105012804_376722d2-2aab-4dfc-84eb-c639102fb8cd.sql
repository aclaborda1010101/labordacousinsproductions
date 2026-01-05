-- Add Iceberg Character Pack columns to characters table
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS pack_status TEXT DEFAULT 'hero_only' 
  CHECK (pack_status IN ('hero_only', 'building', 'ready'));

ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS is_ready_for_video BOOLEAN DEFAULT false;

ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS visual_dna JSONB DEFAULT '{}';

-- Add run_id to character_pack_slots to link to generation_runs
ALTER TABLE public.character_pack_slots 
ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES public.generation_runs(id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_character_pack_slots_run_id ON public.character_pack_slots(run_id);
CREATE INDEX IF NOT EXISTS idx_characters_pack_status ON public.characters(pack_status);