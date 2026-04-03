import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

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

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
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

    const htmlContent = wrapEmailHtml({
      bodyHtml: `
        <p style="font-size: 18px; font-weight: 600; margin: 0 0 20px;">Feedback Response</p>
        <div style="padding: 16px; background: #F7F6F3; border-radius: 6px; margin: 0 0 20px;">
          ${escapeHtmlWithBreaks(content)}
        </div>
        <p style="margin-top: 20px; color: #6B6B6B; font-size: 14px;">This is a response to your feedback. Please do not reply to this email.</p>`,
      preheader: 'Response to your feedback',
      recipientEmail: to,
    });

    const result = await sendEmail({
      templateName: 'feedback_response',
      to,
      subject,
      htmlContent,
      textContent: content,
      senderName: 'SourceCo',
      replyTo: Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com',
      isTransactional: true,
      metadata: { feedbackId },
    });

    if (!result.success) {
      console.error('Email sending failed:', result.error);
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log('Email sent successfully:', result.providerMessageId);

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
        messageId: result.providerMessageId,
        correlationId: result.correlationId,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-feedback-email function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

serve(handler);
