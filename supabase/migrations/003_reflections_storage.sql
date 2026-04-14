-- Create the reflections storage bucket (public read, auth write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reflections',
  'reflections',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload into their own folder
CREATE POLICY "Users can upload their own reflections"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reflections'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to read their own uploads
CREATE POLICY "Users can view their own reflections"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'reflections'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read (bucket is public, needed for public URL access)
CREATE POLICY "Public can view reflection images"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'reflections');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete their own reflections"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'reflections'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
