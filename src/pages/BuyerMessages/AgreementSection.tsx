import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  FileSignature,
  Shield,
  CheckCircle,
  MessageSquarePlus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AgreementSigningModal } from '@/components/docuseal/AgreementSigningModal';
import { useAuth } from '@/context/AuthContext';

import {
  useFirmAgreementStatus,
  usePendingNotifications,
} from './useMessagesData';
import { useDownloadDocument } from './useMessagesActions';
import { DocumentDialog } from './DocumentDialog';
import type { DocItem } from './types';

// ─── DownloadDocButton ───
// Downloads a signed or draft document PDF.

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

// ─── PendingAgreementBanner ───
// Shows signed / pending document statuses and allows signing or asking questions.

export function PendingAgreementBanner() {
  const { user } = useAuth();
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingDocType, setSigningDocType] = useState<'nda' | 'fee_agreement'>('nda');
  const [docMessageOpen, setDocMessageOpen] = useState(false);
  const [docMessageType, setDocMessageType] = useState<'nda' | 'fee_agreement'>('nda');

  const { data: firmStatus } = useFirmAgreementStatus();
  const { data: pendingNotifications = [] } = usePendingNotifications();

  const items: DocItem[] = [];

  // NDA
  if (firmStatus?.nda_signed) {
    items.push({
      key: 'nda-signed',
      type: 'nda',
      label: 'NDA',
      signed: true,
      signedAt: firmStatus.nda_signed_at,
      documentUrl: firmStatus.nda_signed_document_url,
      draftUrl: firmStatus.nda_document_url,
    });
  } else if (firmStatus) {
    const ndaNotif = pendingNotifications.find(
      (n: Record<string, unknown>) =>
        (n.metadata as Record<string, unknown>)?.document_type === 'nda',
    );
    const status = firmStatus.nda_docuseal_status as string | null;
    items.push({
      key: status === 'declined' ? 'nda-declined' : 'nda-pending',
      type: 'nda',
      label: 'NDA',
      signed: false,
      signedAt: null,
      documentUrl: null,
      draftUrl: firmStatus.nda_document_url || null,
      notificationMessage: status === 'declined'
        ? 'Your NDA was declined. Please contact us if you have questions.'
        : ndaNotif?.message,
      notificationTime: ndaNotif?.created_at ?? undefined,
      declined: status === 'declined',
      awaiting: !status && !ndaNotif,
    });
  }

  // Fee Agreement
  if (firmStatus?.fee_agreement_signed) {
    items.push({
      key: 'fee-signed',
      type: 'fee_agreement',
      label: 'Fee Agreement',
      signed: true,
      signedAt: firmStatus.fee_agreement_signed_at,
      documentUrl: firmStatus.fee_signed_document_url,
      draftUrl: firmStatus.fee_agreement_document_url,
    });
  } else if (firmStatus) {
    const feeNotif = pendingNotifications.find(
      (n: Record<string, unknown>) =>
        (n.metadata as Record<string, unknown>)?.document_type === 'fee_agreement',
    );
    const status = firmStatus.fee_docuseal_status as string | null;
    items.push({
      key: status === 'declined' ? 'fee-declined' : 'fee-pending',
      type: 'fee_agreement',
      label: 'Fee Agreement',
      signed: false,
      signedAt: null,
      documentUrl: null,
      draftUrl: firmStatus.fee_agreement_document_url || null,
      notificationMessage: status === 'declined'
        ? 'Your Fee Agreement was declined. Please contact us if you have questions.'
        : feeNotif?.message,
      notificationTime: feeNotif?.created_at ?? undefined,
      declined: status === 'declined',
      awaiting: !status && !feeNotif,
    });
  }

  if (items.length === 0) return null;

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
                style={{ backgroundColor: item.signed ? '#F7F4DD' : '#FCF9F0' }}
              >
                {item.type === 'nda' ? (
                  <Shield
                    className="h-5 w-5"
                    style={{ color: item.signed ? '#DEC76B' : '#5A5A5A' }}
                  />
                ) : (
                  <FileSignature
                    className="h-5 w-5"
                    style={{ color: item.signed ? '#DEC76B' : '#5A5A5A' }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium" style={{ color: '#0E101A' }}>
                    {item.signed ? `${item.label} \u2014 Signed` : item.declined ? `${item.label} \u2014 Declined` : item.awaiting ? `${item.label} \u2014 Pending` : `${item.label} Ready to Sign`}
                  </p>
                  {item.signed && (
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#DEC76B' }} />
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: '#5A5A5A' }}>
                  {item.signed
                    ? item.signedAt
                      ? `Signed ${formatDistanceToNow(new Date(item.signedAt), { addSuffix: true })}`
                      : 'Signed'
                    : item.notificationMessage ||
                      `A ${item.label} has been prepared for your review. You can sign, or download and send us a redline.`}
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
                ) : (
                  <>
                    <DownloadDocButton
                      documentUrl={null}
                      draftUrl={item.draftUrl}
                      documentType={item.type}
                      label="Download Draft"
                      variant="outline"
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
