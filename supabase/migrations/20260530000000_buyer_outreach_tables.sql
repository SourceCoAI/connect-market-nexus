-- Buyer Outreach Integration
-- deal_outreach_profiles is created in migration 20260309040228

-- Buyer Outreach Events — stores every outreach event per buyer-deal pair
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

