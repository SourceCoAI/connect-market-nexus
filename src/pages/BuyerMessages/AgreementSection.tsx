import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  FileSignature,
  Shield,
  CheckCircle,
  MessageSquarePlus,
  XCircle,
  Clock,
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

// ─── DownloadDocButton ───
function DownloadDocButton({
  documentUrl,
  draftUrl,
  documentType,
  label,
  variant = 'outline',
}: {
  documentUrl: string | null;
  draftUrl: string | null;
  documentType: 'nda' | 'fee_agreement';
  label: string;
  variant?: 'outline' | 'default';
}) {
  const [loading, setLoading] = useState(false);
  const download = useDownloadDocument();

  const handleDownload = async () => {
    setLoading(true);
    try {
      await download({ documentUrl, draftUrl, documentType });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size="sm" onClick={handleDownload} disabled={loading}>
      {loading ? (
        <span className="h-3.5 w-3.5 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <FileSignature className="h-3.5 w-3.5 mr-1.5" />
      )}
      {label}
    </Button>
  );
}

// ─── Helper to build DocItem from firm status using canonical mapper ───
function buildDocItem(
  type: 'nda' | 'fee_agreement',
  label: string,
  signed: boolean | null,
  signedAt: string | null,
  docusealStatus: string | null,
  signedDocUrl: string | null,
  draftUrl: string | null,
  pendingNotifications: Record<string, unknown>[],
): DocItem {
  const status = resolveAgreementStatus(!!signed, docusealStatus);

  const notif = pendingNotifications.find(
    (n: Record<string, unknown>) =>
      (n.metadata as Record<string, unknown>)?.document_type === type,
  );

  const statusLabels: Record<AgreementDisplayStatus, string> = {
    signed: `${label} \u2014 Signed`,
    declined: `${label} \u2014 Declined`,
    expired: `${label} \u2014 Expired`,
    viewed: `${label} \u2014 Viewed`,
    sent: `${label} Ready to Sign`,
    pending: `${label} — Ready to Sign`,
    not_sent: `${label} — Ready to Sign`,
    no_firm: `${label} \u2014 No Firm`,
  };

  const descriptions: Record<AgreementDisplayStatus, string> = {
    signed: signedAt ? `Signed ${formatDistanceToNow(new Date(signedAt), { addSuffix: true })}` : 'Signed',
    declined: 'Your agreement was declined. Please contact us if you have questions.',
    expired: 'This agreement has expired. Please contact us for a new one.',
    viewed: 'You\'ve viewed this agreement. Please sign to continue.',
    sent: (notif as any)?.message || `A ${label} has been prepared for your review. You can sign, or download and send us a redline.`,
    pending: `Your ${label} is ready for review and signature.`,
    not_sent: `Your ${label} is ready for review and signature.`,
    no_firm: 'No firm record found.',
  };

  return {
    key: `${type}-${status}`,
    type,
    label: statusLabels[status],
    signed: status === 'signed',
    signedAt,
    documentUrl: signedDocUrl,
    draftUrl,
    notificationMessage: descriptions[status],
    notificationTime: (notif as any)?.created_at ?? undefined,
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
        className="rounded-xl overflow-hidden mb-0"
        style={{ border: '1px solid #CBCBCB', backgroundColor: '#FFFFFF' }}
      >
        <div className="px-5 py-3" style={{ borderBottom: '1px solid #E5DDD0' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#0E101A' }}>
            {allSigned ? 'Signed Documents' : hasPending ? 'Action Required' : 'Documents'}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: '#5A5A5A' }}>
            {allSigned
              ? 'All agreements are signed. Download copies for your records.'
              : 'Sign these documents to continue accessing deal details'}
          </p>
        </div>
        <div className="divide-y" style={{ borderColor: '#E5DDD0' }}>
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-4 px-5 py-3">
              <div
                className="p-2 rounded-full"
                style={{ backgroundColor: item.signed ? '#F7F4DD' : item.declined ? '#FEE2E2' : '#FCF9F0' }}
              >
                {item.type === 'nda' ? (
                  <Shield
                    className="h-5 w-5"
                    style={{ color: item.signed ? '#DEC76B' : item.declined ? '#991B1B' : '#5A5A5A' }}
                  />
                ) : (
                  <FileSignature
                    className="h-5 w-5"
                    style={{ color: item.signed ? '#DEC76B' : item.declined ? '#991B1B' : '#5A5A5A' }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium" style={{ color: '#0E101A' }}>
                    {item.label}
                  </p>
                  {item.signed && (
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#DEC76B' }} />
                  )}
                  {item.declined && (
                    <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#991B1B' }} />
                  )}
                  {!item.signed && !item.declined && (
                    <FileSignature className="h-3.5 w-3.5 shrink-0" style={{ color: '#DEC76B' }} />
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#5A5A5A' }}>
                  {item.notificationMessage}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.signed ? (
                  <>
                    <DownloadDocButton
                      documentUrl={item.documentUrl}
                      draftUrl={item.draftUrl}
                      documentType={item.type}
                      label="Download PDF"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDocMessageType(item.type);
                        setDocMessageOpen(true);
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                      Questions?
                    </Button>
                  </>
                ) : item.declined ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDocMessageType(item.type);
                      setDocMessageOpen(true);
                    }}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                    Contact Us
                  </Button>
                ) : (
                  <>
                    {item.draftUrl ? (
                      <DownloadDocButton
                        documentUrl={null}
                        draftUrl={item.draftUrl}
                        documentType={item.type}
                        label="Download Draft"
                        variant="outline"
                      />
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <FileSignature className="h-3.5 w-3.5 mr-1.5" />
                        Draft Not Available
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDocMessageType(item.type);
                        setDocMessageOpen(true);
                      }}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                      Redlines / Questions?
                    </Button>
                    <Button
                      size="sm"
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
