/**
 * Shared Brevo email sending utility.
 *
 * Centralizes the Brevo SMTP API call so that edge functions don't each
 * duplicate the fetch logic, headers, and error handling.
 *
 * H-8 NOTE: All 32 email-sending edge functions should migrate to use this
 * shared sender (or the consolidated `send-transactional-email` function).
 * Functions that call Brevo directly without using sendViaBervo() miss:
 * - Retry logic with exponential backoff
 * - Consistent error handling
 * - List-Unsubscribe headers (C-4 fix)
 * - Email unsubscribe checking
 *
 * Migration priority (functions calling Brevo directly):
 * 1. send-nda-email, send-fee-agreement-email (high volume, near-identical)
 * 2. send-deal-alert, send-connection-notification (user-facing)
 * 3. send-approval-email, send-marketplace-invitation (onboarding)
 */

export interface BrevoEmailOptions {
  /** Recipient email address */
  to: string;
  /** Recipient display name */
  toName?: string;
  /** Email subject line */
  subject: string;
  /** HTML content */
  htmlContent: string;
  /** Plain text fallback (optional) */
  textContent?: string;
  /** Sender name (defaults to "SourceCo Notifications") */
  senderName?: string;
  /** Sender email (defaults to SENDER_EMAIL env var or notifications@sourcecodeals.com) */
  senderEmail?: string;
  /** Reply-to email (optional, defaults to sender) */
  replyToEmail?: string;
  /** Reply-to name (optional) */
  replyToName?: string;
  /** Disable click tracking (defaults to true to prevent broken links) */
  disableClickTracking?: boolean;
  /** C-4 FIX: Skip unsubscribe header for transactional emails (password reset, NDA, etc.) */
  isTransactional?: boolean;
}

export interface BrevoSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// N07 FIX: Added retry logic with exponential backoff for transient failures.
// Without retry, a transient Brevo failure = permanent email loss (NDAs, deal alerts, approvals).
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Send an email via Brevo SMTP API with automatic retry.
 *
 * Requires BREVO_API_KEY environment variable.
 * Retries up to maxRetries times with exponential backoff on transient errors (5xx, network).
 * Does NOT retry on 4xx errors (invalid request, authentication failure).
 */
export async function sendViaBervo(
  options: BrevoEmailOptions,
  maxRetries = DEFAULT_MAX_RETRIES,
): Promise<BrevoSendResult> {
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');
  if (!brevoApiKey) {
    return { success: false, error: 'BREVO_API_KEY is not set' };
  }

  const senderEmail =
    options.senderEmail || Deno.env.get('SENDER_EMAIL') || 'notifications@sourcecodeals.com';
  const senderName = options.senderName || 'SourceCo Notifications';

  const payload: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: options.to, name: options.toName || options.to }],
    subject: options.subject,
    htmlContent: options.htmlContent,
  };

  if (options.textContent) {
    payload.textContent = options.textContent;
  }

  if (options.replyToEmail) {
    payload.replyTo = {
      email: options.replyToEmail,
      name: options.replyToName || options.replyToEmail,
    };
  }

  if (options.disableClickTracking !== false) {
    payload.params = { trackClicks: false, trackOpens: true };
  }

  // C-4 FIX: Add List-Unsubscribe header for CAN-SPAM compliance on non-transactional emails.
  // Transactional emails (password reset, NDA signing) are exempt from CAN-SPAM unsubscribe requirements.
  if (!options.isTransactional) {
    const platformUrl = Deno.env.get('PLATFORM_URL') || 'https://app.sourcecodeals.com';
    const unsubscribeUrl = `${platformUrl}/unsubscribe?email=${encodeURIComponent(options.to)}`;
    payload.headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  // C-4 FIX: Check if recipient has unsubscribed before sending non-transactional emails.
  if (!options.isTransactional) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey) {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.4');
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const emailDomain = options.to.split('@')[1];
        const { data: unsubscribed } = await supabase
          .from('buyers')
          .select('id')
          .eq('email_unsubscribed', true)
          .or(`email_domain.eq.${emailDomain},company_website.ilike.%${emailDomain}%`)
          .limit(1)
          .maybeSingle();
        if (unsubscribed) {
          console.log(`[brevo-sender] Skipping send to ${options.to} — buyer is unsubscribed`);
          return { success: true, messageId: 'skipped-unsubscribed' };
        }
      }
    } catch {
      // Don't block email sending if unsubscribe check fails
    }
  }

  let lastError = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'api-key': brevoApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const data = await response.json();

      if (response.ok) {
        if (attempt > 0) {
          console.log(`[brevo-sender] Succeeded on retry ${attempt}/${maxRetries}`);
        }
        return { success: true, messageId: data.messageId };
      }

      // Don't retry client errors (4xx) — request itself is bad
      if (response.status >= 400 && response.status < 500) {
        console.error('[brevo-sender] Client error (no retry):', response.status, data);
        return { success: false, error: JSON.stringify(data) };
      }

      // Server error (5xx) — retry with backoff
      lastError = `HTTP ${response.status}: ${JSON.stringify(data)}`;
      console.warn(
        `[brevo-sender] Server error (attempt ${attempt + 1}/${maxRetries + 1}):`,
        lastError,
      );
    } catch (err: unknown) {
      // Network/timeout error — retry with backoff
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[brevo-sender] Fetch error (attempt ${attempt + 1}/${maxRetries + 1}):`,
        lastError,
      );
    }

    // Exponential backoff before retry
    if (attempt < maxRetries) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error(
    `[brevo-sender] All ${maxRetries + 1} attempts failed for "${options.subject}" to ${options.to}`,
  );
  return { success: false, error: `All retries exhausted: ${lastError}` };
}
