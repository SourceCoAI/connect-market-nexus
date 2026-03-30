import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PandaDocSigningPanel } from './PandaDocSigningPanel';
import { Button } from '@/components/ui/button';
import { Shield, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { APP_CONFIG } from '@/config/app';

interface NdaGateModalProps {
  userId: string;
  firmId: string;
  onSigned?: () => void;
}

/**
 * Full-screen modal overlay that blocks deal detail access for unsigned buyers.
 * Contains PandaDocSigningPanel inline.
 * Cannot be dismissed without signing or navigating away.
 */
export function NdaGateModal({ userId, firmId, onSigned }: NdaGateModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchEmbedUrl = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-buyer-nda-embed');

        if (cancelled) return;

        if (fnError) {
          const errorMsg = typeof fnError === 'object' && fnError !== null && 'message' in fnError
            ? String((fnError as Record<string, unknown>).message)
            : '';
          if (errorMsg.toLowerCase().includes('not configured') || errorMsg.toLowerCase().includes('pandadoc')) {
            setError('Document signing is temporarily unavailable. Our team has been notified — please check back shortly.');
          } else {
            setError('Failed to prepare NDA signing form');
          }
        } else if (data?.ndaSigned) {
          onSigned?.();
        } else if (data?.embedUrl) {
          setEmbedUrl(data.embedUrl);
        } else {
          setError('NDA signing form not available. Please contact support.');
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
  }, [userId, firmId]);

  const handleSigned = async () => {
    queryClient.invalidateQueries({ queryKey: ['buyer-nda-status'] });
    queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
    onSigned?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="nda-gate-title">
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h2 id="nda-gate-title" className="text-2xl font-bold">Sign Your NDA to View This Deal</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Deal details — including the business name, real financials, and owner information — are confidential. Your NDA unlocks full access to this deal and every deal on the platform. Sign once, done forever. Takes about 60 seconds.
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Preparing NDA signing form...</p>
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
            <PandaDocSigningPanel
              embedUrl={embedUrl}
              onCompleted={handleSigned}
              title="Review and sign your NDA"
              description="Standard confidentiality agreement — review and sign below to unlock full access."
            />
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
