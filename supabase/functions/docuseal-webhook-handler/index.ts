/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

/**
 * docuseal-webhook-handler
 * Processes DocuSeal webhook events (form.completed, form.viewed, form.started, form.declined, form.expired)
 * Updates DocuSeal-specific fields, legacy booleans, AND expanded status fields on firm_agreements.
 * Creates admin_notifications on key events.
 * Includes idempotency checks via docuseal_webhook_log.
 *
 * DocuSeal sends a custom secret header (not HMAC). The header name is
 * configured in DocuSeal's dashboard (Key) and the value must match
 * DOCUSEAL_WEBHOOK_SECRET. Default header name: "onboarding-secret".
 * Override via DOCUSEAL_WEBHOOK_SECRET_HEADER env var if needed.
 */

// Timing-safe string comparison to prevent timing attacks on secret verification.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// DocuSeal webhook verification — checks the specific secret header configured
// in DocuSeal's dashboard. Default header name: "onboarding-secret".
// Override via DOCUSEAL_WEBHOOK_SECRET_HEADER env var if needed.
function verifyDocuSealWebhook(req: Request, secret: string): boolean {
  const headerName = (
    Deno.env.get('DOCUSEAL_WEBHOOK_SECRET_HEADER') || 'onboarding-secret'
  ).toLowerCase();
  const headerValue = req.headers.get(headerName);
  if (!headerValue) return false;
  return timingSafeEqual(headerValue, secret);
}

// Validate that a URL is HTTPS and from a trusted domain.
// Uses specific subdomain patterns instead of broad domain wildcards.
function isValidDocumentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();

    // Exact or specific subdomain matches for trusted providers
    const trustedPatterns = [
      // DocuSeal domains
      (h: string) => h === 'docuseal.com' || h.endsWith('.docuseal.com'),
      (h: string) => h === 'docuseal.co' || h.endsWith('.docuseal.co'),
      // S3 — only specific bucket patterns, not all of amazonaws.com
      (h: string) => h.endsWith('.s3.amazonaws.com') || /^s3\.[a-z0-9-]+\.amazonaws\.com$/.test(h),
      // GCS — only the storage API host
      (h: string) => h === 'storage.googleapis.com',
      // Supabase storage
      (h: string) => h.endsWith('.supabase.co'),
    ];

    return trustedPatterns.some((check) => check(hostname));
  } catch {
    return false;
  }
}

