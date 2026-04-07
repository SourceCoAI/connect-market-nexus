/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Integration Agreement Tools
 * Send NDAs and Fee Agreements for signing via email.
 */

import type { SupabaseClient, ClaudeTool, ToolResult } from './common.ts';

// ---------- Tool definitions ----------

export const agreementToolDefinitions: ClaudeTool[] = [
  {
    name: 'send_document',
    description:
      'Send an NDA or Fee Agreement for signing via email. Triggers the request-agreement-email edge function which emails the document to the buyer. REQUIRES CONFIRMATION. Use when the user says "send the NDA to [name]" or "send the fee agreement to [firm]".',
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

  // Verify firm exists
  const { data: firm, error: firmError } = await (supabase as any)
    .from('firm_agreements')
    .select('id, primary_company_name')
    .eq('id', firmId)
    .single();

  if (firmError || !firm) {
    return { error: `Firm not found with ID: ${firmId}` };
  }

  // Call the email-based agreement request edge function
  const { data, error: fnError } = await supabase.functions.invoke('request-agreement-email', {
    body: {
      documentType,
      recipientEmail: signerEmail,
      recipientName: signerName,
      firmId,
    },
  });

  if (fnError) {
    console.error('request-agreement-email error:', fnError);
    return { error: 'Failed to send agreement email. Please try again.' };
  }

  // Update firm_agreements status
  const statusColumn = documentType === 'nda' ? 'nda_status' : 'fee_agreement_status';
  const sentAtColumn = documentType === 'nda' ? 'nda_sent_at' : 'fee_agreement_sent_at';
  const now = new Date().toISOString();

  await (supabase as any)
    .from('firm_agreements')
    .update({
      [statusColumn]: 'sent',
      [sentAtColumn]: now,
      updated_at: now,
    })
    .eq('id', firmId);

  // Log to audit
  await (supabase as any).from('agreement_audit_log').insert({
    firm_id: firmId,
    agreement_type: documentType,
    old_status: null,
    new_status: 'sent',
    changed_by: userId,
    notes: `Sent via AI Command Center to ${signerName} (${signerEmail})`,
    metadata: { source: 'ai_command_center', signer_email: signerEmail },
  });

  // Create buyer notification
  const { data: buyerProfile } = await (supabase as any)
    .from('profiles')
    .select('id')
    .eq('email', signerEmail)
    .maybeSingle();

  if (buyerProfile?.id) {
    const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
    const notificationMessage =
      documentType === 'nda'
        ? 'This is our standard NDA so we can freely exchange confidential information about the companies on our platform. Check your email to review and sign.'
        : 'Here is our fee agreement -- you only pay a fee if you close a deal you meet on our platform. Check your email to review and sign.';

    await (supabase as any).from('user_notifications').insert({
      user_id: buyerProfile.id,
      notification_type: 'agreement_pending',
      title: `${docLabel} Ready to Sign`,
      message: notificationMessage,
      metadata: {
        document_type: documentType,
        firm_id: firmId,
        delivery_mode: 'email',
        source: 'ai_command_center',
      },
    });
  }

  const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
  return {
    data: {
      success: true,
      document_type: documentType,
      delivery_mode: 'email',
      firm_name: (firm as any).primary_company_name,
      signer: signerName,
      message: `${docLabel} sent via email to ${signerName} (${signerEmail}) for ${(firm as any).primary_company_name}. The recipient should review, sign, and reply to support@sourcecodeals.com.`,
    },
  };
}
