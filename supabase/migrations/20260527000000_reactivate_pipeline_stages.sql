-- Remove the deactivated "Follow-up" and "NDA + Agreement Sent" stages permanently.
-- These stages are no longer part of the pipeline spec.
-- Any deals previously in these stages were already moved to "Approved" by migration 20260223033733.

DELETE FROM deal_stages WHERE id IN (
  '351c642b-2ccb-4d49-b19e-6c0cda715be1',  -- Follow-up
  '8ce7742e-ec8b-4c49-9302-d93835a5da48'   -- NDA + Agreement Sent
);
