-- Drop the invalid updated_at trigger on contact_list_members.
-- The table has no updated_at column, so the generic update_updated_at_column()
-- function fails with: record "new" has no field "updated_at"
DROP TRIGGER IF EXISTS update_contact_list_members_updated_at ON public.contact_list_members;
