import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type {
  BuyerIntroduction,
  CreateBuyerIntroductionInput,
  UpdateBuyerIntroductionInput,
} from '@/types/buyer-introductions';

export function useBuyerIntroductions(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const queryKey = ['buyer-introductions', listingId];

  const { data: introductions = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buyer_introductions' as never)
        .select('*')
        .eq('listing_id', listingId!)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as BuyerIntroduction[];
    },
    enabled: !!listingId,
  });

  const notIntroduced = introductions.filter(
    (i) =>
      i.introduction_status === 'not_introduced' ||
      i.introduction_status === 'introduction_scheduled',
  );

  const introducedAndPassed = introductions.filter(
    (i) =>
      i.introduction_status === 'introduced' ||
      i.introduction_status === 'passed' ||
      i.introduction_status === 'rejected',
  );

  const createMutation = useMutation({
    mutationFn: async (input: CreateBuyerIntroductionInput) => {
      if (!user?.id) {
        throw new Error('You must be signed in to add a buyer');
      }

      const { data, error } = await supabase
        .from('buyer_introductions' as never)
        .insert({
          ...input,
          introduction_status: 'not_introduced',
          created_by: user.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as BuyerIntroduction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Buyer added to introduction pipeline');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add buyer');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateBuyerIntroductionInput }) => {
      const oldRecord = introductions.find((i) => i.id === id);

      const { data, error } = await supabase
        .from('buyer_introductions' as never)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log status change if status was updated
      if (updates.introduction_status && oldRecord) {
        await supabase.from('introduction_status_log' as never).insert({
          buyer_introduction_id: id,
          old_status: oldRecord.introduction_status,
          new_status: updates.introduction_status,
          changed_by: user?.id,
        } as never);
      }

      return data as unknown as BuyerIntroduction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Introduction status updated');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update status');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('buyer_introductions' as never)
        .update({ archived_at: new Date().toISOString() } as never)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Introduction archived');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to archive');
    },
  });

  return {
    introductions,
    notIntroduced,
    introducedAndPassed,
    isLoading,
    createIntroduction: createMutation.mutate,
    isCreating: createMutation.isPending,
    updateStatus: updateStatusMutation.mutate,
    isUpdating: updateStatusMutation.isPending,
    archiveIntroduction: archiveMutation.mutate,
  };
}
