/**
 * outlook-webhook: Receives real-time notifications from Microsoft Graph
 * when new emails arrive or are sent in connected team members' mailboxes.
 *
 * Microsoft sends:
 *   1. Validation request (GET with validationToken) on subscription creation
 *   2. Change notifications (POST) when new mail events occur
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  // Also handle validation in POST body (Microsoft sometimes does this)
  if (req.method === 'POST') {
    const contentType = req.headers.get('Content-Type') || '';

    // Check for validation token in query string of POST
    const postValidation = url.searchParams.get('validationToken');
    if (postValidation) {
      return new Response(postValidation, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    let body: { value?: Array<{ clientState?: string; resourceData?: { id: string }; resource?: string; subscriptionId?: string }>; validationTokens?: string[] };
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

    // Process notifications in the background — respond quickly to Microsoft
    // Microsoft requires a 202 response within 3 seconds
    const processNotifications = async () => {
      for (const notification of notifications) {
        try {
          // Verify client state
          if (notification.clientState !== webhookSecret) {
            console.warn('Invalid clientState, skipping notification');
            continue;
          }

          const subscriptionId = notification.subscriptionId;
          if (!subscriptionId) continue;

          // Look up which user this subscription belongs to
          const { data: connection } = await supabase
            .from('email_connections')
            .select('sourceco_user_id, email_address, encrypted_refresh_token')
            .eq('webhook_subscription_id', subscriptionId)
            .eq('status', 'active')
            .single();

          if (!connection) {
            console.warn(`No active connection for subscription ${subscriptionId}`);
            continue;
          }

          // Trigger a sync for this user (the sync function handles dedup)
          try {
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
          } catch (err) {
            console.error('Failed to trigger sync from webhook:', err);
          }
        } catch (err) {
          console.error('Notification processing error:', err);
        }
      }
    };

    // Fire and forget — don't block the response
    processNotifications().catch((err) => console.error('Background processing error:', err));

    // Respond immediately with 202 Accepted
    return new Response('', { status: 202 });
  }

  return new Response('Method not allowed', { status: 405 });
});
