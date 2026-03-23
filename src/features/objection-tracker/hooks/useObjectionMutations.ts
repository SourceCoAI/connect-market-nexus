import { useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useObjectionMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['objection-categories'] });
    queryClient.invalidateQueries({ queryKey: ['objection-categories-all'] });
    queryClient.invalidateQueries({ queryKey: ['objection-instances'] });
    queryClient.invalidateQueries({ queryKey: ['objection-instances-pending'] });
    queryClient.invalidateQueries({ queryKey: ['objection-playbooks-pending'] });
    queryClient.invalidateQueries({ queryKey: ['objection-playbook-published'] });
    queryClient.invalidateQueries({ queryKey: ['objection-pending-review-count'] });
  };

  // Approve a playbook entry
  const approvePlaybook = useMutation({
    mutationFn: async ({ id, frameworks, mistakes_to_avoid }: { id: string; frameworks?: any; mistakes_to_avoid?: any }) => {
      const updateData: any = {
        status: 'published',
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
      };
      if (frameworks) updateData.frameworks = frameworks;
      if (mistakes_to_avoid) updateData.mistakes_to_avoid = mistakes_to_avoid;

      // Archive any existing published entry for this category
      const { data: current } = await untypedFrom('objection_playbook')
        .select('category_id')
        .eq('id', id)
        .single();

      if (current) {
        await untypedFrom('objection_playbook')
          .update({ status: 'archived' })
          .eq('category_id', current.category_id)
          .eq('status', 'published');
      }

      const { error } = await untypedFrom('objection_playbook')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Playbook entry approved and published');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to approve: ${err.message}`);
    },
  });

  // Reject a playbook entry
  const rejectPlaybook = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await untypedFrom('objection_playbook')
        .update({
          status: 'archived',
          rejection_reason: reason,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Playbook entry rejected');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to reject: ${err.message}`);
    },
  });

  // Confirm a pending objection instance
  const confirmInstance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('objection_instances')
        .update({ status: 'auto_accepted' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Objection instance confirmed');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to confirm: ${err.message}`);
    },
  });

  // Reject a pending objection instance
  const rejectInstance = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { error } = await untypedFrom('objection_instances')
        .update({ status: 'rejected', manager_note: note || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Objection instance rejected');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to reject: ${err.message}`);
    },
  });

  // Toggle category active status
  const toggleCategory = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await untypedFrom('objection_categories')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category updated');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  // Approve AI-suggested category
  const approveCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('objection_categories')
        .update({ approved_by: user?.id, ai_suggested: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category approved');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to approve: ${err.message}`);
    },
  });

  // Dismiss AI-suggested category
  const dismissCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('objection_categories')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category dismissed');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to dismiss: ${err.message}`);
    },
  });

  // Add new category
  const addCategory = useMutation({
    mutationFn: async ({ name, description, icon }: { name: string; description: string; icon: string }) => {
      const { error } = await untypedFrom('objection_categories')
        .insert({ name, description, icon, is_active: true, ai_suggested: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category added');
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(`Failed to add: ${err.message}`);
    },
  });

  return {
    approvePlaybook,
    rejectPlaybook,
    confirmInstance,
    rejectInstance,
    toggleCategory,
    approveCategory,
    dismissCategory,
    addCategory,
  };
}
