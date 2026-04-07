/**
 * outlook-renew-webhooks: Renews Microsoft Graph webhook subscriptions
 * before they expire. Should be called via pg_cron or scheduler every 12 hours.
 *
 * Also detects stale connections (no sync in 24+ hours) and alerts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

import { decryptToken, refreshAccessToken as refreshTokenFull } from '../_shared/microsoft-tokens.ts';

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const result = await refreshTokenFull(refreshToken);
  return result?.accessToken || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Find connections with webhooks expiring in the next 12 hours
  const expirationThreshold = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('status', 'active')
    .not('webhook_subscription_id', 'is', null)
    .lt('webhook_expires_at', expirationThreshold);

  const results: { userId: string; renewed: boolean; error?: string }[] = [];

  if (connections && connections.length > 0) {
    for (const conn of connections) {
      try {
        const refreshToken = decryptToken(conn.encrypted_refresh_token);
        const accessToken = await refreshAccessToken(refreshToken);

        if (!accessToken) {
          results.push({ userId: conn.sourceco_user_id, renewed: false, error: 'Token refresh failed' });
          continue;
        }

        // Renew the webhook subscription (extend by 2 days)
        const newExpiration = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

        const resp = await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${conn.webhook_subscription_id}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ expirationDateTime: newExpiration }),
          },
        );

        if (resp.ok) {
          await supabase
            .from('email_connections')
            .update({ webhook_expires_at: newExpiration })
            .eq('id', conn.id);

          results.push({ userId: conn.sourceco_user_id, renewed: true });
        } else {
          const errText = await resp.text();
          console.error(`Webhook renewal failed for ${conn.sourceco_user_id}:`, errText);

          // If subscription is gone, create a new one
          if (resp.status === 404) {
            try {
              const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/outlook-webhook`;
              const createResp = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  changeType: 'created',
                  notificationUrl: webhookUrl,
                  resource: '/me/messages',
                  expirationDateTime: newExpiration,
                  clientState: Deno.env.get('MICROSOFT_WEBHOOK_SECRET') || 'sourceco-outlook-integration',
                }),
              });

              if (createResp.ok) {
                const newSub = await createResp.json();
                await supabase
                  .from('email_connections')
                  .update({
                    webhook_subscription_id: newSub.id,
                    webhook_expires_at: newSub.expirationDateTime,
                  })
                  .eq('id', conn.id);

                results.push({ userId: conn.sourceco_user_id, renewed: true });
              } else {
                results.push({
                  userId: conn.sourceco_user_id,
                  renewed: false,
                  error: 'Failed to recreate subscription',
                });
              }
            } catch (err) {
              results.push({
                userId: conn.sourceco_user_id,
                renewed: false,
                error: (err as Error).message,
              });
            }
          } else {
            results.push({ userId: conn.sourceco_user_id, renewed: false, error: errText });
          }
        }
      } catch (err) {
        results.push({ userId: conn.sourceco_user_id, renewed: false, error: (err as Error).message });
      }
    }
  }

  // Check for stale connections (no sync in 24+ hours)
  const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: staleConnections } = await supabase
    .from('email_connections')
    .select('sourceco_user_id, email_address, last_sync_at')
    .eq('status', 'active')
    .lt('last_sync_at', staleThreshold);

  const staleAlerts: string[] = [];
  if (staleConnections && staleConnections.length > 0) {
    for (const conn of staleConnections) {
      staleAlerts.push(`${conn.email_address} (last sync: ${conn.last_sync_at})`);

      // Create admin notification
      await supabase.from('admin_notifications').insert({
        type: 'email_sync_stale',
        title: `Email sync stale for ${conn.email_address}`,
        message: `No emails have synced for ${conn.email_address} since ${conn.last_sync_at}. The connection may need attention.`,
        severity: 'warning',
        metadata: {
          sourceco_user_id: conn.sourceco_user_id,
          email_address: conn.email_address,
          last_sync_at: conn.last_sync_at,
        },
      });
    }
  }

  return successResponse(
    {
      renewed: results.filter((r) => r.renewed).length,
      failed: results.filter((r) => !r.renewed).length,
      staleConnections: staleAlerts,
      details: results,
    },
    corsHeaders,
  );
});
