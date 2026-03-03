import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, UserPlus, Search, Building2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface AddBuyerIntroductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
}

const BUYER_TYPES = [
  { value: 'private_equity', label: 'Private Equity Firm' },
  { value: 'corporate', label: 'Corporate / Strategic' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'search_fund', label: 'Search Fund' },
  { value: 'independent_sponsor', label: 'Independent Sponsor' },
  { value: 'individual_buyer', label: 'Individual / Wealth Buyer' },
];

export function AddBuyerIntroductionDialog({
  open,
  onOpenChange,
  listingId,
  listingTitle,
}: AddBuyerIntroductionDialogProps) {
  const { createIntroduction, isCreating } = useBuyerIntroductions(listingId);
  const [tab, setTab] = useState<string>('existing');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');

  // New buyer form
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('');
  const [newBuyerType, setNewBuyerType] = useState('');

  // Contact info (shared between existing and new buyer flows)
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Deal details
  const [targetingReason, setTargetingReason] = useState('');

  // Fetch existing remarketing buyers for the combobox
  const { data: buyers } = useQuery({
    queryKey: ['remarketing-buyers-intro-search'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_buyers')
        .select('id, company_name, company_website, buyer_type, pe_firm_name, hq_state, hq_city')
        .eq('archived', false)
        .order('company_name');

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const buyerOptions = useMemo(() => {
    if (!buyers) return [];
    return buyers.map((b) => {
      const parts = [b.company_name];
      if (b.buyer_type) parts.push(`(${b.buyer_type.replace(/_/g, ' ')})`);
      if (b.pe_firm_name) parts.push(`— ${b.pe_firm_name}`);
      if (b.hq_city && b.hq_state) parts.push(`[${b.hq_city}, ${b.hq_state}]`);
      else if (b.hq_state) parts.push(`[${b.hq_state}]`);
      return {
        value: b.id,
        label: parts.join(' '),
        searchTerms: [b.company_name, b.buyer_type, b.pe_firm_name, b.hq_state, b.company_website]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      };
    });
  }, [buyers]);

  // Get selected buyer details for preview
  const selectedBuyer = useMemo(() => {
    if (!selectedBuyerId || !buyers) return null;
    return buyers.find((b) => b.id === selectedBuyerId) || null;
  }, [selectedBuyerId, buyers]);

  const handleSubmit = () => {
    const isExisting = tab === 'existing';

    const buyerName =
      contactFirstName.trim() && contactLastName.trim()
        ? `${contactFirstName.trim()} ${contactLastName.trim()}`
        : contactFirstName.trim() || contactLastName.trim() || '';

    let firmName = '';
    if (isExisting) {
      if (!selectedBuyerId || !selectedBuyer) {
        toast.error('Please select a buyer');
        return;
      }
      firmName = selectedBuyer.company_name;
    } else {
      if (!newCompanyName.trim()) {
        toast.error('Company name is required');
        return;
      }
      firmName = newCompanyName.trim();
    }

    if (!buyerName) {
      toast.error('Contact first name is required');
      return;
    }

    createIntroduction(
      {
        buyer_name: buyerName,
        buyer_firm_name: firmName,
        buyer_email: contactEmail.trim() || undefined,
        buyer_linkedin_url: isExisting
          ? selectedBuyer?.company_website || undefined
          : newCompanyWebsite.trim() || undefined,
        targeting_reason: targetingReason.trim() || undefined,
        listing_id: listingId,
        company_name: listingTitle,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  };

  const resetForm = () => {
    setTab('existing');
    setSelectedBuyerId('');
    setNewCompanyName('');
    setNewCompanyWebsite('');
    setNewBuyerType('');
    setContactFirstName('');
    setContactLastName('');
    setContactEmail('');
    setTargetingReason('');
  };

  const handleClose = () => {
    if (!isCreating) {
      resetForm();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isCreating && onOpenChange(v)}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Buyer to Introduction Pipeline
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

          {/* ─── Existing Buyer Tab ─── */}
          <TabsContent value="existing" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>
                Search Buyers <span className="text-destructive">*</span>
              </Label>
              <Combobox
                options={buyerOptions}
                value={selectedBuyerId}
                onValueChange={setSelectedBuyerId}
                placeholder="Search by company name..."
                searchPlaceholder="Type to search buyers..."
                emptyText="No buyers found. Try the 'New Buyer' tab."
              />
            </div>

            {/* Selected Buyer Preview */}
            {selectedBuyer && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{selectedBuyer.company_name}</span>
                  {selectedBuyer.buyer_type && (
                    <Badge variant="outline" className="text-xs">
                      {selectedBuyer.buyer_type.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                {selectedBuyer.company_website && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    {selectedBuyer.company_website}
                  </div>
                )}
                {(selectedBuyer.hq_city || selectedBuyer.hq_state) && (
                  <p className="text-xs text-muted-foreground">
                    {[selectedBuyer.hq_city, selectedBuyer.hq_state].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ─── New Buyer Tab ─── */}
          <TabsContent value="new" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>
                Company Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="e.g. O2 Investment Partners"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Website</Label>
                <Input
                  value={newCompanyWebsite}
                  onChange={(e) => setNewCompanyWebsite(e.target.value)}
                  placeholder="https://o2partners.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Buyer Type</Label>
                <Select value={newBuyerType} onValueChange={setNewBuyerType}>
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
            </div>
          </TabsContent>
        </Tabs>

        {/* ─── Contact Info (shared) ─── */}
        <div className="border-t pt-4 mt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Contact Person
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={contactFirstName}
                onChange={(e) => setContactFirstName(e.target.value)}
                placeholder="James"
              />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input
                value={contactLastName}
                onChange={(e) => setContactLastName(e.target.value)}
                placeholder="Chen"
              />
            </div>
          </div>
          <div className="space-y-2 mt-4">
            <Label>Email</Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="james@o2partners.com"
            />
          </div>
        </div>

        {/* ─── Targeting Reason ─── */}
        <div className="border-t pt-4 mt-2">
          <div className="space-y-2">
            <Label>Targeting Reason</Label>
            <Textarea
              value={targetingReason}
              onChange={(e) => setTargetingReason(e.target.value)}
              placeholder="e.g. Strategic fit - PE firm with tech focus"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isCreating ||
              (tab === 'existing' && !selectedBuyerId) ||
              (tab === 'new' && !newCompanyName.trim()) ||
              !contactFirstName.trim()
            }
          >
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add to Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
