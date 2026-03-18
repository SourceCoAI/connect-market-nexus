ALTER TABLE public.deal_pipeline DROP CONSTRAINT deals_source_check;
ALTER TABLE public.deal_pipeline ADD CONSTRAINT deals_source_check
  CHECK (source = ANY (ARRAY['manual','marketplace','webflow','import','website','remarketing','smartlead']));