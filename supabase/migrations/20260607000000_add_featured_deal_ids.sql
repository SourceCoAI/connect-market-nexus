-- Add featured_deal_ids column to listings table.
-- When set, these two deals are shown in the "Related Deals" section of the
-- landing page instead of the default (most-recent) picks.
alter table public.listings
  add column if not exists featured_deal_ids uuid[] default null;

comment on column public.listings.featured_deal_ids is
  'Optional hand-picked deal IDs to feature on this listing''s landing page. Falls back to most-recent deals when null.';
