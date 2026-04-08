/**
 * outlook-auth: Initiates Microsoft OAuth 2.0 authorization code flow.
 *
 * Returns the Microsoft authorization URL that the frontend should redirect to.
 * After consent, Microsoft redirects back to the outlook-callback function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, corsHeaders);
    }

    const auth = await requireAuth(req);
    if (!auth.authenticated || !auth.userId) {
      return errorResponse(auth.error || 'Authentication required', 401, corsHeaders);
    }

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    const redirectUri = Deno.env.get('MICROSOFT_REDIRECT_URI');
    const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';

    if (!clientId || !redirectUri) {
      console.error('Missing Microsoft OAuth configuration');
      return errorResponse('OAuth not configured', 500, corsHeaders);
    }

    // Generate a state parameter that includes the user ID for verification in callback
    const state = btoa(JSON.stringify({
      userId: auth.userId,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    }));

    const scopes = [
      'openid',
      'profile',
      'email',
      'offline_access',
      'Mail.Read',
      'Mail.ReadWrite',
      'Mail.Send',
      'User.Read',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: scopes,
      state,
      prompt: 'consent',
    });

    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

    // Store state in database for CSRF verification during callback
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Clean up any old pending states for this user, then store the new one
    await supabase
      .from('email_connections')
      .delete()
      .eq('sourceco_user_id', auth.userId)
      .eq('status', 'expired');

    return successResponse({ authUrl, state }, corsHeaders);
  } catch (err) {
    console.error('outlook-auth error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal server error', 500, corsHeaders);
  }
});
