import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combobox } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Search,
  UserPlus,
  Building2,
  Globe,
  AlertTriangle,
} from 'lucide-react';
import { useCreatePortalOrg } from '@/hooks/portal/use-portal-organizations';
import { useInvitePortalUser } from '@/hooks/portal/use-portal-users';
import { toast } from 'sonner';

interface CreatePortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BUYER_TYPES = [
  { value: 'private_equity', label: 'PE Firm' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'independent_sponsor', label: 'Independent Sponsor' },
  { value: 'search_fund', label: 'Search Fund' },
  { value: 'individual_buyer', label: 'Individual' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface BuyerContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
}

export function CreatePortalDialog({ open, onOpenChange }: CreatePortalDialogProps) {
  const [tab, setTab] = useState<string>('existing');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('');

  // New buyer fields
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyWebsite, setNewCompanyWebsite] = useState('');
  const [newBuyerType, setNewBuyerType] = useState('');

  // Contact selection mode: 'existing' (pick from buyer contacts) or 'new' (enter manually)
  const [contactMode, setContactMode] = useState<'new' | 'existing'>('new');
  const [selectedContactId, setSelectedContactId] = useState<string>('');

  // New contact fields
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const createPortal = useCreatePortalOrg();
  const inviteUser = useInvitePortalUser();

  // ── Fetch buyers for combobox ──
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

  // ── Check for existing portal for selected buyer ──
  const { data: existingPortal } = useQuery({
    queryKey: ['portal-duplicate-check', selectedBuyerId],
    queryFn: async () => {
      if (!selectedBuyerId) return null;
      const { data, error } = await untypedFrom('portal_organizations')
        .select('id, name, portal_slug, status')
        .eq('buyer_id', selectedBuyerId)
        .is('deleted_at', null)
        .neq('status', 'archived')
        .maybeSingle();

      if (error) throw error;
      return data as { id: string; name: string; portal_slug: string; status: string } | null;
    },
    enabled: !!selectedBuyerId && open,
  });

  // ── Fetch existing contacts for selected buyer ──
  const { data: buyerContacts } = useQuery({
    queryKey: ['buyer-contacts-for-portal', selectedBuyerId],
    queryFn: async (): Promise<BuyerContact[]> => {
      if (!selectedBuyerId) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, title')
        .eq('remarketing_buyer_id', selectedBuyerId)
        .eq('contact_type', 'buyer')
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as BuyerContact[];
    },
    enabled: !!selectedBuyerId && open,
  });

  // Auto-switch contact mode when buyer has contacts
  useEffect(() => {
    if (buyerContacts && buyerContacts.length > 0) {
      setContactMode('existing');
      setSelectedContactId('');
    } else {
      setContactMode('new');
      setSelectedContactId('');
    }
  }, [buyerContacts]);

  // Reset contact mode when switching to new buyer tab
  useEffect(() => {
    if (tab === 'new') {
      setContactMode('new');
      setSelectedContactId('');
    }
  }, [tab]);

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

  const selectedContact = useMemo(() => {
    if (!selectedContactId || !buyerContacts) return null;
    return buyerContacts.find((c) => c.id === selectedContactId) || null;
  }, [selectedContactId, buyerContacts]);

  const resetForm = () => {
    setTab('existing');
    setSelectedBuyerId('');
    setNewCompanyName('');
    setNewCompanyWebsite('');
    setNewBuyerType('');
    setContactMode('new');
    setSelectedContactId('');
    setContactFirstName('');
    setContactLastName('');
    setContactEmail('');
  };

  // Derive contact info from either selected contact or manual fields
  const resolvedContact = useMemo(() => {
    if (contactMode === 'existing' && selectedContact) {
      return {
        id: selectedContact.id,
        firstName: selectedContact.first_name || '',
        lastName: selectedContact.last_name || '',
        email: selectedContact.email || '',
      };
    }
    return {
      id: undefined as string | undefined,
      firstName: contactFirstName.trim(),
      lastName: contactLastName.trim(),
      email: contactEmail.trim(),
    };
  }, [contactMode, selectedContact, contactFirstName, contactLastName, contactEmail]);

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

    // Block if duplicate portal exists
    if (isExisting && existingPortal) {
      toast.error('A portal already exists for this buyer. Open the existing portal instead.');
      return;
    }

    // Validate contact
    if (!resolvedContact.firstName) {
      toast.error('Contact first name is required');
      return;
    }
    if (!resolvedContact.email) {
      toast.error('Contact email is required');
      return;
    }
    if (!EMAIL_REGEX.test(resolvedContact.email)) {
      toast.error('Please enter a valid email address');
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
        // Create new buyer with buyer_type
        const website = newCompanyWebsite.trim() || null;
        const { data: newBuyer, error: buyerError } = await supabase
          .from('buyers')
          .insert({
            company_name: newCompanyName.trim(),
            company_website: website,
            ...(newBuyerType ? { buyer_type: newBuyerType } : {}),
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

      // Invite user via edge function (handles auth user creation, magic link, contact, portal_user)
      await inviteUser.mutateAsync({
        portal_org_id: portalData.id,
        portal_slug: slug,
        first_name: resolvedContact.firstName,
        last_name: resolvedContact.lastName || undefined,
        email: resolvedContact.email,
        role: 'primary_contact',
        buyer_id: buyerId,
        contact_id: resolvedContact.id,
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

  const hasContacts = buyerContacts && buyerContacts.length > 0;

  const canSubmit =
    !isSubmitting &&
    ((tab === 'existing' && !!selectedBuyerId && !existingPortal) ||
      (tab === 'new' && !!newCompanyName.trim())) &&
    !!resolvedContact.firstName &&
    !!resolvedContact.email;

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

              {/* Buyer preview */}
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

              {/* Duplicate portal warning */}
              {existingPortal && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Portal already exists</p>
                    <p className="text-amber-700 mt-0.5">
                      An active portal "{existingPortal.name}" already exists for this buyer.{' '}
                      <a
                        href={`/admin/client-portals/${existingPortal.portal_slug}`}
                        className="underline font-medium"
                      >
                        Open it instead
                      </a>
                    </p>
                  </div>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Website</Label>
                  <Input
                    value={newCompanyWebsite}
                    onChange={(e) => setNewCompanyWebsite(e.target.value)}
                    placeholder="https://alpineinvestors.com"
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

          {/* ─── Contact Person ─── */}
          <div className="border-t pt-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Contact Person
              </p>
              {tab === 'existing' && hasContacts && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={`text-xs font-medium ${contactMode === 'existing' ? 'text-foreground underline' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setContactMode('existing')}
                  >
                    Pick Existing
                  </button>
                  <button
                    type="button"
                    className={`text-xs font-medium ${contactMode === 'new' ? 'text-foreground underline' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => { setContactMode('new'); setSelectedContactId(''); }}
                  >
                    Add New
                  </button>
                </div>
              )}
            </div>

            {/* Existing contacts list */}
            {contactMode === 'existing' && hasContacts && (
              <div className="space-y-2">
                {buyerContacts!.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
                  const isSelected = selectedContactId === c.id;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => setSelectedContactId(isSelected ? '' : c.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{name}</span>
                          {c.title && (
                            <span className="text-xs text-muted-foreground">{c.title}</span>
                          )}
                        </div>
                        {c.email && (
                          <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
                {!selectedContactId && (
                  <p className="text-xs text-muted-foreground">Select a contact to invite to the portal.</p>
                )}
              </div>
            )}

            {/* New contact form */}
            {contactMode === 'new' && (
              <>
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
              </>
            )}
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
