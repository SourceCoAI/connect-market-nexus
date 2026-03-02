import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  FileSignature,
  Shield,
  CheckCircle,
  Download,
} from 'lucide-react';
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
    sent: `Ready for your review and signature.`,
    pending: `Ready for your review and signature.`,
    not_sent: `Ready for your review and signature.`,
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

// ─── Status chip styles ───
function getStatusChipStyle(item: DocItem): React.CSSProperties {
  if (item.signed) return { backgroundColor: '#F0EDDA', color: '#7A6F2A' };
  if (item.declined) return { backgroundColor: '#FEE2E2', color: '#991B1B' };
  return { backgroundColor: '#FEF3C7', color: '#92400E' };
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

  const items: DocItem[] = [
    buildDocItem(
      'nda', 'NDA',
      firmStatus.nda_signed, firmStatus.nda_signed_at,
      firmStatus.nda_docuseal_status as string | null,
      firmStatus.nda_signed_document_url, firmStatus.nda_document_url,
      pendingNotifications as Record<string, unknown>[],
    ),
    buildDocItem(
      'fee_agreement', 'Fee Agreement',
      firmStatus.fee_agreement_signed, firmStatus.fee_agreement_signed_at,
      firmStatus.fee_docuseal_status as string | null,
      firmStatus.fee_signed_document_url, firmStatus.fee_agreement_document_url,
      pendingNotifications as Record<string, unknown>[],
    ),
  ];

  const hasPending = items.some((i) => !i.signed);
  const allSigned = items.every((i) => i.signed);

  return (
    <>
      <div
        className="rounded-lg overflow-hidden mb-0"
        style={{ border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
      >
        {/* Compact header */}
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
          <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            {allSigned ? 'Documents' : hasPending ? 'Action Required' : 'Documents'}
          </span>
          {allSigned && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CheckCircle className="h-3 w-3" />
              All signed
            </span>
          )}
        </div>

        {/* Clean rows */}
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-3 px-4 py-2.5"
            style={{ borderBottom: '1px solid hsl(var(--border))' }}
          >
            {/* Icon */}
            <div className="shrink-0">
              {item.type === 'nda' ? (
                <Shield className="h-4 w-4 text-muted-foreground" />
              ) : (
                <FileSignature className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {/* Label + status chip */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={getStatusChipStyle(item)}
              >
                {item.signed ? 'Signed' : item.declined ? 'Declined' : 'Pending'}
              </span>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {item.notificationMessage}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {item.signed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => download({ documentUrl: item.documentUrl, draftUrl: item.draftUrl, documentType: item.type })}
                >
                  <Download className="h-3 w-3" />
                  PDF
                </Button>
              ) : item.declined ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setDocMessageType(item.type);
                    setDocMessageOpen(true);
                  }}
                >
                  Contact
                </Button>
              ) : (
                <>
                  {item.draftUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => download({ documentUrl: null, draftUrl: item.draftUrl, documentType: item.type })}
                    >
                      <Download className="h-3 w-3" />
                      Draft
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSigningDocType(item.type);
                      setSigningOpen(true);
                    }}
                    style={{ backgroundColor: '#0E101A', color: '#FFFFFF' }}
                  >
                    Sign Now
                  </Button>
                </>
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
