-- Allow admin users to INSERT into global_activity_queue
CREATE POLICY "Admins can insert into activity queue"
ON public.global_activity_queue
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- Allow admin users to UPDATE global_activity_queue
CREATE POLICY "Admins can update activity queue"
ON public.global_activity_queue
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);

-- Allow admin users to DELETE from global_activity_queue
CREATE POLICY "Admins can delete from activity queue"
ON public.global_activity_queue
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  )
);