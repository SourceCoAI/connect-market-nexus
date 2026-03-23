
-- One-time backfill: re-match PhoneBurner contact_activities using stored webhook payloads
-- Uses all phone numbers from each webhook payload, session-based matching (priority), and RPC fallback

DO $$
DECLARE
  wh record;
  activity_id uuid;
  raw_phone text;
  norm_phone text;
  contact_name text;
  contact_email text;
  req_id text;
  phones_arr jsonb;
  phone_entry jsonb;
  all_phones text[] := '{}';
  p text;
  
  -- match results
  best_contact_id uuid;
  best_listing_id uuid;
  best_buyer_id uuid;
  best_email text;
  best_source text;
  
  -- session match
  sess record;
  sess_contact jsonb;
  sess_phone text;
  sess_norm text;
  session_matched boolean;
  
  -- rpc match
  rpc_result record;
  
  updated_count int := 0;
  skipped_count int := 0;
  error_count int := 0;
BEGIN
  RAISE NOTICE 'Starting PhoneBurner backfill...';

  FOR wh IN
    SELECT id, payload, contact_activity_id, request_id
    FROM phoneburner_webhooks_log
    WHERE processing_status = 'success'
      AND event_type = 'call_end'
      AND contact_activity_id IS NOT NULL
  LOOP
    BEGIN
      activity_id := wh.contact_activity_id;
      all_phones := '{}';
      best_contact_id := NULL;
      best_listing_id := NULL;
      best_buyer_id := NULL;
      best_email := NULL;
      best_source := NULL;
      session_matched := false;

      -- Extract contact name
      contact_name := concat_ws(' ',
        wh.payload->'body'->'contact'->>'first_name',
        wh.payload->'body'->'contact'->>'last_name'
      );

      -- Extract contact email
      contact_email := coalesce(
        wh.payload->'body'->'contact'->>'primary_email',
        wh.payload->'body'->'contact'->'emails'->>0
      );

      -- Extract request_id
      req_id := coalesce(
        wh.payload->'body'->'custom_data'->>'request_id',
        wh.payload->'body'->>'request_id',
        wh.request_id
      );

      -- Collect primary phone
      raw_phone := wh.payload->'body'->'contact'->>'phone';
      IF raw_phone IS NOT NULL AND raw_phone != '' THEN
        norm_phone := regexp_replace(raw_phone, '[^0-9]', '', 'g');
        IF length(norm_phone) = 11 AND norm_phone LIKE '1%' THEN
          norm_phone := substring(norm_phone from 2);
        END IF;
        IF length(norm_phone) >= 10 THEN
          all_phones := array_append(all_phones, norm_phone);
        END IF;
      END IF;

      -- Collect phones from phones array
      phones_arr := wh.payload->'body'->'contact'->'phones';
      IF phones_arr IS NOT NULL AND jsonb_typeof(phones_arr) = 'array' THEN
        FOR phone_entry IN SELECT * FROM jsonb_array_elements(phones_arr)
        LOOP
          raw_phone := phone_entry->>'number';
          IF raw_phone IS NOT NULL AND raw_phone != '' THEN
            norm_phone := regexp_replace(raw_phone, '[^0-9]', '', 'g');
            IF length(norm_phone) = 11 AND norm_phone LIKE '1%' THEN
              norm_phone := substring(norm_phone from 2);
            END IF;
            IF length(norm_phone) >= 10 AND NOT (norm_phone = ANY(all_phones)) THEN
              all_phones := array_append(all_phones, norm_phone);
            END IF;
          END IF;
        END LOOP;
      END IF;

      -- Skip if no phones extracted
      IF array_length(all_phones, 1) IS NULL THEN
        skipped_count := skipped_count + 1;
        CONTINUE;
      END IF;

      -- Check current activity state - only update if unlinked
      PERFORM 1 FROM contact_activities
      WHERE id = activity_id
        AND (contact_id IS NULL AND listing_id IS NULL);
      
      IF NOT FOUND THEN
        skipped_count := skipped_count + 1;
        CONTINUE;
      END IF;

      -- Priority 1: Session-based matching
      IF req_id IS NOT NULL THEN
        FOR sess IN
          SELECT session_contacts
          FROM phoneburner_sessions
          WHERE request_id = req_id
          LIMIT 1
        LOOP
          IF sess.session_contacts IS NOT NULL AND jsonb_typeof(sess.session_contacts) = 'array' THEN
            FOR sess_contact IN SELECT * FROM jsonb_array_elements(sess.session_contacts)
            LOOP
              sess_phone := sess_contact->>'phone';
              IF sess_phone IS NOT NULL THEN
                sess_norm := regexp_replace(sess_phone, '[^0-9]', '', 'g');
                IF length(sess_norm) = 11 AND sess_norm LIKE '1%' THEN
                  sess_norm := substring(sess_norm from 2);
                END IF;
                
                FOREACH p IN ARRAY all_phones
                LOOP
                  IF p = sess_norm THEN
                    best_contact_id := (sess_contact->>'contact_id')::uuid;
                    best_listing_id := (sess_contact->>'listing_id')::uuid;
                    best_buyer_id := (sess_contact->>'remarketing_buyer_id')::uuid;
                    best_source := 'session_backfill';
                    session_matched := true;
                    EXIT;
                  END IF;
                END LOOP;
                
                IF session_matched THEN EXIT; END IF;
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      -- Priority 2: RPC-based matching (if session didn't match)
      IF NOT session_matched THEN
        FOREACH p IN ARRAY all_phones
        LOOP
          SELECT r.contact_id, r.listing_id, r.remarketing_buyer_id, r.contact_email, r.match_source
          INTO rpc_result
          FROM resolve_phone_activity_link_by_phone(p, contact_name, contact_email) r
          LIMIT 1;
          
          IF rpc_result.contact_id IS NOT NULL OR rpc_result.listing_id IS NOT NULL THEN
            best_contact_id := rpc_result.contact_id::uuid;
            best_listing_id := rpc_result.listing_id::uuid;
            best_buyer_id := rpc_result.remarketing_buyer_id::uuid;
            best_email := rpc_result.contact_email;
            best_source := 'rpc_backfill_' || coalesce(rpc_result.match_source, 'unknown');
            EXIT;
          END IF;
        END LOOP;
      END IF;

      -- Update activity if we found a match
      IF best_contact_id IS NOT NULL OR best_listing_id IS NOT NULL THEN
        UPDATE contact_activities
        SET
          contact_id = coalesce(best_contact_id, contact_id),
          listing_id = coalesce(best_listing_id, listing_id),
          remarketing_buyer_id = coalesce(best_buyer_id, remarketing_buyer_id),
          contact_email = coalesce(best_email, contact_email),
          updated_at = now()
        WHERE id = activity_id
          AND contact_id IS NULL
          AND listing_id IS NULL;
        
        IF FOUND THEN
          updated_count := updated_count + 1;
        ELSE
          skipped_count := skipped_count + 1;
        END IF;
      ELSE
        skipped_count := skipped_count + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE NOTICE 'Error processing webhook %: %', wh.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'PhoneBurner backfill complete: % updated, % skipped, % errors',
    updated_count, skipped_count, error_count;
END $$;
