/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

/**
 * cleanup-orphaned-pandadoc-documents
 *
 * Daily cron job that finds PandaDoc documents in a draft/created state
 * that were never sent (> 7 days old) and clears them from firm_agreements.
 *
 * Triggered by cron via CRON_SECRET header.
 */

const PANDADOC_API_BASE = 'https://api.pandadoc.com/public/v1';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let cleaned = 0;

  // Find NDA documents stuck in draft/created state for > 7 days
  const { data: staleNda } = await supabase
    .from('firm_agreements')
    .select('id, nda_pandadoc_document_id, primary_company_name')
    .not('nda_pandadoc_document_id', 'is', null)
    .in('nda_pandadoc_status', ['draft', 'created', 'document.draft', 'document.created'])
    .lt('updated_at', sevenDaysAgo);

  for (const firm of staleNda || []) {
    console.log(`🧹 Clearing orphaned NDA document ${firm.nda_pandadoc_document_id} for firm ${firm.primary_company_name}`);

    // Attempt to void the document in PandaDoc
    if (pandadocApiKey && firm.nda_pandadoc_document_id) {
      try {
        await fetch(`${PANDADOC_API_BASE}/documents/${firm.nda_pandadoc_document_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `API-Key ${pandadocApiKey}` },
        });
      } catch (err) {
        console.warn(`⚠️ Failed to delete PandaDoc document ${firm.nda_pandadoc_document_id}:`, err);
      }
    }

    // Clear the document reference
    await supabase
      .from('firm_agreements')
      .update({
        nda_pandadoc_document_id: null,
        nda_pandadoc_status: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', firm.id);

    // Log the cleanup
    await supabase.from('pandadoc_webhook_log').insert({
      event_type: 'cleanup.orphaned',
      document_id: firm.nda_pandadoc_document_id,
      document_type: 'nda',
      external_id: firm.id,
      raw_payload: { reason: 'orphaned_draft', age_days: 7 },
      processed_at: new Date().toISOString(),
    });

    cleaned++;
  }

  // Find fee agreement documents stuck in draft/created state for > 7 days
  const { data: staleFee } = await supabase
    .from('firm_agreements')
    .select('id, fee_pandadoc_document_id, primary_company_name')
    .not('fee_pandadoc_document_id', 'is', null)
    .in('fee_pandadoc_status', ['draft', 'created', 'document.draft', 'document.created'])
    .lt('updated_at', sevenDaysAgo);

  for (const firm of staleFee || []) {
    console.log(`🧹 Clearing orphaned fee agreement document ${firm.fee_pandadoc_document_id} for firm ${firm.primary_company_name}`);

    if (pandadocApiKey && firm.fee_pandadoc_document_id) {
      try {
        await fetch(`${PANDADOC_API_BASE}/documents/${firm.fee_pandadoc_document_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `API-Key ${pandadocApiKey}` },
        });
      } catch (err) {
        console.warn(`⚠️ Failed to delete PandaDoc document ${firm.fee_pandadoc_document_id}:`, err);
      }
    }

    await supabase
      .from('firm_agreements')
      .update({
        fee_pandadoc_document_id: null,
        fee_pandadoc_status: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', firm.id);

    await supabase.from('pandadoc_webhook_log').insert({
      event_type: 'cleanup.orphaned',
      document_id: firm.fee_pandadoc_document_id,
      document_type: 'fee_agreement',
      external_id: firm.id,
      raw_payload: { reason: 'orphaned_draft', age_days: 7 },
      processed_at: new Date().toISOString(),
    });

    cleaned++;
  }

  console.log(`✅ Cleanup complete: ${cleaned} orphaned document(s) cleared`);

  return new Response(
    JSON.stringify({ success: true, cleaned }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
