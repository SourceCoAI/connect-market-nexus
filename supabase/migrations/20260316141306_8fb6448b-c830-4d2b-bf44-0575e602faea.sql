ALTER TABLE public.firm_agreements
  ADD COLUMN IF NOT EXISTS nda_pandadoc_document_id text,
  ADD COLUMN IF NOT EXISTS nda_pandadoc_status text,
  ADD COLUMN IF NOT EXISTS fee_pandadoc_document_id text,
  ADD COLUMN IF NOT EXISTS fee_pandadoc_status text;