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
import { useCreateDeal } from '@/hooks/admin/deals';
import { useDealStages } from '@/hooks/admin/deals/useDealStages';
import { useLinkInboxToDeal } from '@/hooks/smartlead/use-smartlead-inbox';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CreateDealFromReplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inboxItem: Record<string, unknown>;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];


export function CreateDealFromReplyDialog({
  open,
  onOpenChange,
  inboxItem: item,
}: CreateDealFromReplyDialogProps) {
  const createDeal = useCreateDeal();
  const linkToDeal = useLinkInboxToDeal();
  const { data: stages } = useDealStages(false);

  // Fetch listings for the listing dropdown
  const { data: listings } = useQuery({
    queryKey: ['listings-for-deal-create'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title')
        .order('title')
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Derive defaults from the inbox item
  const contactName = String(item.to_name || '').trim();
  const campaignName = String(item.campaign_name || '').trim();
  const subject = String(item.subject || '').trim();
  const aiCategory = String(item.manual_category || item.ai_category || '');

  const defaultTitle = contactName
    ? `${contactName}${campaignName ? ` – ${campaignName}` : ''}`
    : subject || campaignName || 'SmartLead Response';

  let defaultPriority = 'medium';
  if (['meeting_request', 'interested'].includes(aiCategory)) defaultPriority = 'high';
  else if (['not_interested', 'unsubscribe', 'negative_hostile'].includes(aiCategory))
    defaultPriority = 'low';

  const defaultDescription = [
    subject ? `Subject: ${subject}` : null,
    campaignName ? `Campaign: ${campaignName}` : null,
    item.ai_reasoning ? `AI Summary: ${String(item.ai_reasoning)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Form state
  const [title, setTitle] = useState(defaultTitle);
  const [contactNameField, setContactNameField] = useState(contactName);
  const [contactEmail, setContactEmail] = useState(
    String(item.to_email || item.sl_lead_email || '').trim(),
  );
  const [contactCompany, setContactCompany] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState(defaultDescription);
  const [priority, setPriority] = useState(defaultPriority);
  const [stageId, setStageId] = useState('');
  const [listingId, setListingId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default stage when stages load
  useEffect(() => {
    if (stages?.length && !stageId) {
      const def = stages.find((s) => s.is_default) || stages[0];
      setStageId(def.id);
    }
  }, [stages, stageId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setContactNameField(contactName);
      setContactEmail(String(item.to_email || item.sl_lead_email || '').trim());
      setContactCompany('');
      setContactPhone('');
      setDescription(defaultDescription);
      setPriority(defaultPriority);
      setListingId('');
      // stageId will be set by the other effect
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!stageId) {
      toast.error('Please select a pipeline stage');
      return;
    }

    setIsSubmitting(true);

    const dealPayload: Record<string, unknown> = {
      title: title.trim(),
      stage_id: stageId,
      source: 'smartlead',
      priority,
      contact_name: contactNameField.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_company: contactCompany.trim() || null,
      description: description.trim() || null,
    };

    if (listingId) {
      dealPayload.listing_id = listingId;
    }

    try {
      const newDeal = await createDeal.mutateAsync(dealPayload);
      const newDealId = (newDeal as { id: string }).id;

      linkToDeal.mutate(
        { id: String(item.id), dealId: newDealId },
        {
          onSuccess: () => {
            toast.success(`Deal created: ${title}`);
            setIsSubmitting(false);
            onOpenChange(false);
          },
          onError: () => {
            toast.success(`Deal created but failed to link to inbox item`);
            setIsSubmitting(false);
            onOpenChange(false);
          },
        },
      );
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Deal from Reply</DialogTitle>
          <DialogDescription>
            Review and edit the pre-filled fields before creating a deal pipeline entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="deal-title">Deal Title *</Label>
            <Input
              id="deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deal title"
            />
          </div>

          {/* Stage & Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pipeline Stage *</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Listing */}
          <div className="space-y-1.5">
            <Label>Listing (optional)</Label>
            <Select value={listingId || 'none'} onValueChange={(v) => setListingId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Link to a listing..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No listing</SelectItem>
                {listings?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title}
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
              {isSubmitting ? 'Creating...' : 'Create Deal'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
