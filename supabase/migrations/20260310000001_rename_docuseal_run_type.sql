-- ============================================================================
-- Rename 'docuseal' run_type to 'pandadoc' in test_run_tracking CHECK constraint
-- ============================================================================

-- Drop the existing CHECK constraint and recreate with 'pandadoc'
ALTER TABLE test_run_tracking
  DROP CONSTRAINT IF EXISTS test_run_tracking_run_type_check;

-- Update any existing rows
UPDATE test_run_tracking SET run_type = 'pandadoc' WHERE run_type = 'docuseal';

-- Recreate with 'pandadoc' instead of 'docuseal'
ALTER TABLE test_run_tracking
  ADD CONSTRAINT test_run_tracking_run_type_check
  CHECK (run_type IN ('run_all', 'system', 'pandadoc', 'chatbot_infra', 'chatbot_scenarios', '30q', 'enrichment', 'smartlead', 'listing_pipeline', 'buyer_rec'));
