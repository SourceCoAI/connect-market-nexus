import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const now = new Date();
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
    const twentyEightHoursAgo = new Date(now.getTime() - 28 * 60 * 60 * 1000);

    const { data: recentRequests, error: queryError } = await supabase
      .from('connection_requests')
      .select('id, user_id, listing_id, created_at, listings(title, project_name)')
      .gte('created_at', twentyEightHoursAgo.toISOString())
      .lte('created_at', twentyHoursAgo.toISOString())
      .not('user_id', 'is', null);

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
    }

    if (!recentRequests?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), { status: 200 });
    }

    let sentCount = 0;
    const siteUrl = Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com';

    for (const request of recentRequests) {
      if (!request.user_id) continue;

      const { count } = await supabase.from('connection_requests').select('id', { count: 'exact', head: true }).eq('user_id', request.user_id);
      if (count !== 1) continue;

      const { data: profile } = await supabase.from('profiles').select('email, first_name, last_name').eq('id', request.user_id).single();
      if (!profile?.email) continue;

      const { data: alreadySent } = await supabase.from('outbound_emails').select('id').eq('recipient_email', profile.email).eq('template_name', 'first_request_followup').eq('status', 'sent_to_provider').maybeSingle();
      if (alreadySent) continue;

      const safeFirstName = (profile.first_name || 'there').replace(/<[^>]*>/g, '');
      const listing = request.listings as { title?: string; project_name?: string } | null;
      const safeDealTitle = ((listing?.project_name || listing?.title || 'your requested deal') as string).replace(/<[^>]*>/g, '');

      const htmlContent = wrapEmailHtml({
        bodyHtml: `
  <p style="margin: 0 0 16px;">Hi ${safeFirstName},</p>
  <p style="margin: 0 0 16px;">A quick note on your introduction request for ${safeDealTitle}.</p>
  <p style="margin: 0 0 16px;">Our team is reviewing it now. We look at fit, mandate alignment, and deal timing before making introductions. You will hear from us with our decision shortly.</p>
  <p style="margin: 0 0 16px;">In the meantime, it is worth browsing the rest of the pipeline.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Browse More Deals</a></p>
  <p style="margin: 0 0 16px;">Questions? Reply here.</p>
  <p style="margin: 32px 0 0;">The SourceCo Team</p>`,
        preheader: `Update on your introduction request for ${safeDealTitle}`,
        recipientEmail: profile.email,
      });

      const result = await sendEmail({
        templateName: 'first_request_followup',
        to: profile.email,
        toName: safeFirstName,
        subject: 'Quick update on your request.',
        htmlContent,
        textContent: `Hi ${safeFirstName},\n\nA quick note on your introduction request for ${safeDealTitle}. Our team is reviewing it now.\n\nBrowse more: ${siteUrl}/marketplace\n\nThe SourceCo Team`,
        senderName: 'SourceCo',
        isTransactional: true,
      });

      if (result.success) sentCount++;
      else console.error(`Email error for ${profile.email}:`, result.error);
    }

    return new Response(JSON.stringify({ success: true, totalChecked: recentRequests.length, sent: sentCount }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in send-first-request-followup:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
