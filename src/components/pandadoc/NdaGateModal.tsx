import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, ArrowLeft, Loader2, Mail, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateAgreementQueries } from '@/hooks/use-agreement-status-sync';

interface NdaGateModalProps {
  userId: string;
  firmId?: string;
  onSigned?: () => void;
}

/**
 * Full-screen modal overlay that blocks deal detail access for unsigned buyers.
 * Email-based NDA request flow (replaces PandaDoc embed).
 */
export function NdaGateModal({ userId, firmId: _firmId, onSigned }: NdaGateModalProps) {
  const navigate = useNavigate();
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
        body: { documentType: 'nda' },
      });

      if (fnError) {
        setError('Failed to send NDA. Please try again or contact support.');
        return;
      }

      if (data?.alreadySigned) {
        invalidateAgreementQueries(queryClient, userId);
        onSigned?.();
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

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="nda-gate-title">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h2 id="nda-gate-title" className="text-2xl font-bold">Sign Your NDA to View This Deal</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Deal details — including the business name, real financials, and owner information — are confidential. Your NDA unlocks full access to this deal and every deal on the platform.
            </p>
          </div>

          {sent ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center space-y-3">
              <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto" />
              <h3 className="text-lg font-semibold text-emerald-800">NDA Sent!</h3>
              <p className="text-sm text-emerald-700">
                Check your inbox at <strong>{user?.email}</strong>.
              </p>
              <p className="text-sm text-emerald-700">
                Review, sign, and reply to <strong>support@sourcecodeals.com</strong> with the signed copy. Once we process it, you'll have full access.
              </p>
            </div>
          ) : (
            <>
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
                    Sending NDA...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Request NDA via Email
                  </>
                )}
              </Button>
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
