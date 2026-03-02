import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logDealActivity } from '@/lib/deal-activity-logger';

/** Cached connection request shape used for optimistic updates */
interface CachedConnectionRequest {
  id: string;
  user_id?: string | null;
  lead_nda_signed?: boolean;
  lead_nda_signed_at?: string | null;
  lead_nda_email_sent?: boolean;
  lead_nda_email_sent_at?: string | null;
  lead_fee_agreement_signed?: boolean;
  lead_fee_agreement_signed_at?: string | null;
  lead_fee_agreement_email_sent?: boolean;
  lead_fee_agreement_email_sent_at?: string | null;
  connection_request_id?: string;
  [key: string]: unknown;
}

/** Cached deal shape used for optimistic updates */
interface CachedDeal {
  id: string;
  connection_request_id?: string;
  nda_status?: string;
  fee_agreement_status?: string;
  [key: string]: unknown;
}

// Helper to get visitor ID for milestone tracking
const getVisitorIdForRequest = async (requestId: string): Promise<string | null> => {
  try {
    // Get the user_id from connection request
    const { data: request, error: requestError } = await supabase
      .from('connection_requests')
      .select('user_id')
      .eq('id', requestId)
      .single();
    if (requestError) throw requestError;
    
    if (!request?.user_id) return null;
    
    // Try to find visitor_id in user_journeys for this user
    const { data: journey, error: journeyError } = await supabase
      .from('user_journeys')
      .select('visitor_id')
      .eq('user_id', request.user_id)
      .maybeSingle();
    if (journeyError) throw journeyError;
    
    return journey?.visitor_id || null;
  } catch {
    return null;
  }
};

interface LeadRequestParams {
  requestId: string;
  value: boolean;
}

export const useUpdateLeadNDAStatus = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, value }: LeadRequestParams) => {
      const { data, error } = await supabase.rpc('update_lead_nda_status', {
        p_request_id: requestId,
        p_value: value,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ requestId, value }) => {
      await queryClient.cancelQueries({ queryKey: ['connection-requests'] });
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      
      const previousRequests = queryClient.getQueryData<CachedConnectionRequest[]>(['connection-requests']);
      const previousDeals = queryClient.getQueryData<CachedDeal[]>(['deals']);

      queryClient.setQueryData<CachedConnectionRequest[] | undefined>(['connection-requests'], (old) => {
        if (!old) return old;
        return old.map((r) => r.id === requestId ? { ...r, lead_nda_signed: value, lead_nda_signed_at: value ? new Date().toISOString() : null } : r);
      });

      queryClient.setQueryData<CachedDeal[] | undefined>(['deals'], (old) => {
        if (!old) return old;
        return old.map((deal) =>
          deal.connection_request_id === requestId
            ? { ...deal, nda_status: value ? 'signed' : 'not_sent' }
            : deal
        );
      });

      return { previousRequests, previousDeals };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousRequests) queryClient.setQueryData(['connection-requests'], ctx.previousRequests);
      if (ctx?.previousDeals) queryClient.setQueryData(['deals'], ctx.previousDeals);
      toast({ variant: 'destructive', title: 'Update failed', description: 'Could not update lead NDA signed status' });
    },
    onSuccess: async (_, { requestId, value }) => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['connection-request-details'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-activities'] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      
      // Log activity if this connection request has a deal
      const { data: deal, error: dealError } = await supabase
        .from('deal_pipeline')
        .select('id, contact_name')
        .eq('connection_request_id', requestId)
        .maybeSingle();
      if (dealError) throw dealError;
      
      if (deal) {
        await logDealActivity({
          dealId: deal.id,
          activityType: 'nda_status_changed',
          title: value ? 'NDA Signed' : 'NDA Status Revoked',
          description: value 
            ? `NDA marked as signed for ${deal.contact_name || 'contact'}`
            : `NDA signature revoked for ${deal.contact_name || 'contact'}`,
          metadata: { document_type: 'nda', signed: value }
        });
      }
      
      // Record journey milestone for NDA signed
      if (value) {
        const visitorId = await getVisitorIdForRequest(requestId);
        if (visitorId) {
          await supabase.rpc('update_journey_milestone', {
            p_visitor_id: visitorId,
            p_milestone_key: 'nda_signed_at',
            p_milestone_time: new Date().toISOString()
          });
        }
      }
      
      toast({ title: 'Lead NDA status updated' });
    },
  });
};

