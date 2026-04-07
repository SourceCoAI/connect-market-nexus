import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { sendEmail } from '../_shared/email-sender.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface BuyerRejectionRequest {
  connectionRequestId: string;
  buyerEmail: string;
  buyerName: string;
  companyName: string;
}

function buildRejectionHtml(buyerName: string, companyName: string, buyerEmail: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <p>Thank you for your interest in ${companyName}.</p>
    <p>After reviewing your profile against this specific opportunity, we have decided not to move forward with an introduction at this time. We limit introductions to a small number of buyers per deal to ensure strong alignment on both sides.</p>
    <p>Your interest has been noted. If the situation changes, we will reach out directly.</p>
    <p>In the meantime, continue browsing the pipeline. New deals are added regularly and your next match may already be live.</p>
    <p style="color: #6B6B6B; margin-top: 32px;">The SourceCo Team</p>`,
    preheader: `Update on your interest in ${companyName}`,
    recipientEmail: buyerEmail,
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const { connectionRequestId, buyerEmail, buyerName, companyName }: BuyerRejectionRequest = await req.json();

    if (!buyerEmail || !companyName) {
      return new Response(JSON.stringify({ success: false, error: 'buyerEmail and companyName are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    console.log('[notify-buyer-rejection] Sending rejection email to:', buyerEmail, 'for:', companyName);

    const subject = `Regarding Your Interest in ${companyName}`;
    const htmlContent = buildRejectionHtml(buyerName, companyName, buyerEmail);
    const textContent = `Thank you for your interest in ${companyName}. After careful review, this opportunity is no longer available for your profile at this time. Sincerely, The SourceCo Team`;

    const result = await sendEmail({
      templateName: 'buyer_rejection',
      to: buyerEmail,
      toName: buyerName,
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo',
      isTransactional: true,
      metadata: { connectionRequestId },
    });

    if (!result.success) {
      console.error('[notify-buyer-rejection] Failed to send:', result.error);
      throw new Error(result.error || 'Failed to send rejection email');
    }

    console.log('[notify-buyer-rejection] Email sent successfully:', result.providerMessageId);

    return new Response(
      JSON.stringify({ success: true, message_id: result.providerMessageId, recipient: buyerEmail, correlation_id: result.correlationId }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('[notify-buyer-rejection] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
};

serve(handler);
