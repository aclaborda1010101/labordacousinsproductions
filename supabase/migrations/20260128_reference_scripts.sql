-- ═══════════════════════════════════════════════════════════════════════════════
-- REFERENCE SCRIPTS - Base de conocimiento de guiones profesionales
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable pgvector if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla principal de guiones
CREATE TABLE IF NOT EXISTS reference_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  genre TEXT,
  format TEXT DEFAULT 'film', -- 'film' o 'series'
  year INTEGER,
  language TEXT DEFAULT 'en',
  
  -- Metadata del parsing
  pdf_path TEXT,
  parsed_at TIMESTAMPTZ,
  total_scenes INTEGER,
  total_pages INTEGER,
  total_words INTEGER,
  total_characters INTEGER,
  
  -- Calidad
  quality_score FLOAT,
  is_curated BOOLEAN DEFAULT FALSE,
  
  -- JSON flexible para metadata extra
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escenas parseadas con embedding
CREATE TABLE IF NOT EXISTS reference_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES reference_scripts(id) ON DELETE CASCADE,
  
  scene_number INTEGER NOT NULL,
  slugline TEXT,
  standardized_location TEXT,
  standardized_time TEXT,
  location_type TEXT, -- INT, EXT, INT/EXT
  
  -- Contenido
  action_text TEXT,
  dialogue JSONB DEFAULT '[]',
  characters TEXT[] DEFAULT '{}',
  
  -- Análisis
  mood TEXT,
  conflict_type TEXT,
  duration_estimate INTEGER, -- segundos estimados
  word_count INTEGER,
  
  -- Embedding para búsqueda semántica (1536 = OpenAI text-embedding-3-small)
  embedding vector(1536),
  
  -- Metadata
  quality_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patrones extraídos (para análisis estadístico)
CREATE TABLE IF NOT EXISTS script_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL, -- 'dialogue', 'action', 'structure', 'transition'
  genre TEXT,
  
  description TEXT,
  example TEXT,
  
  frequency INTEGER DEFAULT 1,
  quality_score FLOAT,
  
  source_script_id UUID REFERENCES reference_scripts(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reference_scripts_genre ON reference_scripts(genre);
CREATE INDEX IF NOT EXISTS idx_reference_scripts_format ON reference_scripts(format);
CREATE INDEX IF NOT EXISTS idx_reference_scenes_script ON reference_scenes(script_id);
CREATE INDEX IF NOT EXISTS idx_reference_scenes_mood ON reference_scenes(mood);
CREATE INDEX IF NOT EXISTS idx_script_patterns_type ON script_patterns(pattern_type, genre);

-- Índice vectorial para búsqueda de similitud
CREATE INDEX IF NOT EXISTS idx_reference_scenes_embedding 
ON reference_scenes USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Función para búsqueda de escenas similares
CREATE OR REPLACE FUNCTION match_reference_scenes(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  script_id UUID,
  script_title TEXT,
  script_genre TEXT,
  scene_number INTEGER,
  slugline TEXT,
  action_text TEXT,
  dialogue JSONB,
  mood TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rs.id,
    rs.script_id,
    s.title AS script_title,
    s.genre AS script_genre,
    rs.scene_number,
    rs.slugline,
    rs.action_text,
    rs.dialogue,
    rs.mood,
    1 - (rs.embedding <=> query_embedding) AS similarity
  FROM reference_scenes rs
  JOIN reference_scripts s ON s.id = rs.script_id
  WHERE rs.embedding IS NOT NULL
    AND 1 - (rs.embedding <=> query_embedding) > match_threshold
  ORDER BY rs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Función para buscar por texto (fallback)
CREATE OR REPLACE FUNCTION search_scenes_by_text(
  search_query TEXT,
  genre_filter TEXT DEFAULT NULL,
  max_results INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  script_title TEXT,
  script_genre TEXT,
  scene_number INTEGER,
  slugline TEXT,
  action_text TEXT,
  dialogue JSONB,
  mood TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rs.id,
    s.title AS script_title,
    s.genre AS script_genre,
    rs.scene_number,
    rs.slugline,
    rs.action_text,
    rs.dialogue,
    rs.mood
  FROM reference_scenes rs
  JOIN reference_scripts s ON s.id = rs.script_id
  WHERE 
    (genre_filter IS NULL OR s.genre = genre_filter)
    AND (
      rs.action_text ILIKE '%' || search_query || '%'
      OR rs.slugline ILIKE '%' || search_query || '%'
    )
  ORDER BY rs.scene_number
  LIMIT max_results;
END;
$$;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_reference_scripts_updated_at ON reference_scripts;
CREATE TRIGGER update_reference_scripts_updated_at
    BEFORE UPDATE ON reference_scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Stats view
CREATE OR REPLACE VIEW reference_scripts_stats AS
SELECT
  COUNT(*) AS total_scripts,
  COUNT(DISTINCT genre) AS unique_genres,
  SUM(total_scenes) AS total_scenes,
  AVG(quality_score) AS avg_quality,
  COUNT(*) FILTER (WHERE format = 'film') AS films,
  COUNT(*) FILTER (WHERE format = 'series') AS series,
  jsonb_object_agg(genre, count) AS by_genre
FROM (
  SELECT genre, COUNT(*) AS count
  FROM reference_scripts
  GROUP BY genre
) sub, reference_scripts;

COMMENT ON TABLE reference_scripts IS 'Guiones profesionales de referencia para RAG';
COMMENT ON TABLE reference_scenes IS 'Escenas parseadas con embeddings para búsqueda semántica';
COMMENT ON FUNCTION match_reference_scenes IS 'Busca escenas similares usando cosine similarity';
