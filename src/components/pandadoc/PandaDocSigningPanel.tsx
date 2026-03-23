import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';

interface PandaDocSigningPanelProps {
  embedUrl: string;
  onCompleted?: (data: Record<string, unknown>) => void;
  onDeclined?: () => void;
  onError?: (error: unknown) => void;
  title?: string;
  description?: string;
  successMessage?: string;
  successDescription?: string;
}

/**
 * Reusable wrapper around PandaDoc's embedded signing iframe.
 * Shows loading, success, and error states.
 * Listens for PandaDoc postMessage events for completion/errors.
 *
 * PandaDoc iframe embed URL: https://app.pandadoc.com/s/{session_token}?embedded=1
 * PandaDoc fires window.message events:
 *   - { type: "session_view.document.completed" }
 *   - { type: "session_view.document.exception" }
 */
export function PandaDocSigningPanel({
  embedUrl,
  onCompleted,
  onDeclined,
  onError: _onError,
  title = 'Sign Document',
  description = 'Please review and sign the document below.',
  successMessage = 'Document signed successfully.',
  successDescription = 'Your access has been updated.',
}: PandaDocSigningPanelProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'signed' | 'declined' | 'error'>(
    'loading',
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for PandaDoc postMessage events
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Only accept messages from PandaDoc
      if (!event.origin.includes('pandadoc.com')) return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'session_view.document.completed') {
        setStatus('signed');
        onCompleted?.(data);
      } else if (data.type === 'session_view.document.declined') {
        setStatus('declined');
        onDeclined?.();
      } else if (data.type === 'session_view.document.exception') {
        setStatus('error');
        _onError?.(data);
      } else if (data.type === 'session_view.document.loaded') {
        setStatus('ready');
      }
    },
    [onCompleted, onDeclined, _onError],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Warn user before navigating away while signing form is loaded but not yet signed
  useEffect(() => {
    if (status !== 'ready') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status]);

  // Fallback: mark as ready after iframe loads (PandaDoc may not always send loaded event)
  const handleIframeLoad = () => {
    if (status === 'loading') {
      setStatus('ready');
    }
  };

  if (status === 'signed') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-800">{successMessage}</h3>
              <p className="text-sm text-green-600 mt-1">{successDescription}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'declined') {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="p-3 rounded-full bg-amber-100">
              <AlertCircle className="h-8 w-8 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-amber-800">Document Declined</h3>
              <p className="text-sm text-amber-600 mt-1">
                You've declined to sign. Contact us if you have questions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {title && (
        <div className="text-center">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      )}

      <div className="relative min-h-[400px] flex-1">
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading signing form...</p>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={embedUrl}
          onLoad={handleIframeLoad}
          className="w-full min-h-[600px] border-0 rounded-lg"
          title="Document Signing"
          allow="camera"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
        />
      </div>
    </div>
  );
}
