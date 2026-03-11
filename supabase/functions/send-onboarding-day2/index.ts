import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logEmailDelivery } from '../_shared/email-logger.ts';

/**
 * send-onboarding-day2
 * Daily cron job that sends a pipeline digest email to buyers
 * who were approved ~2 days ago and have not yet submitted any connection request.
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
    const oneDayAgo = new Date(now.getTime() - 1.5 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 2.5 * 24 * 60 * 60 * 1000);

    console.log('Running onboarding day 2 check...');

    const { data: profiles, error: queryError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, approved_at')
      .eq('approval_status', 'approved')
      .eq('role', 'buyer')
      .gte('approved_at', threeDaysAgo.toISOString())
      .lte('approved_at', oneDayAgo.toISOString());

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
    }

    if (!profiles?.length) {
      console.log('No day-2 onboarding emails to send');
      return new Response(JSON.stringify({ success: true, sent: 0 }), { status: 200 });
    }

    let sentCount = 0;
    const siteUrl = Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com';

    for (const profile of profiles) {
      const recipientEmail = profile.email;
      if (!recipientEmail) continue;

      // Check if they have any connection requests (already active)
      const { data: existingRequest } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('user_id', profile.id)
        .limit(1)
        .maybeSingle();

      if (existingRequest) continue;

      // Dedup check
      const { data: alreadySent } = await supabase
        .from('email_delivery_logs')
        .select('id')
        .eq('email', recipientEmail)
        .eq('email_type', 'onboarding_day2')
        .eq('status', 'sent')
        .maybeSingle();

      if (alreadySent) continue;

      const safeFirstName = (profile.first_name || 'there').replace(/<[^>]*>/g, '');

      const subject = `What's in the pipeline right now.`;

      const htmlContent = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safeFirstName},</p>
  <p>You've been in the pipeline for a couple of days. Wanted to give you a quick picture of what's there.</p>
  <p>Every deal on SourceCo is off-market — sourced and reviewed by our team before it reaches buyers. When you find a fit, request an introduction. We review every request and select based on match quality.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Browse the Pipeline</a></p>
  <h3 style="color: #0e101a; font-size: 16px; margin: 24px 0 8px 0;">How to get the most out of SourceCo</h3>
  <ul style="padding-left: 20px; color: #374151;">
    <li>Be specific in your introduction requests — tell us exactly why you're a strong fit. Generic messages rarely get selected</li>
    <li>Set up deal alerts in your profile so new deals that match your mandate reach you immediately</li>
    <li>If you want deals sourced specifically for your thesis, our retained search team works with a select group of active buyers: <a href="https://www.sourcecodeals.com/private-equity" style="color: #1e293b;">sourcecodeals.com/private-equity</a></li>
  </ul>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
</div>`;

      const textContent = `Hi ${safeFirstName},\n\nYou've been in the pipeline for a couple of days. Every deal on SourceCo is off-market — sourced by our team before it reaches buyers.\n\nBrowse the pipeline: ${siteUrl}/marketplace\n\nBe specific when you request an introduction — generic messages rarely get selected.\n\nQuestions? Reply to this email.\n\n— The SourceCo Team`;

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
            emailType: 'onboarding_day2',
            status: 'sent',
            correlationId,
          });
        } else {
          const errorText = await brevoResponse.text();
          console.error(`Brevo error for ${recipientEmail}:`, errorText);
          await logEmailDelivery(supabase, {
            email: recipientEmail,
            emailType: 'onboarding_day2',
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
          emailType: 'onboarding_day2',
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

    console.log(`Onboarding day 2 batch complete: ${sentCount} sent out of ${profiles.length} eligible`);

    return new Response(
      JSON.stringify({
        success: true,
        totalEligible: profiles.length,
        sent: sentCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error in send-onboarding-day2:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
