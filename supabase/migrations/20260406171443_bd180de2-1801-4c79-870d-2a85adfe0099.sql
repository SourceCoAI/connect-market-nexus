
-- Fix stale data: sync boolean columns with status columns for Sony firm
UPDATE firm_agreements 
SET fee_agreement_signed = true, nda_signed = true 
WHERE id = 'aa21ac6f-84c0-423c-a708-b77db7fbc7cb';

-- Fix the access record for this buyer
UPDATE data_room_access 
SET can_view_full_memo = true, can_view_data_room = true 
WHERE deal_id = 'd543b05b-2649-4327-a1dd-2a2589e73427' 
  AND marketplace_user_id = '06b29c2a-3220-466c-b161-b92082808f39';

-- Bulk fix: ensure all firm_agreements have boolean columns in sync with status
UPDATE firm_agreements SET fee_agreement_signed = true WHERE fee_agreement_status = 'signed' AND fee_agreement_signed = false;
UPDATE firm_agreements SET nda_signed = true WHERE nda_status = 'signed' AND nda_signed = false;
