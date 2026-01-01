-- Create storage bucket for character pack images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('character-packs', 'character-packs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Users can upload character pack images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'character-packs' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to update their uploads
CREATE POLICY "Users can update character pack images"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'character-packs' AND auth.uid() IS NOT NULL);

-- Allow public read access to character pack images
CREATE POLICY "Character pack images are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'character-packs');