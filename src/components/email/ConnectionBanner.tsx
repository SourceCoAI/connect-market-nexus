/**
 * ConnectionBanner: Shows alerts for email connection issues.
 * Displays persistent banners for error/expired/disconnected states.
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { useEmailConnection } from '@/hooks/email';

export function ConnectionBanner() {
  const { connection, isConnected, hasError, isExpired, connect, isConnecting } = useEmailConnection();

  if (!connection) return null;
  if (isConnected) return null;

  if (hasError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Outlook Connection Error</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            {connection.error_message || 'Your Outlook connection has encountered an error. Please reconnect.'}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => connect()}
            disabled={isConnecting}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isConnecting ? 'animate-spin' : ''}`} />
            Reconnect
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isExpired) {
    return (
      <Alert>
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Outlook Connection Expired</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>Your Outlook connection has expired. Please reconnect to resume email sync.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => connect()}
            disabled={isConnecting}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isConnecting ? 'animate-spin' : ''}`} />
            Reconnect
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (connection.status === 'revoked') {
    return (
      <Alert>
        <WifiOff className="h-4 w-4" />
        <AlertTitle>Outlook Disconnected</AlertTitle>
        <AlertDescription>
          Your Outlook account is disconnected. Email history is still visible but new emails won't sync.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
