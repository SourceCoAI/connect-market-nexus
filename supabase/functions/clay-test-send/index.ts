import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const CLAY_WEBHOOK_NAME_DOMAIN_URL =
  'https://api.clay.com/v3/sources/webhook/pull-in-data-from-a-webhook-5710a9f8-be6f-4004-b378-a259c9bb7a1c';
const CLAY_WEBHOOK_LINKEDIN_URL =
  'https://api.clay.com/v3/sources/webhook/pull-in-data-from-a-webhook-82d6e696-5c1c-4db3-8b66-9e13a984088d';

serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const linkedinRequestId = crypto.randomUUID();
  const nameDomainRequestId = crypto.randomUUID();

  // Insert tracking rows
  const { error: err1 } = await supabase.from('clay_enrichment_requests').insert({
    request_id: linkedinRequestId,
    request_type: 'linkedin',
    status: 'pending',
    workspace_id: '00000000-0000-0000-0000-000000000000',
    first_name: 'Tomos',
    last_name: 'Mughan',
    linkedin_url: 'https://www.linkedin.com/in/tomos-mughan',
    source_function: 'clay-test-send',
  });

  const { error: err2 } = await supabase.from('clay_enrichment_requests').insert({
    request_id: nameDomainRequestId,
    request_type: 'name_domain',
    status: 'pending',
    workspace_id: '00000000-0000-0000-0000-000000000000',
    first_name: 'Tomos',
    last_name: 'Mughan',
    domain: 'sourcecodeals.com',
    source_function: 'clay-test-send',
  });

  // Send to Clay
  const [linkedinRes, nameDomainRes] = await Promise.all([
    fetch(CLAY_WEBHOOK_LINKEDIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: linkedinRequestId,
        linkedin_url: 'https://www.linkedin.com/in/tomos-mughan',
      }),
    }),
    fetch(CLAY_WEBHOOK_NAME_DOMAIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: nameDomainRequestId,
        first_name: 'Tomos',
        last_name: 'Mughan',
        domain: 'sourcecodeals.com',
      }),
    }),
  ]);

  const results = {
    linkedin: {
      request_id: linkedinRequestId,
      clay_status: linkedinRes.status,
      clay_response: await linkedinRes.text().catch(() => ''),
      db_error: err1?.message || null,
    },
    name_domain: {
      request_id: nameDomainRequestId,
      clay_status: nameDomainRes.status,
      clay_response: await nameDomainRes.text().catch(() => ''),
      db_error: err2?.message || null,
    },
  };

  console.log('[clay-test-send] Results:', JSON.stringify(results));

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
