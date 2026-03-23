-- ============================================================================
-- RELAX buyers_website_required FOR PE FIRMS
--
-- PE firms are auto-created as parent records when seeding platform companies.
-- Claude often doesn't provide PE firm websites (the focus is on the platform
-- company). The original constraint blocked these inserts, breaking the
-- pe_firm_id linkage for seeded buyers.
--
-- Updated constraint: PE firms (buyer_type = 'private_equity') are exempt
-- from the website requirement, alongside archived buyers.
-- ============================================================================

ALTER TABLE public.buyers
  DROP CONSTRAINT IF EXISTS buyers_website_required;

ALTER TABLE public.buyers
  ADD CONSTRAINT buyers_website_required
  CHECK (
    archived = true
    OR buyer_type = 'private_equity'
    OR (company_website IS NOT NULL AND trim(company_website) != '')
  );

COMMENT ON CONSTRAINT buyers_website_required ON public.buyers IS
  'Active buyers must have a non-empty company_website. '
  'Archived buyers and PE firms (auto-created as parents) are exempt. '
  'Updated 2026-06-02.';
