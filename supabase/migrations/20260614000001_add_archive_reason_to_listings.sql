-- Add archive_reason column to listings table for storing why a deal was archived
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS archive_reason text DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.listings.archive_reason IS 'Reason the deal was archived (e.g. Not Interested, Hired a Banker/Broker, Not the Right Time, Sold, Other)';
