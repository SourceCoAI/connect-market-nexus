-- Add PhoneBurner transcript support to deal_transcripts
-- Allows PhoneBurner call transcripts to be stored alongside Fireflies transcripts

-- Add phoneburner-specific fields (if not already present)
ALTER TABLE deal_transcripts
  ADD COLUMN IF NOT EXISTS phoneburner_call_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_activity_id UUID;

-- Index for deduplication of PhoneBurner transcripts
CREATE INDEX IF NOT EXISTS idx_deal_transcripts_phoneburner_call_id
  ON deal_transcripts(phoneburner_call_id)
  WHERE phoneburner_call_id IS NOT NULL;

-- Index for querying by source
CREATE INDEX IF NOT EXISTS idx_deal_transcripts_source
  ON deal_transcripts(source);

-- Backfill: ensure all existing Fireflies transcripts have source = 'fireflies'
UPDATE deal_transcripts
SET source = 'fireflies'
WHERE source IS NULL
  AND fireflies_transcript_id IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN deal_transcripts.phoneburner_call_id IS 'PhoneBurner call ID for deduplication';
COMMENT ON COLUMN deal_transcripts.recording_url IS 'URL to the call recording (PhoneBurner or other source)';
COMMENT ON COLUMN deal_transcripts.contact_activity_id IS 'Link to contact_activities row for PhoneBurner calls';
COMMENT ON COLUMN deal_transcripts.source IS 'Transcript source: fireflies, phoneburner, upload, link, manual';
