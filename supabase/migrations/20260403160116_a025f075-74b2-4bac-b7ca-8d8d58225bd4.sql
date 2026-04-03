ALTER TABLE public.document_requests DROP CONSTRAINT IF EXISTS document_requests_status_check;

ALTER TABLE public.document_requests
ADD CONSTRAINT document_requests_status_check
CHECK (
  status = ANY (ARRAY[
    'requested'::text,
    'email_sent'::text,
    'signed'::text,
    'cancelled'::text,
    'dismissed'::text
  ])
);