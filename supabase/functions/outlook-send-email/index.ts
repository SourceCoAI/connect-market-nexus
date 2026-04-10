/**
 * outlook-send-email: Sends an email via Microsoft Graph on behalf of a team member.
 *
 * Supports both new composition and reply-to-thread. The sent email is
 * automatically logged in the email_messages table and appears in the
 * user's Outlook Sent folder.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { successResponse, errorResponse } from '../_shared/response-helpers.ts';

interface SendEmailRequest {
  contactId: string;
  dealId?: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  replyToMessageId?: string; // Microsoft message ID to reply to
  attachments?: { name: string; contentBytes: string; contentType: string }[];
}

import {
  decryptToken,
  refreshAccessToken as refreshTokenFull,
} from '../_shared/microsoft-tokens.ts';

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

  const auth = await requireAuth(req);
  if (!auth.authenticated || !auth.userId) {
    return errorResponse(auth.error || 'Authentication required', 401, corsHeaders);
  }

  let body: SendEmailRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid request body', 400, corsHeaders);
  }

  if (!body.contactId || !body.to?.length || !body.subject || !body.bodyHtml) {
    return errorResponse('contactId, to, subject, and bodyHtml are required', 400, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Get user's connection and verify it's active
  const { data: connection } = await supabase
    .from('email_connections')
    .select('*')
    .eq('sourceco_user_id', auth.userId)
    .eq('status', 'active')
    .single();

  if (!connection) {
    return errorResponse(
      'No active Outlook connection. Please connect your account in Settings.',
      400,
      corsHeaders,
    );
  }

  // Verify user has access to this contact (checks both contact and deal assignments)
  const { data: hasAccess } = await supabase.rpc('user_has_email_access', {
    _user_id: auth.userId,
    _contact_id: body.contactId,
    _deal_id: body.dealId || null,
  });

  if (!hasAccess) {
    return errorResponse('You do not have access to this contact', 403, corsHeaders);
  }

  // Get access token
  const refreshToken = await decryptToken(connection.encrypted_refresh_token);
  const accessToken = await refreshAccessToken(refreshToken);

  if (!accessToken) {
    // Mark connection as error
    await supabase
      .from('email_connections')
      .update({
        status: 'error',
        error_message: 'Failed to refresh access token when sending email',
      })
      .eq('id', connection.id);

    return errorResponse(
      'Failed to authenticate with Outlook. Please reconnect your account.',
      401,
      corsHeaders,
    );
  }

  try {
    let graphUrl: string;
    let graphBody: Record<string, unknown>;

    if (body.replyToMessageId) {
      // Reply to existing thread
      graphUrl = `https://graph.microsoft.com/v1.0/me/messages/${body.replyToMessageId}/reply`;
      graphBody = {
        message: {
          toRecipients: body.to.map((email) => ({ emailAddress: { address: email } })),
          ccRecipients: (body.cc || []).map((email) => ({ emailAddress: { address: email } })),
          body: {
            contentType: 'HTML',
            content: body.bodyHtml,
          },
          attachments: (body.attachments || []).map((a) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.name,
            contentBytes: a.contentBytes,
            contentType: a.contentType,
          })),
        },
      };
    } else {
      // New email
      graphUrl = 'https://graph.microsoft.com/v1.0/me/sendMail';
      graphBody = {
        message: {
          subject: body.subject,
          body: {
            contentType: 'HTML',
            content: body.bodyHtml,
          },
          toRecipients: body.to.map((email) => ({ emailAddress: { address: email } })),
          ccRecipients: (body.cc || []).map((email) => ({ emailAddress: { address: email } })),
          attachments: (body.attachments || []).map((a) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.name,
            contentBytes: a.contentBytes,
            contentType: a.contentType,
          })),
        },
        saveToSentItems: true,
      };
    }

    const graphResp = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphBody),
    });

    if (!graphResp.ok) {
      const errText = await graphResp.text();
      console.error('Graph send failed:', errText);
      return errorResponse(`Failed to send email: ${graphResp.status}`, 500, corsHeaders);
    }

    // Store the sent email in our system.
    // Use a placeholder microsoft_message_id — the next sync cycle will pick up
    // the real Graph message from the Sent folder and skip it via dedup on the
    // contact_id + sent_at + from_address combination (or replace this record
    // if the real Graph ID arrives).
    const sentAt = new Date().toISOString();
    const placeholderMsgId = `platform_sent_${crypto.randomUUID()}`;
    const { data: emailRecord, error: insertError } = await supabase
      .from('email_messages')
      .insert({
        microsoft_message_id: placeholderMsgId,
        microsoft_conversation_id: null,
        contact_id: body.contactId,
        deal_id: body.dealId || null,
        sourceco_user_id: auth.userId,
        direction: 'outbound',
        from_address: connection.email_address,
        to_addresses: body.to,
        cc_addresses: body.cc || [],
        subject: body.subject,
        body_html: body.bodyHtml,
        body_text: body.bodyText || '',
        sent_at: sentAt,
        has_attachments: (body.attachments || []).length > 0,
        attachment_metadata: (body.attachments || []).map((a) => ({
          name: a.name,
          // contentBytes is base64: every 4 chars represent 3 bytes of original data
          size: a.contentBytes ? Math.round((a.contentBytes.length * 3) / 4) : 0,
          contentType: a.contentType,
        })),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to log sent email:', insertError);
    }

    // Audit log
    await supabase.from('email_access_log').insert({
      sourceco_user_id: auth.userId,
      email_message_id: emailRecord?.id || null,
      action: body.replyToMessageId ? 'replied' : 'sent',
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null,
    });

    // Log to deal_activities for deal timeline visibility (use listing_id as deal_id)
    let resolvedDealId = body.dealId || null;
    if (!resolvedDealId && body.contactId) {
      try {
        const { data: ct } = await supabase.from('contacts').select('listing_id').eq('id', body.contactId).single();
        if (ct?.listing_id) {
          resolvedDealId = ct.listing_id;
        }
      } catch (_) { /* ignore resolution failure */ }
    }

    if (resolvedDealId) {
      try {
        await supabase.rpc('log_deal_activity', {
          p_deal_id: resolvedDealId,
          p_activity_type: 'email_sent',
          p_title: `Email sent to ${body.to.join(', ')}`,
          p_description: body.subject,
          p_admin_id: auth.userId,
          p_metadata: {
            email_message_id: emailRecord?.id || null,
            direction: 'outbound',
            from_address: connection.email_address,
            to_addresses: body.to,
            subject: body.subject,
            has_attachments: (body.attachments || []).length > 0,
            contact_id: body.contactId,
            is_reply: !!body.replyToMessageId,
          },
        });
      } catch (e) {
        console.error('[outlook-send] Failed to log deal activity:', e);
      }
    }

    return successResponse(
      {
        sent: true,
        emailId: emailRecord?.id,
        sentAt,
      },
      corsHeaders,
    );
  } catch (err) {
    console.error('Send email error:', err);
    return errorResponse('Failed to send email', 500, corsHeaders);
  }
});
