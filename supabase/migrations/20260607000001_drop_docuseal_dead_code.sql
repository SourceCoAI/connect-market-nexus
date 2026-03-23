-- ============================================================================
-- Drop DocuSeal dead code: columns and webhook log table
-- DocuSeal integration was fully replaced by PandaDoc. No active code
-- references these columns or table.
-- ============================================================================

-- Drop DocuSeal columns from firm_agreements
ALTER TABLE firm_agreements
  DROP COLUMN IF EXISTS nda_docuseal_submission_id,
  DROP COLUMN IF EXISTS nda_docuseal_status,
  DROP COLUMN IF EXISTS fee_docuseal_submission_id,
  DROP COLUMN IF EXISTS fee_docuseal_status;

-- Drop the DocuSeal webhook log table (no active webhooks)
DROP TABLE IF EXISTS docuseal_webhook_log;
