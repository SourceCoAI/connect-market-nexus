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
  image_url: string | null;
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
  executive_summary: string | null;
  full_time_employees: number | null;
  part_time_employees: number | null;
  status: string;
  presented_by_admin_id: string | null;
  is_internal_deal: boolean | null;
  acquisition_type: string | null;
  // Structured business details
  geographic_states: string[] | null;
  services: string[] | null;
  number_of_locations: number | null;
  customer_types: string | null;
  revenue_model: string | null;
  business_model: string | null;
  growth_trajectory: string | null;
  featured_deal_ids: string[] | null;
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

const LANDING_PAGE_FIELDS = `
  id, title, deal_identifier, hero_description, description, description_html, location,
  revenue, ebitda, categories, category, custom_sections, image_url,
  revenue_metric_subtitle, ebitda_metric_subtitle,
  metric_3_type, metric_3_custom_label, metric_3_custom_value, metric_3_custom_subtitle,
  metric_4_type, metric_4_custom_label, metric_4_custom_value, metric_4_custom_subtitle,
  executive_summary, full_time_employees, part_time_employees,
  status, presented_by_admin_id, is_internal_deal, acquisition_type,
  geographic_states, services, number_of_locations, customer_types,
  revenue_model, business_model, growth_trajectory,
  featured_deal_ids
`;

export function useDealLandingPage(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-landing-page', dealId],
    queryFn: async (): Promise<LandingPageDeal> => {
      if (!dealId) throw new Error('Deal ID is required');

      const { data, error } = await supabase
        .from('listings')
        .select(LANDING_PAGE_FIELDS)
        .eq('id', dealId)
        .eq('is_internal_deal', false)
        .eq('status', 'active')
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

export function useRelatedDeals(
  currentDealId: string | undefined,
  featuredDealIds?: string[] | null,
) {
  return useQuery({
    queryKey: ['related-deals', currentDealId, featuredDealIds],
    queryFn: async (): Promise<RelatedDeal[]> => {
      const selectFields =
        'id, title, location, revenue, ebitda, ebitda_margin, categories, description, hero_description, image_url';

      // If hand-picked featured deals are set, fetch those specifically
      if (featuredDealIds && featuredDealIds.length > 0) {
        const { data, error } = await supabase
          .from('listings')
          .select(selectFields)
          .in('id', featuredDealIds)
          .eq('status', 'active')
          .eq('is_internal_deal', false);

        if (error) throw error;

        const featured = (data ?? []) as RelatedDeal[];

        // If we got fewer than expected (e.g. a deal was deactivated), backfill with recent
        if (featured.length < 2) {
          const excludeIds = [currentDealId!, ...featured.map((d) => d.id)];
          const { data: backfill } = await supabase
            .from('listings')
            .select(selectFields)
            .eq('status', 'active')
            .eq('is_internal_deal', false)
            .not('id', 'in', `(${excludeIds.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(3 - featured.length);

          return [...featured, ...((backfill ?? []) as RelatedDeal[])];
        }

        return featured;
      }

      // Default: most recent active marketplace listings
      const { data, error } = await supabase
        .from('listings')
        .select(selectFields)
        .eq('status', 'active')
        .eq('is_internal_deal', false)
        .neq('id', currentDealId!)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return (data ?? []) as RelatedDeal[];
    },
    enabled: !!currentDealId,
    staleTime: 5 * 60 * 1000,
  });
}
