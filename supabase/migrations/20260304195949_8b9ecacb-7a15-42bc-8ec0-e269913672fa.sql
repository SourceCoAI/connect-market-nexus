ALTER TABLE valuation_leads 
  ADD COLUMN IF NOT EXISTS needs_buyer_search boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_buyer_universe boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS need_to_contact_owner boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_owner_contact boolean DEFAULT false;