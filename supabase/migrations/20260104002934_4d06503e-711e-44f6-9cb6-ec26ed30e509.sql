-- Create storage bucket for exports
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to exports bucket
CREATE POLICY "Authenticated users can upload exports"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'exports' 
  AND auth.role() = 'authenticated'
);

-- Allow public read access to exports
CREATE POLICY "Public read access to exports"
ON storage.objects
FOR SELECT
USING (bucket_id = 'exports');