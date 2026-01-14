-- ============================================
-- P0: Crear bucket project-assets para storyboards
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-assets', 
  'project-assets', 
  true,  -- Público para iterar rápido
  104857600,  -- 100MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Política: Usuarios autenticados pueden subir
CREATE POLICY "Authenticated users can upload project assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-assets');

-- Política: Cualquiera puede leer (bucket público)
CREATE POLICY "Public read access for project assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'project-assets');

-- Política: Usuarios autenticados pueden actualizar
CREATE POLICY "Authenticated users can update project assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'project-assets');

-- Política: Usuarios autenticados pueden eliminar
CREATE POLICY "Authenticated users can delete project assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-assets');

-- ============================================
-- Añadir campos de estado a storyboard_panels
-- ============================================

ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS image_error TEXT,
ADD COLUMN IF NOT EXISTS image_status TEXT DEFAULT 'pending';

COMMENT ON COLUMN storyboard_panels.image_error IS 'Error message if image generation failed';
COMMENT ON COLUMN storyboard_panels.image_status IS 'pending|generating|success|error';