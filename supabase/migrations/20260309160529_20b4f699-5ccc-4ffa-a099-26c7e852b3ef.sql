UPDATE public.user_roles SET role = 'admin' WHERE user_id = 'fb109b14-98b5-4ec6-843e-c54ccc171dbb';

INSERT INTO public.permission_audit_log (target_user_id, changed_by, old_role, new_role, reason)
VALUES (
  'fb109b14-98b5-4ec6-843e-c54ccc171dbb',
  '1d5727f8-2a8c-4600-9a46-bddbb036ea45',
  'moderator',
  'admin',
  'Promoted to admin to match Brandon/Oz access level'
);