import { useState, useEffect, useCallback } from 'react';

import { PandaDocSigningPanel } from './PandaDocSigningPanel';
import { Button } from '@/components/ui/button';
import { FileText, ArrowLeft, Loader2, ArrowRight, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { APP_CONFIG } from '@/config/app';

interface FeeAgreementGateProps {
  userId: string;
  firmId: string;
  listingTitle?: string;
  onSigned: () => void;
  onDismiss: () => void;
}

/**
 * Full-screen modal overlay that intercepts connection request flow
 * when the buyer's firm hasn't signed a fee agreement.
 */
export function FeeAgreementGate({ userId, firmId, listingTitle: _listingTitle, onSigned, onDismiss }: FeeAgreementGateProps) {
  void _listingTitle; // reserved for future use
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [isDownloadingDraft, setIsDownloadingDraft] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchEmbedUrl = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-buyer-fee-embed');

        if (cancelled) return;

        if (fnError) {
          setError('Failed to prepare fee agreement signing form');
        } else if (data?.feeSigned) {
          onSigned();
        } else if (data?.embedUrl) {
          setEmbedUrl(data.embedUrl);
        } else {
          setError('Fee agreement signing form not available. Please contact support.');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchEmbedUrl();
    return () => { cancelled = true; };
  }, [userId, firmId, onSigned]);

  const invalidateAllCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['my-agreement-status'] });
    queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
    queryClient.invalidateQueries({ queryKey: ['buyer-firm-agreement-status'] });
    queryClient.invalidateQueries({ queryKey: ['agreement-pending-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['buyer-nda-status'] });
    queryClient.invalidateQueries({ queryKey: ['buyer-message-threads'] });
  }, [queryClient]);

  const handleSigned = async () => {
    invalidateAllCaches();
    setSigned(true);
  };

  const handleDownloadDraft = async () => {
    setIsDownloadingDraft(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('get-agreement-document', {
        body: { documentType: 'fee_agreement' },
      });
      if (fnError || !data?.documentUrl) {
        toast({ title: 'Download unavailable', description: 'Could not retrieve the document.', variant: 'destructive' });
        return;
      }
      window.open(data.documentUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast({ title: 'Download failed', description: 'Something went wrong.', variant: 'destructive' });
    } finally {
      setIsDownloadingDraft(false);
    }
  };

  if (signed) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true">
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="inline-flex p-3 rounded-full bg-green-100">
              <FileText className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-green-800">You're fully set up.</h2>
              <p className="text-muted-foreground mt-2">
                Fee agreement signed. Every deal on SourceCo is now open to you. Continue to submit your request — we'll make the introduction.
              </p>
            </div>
            <Button
              onClick={onSigned}
              className="px-8 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium"
            >
              Continue to Request
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="fee-gate-title">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h2 id="fee-gate-title" className="text-2xl font-bold">You found a deal worth pursuing.</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Before we make this introduction, we need one thing in place. It takes 60 seconds and covers every introduction we make on your behalf — now and in the future.
            </p>
          </div>

          <div className="space-y-3">
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-1">Why we work this way</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                SourceCo has limited capacity. We're selective about which buyers we work with actively — because every introduction we make is to a real business owner who has trusted us with confidential information. A fee agreement is how we know you're serious about closing, not just looking.
              </p>
            </div>
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-1">What you're agreeing to</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Success-only. Nothing owed unless a deal closes. Our fee is a percentage of deal value at close — modified Lehman scale. No retainers, no platform fees, no exclusivity. You're free to source deals elsewhere. We only earn if we help you close.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                The agreement covers all deals you close through SourceCo.
              </p>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Preparing fee agreement signing form...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Please contact <a href={`mailto:${APP_CONFIG.adminEmail}`} className="underline">{APP_CONFIG.adminEmail}</a> for assistance.
              </p>
            </div>
          )}

          {embedUrl && (
            <>
              <PandaDocSigningPanel
                embedUrl={embedUrl}
                onCompleted={handleSigned}
                successMessage="Fee Agreement signed successfully."
                successDescription="You're all set. Continue to submit your connection request."
                title="Review and sign your fee agreement"
                description="Standard success-fee agreement — review and sign below to continue."
              />

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={handleDownloadDraft}
                  disabled={isDownloadingDraft}
                >
                  {isDownloadingDraft ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Download Draft PDF
                </Button>
                <a
                  href={`mailto:${APP_CONFIG.adminEmail}?subject=${encodeURIComponent('Question about Fee Agreement')}`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Questions about terms? Contact us
                </a>
              </div>
            </>
          )}

          {!embedUrl && !isLoading && !error && (
            <p className="text-xs text-muted-foreground text-center">
              Questions about the fee agreement? Email{' '}
              <a href={`mailto:${APP_CONFIG.adminEmail}`} className="text-primary hover:underline">{APP_CONFIG.adminEmail}</a>
              {' '}before signing.
            </p>
          )}

          <div className="text-center">
            <Button
              variant="ghost"
              onClick={onDismiss}
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
