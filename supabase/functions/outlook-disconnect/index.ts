/**
 * outlook-disconnect: Disconnects a team member's Outlook account.
 *
 * Revokes the webhook subscription, marks the connection as revoked,
 * and clears the stored refresh token. Does NOT delete email history.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

import { decryptToken } from '../_shared/microsoft-tokens.ts';

async function revokeWebhookSubscription(accessToken: string, subscriptionId: string) {
  try {
    await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error('Failed to revoke webhook subscription:', err);
  }
}

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';

  try {
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
          scope: 'Mail.Read Mail.ReadWrite Mail.Send User.Read',
        }).toString(),
      },
    );

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.access_token;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, corsHeaders);
  }

  const auth = await requireAuth(req);
  if (!auth.authenticated || !auth.userId) {
    return errorResponse(auth.error || 'Authentication required', 401, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Check if admin is disconnecting another user
  let targetUserId = auth.userId;
  try {
    const body = await req.json();
    if (body.targetUserId && body.targetUserId !== auth.userId) {
      // Only admins can disconnect other users
      const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: auth.userId });
      if (!isAdmin) {
        return errorResponse('Admin access required to disconnect other users', 403, corsHeaders);
      }
      targetUserId = body.targetUserId;
    }
  } catch {
    // No body is fine — disconnect self
  }

  // Fetch current connection
  const { data: connection, error: fetchError } = await supabase
    .from('email_connections')
    .select('*')
    .eq('sourceco_user_id', targetUserId)
    .single();

  if (fetchError || !connection) {
    return errorResponse('No active connection found', 404, corsHeaders);
  }

  // Try to revoke webhook subscription if one exists
  if (connection.webhook_subscription_id && connection.encrypted_refresh_token) {
    try {
      const refreshToken = decryptToken(connection.encrypted_refresh_token);
      const accessToken = await getAccessToken(refreshToken);
      if (accessToken) {
        await revokeWebhookSubscription(accessToken, connection.webhook_subscription_id);
      }
    } catch (err) {
      console.error('Error during webhook revocation:', err);
    }
  }

  // Mark connection as revoked (don't delete — preserve audit trail)
  const { error: updateError } = await supabase
    .from('email_connections')
    .update({
      status: 'revoked',
      encrypted_refresh_token: '',
      webhook_subscription_id: null,
      webhook_expires_at: null,
      error_message: `Disconnected by ${targetUserId === auth.userId ? 'user' : 'admin'} at ${new Date().toISOString()}`,
    })
    .eq('sourceco_user_id', targetUserId);

  if (updateError) {
    console.error('Failed to update connection status:', updateError);
    return errorResponse('Failed to disconnect', 500, corsHeaders);
  }

  // OFFBOARDING: Deactivate all contact/deal assignments for this user
  // This immediately revokes their email visibility via RLS policies.
  // Email history is preserved — tied to contact records, not the user.
  const { data: deactivatedAssignments } = await supabase
    .from('contact_assignments')
    .update({
      is_active: false,
      unassigned_at: new Date().toISOString(),
    })
    .eq('sourceco_user_id', targetUserId)
    .eq('is_active', true)
    .select('id');

  // Log the disconnection in audit trail
  await supabase.from('email_access_log').insert({
    sourceco_user_id: auth.userId,
    email_message_id: null,
    action: 'viewed',
    metadata: {
      event: 'account_disconnected',
      targetUserId,
      disconnectedBy: auth.userId,
      assignmentsRevoked: deactivatedAssignments?.length || 0,
      timestamp: new Date().toISOString(),
    },
  });

  return successResponse({
    disconnected: true,
    assignmentsRevoked: deactivatedAssignments?.length || 0,
  }, corsHeaders);
});
