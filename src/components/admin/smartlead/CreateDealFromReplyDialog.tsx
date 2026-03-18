import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLinkInboxToDeal } from '@/hooks/smartlead/use-smartlead-inbox';
import { supabase } from '@/integrations/supabase/client';

interface CreateDealFromReplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inboxItem: Record<string, unknown>;
}

const REMARKETING_LIST_OPTIONS = [
  { value: 'captarget', label: 'CapTarget Deals' },
  { value: 'gp_partners', label: 'GP Partner Deals' },
  { value: 'sourceco', label: 'SourceCo Deals' },
];


export function CreateDealFromReplyDialog({
  open,
  onOpenChange,
  inboxItem: item,
}: CreateDealFromReplyDialogProps) {
  const linkToDeal = useLinkInboxToDeal();

  // Use enriched fields first, fall back to legacy derivation
  const enrichedFirstName = String(item.lead_first_name || '').trim();
  const enrichedLastName = String(item.lead_last_name || '').trim();
  const enrichedFullName = [enrichedFirstName, enrichedLastName].filter(Boolean).join(' ');
  const contactName = enrichedFullName || String(item.to_name || '').trim();
  const campaignName = String(item.campaign_name || '').trim();
  const subject = String(item.subject || '').trim();
  
  const leadEmail = String(item.to_email || item.sl_lead_email || '').trim();

  // Enriched fields from Smartlead API
  const enrichedCompany = String(item.lead_company_name || '').trim();
  const enrichedPhone = String(item.lead_phone || '').trim();
  const enrichedMobile = String(item.lead_mobile || '').trim();
  const enrichedWebsite = String(item.lead_website || '').trim();
  const enrichedLinkedIn = String(item.lead_linkedin_url || '').trim();
  const enrichedTitle = String(item.lead_title || '').trim();
  const enrichedIndustry = String(item.lead_industry || '').trim();

  // Extract company name from email domain as fallback
  function companyFromEmail(email: string): string {
    if (!email || !email.includes('@')) return '';
    const domain = email.split('@')[1]?.split('.')[0] || '';
    if (['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'icloud', 'mail', 'protonmail'].includes(domain.toLowerCase())) return '';
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  const derivedCompany = enrichedCompany || companyFromEmail(leadEmail);
  const derivedPhone = enrichedPhone || enrichedMobile;

  const defaultTitle = contactName
    ? `${contactName}${campaignName ? ` – ${campaignName}` : ''}`
    : subject || campaignName || 'SmartLead Response';

  const defaultDescription = [
    subject ? `Subject: ${subject}` : null,
    campaignName ? `Campaign: ${campaignName}` : null,
    enrichedTitle ? `Title: ${enrichedTitle}` : null,
    enrichedIndustry ? `Industry: ${enrichedIndustry}` : null,
    item.ai_reasoning ? `AI Summary: ${String(item.ai_reasoning)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Form state
  const [title, setTitle] = useState(defaultTitle);
  const [contactNameField, setContactNameField] = useState(contactName);
  const [contactEmail, setContactEmail] = useState(leadEmail);
  const [contactCompany, setContactCompany] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactWebsite, setContactWebsite] = useState('');
  const [contactLinkedIn, setContactLinkedIn] = useState('');
  const [contactIndustry, setContactIndustry] = useState('');
  const [description, setDescription] = useState(defaultDescription);
  const [dealSource, setDealSource] = useState('captarget');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setContactNameField(contactName);
      setContactEmail(leadEmail);
      setContactCompany(derivedCompany);
      setContactPhone(derivedPhone);
      setContactWebsite(enrichedWebsite);
      setContactLinkedIn(enrichedLinkedIn);
      setDescription(defaultDescription);
      setDealSource('captarget');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!dealSource) {
      toast.error('Please select a remarketing list');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: newListing, error: listingError } = await supabase
        .from('listings')
        .insert({
          title: title.trim(),
          internal_company_name: contactCompany.trim() || title.trim(),
          website: contactWebsite.trim() || null,
          main_contact_name: contactNameField.trim() || null,
          main_contact_email: contactEmail.trim() || null,
          main_contact_phone: contactPhone.trim() || null,
          main_contact_linkedin: contactLinkedIn.trim() || null,
          description: description.trim() || null,
          deal_source: dealSource,
          status: 'active',
          is_internal_deal: true,
          pushed_to_all_deals: false,
        } as never)
        .select('id')
        .single();

      if (listingError) throw listingError;

      if (newListing?.id) {
        linkToDeal.mutate(
          { id: String(item.id), dealId: newListing.id },
          {
            onSuccess: () => {
              toast.success(`Lead added to ${REMARKETING_LIST_OPTIONS.find(o => o.value === dealSource)?.label}`);
              setIsSubmitting(false);
              onOpenChange(false);
            },
            onError: () => {
              toast.success(`Lead created but failed to link to inbox item`);
              setIsSubmitting(false);
              onOpenChange(false);
            },
          },
        );
      }
    } catch (err) {
      toast.error(`Failed to create lead: ${(err as Error).message}`);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Lead from Reply</DialogTitle>
          <DialogDescription>
            Review and edit the pre-filled fields. This will add the lead to the selected remarketing list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="deal-title">Lead Title *</Label>
            <Input
              id="deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lead title"
            />
          </div>

          {/* Remarketing List */}
          <div className="space-y-1.5">
            <Label>Remarketing List *</Label>
            <Select value={dealSource} onValueChange={setDealSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select list" />
              </SelectTrigger>
              <SelectContent>
                {REMARKETING_LIST_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contact fields */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Contact Info
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="contact-name" className="text-xs">Name</Label>
                <Input
                  id="contact-name"
                  value={contactNameField}
                  onChange={(e) => setContactNameField(e.target.value)}
                  placeholder="Contact name"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-email" className="text-xs">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-company" className="text-xs">Company</Label>
                <Input
                  id="contact-company"
                  value={contactCompany}
                  onChange={(e) => setContactCompany(e.target.value)}
                  placeholder="Company"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-phone" className="text-xs">Phone</Label>
                <Input
                  id="contact-phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Phone"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-website" className="text-xs">Website</Label>
                <Input
                  id="contact-website"
                  value={contactWebsite}
                  onChange={(e) => setContactWebsite(e.target.value)}
                  placeholder="Website"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-linkedin" className="text-xs">LinkedIn</Label>
                <Input
                  id="contact-linkedin"
                  value={contactLinkedIn}
                  onChange={(e) => setContactLinkedIn(e.target.value)}
                  placeholder="LinkedIn URL"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="deal-desc">Description</Label>
            <Textarea
              id="deal-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Adding...' : 'Create Lead'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
