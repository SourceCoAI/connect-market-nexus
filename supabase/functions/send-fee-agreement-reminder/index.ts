import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

/**
 * send-fee-agreement-reminder
 * Daily cron job that sends Fee Agreement signing reminders via Brevo.
 * Mirrors the NDA reminder logic: 3-day + 7-day reminders for pending fee agreements.
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
      console.error('❌ BREVO_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
      });
    }

    const now = new Date();
    console.log('🔔 Running Fee Agreement reminder check...');

    // Find firms with pending fee agreement
    const { data: pendingFirms, error: queryError } = await supabase
      .from('firm_agreements')
      .select(
        `
        id, primary_company_name, email_domain,
        fee_pandadoc_status, fee_agreement_email_sent_at
      `,
      )
      .eq('fee_pandadoc_status', 'pending')
      .eq('fee_agreement_email_sent', true)
      .not('fee_agreement_email_sent_at', 'is', null)
      .eq('fee_agreement_signed', false);

    if (queryError) {
      console.error('❌ Query error:', queryError);
      return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
    }

    if (!pendingFirms?.length) {
      console.log('✅ No pending fee agreements to remind');
      return new Response(JSON.stringify({ success: true, reminders: 0 }), { status: 200 });
    }

    let remindersSent = 0;

    for (const firm of pendingFirms) {
      const sentAt = new Date(firm.fee_agreement_email_sent_at);
      const daysSinceSent = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24);

      let reminderType: '3-day' | '7-day' | null = null;
      if (daysSinceSent >= 6.5 && daysSinceSent <= 7.5) {
        reminderType = '7-day';
      } else if (daysSinceSent >= 2.5 && daysSinceSent <= 3.5) {
        reminderType = '3-day';
      }

      if (!reminderType) continue;

      // Dedup check
      const { data: existingLog } = await supabase
        .from('pandadoc_webhook_log')
        .select('id')
        .eq('external_id', firm.id)
        .eq('event_type', `fee_reminder_${reminderType}`)
        .maybeSingle();

      if (existingLog) continue;

      // Find contact
      const { data: members } = await supabase
        .from('firm_members')
        .select('user_id, user:profiles(email, first_name, last_name)')
        .eq('firm_id', firm.id)
        .limit(1);

      const member = members?.[0];
      const userProfile = member?.user as {
        email?: string;
        first_name?: string;
        last_name?: string;
      } | null;
      const recipientEmail = userProfile?.email;
      const recipientName =
        [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ') || 'there';

      if (!recipientEmail) continue;

      const _safeFirmName = (firm.primary_company_name || 'your company').replace(/<[^>]*>/g, '');
      const safeRecipientName = recipientName.replace(/<[^>]*>/g, '');

      const siteUrl = Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com';

      const subject =
        reminderType === '3-day'
          ? `Your connection request is pending a fee agreement`
          : `Fee agreement still needed — your introduction is on hold`;

      const htmlContent =
        reminderType === '3-day'
          ? `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
              <p>Hi ${safeRecipientName},</p>
              <p>You submitted a connection request but your firm's fee agreement is still unsigned. We can't process the introduction until it's in place.</p>
              <p>The agreement covers our success-only fee &mdash; nothing is owed unless a deal closes. It takes about 60 seconds to sign.</p>
              <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign fee agreement</a></p>
              <p>If you have questions about the terms, reply to this email and we'll walk you through it.</p>
              <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
            </div>`
          : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
              <p>Hi ${safeRecipientName},</p>
              <p>It's been a week and your firm's fee agreement is still unsigned. We can't process any introductions without it.</p>
              <p>The agreement covers our success-only fee &mdash; nothing is owed unless a deal closes.</p>
              <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign fee agreement</a></p>
              <p>If you have concerns about the terms, reply to this email &mdash; we can work through it.</p>
              <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
            </div>`;

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
              sender: { name: 'SourceCo', email: 'noreply@sourcecodeals.com' },
              to: [{ email: recipientEmail, name: safeRecipientName }],
              subject,
              htmlContent,
              textContent: htmlContent.replace(/<[^>]*>/g, ''),
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (brevoResponse.ok) {
          remindersSent++;
          await supabase.from('pandadoc_webhook_log').insert({
            event_type: `fee_reminder_${reminderType}`,
            external_id: firm.id,
            document_type: 'fee_agreement',
            document_id: 'reminder',
            raw_payload: { reminder_type: reminderType },
            processed_at: new Date().toISOString(),
          });
        } else {
          const errorText = await brevoResponse.text();
          console.error(`❌ Brevo error for firm ${firm.id}:`, errorText);
        }
      } catch (emailError: unknown) {
        if (emailError instanceof Error && emailError.name === 'AbortError') {
          console.error(`❌ Brevo timeout for firm ${firm.id}`);
        } else {
          console.error(`❌ Email error for firm ${firm.id}:`, emailError);
        }
      }
    }

    console.log(
      `📊 Fee Agreement reminder batch: ${remindersSent} sent out of ${pendingFirms.length} pending`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        totalPending: pendingFirms.length,
        remindersSent,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('❌ Error in send-fee-agreement-reminder:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
