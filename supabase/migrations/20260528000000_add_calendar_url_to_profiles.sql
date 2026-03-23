-- Add calendar_url column to profiles table for per-presenter scheduling links
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_url TEXT;

-- Comment for documentation
COMMENT ON COLUMN profiles.calendar_url IS 'Per-admin calendar booking URL displayed on deal landing pages';
