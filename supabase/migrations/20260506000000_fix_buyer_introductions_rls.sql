-- Fix RLS policies for buyer_introductions table
-- Allow any authenticated user to INSERT (with their own user ID as created_by)
-- and UPDATE records they created, in addition to the existing admin-all policy.

-- Authenticated users can insert their own introductions
DROP POLICY IF EXISTS buyer_introductions_authenticated_insert ON buyer_introductions;
CREATE POLICY buyer_introductions_authenticated_insert ON buyer_introductions
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Authenticated users can update introductions they created
DROP POLICY IF EXISTS buyer_introductions_creator_update ON buyer_introductions;
CREATE POLICY buyer_introductions_creator_update ON buyer_introductions
  FOR UPDATE
  USING (auth.uid() = created_by);

-- Same for introduction_status_log: allow authenticated users to insert logs
DROP POLICY IF EXISTS introduction_status_log_authenticated_insert ON introduction_status_log;
CREATE POLICY introduction_status_log_authenticated_insert ON introduction_status_log
  FOR INSERT
  WITH CHECK (auth.uid() = changed_by);

-- Allow authenticated users to read status logs for introductions they created
DROP POLICY IF EXISTS introduction_status_log_creator_select ON introduction_status_log;
CREATE POLICY introduction_status_log_creator_select ON introduction_status_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM buyer_introductions bi
      WHERE bi.id = buyer_introduction_id
      AND bi.created_by = auth.uid()
    )
  );
