import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, UserPlus, Search } from 'lucide-react';
import { invokeWithTimeout } from '@/lib/invoke-with-timeout';

interface AddBuyerToDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
}

const BUYER_TYPES = [
  { value: 'private_equity', label: 'PE Firm' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'independent_sponsor', label: 'Independent Sponsor' },
  { value: 'search_fund', label: 'Search Fund' },
  { value: 'individual_buyer', label: 'Individual' },
];

export function AddBuyerToDealDialog({
  open,
  onOpenChange,
  listingId,
  listingTitle,
}: AddBuyerToDealDialogProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>('existing');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');
  const [stageName, setStageName] = useState<string>('Qualified');

  // New buyer form state
  const [newBuyer, setNewBuyer] = useState({
    company_name: '',
    buyer_type: '',
    company_website: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    hq_state: '',
  });

  // Fetch existing remarketing buyers for the combobox
  const { data: buyers } = useQuery({
    queryKey: ['remarketing-buyers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select('id, company_name, buyer_type, pe_firm_name, hq_state')
        .eq('archived', false)
        .order('company_name');

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch deal stages for stage selection
  const { data: stages } = useQuery({
    queryKey: ['deal-stages-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_stages')
        .select('id, name, default_probability')
        .eq('is_active', true)
        .order('position');

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const buyerOptions = useMemo(() => {
    if (!buyers) return [];
    return buyers.map((b) => {
      const label = b.buyer_type
        ? `${b.company_name} (${b.buyer_type.replace(/_/g, ' ')})`
        : b.company_name;

      const descParts: string[] = [];
      if (b.pe_firm_name) descParts.push(`PE Firm: ${b.pe_firm_name}`);
      if (b.hq_state) descParts.push(b.hq_state);
      const description = descParts.length > 0 ? descParts.join(' · ') : undefined;

      return {
        value: b.id,
        label,
        description,
        searchTerms: [b.company_name, b.buyer_type?.replace(/_/g, ' '), b.pe_firm_name, b.hq_state]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      };
    });
  }, [buyers]);

  // Mutation: add existing buyer to deal via edge function
  const addExistingBuyerMutation = useMutation({
    mutationFn: async ({ buyerId, stage }: { buyerId: string; stage: string }) => {
      const { data, error } = await invokeWithTimeout<{
        success?: boolean;
        error?: string;
        already_exists?: boolean;
        deal_id?: string;
        deal_title?: string;
      }>('convert-to-pipeline-deal', {
        body: {
          listing_id: listingId,
          buyer_id: buyerId,
          stage_name: stage,
        },
        timeoutMs: 30_000,
      });

      if (error) throw error;
      if (data?.already_exists) {
        throw new Error(
          `This buyer already has a pipeline deal for this listing: "${data.deal_title}"`,
        );
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        data?.deal_title
          ? `Added "${data.deal_title}" to pipeline`
          : 'Buyer added to deal pipeline',
      );
      invalidateAndClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add buyer to deal');
    },
  });

  // Mutation: create new buyer then add to deal
  const createAndAddBuyerMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the remarketing buyer
      const { data: createdBuyer, error: buyerError } = await supabase
        .from('buyers')
        .insert({
          company_name: newBuyer.company_name.trim(),
          buyer_type: newBuyer.buyer_type || null,
          company_website: newBuyer.company_website.trim() || null,
          hq_state: newBuyer.hq_state.trim() || null,
        })
        .select('id')
        .single();

      if (buyerError) throw buyerError;

      // 2. Create a contact for the buyer if we have contact info
      if (newBuyer.contact_name.trim() || newBuyer.contact_email.trim()) {
        const nameParts = (newBuyer.contact_name.trim() || 'Unknown').split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        await (supabase.rpc as any)('contacts_upsert', {
          p_identity: { email: newBuyer.contact_email.trim() || null },
          p_fields: {
            remarketing_buyer_id: createdBuyer.id,
            first_name: firstName,
            last_name: lastName,
            email: newBuyer.contact_email.trim() || null,
            phone: newBuyer.contact_phone.trim() || null,
            contact_type: 'buyer',
            is_primary_at_firm: true,
          },
          p_source: 'manual_deal_add',
          p_enrichment: null,
        });
      }

      // 3. Create the pipeline deal via edge function
      const { data, error } = await invokeWithTimeout<{
        success?: boolean;
        error?: string;
        deal_id?: string;
        deal_title?: string;
      }>('convert-to-pipeline-deal', {
        body: {
          listing_id: listingId,
          buyer_id: createdBuyer.id,
          stage_name: stageName,
        },
        timeoutMs: 30_000,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { ...data, buyerId: createdBuyer.id };
    },
    onSuccess: () => {
      toast.success(`Created buyer "${newBuyer.company_name}" and added to pipeline`);
      invalidateAndClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create buyer and add to deal');
    },
  });

  const invalidateAndClose = () => {
    queryClient.invalidateQueries({ queryKey: ['deal-pipeline', listingId] });
    queryClient.invalidateQueries({
      queryKey: ['deal-buyer-history', listingId],
    });
    queryClient.invalidateQueries({ queryKey: ['deals'] });
    queryClient.invalidateQueries({
      queryKey: ['remarketing', 'pipeline', listingId],
    });
    queryClient.invalidateQueries({ queryKey: ['remarketing-buyers-list'] });
    resetAndClose();
  };

  const resetAndClose = () => {
    setSelectedBuyerId('');
    setStageName('Qualified');
    setTab('existing');
    setNewBuyer({
      company_name: '',
      buyer_type: '',
      company_website: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      hq_state: '',
    });
    onOpenChange(false);
  };

  const handleSubmitExisting = () => {
    if (!selectedBuyerId) {
      toast.error('Please select a buyer');
      return;
    }
    addExistingBuyerMutation.mutate({
      buyerId: selectedBuyerId,
      stage: stageName,
    });
  };

  const handleSubmitNew = () => {
    if (!newBuyer.company_name.trim()) {
      toast.error('Company name is required');
      return;
    }
    createAndAddBuyerMutation.mutate();
  };

  const isSubmitting = addExistingBuyerMutation.isPending || createAndAddBuyerMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Buyer to Deal
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{listingTitle}</p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing" className="text-sm">
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Existing Buyer
            </TabsTrigger>
            <TabsTrigger value="new" className="text-sm">
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              New Buyer
            </TabsTrigger>
          </TabsList>

          {/* Existing Buyer Tab */}
          <TabsContent value="existing" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Search Buyer Universe</Label>
              <Combobox
                options={buyerOptions}
                value={selectedBuyerId}
                onValueChange={setSelectedBuyerId}
                placeholder="Search by company name..."
                searchPlaceholder="Type to search buyers..."
                emptyText="No buyers found. Try the 'New Buyer' tab."
              />
            </div>

            <div className="space-y-2">
              <Label>Pipeline Stage</Label>
              <Select value={stageName} onValueChange={setStageName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages?.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* New Buyer Tab */}
          <TabsContent value="new" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>
                Company Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={newBuyer.company_name}
                onChange={(e) => setNewBuyer((p) => ({ ...p, company_name: e.target.value }))}
                placeholder="e.g. Acme Holdings"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Buyer Type</Label>
                <Select
                  value={newBuyer.buyer_type}
                  onValueChange={(v) => setNewBuyer((p) => ({ ...p, buyer_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUYER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>HQ State</Label>
                <Input
                  value={newBuyer.hq_state}
                  onChange={(e) => setNewBuyer((p) => ({ ...p, hq_state: e.target.value }))}
                  placeholder="e.g. TX"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Company Website</Label>
              <Input
                value={newBuyer.company_website}
                onChange={(e) =>
                  setNewBuyer((p) => ({
                    ...p,
                    company_website: e.target.value,
                  }))
                }
                placeholder="e.g. https://acmeholdings.com"
              />
            </div>

            <div className="border-t pt-4 mt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Primary Contact (optional)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={newBuyer.contact_name}
                    onChange={(e) =>
                      setNewBuyer((p) => ({
                        ...p,
                        contact_name: e.target.value,
                      }))
                    }
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <Input
                    type="email"
                    value={newBuyer.contact_email}
                    onChange={(e) =>
                      setNewBuyer((p) => ({
                        ...p,
                        contact_email: e.target.value,
                      }))
                    }
                    placeholder="john@acme.com"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>Contact Phone</Label>
                <Input
                  value={newBuyer.contact_phone}
                  onChange={(e) =>
                    setNewBuyer((p) => ({
                      ...p,
                      contact_phone: e.target.value,
                    }))
                  }
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pipeline Stage</Label>
              <Select value={stageName} onValueChange={setStageName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages?.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={tab === 'existing' ? handleSubmitExisting : handleSubmitNew}
            disabled={
              isSubmitting ||
              (tab === 'existing' && !selectedBuyerId) ||
              (tab === 'new' && !newBuyer.company_name.trim())
            }
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tab === 'existing' ? 'Add Buyer to Deal' : 'Create & Add to Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
