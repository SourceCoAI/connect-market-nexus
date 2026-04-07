import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, ArrowLeft, Loader2, Mail, CheckCircle, FileSignature } from 'lucide-react';
import { sendAgreementEmail } from '@/lib/agreement-email';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateAgreementQueries } from '@/hooks/use-agreement-status-sync';

interface NdaGateModalProps {
  userId: string;
  firmId?: string;
  onSigned?: () => void;
}

/**
 * Full-screen modal that blocks deal detail access when NO agreement is signed.
 * Offers both NDA and Fee Agreement request options.
 */
export function NdaGateModal({ userId, firmId: _firmId, onSigned }: NdaGateModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestingType, setRequestingType] = useState<'nda' | 'fee_agreement' | null>(null);
  const [sent, setSent] = useState(false);
  const [sentType, setSentType] = useState<'nda' | 'fee_agreement'>('nda');
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async (docType: 'nda' | 'fee_agreement') => {
    setIsRequesting(true);
    setRequestingType(docType);
    setError(null);

    const result = await sendAgreementEmail({ documentType: docType });

    if (result.alreadySigned) {
      invalidateAgreementQueries(queryClient, userId);
      onSigned?.();
    } else if (result.success) {
      setSent(true);
      setSentType(docType);
      invalidateAgreementQueries(queryClient, userId);
    } else {
      setError(result.error || 'Something went wrong.');
    }

    setIsRequesting(false);
    setRequestingType(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="agreement-gate-title">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h2 id="agreement-gate-title" className="text-2xl font-bold">Sign an Agreement to Access Deals</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Deal details — including the business name, financials, and owner information — are confidential. Sign a Fee Agreement to access deal materials and request introductions.
            </p>
          </div>

          {sent ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center space-y-3">
              <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto" />
              <h3 className="text-lg font-semibold text-emerald-800">
                {sentType === 'nda' ? 'NDA' : 'Fee Agreement'} Sent!
              </h3>
              <p className="text-sm text-emerald-700">
                Check your inbox at <strong>{user?.email}</strong>.
              </p>
              <p className="text-sm text-emerald-700">
                Review, sign, and reply to <strong>adam.haile@sourcecodeals.com</strong> with the signed copy. Once processed, you'll be able to request deal introductions and receive deal materials.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={() => handleRequest('nda')}
                  disabled={isRequesting}
                  className="w-full py-3"
                  size="lg"
                >
                  {isRequesting && requestingType === 'nda' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending NDA...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Request NDA via Email
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => handleRequest('fee_agreement')}
                  disabled={isRequesting}
                  variant="outline"
                  className="w-full py-3"
                  size="lg"
                >
                  {isRequesting && requestingType === 'fee_agreement' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending Fee Agreement...
                    </>
                  ) : (
                    <>
                      <FileSignature className="h-4 w-4 mr-2" />
                      Request Fee Agreement via Email
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => navigate('/marketplace')}
              className="text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to listings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
