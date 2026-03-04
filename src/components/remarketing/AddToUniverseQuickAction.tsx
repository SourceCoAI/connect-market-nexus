import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Target, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface AddToUniverseQuickActionProps {
  listingId: string;
  listingCategory?: string | null;
  onUniverseAdded: () => void;
}

export const AddToUniverseQuickAction = ({
  listingId,
  listingCategory,
  onUniverseAdded,
}: AddToUniverseQuickActionProps) => {
  const [selectedUniverse, setSelectedUniverse] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);

  // Fetch available universes
  const { data: universes } = useQuery({
    queryKey: ['remarketing', 'universes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_universes')
        .select('id, name, description')
        .eq('archived', false)
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });

  // Find suggested universe based on category
  const suggestedUniverse = universes?.find((u) => {
    const universeName = u.name.toLowerCase();
    const category = (listingCategory || '').toLowerCase();
    return universeName.includes(category) || category.includes(universeName.split(' ')[0]);
  });

  const handleAddAndScore = async () => {
    const universeId = selectedUniverse || suggestedUniverse?.id;
    if (!universeId) {
      toast.error('Please select a universe');
      return;
    }

    setIsAdding(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Add deal to universe
      const { error: linkError } = await supabase.from('remarketing_universe_deals').insert({
        universe_id: universeId,
        listing_id: listingId,
        added_by: user?.id,
        status: 'active',
      });

      if (linkError) throw linkError;

      // Queue background scoring
      const { queueDealScoring } = await import('@/lib/remarketing/queueScoring');
      await queueDealScoring({ universeId, listingIds: [listingId] });

      toast.success('Deal added to universe');
      onUniverseAdded();
    } catch (error) {
      toast.error('Failed to add deal to universe');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="py-6">
        <div className="flex flex-col items-center text-center gap-4">
          <AlertCircle className="h-10 w-10 text-amber-500" />
          <div>
            <h3 className="font-semibold text-lg mb-1">No buyer matches yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              This deal hasn't been added to a buyer universe. Add it to automatically score against
              relevant buyers.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full max-w-md">
            <Select value={selectedUniverse} onValueChange={setSelectedUniverse}>
              <SelectTrigger className="flex-1 bg-background">
                <SelectValue
                  placeholder={
                    suggestedUniverse ? `Suggested: ${suggestedUniverse.name}` : 'Select a universe'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {universes?.map((universe) => (
                  <SelectItem key={universe.id} value={universe.id}>
                    <div className="flex items-center gap-2">
                      {universe.name}
                      {universe.id === suggestedUniverse?.id && (
                        <Badge variant="secondary" className="text-xs">
                          Suggested
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleAddAndScore}
              disabled={isAdding || (!selectedUniverse && !suggestedUniverse)}
              className="shrink-0"
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Target className="mr-2 h-4 w-4" />
                  Add & Score
                </>
              )}
            </Button>
          </div>

          {suggestedUniverse && !selectedUniverse && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Based on deal category: {listingCategory}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
