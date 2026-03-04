import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtmlWithBreaks } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface EmailData {
  to: string;
  subject: string;
  content: string;
  feedbackId: string;
  templateId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // AUTH: Admin-only — this sends arbitrary emails
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const {
      to,
      subject,
      content,
      feedbackId,
      templateId: _templateId,
    }: EmailData = await req.json();

    // Log the email attempt
    const correlationId = crypto.randomUUID();

    // Get Brevo API key
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY environment variable is not set');
    }

    // Prepare Brevo email payload
    const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com';
    const brevoPayload = {
      sender: {
        name: 'SourceCo Feedback',
        email: adminEmail,
      },
      to: [{ email: to }],
      subject: subject,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Feedback Response</h1>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            ${escapeHtmlWithBreaks(content)}
          </div>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
            <p style="margin: 0; color: #6c757d; font-size: 14px;">
              This is a response to your feedback. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
      textContent: content,
      replyTo: {
        email: adminEmail,
        name: 'SourceCo Support',
      },
      // Disable click tracking for consistency
      params: {
        trackClicks: false,
        trackOpens: true,
      },
    };

    // Send email using Brevo
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(brevoPayload),
    });

    // Check if email was successful
    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Email sending failed:', errorText);

      // Log email delivery status
      await supabase.from('email_delivery_logs').insert({
        email: to,
        email_type: 'feedback_response',
        status: 'failed',
        correlation_id: correlationId,
        error_message: errorText,
        sent_at: null,
      });

      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const emailData = await emailResponse.json();
    console.log('Email sent successfully:', emailData);

    // Log email delivery status
    await supabase.from('email_delivery_logs').insert({
      email: to,
      email_type: 'feedback_response',
      status: 'sent',
      correlation_id: correlationId,
      error_message: null,
      sent_at: new Date().toISOString(),
    });

    // Update feedback message with delivery status
    if (feedbackId) {
      await supabase
        .from('feedback_messages')
        .update({
          status: 'responded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', feedbackId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: emailData.messageId,
        correlationId,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-feedback-email function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

serve(handler);
