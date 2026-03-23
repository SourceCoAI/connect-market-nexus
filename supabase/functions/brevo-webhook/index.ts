/**
 * H-9 FIX: Brevo webhook handler for email engagement tracking.
 *
 * Receives Brevo webhook events (opens, clicks, bounces, etc.) and writes them
 * to the engagement_signals table so email engagement data flows back to the platform.
 *
 * Configure in Brevo: Settings → Webhooks → Add URL pointing to this function.
 * Events to subscribe: opened, clicked, hardBounce, softBounce, unsubscribed.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface BrevoWebhookEvent {
  event: string;
  email: string;
  date: string;
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

        // Map Brevo event types to our signal types and scores
        const eventMap: Record<string, { signalType: string; score: number }> = {
          opened: { signalType: 'email_engagement', score: 10 },
          clicked: { signalType: 'email_engagement', score: 25 },
          hardBounce: { signalType: 'email_engagement', score: -50 },
          softBounce: { signalType: 'email_engagement', score: -10 },
          unsubscribed: { signalType: 'email_engagement', score: -100 },
        };

        const mapping = eventMap[event.event];
        if (!mapping) continue;

        // Look up buyer by email domain or contact email
        const emailDomain = email.split('@')[1];
        const { data: buyer } = await supabase
          .from('buyers')
          .select('id')
          .or(`email_domain.eq.${emailDomain},company_website.ilike.%${emailDomain}%`)
          .eq('archived', false)
          .limit(1)
          .maybeSingle();

        // Insert engagement signal
        const { error: insertError } = await supabase.from('engagement_signals').insert({
          buyer_id: buyer?.id || null,
          signal_type: mapping.signalType,
          signal_source: 'email_tracking',
          signal_value: mapping.score,
          metadata: {
            brevo_event: event.event,
            email,
            subject: event.subject || null,
            message_id: event['message-id'] || null,
            event_date: event.date,
          },
        });

        if (insertError) {
          console.error(`[brevo-webhook] Insert error for ${email}:`, insertError.message);
          errors++;
        } else {
          processed++;
        }

        // C-4 FIX: Handle unsubscribe events by updating buyer's email_unsubscribed flag
        if (event.event === 'unsubscribed' && buyer?.id) {
          await supabase
            .from('buyers')
            .update({
              email_unsubscribed: true,
              email_unsubscribed_at: new Date().toISOString(),
            } as never)
            .eq('id', buyer.id);
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
