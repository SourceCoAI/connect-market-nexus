-- Add webflow_slug column to listings for mapping Webflow deal memo pages
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS webflow_slug TEXT;

-- Unique index so each slug maps to one listing
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_webflow_slug ON public.listings (webflow_slug) WHERE webflow_slug IS NOT NULL;