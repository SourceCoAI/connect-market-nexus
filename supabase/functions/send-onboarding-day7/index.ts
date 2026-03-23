import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logEmailDelivery } from '../_shared/email-logger.ts';

/**
 * send-onboarding-day7
 * Daily cron job that sends a re-engagement email to buyers
 * who were approved ~7 days ago and have not yet submitted any connection request.
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
    const sixAndHalfDaysAgo = new Date(now.getTime() - 6.5 * 24 * 60 * 60 * 1000);
    const sevenAndHalfDaysAgo = new Date(now.getTime() - 7.5 * 24 * 60 * 60 * 1000);

    console.log('Running onboarding day 7 check...');

    const { data: profiles, error: queryError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, approved_at')
      .eq('approval_status', 'approved')
      .eq('role', 'buyer')
      .gte('approved_at', sevenAndHalfDaysAgo.toISOString())
      .lte('approved_at', sixAndHalfDaysAgo.toISOString());

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
    }

    if (!profiles?.length) {
      console.log('No day-7 onboarding emails to send');
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
        .eq('email_type', 'onboarding_day7')
        .eq('status', 'sent')
        .maybeSingle();

      if (alreadySent) continue;

      const safeFirstName = (profile.first_name || 'there').replace(/<[^>]*>/g, '');

      const subject = `Still looking? Here's what other buyers are pursuing.`;

      const htmlContent = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safeFirstName},</p>
  <p>You've been on the platform for a week. If you haven't found a fit yet, it's worth a fresh look — the pipeline gets updated regularly and what's live today may be different from when you first browsed.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">View Updated Pipeline</a></p>
  <p>A couple of things that might help:</p>
  <ul style="padding-left: 20px; color: #374151;">
    <li>If the deals live right now aren't quite right, set up a deal alert in your profile — you'll hear from us the moment something matches your criteria</li>
    <li>If you'd rather not wait for deals to come to market, our retained search team sources specifically for your mandate: <a href="https://www.sourcecodeals.com/private-equity" style="color: #1e293b;">sourcecodeals.com/private-equity</a></li>
  </ul>
  <p>If something felt off about the platform or you have questions about how it works, reply to this email — happy to help.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
</div>`;

      const textContent = `Hi ${safeFirstName},\n\nYou've been on the platform for a week. The pipeline gets updated regularly — worth a fresh look.\n\nView the pipeline: ${siteUrl}/marketplace\n\nIf you'd prefer deals sourced for your specific thesis: https://www.sourcecodeals.com/private-equity\n\nQuestions? Reply to this email.\n\n— The SourceCo Team`;

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
            emailType: 'onboarding_day7',
            status: 'sent',
            correlationId,
          });
        } else {
          const errorText = await brevoResponse.text();
          console.error(`Brevo error for ${recipientEmail}:`, errorText);
          await logEmailDelivery(supabase, {
            email: recipientEmail,
            emailType: 'onboarding_day7',
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
          emailType: 'onboarding_day7',
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

    console.log(`Onboarding day 7 batch complete: ${sentCount} sent out of ${profiles.length} eligible`);

    return new Response(
      JSON.stringify({
        success: true,
        totalEligible: profiles.length,
        sent: sentCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error in send-onboarding-day7:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
