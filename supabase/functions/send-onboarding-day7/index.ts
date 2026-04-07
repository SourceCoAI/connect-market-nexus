import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

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

      const { data: existingRequest } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('user_id', profile.id)
        .limit(1)
        .maybeSingle();

      if (existingRequest) continue;

      const { data: alreadySent } = await supabase
        .from('outbound_emails')
        .select('id')
        .eq('recipient_email', recipientEmail)
        .eq('template_name', 'onboarding_day7')
        .eq('status', 'accepted')
        .maybeSingle();

      if (alreadySent) continue;

      const safeFirstName = (profile.first_name || 'there').replace(/<[^>]*>/g, '');
      const subject = `The pipeline has been updated since you joined.`;

      const htmlContent = wrapEmailHtml({
        bodyHtml: `
  <p style="margin: 0 0 16px;">Hi ${safeFirstName},</p>
  <p style="margin: 0 0 16px;">You have been on the platform for a week. The pipeline gets updated regularly, and what is live today may be different from when you first browsed. Worth a fresh look.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">View Updated Pipeline</a></p>
  <p style="margin: 0 0 8px;">Two things that might help:</p>
  <ul style="padding-left: 20px; margin: 0 0 16px;">
    <li style="margin-bottom: 8px;">If the deals live right now are not quite right, set up a deal alert in your profile. You will hear from us the moment something matches your criteria.</li>
    <li style="margin-bottom: 8px;">If you would rather not wait for deals to come to market, our retained search team sources specifically for your mandate: <a href="https://www.sourcecodeals.com/private-equity" style="color: #1A1A1A; text-decoration: underline;">sourcecodeals.com/private-equity</a></li>
  </ul>
  <p style="margin: 0 0 16px;">If something felt off about the platform or you have questions about how it works, reply to this email.</p>
  <p style="margin: 32px 0 0;">The SourceCo Team</p>`,
        preheader: "The pipeline has been updated. Worth a fresh look.",
        recipientEmail: recipientEmail,
      });

      const textContent = `Hi ${safeFirstName},\n\nYou have been on the platform for a week. The pipeline gets updated regularly. Worth a fresh look.\n\nView the pipeline: ${siteUrl}/marketplace\n\nIf you would prefer deals sourced for your specific thesis: https://www.sourcecodeals.com/private-equity\n\nQuestions? Reply to this email.\n\nThe SourceCo Team`;

      const result = await sendEmail({
        templateName: 'onboarding_day7',
        to: recipientEmail,
        toName: safeFirstName,
        subject,
        htmlContent,
        textContent,
        senderName: 'SourceCo',
        replyTo: 'support@sourcecodeals.com',
        isTransactional: true,
      });

      if (result.success) {
        sentCount++;
      } else {
        console.error(`Email error for ${recipientEmail}:`, result.error);
      }
    }

    console.log(`Onboarding day 7 batch complete: ${sentCount} sent out of ${profiles.length} eligible`);

    return new Response(
      JSON.stringify({ success: true, totalEligible: profiles.length, sent: sentCount }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error in send-onboarding-day7:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
