-- Normalize phone numbers for matching across PhoneBurner payloads and CRM records
create or replace function public.normalize_phone_lookup(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when value is null or btrim(value) = '' then null
    else
      case
        when left(regexp_replace(value, '[^0-9]', '', 'g'), 1) = '1'
         and length(regexp_replace(value, '[^0-9]', '', 'g')) = 11
          then right(regexp_replace(value, '[^0-9]', '', 'g'), 10)
        else regexp_replace(value, '[^0-9]', '', 'g')
      end
  end
$$;

-- Resolve a PhoneBurner webhook phone number to the best CRM link
create or replace function public.resolve_phone_activity_link_by_phone(
  p_phone text,
  p_name text default null,
  p_email text default null
)
returns table (
  contact_id uuid,
  listing_id uuid,
  remarketing_buyer_id uuid,
  contact_email text,
  match_source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone_lookup(p_phone);
begin
  if v_phone is null then
    return;
  end if;

  return query
  with contact_match as (
    select
      c.id as contact_id,
      c.listing_id,
      c.remarketing_buyer_id,
      c.email as contact_email,
      'contact'::text as match_source,
      (
        case when p_email is not null and c.email is not null and lower(c.email) = lower(p_email) then 100 else 0 end +
        case when p_name is not null and lower(trim(concat_ws(' ', c.first_name, c.last_name))) = lower(trim(p_name)) then 20 else 0 end +
        case when c.listing_id is not null then 5 else 0 end +
        case when c.remarketing_buyer_id is not null then 5 else 0 end
      ) as score
    from public.contacts c
    where coalesce(c.archived, false) = false
      and public.normalize_phone_lookup(c.phone) = v_phone
  ),
  listing_match as (
    select
      null::uuid as contact_id,
      l.id as listing_id,
      null::uuid as remarketing_buyer_id,
      l.main_contact_email as contact_email,
      'listing'::text as match_source,
      (
        case when p_email is not null and l.main_contact_email is not null and lower(l.main_contact_email) = lower(p_email) then 100 else 0 end +
        case when p_name is not null and l.main_contact_name is not null and lower(trim(l.main_contact_name)) = lower(trim(p_name)) then 20 else 0 end
      ) as score
    from public.listings l
    where public.normalize_phone_lookup(l.main_contact_phone) = v_phone
  ),
  ranked as (
    select * from contact_match
    union all
    select * from listing_match
  )
  select r.contact_id, r.listing_id, r.remarketing_buyer_id, r.contact_email, r.match_source
  from ranked r
  order by r.score desc, r.contact_id nulls last, r.listing_id nulls last
  limit 1;
end;
$$;

revoke all on function public.resolve_phone_activity_link_by_phone(text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_phone_activity_link_by_phone(text, text, text) to service_role;

-- Backfill existing orphaned PhoneBurner activities using phone number matching
with phone_matches as (
  select distinct on (ca.id)
    ca.id,
    matched.contact_id,
    matched.listing_id,
    matched.remarketing_buyer_id,
    matched.contact_email
  from public.contact_activities ca
  join public.phoneburner_webhooks_log pw
    on pw.contact_activity_id = ca.id
  cross join lateral public.resolve_phone_activity_link_by_phone(
    coalesce(
      pw.payload->'body'->'contact'->>'phone',
      pw.payload->'body'->>'phone',
      pw.payload->'contact'->>'phone',
      pw.payload->>'phone'
    ),
    nullif(trim(concat_ws(' ', pw.payload->'body'->'contact'->>'first_name', pw.payload->'body'->'contact'->>'last_name')), ''),
    coalesce(
      pw.payload->'body'->'contact'->>'primary_email',
      pw.payload->'body'->'contact'->'emails'->>0,
      pw.payload->'contact'->>'primary_email',
      pw.payload->'contact'->'emails'->>0
    )
  ) matched
  where ca.source_system = 'phoneburner'
    and ca.contact_id is null
    and ca.remarketing_buyer_id is null
    and ca.listing_id is null
)
update public.contact_activities ca
set
  contact_id = coalesce(ca.contact_id, phone_matches.contact_id),
  listing_id = coalesce(ca.listing_id, phone_matches.listing_id),
  remarketing_buyer_id = coalesce(ca.remarketing_buyer_id, phone_matches.remarketing_buyer_id),
  contact_email = coalesce(ca.contact_email, phone_matches.contact_email),
  updated_at = now()
from phone_matches
where ca.id = phone_matches.id;