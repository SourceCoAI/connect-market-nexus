import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Mail, FileText, Clock, Loader2, Building2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { User } from '@/types';
import { useUpdateAgreementViaUser, useUserFirm } from '@/hooks/admin/use-firm-agreement-actions';
import React, { useState } from 'react';

interface DualFeeAgreementToggleProps {
  user: User;
  onSendEmail?: (user: User) => void;
  size?: 'sm' | 'default';
  firmData?: { [key: string]: unknown } | null;
}

export const DualFeeAgreementToggle = React.memo(function DualFeeAgreementToggle({
  user,
  onSendEmail,
  size = 'default',
  firmData,
}: DualFeeAgreementToggleProps) {
  const [isUpdatingSigned, setIsUpdatingSigned] = useState(false);
  const [isUpdatingEmailSent, setIsUpdatingEmailSent] = useState(false);
  const updateAgreement = useUpdateAgreementViaUser();
  // Skip individual query if bulk data was provided
  const { data: fetchedFirm } = useUserFirm(firmData !== undefined ? undefined : user.id);
  const rawFirm = firmData !== undefined ? firmData : fetchedFirm;
  const firm = rawFirm as
    | {
        primary_company_name?: string;
        fee_agreement_signed?: boolean | null;
        fee_agreement_signed_at?: string | null;
        fee_agreement_signed_by_name?: string | null;
        fee_agreement_email_sent?: boolean | null;
        fee_agreement_email_sent_at?: string | null;
      }
    | null
    | undefined;

  // Only use firm-level status — never fall back to stale profile-level booleans
  const isSigned = firm?.fee_agreement_signed ?? false;
  const signedAt = firm?.fee_agreement_signed_at ?? null;
  const signedByName = firm?.fee_agreement_signed_by_name;
  const emailSent = firm?.fee_agreement_email_sent ?? false;
  const emailSentAt = firm?.fee_agreement_email_sent_at ?? null;
  const firmName = firm?.primary_company_name;

  const handleSignedToggleChange = async (checked: boolean) => {
    if (isUpdatingSigned || updateAgreement.isPending) return;
    setIsUpdatingSigned(true);
    try {
      await updateAgreement.mutateAsync({
        userId: user.id,
        agreementType: 'fee_agreement',
        action: checked ? 'sign' : 'unsign',
        adminNotes: checked ? 'Manually marked as signed by admin' : 'Manually revoked by admin',
      });
    } catch (error) {
      console.error('Fee Agreement Signed Toggle Error:', error);
    } finally {
      setIsUpdatingSigned(false);
    }
  };

  const handleEmailSentToggleChange = async (checked: boolean) => {
    if (isUpdatingEmailSent || updateAgreement.isPending) return;
    setIsUpdatingEmailSent(true);
    try {
      await updateAgreement.mutateAsync({
        userId: user.id,
        agreementType: 'fee_agreement',
        action: checked ? 'email_sent' : 'email_unsent',
        adminNotes: checked ? 'Manually marked as email sent' : 'Manually marked as email not sent',
      });
    } catch (error) {
      console.error('Fee Agreement Email Toggle Error:', error);
    } finally {
      setIsUpdatingEmailSent(false);
    }
  };

  const handleSendEmail = () => {
    if (onSendEmail) onSendEmail(user);
  };

  const isPending = updateAgreement.isPending;

  if (size === 'sm') {
    return (
      <div className="flex items-center gap-3">
        {/* Firm indicator */}
        {firmName && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Building2 className="h-3 w-3 text-muted-foreground/60" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Firm: {firmName}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Email Sent Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <Switch
                  checked={emailSent}
                  onCheckedChange={handleEmailSentToggleChange}
                  disabled={isUpdatingEmailSent || isPending}
                  className="data-[state=checked]:bg-blue-600 scale-75"
                />
                {(isUpdatingEmailSent || isPending) && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Email {emailSent ? 'Sent' : 'Not Sent'}
                {firmName ? ` (${firmName})` : ''}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Signed Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <Switch
                  checked={isSigned}
                  onCheckedChange={handleSignedToggleChange}
                  disabled={isUpdatingSigned || isPending}
                  className="data-[state=checked]:bg-green-600 scale-75"
                />
                {(isUpdatingSigned || isPending) && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Agreement {isSigned ? 'Signed' : 'Not Signed'}
                {firmName ? ` (${firmName})` : ''}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Send Email Button */}
        {!emailSent && onSendEmail && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleSendEmail} className="h-6 w-6 p-0">
                  <Mail className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Send Fee Agreement</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Firm context banner */}
      {firmName && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border/40">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Applied to firm: <span className="font-medium text-foreground">{firmName}</span>
          </span>
        </div>
      )}

      {/* Email Sent Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Email Sent</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={emailSent}
              onCheckedChange={handleEmailSentToggleChange}
              disabled={isUpdatingEmailSent || isPending}
              className="data-[state=checked]:bg-blue-600"
            />
            {(isUpdatingEmailSent || isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            <Badge variant={emailSent ? 'default' : 'secondary'}>
              {emailSent ? 'Sent' : 'Not Sent'}
            </Badge>
          </div>
        </div>
        {emailSent && emailSentAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Sent {formatDistanceToNow(new Date(emailSentAt), { addSuffix: true })}</span>
          </div>
        )}
      </div>

      {/* Fee Agreement Signed Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Fee Agreement</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isSigned}
              onCheckedChange={handleSignedToggleChange}
              disabled={isUpdatingSigned || isPending}
              className="data-[state=checked]:bg-green-600"
            />
            {(isUpdatingSigned || isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            <Badge variant={isSigned ? 'success' : 'secondary'}>
              {isSigned ? 'Signed' : 'Not Signed'}
            </Badge>
          </div>
        </div>
        {isSigned && (signedAt || signedByName) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {signedByName && `Signed by ${signedByName}`}
              {signedAt && ` ${formatDistanceToNow(new Date(signedAt), { addSuffix: true })}`}
            </span>
          </div>
        )}
      </div>

      {/* Send Email Button */}
      {!emailSent && (
        <Button variant="outline" size="sm" onClick={handleSendEmail} className="w-full">
          <Mail className="h-4 w-4 mr-2" />
          Send Fee Agreement
        </Button>
      )}
    </div>
  );
});
