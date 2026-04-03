/**
 * email-sender.ts — The ONE canonical email sending layer.
 *
 * RULES:
 * 1. Every outbound email in the platform MUST go through sendEmail().
 * 2. No edge function may call Brevo directly.
 * 3. Sender identity is locked to the verified sender.
 * 4. Every send is logged to outbound_emails + email_events.
 * 5. Returns both internal ID and provider message ID.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Locked sender identity ──────────────────────────────────────────────────
const VERIFIED_SENDER_EMAIL = 'adam.haile@sourcecodeals.com';
const VERIFIED_SENDER_NAME = 'Adam Haile - SourceCo';
const DEFAULT_REPLY_TO = 'adam.haile@sourcecodeals.com';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EmailAttachment {
  name: string;
  content: string; // base64
  contentType?: string;
}

export interface SendEmailOptions {
  /** Template/purpose identifier for tracking */
  templateName: string;
  /** Recipient email */
  to: string;
  /** Recipient display name */
  toName?: string;
  /** Subject line */
  subject: string;
  /** HTML body */
  htmlContent: string;
  /** Plain text fallback */
  textContent?: string;
  /** Reply-to override (defaults to adam.haile@sourcecodeals.com) */
  replyTo?: string;
  /** Sender name override (defaults to "Adam Haile - SourceCo") */
  senderName?: string;
  /** Is transactional (skips unsubscribe header) */
  isTransactional?: boolean;
  /** Attachments */
  attachments?: EmailAttachment[];
  /** Extra metadata to store with the email record */
  metadata?: Record<string, unknown>;
}

export interface SendEmailResult {
  success: boolean;
  /** Internal outbound_emails record ID */
  emailId?: string;
  /** Brevo provider message ID */
  providerMessageId?: string;
  /** Internal correlation UUID */
  correlationId?: string;
  error?: string;
}

// ── Retry config ────────────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

// ── Main send function ──────────────────────────────────────────────────────

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');
  if (!brevoApiKey) {
    return { success: false, error: 'BREVO_API_KEY not configured' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Suppression check ──
  try {
    const { data: suppressed } = await supabase
      .from('suppressed_emails')
      .select('reason')
      .eq('email', options.to.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (suppressed) {
      console.warn(`[email-sender] SUPPRESSED | to=${options.to} | reason=${suppressed.reason} | template=${options.templateName}`);
      return { success: false, error: `Email suppressed: ${suppressed.reason}` };
    }
  } catch (e) {
    console.warn('[email-sender] Suppression check failed (proceeding anyway):', e);
  }

  const correlationId = crypto.randomUUID();
  const senderEmail = VERIFIED_SENDER_EMAIL;
  const senderName = options.senderName || VERIFIED_SENDER_NAME;
  const replyTo = options.replyTo || DEFAULT_REPLY_TO;

  // ── Step 1: Create outbound_emails record (status=queued) ──
  let emailId: string | undefined;
  try {
    const { data: record, error: insertErr } = await supabase
      .from('outbound_emails')
      .insert({
        template_name: options.templateName,
        recipient_email: options.to,
        recipient_name: options.toName || options.to,
        sender_email: senderEmail,
        sender_name: senderName,
        reply_to_email: replyTo,
        correlation_id: correlationId,
        status: 'queued',
        subject: options.subject,
        has_attachment: !!(options.attachments && options.attachments.length > 0),
        metadata: options.metadata || {},
        send_attempts: 0,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.warn('[email-sender] Failed to create outbound record:', insertErr.message);
    } else {
      emailId = record.id;
    }
  } catch (e) {
    console.warn('[email-sender] outbound_emails insert error:', e);
  }

  // ── Step 2: Build Brevo payload ──
  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: options.to, name: options.toName || options.to }],
    subject: options.subject,
    htmlContent: options.htmlContent,
  };

  if (options.textContent) {
    payload.textContent = options.textContent;
  }

  payload.replyTo = { email: replyTo, name: senderName };

  if (options.attachments && options.attachments.length > 0) {
    payload.attachment = options.attachments.map(a => ({
      name: a.name,
      content: a.content,
      ...(a.contentType ? { contentType: a.contentType } : {}),
    }));
  }

  // Transactional emails don't get unsubscribe headers
  if (!options.isTransactional) {
    const platformUrl = Deno.env.get('PLATFORM_URL') || 'https://app.sourcecodeals.com';
    const unsubUrl = `${platformUrl}/unsubscribe?email=${encodeURIComponent(options.to)}`;
    payload.headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  console.log(`[email-sender] SENDING | template=${options.templateName} | to=${options.to} | from=${senderName} <${senderEmail}> | replyTo=${replyTo} | attachments=${options.attachments?.length || 0} | correlationId=${correlationId}`);

  // ── Step 3: Send with retry ──
  let lastError = '';
  let providerMessageId: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': brevoApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const data = await response.json();

      if (response.ok) {
        providerMessageId = data.messageId;
        if (attempt > 0) {
          console.log(`[email-sender] Succeeded on retry ${attempt}/${MAX_RETRIES}`);
        }

        // Update record to accepted
        if (emailId) {
          await updateEmailStatus(supabase, emailId, 'accepted', {
            provider_message_id: providerMessageId,
            accepted_at: new Date().toISOString(),
            send_attempts: attempt + 1,
          });
          await insertEvent(supabase, emailId, 'accepted', { providerMessageId });
        }

        console.log(`[email-sender] SUCCESS | to=${options.to} | template=${options.templateName} | providerMsgId=${providerMessageId} | correlationId=${correlationId}`);

        return {
          success: true,
          emailId,
          providerMessageId,
          correlationId,
        };
      }

      // 4xx = don't retry
      if (response.status >= 400 && response.status < 500) {
        lastError = `HTTP ${response.status}: ${JSON.stringify(data)}`;
        console.error(`[email-sender] Client error (no retry): ${lastError}`);
        break;
      }

      // 5xx = retry
      lastError = `HTTP ${response.status}: ${JSON.stringify(data)}`;
      console.warn(`[email-sender] Server error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError}`);
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[email-sender] Fetch error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError}`);
    }

    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
    }
  }

  // All attempts failed
  console.error(`[email-sender] FAILED | to=${options.to} | template=${options.templateName} | error=${lastError} | correlationId=${correlationId}`);

  if (emailId) {
    await updateEmailStatus(supabase, emailId, 'failed', {
      last_error: lastError,
      failed_at: new Date().toISOString(),
      send_attempts: MAX_RETRIES + 1,
    });
    await insertEvent(supabase, emailId, 'failed', { error: lastError });
  }

  return {
    success: false,
    emailId,
    correlationId,
    error: `All retries exhausted: ${lastError}`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function updateEmailStatus(
  supabase: SupabaseClient,
  emailId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase
      .from('outbound_emails')
      .update({ status, ...extra })
      .eq('id', emailId);
  } catch (e) {
    console.warn('[email-sender] Failed to update status:', e);
  }
}

async function insertEvent(
  supabase: SupabaseClient,
  emailId: string,
  eventType: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase
      .from('email_events')
      .insert({
        outbound_email_id: emailId,
        event_type: eventType,
        event_data: data,
      });
  } catch (e) {
    console.warn('[email-sender] Failed to insert event:', e);
  }
}