// Basic payload structure validation to ensure this is a real DocuSeal webhook
function isValidDocuSealPayload(payload: Record<string, unknown>): boolean {
  const eventType = payload?.event_type || payload?.type;
  if (!eventType || typeof eventType !== 'string') return false;
  const raw = payload?.data || payload;
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Record<string, unknown>;
  if (!data.submission_id && !data.id) return false;
  return true;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const rawBody = await req.text();

    const webhookSecret = Deno.env.get('DOCUSEAL_WEBHOOK_SECRET');

    // SECURITY: Fail closed — reject all requests when secret is not configured
    if (!webhookSecret) {
      console.error('❌ DOCUSEAL_WEBHOOK_SECRET not configured — rejecting request (fail-closed)');
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500 });
    }

    const valid = verifyDocuSealWebhook(req, webhookSecret);
    if (!valid) {
      console.warn('⚠️ Webhook secret verification failed — rejecting request');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    console.log('✅ Webhook secret verified');

    // Parse and validate payload structure
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error('❌ Invalid JSON payload');
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    if (!isValidDocuSealPayload(payload)) {
      console.error('❌ Invalid payload structure — rejecting');
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
    }

    const rawEventType = String(payload.event_type || payload.type);
    const submissionData = (payload.data || payload) as Record<string, unknown>;

    // Validate event_type format (only allow known patterns)
    const VALID_EVENT_PATTERN =
      /^(form|submission)\.(completed|viewed|started|declined|expired|created|archived)$/;
    const eventType = VALID_EVENT_PATTERN.test(rawEventType)
      ? rawEventType
      : rawEventType.replace(/[^a-z0-9._-]/gi, '').substring(0, 50);

    console.log(`📩 DocuSeal webhook: ${eventType}`, {
      submission_id: submissionData.submission_id || submissionData.id,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate submission_id format (should be numeric string)
    const rawSubmissionId = submissionData.submission_id || submissionData.id;
    const submissionId = String(rawSubmissionId)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .substring(0, 100);

    // ── Idempotency check: skip if we already processed this exact event ──
    const { data: existingLog } = await supabase
      .from('docuseal_webhook_log')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('event_type', eventType)
      .maybeSingle();

    if (existingLog) {
      console.log(`⏩ Duplicate event skipped: ${eventType} for submission ${submissionId}`);
      return new Response(JSON.stringify({ success: true, note: 'Duplicate event' }), {
        status: 200,
      });
    }

    // Log the raw webhook (unique constraint on submission_id + event_type catches races)
    const { error: logError } = await supabase.from('docuseal_webhook_log').insert({
      event_type: eventType,
      submission_id: submissionId,
      submitter_id: submissionData.submitter_id ? String(submissionData.submitter_id) : null,
      external_id: submissionData.external_id || null,
      raw_payload: payload,
      processed_at: new Date().toISOString(),
    });
    if (logError) {
      // Unique constraint violation (23505) = concurrent duplicate; treat as idempotent skip
      if (logError.code === '23505') {
        console.log(`⏩ Concurrent duplicate skipped: ${eventType} for submission ${submissionId}`);
        return new Response(JSON.stringify({ success: true, note: 'Concurrent duplicate' }), {
          status: 200,
        });
      }
      console.error('Failed to log webhook:', logError);
    }

    // Find the firm that matches this submission
    const { data: ndaFirm } = await supabase
      .from('firm_agreements')
      .select('id, primary_company_name')
      .eq('nda_docuseal_submission_id', submissionId)
      .maybeSingle();

    const { data: feeFirm } = await supabase
      .from('firm_agreements')
      .select('id, primary_company_name')
      .eq('fee_docuseal_submission_id', submissionId)
      .maybeSingle();

    let firmId = ndaFirm?.id || feeFirm?.id;
    let firmName = ndaFirm?.primary_company_name || feeFirm?.primary_company_name || 'Unknown';
    let documentType = ndaFirm ? 'nda' : feeFirm ? 'fee_agreement' : null;

    // Fallback to external_id
    if (!firmId || !documentType) {
      if (submissionData.external_id) {
        const { data: extFirm } = await supabase
          .from('firm_agreements')
          .select(
            'id, primary_company_name, nda_docuseal_submission_id, fee_docuseal_submission_id',
          )
          .eq('id', submissionData.external_id)
          .maybeSingle();

        if (extFirm) {
          if (extFirm.nda_docuseal_submission_id === submissionId) {
            firmId = extFirm.id;
            firmName = extFirm.primary_company_name || 'Unknown';
            documentType = 'nda';
          } else if (extFirm.fee_docuseal_submission_id === submissionId) {
            firmId = extFirm.id;
            firmName = extFirm.primary_company_name || 'Unknown';
            documentType = 'fee_agreement';
          }
        }
      }

      if (!firmId || !documentType) {
        console.warn('⚠️ No matching firm found for submission:', submissionId);
        return new Response(JSON.stringify({ success: true, note: 'No matching firm' }), {
          status: 200,
        });
      }
    }

    // Lifecycle events (submission.created, submission.archived) are logged but should
    // NOT update firm signing status — they'd overwrite meaningful statuses like "viewed"
    // or "completed" due to race conditions with DocuSeal's real-time webhooks.
    const lifecycleEvents = new Set(['submission.created', 'submission.archived']);
    if (lifecycleEvents.has(eventType)) {
      console.log(
        `ℹ️ Lifecycle event ${eventType} logged for submission ${submissionId} — skipping status update`,
      );
      return new Response(JSON.stringify({ success: true, note: 'Lifecycle event logged' }), {
        status: 200,
      });
    }

    await processEvent(
      supabase,
      eventType,
      firmId,
      firmName,
      documentType,
      submissionData,
      submissionId,
    );

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: unknown) {
    console.error('❌ Webhook handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});

async function processEvent(
  supabase: SupabaseClient,
  eventType: string,
  firmId: string,
  firmName: string,
  documentType: string,
  submissionData: Record<string, unknown>,
  _submissionId: string,
) {
  const isNda = documentType === 'nda';
  const now = new Date().toISOString();
  const docLabel = isNda ? 'NDA' : 'Fee Agreement';
  const documents = Array.isArray(submissionData.documents) ? submissionData.documents as Array<{ url?: string }> : [];

  // Map DocuSeal event to status
  let docusealStatus: string;
  let expandedStatus: string | null = null; // for nda_status / fee_agreement_status sync
  switch (eventType) {
    case 'form.completed':
    case 'submission.completed':
      docusealStatus = 'completed';
      expandedStatus = 'signed';
      break;
    case 'form.viewed':
    case 'submission.viewed':
      docusealStatus = 'viewed';
      break;
    case 'form.started':
    case 'submission.started':
      docusealStatus = 'started';
      break;
    case 'form.declined':
    case 'submission.declined':
      docusealStatus = 'declined';
      expandedStatus = 'declined';
      break;
    case 'form.expired':
    case 'submission.expired':
      docusealStatus = 'expired';
      expandedStatus = 'expired';
      break;
    default:
      docusealStatus = eventType.replace(/[^a-z0-9._-]/gi, '').substring(0, 50);
  }

  console.log(`📝 Processing ${eventType} for ${documentType} on firm ${firmId}`);

  // Prevent backward state transitions (e.g., "viewed" overwriting "completed")
  const TERMINAL_STATUSES = new Set(['completed', 'declined', 'expired']);
  const statusCol = isNda ? 'nda_docuseal_status' : 'fee_docuseal_status';
  const { data: currentFirm } = await supabase
    .from('firm_agreements')
    .select(statusCol)
    .eq('id', firmId)
    .single();

  const currentStatus = (currentFirm as any)?.[statusCol];
  if (
    currentStatus &&
    TERMINAL_STATUSES.has(currentStatus) &&
    !TERMINAL_STATUSES.has(docusealStatus)
  ) {
    console.log(
      `⏩ Skipping non-terminal update: current=${currentStatus}, incoming=${docusealStatus}`,
    );
    return;
  }

  // Build update payload — update BOTH docuseal status AND expanded status
  const updates: Record<string, unknown> = {
    updated_at: now,
  };

  if (isNda) {
    updates.nda_docuseal_status = docusealStatus;
    if (expandedStatus) updates.nda_status = expandedStatus;

    if (docusealStatus === 'completed') {
      updates.nda_signed = true;
      updates.nda_signed_at = now;
      const docUrl = documents[0]?.url;
      if (docUrl && isValidDocumentUrl(docUrl)) {
        updates.nda_signed_document_url = docUrl;
        updates.nda_document_url = docUrl; // sync to expanded field too
      }
    } else if (docusealStatus === 'declined' || docusealStatus === 'expired') {
      updates.nda_signed = false;
    }
  } else {
    updates.fee_docuseal_status = docusealStatus;
    if (expandedStatus) updates.fee_agreement_status = expandedStatus;

    if (docusealStatus === 'completed') {
      updates.fee_agreement_signed = true;
      updates.fee_agreement_signed_at = now;
      const docUrl = documents[0]?.url;
      if (docUrl && isValidDocumentUrl(docUrl)) {
        updates.fee_signed_document_url = docUrl;
        updates.fee_agreement_document_url = docUrl; // sync to expanded field too
      }
    } else if (docusealStatus === 'declined' || docusealStatus === 'expired') {
      updates.fee_agreement_signed = false;
    }
  }

  const { error } = await supabase.from('firm_agreements').update(updates).eq('id', firmId);

  if (error) {
    console.error('❌ Failed to update firm_agreements:', error);
  }

  // ── Create admin notifications for key events ──
  const notifiableEvents = ['completed', 'declined', 'expired'];
  if (notifiableEvents.includes(docusealStatus)) {
    await createAdminNotification(supabase, firmId, firmName, docLabel, docusealStatus);
  }

  // If completed, sync to profiles AND send buyer notification with signed doc link
  if (docusealStatus === 'completed') {
    try {
      const { data: members } = await supabase
        .from('firm_members')
        .select('user_id')
        .eq('firm_id', firmId);

      if (members?.length) {
        const profileUpdates = isNda
          ? { nda_signed: true, nda_signed_at: now }
          : { fee_agreement_signed: true, fee_agreement_signed_at: now };

        for (const member of members) {
          await supabase
            .from('profiles')
            .update({ ...profileUpdates, updated_at: now })
            .eq('id', member.user_id);
        }

        // Send buyer notification with signed document download link
        const signedDocUrl = documents[0]?.url || null;
        await sendBuyerSignedDocNotification(supabase, members, firmId, docLabel, signedDocUrl);
      }
    } catch (syncError) {
      console.error('⚠️ Profile sync error:', syncError);
    }
  }
}

/**
 * Create admin_notifications for all admins when a document event occurs.
 */
async function createAdminNotification(
  supabase: SupabaseClient,
  firmId: string,
  firmName: string,
  docLabel: string,
  status: string,
) {
  try {
    // Get all admin user IDs from user_roles table (RBAC source of truth)
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
        docuseal_status: status,
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

/**
 * Send a notification + system message to all firm members with a link to download their signed document.
 */
async function sendBuyerSignedDocNotification(
  supabase: SupabaseClient,
  members: { user_id: string }[],
  firmId: string,
  docLabel: string,
  signedDocUrl: string | null,
) {
  try {
    const downloadNote = signedDocUrl
      ? `You can download your signed copy from your Profile → Documents tab, or use this link: ${signedDocUrl}`
      : `You can view your signed documents in your Profile → Documents tab.`;

    const docType = docLabel.toLowerCase().replace(/ /g, '_');

    for (const member of members) {
      // Deduplicate: check if confirm-agreement-signed already created this notification
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

      // Insert a system message into General Inquiry only (first active connection request)
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
