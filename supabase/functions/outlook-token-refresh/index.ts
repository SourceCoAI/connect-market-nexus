/**
 * outlook-token-refresh: Proactively refreshes OAuth tokens for all active connections.
 *
 * Should be called via scheduler every 30 minutes to ensure tokens stay fresh.
 * If a token refresh fails 3 consecutive times, marks the connection as error.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

import { decryptToken, encryptToken } from '../_shared/microsoft-tokens.ts';

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

  // Find connections with tokens expiring in the next 15 minutes
  const expirationThreshold = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('status', 'active')
    .lt('token_expires_at', expirationThreshold);

  if (!connections || connections.length === 0) {
    return successResponse({ message: 'No tokens need refreshing', refreshed: 0 }, corsHeaders);
  }

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';

  let refreshed = 0;
  let failed = 0;

  for (const conn of connections) {
    try {
      const refreshToken = decryptToken(conn.encrypted_refresh_token);

      const resp = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'Mail.Read Mail.ReadWrite Mail.Send User.Read offline_access',
          }).toString(),
        },
      );

      if (resp.ok) {
        const data = await resp.json();
        const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

        await supabase
          .from('email_connections')
          .update({
            encrypted_refresh_token: encryptToken(data.refresh_token || refreshToken),
            token_expires_at: newExpiresAt,
            last_sync_error_count: 0,
            error_message: null,
          })
          .eq('id', conn.id);

        refreshed++;
      } else {
        const newErrorCount = (conn.last_sync_error_count || 0) + 1;
        const updates: Record<string, unknown> = {
          last_sync_error_count: newErrorCount,
          error_message: `Token refresh failed (attempt ${newErrorCount}): ${resp.status}`,
        };

        // After 3 consecutive failures, mark as error
        if (newErrorCount >= 3) {
          updates.status = 'error';
          updates.error_message = `Token refresh failed ${newErrorCount} consecutive times. Please reconnect your Outlook account.`;

          // Create admin notification
          await supabase.from('admin_notifications').insert({
            type: 'email_connection_error',
            title: `Outlook connection error for ${conn.email_address}`,
            message: `The Outlook connection for ${conn.email_address} has failed ${newErrorCount} consecutive token refreshes and has been marked as error. The team member needs to reconnect.`,
            severity: 'high',
            metadata: {
              sourceco_user_id: conn.sourceco_user_id,
              email_address: conn.email_address,
              error_count: newErrorCount,
            },
          });
        }

        await supabase
          .from('email_connections')
          .update(updates)
          .eq('id', conn.id);

        failed++;
      }
    } catch (err) {
      console.error(`Token refresh error for ${conn.sourceco_user_id}:`, err);
      failed++;
    }
  }

  return successResponse({ refreshed, failed, total: connections.length }, corsHeaders);
});
