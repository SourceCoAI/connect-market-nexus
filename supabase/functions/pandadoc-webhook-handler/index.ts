/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

/**
 * pandadoc-webhook-handler
 * Processes PandaDoc webhook events (document.completed, document.viewed,
 * document.declined, document.expired, document.state_changed, recipient.completed).
 * Updates PandaDoc-specific fields, legacy booleans, AND expanded status fields on firm_agreements.
 * Creates admin_notifications on key events.
 * Includes idempotency checks via pandadoc_webhook_log.
 *
 * PandaDoc uses HMAC-SHA256 signature verification via X-PandaDoc-Signature header.
 */

// Timing-safe string comparison to prevent timing attacks on signature verification.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// PandaDoc HMAC-SHA256 webhook verification
async function verifyPandaDocWebhook(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return timingSafeEqual(computed, signature);
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const rawBody = await req.text();

    const webhookKey = Deno.env.get('PANDADOC_WEBHOOK_KEY');

    // SECURITY: Fail closed — reject all requests when key is not configured
    if (!webhookKey) {
      console.error('❌ PANDADOC_WEBHOOK_KEY not configured — rejecting request (fail-closed)');
      return new Response(JSON.stringify({ error: 'Webhook key not configured' }), { status: 500 });
    }

    // Verify HMAC-SHA256 signature
    const signature = req.headers.get('x-pandadoc-signature');
    if (!signature) {
      console.warn('⚠️ Missing X-PandaDoc-Signature header — rejecting request');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const valid = await verifyPandaDocWebhook(rawBody, signature, webhookKey);
    if (!valid) {
      console.warn('⚠️ Webhook HMAC signature verification failed — rejecting request');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    console.log('✅ Webhook HMAC signature verified');

    // Parse and validate payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error('❌ Invalid JSON payload');
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    // PandaDoc webhook payload structure:
    // [{ event: "document_state_change", data: { id: "...", status: "...", ... } }]
    // or { event: "...", data: { ... } }
    const events = Array.isArray(payload) ? payload : [payload];
    const event = events[0] as Record<string, unknown>;

    if (!event || !event.event) {
      console.error('❌ Invalid payload structure — no event field');
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
    }

    const rawEventType = String(event.event);
    const eventData = (event.data || {}) as Record<string, unknown>;
    const documentId = String(eventData.id || '');

    if (!documentId) {
      console.error('❌ No document ID in webhook payload');
      return new Response(JSON.stringify({ error: 'Missing document ID' }), { status: 400 });
    }

    // Validate event type
    const VALID_EVENTS = new Set([
      'document_state_change',
      'document_completed',
      'document_viewed',
      'document_declined',
      'document_expired',
      'recipient_completed',
      'document_updated',
      'document_deleted',
      'document_creation',
    ]);

    if (!VALID_EVENTS.has(rawEventType)) {
      console.warn(`⚠️ Unknown PandaDoc event type: ${rawEventType.substring(0, 50)}`);
      return new Response(JSON.stringify({ received: true, skipped: 'unknown_event_type' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Map PandaDoc event to a normalized status
    const documentStatus = String(eventData.status || '');
    const normalizedEventType = mapEventType(rawEventType, documentStatus);

    console.log(`📩 PandaDoc webhook: ${rawEventType} (${documentStatus})`, {
      document_id: documentId,
      normalized: normalizedEventType,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Sanitize document ID
    const sanitizedDocId = documentId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);

    // Idempotency check
    const { data: existingLog } = await supabase
      .from('pandadoc_webhook_log')
      .select('id')
      .eq('document_id', sanitizedDocId)
      .eq('event_type', normalizedEventType)
      .maybeSingle();

    if (existingLog) {
      console.log(`⏩ Duplicate event skipped: ${normalizedEventType} for document ${sanitizedDocId}`);
      return new Response(JSON.stringify({ success: true, note: 'Duplicate event' }), {
        status: 200,
      });
    }

    // Extract signer email from event data
    const signerEmail = extractSignerEmail(eventData, normalizedEventType);

    // Log the raw webhook
    const { error: logError } = await supabase.from('pandadoc_webhook_log').insert({
      event_type: normalizedEventType,
      document_id: sanitizedDocId,
      recipient_id: eventData.recipient_id ? String(eventData.recipient_id) : null,
      external_id: eventData.metadata?.firm_id ? String((eventData.metadata as Record<string, unknown>).firm_id) : null,
      signer_email: signerEmail,
      raw_payload: payload,
      processed_at: new Date().toISOString(),
    });
    if (logError) {
      if (logError.code === '23505') {
        console.log(`⏩ Concurrent duplicate skipped: ${normalizedEventType} for document ${sanitizedDocId}`);
        return new Response(JSON.stringify({ success: true, note: 'Concurrent duplicate' }), {
          status: 200,
        });
      }
      console.error('Failed to log webhook:', logError);
    }

    // Find the firm that matches this document
    const { data: ndaFirm } = await supabase
      .from('firm_agreements')
      .select('id, primary_company_name')
      .eq('nda_pandadoc_document_id', sanitizedDocId)
      .maybeSingle();

    const { data: feeFirm } = await supabase
      .from('firm_agreements')
      .select('id, primary_company_name')
      .eq('fee_pandadoc_document_id', sanitizedDocId)
      .maybeSingle();

    let firmId = ndaFirm?.id || feeFirm?.id;
    let firmName = ndaFirm?.primary_company_name || feeFirm?.primary_company_name || 'Unknown';
    let documentType = ndaFirm ? 'nda' : feeFirm ? 'fee_agreement' : null;

    // Fallback to metadata.firm_id
    if (!firmId || !documentType) {
      const metadataFirmId = (eventData.metadata as Record<string, unknown>)?.firm_id;
      if (metadataFirmId) {
        const { data: extFirm } = await supabase
          .from('firm_agreements')
          .select('id, primary_company_name, nda_pandadoc_document_id, fee_pandadoc_document_id')
          .eq('id', String(metadataFirmId))
          .maybeSingle();

        if (extFirm) {
          if (extFirm.nda_pandadoc_document_id === sanitizedDocId) {
            firmId = extFirm.id;
            firmName = extFirm.primary_company_name || 'Unknown';
            documentType = 'nda';
          } else if (extFirm.fee_pandadoc_document_id === sanitizedDocId) {
            firmId = extFirm.id;
            firmName = extFirm.primary_company_name || 'Unknown';
            documentType = 'fee_agreement';
          }
        }
      }

      if (!firmId || !documentType) {
        console.warn('⚠️ No matching firm found for document:', sanitizedDocId);
        return new Response(JSON.stringify({ success: true, note: 'No matching firm' }), {
          status: 200,
        });
      }
    }

    // Lifecycle events (document_creation, document_updated, document_deleted) are logged
    // but should NOT update firm signing status
    const lifecycleEvents = new Set(['document_creation', 'document_updated', 'document_deleted']);
    if (lifecycleEvents.has(rawEventType) && normalizedEventType !== 'document.completed') {
      console.log(
        `ℹ️ Lifecycle event ${rawEventType} logged for document ${sanitizedDocId} — skipping status update`,
      );
      return new Response(JSON.stringify({ success: true, note: 'Lifecycle event logged' }), {
        status: 200,
      });
    }

    await processEvent(
      supabase,
      normalizedEventType,
      firmId,
      firmName,
      documentType,
      sanitizedDocId,
      signerEmail,
    );

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: unknown) {
    console.error('❌ Webhook handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});

function mapEventType(rawEvent: string, status: string): string {
  // PandaDoc uses document_state_change with a status field
  if (rawEvent === 'document_state_change') {
    switch (status) {
      case 'document.completed': return 'document.completed';
      case 'document.viewed': return 'document.viewed';
      case 'document.sent': return 'document.sent';
      case 'document.draft': return 'document.draft';
      case 'document.declined': return 'document.declined';
      case 'document.voided': return 'document.voided';
      case 'document.expired': return 'document.expired';
      default: return `document.${status}`;
    }
  }
  // Direct event types
  switch (rawEvent) {
    case 'document_completed': return 'document.completed';
    case 'document_viewed': return 'document.viewed';
    case 'document_declined': return 'document.declined';
    case 'document_expired': return 'document.expired';
    case 'recipient_completed': return 'recipient.completed';
    default: return rawEvent;
  }
}

function extractSignerEmail(eventData: Record<string, unknown>, eventType: string): string | null {
  // Try different payload locations (PandaDoc sends signer info in various places)
  if (typeof eventData.email === 'string') return eventData.email;
  if (Array.isArray(eventData.recipients)) {
    const first = eventData.recipients[0] as Record<string, unknown> | undefined;
    if (first && typeof first.email === 'string') return first.email;
  }
  // Try sender / action_by fields
  const sender = eventData.sender as Record<string, unknown> | undefined;
  if (sender && typeof sender.email === 'string') return sender.email;
  const actionBy = eventData.action_by as Record<string, unknown> | undefined;
  if (actionBy && typeof actionBy.email === 'string') return actionBy.email;

  // Warn on completion events — we really want to know who signed
  if (eventType === 'document.completed' || eventType === 'recipient.completed') {
    console.warn('⚠️ Could not extract signer email from completed event payload');
  }
  return null;
}

async function processEvent(
  supabase: SupabaseClient,
  eventType: string,
  firmId: string,
  firmName: string,
  documentType: string,
  documentId: string,
  signerEmail: string | null,
) {
  const isNda = documentType === 'nda';
  const now = new Date().toISOString();
  const docLabel = isNda ? 'NDA' : 'Fee Agreement';

  // Map PandaDoc event to status
  let pandadocStatus: string;
  let expandedStatus: string | null = null;
  switch (eventType) {
    case 'document.completed':
    case 'recipient.completed':
      pandadocStatus = 'completed';
      expandedStatus = 'signed';
      break;
    case 'document.viewed':
      pandadocStatus = 'viewed';
      break;
    case 'document.sent':
      pandadocStatus = 'sent';
      break;
    case 'document.declined':
      pandadocStatus = 'declined';
      expandedStatus = 'declined';
      break;
    case 'document.voided':
      pandadocStatus = 'voided';
      expandedStatus = 'declined';
      break;
    case 'document.expired':
      pandadocStatus = 'expired';
      expandedStatus = 'expired';
      break;
    default:
      pandadocStatus = eventType;
  }

  console.log(`📝 Processing ${eventType} for ${documentType} on firm ${firmId}`);

  // Prevent backward state transitions
  const TERMINAL_STATUSES = new Set(['completed', 'declined', 'expired', 'voided']);
  const statusCol = isNda ? 'nda_pandadoc_status' : 'fee_pandadoc_status';
  const { data: currentFirm } = await supabase
    .from('firm_agreements')
    .select(statusCol)
    .eq('id', firmId)
    .single();

  const currentStatus = (currentFirm as Record<string, unknown>)?.[statusCol] as string | undefined;
  if (
    currentStatus &&
    TERMINAL_STATUSES.has(currentStatus) &&
    !TERMINAL_STATUSES.has(pandadocStatus)
  ) {
    console.log(
      `⏩ Skipping non-terminal update: current=${currentStatus}, incoming=${pandadocStatus}`,
    );
    return;
  }

  // Build update payload
  const updates: Record<string, unknown> = {
    updated_at: now,
  };

  if (isNda) {
    updates.nda_pandadoc_status = pandadocStatus;
    if (expandedStatus) updates.nda_status = expandedStatus;

    if (pandadocStatus === 'completed') {
      updates.nda_signed = true;
      updates.nda_signed_at = now;
      if (signerEmail) updates.nda_signed_by_name = signerEmail;
      // PDF URLs are fetched fresh on demand via get-agreement-document — no caching here
    } else if (pandadocStatus === 'declined' || pandadocStatus === 'expired' || pandadocStatus === 'voided') {
      updates.nda_signed = false;
    }
  } else {
    updates.fee_pandadoc_status = pandadocStatus;
    if (expandedStatus) updates.fee_agreement_status = expandedStatus;

    if (pandadocStatus === 'completed') {
      updates.fee_agreement_signed = true;
      updates.fee_agreement_signed_at = now;
      if (signerEmail) updates.fee_agreement_signed_by_name = signerEmail;
    } else if (pandadocStatus === 'declined' || pandadocStatus === 'expired' || pandadocStatus === 'voided') {
      updates.fee_agreement_signed = false;
    }
  }

  const { error } = await supabase.from('firm_agreements').update(updates).eq('id', firmId);

  if (error) {
    console.error('❌ Failed to update firm_agreements:', error);
  }

  // Create admin notifications for key events
  const notifiableEvents = ['completed', 'declined', 'expired', 'voided'];
  if (notifiableEvents.includes(pandadocStatus)) {
    await createAdminNotification(supabase, firmId, firmName, docLabel, pandadocStatus);
  }

  // If completed, send buyer notification (firm_agreements is already updated above)
  if (pandadocStatus === 'completed') {
    try {
      const { data: members } = await supabase
        .from('firm_members')
        .select('user_id')
        .eq('firm_id', firmId);

      if (members?.length) {
        await sendBuyerSignedDocNotification(supabase, members, firmId, docLabel, null);
      }
    } catch (notifyError) {
      console.error('⚠️ Buyer notification error:', notifyError);
    }
  }
}

async function createAdminNotification(
  supabase: SupabaseClient,
  firmId: string,
  firmName: string,
  docLabel: string,
  status: string,
) {
  try {
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'owner']);

    const admins = (adminRoles || []).map((r: { user_id: string }) => ({ id: r.user_id }));
    if (!admins.length) return;

    const statusMessages: Record<string, { title: string; message: string }> = {
      completed: {
        title: `${docLabel} Signed`,
        message: `${firmName} has signed the ${docLabel}.`,
      },
      declined: {
        title: `${docLabel} Declined`,
        message: `${firmName} has declined the ${docLabel}. Follow up may be needed.`,
      },
      expired: {
        title: `${docLabel} Expired`,
        message: `${docLabel} for ${firmName} has expired and needs to be resent.`,
      },
      voided: {
        title: `${docLabel} Voided`,
        message: `${docLabel} for ${firmName} has been voided.`,
      },
    };

    const notif = statusMessages[status];
    if (!notif) return;

    const notifications = admins.map((admin: { id: string }) => ({
      admin_id: admin.id,
      title: notif.title,
      message: notif.message,
      notification_type: `document_${status}`,
      metadata: {
        firm_id: firmId,
        document_type: docLabel.toLowerCase().replace(/ /g, '_'),
        pandadoc_status: status,
      },
      is_read: false,
    }));

    const { error } = await supabase.from('admin_notifications').insert(notifications);
    if (error) console.error('⚠️ Failed to create notifications:', error);
    else
      console.log(
        `🔔 Created ${notifications.length} admin notifications for ${docLabel} ${status}`,
      );
  } catch (err) {
    console.error('⚠️ Notification creation error:', err);
  }
}

async function sendBuyerSignedDocNotification(
  supabase: SupabaseClient,
  members: { user_id: string }[],
  firmId: string,
  docLabel: string,
  signedDocUrl: string | null,
) {
  try {
    const downloadNote = signedDocUrl
      ? `You can download your signed copy from your Profile → Documents tab.`
      : `You can view your signed documents in your Profile → Documents tab.`;

    const docType = docLabel.toLowerCase().replace(/ /g, '_');

    for (const member of members) {
      // Deduplicate
      const { data: existing } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('user_id', member.user_id)
        .eq('notification_type', 'agreement_signed')
        .eq('title', `${docLabel} Signed Successfully`)
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log(
          `⏩ Skipping duplicate agreement_signed notification for user ${member.user_id} (${docLabel})`,
        );
        continue;
      }

      await supabase.from('user_notifications').insert({
        user_id: member.user_id,
        notification_type: 'agreement_signed',
        title: `${docLabel} Signed Successfully`,
        message: `Your ${docLabel} has been signed and recorded. ${downloadNote}`,
        metadata: {
          firm_id: firmId,
          document_type: docType,
          signed_document_url: signedDocUrl || null,
        },
      });

      // Insert a system message into General Inquiry
      const { data: generalRequest } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('user_id', member.user_id)
        .in('status', ['approved', 'pending', 'on_hold'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (generalRequest) {
        const messageBody = `✅ Your ${docLabel} has been signed successfully and is on file. You can download a permanent copy using the Download PDF button in the Documents section at the top of your Messages page.`;

        const { data: existingMsg } = await supabase
          .from('connection_messages')
          .select('id')
          .eq('connection_request_id', generalRequest.id)
          .eq('message_type', 'system')
          .ilike('body', `%Your ${docLabel} has been signed%`)
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();

        if (!existingMsg) {
          const { error: msgError } = await supabase.from('connection_messages').insert({
            connection_request_id: generalRequest.id,
            sender_role: 'admin',
            sender_id: null,
            body: messageBody,
            message_type: 'system',
            is_read_by_admin: true,
            is_read_by_buyer: false,
          });

          if (msgError) {
            console.error('⚠️ Failed to insert signed doc system message:', msgError);
          }
        } else {
          console.log(
            `⏩ Skipping duplicate system message for connection ${generalRequest.id} (${docLabel})`,
          );
        }
      }
    }
    console.log(`📨 Sent signed doc notifications to ${members.length} buyer(s) for ${docLabel}`);
  } catch (err) {
    console.error('⚠️ Buyer notification error:', err);
  }
}
