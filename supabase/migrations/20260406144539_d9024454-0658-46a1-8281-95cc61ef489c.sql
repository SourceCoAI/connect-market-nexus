
INSERT INTO public.data_room_access (deal_id, marketplace_user_id, can_view_teaser, can_view_full_memo, can_view_data_room)
SELECT
  cr.listing_id,
  cr.user_id,
  true,
  CASE WHEN fa.fee_agreement_status = 'signed' THEN true ELSE false END,
  CASE WHEN fa.fee_agreement_status = 'signed' THEN true ELSE false END
FROM public.connection_requests cr
LEFT JOIN public.firm_agreements fa ON fa.id = cr.firm_id
WHERE cr.status = 'approved'
  AND cr.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.data_room_access dra
    WHERE dra.deal_id = cr.listing_id AND dra.marketplace_user_id = cr.user_id
  );
