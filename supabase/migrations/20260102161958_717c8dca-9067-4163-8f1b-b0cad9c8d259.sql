-- Create character-references storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('character-references', 'character-references', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy
CREATE POLICY "Public read access for character-references"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'character-references');

-- Authenticated insert policy
CREATE POLICY "Authenticated users can upload to character-references"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'character-references');

-- Authenticated update policy  
CREATE POLICY "Authenticated users can update character-references"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'character-references');

-- Authenticated delete policy
CREATE POLICY "Authenticated users can delete from character-references"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'character-references');