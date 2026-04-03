import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { sendAgreementEmail } from '@/lib/agreement-email';
import { Loader2, Shield, FileSignature, CheckCircle, Mail, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateAgreementQueries } from '@/hooks/use-agreement-status-sync';
import { useMyAgreementStatus } from '@/hooks/use-agreement-status';

interface AgreementSigningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType?: 'nda' | 'fee_agreement';
}

/**
 * Email-based agreement request dialog.
 * Shows signed status, previous request dates, and allows requesting unsigned docs.
 */
export function AgreementSigningModal({
  open,
  onOpenChange,
  documentType,
}: AgreementSigningModalProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosenType, setChosenType] = useState<'nda' | 'fee_agreement' | null>(documentType ?? null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: agreementStatus } = useMyAgreementStatus(open);

  const activeType = chosenType;
  const docLabel = activeType === 'nda' ? 'NDA' : 'Fee Agreement';
  const Icon = activeType === 'nda' ? Shield : FileSignature;

  const isNdaSigned = agreementStatus?.nda_covered ?? false;
  const isFeeSigned = agreementStatus?.fee_covered ?? false;

  // Get requested_at from the agreement status (cast to access extra fields)
  const statusAny = agreementStatus as Record<string, unknown> | undefined;
  const ndaRequestedAt = statusAny?.nda_requested_at as string | null | undefined;
  const feeRequestedAt = statusAny?.fee_agreement_requested_at as string | null | undefined;

  const getRequestedAt = (type: 'nda' | 'fee_agreement') => {
    const raw = type === 'nda' ? ndaRequestedAt : feeRequestedAt;
    if (!raw) return null;
    try {
      return new Date(raw).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const handleRequest = async () => {
    setIsRequesting(true);
    setError(null);

    const result = await sendAgreementEmail({ documentType: activeType! });

    if (result.alreadySigned) {
      toast({
        title: 'Already Signed',
        description: `Your ${docLabel} has already been signed.`,
      });
      invalidateAgreementQueries(queryClient, user?.id);
      onOpenChange(false);
      setIsRequesting(false);
      return;
    }

    if (result.success) {
      setSent(true);
      invalidateAgreementQueries(queryClient, user?.id);
    } else {
      setError(result.error || 'Something went wrong. Please try again.');
    }
    setIsRequesting(false);
  };

  const handleClose = () => {
    setSent(false);
    setError(null);
    if (!documentType) setChosenType(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {activeType ? (
              <>
                <Icon className="h-5 w-5" />
                {sent ? `${docLabel} Sent` : `Request ${docLabel}`}
              </>
            ) : (
              'Choose Your Agreement'
            )}
          </DialogTitle>
        </DialogHeader>

        {!activeType ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Choose which agreement you'd like to sign. You only need one to access deals.
            </p>
            <div className="grid gap-3">
              {/* NDA Option */}
              <Button
                variant="outline"
                className={`w-full justify-start gap-3 h-auto py-4 ${isNdaSigned ? 'opacity-60 cursor-default border-emerald-200 bg-emerald-50/50' : ''}`}
                onClick={() => !isNdaSigned && setChosenType('nda')}
                disabled={isNdaSigned}
              >
                {isNdaSigned ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Shield className="h-5 w-5 text-primary" />
                )}
                <div className="text-left">
                  <div className="font-medium">
                    Non-Disclosure Agreement
                    {isNdaSigned && <span className="ml-2 text-xs text-emerald-600 font-normal">Signed</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">Standard NDA for deal access</div>
                </div>
              </Button>

              {/* Fee Agreement Option */}
              <Button
                variant="outline"
                className={`w-full justify-start gap-3 h-auto py-4 ${isFeeSigned ? 'opacity-60 cursor-default border-emerald-200 bg-emerald-50/50' : ''}`}
                onClick={() => !isFeeSigned && setChosenType('fee_agreement')}
                disabled={isFeeSigned}
              >
                {isFeeSigned ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <FileSignature className="h-5 w-5 text-primary" />
                )}
                <div className="text-left">
                  <div className="font-medium">
                    Fee Agreement
                    {isFeeSigned && <span className="ml-2 text-xs text-emerald-600 font-normal">Signed</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">Advisory fee agreement for deal access</div>
                </div>
              </Button>
            </div>
          </div>
        ) : sent ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="p-3 rounded-full bg-emerald-100">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-emerald-800">Document Sent!</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Check your inbox at <strong>{user?.email}</strong>.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Review, sign, and reply to <strong>adam.haile@sourcecodeals.com</strong> with the signed copy.
              </p>
            </div>
            <Button onClick={handleClose} variant="outline" className="mt-2">
              Got it
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Previous request info */}
            {activeType && getRequestedAt(activeType) && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  An email was sent to <strong>{user?.email}</strong> on {getRequestedAt(activeType)}.
                  You can request again below if needed.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              We'll email you the {docLabel} to review and sign. Once you've signed it, simply reply to the email with the signed copy attached.
            </p>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              {!documentType && (
                <Button
                  variant="ghost"
                  onClick={() => { setChosenType(null); setError(null); }}
                >
                  Back
                </Button>
              )}
              <Button
                onClick={handleRequest}
                disabled={isRequesting}
                className="flex-1"
              >
                {isRequesting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send {docLabel} to My Email
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
