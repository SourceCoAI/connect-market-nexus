-- DESIGN NOTE: The anon policy on listings intentionally allows unauthenticated
-- users to view all published listings. This powers the public marketplace landing
-- page. The authenticated policy additionally requires approval_status = 'approved'.
-- This means a pending buyer can see listings via the public landing page (anon key)
-- but cannot access buyer-specific features (messaging, connections, deal rooms).
-- If listing visibility must be restricted to approved buyers only, remove this policy.
COMMENT ON POLICY "Anonymous users can view published listings" ON public.listings IS
  'Intentional: Powers the public marketplace landing page. Pending buyers can see listings via anon key but cannot access buyer features.';
