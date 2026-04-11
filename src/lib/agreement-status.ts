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
 * Priority: statusText (canonical) > legacyStatus (fallback) > not_sent
 *
 * @param statusText  The canonical nda_status / fee_agreement_status text field
 *                    ('not_started' | 'sent' | 'signed' | 'declined' | 'expired' | …)
 * @param legacyStatus  Legacy provider status (fallback for older records)
 * @param expiresAt  Optional expiry timestamp
 */
export function resolveAgreementStatus(
  statusText: string | null,
  legacyStatus?: string | null,
  expiresAt?: string | null,
): AgreementDisplayStatus {
  // Check expiry first
  if (expiresAt && new Date(expiresAt) < new Date()) return 'expired';

  // Prefer the canonical status text field
  if (statusText) {
    const s = statusText.toLowerCase().trim();
    if (s === 'signed') return 'signed';
    if (s === 'declined') return 'declined';
    if (s === 'expired') return 'expired';
    if (s === 'redlined' || s === 'under_review') return 'viewed';
    if (s === 'sent') return 'sent';
    if (s === 'not_started') return 'not_sent';
  }

  // Fallback: map legacy statuses — strip "document." prefix if present
  const raw = (legacyStatus || '').toLowerCase().trim();
  const normalized = raw.replace(/^document\./, '');
  if (normalized === 'completed' || normalized === 'signed') return 'signed';
  if (normalized === 'declined' || normalized === 'voided') return 'declined';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'viewed' || normalized === 'opened') return 'viewed';
  if (normalized === 'sent' || normalized === 'awaiting') return 'sent';
  if (normalized === 'pending' || normalized === 'started' || normalized === 'created' || normalized === 'draft') return 'pending';

  return 'not_sent';
}

export function getAgreementDisplayInfo(status: AgreementDisplayStatus): AgreementDisplayInfo {
  return STATUS_MAP[status] || STATUS_MAP.not_sent;
}
