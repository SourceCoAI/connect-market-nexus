import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface AuditViolation {
  code: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  count: number;
  buyers: Record<string, unknown>[];
}

export interface AuditSummary {
  total_buyers: number;
  total_active: number;
  total_archived: number;
  by_buyer_type: Record<string, number>;
  by_buyer_type_source: Record<string, number>;
  pe_backed_by_type: Record<string, number>;
}

export interface AuditSampleBuyer {
  id: string;
  company_name: string;
  buyer_type: string | null;
  is_pe_backed: boolean;
  pe_firm_name: string | null;
  parent_pe_firm_id: string | null;
  parent_pe_firm_name: string | null;
  buyer_type_source: string | null;
  buyer_type_confidence: number | null;
  company_website: string | null;
  industry_vertical: string | null;
  classification_notes: string;
}

export interface AuditReport {
  audit_timestamp: string;
  violations: Record<string, AuditViolation>;
  summary: AuditSummary;
  random_sample: AuditSampleBuyer[];
}

export interface FixResult {
  fixed_at: string;
  fixes_applied: Record<string, number>;
  total_fixed: number;
}

export function useBuyerAudit() {
  const queryClient = useQueryClient();

  const auditQuery = useQuery({
    queryKey: ['buyer-classification-audit'],
    queryFn: async (): Promise<AuditReport> => {
      const { data, error } = await supabase.rpc(
        'audit_buyer_classifications' as never,
      );
      if (error) throw error;
      return data as unknown as AuditReport;
    },
    enabled: false, // manual trigger only
  });

  const fixMutation = useMutation({
    mutationFn: async (): Promise<FixResult> => {
      const { data, error } = await supabase.rpc(
        'fix_buyer_classification_violations' as never,
      );
      if (error) throw error;
      return data as unknown as FixResult;
    },
    onSuccess: (data) => {
      toast({
        title: 'Fixes applied',
        description: `${data.total_fixed} violations corrected`,
      });
      queryClient.invalidateQueries({ queryKey: ['buyer-classification-audit'] });
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
    },
    onError: (error) => {
      toast({
        title: 'Fix failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    audit: auditQuery.data ?? null,
    isLoading: auditQuery.isLoading || auditQuery.isFetching,
    error: auditQuery.error,
    runAudit: () => auditQuery.refetch(),
    applyFixes: fixMutation.mutate,
    isFixing: fixMutation.isPending,
    fixResult: fixMutation.data ?? null,
  };
}
