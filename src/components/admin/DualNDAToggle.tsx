import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Mail, Clock, ShieldCheck, Building2 } from 'lucide-react';
import { User } from '@/types';
import { useUpdateAgreementViaUser, useUserFirm } from '@/hooks/admin/use-firm-agreement-actions';
import { formatDistanceToNow } from 'date-fns';

interface DualNDAToggleProps {
  user: User;
  onSendEmail?: (user: User) => void;
  size?: 'sm' | 'default';
  firmData?: { [key: string]: unknown } | null;
}

export const DualNDAToggle = ({ user, onSendEmail, size = 'default', firmData }: DualNDAToggleProps) => {
  const [isUpdatingSigned, setIsUpdatingSigned] = useState(false);
  const [isUpdatingEmailSent, setIsUpdatingEmailSent] = useState(false);
  const updateAgreement = useUpdateAgreementViaUser();
  // Skip individual query if bulk data was provided
  const { data: fetchedFirm } = useUserFirm(firmData !== undefined ? undefined : user.id);
  const rawFirm = firmData !== undefined ? firmData : fetchedFirm;
  const firm = rawFirm as
    | {
        primary_company_name?: string;
        nda_signed?: boolean | null;
        nda_signed_at?: string | null;
        nda_signed_by_name?: string | null;
        nda_email_sent?: boolean | null;
        nda_email_sent_at?: string | null;
      }
    | null
    | undefined;

  // Only use firm-level status — never fall back to stale profile-level booleans
  const isSigned = firm?.nda_signed ?? false;
  const signedAt = firm?.nda_signed_at ?? null;
  const signedByName = firm?.nda_signed_by_name;
  const emailSent = firm?.nda_email_sent ?? false;
  const emailSentAt = firm?.nda_email_sent_at ?? null;
  const firmName = firm?.primary_company_name;

  const handleSignedToggleChange = async (checked: boolean) => {
    if (isUpdatingSigned || updateAgreement.isPending) return;
    setIsUpdatingSigned(true);
    try {
      await updateAgreement.mutateAsync({
        userId: user.id,
        agreementType: 'nda',
        action: checked ? 'sign' : 'unsign',
        adminNotes: checked ? 'Manually marked as signed by admin' : 'Manually revoked by admin',
      });
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
        agreementType: 'nda',
        action: checked ? 'email_sent' : 'email_unsent',
        adminNotes: checked ? 'Manually marked as email sent' : 'Manually marked as email not sent',
      });
    } finally {
      setIsUpdatingEmailSent(false);
    }
  };

  const handleSendEmail = () => {
    if (onSendEmail) onSendEmail(user);
  };

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
                  disabled={isUpdatingEmailSent || updateAgreement.isPending}
                  className="data-[state=checked]:bg-purple-600 scale-75"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                NDA Email {emailSent ? 'Sent' : 'Not Sent'}
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
                <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                <Switch
                  checked={isSigned}
                  onCheckedChange={handleSignedToggleChange}
                  disabled={isUpdatingSigned || updateAgreement.isPending}
                  className="data-[state=checked]:bg-emerald-600 scale-75"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                NDA {isSigned ? 'Signed' : 'Not Signed'}
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
                <p>Send NDA</p>
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
            <span className="text-sm font-medium">NDA Email Sent</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={emailSent}
              onCheckedChange={handleEmailSentToggleChange}
              disabled={isUpdatingEmailSent || updateAgreement.isPending}
              className="data-[state=checked]:bg-purple-600"
            />
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

      {/* NDA Signed Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">NDA Signed</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isSigned}
              onCheckedChange={handleSignedToggleChange}
              disabled={isUpdatingSigned || updateAgreement.isPending}
              className="data-[state=checked]:bg-emerald-600"
            />
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
      {!emailSent && onSendEmail && (
        <Button variant="outline" size="sm" onClick={handleSendEmail} className="w-full">
          <Mail className="h-4 w-4 mr-2" />
          Send NDA Email
        </Button>
      )}
    </div>
  );
};
