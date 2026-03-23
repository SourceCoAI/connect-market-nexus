-- Add text_content column to data_room_documents for storing extracted text
-- from uploaded documents. This text is used as context for deal enrichment
-- and lead memo generation.

ALTER TABLE data_room_documents
ADD COLUMN IF NOT EXISTS text_content text,
ADD COLUMN IF NOT EXISTS text_extracted_at timestamptz;

-- Index for quickly finding documents with extracted text for a given deal
CREATE INDEX IF NOT EXISTS idx_data_room_docs_deal_text
ON data_room_documents (deal_id)
WHERE text_content IS NOT NULL AND status = 'active';

COMMENT ON COLUMN data_room_documents.text_content IS 'Extracted text content from the uploaded document, used for AI enrichment and memo generation';
COMMENT ON COLUMN data_room_documents.text_extracted_at IS 'Timestamp when text was last extracted from this document';
