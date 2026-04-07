/**
 * Unified agreement email helper.
 * All UI surfaces that send/resend NDA or Fee Agreement emails should use this
 * instead of calling supabase.functions.invoke directly.
 */

import { supabase } from '@/integrations/supabase/client';

export interface AgreementEmailRequest {
  documentType: 'nda' | 'fee_agreement';
  /** Only for admin-triggered sends */
  recipientEmail?: string;
  /** Only for admin-triggered sends */
  recipientName?: string;
  /** Only for admin-triggered sends */
  firmId?: string;
}

export interface AgreementEmailResult {
  success: boolean;
  alreadySigned?: boolean;
  message?: string;
  error?: string;
  correlationId?: string;
}

/**
 * Send or resend an agreement email.
 * Returns structured result — never throws.
 */
export async function sendAgreementEmail(
  request: AgreementEmailRequest,
): Promise<AgreementEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke('request-agreement-email', {
      body: request,
    });

    if (error) {
      console.error('[agreement-email] Invoke error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email. Please try again.',
      };
    }

    if (data?.alreadySigned) {
      return { success: true, alreadySigned: true, message: 'Document already signed.' };
    }

    if (data?.success) {
      return {
        success: true,
        message: data.message,
        correlationId: data.correlationId,
      };
    }

    return {
      success: false,
      error: data?.error || 'Something went wrong. Please try again.',
    };
  } catch (err) {
    console.error('[agreement-email] Unexpected error:', err);
    return {
      success: false,
      error: 'Something went wrong. Please try again.',
    };
  }
}

/** Human-readable label for a document type */
export function docTypeLabel(type: 'nda' | 'fee_agreement'): string {
  return type === 'nda' ? 'NDA' : 'Fee Agreement';
}
