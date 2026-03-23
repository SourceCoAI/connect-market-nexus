
CREATE OR REPLACE FUNCTION public.update_buyer_universe(p_buyer_id uuid, p_universe_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.buyers
  SET universe_id = p_universe_id,
      updated_at = now()
  WHERE id = p_buyer_id;
$$;
