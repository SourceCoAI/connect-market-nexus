/**
 * outlook-webhook: Receives real-time notifications from Microsoft Graph
 * when new emails arrive or are sent in connected team members' mailboxes.
 *
 * Microsoft sends:
 *   1. Validation request (GET with validationToken) on subscription creation
 *   2. Change notifications (POST) when new mail events occur
 *
 * Notifications are persisted to a queue table BEFORE returning 202,
 * ensuring no events are lost if background processing fails.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Constant-time string comparison to prevent timing attacks on clientState.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Microsoft Graph webhook validation — must return the validationToken as plain text
  if (req.method === 'GET' || url.searchParams.has('validationToken')) {
    const validationToken = url.searchParams.get('validationToken');
    if (validationToken) {
      return new Response(validationToken, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Missing validationToken', { status: 400 });
  }

  if (req.method === 'POST') {
    // Check for validation token in query string of POST
    const postValidation = url.searchParams.get('validationToken');
    if (postValidation) {
      return new Response(postValidation, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    let body: {
      value?: Array<{
        clientState?: string;
        resourceData?: { id: string };
        resource?: string;
        subscriptionId?: string;
        changeType?: string;
      }>;
      validationTokens?: string[];
    };
    try {
      body = await req.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    // Handle lifecycle validation tokens
    if (body.validationTokens && body.validationTokens.length > 0) {
      return new Response(body.validationTokens[0], {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const webhookSecret = Deno.env.get('MICROSOFT_WEBHOOK_SECRET') || 'sourceco-outlook-integration';
    const notifications = body.value || [];
    if (notifications.length === 0) {
      return new Response('OK', { status: 202 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Persist valid notifications to queue table BEFORE returning 202.
    // This ensures no events are lost even if background processing fails.
    const queueRecords = [];
    for (const notification of notifications) {
      // Verify client state with constant-time comparison
      if (!notification.clientState || !timingSafeEqual(notification.clientState, webhookSecret)) {
        console.warn('Invalid clientState, skipping notification');
        continue;
      }

      if (!notification.subscriptionId) continue;

      queueRecords.push({
        subscription_id: notification.subscriptionId,
        resource: notification.resource || null,
        change_type: notification.changeType || 'created',
        client_state: notification.clientState,
      });
    }

    if (queueRecords.length > 0) {
      const { error } = await supabase
        .from('outlook_webhook_events')
        .insert(queueRecords);

      if (error) {
        console.error('Failed to queue webhook events:', error);
        // Still return 202 — Microsoft will retry on 5xx
        return new Response('', { status: 500 });
      }
    }

    // Trigger async processing (best-effort; queue ensures nothing is lost)
    try {
      // Deduplicate: only trigger sync for unique subscription IDs
      const uniqueSubscriptionIds = [...new Set(queueRecords.map((r) => r.subscription_id))];

      for (const subscriptionId of uniqueSubscriptionIds) {
        const { data: connection } = await supabase
          .from('email_connections')
          .select('sourceco_user_id')
          .eq('webhook_subscription_id', subscriptionId)
          .eq('status', 'active')
          .single();

        if (connection) {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/outlook-sync-emails`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              userId: connection.sourceco_user_id,
              isInitialSync: false,
            }),
          });
        }
      }
    } catch (err) {
      // Non-fatal — queue-based scheduler will pick up unprocessed events
      console.error('Background sync trigger failed (queued events will be processed):', err);
    }

    return new Response('', { status: 202 });
  }

  return new Response('Method not allowed', { status: 405 });
});