export const useUpdateLeadNDAEmailStatus = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, value }: LeadRequestParams) => {
      const { data, error } = await supabase.rpc('update_lead_nda_email_status', {
        p_request_id: requestId,
        p_value: value,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ requestId, value }) => {
      await queryClient.cancelQueries({ queryKey: ['connection-requests'] });
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      
      const previousRequests = queryClient.getQueryData<CachedConnectionRequest[]>(['connection-requests']);
      const previousDeals = queryClient.getQueryData<CachedDeal[]>(['deals']);

      queryClient.setQueryData<CachedConnectionRequest[] | undefined>(['connection-requests'], (old) => {
        if (!old) return old;
        return old.map((r) => r.id === requestId ? { ...r, lead_nda_email_sent: value, lead_nda_email_sent_at: value ? new Date().toISOString() : null } : r);
      });

      queryClient.setQueryData<CachedDeal[] | undefined>(['deals'], (old) => {
        if (!old) return old;
        return old.map((deal) =>
          deal.connection_request_id === requestId
            ? { ...deal, nda_status: value ? 'sent' : 'not_sent' }
            : deal
        );
      });

      return { previousRequests, previousDeals };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousRequests) queryClient.setQueryData(['connection-requests'], ctx.previousRequests);
      if (ctx?.previousDeals) queryClient.setQueryData(['deals'], ctx.previousDeals);
      toast({ variant: 'destructive', title: 'Update failed', description: 'Could not update lead NDA email status' });
    },
    onSuccess: async (_, { requestId, value }) => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['connection-request-details'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-activities'] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members'] });
      
      // Log activity if this connection request has a deal
      const { data: deal, error: dealError } = await supabase
        .from('deal_pipeline')
        .select('id, contact_name')
        .eq('connection_request_id', requestId)
        .maybeSingle();
      if (dealError) throw dealError;
      
      if (deal) {
        await logDealActivity({
          dealId: deal.id,
          activityType: 'nda_email_sent',
          title: value ? 'NDA Email Sent' : 'NDA Email Status Revoked',
          description: value 
            ? `NDA email sent to ${deal.contact_name || 'contact'}`
            : `NDA email status revoked for ${deal.contact_name || 'contact'}`,
          metadata: { document_type: 'nda', email_sent: value }
        });
      }
      
      toast({ title: 'Lead NDA email status updated' });
    },
  });
};

