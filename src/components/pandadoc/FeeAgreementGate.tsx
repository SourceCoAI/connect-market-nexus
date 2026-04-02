import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, ArrowLeft, Loader2, Mail, CheckCircle, ArrowRight } from 'lucide-react';
import { sendAgreementEmail } from '@/lib/agreement-email';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateAgreementQueries } from '@/hooks/use-agreement-status-sync';

interface FeeAgreementGateProps {
  userId: string;
  firmId: string;
  listingTitle?: string;
  onSigned: () => void;
  onDismiss: () => void;
}

/**
 * Full-screen modal overlay for fee agreement request.
 * Email-based flow (replaces PandaDoc embed).
 */
export function FeeAgreementGate({ userId, firmId: _firmId, listingTitle: _listingTitle, onSigned, onDismiss }: FeeAgreementGateProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isRequesting, setIsRequesting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    setIsRequesting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('request-agreement-email', {
        body: { documentType: 'fee_agreement' },
      });

      if (fnError) {
        setError('Failed to send Fee Agreement. Please try again.');
        return;
      }

      if (data?.alreadySigned) {
        invalidateAgreementQueries(queryClient, userId);
        onSigned();
        return;
      }

      if (data?.success) {
        setSent(true);
        invalidateAgreementQueries(queryClient, userId);
      } else {
        setError(data?.error || 'Something went wrong.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true">
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="inline-flex p-3 rounded-full bg-emerald-100">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-emerald-800">Fee Agreement Sent!</h2>
              <p className="text-muted-foreground mt-2">
                Check your inbox at <strong>{user?.email}</strong>. Review, sign, and reply to <strong>support@sourcecodeals.com</strong> with the signed copy.
              </p>
              <p className="text-muted-foreground mt-2">
                Once processed, you'll be able to request deal introductions.
              </p>
            </div>
            <Button onClick={onDismiss} variant="outline">
              <ArrowRight className="h-4 w-4 mr-2" />
              Back to Listings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="fee-gate-title">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h2 id="fee-gate-title" className="text-2xl font-bold">You found a deal worth pursuing.</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Before we make this introduction, we need a fee agreement in place. It covers every introduction we make on your behalf — now and in the future.
            </p>
          </div>

          <div className="space-y-3">
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-1">What you're agreeing to</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Success-only. Nothing owed unless a deal closes. Our fee is a percentage of deal value at close — modified Lehman scale. No retainers, no platform fees, no exclusivity.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            onClick={handleRequest}
            disabled={isRequesting}
            className="w-full py-3"
            size="lg"
          >
            {isRequesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending Fee Agreement...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Request Fee Agreement via Email
              </>
            )}
          </Button>

          <div className="text-center">
            <Button variant="ghost" onClick={onDismiss} className="text-muted-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to listings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
