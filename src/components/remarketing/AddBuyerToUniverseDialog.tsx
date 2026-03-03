import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { normalizeDomain } from '@/lib/remarketing/normalizeDomain';

interface AddBuyerToUniverseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universeId: string;
  onBuyerAdded: () => void;
}

export function AddBuyerToUniverseDialog({
  open,
  onOpenChange,
  universeId,
  onBuyerAdded,
}: AddBuyerToUniverseDialogProps) {
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [peFirmName, setPeFirmName] = useState('');
  const [peFirmWebsite, setPeFirmWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim() && !peFirmName.trim()) {
      toast.error('Company name or PE Firm name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      // Normalize websites for dedup
      const normalizedCompanyWebsite =
        normalizeDomain(companyWebsite.trim()) || companyWebsite.trim() || null;
      const normalizedPeFirmWebsite =
        normalizeDomain(peFirmWebsite.trim()) || peFirmWebsite.trim() || null;

      // Check for duplicate buyer by domain in this universe
      if (normalizedCompanyWebsite) {
        const { data: existingBuyers, error: existingBuyersError } = await supabase
          .from('remarketing_buyers')
          .select('id, company_name, company_website')
          .eq('universe_id', universeId)
          .eq('archived', false)
          .not('company_website', 'is', null);
        if (existingBuyersError) throw existingBuyersError;

        const duplicate = existingBuyers?.find(
          (b) => normalizeDomain(b.company_website) === normalizedCompanyWebsite,
        );
        if (duplicate) {
          toast.error(`A buyer with this website already exists: "${duplicate.company_name}"`);
          setIsSubmitting(false);
          return;
        }
      }

      const { data: newBuyer, error } = await supabase
        .from('remarketing_buyers')
        .insert({
          universe_id: universeId,
          company_name: companyName.trim() || peFirmName.trim(),
          company_website: normalizedCompanyWebsite,
          pe_firm_name: peFirmName.trim() || null,
          pe_firm_website: normalizedPeFirmWebsite,
          business_summary: notes.trim() || null,
          buyer_type: peFirmName.trim() ? 'private_equity' : 'corporate',
          is_pe_backed: !!peFirmName.trim(),
        })
        .select('id')
        .single();

      if (error) {
        if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
          throw new Error('A buyer with this website already exists in this universe.');
        }
        throw error;
      }

      // Verify buyer is readable
      const { data: verified, error: verifiedError } = await supabase
        .from('remarketing_buyers')
        .select('id')
        .eq('id', newBuyer.id)
        .single();
      if (verifiedError) throw verifiedError;

      if (!verified) {
        throw new Error('Buyer created but not visible — check RLS policies');
      }

      // Queue scoring against all deals in this universe
      const { data: universeDeals, error: universeDealsError } = await supabase
        .from('remarketing_universe_deals')
        .select('listing_id')
        .eq('universe_id', universeId);
      if (universeDealsError) throw universeDealsError;

      if (universeDeals && universeDeals.length > 0) {
        const { queueDealScoring } = await import('@/lib/remarketing/queueScoring');
        await queueDealScoring({ universeId, listingIds: universeDeals.map((d) => d.listing_id) });
      }

      toast.success('Buyer added successfully');
      onBuyerAdded();
      onOpenChange(false);
      resetForm();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error adding buyer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCompanyName('');
    setCompanyWebsite('');
    setPeFirmName('');
    setPeFirmWebsite('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Buyer to Universe</DialogTitle>
          <DialogDescription>
            Add a new platform company or PE-backed buyer to this universe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name *</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g., ServiceMaster"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-website">Company Website</Label>
            <Input
              id="company-website"
              type="url"
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              placeholder="https://servicemaster.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pe-firm">PE Firm Name</Label>
            <Input
              id="pe-firm"
              value={peFirmName}
              onChange={(e) => setPeFirmName(e.target.value)}
              placeholder="e.g., Vista Equity Partners"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pe-website">PE Firm Website</Label>
            <Input
              id="pe-website"
              type="url"
              value={peFirmWebsite}
              onChange={(e) => setPeFirmWebsite(e.target.value)}
              placeholder="https://vistaequitypartners.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this buyer..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Buyer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
