import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from '@/components/ui/button';
import { Loader2, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';

interface BulkAssignUniverseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealIds: string[];
  onComplete: () => void;
}

export function BulkAssignUniverseDialog({
  open,
  onOpenChange,
  dealIds,
  onComplete,
}: BulkAssignUniverseDialogProps) {
  const queryClient = useQueryClient();
  const [selectedUniverse, setSelectedUniverse] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const { data: universes } = useQuery({
    queryKey: ['remarketing', 'universes-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_universes')
        .select('id, name')
        .eq('archived', false)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handleAssign = async () => {
    if (!selectedUniverse || dealIds.length === 0) return;
    setIsAssigning(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      // Check which deals are already in this universe
      const { data: existing, error: existingError } = await supabase
        .from('remarketing_universe_deals')
        .select('listing_id')
        .eq('universe_id', selectedUniverse)
        .eq('status', 'active')
        .in('listing_id', dealIds);
      if (existingError) throw existingError;

      const existingIds = new Set((existing || []).map((e) => e.listing_id));
      const newDealIds = dealIds.filter((id) => !existingIds.has(id));

      if (newDealIds.length === 0) {
        toast.info('All selected deals are already in this universe.');
        setIsAssigning(false);
        return;
      }

      const rows = newDealIds.map((dealId) => ({
        universe_id: selectedUniverse,
        listing_id: dealId,
        added_by: user?.id,
        status: 'active' as const,
      }));

      const { error } = await supabase.from('remarketing_universe_deals').insert(rows);

      if (error) throw error;

      const skipped = dealIds.length - newDealIds.length;
      const msg =
        skipped > 0
          ? `Added ${newDealIds.length} deal(s) to universe (${skipped} already existed)`
          : `Added ${newDealIds.length} deal(s) to universe`;
      toast.success(msg);

      // Queue background scoring for all new deals
      const { queueDealScoring } = await import('@/lib/remarketing/queueScoring');
      await queueDealScoring({ universeId: selectedUniverse, listingIds: newDealIds });

      queryClient.invalidateQueries({ queryKey: ['remarketing'] });
      setSelectedUniverse('');
      onOpenChange(false);
      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to assign deals to universe:', err);
      toast.error('Failed to assign deals to universe', { description: msg });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to Buyer Universe</DialogTitle>
          <DialogDescription>
            Add {dealIds.length} selected deal{dealIds.length > 1 ? 's' : ''} to a buyer universe
            for matching and outreach.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select value={selectedUniverse} onValueChange={setSelectedUniverse}>
            <SelectTrigger>
              <SelectValue placeholder="Select a universe..." />
            </SelectTrigger>
            <SelectContent>
              {universes?.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isAssigning}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={isAssigning || !selectedUniverse}>
            {isAssigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <FolderPlus className="h-4 w-4 mr-2" />
                Add to Universe
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
