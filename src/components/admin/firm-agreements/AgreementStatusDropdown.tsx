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
import { AgreementStatusBadge, STATUS_CONFIG } from './AgreementStatusBadge';
import { FirmSignerSelector } from './FirmSignerSelector';
import {
  useUpdateAgreementStatus,
  type FirmAgreement,
  type FirmMember,
  type AgreementStatus,
  type AgreementSource,
} from '@/hooks/admin/use-firm-agreements';
import {
  ChevronDown, X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// Define valid transitions per status
const VALID_TRANSITIONS: Record<AgreementStatus, AgreementStatus[]> = {
  not_started: ['sent'],
  sent: ['signed', 'redlined', 'declined'],
  redlined: ['under_review', 'declined'],
  under_review: ['signed', 'declined'],
  signed: ['sent', 'expired'],
  expired: ['sent'],
  declined: ['sent'],
};

interface AgreementStatusDropdownProps {
  firm: FirmAgreement;
  members: FirmMember[];
  agreementType: 'nda' | 'fee_agreement';
}

export function AgreementStatusDropdown({ firm, members, agreementType }: AgreementStatusDropdownProps) {
  const updateStatus = useUpdateAgreementStatus();

  const currentStatus = (agreementType === 'nda' ? firm.nda_status : firm.fee_agreement_status) as AgreementStatus;
  const validNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

  // Dialog state for statuses that need extra info
  const [dialogStatus, setDialogStatus] = useState<AgreementStatus | null>(null);
  const [signedByUserId, setSignedByUserId] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [redlineNotes, setRedlineNotes] = useState('');
  const [customTerms, setCustomTerms] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [source, setSource] = useState<AgreementSource>('platform');

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

  const handleStatusSelect = async (newStatus: AgreementStatus) => {
    // Statuses that need a dialog for additional info
    if (newStatus === 'signed' || newStatus === 'redlined') {
      setDialogStatus(newStatus);
      setSignedByUserId(null);
      setSignedByName(null);
      setDocumentUrl('');
      setRedlineNotes('');
      setCustomTerms('');
      setExpiresAt('');
      setSource('platform');
      await ensureMembers();
      return;
    }

    // Simple transitions — just update
    try {
      await updateStatus.mutateAsync({
        firmId: firm.id,
        agreementType,
        newStatus,
      });
    } catch {
      // Error handled by mutation
    }
  };

  const confirmDialogSubmit = async () => {
    if (!dialogStatus) return;

    try {
      await updateStatus.mutateAsync({
        firmId: firm.id,
        agreementType,
        newStatus: dialogStatus,
        signedByUserId,
        signedByName,
        documentUrl: documentUrl || undefined,
        redlineNotes: redlineNotes || undefined,
        customTerms: customTerms || undefined,
        expiresAt: expiresAt || undefined,
        source,
      });
      setDialogStatus(null);
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
          <DropdownMenuContent align="start" className="w-48">
            {validNextStatuses.length > 0 ? (
              validNextStatuses.map((status) => {
                const config = STATUS_CONFIG[status];
                const Icon = config.icon;
                return (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => handleStatusSelect(status)}
                    className="cursor-pointer"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {config.label}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                No transitions available
              </DropdownMenuItem>
            )}
            {currentStatus !== 'not_started' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleStatusSelect('not_started')}
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

      {/* Dialog for Signed / Redlined transitions */}
      <Dialog open={dialogStatus !== null} onOpenChange={(open) => { if (!open) setDialogStatus(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogStatus === 'signed' ? `Mark ${typeLabel} as Signed` : `Mark ${typeLabel} as Redlined`}
            </DialogTitle>
            <DialogDescription>
              {dialogStatus === 'signed'
                ? `Record who signed the ${typeLabel.toLowerCase()} for ${firm.primary_company_name}`
                : `Record the redlined version details for ${firm.primary_company_name}`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {dialogStatus === 'signed' && (
              <>
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
                      <SelectItem value="platform">Platform (e-signed)</SelectItem>
                      <SelectItem value="manual">Manual (uploaded PDF)</SelectItem>
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
              </>
            )}

            {dialogStatus === 'redlined' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Redline Notes</Label>
                  <Textarea
                    placeholder="Describe the changes requested..."
                    value={redlineNotes}
                    onChange={(e) => setRedlineNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Redlined Document URL (optional)</Label>
                  <Input
                    placeholder="https://..."
                    value={documentUrl}
                    onChange={(e) => setDocumentUrl(e.target.value)}
                    className="h-9"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setDialogStatus(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmDialogSubmit}
              disabled={
                updateStatus.isPending ||
                (dialogStatus === 'signed' && !signedByUserId && !signedByName)
              }
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
