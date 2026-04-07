import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combobox } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, UserPlus, Building2, Globe } from 'lucide-react';
import { useCreatePortalOrg } from '@/hooks/portal/use-portal-organizations';
import { useInvitePortalUser } from '@/hooks/portal/use-portal-users';
import { toast } from 'sonner';

interface CreatePortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CreatePortalDialog({ open, onOpenChange }: CreatePortalDialogProps) {
  const [tab, setTab] = useState<string>('existing');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');

  // New buyer fields
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('');

  // Contact fields
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const createPortal = useCreatePortalOrg();
  const inviteUser = useInvitePortalUser();

  // Fetch buyers for combobox
  const { data: buyers } = useQuery({
    queryKey: ['buyers-portal-search'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyers')
        .select('id, company_name, company_website, buyer_type, pe_firm_name, hq_state, hq_city')
        .eq('archived', false)
        .order('company_name')
        .limit(5000);

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const buyerOptions = useMemo(() => {
    if (!buyers) return [];
    return buyers.map((b) => {
      const typeParts: string[] = [];
      if (b.buyer_type) typeParts.push(b.buyer_type.replace(/_/g, ' '));
      const label =
        typeParts.length > 0 ? `${b.company_name} (${typeParts.join(' · ')})` : b.company_name;

      const descParts: string[] = [];
      if (b.pe_firm_name) descParts.push(`PE Firm: ${b.pe_firm_name}`);
      if (b.hq_city && b.hq_state) descParts.push(`${b.hq_city}, ${b.hq_state}`);
      else if (b.hq_state) descParts.push(b.hq_state);
      const description = descParts.length > 0 ? descParts.join(' · ') : undefined;

      return {
        value: b.id,
        label,
        description,
        searchTerms: [
          b.company_name,
          b.buyer_type?.replace(/_/g, ' '),
          b.pe_firm_name,
          b.hq_state,
          b.hq_city,
          b.company_website,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      };
    });
  }, [buyers]);

  const selectedBuyer = useMemo(() => {
    if (!selectedBuyerId || !buyers) return null;
    return buyers.find((b) => b.id === selectedBuyerId) || null;
  }, [selectedBuyerId, buyers]);

  const resetForm = () => {
    setTab('existing');
    setSelectedBuyerId('');
    setNewCompanyName('');
    setNewCompanyWebsite('');
    setContactFirstName('');
    setContactLastName('');
    setContactEmail('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isExisting = tab === 'existing';

    // Validate buyer
    if (isExisting && !selectedBuyerId) {
      toast.error('Please select a buyer');
      return;
    }
    if (!isExisting && !newCompanyName.trim()) {
      toast.error('Company name is required');
      return;
    }

    // Validate contact
    if (!contactFirstName.trim()) {
      toast.error('Contact first name is required');
      return;
    }
    if (!contactEmail.trim()) {
      toast.error('Contact email is required');
      return;
    }

    setIsSubmitting(true);

    try {
      let buyerId: string | undefined;
      let portalName: string;

      if (isExisting) {
        buyerId = selectedBuyerId;
        portalName = selectedBuyer!.company_name;
      } else {
        // Create new buyer
        const website = newCompanyWebsite.trim() || null;
        const { data: newBuyer, error: buyerError } = await supabase
          .from('buyers')
          .insert({
            company_name: newCompanyName.trim(),
            company_website: website,
          })
          .select('id')
          .single();

        if (buyerError) throw buyerError;
        buyerId = newBuyer.id;
        portalName = newCompanyName.trim();
      }

      const slug = slugify(portalName);

      // Create portal organization linked to buyer
      const portalData = await createPortal.mutateAsync({
        name: portalName,
        buyer_id: buyerId,
        portal_slug: slug,
      });

      // Create contact record
      const email = contactEmail.trim();
      const firstName = contactFirstName.trim();
      const lastName = contactLastName.trim();
      const contactName = lastName ? `${firstName} ${lastName}` : firstName;

      let contactId: string | undefined;
      try {
        const { data: newContact } = await supabase
          .from('contacts')
          .insert({
            first_name: firstName,
            last_name: lastName,
            email,
            company_name: portalName,
            contact_type: 'buyer' as const,
            source: 'portal',
            remarketing_buyer_id: buyerId || null,
          })
          .select('id')
          .single();
        if (newContact) contactId = newContact.id;
      } catch {
        // Non-fatal — contact may already exist (duplicate email)
      }

      // Invite as portal user (primary contact)
      await inviteUser.mutateAsync({
        portal_org_id: portalData.id,
        contact_id: contactId || null,
        role: 'primary_contact',
        email,
        name: contactName,
      });

      resetForm();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create portal';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !isSubmitting &&
    ((tab === 'existing' && !!selectedBuyerId) || (tab === 'new' && !!newCompanyName.trim())) &&
    !!contactFirstName.trim() &&
    !!contactEmail.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        onPointerDownOutside={(e) => isSubmitting && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create Client Portal</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ─── Buyer Selection ─── */}
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
                  placeholder="Search buyers"
                  searchPlaceholder="Search by name, type, location..."
                  emptyText="No buyers found. Try the 'New Buyer' tab."
                />
              </div>

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
                  placeholder="e.g. Alpine Investors"
                />
              </div>
              <div className="space-y-2">
                <Label>Company Website</Label>
                <Input
                  value={newCompanyWebsite}
                  onChange={(e) => setNewCompanyWebsite(e.target.value)}
                  placeholder="https://alpineinvestors.com"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* ─── Contact Person ─── */}
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
              <Label>
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="james@alpineinvestors.com"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => { resetForm(); onOpenChange(false); }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSubmitting ? 'Creating...' : 'Create Portal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
