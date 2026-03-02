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
