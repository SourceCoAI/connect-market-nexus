import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface QuickDialOptions {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  /** If provided, pushes an existing buyer_contact / contact entity */
  entityType?: 'buyer_contacts' | 'contacts' | 'buyers';
  entityId?: string;
}

/**
 * Hook to launch a PhoneBurner dial session for a single phone number.
 * Falls back to tel: link if PhoneBurner push fails.
 */
export function useQuickDial() {
  const [isDialing, setIsDialing] = useState(false);

  const dialMutation = useMutation({
    mutationFn: async (opts: QuickDialOptions) => {
      // If we have an entity, push via the standard flow
      if (opts.entityId && opts.entityType) {
        const { data, error } = await supabase.functions.invoke('phoneburner-push-contacts', {
          body: {
            entity_type: opts.entityType,
            entity_ids: [opts.entityId],
            session_name: `Quick dial: ${opts.name || opts.phone}`,
          },
        });

        if (error) {
          let errorMsg = error instanceof Error ? error.message : String(error);
          try {
            if ('context' in error && error.context instanceof Response) {
              const body = await (error.context as Response).json();
              if (body?.error) errorMsg = body.error;
            }
          } catch {
            // ignore
          }
          throw new Error(errorMsg);
        }

        return data as { success: boolean; redirect_url?: string; contacts_added: number; error?: string };
      }

      // No entity — just open tel: link
      return null;
    },
    onSuccess: (data, opts) => {
      if (data?.success && data.redirect_url) {
        toast.success('Opening PhoneBurner dialer...');
        window.open(data.redirect_url, '_blank');
      } else if (data && !data.success) {
        // PhoneBurner push failed — fall back to tel:
        toast.error(data.error || 'PhoneBurner dial failed, opening phone dialer instead');
        window.open(`tel:${opts.phone}`, '_self');
      } else {
        // No entity — just tel:
        window.open(`tel:${opts.phone}`, '_self');
      }
    },
    onError: (_err, opts) => {
      // Fall back to native tel: link
      toast.error('PhoneBurner unavailable, opening phone dialer');
      window.open(`tel:${opts.phone}`, '_self');
    },
    onSettled: () => {
      setIsDialing(false);
    },
  });

  const dial = (opts: QuickDialOptions) => {
    setIsDialing(true);
    dialMutation.mutate(opts);
  };

  return { dial, isDialing: isDialing || dialMutation.isPending };
}
