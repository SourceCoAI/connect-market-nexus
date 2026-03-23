
-- Part 2: Clear incorrectly mapped listing_id values from previous broad phone-based backfill.
UPDATE public.contact_activities
SET listing_id = NULL
WHERE source_system = 'phoneburner'
  AND listing_id IS NOT NULL
  AND contact_id IS NULL
  AND remarketing_buyer_id IS NULL
  AND request_id IS NULL;

-- Part 3: Backfill disposition_label from phoneburner_status where disposition_label is NULL
UPDATE public.contact_activities
SET disposition_label = phoneburner_status
WHERE source_system = 'phoneburner'
  AND disposition_label IS NULL
  AND phoneburner_status IS NOT NULL
  AND phoneburner_status != '';

-- Part 4: Re-match historical activities using email against contact_list_members
UPDATE public.contact_activities ca
SET listing_id = clm.entity_id::uuid
FROM public.contact_list_members clm
WHERE ca.source_system = 'phoneburner'
  AND ca.listing_id IS NULL
  AND ca.contact_email IS NOT NULL
  AND ca.contact_email != ''
  AND lower(ca.contact_email) = lower(clm.contact_email)
  AND clm.removed_at IS NULL
  AND clm.entity_id IS NOT NULL
  AND clm.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Part 5: Re-match historical activities using email against listings.main_contact_email
UPDATE public.contact_activities ca
SET listing_id = l.id
FROM public.listings l
WHERE ca.source_system = 'phoneburner'
  AND ca.listing_id IS NULL
  AND ca.contact_email IS NOT NULL
  AND ca.contact_email != ''
  AND lower(ca.contact_email) = lower(l.main_contact_email);
