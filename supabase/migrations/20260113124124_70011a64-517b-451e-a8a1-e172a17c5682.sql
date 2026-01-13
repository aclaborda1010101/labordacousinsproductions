-- Añadir columnas faltantes a projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS logline TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS genre TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tone TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS narrative_framework TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS global_visual_dna JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS style_pack TEXT;

-- Añadir columna faltante a locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS narrative_role TEXT;