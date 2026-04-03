import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

interface SendApprovalEmailRequest {
  userId: string;
  userEmail: string;
  subject: string;
  message: string;
  adminId?: string;
  adminEmail?: string;
  adminName?: string;
  customSignatureHtml?: string;
  customSignatureText?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // AUTH: Admin-only — sends approval emails
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const requestData: SendApprovalEmailRequest = await req.json();
    const {
      userId: _userId,
      userEmail,
      subject,
      message,
      adminId,
      adminEmail,
      adminName,
      customSignatureText,
    } = requestData;

    console.log('Sending approval email to:', userEmail);

    // Get admin profile for signature - use dynamic admin info
    let senderName = 'SourceCo Admin';
    let senderEmail = Deno.env.get('NOREPLY_EMAIL') || 'support@sourcecodeals.com';

    // If admin ID provided, get profile from database (preferred)
    if (adminId) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('email, first_name, last_name, company')
        .eq('id', adminId)
        .single();

      if (adminProfile && adminProfile.email && adminProfile.first_name && adminProfile.last_name) {
        senderEmail = adminProfile.email;
        senderName = `${adminProfile.first_name} ${adminProfile.last_name}`;
      }
    }
    // Fallback to provided admin info if available
    else if (adminEmail && adminName) {
      senderEmail = adminEmail;
      senderName = adminName;
    }

    // Create simple plain text email with proper spacing and signature
    const textSignature =
      customSignatureText || `\n\nQuestions? Reply to this email.\n\n${senderName}\nSourceCo`;

    const correlationId = crypto.randomUUID();

    // Send email using shared Brevo sender (with retry, unsubscribe checks, etc.)
    const result = await sendViaBervo({
      to: userEmail,
      toName: userEmail.split('@')[0],
      subject,
      htmlContent: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${message}\n\n${textSignature}</pre>`,
      textContent: `${message}\n\n${textSignature}`,
      senderName,
      senderEmail,
      isTransactional: true, // approval emails are transactional, no unsubscribe header needed
    });

    await logEmailDelivery(supabase, {
      email: userEmail,
      emailType: 'approval_email',
      status: result.success ? 'sent' : 'failed',
      correlationId,
      errorMessage: result.success ? undefined : result.error,
    });

    if (!result.success) {
      console.error('Failed to send approval email:', result.error);
      throw new Error(`Email send failed: ${result.error}`);
    }

    console.log('Approval email sent successfully:', result.messageId);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId || 'unknown',
        message: 'Approval email sent successfully',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-approval-email function:', error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : String(error) || 'Failed to send approval email',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

serve(handler);
