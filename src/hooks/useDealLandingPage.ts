import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LandingPageDeal {
  id: string;
  title: string;
  deal_identifier: string | null;
  hero_description: string | null;
  description: string | null;
  description_html: string | null;
  location: string | null;
  revenue: number | null;
  ebitda: number | null;
  categories: string[] | null;
  category: string | null;
  custom_sections: Array<{ title: string; description: string }> | null;
  revenue_metric_subtitle: string | null;
  ebitda_metric_subtitle: string | null;
  metric_3_type: string | null;
  metric_3_custom_label: string | null;
  metric_3_custom_value: string | null;
  metric_3_custom_subtitle: string | null;
  metric_4_type: string | null;
  metric_4_custom_label: string | null;
  metric_4_custom_value: string | null;
  metric_4_custom_subtitle: string | null;
  // C-3 FIX: executive_summary removed from public landing page (requires NDA)
  full_time_employees: number | null;
  part_time_employees: number | null;
  status: string;
  presented_by_admin_id: string | null;
  // Structured business details
  geographic_states: string[] | null;
  services: string[] | null;
  number_of_locations: number | null;
  customer_types: string | null;
  revenue_model: string | null;
  business_model: string | null;
  growth_trajectory: string | null;
  // C-2 FIX: is_internal_deal used to gate access to draft/internal listings
  is_internal_deal: boolean;
}

export interface RelatedDeal {
  id: string;
  title: string;
  location: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebitda_margin: number | null;
  categories: string[] | null;
  description: string | null;
  hero_description: string | null;
}

// C-1 FIX: Removed internal_company_name and website from public query to prevent
// leaking confidential data in browser network tab. These fields are only needed
// server-side for anonymization — the stripIdentifyingInfo function is applied to
// displayed text, but the raw field values were being sent to the client.
// C-3 FIX: Removed executive_summary from public query — confidential document URLs
// should not be accessible without NDA/authentication.
const LANDING_PAGE_FIELDS = `
  id, title, deal_identifier, hero_description, description, description_html, location,
  revenue, ebitda, categories, category, custom_sections,
  revenue_metric_subtitle, ebitda_metric_subtitle,
  metric_3_type, metric_3_custom_label, metric_3_custom_value, metric_3_custom_subtitle,
  metric_4_type, metric_4_custom_label, metric_4_custom_value, metric_4_custom_subtitle,
  full_time_employees, part_time_employees,
  status, presented_by_admin_id, is_internal_deal,
  geographic_states, services, number_of_locations, customer_types,
  revenue_model, business_model, growth_trajectory
`;

export function useDealLandingPage(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-landing-page', dealId],
    queryFn: async (): Promise<LandingPageDeal> => {
      if (!dealId) throw new Error('Deal ID is required');

      // C-2 FIX: Filter by is_internal_deal=false and status=active so that
      // draft/internal listings are not accessible by UUID on the public landing page.
      const { data, error } = await supabase
        .from('listings')
        .select(LANDING_PAGE_FIELDS)
        .eq('id', dealId)
        .eq('is_internal_deal', false)
        .eq('status', 'active')
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Deal not found');

      return {
        ...data,
        custom_sections: data.custom_sections as LandingPageDeal['custom_sections'],
      };
    },
    enabled: !!dealId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRelatedDeals(currentDealId: string | undefined) {
  return useQuery({
    queryKey: ['related-deals', currentDealId],
    queryFn: async (): Promise<RelatedDeal[]> => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          'id, title, location, revenue, ebitda, ebitda_margin, categories, description, hero_description',
        )
        .eq('status', 'active')
        .eq('is_internal_deal', false)
        .is('deleted_at', null)
        .neq('id', currentDealId ?? '')
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return (data ?? []) as RelatedDeal[];
    },
    enabled: !!currentDealId,
    staleTime: 5 * 60 * 1000,
  });
}
