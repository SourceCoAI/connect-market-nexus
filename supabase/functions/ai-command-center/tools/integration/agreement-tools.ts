/**
 * Integration Agreement Tools
 * Send NDAs and Fee Agreements for signing via PandaDoc.
 */

import type { SupabaseClient, ClaudeTool, ToolResult } from './common.ts';

// ---------- Tool definitions ----------

export const agreementToolDefinitions: ClaudeTool[] = [
  {
    name: 'send_document',
    description:
      'Send an NDA or Fee Agreement for signing via PandaDoc. Creates a signing document and notifies the buyer. REQUIRES CONFIRMATION. Use when the user says "send the NDA to [name]" or "send the fee agreement to [firm]".',
    input_schema: {
      type: 'object',
      properties: {
        firm_id: {
          type: 'string',
          description: 'The firm_agreements UUID',
        },
        document_type: {
          type: 'string',
          enum: ['nda', 'fee_agreement'],
          description: 'Type of document to send',
        },
        signer_email: {
          type: 'string',
          description: 'Email address of the signer',
        },
        signer_name: {
          type: 'string',
          description: 'Full name of the signer',
        },
        delivery_mode: {
          type: 'string',
          enum: ['embedded', 'email'],
          description:
            'How to deliver: "embedded" for in-app iframe, "email" for email delivery (default "email")',
        },
      },
      required: ['firm_id', 'document_type', 'signer_email', 'signer_name'],
    },
  },
];

// ---------- Executor ----------

export async function sendDocument(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const firmId = args.firm_id as string;
  const documentType = args.document_type as 'nda' | 'fee_agreement';
  const signerEmail = args.signer_email as string;
  const signerName = args.signer_name as string;
  const deliveryMode = (args.delivery_mode as string) || 'email';

  // Validate
  if (!firmId || !documentType || !signerEmail || !signerName) {
    return { error: 'Missing required fields: firm_id, document_type, signer_email, signer_name' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(signerEmail)) {
    return { error: 'Invalid email format' };
  }

  if (!['nda', 'fee_agreement'].includes(documentType)) {
    return { error: "Invalid document_type. Must be 'nda' or 'fee_agreement'" };
  }

  // Get PandaDoc config
  const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY');
  if (!pandadocApiKey) {
    return { error: 'PandaDoc is not configured. Contact your administrator.' };
  }

  const templateUuid =
    documentType === 'nda'
      ? Deno.env.get('PANDADOC_NDA_TEMPLATE_UUID')
      : Deno.env.get('PANDADOC_FEE_TEMPLATE_UUID');

  if (!templateUuid) {
    return { error: `Template not configured for ${documentType}` };
  }

  // Verify firm exists
  const { data: firm, error: firmError } = await supabase
    .from('firm_agreements')
    .select('id, primary_company_name')
    .eq('id', firmId)
    .single();

  if (firmError || !firm) {
    return { error: `Firm not found with ID: ${firmId}` };
  }

  // Call PandaDoc API — Step 1: Create document
  const nameParts = signerName.split(/\s+/);
  const firstName = nameParts[0] || signerName;
  const lastName = nameParts.slice(1).join(' ') || '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let pandadocResponse: Response;
  try {
    pandadocResponse = await fetch('https://api.pandadoc.com/public/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandadocApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
        metadata: {
          firm_id: firmId,
          document_type: documentType,
        },
        tags: [documentType, `firm:${firmId}`],
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const fetchError = err as { name?: string };
    if (fetchError.name === 'AbortError') {
      return { error: 'PandaDoc API timeout. Please try again.' };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!pandadocResponse.ok) {
    console.error('PandaDoc API error:', await pandadocResponse.text());
    return { error: 'Failed to create signing document. Please try again.' };
  }

  const pandadocResult = await pandadocResponse.json();
  const documentId = pandadocResult.id;

  // Step 2: Send the document
  await new Promise((r) => setTimeout(r, 2000));
  const sendSilent = deliveryMode !== 'email';
  await fetch(`https://api.pandadoc.com/public/v1/documents/${documentId}/send`, {
    method: 'POST',
    headers: {
      'Authorization': `API-Key ${pandadocApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Please review and sign the ${documentType === 'nda' ? 'NDA' : 'Fee Agreement'} to proceed.`,
      silent: sendSilent,
    }),
  });

  // Update firm_agreements
  const columnPrefix = documentType === 'nda' ? 'nda' : 'fee';
  const statusColumn = documentType === 'nda' ? 'nda_status' : 'fee_agreement_status';
  const sentAtColumn = documentType === 'nda' ? 'nda_sent_at' : 'fee_agreement_sent_at';
  const now = new Date().toISOString();

  await supabase
    .from('firm_agreements')
    .update({
      [`${columnPrefix}_pandadoc_document_id`]: documentId,
      [`${columnPrefix}_pandadoc_status`]: 'pending',
      [statusColumn]: 'sent',
      [sentAtColumn]: now,
      updated_at: now,
    })
    .eq('id', firmId);

  // Log the event
  await supabase.from('pandadoc_webhook_log').insert({
    event_type: 'document_created',
    document_id: documentId,
    document_type: documentType,
    external_id: firmId,
    raw_payload: { created_by: userId, source: 'ai_command_center' },
  });

  // Create buyer notification
  const { data: buyerProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', signerEmail)
    .maybeSingle();

  if (buyerProfile?.id) {
    const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
    const notificationMessage =
      documentType === 'nda'
        ? 'This is our standard NDA so we can freely exchange confidential information about the companies on our platform. Sign it to unlock full deal access.'
        : 'Here is our fee agreement -- you only pay a fee if you close a deal you meet on our platform. Sign to continue the process.';

    await supabase.from('user_notifications').insert({
      user_id: buyerProfile.id,
      notification_type: 'agreement_pending',
      title: `${docLabel} Ready to Sign`,
      message: notificationMessage,
      metadata: {
        document_type: documentType,
        firm_id: firmId,
        document_id: documentId,
        delivery_mode: deliveryMode,
        source: 'ai_command_center',
      },
    });
  }

  const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
  return {
    data: {
      success: true,
      document_id: documentId,
      document_type: documentType,
      delivery_mode: deliveryMode,
      firm_name: firm.primary_company_name,
      signer: signerName,
      message: `${docLabel} sent to ${signerName} (${signerEmail}) for ${firm.primary_company_name} via ${deliveryMode}. Document ID: ${documentId}`,
    },
  };
}
