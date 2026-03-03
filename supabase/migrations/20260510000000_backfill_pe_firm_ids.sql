-- Backfill pe_firm_id for platform/strategic/family_office buyers that have
-- pe_firm_name set but no pe_firm_id linked.
--
-- Strategy:
-- 1. For each distinct pe_firm_name that has orphaned references, check if a
--    remarketing_buyers record with buyer_type='pe_firm' already exists.
-- 2. If no PE firm record exists, create one (ai_seeded, verification_status='pending').
-- 3. Update all orphaned buyers to point to the resolved PE firm record.

DO $$
DECLARE
  firm_rec RECORD;
  resolved_id uuid;
BEGIN
  -- Loop over each distinct pe_firm_name that has buyers missing pe_firm_id
  FOR firm_rec IN
    SELECT DISTINCT pe_firm_name
    FROM public.remarketing_buyers
    WHERE pe_firm_name IS NOT NULL
      AND pe_firm_name != ''
      AND pe_firm_id IS NULL
      AND buyer_type != 'pe_firm'
      AND archived = false
  LOOP
    -- Try to find an existing PE firm record by company_name (case-insensitive)
    SELECT id INTO resolved_id
    FROM public.remarketing_buyers
    WHERE lower(trim(company_name)) = lower(trim(firm_rec.pe_firm_name))
      AND archived = false
    LIMIT 1;

    -- If no match found, create the PE firm record
    IF resolved_id IS NULL THEN
      INSERT INTO public.remarketing_buyers (
        company_name,
        buyer_type,
        ai_seeded,
        ai_seeded_at,
        verification_status
      ) VALUES (
        firm_rec.pe_firm_name,
        'pe_firm',
        true,
        now(),
        'pending'
      )
      RETURNING id INTO resolved_id;

      RAISE NOTICE 'Created PE firm record for "%": %', firm_rec.pe_firm_name, resolved_id;
    ELSE
      RAISE NOTICE 'Found existing PE firm for "%": %', firm_rec.pe_firm_name, resolved_id;
    END IF;

    -- Update all orphaned buyers to point to this PE firm
    UPDATE public.remarketing_buyers
    SET pe_firm_id = resolved_id
    WHERE pe_firm_name IS NOT NULL
      AND lower(trim(pe_firm_name)) = lower(trim(firm_rec.pe_firm_name))
      AND pe_firm_id IS NULL
      AND buyer_type != 'pe_firm'
      AND archived = false;
  END LOOP;

  -- Log summary
  RAISE NOTICE 'Backfill complete. Buyers with pe_firm_id now set: %',
    (SELECT count(*) FROM public.remarketing_buyers WHERE pe_firm_id IS NOT NULL AND buyer_type != 'pe_firm');
END $$;
