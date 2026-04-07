/**
 * OutlookCallback: Handles the redirect back from Microsoft OAuth consent screen.
 * Extracts the authorization code from URL params and passes it to the callback handler.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useEmailConnection } from '@/hooks/email';

const OutlookCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleCallback, isProcessingCallback } = useEmailConnection();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setErrorMessage(errorDescription || error);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setErrorMessage('Missing authorization code or state parameter.');
      return;
    }

    // Verify state matches what we stored (using localStorage for cross-tab persistence)
    const storedState = localStorage.getItem('outlook_oauth_state');
    // Remove state FIRST to prevent replay attacks
    localStorage.removeItem('outlook_oauth_state');

    if (storedState && storedState !== state) {
      setStatus('error');
      setErrorMessage('Security validation failed. Please try connecting again.');
      return;
    }

    // Refresh session before callback — user's session may have expired
    // during the OAuth flow with Microsoft
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Best-effort — if refresh fails, callback will fail with auth error
    }

    handleCallback(
      { code, state },
      {
        onSuccess: () => {
          setStatus('success');
          setTimeout(() => navigate('/admin/settings/outlook'), 2000);
        },
        onError: (err: Error) => {
          setStatus('error');
          setErrorMessage(err.message);
        },
      },
    );
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          {status === 'processing' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <h2 className="text-lg font-semibold">Connecting Outlook...</h2>
              <p className="text-sm text-muted-foreground">
                Please wait while we set up your email connection.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <h2 className="text-lg font-semibold">Outlook Connected!</h2>
              <p className="text-sm text-muted-foreground">
                Your account has been linked. Email sync is starting in the background.
                Redirecting to settings...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 mx-auto text-destructive" />
              <h2 className="text-lg font-semibold">Connection Failed</h2>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => navigate('/admin/settings/outlook')}>
                  Back to Settings
                </Button>
                <Button onClick={() => navigate('/admin/settings/outlook')}>
                  Try Again
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OutlookCallback;
