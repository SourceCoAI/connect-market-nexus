import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DraftReplyResult {
  success: boolean;
  email: {
    subject: string;
    body: string;
  };
  context: {
    category: string;
    lead_name: string;
    company: string;
  };
}

export function useDraftReply() {
  return useMutation({
    mutationFn: async (inboxItemId: string): Promise<DraftReplyResult> => {
      const { data, error } = await supabase.functions.invoke('draft-reply-email', {
        body: { inbox_item_id: inboxItemId },
      });
      if (error) throw error;
      return data as DraftReplyResult;
    },
  });
}
