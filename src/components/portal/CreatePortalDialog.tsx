import { useState } from 'react';
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
import { useCreatePortalOrg } from '@/hooks/portal/use-portal-organizations';
import type { PortalNotificationFrequency } from '@/types/portal';

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
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState(
    'Welcome to your SourceCo deal portal. We will push relevant opportunities here for your review.'
  );
  const [notificationFrequency, setNotificationFrequency] = useState<PortalNotificationFrequency>('instant');
  const [notes, setNotes] = useState('');
  const [industries, setIndustries] = useState('');
  const [geographies, setGeographies] = useState('');
  const [dealSizeMin, setDealSizeMin] = useState('');
  const [dealSizeMax, setDealSizeMax] = useState('');

  const createPortal = useCreatePortalOrg();

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    await createPortal.mutateAsync({
      name: name.trim(),
      portal_slug: slug.trim(),
      welcome_message: welcomeMessage.trim() || undefined,
      notification_frequency: notificationFrequency,
      notes: notes.trim() || undefined,
      preferred_industries: industries ? industries.split(',').map(s => s.trim()).filter(Boolean) : [],
      preferred_geographies: geographies ? geographies.split(',').map(s => s.trim()).filter(Boolean) : [],
      preferred_deal_size_min: dealSizeMin ? parseInt(dealSizeMin, 10) : null,
      preferred_deal_size_max: dealSizeMax ? parseInt(dealSizeMax, 10) : null,
    });

    // Reset form
    setName('');
    setSlug('');
    setWelcomeMessage('Welcome to your SourceCo deal portal. We will push relevant opportunities here for your review.');
    setNotificationFrequency('instant');
    setNotes('');
    setIndustries('');
    setGeographies('');
    setDealSizeMin('');
    setDealSizeMax('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Client Portal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Client Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Alpine Investors"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Portal URL Slug *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/portal/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="alpine-investors"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome">Welcome Message</Label>
            <Textarea
              id="welcome"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industries">Preferred Industries</Label>
              <Input
                id="industries"
                value={industries}
                onChange={(e) => setIndustries(e.target.value)}
                placeholder="Healthcare, Services"
              />
              <p className="text-xs text-muted-foreground">Comma-separated</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="geographies">Preferred Geographies</Label>
              <Input
                id="geographies"
                value={geographies}
                onChange={(e) => setGeographies(e.target.value)}
                placeholder="Southeast, Midwest"
              />
              <p className="text-xs text-muted-foreground">Comma-separated</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minSize">Min EBITDA</Label>
              <Input
                id="minSize"
                type="number"
                value={dealSizeMin}
                onChange={(e) => setDealSizeMin(e.target.value)}
                placeholder="1000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxSize">Max EBITDA</Label>
              <Input
                id="maxSize"
                type="number"
                value={dealSizeMax}
                onChange={(e) => setDealSizeMax(e.target.value)}
                placeholder="10000000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">Notification Frequency</Label>
            <Select value={notificationFrequency} onValueChange={(v) => setNotificationFrequency(v as PortalNotificationFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">Instant</SelectItem>
                <SelectItem value="daily_digest">Daily Digest</SelectItem>
                <SelectItem value="weekly_digest">Weekly Digest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes about this client relationship..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPortal.isPending || !name.trim() || !slug.trim()}>
              {createPortal.isPending ? 'Creating...' : 'Create Portal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
