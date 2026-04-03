import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgreementStatusBadge } from './AgreementStatusBadge';
import { FirmSignerSelector } from './FirmSignerSelector';
import {
  useUpdateAgreementStatus,
  type FirmAgreement,
  type FirmMember,
  type AgreementStatus,
  type AgreementSource,
} from '@/hooks/admin/use-firm-agreements';
import {
  ChevronDown, X, Loader2, Mail, Check, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// Transitions are now handled inline in the dropdown menu items

type DialogMode = 'signed' | 'send_email' | null;

interface AgreementStatusDropdownProps {
  firm: FirmAgreement;
  members: FirmMember[];
  agreementType: 'nda' | 'fee_agreement';
}

export function AgreementStatusDropdown({ firm, members, agreementType }: AgreementStatusDropdownProps) {
  const updateStatus = useUpdateAgreementStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentStatus = (agreementType === 'nda' ? firm.nda_status : firm.fee_agreement_status) as AgreementStatus;

  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [signedByUserId, setSignedByUserId] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [customTerms, setCustomTerms] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [source, setSource] = useState<AgreementSource>('manual');
  const [sendingEmail, setSendingEmail] = useState(false);

  // For send email dialog - recipient
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');

  const [localMembers, setLocalMembers] = useState<FirmMember[] | null>(null);
  const [_membersLoading, setMembersLoading] = useState(false);

  const effectiveMembers = localMembers || members;

  const ensureMembers = async () => {
    if ((members?.length ?? 0) > 0) return;
    if (localMembers && localMembers.length > 0) return;
    setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from('firm_members')
        .select(`*, user:profiles(id, email, first_name, last_name, company_name, buyer_type)`)
        .eq('firm_id', firm.id)
        .order('is_primary_contact', { ascending: false });
      if (error) throw error;
      setLocalMembers((data || []) as FirmMember[]);
    } catch {
      // Swallow — dialog will show manual name input
    } finally {
      setMembersLoading(false);
    }
  };

  const openSignedDialog = async () => {
    setDialogMode('signed');
    setSignedByUserId(null);
    setSignedByName(null);
    setDocumentUrl('');
    setCustomTerms('');
    setExpiresAt('');
    setSource('manual');
    await ensureMembers();
  };

  const openSendEmailDialog = async () => {
    setDialogMode('send_email');
    setRecipientEmail('');
    setRecipientName('');
    await ensureMembers();
  };

  const handleSendEmail = async () => {
    if (!recipientEmail) return;
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke('request-agreement-email', {
        body: {
          documentType: agreementType === 'nda' ? 'nda' : 'fee_agreement',
          recipientEmail,
          recipientName: recipientName || recipientEmail,
          firmId: firm.id,
        },
      });
      if (error) throw error;

      toast({
        title: 'Email Sent',
        description: `${agreementType === 'nda' ? 'NDA' : 'Fee Agreement'} sent to ${recipientEmail}`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-document-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-doc-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-pending-request-queue'] });
      setDialogMode(null);
    } catch (err) {
      toast({
        title: 'Failed to send email',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const confirmSignedSubmit = async () => {
    try {
      await updateStatus.mutateAsync({
        firmId: firm.id,
        agreementType,
        newStatus: 'signed',
        signedByUserId,
        signedByName,
        documentUrl: documentUrl || undefined,
        customTerms: customTerms || undefined,
        expiresAt: expiresAt || undefined,
        source,
      });
      setDialogMode(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleResetStatus = async () => {
    try {
      await updateStatus.mutateAsync({
        firmId: firm.id,
        agreementType,
        newStatus: 'not_started',
      });
    } catch {
      // Error handled by mutation
    }
  };

  const typeLabel = agreementType === 'nda' ? 'NDA' : 'Fee Agreement';
  const signedAt = agreementType === 'nda' ? firm.nda_signed_at : firm.fee_agreement_signed_at;
  const signedByNameValue = agreementType === 'nda' ? firm.nda_signed_by_name : firm.fee_agreement_signed_by_name;

  return (
    <>
      <div className="group/toggle">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-md px-1 py-0.5 -mx-1 transition-colors',
                'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              )}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <AgreementStatusBadge status={currentStatus} size="sm" />
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover/toggle:opacity-100 transition-opacity" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {/* Send Email - available from not_started, expired, declined */}
            {(currentStatus === 'not_started' || currentStatus === 'expired' || currentStatus === 'declined') && (
              <DropdownMenuItem onClick={openSendEmailDialog} className="cursor-pointer">
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </DropdownMenuItem>
            )}

            {/* Mark Signed - available from sent, redlined, under_review */}
            {(currentStatus === 'sent' || currentStatus === 'redlined' || currentStatus === 'under_review') && (
              <>
                <DropdownMenuItem onClick={openSignedDialog} className="cursor-pointer">
                  <Check className="h-4 w-4 mr-2" />
                  Mark Signed
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openSendEmailDialog} className="cursor-pointer">
                  <Send className="h-4 w-4 mr-2" />
                  Resend Email
                </DropdownMenuItem>
              </>
            )}

            {/* Reset - always available except from not_started */}
            {currentStatus !== 'not_started' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleResetStatus}
                  className="cursor-pointer text-destructive"
                >
                  <X className="h-4 w-4 mr-2" />
                  Reset to Not Started
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hover metadata */}
        {currentStatus === 'signed' && (signedByNameValue || signedAt) && (
          <div className="max-h-0 opacity-0 group-hover/toggle:max-h-10 group-hover/toggle:opacity-100 group-hover/toggle:mt-1 transition-all duration-200 overflow-hidden">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 pl-0.5 whitespace-nowrap">
              {signedByNameValue && <span>{signedByNameValue}</span>}
              {signedByNameValue && signedAt && <span>&middot;</span>}
              {signedAt && <span>{new Date(signedAt).toLocaleDateString()}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Send Email Dialog */}
      <Dialog open={dialogMode === 'send_email'} onOpenChange={(open) => { if (!open) setDialogMode(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send {typeLabel} via Email</DialogTitle>
            <DialogDescription>
              Select a member or enter an email to send the {typeLabel.toLowerCase()} to.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <FirmSignerSelector
              members={effectiveMembers}
              onSelect={(userId, name) => {
                setRecipientName(name || '');
                // Find the email for this member
                if (userId) {
                  const member = effectiveMembers.find(m => m.user_id === userId);
                  if (member?.user) {
                    setRecipientEmail(member.user.email);
                  }
                } else if (name) {
                  const member = effectiveMembers.find(m => m.lead_name === name);
                  if (member?.lead_email) {
                    setRecipientEmail(member.lead_email);
                  }
                }
              }}
              label="Send to"
            />

            <div className="space-y-1.5">
              <Label className="text-xs">Recipient Email</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="bg-muted/50 border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>Will be sent from <strong>adam.haile@sourcecodeals.com</strong></span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSendEmail}
              disabled={sendingEmail || !recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)}
            >
              {sendingEmail ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Sending...</>
              ) : (
                <><Mail className="h-3.5 w-3.5 mr-2" /> Send Email</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Signed Dialog */}
      <Dialog open={dialogMode === 'signed'} onOpenChange={(open) => { if (!open) setDialogMode(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mark {typeLabel} as Signed</DialogTitle>
            <DialogDescription>
              Record who signed the {typeLabel.toLowerCase()} for {firm.primary_company_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <FirmSignerSelector
              members={effectiveMembers}
              onSelect={(userId, name) => {
                setSignedByUserId(userId);
                setSignedByName(name);
              }}
              label="Who signed?"
            />

            <div className="space-y-1.5">
              <Label className="text-xs">Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as AgreementSource)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Email (manual exchange)</SelectItem>
                  <SelectItem value="platform">Platform (e-signed)</SelectItem>
                  <SelectItem value="docusign">DocuSign</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Signed Document URL (optional)</Label>
              <Input
                placeholder="https://..."
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Custom Terms / Notes (optional)</Label>
              <Textarea
                placeholder="e.g., 15% fee instead of standard 20%"
                value={customTerms}
                onChange={(e) => setCustomTerms(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Expiration Date (optional)</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmSignedSubmit}
              disabled={updateStatus.isPending || (!signedByUserId && !signedByName)}
            >
              {updateStatus.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
