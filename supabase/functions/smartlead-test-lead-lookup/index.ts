/**
 * Temporary test function to inspect Smartlead API lead responses.
 * Will be deleted after reviewing the field structure.
 */
import { smartleadRequest, listCampaignLeads } from '../_shared/smartlead-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const { campaign_id, lead_id, email } = await req.json();

    const results: Record<string, unknown> = {};

    // 1. Single lead by ID within campaign
    if (campaign_id && lead_id) {
      const singleLead = await smartleadRequest({
        path: `/campaigns/${campaign_id}/leads/${lead_id}`,
      });
      results.single_lead_by_id = singleLead;
    }

    // 2. Lead message history (often includes lead metadata)
    if (campaign_id && lead_id) {
      const history = await smartleadRequest({
        path: `/campaigns/${campaign_id}/leads/${lead_id}/message-history`,
      });
      results.message_history = history;
    }

    // 3. List leads endpoint (first 2 for field comparison)
    if (campaign_id) {
      const listResult = await listCampaignLeads(Number(campaign_id), 0, 2);
      results.list_leads_sample = listResult;
    }

    // 4. Get lead by email (global search)
    if (email) {
      const byEmail = await smartleadRequest({
        path: '/leads/',
        queryParams: { email },
      });
      results.lead_by_email = byEmail;
    }

    // 5. Global leads endpoint (first 1 for schema discovery)
    const globalSample = await smartleadRequest({
      path: '/leads/global-leads',
      queryParams: { offset: 0, limit: 1 },
    });
    results.global_leads_sample = globalSample;

    console.log('[smartlead-test] Full results:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify(results, null, 2), { headers: jsonHeaders });
  } catch (err) {
    console.error('[smartlead-test] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
