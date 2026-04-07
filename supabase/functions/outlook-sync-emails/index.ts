/**
 * outlook-sync-emails: Syncs emails from Microsoft Graph to the platform.
 *
 * Two modes:
 *   1. Initial sync (isInitialSync=true): Pull last 90 days of email history
 *   2. Polling sync: Fetch recent emails since last sync (fallback for webhooks)
 *
 * Only stores emails that match known contact email addresses.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { address: string; name: string } };
  toRecipients: { emailAddress: { address: string; name: string } }[];
  ccRecipients: { emailAddress: { address: string; name: string } }[];
  sentDateTime: string;
  receivedDateTime: string;
  hasAttachments: boolean;
  attachments?: { name: string; size: number; contentType: string }[];
}

interface ContactMatch {
  id: string;
  email: string;
  deal_id?: string | null;
}

function decryptToken(encrypted: string): string {
  const key = Deno.env.get('MICROSOFT_CLIENT_SECRET') || 'default-encryption-key';
  const decoded = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const decrypted = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    decrypted[i] = decoded[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; newRefreshToken: string; expiresIn: number } | null> {
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';

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

  if (!resp.ok) {
    console.error('Token refresh failed:', await resp.text());
    return null;
  }

  const data = await resp.json();
  return {
    accessToken: data.access_token,
    newRefreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

function encryptToken(token: string): string {
  const key = Deno.env.get('MICROSOFT_CLIENT_SECRET') || 'default-encryption-key';
  const encoded = new TextEncoder().encode(token);
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) {
    encrypted[i] = encoded[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...encrypted));
}

async function fetchMessages(
  accessToken: string,
  since?: string,
  nextLink?: string,
): Promise<{ messages: GraphMessage[]; nextLink?: string }> {
  let url = nextLink;

  if (!url) {
    const params = new URLSearchParams({
      $top: '50',
      $orderby: 'sentDateTime desc',
      $select: 'id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,hasAttachments',
    });

    if (since) {
      params.set('$filter', `sentDateTime ge ${since}`);
    }

    url = `https://graph.microsoft.com/v1.0/me/messages?${params.toString()}`;
  }

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (resp.status === 429) {
    // Rate limited — wait and retry
    const retryAfter = parseInt(resp.headers.get('Retry-After') || '5', 10);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return fetchMessages(accessToken, since, nextLink);
  }

  if (!resp.ok) {
    throw new Error(`Graph messages fetch failed: ${resp.status}`);
  }

  const data = await resp.json();
  return {
    messages: data.value || [],
    nextLink: data['@odata.nextLink'],
  };
}

async function fetchAttachmentMetadata(
  accessToken: string,
  messageId: string,
): Promise<{ name: string; size: number; contentType: string }[]> {
  try {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments?$select=name,size,contentType`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.value || []).map((a: { name: string; size: number; contentType: string }) => ({
      name: a.name,
      size: a.size,
      contentType: a.contentType,
    }));
  } catch {
    return [];
  }
}

async function loadKnownContactEmails(supabase: SupabaseClient): Promise<Map<string, ContactMatch>> {
  const emailMap = new Map<string, ContactMatch>();

  // Load from unified contacts table
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email, listing_id')
    .not('email', 'is', null)
    .eq('archived', false);

  if (contacts) {
    for (const c of contacts) {
      if (c.email) {
        emailMap.set(c.email.toLowerCase(), { id: c.id, email: c.email });
      }
    }
  }

  // Also load from remarketing_buyer_contacts
  const { data: buyerContacts } = await supabase
    .from('remarketing_buyer_contacts')
    .select('id, email, buyer_id')
    .not('email', 'is', null);

  if (buyerContacts) {
    for (const bc of buyerContacts) {
      if (bc.email && !emailMap.has(bc.email.toLowerCase())) {
        // Look up if there's a corresponding entry in contacts table
        const { data: unified } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', bc.email)
          .maybeSingle();

        if (unified) {
          emailMap.set(bc.email.toLowerCase(), { id: unified.id, email: bc.email });
        }
      }
    }
  }

  return emailMap;
}

function matchEmailToContacts(
  message: GraphMessage,
  contactEmails: Map<string, ContactMatch>,
  userEmail: string,
): { contacts: ContactMatch[]; direction: 'inbound' | 'outbound' } {
  const fromAddress = message.from?.emailAddress?.address?.toLowerCase() || '';
  const toAddresses = (message.toRecipients || []).map((r) => r.emailAddress?.address?.toLowerCase());
  const ccAddresses = (message.ccRecipients || []).map((r) => r.emailAddress?.address?.toLowerCase());

  const allAddresses = [fromAddress, ...toAddresses, ...ccAddresses];
  const isOutbound = fromAddress === userEmail.toLowerCase();

  const matchedContacts: ContactMatch[] = [];
  for (const addr of allAddresses) {
    if (addr && addr !== userEmail.toLowerCase()) {
      const match = contactEmails.get(addr);
      if (match) matchedContacts.push(match);
    }
  }

  return {
    contacts: matchedContacts,
    direction: isOutbound ? 'outbound' : 'inbound',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, corsHeaders);
  }

  let body: { userId?: string; accessToken?: string; isInitialSync?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid request body', 400, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // If called from polling (no accessToken provided), process all active connections
  if (!body.userId && !body.accessToken) {
    const { data: connections } = await supabase
      .from('email_connections')
      .select('*')
      .eq('status', 'active');

    if (!connections || connections.length === 0) {
      return successResponse({ message: 'No active connections to sync' }, corsHeaders);
    }

    const results: { userId: string; synced: number; errors: string[] }[] = [];

    for (const conn of connections) {
      try {
        const refreshToken = decryptToken(conn.encrypted_refresh_token);
        const tokenResult = await refreshAccessToken(refreshToken);

        if (!tokenResult) {
          // Track consecutive failures
          const newErrorCount = (conn.last_sync_error_count || 0) + 1;
          const updates: Record<string, unknown> = {
            last_sync_error_count: newErrorCount,
            error_message: 'Token refresh failed during polling sync',
          };

          if (newErrorCount >= 3) {
            updates.status = 'error';
            updates.error_message = 'Token refresh failed 3 consecutive times';
          }

          await supabase
            .from('email_connections')
            .update(updates)
            .eq('id', conn.id);

          results.push({ userId: conn.sourceco_user_id, synced: 0, errors: ['Token refresh failed'] });
          continue;
        }

        // Update stored refresh token if it changed
        if (tokenResult.newRefreshToken !== refreshToken) {
          await supabase
            .from('email_connections')
            .update({
              encrypted_refresh_token: encryptToken(tokenResult.newRefreshToken),
              token_expires_at: new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString(),
            })
            .eq('id', conn.id);
        }

        // Sync since last sync
        const since = conn.last_sync_at || new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const syncResult = await syncEmails(
          supabase,
          tokenResult.accessToken,
          conn.sourceco_user_id,
          conn.email_address,
          since,
          false,
        );

        await supabase
          .from('email_connections')
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_error_count: 0,
            error_message: null,
          })
          .eq('id', conn.id);

        results.push({ userId: conn.sourceco_user_id, synced: syncResult.synced, errors: syncResult.errors });
      } catch (err) {
        console.error(`Sync failed for user ${conn.sourceco_user_id}:`, err);
        results.push({ userId: conn.sourceco_user_id, synced: 0, errors: [(err as Error).message] });
      }
    }

    return successResponse({ results }, corsHeaders);
  }

  // Single user sync (called from callback or manually)
  const userId = body.userId!;
  let accessToken = body.accessToken;

  if (!accessToken) {
    // Need to get an access token from the stored refresh token
    const { data: conn } = await supabase
      .from('email_connections')
      .select('*')
      .eq('sourceco_user_id', userId)
      .eq('status', 'active')
      .single();

    if (!conn) {
      return errorResponse('No active connection found', 404, corsHeaders);
    }

    const refreshToken = decryptToken(conn.encrypted_refresh_token);
    const tokenResult = await refreshAccessToken(refreshToken);
    if (!tokenResult) {
      return errorResponse('Failed to refresh access token', 500, corsHeaders);
    }
    accessToken = tokenResult.accessToken;
  }

  // Get connection info
  const { data: connection } = await supabase
    .from('email_connections')
    .select('email_address')
    .eq('sourceco_user_id', userId)
    .single();

  if (!connection) {
    return errorResponse('Connection not found', 404, corsHeaders);
  }

  const since = body.isInitialSync
    ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  const result = await syncEmails(
    supabase,
    accessToken,
    userId,
    connection.email_address,
    since,
    body.isInitialSync || false,
  );

  // Update last sync timestamp
  await supabase
    .from('email_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_error_count: 0,
      error_message: null,
    })
    .eq('sourceco_user_id', userId);

  return successResponse(result, corsHeaders);
});

async function syncEmails(
  supabase: SupabaseClient,
  accessToken: string,
  userId: string,
  userEmail: string,
  since?: string,
  isInitial = false,
): Promise<{ synced: number; skipped: number; errors: string[] }> {
  const contactEmails = await loadKnownContactEmails(supabase);
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];
  let nextLink: string | undefined;
  let pageCount = 0;
  const maxPages = isInitial ? 100 : 10; // Limit pages for polling

  do {
    try {
      const result = await fetchMessages(accessToken, since, nextLink);
      nextLink = result.nextLink;

      for (const msg of result.messages) {
        try {
          // Check for duplicates
          const { data: existing } = await supabase
            .from('email_messages')
            .select('id')
            .eq('microsoft_message_id', msg.id)
            .maybeSingle();

          if (existing) {
            skipped++;
            continue;
          }

          // Match to known contacts
          const match = matchEmailToContacts(msg, contactEmails, userEmail);
          if (match.contacts.length === 0) {
            skipped++;
            continue;
          }

          // Fetch attachment metadata if needed
          let attachmentMeta: { name: string; size: number; contentType: string }[] = [];
          if (msg.hasAttachments) {
            attachmentMeta = await fetchAttachmentMetadata(accessToken, msg.id);
          }

          // Create a record for each matched contact
          for (const contact of match.contacts) {
            const { error: insertError } = await supabase.from('email_messages').insert({
              microsoft_message_id: match.contacts.length === 1 ? msg.id : `${msg.id}_${contact.id}`,
              microsoft_conversation_id: msg.conversationId,
              contact_id: contact.id,
              deal_id: contact.deal_id || null,
              sourceco_user_id: userId,
              direction: match.direction,
              from_address: msg.from?.emailAddress?.address || '',
              to_addresses: (msg.toRecipients || []).map((r) => r.emailAddress?.address),
              cc_addresses: (msg.ccRecipients || []).map((r) => r.emailAddress?.address),
              subject: msg.subject || '(No subject)',
              body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
              body_text: msg.body?.contentType === 'text' ? msg.body.content : msg.bodyPreview,
              sent_at: msg.sentDateTime || msg.receivedDateTime,
              has_attachments: msg.hasAttachments || false,
              attachment_metadata: attachmentMeta,
            });

            if (insertError) {
              // Skip duplicate key errors silently
              if (!insertError.message?.includes('duplicate key')) {
                errors.push(`Insert failed for ${msg.id}: ${insertError.message}`);
              }
            } else {
              synced++;
            }
          }
        } catch (err) {
          errors.push(`Message ${msg.id}: ${(err as Error).message}`);
        }
      }

      pageCount++;
    } catch (err) {
      errors.push(`Page fetch error: ${(err as Error).message}`);
      break;
    }
  } while (nextLink && pageCount < maxPages);

  console.log(`Sync complete: ${synced} synced, ${skipped} skipped, ${errors.length} errors`);
  return { synced, skipped, errors };
}
