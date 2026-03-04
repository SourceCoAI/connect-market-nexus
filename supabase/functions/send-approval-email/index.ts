import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';

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
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is not configured');
    }

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
      customSignatureHtml: _customSignatureHtml,
      customSignatureText,
    } = requestData;

    console.log('Sending approval email to:', userEmail);

    // Get admin profile for signature - use dynamic admin info
    let senderInfo = {
      email: Deno.env.get('NOREPLY_EMAIL') || 'noreply@sourcecodeals.com',
      name: 'SourceCo Admin',
    };

    // If admin ID provided, get profile from database (preferred)
    if (adminId) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('email, first_name, last_name, company')
        .eq('id', adminId)
        .single();

      if (adminProfile && adminProfile.email && adminProfile.first_name && adminProfile.last_name) {
        senderInfo = {
          email: adminProfile.email,
          name: `${adminProfile.first_name} ${adminProfile.last_name}`,
        };
      }
    }
    // Fallback to provided admin info if available
    else if (adminEmail && adminName) {
      senderInfo = {
        email: adminEmail,
        name: adminName,
      };
    }

    // Create simple plain text email with proper spacing and signature - FIXED LINE BREAKS
    const textSignature =
      customSignatureText || `\n\nQuestions? Reply to this email.\n\n${senderInfo.name}\nSourceCo`;

    // Send email using Brevo - plain text only
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: senderInfo.name,
          email: senderInfo.email,
        },
        to: [
          {
            email: userEmail,
            name: userEmail.split('@')[0],
          },
        ],
        subject: subject,
        textContent: `${message}\n\n${textSignature}`,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Brevo API error:', emailResult);
      await logEmailDelivery(supabase, {
        email: userEmail,
        emailType: 'approval_email',
        status: 'failed',
        correlationId: crypto.randomUUID(),
        errorMessage: emailResult.message || 'Brevo API error',
      });
      throw new Error(`Email API error: ${emailResult.message || 'Unknown error'}`);
    }

    console.log('Approval email sent successfully:', emailResult);

    const correlationId = crypto.randomUUID();
    await logEmailDelivery(supabase, {
      email: userEmail,
      emailType: 'approval_email',
      status: 'sent',
      correlationId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: emailResult.messageId || 'unknown',
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
        error: error.message || 'Failed to send approval email',
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

serve(handler);
