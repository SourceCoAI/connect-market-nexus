-- Repair Clay phone enrichment rows where mobile was in the payload but result_phone was not extracted
UPDATE public.clay_enrichment_requests 
SET status = 'completed', 
    result_phone = raw_callback_payload->>'mobile',
    completed_at = COALESCE(completed_at, NOW())
WHERE request_type = 'phone' 
  AND status = 'failed' 
  AND result_phone IS NULL 
  AND raw_callback_payload->>'mobile' IS NOT NULL;