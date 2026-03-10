import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgreementStatusBadge } from './AgreementStatusBadge';
import { SendAgreementDialog } from './SendAgreementDialog';
import { Shield, Send, FileDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { FirmAgreement } from '@/hooks/admin/use-firm-agreements';
import type { PandaDocStatus } from '@/hooks/admin/use-pandadoc';

interface AgreementPanelProps {
  firm: FirmAgreement;
  buyerEmail?: string;
  buyerName?: string;
}

/**
 * Panel showing NDA + Fee Agreement status with PandaDoc badges,
 * send buttons, and signed document download links.
 * Used on Buyer Detail page.
 */
export function AgreementPanel({ firm, buyerEmail, buyerName }: AgreementPanelProps) {
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendDocumentType, setSendDocumentType] = useState<'nda' | 'fee_agreement'>('nda');

  const email = buyerEmail || '';
  const name = buyerName || firm.primary_company_name || '';

  const openSendDialog = (type: 'nda' | 'fee_agreement') => {
    setSendDocumentType(type);
    setSendDialogOpen(true);
  };

  // Resolve NDA signed document URL — prefer pandadoc, fallback to legacy
  const ndaSignedUrl = firm.nda_pandadoc_signed_url || firm.nda_document_url;
  const feeSignedUrl = firm.fee_pandadoc_signed_url || firm.fee_agreement_document_url;

  // Resolve status — prefer pandadoc, fallback to legacy
  const ndaPandadocStatus = firm.nda_pandadoc_status ?? null;
  const feePandadocStatus = firm.fee_pandadoc_status ?? null;
  const resolveStatus = (pandadocStatus: string | null, signed: boolean | null): PandaDocStatus => {
    if (signed) return 'signed';
    const raw = pandadocStatus || '';
    const normalized = raw.toLowerCase().replace('document.', '');
    if (normalized === 'completed' || normalized === 'signed') return 'signed';
    if (normalized === 'declined' || normalized === 'voided') return 'declined';
    if (normalized === 'viewed') return 'viewed';
    if (normalized === 'sent') return 'sent';
    return 'not_sent';
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Agreements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* NDA */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">NDA</span>
                <AgreementStatusBadge
                  status={resolveStatus(ndaPandadocStatus, firm.nda_signed)}
                  signedDocumentUrl={ndaSignedUrl}
                  onSend={!firm.nda_signed ? () => openSendDialog('nda') : undefined}
                  onResend={!firm.nda_signed ? () => openSendDialog('nda') : undefined}
                />
              </div>
              {firm.nda_signed && firm.nda_signed_at && (
                <p className="text-[10px] text-muted-foreground">
                  {firm.nda_signed_by_name && `${firm.nda_signed_by_name} • `}
                  {formatDistanceToNow(new Date(firm.nda_signed_at), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!firm.nda_signed && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => openSendDialog('nda')}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Send NDA
                </Button>
              )}
              {ndaSignedUrl && typeof ndaSignedUrl === 'string' && ndaSignedUrl.startsWith('https://') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => window.open(ndaSignedUrl, '_blank', 'noopener,noreferrer')}
                >
                  <FileDown className="h-3 w-3 mr-1" />
                  Download
                </Button>
              )}
            </div>
          </div>

          {/* Fee Agreement */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Fee Agreement</span>
                <AgreementStatusBadge
                  status={resolveStatus(feePandadocStatus, firm.fee_agreement_signed)}
                  signedDocumentUrl={feeSignedUrl}
                  onSend={!firm.fee_agreement_signed ? () => openSendDialog('fee_agreement') : undefined}
                  onResend={!firm.fee_agreement_signed ? () => openSendDialog('fee_agreement') : undefined}
                />
              </div>
              {firm.fee_agreement_signed && firm.fee_agreement_signed_at && (
                <p className="text-[10px] text-muted-foreground">
                  {firm.fee_agreement_signed_by_name && `${firm.fee_agreement_signed_by_name} • `}
                  {formatDistanceToNow(new Date(firm.fee_agreement_signed_at), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!firm.fee_agreement_signed && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => openSendDialog('fee_agreement')}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Send Fee Agreement
                </Button>
              )}
              {feeSignedUrl && typeof feeSignedUrl === 'string' && feeSignedUrl.startsWith('https://') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => window.open(feeSignedUrl, '_blank', 'noopener,noreferrer')}
                >
                  <FileDown className="h-3 w-3 mr-1" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <SendAgreementDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        firmId={firm.id}
        documentType={sendDocumentType}
        buyerEmail={email}
        buyerName={name}
        firmName={firm.primary_company_name}
      />
    </>
  );
}
