/**
 * Canonical agreement state mapper.
 * Used by both buyer-facing and admin-facing UIs for consistent status display.
 */

export type AgreementDisplayStatus =
  | 'signed'
  | 'declined'
  | 'expired'
  | 'viewed'
  | 'sent'
  | 'pending'
  | 'not_sent'
  | 'no_firm';

export interface AgreementDisplayInfo {
  status: AgreementDisplayStatus;
  label: string;
  description: string;
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'gray';
}

const STATUS_MAP: Record<AgreementDisplayStatus, AgreementDisplayInfo> = {
  signed: { status: 'signed', label: 'Signed', description: 'Agreement has been signed', color: 'emerald' },
  declined: { status: 'declined', label: 'Declined', description: 'Agreement was declined', color: 'red' },
  expired: { status: 'expired', label: 'Expired', description: 'Agreement has expired', color: 'red' },
  viewed: { status: 'viewed', label: 'Viewed', description: 'Agreement has been viewed but not signed', color: 'amber' },
  sent: { status: 'sent', label: 'Sent', description: 'Agreement has been sent for signing', color: 'blue' },
  pending: { status: 'pending', label: 'Pending', description: 'Agreement is being prepared', color: 'blue' },
  not_sent: { status: 'not_sent', label: 'Not Sent', description: 'Agreement has not been sent yet', color: 'gray' },
  no_firm: { status: 'no_firm', label: 'No Firm', description: 'No firm record found', color: 'gray' },
};

/**
 * Resolve display status from DB fields.
 * Priority: signed > declined > expired > viewed > sent/pending > not_sent
 */
export function resolveAgreementStatus(
  signed: boolean | null,
  docusealStatus: string | null,
  expiresAt?: string | null,
): AgreementDisplayStatus {
  if (signed) return 'signed';

  // Check expiry
  if (expiresAt && new Date(expiresAt) < new Date()) return 'expired';

  // Map docuseal statuses
  const normalized = (docusealStatus || '').toLowerCase().trim();
  if (normalized === 'completed' || normalized === 'signed') return 'signed';
  if (normalized === 'declined') return 'declined';
  if (normalized === 'viewed' || normalized === 'opened') return 'viewed';
  if (normalized === 'sent' || normalized === 'awaiting') return 'sent';
  if (normalized === 'pending' || normalized === 'started' || normalized === 'created') return 'pending';

  return 'not_sent';
}

export function getAgreementDisplayInfo(status: AgreementDisplayStatus): AgreementDisplayInfo {
  return STATUS_MAP[status] || STATUS_MAP.not_sent;
}
