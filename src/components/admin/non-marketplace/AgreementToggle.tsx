import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { NonMarketplaceUser } from '@/types/non-marketplace-user';

interface AgreementToggleProps {
  user: NonMarketplaceUser;
  type: 'nda' | 'fee';
  checked: boolean;
}

export const AgreementToggle = ({ user, type, checked }: AgreementToggleProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedSignerId, setSelectedSignerId] = useState<string>('');
  const [firmMembers, setFirmMembers] = useState<
    { id: string; first_name: string | null; last_name: string | null; email: string }[]
  >([]);
  const [signerName, setSignerName] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  // Fetch signer information if agreement is signed
  useEffect(() => {
    const fetchSignerInfo = async () => {
      if (!checked) {
        setSignerName(null);
        setSignedAt(null);
        return;
      }

      try {
        // Get the first associated record to find signer info
        let signerId: string | null = null;
        let signingDate: string | null = null;

        if (user.associated_records.connection_requests.length > 0) {
          const cr = user.associated_records.connection_requests[0];
          signerId = (type === 'nda' ? cr.lead_nda_signed_by : cr.lead_fee_agreement_signed_by) as
            | string
            | null;
          signingDate = (
            type === 'nda' ? cr.lead_nda_signed_at : cr.lead_fee_agreement_signed_at
          ) as string | null;
        } else if (user.associated_records.deals.length > 0) {
          const deal = user.associated_records.deals[0];
          signingDate = deal.created_at as string | null;
        }

        if (signerId) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', signerId)
            .single();
          if (profileError) throw profileError;

          if (profile) {
            const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
            setSignerName(fullName || 'Unknown');
          }
        }

        if (signingDate) {
          setSignedAt(signingDate);
        }
      } catch (error) {
        console.error('Error fetching signer info:', error);
      }
    };

    fetchSignerInfo();
  }, [checked, user, type]);

  const updateMutation = useMutation({
    mutationFn: async ({ isSigned, signerId }: { isSigned: boolean; signerId?: string }) => {
      if (user.firm_id) {
        // Update at firm level
        const rpcName =
          type === 'nda' ? 'update_nda_firm_status' : 'update_fee_agreement_firm_status';
        const { error } = await supabase.rpc(rpcName, {
          p_firm_id: user.firm_id,
          p_is_signed: isSigned,
          p_signed_by_user_id: isSigned ? (signerId ?? undefined) : undefined,
          p_signed_at: isSigned ? new Date().toISOString() : undefined,
        });
        if (error) throw error;
      } else {
        // Update individual records
        const updates: Record<string, boolean | string | null> = {};

        if (type === 'nda') {
          updates.lead_nda_signed = isSigned;
          updates.lead_nda_signed_at = isSigned ? new Date().toISOString() : null;
          updates.lead_nda_signed_by = isSigned ? (signerId ?? null) : null;
        } else {
          updates.lead_fee_agreement_signed = isSigned;
          updates.lead_fee_agreement_signed_at = isSigned ? new Date().toISOString() : null;
          updates.lead_fee_agreement_signed_by = isSigned ? (signerId ?? null) : null;
        }

        // Update connection requests
        if (user.associated_records.connection_requests.length > 0) {
          const { error } = await supabase
            .from('connection_requests')
            .update(updates)
            .eq('lead_email', user.email);
          if (error) throw error;
        }

        // Update deals
        if (user.associated_records.deals.length > 0) {
          const dealUpdates =
            type === 'nda'
              ? { nda_status: isSigned ? 'signed' : 'not_sent' }
              : { fee_agreement_status: isSigned ? 'signed' : 'not_sent' };

          const { error } = await supabase
            .from('deal_pipeline')
            .update(dealUpdates)
            .in('id', user.associated_records.deals.map((d) => d.id) as string[]);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'non-marketplace-users'] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast({
        title: `${type.toUpperCase()} ${checked ? 'unsigned' : 'signed'}`,
        description: `Successfully updated ${type.toUpperCase()} status`,
      });
      setShowDialog(false);
      setSelectedSignerId('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleToggle = async (newChecked: boolean) => {
    if (!newChecked) {
      // Unchecking - no dialog needed
      updateMutation.mutate({ isSigned: false });
      return;
    }

    // Checking - need to select signer if firm exists
    if (user.firm_id) {
      // Fetch firm members
      const { data: members, error: membersError } = await supabase
        .from('firm_members')
        .select('user_id, profiles(id, first_name, last_name)')
        .eq('firm_id', user.firm_id)
        .not('user_id', 'is', null);
      if (membersError) throw membersError;

      if (members && members.length > 0) {
        setFirmMembers(
          members.map((m) => ({
            id: m.user_id || '',
            first_name: (m.profiles as { first_name?: string } | null)?.first_name ?? null,
            last_name: (m.profiles as { last_name?: string } | null)?.last_name ?? null,
            email: '',
          })),
        );
        setShowDialog(true);
        return;
      }
    }

    // No firm or no members - mark as signed without signer
    updateMutation.mutate({ isSigned: true });
  };

  const confirmUpdate = () => {
    updateMutation.mutate({ isSigned: true, signerId: selectedSignerId || undefined });
  };

  return (
    <>
      <div className="group/toggle">
        {/* Toggle + Status Badge */}
        <div className="flex items-center gap-2">
          <Switch
            checked={checked}
            onCheckedChange={handleToggle}
            disabled={updateMutation.isPending}
            className="data-[state=checked]:bg-emerald-600"
          />
          {checked ? (
            <Badge
              variant="outline"
              className="h-5 px-2 border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-medium text-[11px]"
            >
              <Check className="h-2.5 w-2.5 mr-1" />
              {type.toUpperCase()}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="h-5 px-2 border-border/40 bg-muted/30 text-muted-foreground font-medium text-[11px]"
            >
              <X className="h-2.5 w-2.5 mr-1" />
              {type.toUpperCase()}
            </Badge>
          )}
        </div>

        {/* Metadata - Ultra subtle, show on hover, only takes space when visible */}
        {checked && (signerName || signedAt) && (
          <div className="max-h-0 opacity-0 group-hover/toggle:max-h-10 group-hover/toggle:opacity-100 group-hover/toggle:mt-1.5 transition-all duration-200 overflow-hidden">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 pl-0.5 whitespace-nowrap">
              {signerName && <span>{signerName}</span>}
              {signerName && signedAt && <span>•</span>}
              {signedAt && (
                <span>{formatDistanceToNow(new Date(signedAt), { addSuffix: true })}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Signer</DialogTitle>
            <DialogDescription>
              Who signed this {type.toUpperCase()} for {user.firm_name || user.company}?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select value={selectedSignerId} onValueChange={setSelectedSignerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a signer..." />
              </SelectTrigger>
              <SelectContent>
                {firmMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {`${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmUpdate} disabled={!selectedSignerId}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