export const useUpdateLeadFeeAgreementStatus = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, value }: LeadRequestParams) => {
      const { data, error } = await supabase.rpc('update_lead_fee_agreement_status', {
        p_request_id: requestId,
        p_value: value,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ requestId, value }) => {
      await queryClient.cancelQueries({ queryKey: ['connection-requests'] });
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      
      const previousRequests = queryClient.getQueryData<CachedConnectionRequest[]>(['connection-requests']);
      const previousDeals = queryClient.getQueryData<CachedDeal[]>(['deals']);

      queryClient.setQueryData<CachedConnectionRequest[] | undefined>(['connection-requests'], (old) => {
        if (!old) return old;
        return old.map((r) => r.id === requestId ? { ...r, lead_fee_agreement_signed: value, lead_fee_agreement_signed_at: value ? new Date().toISOString() : null } : r);
      });

      queryClient.setQueryData<CachedDeal[] | undefined>(['deals'], (old) => {
        if (!old) return old;
        return old.map((deal) =>
          deal.connection_request_id === requestId
            ? { ...deal, fee_agreement_status: value ? 'signed' : 'not_sent' }
            : deal
        );
      });

      return { previousRequests, previousDeals };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousRequests) queryClient.setQueryData(['connection-requests'], ctx.previousRequests);
      if (ctx?.previousDeals) queryClient.setQueryData(['deals'], ctx.previousDeals);
      toast({ variant: 'destructive', title: 'Update failed', description: 'Could not update lead fee agreement signed status' });
    },
    onSuccess: async (_, { requestId, value }) => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['connection-request-details'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-activities'] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      
      // Log activity if this connection request has a deal
      const { data: deal, error: dealError } = await supabase
        .from('deal_pipeline')
        .select('id, contact_name')
        .eq('connection_request_id', requestId)
        .maybeSingle();
      if (dealError) throw dealError;
      
      if (deal) {
        await logDealActivity({
          dealId: deal.id,
          activityType: 'fee_agreement_status_changed',
          title: value ? 'Fee Agreement Signed' : 'Fee Agreement Status Revoked',
          description: value 
            ? `Fee Agreement marked as signed for ${deal.contact_name || 'contact'}`
            : `Fee Agreement signature revoked for ${deal.contact_name || 'contact'}`,
          metadata: { document_type: 'fee_agreement', signed: value }
        });
      }
      
      // Record journey milestone for fee agreement signed
      if (value) {
        const visitorId = await getVisitorIdForRequest(requestId);
        if (visitorId) {
          await supabase.rpc('update_journey_milestone', {
            p_visitor_id: visitorId,
            p_milestone_key: 'fee_agreement_at',
            p_milestone_time: new Date().toISOString()
          });
        }
      }
      
      toast({ title: 'Lead fee agreement status updated' });
    },
  });
};

export const useUpdateLeadFeeAgreementEmailStatus = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, value }: LeadRequestParams) => {
      const { data, error } = await supabase.rpc('update_lead_fee_agreement_email_status', {
        p_request_id: requestId,
        p_value: value,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ requestId, value }) => {
      await queryClient.cancelQueries({ queryKey: ['connection-requests'] });
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      
      const previousRequests = queryClient.getQueryData<CachedConnectionRequest[]>(['connection-requests']);
      const previousDeals = queryClient.getQueryData<CachedDeal[]>(['deals']);

      queryClient.setQueryData<CachedConnectionRequest[] | undefined>(['connection-requests'], (old) => {
        if (!old) return old;
        return old.map((r) => r.id === requestId ? { ...r, lead_fee_agreement_email_sent: value, lead_fee_agreement_email_sent_at: value ? new Date().toISOString() : null } : r);
      });

      queryClient.setQueryData<CachedDeal[] | undefined>(['deals'], (old) => {
        if (!old) return old;
        return old.map((deal) =>
          deal.connection_request_id === requestId
            ? { ...deal, fee_agreement_status: value ? 'sent' : 'not_sent' }
            : deal
        );
      });

      return { previousRequests, previousDeals };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousRequests) queryClient.setQueryData(['connection-requests'], ctx.previousRequests);
      if (ctx?.previousDeals) queryClient.setQueryData(['deals'], ctx.previousDeals);
      toast({ variant: 'destructive', title: 'Update failed', description: 'Could not update lead fee agreement email status' });
    },
    onSuccess: async (_, { requestId, value }) => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['connection-request-details'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal-activities'] });
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members'] });
      
      // Log activity if this connection request has a deal
      const { data: deal, error: dealError } = await supabase
        .from('deal_pipeline')
        .select('id, contact_name')
        .eq('connection_request_id', requestId)
        .maybeSingle();
      if (dealError) throw dealError;
      
      if (deal) {
        await logDealActivity({
          dealId: deal.id,
          activityType: 'fee_agreement_email_sent',
          title: value ? 'Fee Agreement Email Sent' : 'Fee Agreement Email Status Revoked',
          description: value 
            ? `Fee Agreement email sent to ${deal.contact_name || 'contact'}`
            : `Fee Agreement email status revoked for ${deal.contact_name || 'contact'}`,
          metadata: { document_type: 'fee_agreement', email_sent: value }
        });
      }
      
      toast({ title: 'Lead fee agreement email status updated' });
    },
  });
};
