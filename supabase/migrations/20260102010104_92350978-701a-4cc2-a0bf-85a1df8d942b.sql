-- Create storage bucket for video renders
INSERT INTO storage.buckets (id, name, public)
VALUES ('renders', 'renders', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to renders bucket
CREATE POLICY "Authenticated users can upload renders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'renders');

-- Allow public read access to renders
CREATE POLICY "Public read access to renders"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'renders');

-- Allow users to update their own renders
CREATE POLICY "Users can update own renders"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'renders')
WITH CHECK (bucket_id = 'renders');

-- Allow users to delete their own renders
CREATE POLICY "Users can delete own renders"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'renders');