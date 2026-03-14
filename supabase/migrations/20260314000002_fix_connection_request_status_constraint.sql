-- Fix: Add missing 'on_hold' status to connection_requests CHECK constraint.
-- The original constraint from 20250717112819 only allowed ('pending', 'approved', 'rejected')
-- but the application uses 'on_hold' as a valid status.

ALTER TABLE connection_requests DROP CONSTRAINT IF EXISTS chk_connection_requests_status_valid;
ALTER TABLE connection_requests ADD CONSTRAINT chk_connection_requests_status_valid
  CHECK (status IN ('pending', 'approved', 'rejected', 'on_hold'));
