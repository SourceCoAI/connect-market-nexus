-- Create a dedicated internal listing for General Inquiry threads
INSERT INTO public.listings (
  id, title, category, status, description, location,
  revenue, ebitda, is_internal_deal, website,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'General Inquiry',
  'Internal',
  'internal',
  'Internal listing used for general buyer inquiries not tied to a specific deal.',
  'N/A',
  0, 0, true, 'https://internal.sourcecodeals.com/general-inquiry',
  now(), now()
)
ON CONFLICT (id) DO NOTHING;

-- Store the listing ID in app_settings for easy lookup
INSERT INTO public.app_settings (key, value)
VALUES ('general_inquiry_listing_id', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();