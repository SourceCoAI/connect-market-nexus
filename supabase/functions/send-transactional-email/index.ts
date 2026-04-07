/**
 * send-transactional-email
 *
 * Consolidated transactional email sender that replaces 32 separate email
 * edge functions with a single template-based sender.
 *
 * POST body (SendEmailRequest):
 *   - template: EmailTemplate name from the registry
 *   - to: string | string[]  — recipient email(s)
 *   - toName?: string        — recipient display name
 *   - variables: Record<string, string> — template variable substitutions
 *   - replyTo?: string       — optional reply-to email address
 *   - senderName?: string    — optional sender name override
 *
 * Auth: Accepts service_role key OR an authenticated admin user.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { resolveTemplate, type EmailTemplate } from '../_shared/email-templates.ts';
import { requireAdmin } from '../_shared/auth.ts';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

interface SendEmailRequest {
  /** Template name from the registry. */
  template: EmailTemplate;
  /** Recipient email address(es). */
  to: string | string[];
  /** Recipient display name (used when `to` is a single address). */
  toName?: string;
  /** Template variable substitutions. */
  variables: Record<string, string>;
  /** Optional reply-to email address. */
  replyTo?: string;
  /** Optional sender name override. */
  senderName?: string;
}

// ---------------------------------------------------------------------------
// Per-recipient result
// ---------------------------------------------------------------------------

interface RecipientResult {
  email: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // ---- CORS preflight ----
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ---- Supabase admin client ----
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // ---- Auth: service_role key OR admin user ----
  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace('Bearer ', '').trim();

  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Authorization required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const isServiceRoleCall = callerToken === serviceRoleKey;

  if (!isServiceRoleCall) {
    const auth = await requireAdmin(req, supabaseAdmin);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ---- Parse & validate request ----
  try {
    const body: SendEmailRequest = await req.json();
    const { template, to, toName, variables, replyTo, senderName } = body;

    // Required fields
    if (!template) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: template' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!variables || typeof variables !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Missing required field: variables (must be an object)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Resolve template ----
    const resolved = resolveTemplate(template, variables);

    if (resolved.error) {
      return new Response(
        JSON.stringify({ error: resolved.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Normalize recipients ----
    const recipients: string[] = Array.isArray(to) ? to : [to];

    // ---- Send to each recipient ----
    const results: RecipientResult[] = [];
    const correlationId = crypto.randomUUID();

    for (const recipientEmail of recipients) {
      const emailResult = await sendEmail({
        templateName: template,
        to: recipientEmail,
        toName: toName || recipientEmail,
        subject: resolved.subject,
        htmlContent: resolved.htmlContent,
        ...(senderName ? { senderName } : {}),
        ...(replyTo ? { replyTo } : {}),
        isTransactional: true,
        metadata: { correlationId },
      });

      results.push({
        email: recipientEmail,
        success: emailResult.success,
        messageId: emailResult.providerMessageId,
        error: emailResult.error,
      });
    }

    // ---- Build response ----
    const allSucceeded = results.every((r) => r.success);
    const anySucceeded = results.some((r) => r.success);
    const sentCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    const status = allSucceeded ? 200 : anySucceeded ? 207 : 500;

    console.log(
      `[send-transactional-email] template=${template} sent=${sentCount} failed=${failedCount} correlationId=${correlationId}`,
    );

    return new Response(
      JSON.stringify({
        success: allSucceeded,
        template,
        correlationId,
        sent: sentCount,
        failed: failedCount,
        results,
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[send-transactional-email] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: (error as Error).message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
