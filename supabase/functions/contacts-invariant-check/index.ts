import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * contacts-invariant-check
 *
 * Weekly scheduled edge function that verifies key data-quality invariants
 * on the canonical contacts table. Run via pg_cron or Supabase scheduled
 * invocations. Posts a summary to Slack if any invariant fails.
 *
 * Invariants checked:
 *   1. No duplicate buyer emails (lower(email) collision)
 *   2. No duplicate linkedin_urls
 *   3. Every approved profile has a contacts row
 *   4. Every listing with main_contact_email has a seller contact
 *   5. Every remarketing_buyer with contacts has at least one is_primary_at_firm
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const slackWebhookUrl = Deno.env.get('CONTACTS_INVARIANT_SLACK_WEBHOOK_URL');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const failures: string[] = [];

  // 1. Duplicate buyer emails
  const { data: dupEmails } = await supabase.rpc('sql', {
    query: `
      SELECT lower(email) AS email, count(*) AS cnt
      FROM contacts
      WHERE contact_type = 'buyer'
        AND email IS NOT NULL
        AND archived = false
        AND deleted_at IS NULL
        AND merged_into_id IS NULL
      GROUP BY lower(email)
      HAVING count(*) > 1
      LIMIT 20
    `,
  });
  if (dupEmails && dupEmails.length > 0) {
    failures.push(`${dupEmails.length} duplicate buyer emails found (e.g., ${dupEmails[0]?.email})`);
  }

  // 2. Duplicate linkedin_urls
  const { data: dupLinkedin } = await supabase.rpc('sql', {
    query: `
      SELECT lower(linkedin_url) AS li, count(*) AS cnt
      FROM contacts
      WHERE linkedin_url IS NOT NULL
        AND linkedin_url <> ''
        AND deleted_at IS NULL
        AND merged_into_id IS NULL
      GROUP BY lower(linkedin_url)
      HAVING count(*) > 1
      LIMIT 20
    `,
  });
  if (dupLinkedin && dupLinkedin.length > 0) {
    failures.push(`${dupLinkedin.length} duplicate linkedin_urls found`);
  }

  // 3. Approved profiles without a contacts row
  const { data: orphanProfiles } = await supabase.rpc('sql', {
    query: `
      SELECT count(*) AS cnt
      FROM profiles p
      WHERE p.approval_status = 'approved'
        AND p.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.profile_id = p.id
            AND c.deleted_at IS NULL
        )
    `,
  });
  const orphanCount = orphanProfiles?.[0]?.cnt || 0;
  if (orphanCount > 0) {
    failures.push(`${orphanCount} approved profiles have no contacts row`);
  }

  // 4. Listings with main_contact_email but no seller contact
  const { data: orphanListings } = await supabase.rpc('sql', {
    query: `
      SELECT count(*) AS cnt
      FROM listings l
      WHERE l.main_contact_email IS NOT NULL
        AND trim(l.main_contact_email) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.listing_id = l.id
            AND c.contact_type = 'seller'
            AND c.deleted_at IS NULL
        )
    `,
  });
  const orphanListingCount = orphanListings?.[0]?.cnt || 0;
  if (orphanListingCount > 0) {
    failures.push(`${orphanListingCount} listings with main_contact_email have no seller contact`);
  }

  // 5. Remarketing buyers with contacts but no primary
  const { data: noPrimary } = await supabase.rpc('sql', {
    query: `
      SELECT count(DISTINCT c.remarketing_buyer_id) AS cnt
      FROM contacts c
      WHERE c.remarketing_buyer_id IS NOT NULL
        AND c.contact_type = 'buyer'
        AND c.deleted_at IS NULL
        AND c.merged_into_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM contacts c2
          WHERE c2.remarketing_buyer_id = c.remarketing_buyer_id
            AND c2.is_primary_at_firm = true
            AND c2.deleted_at IS NULL
        )
    `,
  });
  const noPrimaryCount = noPrimary?.[0]?.cnt || 0;
  if (noPrimaryCount > 0) {
    failures.push(`${noPrimaryCount} remarketing buyers have contacts but none marked as primary`);
  }

  // Report
  const passed = failures.length === 0;
  const summary = passed
    ? '✅ All 5 contacts invariants passed.'
    : `❌ ${failures.length}/5 contacts invariants failed:\n${failures.map((f) => `  • ${f}`).join('\n')}`;

  console.log(summary);

  // Post to Slack if configured and there are failures
  if (!passed && slackWebhookUrl) {
    try {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[contacts-invariant-check] ${summary}`,
        }),
      });
    } catch (err) {
      console.error('Failed to post to Slack:', err);
    }
  }

  return new Response(
    JSON.stringify({ passed, failures, checked_at: new Date().toISOString() }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: passed ? 200 : 422,
    },
  );
});
