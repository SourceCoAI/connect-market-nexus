import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/email-sender.ts';

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
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { to, subject, content, email_type, correlation_id, metadata: _metadata }: EmailRequest = await req.json();
    console.log('Enhanced Email Delivery Request:', { to, subject, email_type, correlation_id });

    const result = await sendEmail({
      templateName: email_type || 'enhanced_delivery',
      to,
      subject,
      htmlContent: content,
      senderName: 'SourceCo Marketplace',
      isTransactional: true,
      metadata: { correlation_id, email_type },
    });

    if (!result.success) {
      console.error('Email delivery failed:', result.error);
      throw new Error(result.error || 'Email delivery failed');
    }

    console.log('Email delivered successfully via unified sender');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email delivered successfully',
        delivery_id: result.emailId,
        correlation_id,
        message_id: result.providerMessageId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('Enhanced email delivery error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error), details: 'Failed to deliver email' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
