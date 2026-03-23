import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logEmailDelivery } from '../_shared/email-logger.ts';

/**
 * send-first-request-followup
 * Hourly cron job that sends a follow-up email to buyers who submitted
 * their first-ever connection request ~24 hours ago (20-28hr window).
 */

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    if (!brevoApiKey) {
      console.error('BREVO_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
      });
    }

    const now = new Date();
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
    const twentyEightHoursAgo = new Date(now.getTime() - 28 * 60 * 60 * 1000);

    console.log('Running first request follow-up check...');

    // Find connection_requests created in the 20-28hr window
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
      console.log('No first-request follow-ups to send');
      return new Response(JSON.stringify({ success: true, sent: 0 }), { status: 200 });
    }

    let sentCount = 0;
    const siteUrl = Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com';

    for (const request of recentRequests) {
      if (!request.user_id) continue;

      // Check it's their FIRST request (count = 1)
      const { count } = await supabase
        .from('connection_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', request.user_id);

      if (count !== 1) continue; // not their first request, skip

      // Get profile for name/email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', request.user_id)
        .single();

      if (!profile?.email) continue;

      const recipientEmail = profile.email;

      // Dedup check — only fire once per buyer
      const { data: alreadySent } = await supabase
        .from('email_delivery_logs')
        .select('id')
        .eq('email', recipientEmail)
        .eq('email_type', 'first_request_followup')
        .eq('status', 'sent')
        .maybeSingle();

      if (alreadySent) continue;

      const safeFirstName = (profile.first_name || 'there').replace(/<[^>]*>/g, '');
      const listing = request.listings as { title?: string; project_name?: string } | null;
      const safeDealTitle = ((listing?.project_name || listing?.title || 'your requested deal') as string).replace(/<[^>]*>/g, '');

      const subject = `Quick update on your request.`;

      const htmlContent = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safeFirstName},</p>
  <p>Just a quick note on your introduction request for <strong>${safeDealTitle}</strong>.</p>
  <p>Our team is reviewing it now. We look at fit, mandate alignment, and deal timing before making introductions — you'll hear from us with our decision shortly.</p>
  <p>In the meantime, it's worth browsing the rest of the pipeline. Building a short list of 2\u20133 deals you want to pursue is how most buyers get the most out of SourceCo.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Browse More Deals</a></p>
  <p>Questions? Reply here.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
</div>`;

      const textContent = `Hi ${safeFirstName},\n\nJust a quick note on your introduction request for ${safeDealTitle}. Our team is reviewing it now — you'll hear from us shortly.\n\nIn the meantime, browse the rest of the pipeline: ${siteUrl}/marketplace\n\n— The SourceCo Team`;

      const correlationId = crypto.randomUUID();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        let brevoResponse: Response;
        try {
          brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': brevoApiKey,
            },
            body: JSON.stringify({
              sender: {
                name: 'SourceCo',
                email: Deno.env.get('NOREPLY_EMAIL') || 'noreply@sourcecodeals.com',
              },
              to: [{ email: recipientEmail, name: safeFirstName }],
              subject,
              htmlContent,
              textContent,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (brevoResponse.ok) {
          sentCount++;
          await logEmailDelivery(supabase, {
            email: recipientEmail,
            emailType: 'first_request_followup',
            status: 'sent',
            correlationId,
          });
        } else {
          const errorText = await brevoResponse.text();
          console.error(`Brevo error for ${recipientEmail}:`, errorText);
          await logEmailDelivery(supabase, {
            email: recipientEmail,
            emailType: 'first_request_followup',
            status: 'failed',
            correlationId,
            errorMessage: errorText,
          });
        }
      } catch (emailError: unknown) {
        const isAbort = emailError instanceof Error && emailError.name === 'AbortError';
        console.error(`Email error for ${recipientEmail}:`, emailError);
        await logEmailDelivery(supabase, {
          email: recipientEmail,
          emailType: 'first_request_followup',
          status: 'failed',
          correlationId,
          errorMessage: isAbort
            ? 'Brevo API timeout'
            : emailError instanceof Error
              ? emailError.message
              : String(emailError),
        });
      }
    }

    console.log(`First request follow-up batch complete: ${sentCount} sent out of ${recentRequests.length} checked`);

    return new Response(
      JSON.stringify({
        success: true,
        totalChecked: recentRequests.length,
        sent: sentCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error in send-first-request-followup:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
