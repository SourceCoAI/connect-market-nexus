/**
 * outlook-callback: Handles the Microsoft OAuth 2.0 callback.
 *
 * Exchanges the authorization code for tokens, stores the encrypted refresh
 * token, fetches the user's email address, sets up the webhook subscription,
 * and triggers the initial 90-day sync.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface GraphUser {
  id: string;
  mail?: string;
  userPrincipalName: string;
  displayName: string;
}

async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
  const redirectUri = Deno.env.get('MICROSOFT_REDIRECT_URI')!;
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'openid profile email offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read',
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error('Token exchange failed:', errBody);
    throw new Error(`Token exchange failed: ${resp.status}`);
  }

  return resp.json();
}

async function getGraphUser(accessToken: string): Promise<GraphUser> {
  const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Graph /me failed: ${resp.status}`);
  }

  return resp.json();
}

async function createWebhookSubscription(
  accessToken: string,
  webhookUrl: string,
): Promise<{ id: string; expirationDateTime: string }> {
  // Webhook subscriptions for mail max out at ~4230 minutes (just under 3 days)
  const expiration = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days to be safe

  const resp = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changeType: 'created',
      notificationUrl: webhookUrl,
      resource: '/me/messages',
      expirationDateTime: expiration.toISOString(),
      clientState: Deno.env.get('MICROSOFT_WEBHOOK_SECRET') || 'sourceco-outlook-integration',
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error('Webhook subscription failed:', errBody);
    throw new Error(`Webhook subscription failed: ${resp.status}`);
  }

  const data = await resp.json();
  return { id: data.id, expirationDateTime: data.expirationDateTime };
}

import { encryptToken } from '../_shared/microsoft-tokens.ts';

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

  let body: { code: string; state: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid request body', 400, corsHeaders);
  }

  if (!body.code) {
    return errorResponse('Authorization code is required', 400, corsHeaders);
  }

  // Verify state parameter
  try {
    const stateData = JSON.parse(atob(body.state));
    if (stateData.userId !== auth.userId) {
      return errorResponse('State mismatch — possible CSRF', 403, corsHeaders);
    }
    // Check state is not older than 10 minutes
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      return errorResponse('Authorization state expired', 400, corsHeaders);
    }
  } catch {
    return errorResponse('Invalid state parameter', 400, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Exchange code for tokens
    const tokens = await exchangeCodeForTokens(body.code);

    // 2. Get user profile from Microsoft Graph
    const graphUser = await getGraphUser(tokens.access_token);
    const emailAddress = graphUser.mail || graphUser.userPrincipalName;

    // 3. Set up webhook subscription for real-time sync
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/outlook-webhook`;
    let webhookSubscription: { id: string; expirationDateTime: string } | null = null;

    try {
      webhookSubscription = await createWebhookSubscription(tokens.access_token, webhookUrl);
    } catch (err) {
      console.error('Webhook setup failed (will use polling fallback):', err);
    }

    // 4. Store the connection with encrypted refresh token
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { data: connection, error: upsertError } = await supabase
      .from('email_connections')
      .upsert(
        {
          sourceco_user_id: auth.userId,
          microsoft_user_id: graphUser.id,
          email_address: emailAddress,
          encrypted_refresh_token: encryptToken(tokens.refresh_token),
          token_expires_at: tokenExpiresAt,
          webhook_subscription_id: webhookSubscription?.id || null,
          webhook_expires_at: webhookSubscription?.expirationDateTime || null,
          status: 'active',
          last_sync_error_count: 0,
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sourceco_user_id' },
      )
      .select('id')
      .single();

    if (upsertError) {
      console.error('Connection upsert failed:', upsertError);
      return errorResponse('Failed to save connection', 500, corsHeaders);
    }

    // 5. Trigger initial 90-day sync as a background job
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/outlook-sync-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          userId: auth.userId,
          accessToken: tokens.access_token,
          isInitialSync: true,
        }),
      });
    } catch (err) {
      console.error('Failed to trigger initial sync (will be caught by polling):', err);
    }

    return successResponse(
      {
        connectionId: connection.id,
        emailAddress,
        status: 'active',
        webhookActive: !!webhookSubscription,
      },
      corsHeaders,
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    return errorResponse('Failed to complete OAuth flow', 500, corsHeaders);
  }
});
