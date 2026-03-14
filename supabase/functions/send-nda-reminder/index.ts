import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { logEmailDelivery } from '../_shared/email-logger.ts';

/**
 * send-nda-reminder
 * Daily cron job that sends NDA signing reminders via Brevo.
 * - 3-day reminder: first nudge after NDA was sent
 * - 7-day reminder: second nudge with escalation tone
 * Only targets firms with pending PandaDoc NDA status.
 */

serve(async (req: Request) => {
  // This is a cron job — verify shared secret to prevent unauthorized invocation
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

    console.log('🔔 Running NDA reminder check...');

    // Find firms with pending NDA that was sent 3 or 7 days ago
    const { data: pendingFirms, error: queryError } = await supabase
      .from('firm_agreements')
      .select(
        `
        id, primary_company_name, email_domain,
        nda_pandadoc_status, nda_email_sent_at
      `,
      )
      .in('nda_pandadoc_status', ['pending', 'not_sent', 'sent'])
      .eq('nda_email_sent', true)
      .not('nda_email_sent_at', 'is', null)
      .eq('nda_signed', false);

    if (queryError) {
      console.error('❌ Query error:', queryError);
      return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
    }

    if (!pendingFirms?.length) {
      console.log('✅ No pending NDAs to remind');
      return new Response(JSON.stringify({ success: true, reminders: 0 }), { status: 200 });
    }

    let remindersSent = 0;

    for (const firm of pendingFirms) {
      const sentAt = new Date(firm.nda_email_sent_at);
      const daysSinceSent = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24);

      let reminderType: '3-day' | '7-day' | null = null;

      if (daysSinceSent >= 6.5 && daysSinceSent <= 7.5) {
        reminderType = '7-day';
      } else if (daysSinceSent >= 2.5 && daysSinceSent <= 3.5) {
        reminderType = '3-day';
      }

      if (!reminderType) continue;

      // M3: Check if we already sent this reminder (dedup)
      const { data: existingLog } = await supabase
        .from('pandadoc_webhook_log')
        .select('id')
        .eq('external_id', firm.id)
        .eq('event_type', `nda_reminder_${reminderType}`)
        .maybeSingle();

      if (existingLog) {
        continue;
      }

      // Find the contact email — get firm members
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

      if (!recipientEmail) {
        continue;
      }

      // Sanitize firm name for email content
      const _safeFirmName = (firm.primary_company_name || "your company").replace(/<[^>]*>/g, "");
      const safeRecipientName = recipientName.replace(/<[^>]*>/g, "");

      // Build reminder email
      const siteUrl = Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com';

      const subject =
        reminderType === '3-day'
          ? `You're approved — the pipeline is locked until you sign.`
          : `A week in — your deal pipeline is still waiting.`;

      const htmlContent =
        reminderType === '3-day'
          ? `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safeRecipientName},</p>
  <p>You were approved for SourceCo three days ago, but your NDA isn't signed yet — which means the deal pipeline is still locked for you.</p>
  <p>One signature covers every deal on the platform, now and in the future. Takes about 60 seconds.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/pending-approval" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign Your NDA</a></p>
  <p>If you have questions about the agreement or want to discuss any specific terms before signing, just reply to this email.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
</div>`
          : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safeRecipientName},</p>
  <p>It's been a week since you were approved and the pipeline is still locked for you.</p>
  <p>If something's holding you back — questions about the agreement, concerns about specific language, or you just haven't had the 60 seconds to do it — reply to this email and we'll get it sorted.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/pending-approval" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign Your NDA</a></p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
</div>`;

      try {
        // M1: Timeout on external API call
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

        const reminderCorrelationId = crypto.randomUUID();

        if (brevoResponse.ok) {
          remindersSent++;

          // Log the reminder (dedup key for future checks)
          await supabase.from('pandadoc_webhook_log').insert({
            event_type: `nda_reminder_${reminderType}`,
            external_id: firm.id,
            document_type: 'nda',
            document_id: firm.id,
            raw_payload: { reminder_type: reminderType },
            processed_at: new Date().toISOString(),
          });

          await logEmailDelivery(supabase, {
            email: recipientEmail,
            emailType: 'nda_reminder',
            status: 'sent',
            correlationId: reminderCorrelationId,
          });
        } else {
          const errorText = await brevoResponse.text();
          console.error(`❌ Brevo error for firm ${firm.id}:`, errorText);
          await logEmailDelivery(supabase, {
            email: recipientEmail,
            emailType: 'nda_reminder',
            status: 'failed',
            correlationId: reminderCorrelationId,
            errorMessage: errorText,
          });
        }
      } catch (emailError: unknown) {
        const isAbort = emailError instanceof Error && emailError.name === 'AbortError';
        if (isAbort) {
          console.error(`❌ Brevo timeout for firm ${firm.id}`);
        } else {
          console.error(`❌ Email error for firm ${firm.id}:`, emailError);
        }
        await logEmailDelivery(supabase, {
          email: recipientEmail,
          emailType: 'nda_reminder',
          status: 'failed',
          correlationId: crypto.randomUUID(),
          errorMessage: isAbort
            ? 'Brevo API timeout'
            : emailError instanceof Error
              ? emailError.message
              : String(emailError),
        });
      }
    }

    console.log(
      `📊 Reminder batch complete: ${remindersSent} sent out of ${pendingFirms.length} pending`,
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
    console.error('❌ Error in send-nda-reminder:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
