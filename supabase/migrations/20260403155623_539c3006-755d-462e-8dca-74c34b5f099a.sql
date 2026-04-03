
DROP POLICY IF EXISTS "Admins can manage all document requests" ON public.document_requests;

CREATE POLICY "Admins can select all document requests"
  ON public.document_requests FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all document requests"
  ON public.document_requests FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete all document requests"
  ON public.document_requests FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert document requests"
  ON public.document_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
