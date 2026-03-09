DROP POLICY IF EXISTS "Admins can manage deal outreach profiles" ON public.deal_outreach_profiles;

CREATE POLICY "Admins can manage deal outreach profiles"
  ON public.deal_outreach_profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));