/**
 * EmailHistoryTab: Complete email tab for contact detail views.
 * Shows thread list with compose capability.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, AlertTriangle } from 'lucide-react';
import { useEmailConnection } from '@/hooks/email';
import { EmailThreadList } from './EmailThreadList';
import { ComposeEmail } from './ComposeEmail';
import { ConnectionBanner } from './ConnectionBanner';

interface EmailHistoryTabProps {
  contactId: string;
  /** Additional contact IDs to show emails for (multi-contact buyers) */
  additionalContactIds?: string[];
  contactName?: string;
  contactEmail?: string;
  dealId?: string;
}

export function EmailHistoryTab({ contactId, additionalContactIds, contactName, contactEmail, dealId }: EmailHistoryTabProps) {
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{
    messageId: string;
    subject: string;
    quote: string;
    toAddress: string;
  } | null>(null);
  const { isConnected, hasError, isExpired } = useEmailConnection();

  return (
    <div className="space-y-4">
      {/* Connection status banner */}
      <ConnectionBanner />

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Email History {contactName ? `with ${contactName}` : ''}
        </h3>
        {isConnected && contactEmail && (
          <Button size="sm" onClick={() => setIsComposeOpen(true)}>
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Compose
          </Button>
        )}
      </div>

      {/* Thread list */}
      <EmailThreadList
        contactId={contactId}
        additionalContactIds={additionalContactIds}
        contactName={contactName}
        onCompose={isConnected && contactEmail ? () => setIsComposeOpen(true) : undefined}
        onReply={isConnected ? (messageId, subject, quote, toAddress) => {
          setReplyTo({ messageId, subject, quote, toAddress });
        } : undefined}
      />

      {/* Compose dialog */}
      <ComposeEmail
        open={isComposeOpen || !!replyTo}
        onOpenChange={(open) => {
          if (!open) {
            setIsComposeOpen(false);
            setReplyTo(null);
          }
        }}
        contactId={contactId}
        dealId={dealId}
        defaultTo={replyTo ? [replyTo.toAddress] : contactEmail ? [contactEmail] : []}
        replyToMessageId={replyTo?.messageId}
        replySubject={replyTo?.subject}
        replyQuote={replyTo?.quote}
      />
    </div>
  );
}
