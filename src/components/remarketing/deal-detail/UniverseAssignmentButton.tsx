import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Target, Loader2, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';

interface UniverseAssignmentButtonProps {
  dealId: string;
  dealCategory?: string | null;
  scoreCount?: number;
}

export function UniverseAssignmentButton({
  dealId,
  dealCategory: _dealCategory,
  scoreCount = 0,
}: UniverseAssignmentButtonProps) {
  const queryClient = useQueryClient();
  const [selectedUniverse, setSelectedUniverse] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Fetch current universe assignment
  const { data: assignment, isLoading: assignmentLoading } = useQuery({
    queryKey: ['remarketing', 'deal-universe', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_universe_deals')
        .select('id, universe_id, buyer_universes(id, name)')
        .eq('listing_id', dealId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });

  // Fetch available universes
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
  });

  // Assign to universe mutation
  const assignMutation = useMutation({
    mutationFn: async (universeId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from('remarketing_universe_deals').insert({
        universe_id: universeId,
        listing_id: dealId,
        added_by: user?.id,
        status: 'active',
      });

      if (error) throw error;

      // Queue background scoring
      const { queueDealScoring } = await import('@/lib/remarketing/queueScoring');
      await queueDealScoring({ universeId, listingIds: [dealId] });

      return universeId;
    },
    onSuccess: () => {
      toast.success('Deal assigned to universe');
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-universe', dealId] });
      setSelectedUniverse('');
    },
    onError: (err: Error) => {
      console.error('Failed to assign deal to universe:', err);
      toast.error('Failed to assign deal to universe', { description: err.message });
    },
  });

  const handleAssign = async () => {
    if (!selectedUniverse) {
      toast.error('Please select a universe');
      return;
    }
    setIsAssigning(true);
    try {
      await assignMutation.mutateAsync(selectedUniverse);
    } finally {
      setIsAssigning(false);
    }
  };

  if (assignmentLoading) {
    return (
      <Button disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  // Deal is assigned to a universe - show View Buyer Matches
  if (assignment?.universe_id) {
    return (
      <Button className="gap-2" asChild>
        <Link to={`/admin/remarketing/matching/${dealId}`}>
          <Target className="h-4 w-4" />
          View Buyer Matches ({scoreCount})
        </Link>
      </Button>
    );
  }

  // Deal is not assigned - show universe dropdown
  return (
    <div className="flex items-center gap-2">
      <Select value={selectedUniverse} onValueChange={setSelectedUniverse}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select universe" />
        </SelectTrigger>
        <SelectContent>
          {universes?.map((universe) => (
            <SelectItem key={universe.id} value={universe.id}>
              {universe.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleAssign} disabled={isAssigning || !selectedUniverse} className="gap-2">
        {isAssigning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Assigning...
          </>
        ) : (
          <>
            <FolderPlus className="h-4 w-4" />
            Assign to Universe
          </>
        )}
      </Button>
    </div>
  );
}
