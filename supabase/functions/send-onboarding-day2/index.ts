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
        .eq('template_name', 'onboarding_day2')
        .eq('status', 'accepted')
        .maybeSingle();

      if (alreadySent) continue;

      const safeFirstName = (profile.first_name || 'there').replace(/<[^>]*>/g, '');
      const subject = `What's in the pipeline right now.`;

      const htmlContent = wrapEmailHtml({
        bodyHtml: `
  <p style="margin: 0 0 16px;">Hi ${safeFirstName},</p>
  <p style="margin: 0 0 16px;">You joined SourceCo two days ago. Here is a quick snapshot of what is live in the pipeline.</p>
  <p style="margin: 0 0 16px;">Every deal on SourceCo is off-market. Our team sources and reviews each one before it reaches buyers. When you find a fit, request an introduction. We evaluate every request based on match quality and select accordingly.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Browse the Pipeline</a></p>
  <p style="font-weight: 600; margin: 24px 0 8px;">How to get the most out of SourceCo</p>
  <ul style="padding-left: 20px; margin: 0 0 16px;">
    <li style="margin-bottom: 8px;">Be specific in your introduction requests. Explain exactly why you are a strong fit. Generic messages rarely get selected.</li>
    <li style="margin-bottom: 8px;">Set up deal alerts in your profile so new deals that match your mandate reach you immediately.</li>
    <li style="margin-bottom: 8px;">If you want deals sourced specifically for your thesis, our retained search team works with a select group of active buyers: <a href="https://www.sourcecodeals.com/private-equity" style="color: #1A1A1A; text-decoration: underline;">sourcecodeals.com/private-equity</a></li>
  </ul>
  <p style="margin: 0 0 16px;">Questions? Reply to this email.</p>
  <p style="margin: 32px 0 0;">The SourceCo Team</p>`,
        preheader: "Here is what is in the SourceCo pipeline right now",
        recipientEmail: recipientEmail,
      });

      const textContent = `Hi ${safeFirstName},\n\nYou joined SourceCo two days ago. Here is a quick snapshot of what is live in the pipeline.\n\nEvery deal on SourceCo is off-market. Our team sources and reviews each one before it reaches buyers.\n\nBrowse the pipeline: ${siteUrl}/marketplace\n\nBe specific when you request an introduction. Generic messages rarely get selected.\n\nQuestions? Reply to this email.\n\nThe SourceCo Team`;

      const result = await sendEmail({
        templateName: 'onboarding_day2',
        to: recipientEmail,
        toName: safeFirstName,
        subject,
        htmlContent,
        textContent,
        senderName: 'SourceCo',
        isTransactional: true,
      });

      if (result.success) {
        sentCount++;
      } else {
        console.error(`Email error for ${recipientEmail}:`, result.error);
      }
    }

    console.log(`Onboarding day 2 batch complete: ${sentCount} sent out of ${profiles.length} eligible`);

    return new Response(
      JSON.stringify({ success: true, totalEligible: profiles.length, sent: sentCount }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error in send-onboarding-day2:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
