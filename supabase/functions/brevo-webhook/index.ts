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

/** Normalize Brevo message-id to match what we store in document_requests */
function normalizeMessageId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // Brevo sometimes wraps in angle brackets, sometimes not
  return raw.replace(/^<|>$/g, '').trim() || null;
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

    const rawBody = await req.text();
    console.log(`[brevo-webhook] Raw payload: ${rawBody.substring(0, 500)}`);

    let body: BrevoWebhookEvent | BrevoWebhookEvent[];
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error('[brevo-webhook] Failed to parse JSON body');
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const events = Array.isArray(body) ? body : [body];

    let processed = 0;
    let errors = 0;

    for (const event of events) {
      try {
        const email = event.email?.toLowerCase();
        if (!email) {
          console.warn('[brevo-webhook] Event has no email, skipping:', event.event);
          continue;
        }

        const rawMessageId = event['message-id'];
        const messageId = normalizeMessageId(rawMessageId);

        console.log(`[brevo-webhook] Processing: event=${event.event} | email=${email} | rawMessageId=${rawMessageId} | normalizedId=${messageId}`);

        // ── 1. Engagement signals (existing logic) ──
        const eventMap: Record<string, { signalType: string; score: number }> = {
          opened: { signalType: 'email_engagement', score: 10 },
          clicked: { signalType: 'email_engagement', score: 25 },
          hardBounce: { signalType: 'email_engagement', score: -50 },
          hard_bounce: { signalType: 'email_engagement', score: -50 },
          softBounce: { signalType: 'email_engagement', score: -10 },
          soft_bounce: { signalType: 'email_engagement', score: -10 },
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

        // ── Populate suppressed_emails on hard bounce, spam, unsubscribe ──
        const suppressionMap: Record<string, string> = {
          hardBounce: 'hard_bounce',
          hard_bounce: 'hard_bounce',
          spam: 'spam_complaint',
          complaint: 'spam_complaint',
          unsubscribed: 'unsubscribed',
          invalid_email: 'hard_bounce',
        };
        const suppressionReason = suppressionMap[event.event];
        if (suppressionReason) {
          await supabase.from('suppressed_emails').upsert(
            {
              email: email,
              reason: suppressionReason,
              source_event: event.event,
              source_message_id: messageId,
            },
            { onConflict: 'email,reason' }
          );
          console.log(`[brevo-webhook] Suppressed ${email} reason=${suppressionReason}`);
        }

        // ── 2. Delivery logging (legacy email_delivery_logs) ──
        const deliveryStatusMap: Record<string, string> = {
          delivered: 'delivered',
          request: 'accepted',
          deferred: 'deferred',
          hardBounce: 'bounced',
          hard_bounce: 'bounced',
          softBounce: 'soft_bounced',
          soft_bounce: 'soft_bounced',
          blocked: 'blocked',
          spam: 'spam_complaint',
          complaint: 'spam_complaint',
          opened: 'opened',
          clicked: 'clicked',
          invalid_email: 'bounced',
        };

        const deliveryStatus = deliveryStatusMap[event.event] || null;

        if (deliveryStatus) {
          // Legacy log
          await supabase.from('email_delivery_logs').insert({
            email,
            email_type: 'brevo_webhook',
            status: deliveryStatus,
            correlation_id: messageId || crypto.randomUUID(),
            error_message: event.reason || null,
            sent_at: event.date ? new Date(event.date).toISOString() : new Date().toISOString(),
          });

          // ── 3. NEW: Update outbound_emails + email_events ──
          if (messageId) {
            // Find matching outbound_emails record by provider_message_id
            const variants = [messageId, `<${messageId}>`];
            const { data: outboundMatch } = await supabase
              .from('outbound_emails')
              .select('id, status')
              .in('provider_message_id', variants)
              .limit(1)
              .maybeSingle();

            if (outboundMatch) {
              // Map to lifecycle status
              const lifecycleMap: Record<string, string> = {
                delivered: 'delivered',
                accepted: 'accepted',
                bounced: 'bounced',
                blocked: 'blocked',
                spam_complaint: 'spam',
                opened: 'opened',
                clicked: 'clicked',
                soft_bounced: 'bounced',
              };
              const lifecycleStatus = lifecycleMap[deliveryStatus];

              if (lifecycleStatus) {
                // Update outbound_emails status
                const statusUpdate: Record<string, unknown> = { status: lifecycleStatus };
                if (lifecycleStatus === 'delivered') statusUpdate.delivered_at = new Date().toISOString();
                if (lifecycleStatus === 'opened') statusUpdate.opened_at = new Date().toISOString();
                if (lifecycleStatus === 'bounced' || lifecycleStatus === 'blocked' || lifecycleStatus === 'spam') {
                  statusUpdate.failed_at = new Date().toISOString();
                  statusUpdate.last_error = event.reason || event.event;
                }

                await supabase
                  .from('outbound_emails')
                  .update(statusUpdate)
                  .eq('id', outboundMatch.id);

                // Insert event
                await supabase.from('email_events').insert({
                  outbound_email_id: outboundMatch.id,
                  event_type: lifecycleStatus,
                  provider_event_id: rawMessageId,
                  event_data: {
                    brevo_event: event.event,
                    reason: event.reason,
                    date: event.date,
                  },
                });

                console.log(`[brevo-webhook] Updated outbound_emails ${outboundMatch.id} → ${lifecycleStatus}`);
              }
            }

            // Update document_requests for bounces/blocks
            if (['bounced', 'blocked', 'spam_complaint'].includes(deliveryStatus)) {
              const errorMsg = `${deliveryStatus}: ${event.reason || event.event}`;
              for (const variant of variants) {
                await supabase
                  .from('document_requests' as never)
                  .update({ last_email_error: errorMsg } as never)
                  .eq('email_provider_message_id' as never, variant as never);
              }
            }
          }

          console.log(`[brevo-webhook] Delivery: ${deliveryStatus} for ${email} | messageId=${messageId || 'unknown'}`);
        } else {
          console.warn(`[brevo-webhook] Unrecognized event: "${event.event}" for ${email}`);
        }
      } catch (err) {
        console.error(`[brevo-webhook] Event processing error:`, err);
        errors++;
      }
    }

    console.log(`[brevo-webhook] Batch complete: processed=${processed} errors=${errors} total=${events.length}`);

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
