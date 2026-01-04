-- Create storage bucket for scripts (PDF, TXT, DOC uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scripts', 
  'scripts', 
  true,
  52428800, -- 50MB limit
  ARRAY['text/plain', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Allow authenticated users to upload scripts
CREATE POLICY "Authenticated users can upload scripts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'scripts');

-- Allow authenticated users to read scripts
CREATE POLICY "Authenticated users can read scripts"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'scripts');

-- Allow public read for scripts (needed for edge function processing)
CREATE POLICY "Public can read scripts"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'scripts');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own scripts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'scripts' AND auth.uid()::text = (storage.foldername(name))[1]);