/* eslint-disable no-console */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml } from '../_shared/auth.ts';

/**
 * create-pandadoc-document
 * Creates a PandaDoc document for NDA or Fee Agreement signing.
 * Supports both embedded (iframe) and email delivery modes.
 *
 * PandaDoc flow:
 *   1. POST /public/v1/documents — create document from template (status: document.draft)
 *   2. POST /public/v1/documents/{id}/send — move to sent status
 *   3. POST /public/v1/documents/{id}/session — get embedded signing session token
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_DOC_TYPES = ['nda', 'fee_agreement'] as const;
const PANDADOC_API_BASE = 'https://api.pandadoc.com/public/v1';

interface CreateDocumentRequest {
  firmId: string;
  documentType: 'nda' | 'fee_agreement';
  signerEmail: string;
  signerName: string;
  deliveryMode?: 'embedded' | 'email'; // default: embedded
  metadata?: Record<string, string>; // prefill fields
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Admin-only
    const auth = await requireAdmin(req, supabaseAdmin);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const {
      firmId,
      documentType,
      signerEmail,
      signerName,
      deliveryMode = 'embedded',
      metadata = {},
    }: CreateDocumentRequest = await req.json();

    // Input validation
    if (!firmId || !documentType || !signerEmail || !signerName) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: firmId, documentType, signerEmail, signerName',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!UUID_REGEX.test(firmId)) {
      return new Response(JSON.stringify({ error: 'Invalid firmId format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!VALID_DOC_TYPES.includes(documentType as typeof VALID_DOC_TYPES[number])) {
      return new Response(
        JSON.stringify({ error: "Invalid documentType. Must be 'nda' or 'fee_agreement'" }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!EMAIL_REGEX.test(signerEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (deliveryMode && !['embedded', 'email'].includes(deliveryMode)) {
      return new Response(
        JSON.stringify({ error: "Invalid deliveryMode. Must be 'embedded' or 'email'" }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Resolve template UUID
    const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY');
    if (!pandadocApiKey) {
      return new Response(JSON.stringify({ error: 'PandaDoc not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const templateUuid =
      documentType === 'nda'
        ? Deno.env.get('PANDADOC_NDA_TEMPLATE_UUID')
        : Deno.env.get('PANDADOC_FEE_TEMPLATE_UUID');

    if (!templateUuid) {
      return new Response(
        JSON.stringify({ error: `Template not configured for ${documentType}` }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(`📝 Creating PandaDoc document`, {
      firmId,
      documentType,
      deliveryMode,
      templateUuid,
    });

    // Look up firm info for prefill
    const { data: _firm } = await supabaseAdmin
      .from('firm_agreements')
      .select('primary_company_name, email_domain, website_domain')
      .eq('id', firmId)
      .single();

    // Allowed metadata field names — prevent injection of arbitrary template fields
    const ALLOWED_METADATA_FIELDS = new Set([
      'company_name',
      'signer_title',
      'signer_company',
      'date',
      'address',
      'city',
      'state',
      'zip',
      'phone',
      'email',
      'deal_name',
      'deal_id',
      'firm_name',
      'website',
    ]);

    // Sanitize metadata values
    const sanitizedMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata)) {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 50);
      if (!sanitizedKey || !ALLOWED_METADATA_FIELDS.has(sanitizedKey)) {
        console.warn(`[pandadoc] Rejected unknown metadata field: ${key}`);
        continue;
      }
      if (typeof value === 'string') {
        sanitizedMetadata[sanitizedKey] = escapeHtml(value.substring(0, 1000));
      }
    }

    // Parse signer name into first/last
    const nameParts = signerName.trim().split(/\s+/);
    const firstName = nameParts[0] || signerName;
    const lastName = nameParts.slice(1).join(' ') || '';

    // Step 1: Create document from template
    const documentPayload = {
      name: `${documentType === 'nda' ? 'NDA' : 'Fee Agreement'} — ${signerName}`,
      template_uuid: templateUuid,
      recipients: [
        {
          email: signerEmail,
          first_name: firstName,
          last_name: lastName,
          role: 'Signer',
        },
      ],
      fields: Object.entries(sanitizedMetadata).map(([name, value]) => ({
        name,
        value,
      })),
      metadata: {
        firm_id: firmId,
        document_type: documentType,
      },
      tags: [documentType, `firm:${firmId}`],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let createResponse: Response;
    try {
      createResponse = await fetch(`${PANDADOC_API_BASE}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `API-Key ${pandadocApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(documentPayload),
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeout);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'PandaDoc API timeout' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeout);
    }

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('❌ PandaDoc API error (create):', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create signing document. Please try again.' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const createResult = await createResponse.json();
    const documentId = createResult.id;

    console.log(`📄 PandaDoc document created: ${documentId}, status: ${createResult.status}`);

    // Step 2: Send the document (moves from draft to sent)
    // PandaDoc needs a brief delay for document processing before sending
    await new Promise((r) => setTimeout(r, 2000));

    const sendResponse = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandadocApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: documentType === 'nda'
          ? 'Please review and sign the NDA to proceed with deal access.'
          : 'Please review and sign the Fee Agreement to continue.',
        silent: deliveryMode !== 'email', // silent=true means no email from PandaDoc
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('❌ PandaDoc API error (send):', errorText);
      // Document was created but not sent — still report the document ID
      return new Response(
        JSON.stringify({ error: 'Document created but failed to send. Please retry.' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(`📨 PandaDoc document sent: ${documentId}`);

    // Step 3: For embedded mode, create a signing session
    let sessionToken: string | null = null;
    let embedUrl: string | null = null;

    if (deliveryMode === 'embedded') {
      const sessionResponse = await fetch(
        `${PANDADOC_API_BASE}/documents/${documentId}/session`,
        {
          method: 'POST',
          headers: {
            'Authorization': `API-Key ${pandadocApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: signerEmail,
            lifetime: 3600, // 1 hour session
          }),
        },
      );

      if (sessionResponse.ok) {
        const sessionResult = await sessionResponse.json();
        sessionToken = sessionResult.id;
        embedUrl = `https://app.pandadoc.com/s/${sessionToken}`;
        console.log(`🔗 PandaDoc session created: ${sessionToken}`);
      } else {
        console.warn('⚠️ Failed to create PandaDoc session — document still sent via email');
      }
    }

    // Update firm_agreements with document info
    const columnPrefix = documentType === 'nda' ? 'nda' : 'fee';
    const statusColumn = documentType === 'nda' ? 'nda_status' : 'fee_agreement_status';
    const sentAtColumn = documentType === 'nda' ? 'nda_sent_at' : 'fee_agreement_sent_at';
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('firm_agreements')
      .update({
        [`${columnPrefix}_pandadoc_document_id`]: documentId,
        [`${columnPrefix}_pandadoc_status`]: 'document.sent',
        [statusColumn]: 'sent',
        [sentAtColumn]: now,
        updated_at: now,
      })
      .eq('id', firmId);

    if (updateError) {
      console.error('⚠️ Failed to update firm_agreements:', updateError);
    }

    // Log the event
    await supabaseAdmin.from('pandadoc_webhook_log').insert({
      event_type: 'document_created',
      document_id: documentId,
      document_type: documentType,
      external_id: firmId,
      signer_email: signerEmail,
      raw_payload: { created_by: auth.userId, delivery_mode: deliveryMode },
    });

    // Create buyer notification and system message (all delivery modes)
    {
      const { data: buyerProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', signerEmail)
        .maybeSingle();

      if (buyerProfile?.id) {
        const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
        const notificationMessage =
          documentType === 'nda'
            ? 'This is our standard NDA so we can freely exchange confidential information about the companies on our platform. Sign it to unlock full deal access.'
            : 'Here is our fee agreement — you only pay a fee if you close a deal you meet on our platform. Sign to continue the process.';

        // Insert notification
        await supabaseAdmin.from('user_notifications').insert({
          user_id: buyerProfile.id,
          notification_type: 'agreement_pending',
          title: `${docLabel} Ready to Sign`,
          message: notificationMessage,
          metadata: {
            document_type: documentType,
            firm_id: firmId,
            pandadoc_document_id: documentId,
            delivery_mode: deliveryMode,
          },
        });
        console.log(
          `🔔 Created notification for buyer ${buyerProfile.id} — ${docLabel} pending (${deliveryMode})`,
        );

        // Send a system message to the buyer's FIRST active connection request
        const { data: generalRequest } = await supabaseAdmin
          .from('connection_requests')
          .select('id')
          .eq('user_id', buyerProfile.id)
          .in('status', ['approved', 'pending', 'on_hold'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (generalRequest) {
          const systemMessageBody =
            documentType === 'nda'
              ? "📋 **NDA Ready to Sign**\n\nThis is our standard Non-Disclosure Agreement so we can freely exchange confidential information about the companies on our platform. It's a one-time signing — once done, you'll have full access to every deal.\n\nYou can sign it directly from your notification bell or the banner on the My Deals page."
              : '📋 **Fee Agreement Ready to Sign**\n\nHere is our fee agreement. You only pay a fee if you successfully close a deal with a company you first meet on our platform — no upfront cost.\n\nYou can sign it directly from your notification bell or the banner on the My Deals page.';

          const { error: msgError } = await supabaseAdmin.from('connection_messages').insert({
            connection_request_id: generalRequest.id,
            sender_role: 'admin',
            sender_id: null,
            body: systemMessageBody,
            message_type: 'system',
            is_read_by_admin: true,
            is_read_by_buyer: false,
          });

          if (msgError) {
            console.error('⚠️ Failed to insert system message:', msgError);
          } else {
            console.log(`💬 Sent system message to general inquiry for ${docLabel}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        sessionToken,
        embedUrl,
        documentType,
        deliveryMode,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('❌ Error in create-pandadoc-document:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
