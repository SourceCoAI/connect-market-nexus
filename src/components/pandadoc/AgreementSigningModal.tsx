import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PandaDocSigningPanel } from './PandaDocSigningPanel';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Shield,
  FileSignature,
  Download,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateAgreementQueries } from '@/hooks/use-agreement-status-sync';

interface AgreementSigningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: 'nda' | 'fee_agreement';
}

export function AgreementSigningModal({
  open,
  onOpenChange,
  documentType,
}: AgreementSigningModalProps) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingDraft, setIsDownloadingDraft] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const ZOOM_STEP = 0.15;
  const MIN_ZOOM = 0.75;
  const MAX_ZOOM = 2;

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  const handleZoomReset = () => setZoomLevel(1);

  const docLabel = documentType === 'nda' ? 'NDA' : 'Fee Agreement';
  const Icon = documentType === 'nda' ? Shield : FileSignature;

  useEffect(() => {
    if (!open) {
      setEmbedUrl(null);
      setError(null);
      setBannerDismissed(false);
      setZoomLevel(1);
      setRetryCount(0);
      return;
    }

    let cancelled = false;

    const fetchEmbed = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const fnName = documentType === 'nda' ? 'get-buyer-nda-embed' : 'get-buyer-fee-embed';
        const { data, error: fnError } = await supabase.functions.invoke(fnName);
        if (cancelled) return;

        const alreadySigned = documentType === 'nda' ? data?.ndaSigned : data?.feeSigned;

        if (fnError) {
          setError('Failed to load signing form. Please try again.');
        } else if (data?.hasFirm === false) {
          setError(
            "Your account hasn't been set up for signing yet. Please contact our team via Messages.",
          );
        } else if (alreadySigned) {
          toast({
            title: 'Already Signed',
            description: `Your ${docLabel} has already been signed.`,
          });
          invalidateAgreementQueries(queryClient, user?.id);
          onOpenChange(false);
        } else if (data?.embedUrl) {
          setEmbedUrl(data.embedUrl);
        } else {
          setError('Signing form not available. Please contact support.');
        }
      } catch {
        if (!cancelled) setError('Something went wrong. Please try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchEmbed();
    return () => {
      cancelled = true;
    };
  }, [open, documentType, retryCount]);

  const handleSigned = async () => {
    toast({
      title: `${docLabel} Signed!`,
      description: 'Thank you for signing. Your access has been updated.',
    });

    // Immediately confirm the signing on the backend (updates firm_agreements, sends emails/notifications)
    // Fire-and-forget — webhook serves as backup if this fails
    supabase.functions
      .invoke('confirm-agreement-signed', { body: { documentType } })
      .then(() => {
        // Re-invalidate after backend confirmation to pick up DB changes
        invalidateAgreementQueries(queryClient, user?.id);
      })
      .catch((err) => {
        console.warn('confirm-agreement-signed call failed (webhook will retry):', err);
      });

    // Staggered invalidation of all agreement-related queries
    invalidateAgreementQueries(queryClient, user?.id);

    // Auto-close after brief delay
    const timer = setTimeout(() => onOpenChange(false), 2000);
    return () => clearTimeout(timer);
  };

  const handleDownloadDraft = async () => {
    setIsDownloadingDraft(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('get-agreement-document', {
        body: { documentType },
      });
      if (fnError || !data?.documentUrl) {
        toast({
          title: 'Download unavailable',
          description: 'Could not retrieve the document. Please try again.',
          variant: 'destructive',
        });
        return;
      }
      window.open(data.documentUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast({
        title: 'Download failed',
        description: 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingDraft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            Sign {docLabel}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Preparing signing form...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex items-center justify-center gap-2">
              {retryCount < 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRetryCount((c) => c + 1)}
                >
                  Try Again
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate('/messages?deal=general');
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Contact Us
              </Button>
            </div>
          </div>
        )}

        {embedUrl && (
          <>
            {!bannerDismissed && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3 shrink-0">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-900">
                    Have redlines or comments on this {docLabel}?
                  </p>
                  <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                    You can{' '}
                    <button
                      onClick={handleDownloadDraft}
                      disabled={isDownloadingDraft}
                      className="font-semibold underline underline-offset-2 hover:text-blue-900"
                    >
                      download the document
                    </button>{' '}
                    and send us back a redlined version, or use the{' '}
                    <button
                      onClick={() => {
                        onOpenChange(false);
                        navigate('/messages?deal=general');
                      }}
                      className="font-semibold underline underline-offset-2 hover:text-blue-900"
                    >
                      Messages
                    </button>{' '}
                    page to share any comments — we'll respond quickly.
                  </p>
                </div>
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="text-blue-400 hover:text-blue-600 text-xs mt-0.5 shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex items-center justify-between border border-border rounded-lg px-3 py-1.5 bg-muted/50 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1.5"
                onClick={handleDownloadDraft}
                disabled={isDownloadingDraft}
              >
                {isDownloadingDraft ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download PDF
              </Button>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= MIN_ZOOM}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs min-w-[3.5rem] font-mono"
                  onClick={handleZoomReset}
                >
                  {Math.round(zoomLevel * 100)}%
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= MAX_ZOOM}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => {
                  onOpenChange(false);
                  navigate('/messages?deal=general');
                }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Send Comments
              </Button>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              <div
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top center',
                  width: `${100 / zoomLevel}%`,
                }}
              >
                <PandaDocSigningPanel
                  embedUrl={embedUrl}
                  onCompleted={handleSigned}
                  successMessage={`${docLabel} signed successfully.`}
                  successDescription="Your access has been updated. You can close this dialog."
                  title=""
                  description=""
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
