-- Buyer Outreach Integration
-- Creates tables for deal outreach profiles and buyer outreach event tracking

-- 1. Deal Outreach Profiles — stores human-written merge variables per deal
create table if not exists deal_outreach_profiles (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references listings(id) on delete cascade,
  deal_descriptor text not null,
  geography text not null,
  ebitda text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(deal_id)
);

alter table deal_outreach_profiles enable row level security;

create policy "Admins can read deal_outreach_profiles"
  on deal_outreach_profiles for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can insert deal_outreach_profiles"
  on deal_outreach_profiles for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can update deal_outreach_profiles"
  on deal_outreach_profiles for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can delete deal_outreach_profiles"
  on deal_outreach_profiles for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 2. Buyer Outreach Events — stores every outreach event per buyer-deal pair
create table if not exists buyer_outreach_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references listings(id) on delete cascade,
  buyer_id uuid not null references contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'linkedin', 'phone')),
  tool text not null check (tool in ('smartlead', 'heyreach', 'phoneburner')),
  event_type text not null check (event_type in (
    'launched', 'opened', 'clicked', 'replied',
    'call_answered', 'call_voicemail', 'call_no_answer',
    'not_a_fit', 'interested', 'unsubscribed'
  )),
  event_timestamp timestamptz not null default now(),
  external_id text,
  notes text,
  created_at timestamptz default now()
);

create index idx_buyer_outreach_events_deal_buyer
  on buyer_outreach_events(deal_id, buyer_id);

alter table buyer_outreach_events enable row level security;

create policy "Admins can read buyer_outreach_events"
  on buyer_outreach_events for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can insert buyer_outreach_events"
  on buyer_outreach_events for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can update buyer_outreach_events"
  on buyer_outreach_events for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can delete buyer_outreach_events"
  on buyer_outreach_events for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Service role bypass for edge functions (webhooks run without user session)
create policy "Service role can manage buyer_outreach_events"
  on buyer_outreach_events for all
  using (auth.role() = 'service_role');

create policy "Service role can manage deal_outreach_profiles"
  on deal_outreach_profiles for all
  using (auth.role() = 'service_role');

-- Auto-update updated_at on deal_outreach_profiles
create trigger update_deal_outreach_profiles_updated_at
  before update on deal_outreach_profiles
  for each row execute function public.update_updated_at_column();
