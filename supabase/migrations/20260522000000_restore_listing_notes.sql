-- Restore listing_notes table that was incorrectly dropped in 20260503000000.
-- The ListingNotesLog component on the deal Contact History tab actively uses this table.

CREATE TABLE IF NOT EXISTS public.listing_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.listing_notes ENABLE ROW LEVEL SECURITY;

-- Admin-only access policies
CREATE POLICY "Admins can view listing notes"
  ON public.listing_notes FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can create listing notes"
  ON public.listing_notes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete listing notes"
  ON public.listing_notes FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_listing_notes_listing_id ON public.listing_notes(listing_id);
