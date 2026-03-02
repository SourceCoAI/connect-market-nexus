import { useState } from 'react';

import { CheckCircle, Download, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AgreementSigningModal } from '@/components/docuseal/AgreementSigningModal';
import { useAuth } from '@/context/AuthContext';
import { resolveAgreementStatus, type AgreementDisplayStatus } from '@/lib/agreement-status';

import {
  useFirmAgreementStatus,
  usePendingNotifications,
} from './useMessagesData';
import { useDownloadDocument } from './useMessagesActions';
import { DocumentDialog } from './DocumentDialog';
import type { DocItem } from './types';

// ─── Helper to build DocItem from firm status ───
function buildDocItem(
  type: 'nda' | 'fee_agreement',
  label: string,
  signed: boolean | null,
  signedAt: string | null,
  docusealStatus: string | null,
  signedDocUrl: string | null,
  draftUrl: string | null,
  _pendingNotifications: Record<string, unknown>[],
): DocItem {
  const status = resolveAgreementStatus(!!signed, docusealStatus);

  const descriptions: Record<AgreementDisplayStatus, string> = {
    signed: signedAt ? `Signed ${formatDistanceToNow(new Date(signedAt), { addSuffix: true })}` : 'Signed',
    declined: 'Declined — contact us with questions.',
    expired: 'Expired — contact us for a new one.',
    viewed: 'Viewed — please sign to continue.',
    sent: 'Ready for your review and signature.',
    pending: 'Ready for your review and signature.',
    not_sent: 'Ready for your review and signature.',
    no_firm: 'No firm record found.',
  };

  return {
    key: `${type}-${status}`,
    type,
    label,
    signed: status === 'signed',
    signedAt,
    documentUrl: signedDocUrl,
    draftUrl,
    notificationMessage: descriptions[status],
    notificationTime: undefined,
    declined: status === 'declined',
  };
}

// ─── PendingAgreementBanner ───
export function PendingAgreementBanner() {
  const { user } = useAuth();
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingDocType, setSigningDocType] = useState<'nda' | 'fee_agreement'>('nda');
  const [docMessageOpen, setDocMessageOpen] = useState(false);
  const [docMessageType, setDocMessageType] = useState<'nda' | 'fee_agreement'>('nda');

  const { data: firmStatus } = useFirmAgreementStatus();
  const { data: pendingNotifications = [] } = usePendingNotifications();
  const download = useDownloadDocument();

  if (!firmStatus) return null;

  const fs = firmStatus as Record<string, unknown>;

  const items: DocItem[] = [
    buildDocItem(
      'nda', 'NDA',
      fs.nda_signed as boolean | null, fs.nda_signed_at as string | null,
      (fs.nda_docuseal_status ?? fs.nda_status) as string | null,
      (fs.nda_signed_document_url ?? null) as string | null,
      (fs.nda_document_url ?? null) as string | null,
      pendingNotifications as Record<string, unknown>[],
    ),
    buildDocItem(
      'fee_agreement', 'Fee Agreement',
      fs.fee_agreement_signed as boolean | null, fs.fee_agreement_signed_at as string | null,
      (fs.fee_docuseal_status ?? fs.fee_agreement_status) as string | null,
      (fs.fee_signed_document_url ?? fs.fee_agreement_signed_document_url ?? null) as string | null,
      (fs.fee_agreement_document_url ?? null) as string | null,
      pendingNotifications as Record<string, unknown>[],
    ),
  ];

  const allSigned = items.every((i) => i.signed);

  // Hide entirely when all documents are signed
  if (allSigned) return null;

  return (
    <>
      <div className="py-2 px-4 flex items-center gap-4 flex-wrap" style={{ borderBottom: '1px solid #F0EDE6' }}>
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2"
          >
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: '#0E101A' }}>
                {item.label}
              </span>
              {item.signed ? (
                <span className="flex items-center gap-1 text-[11px]" style={{ color: '#7A6F2A' }}>
                  <CheckCircle className="h-3 w-3" />
                  Signed
                </span>
              ) : item.declined ? (
                <span className="text-[11px]" style={{ color: '#991B1B' }}>Declined</span>
              ) : (
                <span className="text-[11px]" style={{ color: '#DEC76B' }}>Pending</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {item.signed ? (
                <button
                  onClick={() => download({ documentUrl: item.documentUrl, draftUrl: item.draftUrl, documentType: item.type })}
                  className="text-[11px] flex items-center gap-1 hover:opacity-70 transition-opacity"
                  style={{ color: '#9A9A9A' }}
                >
                  <Download className="h-3 w-3" />
                  PDF
                </button>
              ) : item.declined ? (
                <button
                  onClick={() => {
                    setDocMessageType(item.type);
                    setDocMessageOpen(true);
                  }}
                  className="text-[11px] hover:opacity-70 transition-opacity"
                  style={{ color: '#9A9A9A' }}
                >
                  Contact
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSigningDocType(item.type);
                    setSigningOpen(true);
                  }}
                  className="text-[11px] font-medium flex items-center gap-0.5 hover:opacity-70 transition-opacity"
                  style={{ color: '#0E101A' }}
                >
                  Sign Now
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingDocType}
      />
      <DocumentDialog
        open={docMessageOpen}
        onOpenChange={setDocMessageOpen}
        documentType={docMessageType}
        userId={user?.id || ''}
      />
    </>
  );
}
