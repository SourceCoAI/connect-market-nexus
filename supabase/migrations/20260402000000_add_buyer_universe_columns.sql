-- Add buyer universe label and description columns to listings
-- These are AI-generated fields that describe who would buy this company
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS buyer_universe_label text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS buyer_universe_description text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS buyer_universe_generated_at timestamptz;

-- Merged from: 20260402000000_clean_description_matching_contact_name.sql
-- Clean up listings where description incorrectly contains the contact name
-- This typically happens from CSV imports where the description column was
-- populated with contact name data instead of actual business descriptions.
UPDATE listings
SET description = NULL
WHERE description IS NOT NULL
  AND main_contact_name IS NOT NULL
  AND TRIM(description) = TRIM(main_contact_name);

-- Merged from: 20260402000000_fix_deal_transcripts_source_and_fireflies_id.sql
-- Fix deal_transcripts records with invalid source values
-- Records with Fireflies URLs stored in source column should use 'fireflies'
UPDATE deal_transcripts
SET source = 'fireflies'
WHERE source LIKE 'https://app.fireflies.ai/%';

-- Fix Fireflies transcripts missing fireflies_transcript_id
-- Extract the ID portion from the transcript_url if available
UPDATE deal_transcripts
SET fireflies_transcript_id = COALESCE(
  -- Try to extract from transcript_url: last path segment
  CASE
    WHEN transcript_url IS NOT NULL AND transcript_url LIKE '%fireflies.ai%'
    THEN regexp_replace(transcript_url, '^.*/([^/]+)$', '\1')
    ELSE NULL
  END,
  -- Fallback: generate a placeholder so the NOT NULL expectation is met
  'unknown-' || id::text
)
WHERE source = 'fireflies'
  AND fireflies_transcript_id IS NULL;
