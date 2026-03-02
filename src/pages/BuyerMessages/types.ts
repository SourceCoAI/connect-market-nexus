// ─── Shared types and constants for BuyerMessages ───

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
export const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg';

export type MessageVariant = 'buyer' | 'admin' | 'system';

export type DocItem = {
  key: string;
  type: 'nda' | 'fee_agreement';
  label: string;
  signed: boolean;
  signedAt: string | null;
  documentUrl: string | null;
  draftUrl: string | null;
  notificationMessage?: string;
  notificationTime?: string;
  declined?: boolean;
};

// ─── Message References ───

export type ReferenceType = 'document' | 'deal' | 'request';

export interface MessageReference {
  type: ReferenceType;
  id: string;       // e.g. 'nda', 'fee_agreement', listing UUID, or connection_request UUID
  label: string;    // Display name
}

// Encode a reference into the message body as a structured tag
export function encodeReference(ref: MessageReference): string {
  return `[ref:${ref.type}:${ref.id}:${ref.label}]`;
}

// Parse all references from a message body
const REF_REGEX = /\[ref:(document|deal|request):([^:]+):([^\]]+)\]/g;

export function parseReferences(body: string): {
  references: MessageReference[];
  cleanBody: string;
} {
  const references: MessageReference[] = [];
  let match: RegExpExecArray | null;

  while ((match = REF_REGEX.exec(body)) !== null) {
    references.push({
      type: match[1] as ReferenceType,
      id: match[2],
      label: match[3],
    });
  }

  const cleanBody = body.replace(REF_REGEX, '').trim();
  return { references, cleanBody };
}
