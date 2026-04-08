-- ============================================================================
-- ADD ADDITIONAL PHONE NUMBERS TO PROFILES
-- Date: 2026-04-08
-- Purpose: Allow marketplace contacts to store multiple phone numbers.
--          The existing phone_number column remains as the primary number;
--          additional_phone_numbers stores any extra numbers.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS additional_phone_numbers text[] DEFAULT '{}';

COMMENT ON COLUMN profiles.additional_phone_numbers IS
  'Additional phone numbers beyond the primary phone_number field';
