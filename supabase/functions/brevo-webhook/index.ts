/**
 * Brevo webhook handler for email engagement tracking + delivery logging.
 *
 * Receives Brevo webhook events (opens, clicks, bounces, etc.) and:
 * 1. Writes engagement_signals for buyer scoring
 * 2. Writes email_delivery_logs for agreement email observability
 * 3. Updates document_requests with bounce/block errors
 *
 * Configure in Brevo: Settings → Webhooks → Add URL pointing to this function.
 * Events to subscribe: delivered, opened, clicked, hardBounce, softBounce, blocked, spam, unsubscribed.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface BrevoWebhookEvent {
  event: string;
  email: string;
  date: string;
  reason?: string;
  'message-id'?: string;
  subject?: string;
  tag?: string;
  ts_event?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const headers = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body: BrevoWebhookEvent | BrevoWebhookEvent[] = await req.json();
    const events = Array.isArray(body) ? body : [body];

    let processed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        const email = event.email?.toLowerCase();
        if (!email) continue;

        const messageId = event['message-id'] || null;

        // ── 1. Engagement signals (existing logic) ──
        const eventMap: Record<string, { signalType: string; score: number }> = {
          opened: { signalType: 'email_engagement', score: 10 },
          clicked: { signalType: 'email_engagement', score: 25 },
          hardBounce: { signalType: 'email_engagement', score: -50 },
          softBounce: { signalType: 'email_engagement', score: -10 },
          unsubscribed: { signalType: 'email_engagement', score: -100 },
        };

        const mapping = eventMap[event.event];

        // Look up buyer by email domain or contact email
        const emailDomain = email.split('@')[1];
        const { data: buyer } = await supabase
          .from('buyers')
          .select('id')
          .or(`email_domain.eq.${emailDomain},company_website.ilike.%${emailDomain}%`)
          .eq('archived', false)
          .limit(1)
          .maybeSingle();

        if (mapping) {
          const { error: insertError } = await supabase.from('engagement_signals').insert({
            buyer_id: buyer?.id || null,
            signal_type: mapping.signalType,
            signal_source: 'email_tracking',
            signal_value: mapping.score,
            metadata: {
              brevo_event: event.event,
              email,
              subject: event.subject || null,
              message_id: messageId,
              event_date: event.date,
            },
          });

          if (insertError) {
            console.error(`[brevo-webhook] Engagement insert error for ${email}:`, insertError.message);
            errors++;
          } else {
            processed++;
          }
        }

        // Handle unsubscribe events
        if (event.event === 'unsubscribed' && buyer?.id) {
          await supabase
            .from('buyers')
            .update({
              email_unsubscribed: true,
              email_unsubscribed_at: new Date().toISOString(),
            } as never)
            .eq('id', buyer.id);
        }

        // ── 2. Delivery logging for agreement emails ──
        let deliveryStatus: string | null = null;
        switch (event.event) {
          case 'delivered':
            deliveryStatus = 'delivered';
            break;
          case 'hardBounce':
          case 'hard_bounce':
            deliveryStatus = 'bounced';
            break;
          case 'softBounce':
          case 'soft_bounce':
            deliveryStatus = 'soft_bounced';
            break;
          case 'blocked':
            deliveryStatus = 'blocked';
            break;
          case 'spam':
            deliveryStatus = 'spam_complaint';
            break;
        }

        if (deliveryStatus) {
          // Log to email_delivery_logs
          await supabase.from('email_delivery_logs').insert({
            email,
            email_type: 'brevo_webhook',
            status: deliveryStatus,
            correlation_id: messageId || crypto.randomUUID(),
            error_message: event.reason || null,
            sent_at: event.date ? new Date(event.date).toISOString() : new Date().toISOString(),
          });

          // Update document_requests for bounces/blocks
          if (['bounced', 'blocked', 'spam_complaint'].includes(deliveryStatus) && messageId) {
            await supabase
              .from('document_requests' as never)
              .update({ last_email_error: `${deliveryStatus}: ${event.reason || event.event}` } as never)
              .eq('email_provider_message_id' as never, messageId as never);
          }

          console.log(`[brevo-webhook] Delivery: ${deliveryStatus} for ${email} | messageId=${messageId || 'unknown'}`);
        }
      } catch (err) {
        console.error(`[brevo-webhook] Event processing error:`, err);
        errors++;
      }
    }

    return new Response(JSON.stringify({ processed, errors, total: events.length }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[brevo-webhook] Fatal error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
