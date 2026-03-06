import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

interface EmailRequest {
  to: string;
  subject: string;
  content: string;
  email_type: string;
  correlation_id: string;
  metadata?: Record<string, unknown>;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // AUTH: Admin-only — sends arbitrary emails via Brevo
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
      email_type,
      correlation_id,
      metadata: _metadata,
    }: EmailRequest = await req.json();

    console.log('Enhanced Email Delivery Request:', {
      to,
      subject,
      email_type,
      correlation_id,
    });

    // Log email delivery attempt
    const { data: logData, error: logError } = await supabase
      .from('email_delivery_logs')
      .insert({
        email: to,
        email_type,
        status: 'pending',
        correlation_id,
        error_message: null,
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log email delivery:', logError);
      throw new Error(`Failed to log email delivery: ${logError.message}`);
    }

    console.log('Email delivery logged with ID:', logData.id);

    // Send via Brevo using shared sender
    const result = await sendViaBervo({
      to,
      subject,
      htmlContent: content,
      senderName: 'SourceCo Marketplace',
      senderEmail: Deno.env.get('SENDER_EMAIL') || 'adam.haile@sourcecodeals.com',
      replyToEmail: Deno.env.get('SENDER_EMAIL') || 'adam.haile@sourcecodeals.com',
      replyToName: Deno.env.get('SENDER_NAME') || 'Adam Haile',
    });

    if (result.success) {
      // Update delivery status to success
      await supabase
        .from('email_delivery_logs')
        .update({
          status: 'delivered',
          sent_at: new Date().toISOString(),
        })
        .eq('id', logData.id);

      console.log('Email delivered successfully via Brevo');
    } else {
      // Update delivery status to failed
      await supabase
        .from('email_delivery_logs')
        .update({
          status: 'failed',
          error_message: result.error,
        })
        .eq('id', logData.id);

      console.error('Email delivery failed:', result.error);
      throw new Error(result.error || 'Email delivery failed');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email delivered successfully',
        delivery_id: logData.id,
        correlation_id,
        message_id: result.messageId,
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
    console.error('Enhanced email delivery error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: 'Failed to deliver email',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  }
};

serve(handler);
