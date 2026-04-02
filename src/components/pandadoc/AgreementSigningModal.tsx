import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Shield, FileSignature, CheckCircle, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateAgreementQueries } from '@/hooks/use-agreement-status-sync';

interface AgreementSigningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType?: 'nda' | 'fee_agreement';
}

/**
 * Email-based agreement request dialog.
 * Replaces the old PandaDoc embedded signing modal.
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

  const activeType = chosenType;
  const docLabel = activeType === 'nda' ? 'NDA' : 'Fee Agreement';
  const Icon = activeType === 'nda' ? Shield : FileSignature;

  const handleRequest = async () => {
    setIsRequesting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('request-agreement-email', {
        body: { documentType: activeType },
      });

      if (fnError) {
        setError('Failed to send the document. Please try again.');
        return;
      }

      if (data?.alreadySigned) {
        toast({
          title: 'Already Signed',
          description: `Your ${docLabel} has already been signed.`,
        });
        invalidateAgreementQueries(queryClient, user?.id);
        onOpenChange(false);
        return;
      }

      if (data?.success) {
        setSent(true);
        invalidateAgreementQueries(queryClient, user?.id);
      } else {
        setError(data?.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsRequesting(false);
    }
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
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4"
                onClick={() => setChosenType('nda')}
              >
                <Shield className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Non-Disclosure Agreement</div>
                  <div className="text-xs text-muted-foreground">Standard NDA for deal access</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4"
                onClick={() => setChosenType('fee_agreement')}
              >
                <FileSignature className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Fee Agreement</div>
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
                Review, sign, and reply to <strong>support@sourcecodeals.com</strong> with the signed copy.
              </p>
            </div>
            <Button onClick={handleClose} variant="outline" className="mt-2">
              Got it
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
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
