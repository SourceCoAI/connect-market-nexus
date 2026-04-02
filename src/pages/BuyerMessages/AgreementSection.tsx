import { useState } from 'react';

import { CheckCircle, Download, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAgreementStatus, type AgreementDisplayStatus } from '@/lib/agreement-status';

import { useFirmAgreementStatus, usePendingNotifications } from './useMessagesData';
import { useDownloadDocument } from './useMessagesActions';
import { DocumentDialog } from './DocumentDialog';
import type { DocItem } from './types';

// ─── Helper to build DocItem from firm status ───
function buildDocItem(
  type: 'nda' | 'fee_agreement',
  label: string,
  statusText: string | null,
  signedAt: string | null,
  pandadocStatus: string | null,
  signedDocUrl: string | null,
  draftUrl: string | null,
  _pendingNotifications: Record<string, unknown>[],
): DocItem {
  const status = resolveAgreementStatus(statusText, pandadocStatus);

  const descriptions: Record<AgreementDisplayStatus, string> = {
    signed: signedAt
      ? `Signed ${formatDistanceToNow(new Date(signedAt), { addSuffix: true })}`
      : 'Signed',
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
      'nda',
      'NDA',
      (fs.nda_status ?? null) as string | null,
      fs.nda_signed_at as string | null,
      (fs.nda_pandadoc_status ?? null) as string | null,
      (fs.nda_pandadoc_signed_url ?? null) as string | null,
      (fs.nda_document_url ?? null) as string | null,
      pendingNotifications as Record<string, unknown>[],
    ),
    buildDocItem(
      'fee_agreement',
      'Fee Agreement',
      (fs.fee_agreement_status ?? null) as string | null,
      fs.fee_agreement_signed_at as string | null,
      (fs.fee_pandadoc_status ?? null) as string | null,
      (fs.fee_pandadoc_signed_url ?? fs.fee_agreement_signed_document_url ?? null) as string | null,
      (fs.fee_agreement_document_url ?? null) as string | null,
      pendingNotifications as Record<string, unknown>[],
    ),
  ];

  const allSigned = items.every((i) => i.signed);
  if (allSigned) return null;

  return (
    <>
      <div
        className="flex-shrink-0 px-5 py-2 flex items-center gap-6"
        style={{ borderBottom: '1px solid #F0EDE6', backgroundColor: '#FEFDFB' }}
      >
        {items.map((item, idx) => (
          <div key={item.key} className="flex items-center gap-2">
            {idx > 0 && <div className="h-3 mr-4" style={{ borderLeft: '1px solid #F0EDE6' }} />}
            <span className="text-[12px] font-medium" style={{ color: '#0E101A' }}>
              {item.label}
            </span>

            {item.signed ? (
              <>
                <CheckCircle className="h-3 w-3" style={{ color: '#7A6F2A' }} />
                <button
                  onClick={() =>
                    download({
                      documentUrl: item.documentUrl,
                      draftUrl: item.draftUrl,
                      documentType: item.type,
                    })
                  }
                  className="text-[11px] flex items-center gap-0.5 hover:opacity-70 transition-opacity"
                  style={{ color: '#9A9A9A' }}
                >
                  <Download className="h-3 w-3" />
                </button>
              </>
            ) : item.declined ? (
              <>
                <span className="text-[11px]" style={{ color: '#991B1B' }}>
                  Declined
                </span>
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
              </>
            ) : (
              <>
                <span className="text-[11px]" style={{ color: '#DEC76B' }}>
                  Pending
                </span>
                <button
                  onClick={() => {
                    setSigningDocType(item.type);
                    setSigningOpen(true);
                  }}
                  className="text-[11px] font-medium flex items-center gap-0.5 hover:opacity-70 transition-opacity"
                  style={{ color: '#0E101A' }}
                >
                  Request
                  <ChevronRight className="h-3 w-3" />
                </button>
              </>
            )}
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
