-- Add unique constraint on project_id for style_packs upsert
ALTER TABLE public.style_packs ADD CONSTRAINT style_packs_project_id_unique UNIQUE (project_id);

-- Add description column to style_packs
ALTER TABLE public.style_packs ADD COLUMN IF NOT EXISTS description TEXT;