-- Create the agreement-templates storage bucket for NDA/Fee Agreement PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('agreement-templates', 'agreement-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for agreement template files
CREATE POLICY "Agreement templates are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'agreement-templates');

-- Only admins can upload agreement templates
CREATE POLICY "Only admins can upload agreement templates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'agreement-templates'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);

-- Only admins can update agreement templates
CREATE POLICY "Only admins can update agreement templates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'agreement-templates'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);

-- Only admins can delete agreement templates
CREATE POLICY "Only admins can delete agreement templates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'agreement-templates'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);