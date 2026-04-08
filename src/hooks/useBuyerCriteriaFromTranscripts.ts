import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TranscriptCriteria {
  // Size
  target_revenue_min: number | null;
  target_revenue_max: number | null;
  target_ebitda_min: number | null;
  target_ebitda_max: number | null;
  // Geography
  target_geographies: string[];
  target_states: string[];
  geographic_exclusions: string[];
  geographic_flexibility: string | null;
  // Services
  target_services: string[];
  service_exclusions: string[];
  // Deal structure
  deal_types: string[];
  structure_preferences: string[];
  preferred_characteristics: string[];
  // Profile
  thesis_summary: string | null;
  acquisition_timeline: string | null;
  // Meta
  overall_confidence: number | null;
  sources: Array<{
    transcript_id: string;
    title: string;
    call_date: string | null;
    confidence: number;
  }>;
}

export function useBuyerCriteriaFromTranscripts(buyerId: string | undefined) {
  return useQuery({
    queryKey: ['buyer-criteria-from-transcripts', buyerId],
    queryFn: async () => {
      if (!buyerId) return null;

      // Fetch all completed extractions for this buyer
      const { data: transcripts, error } = await supabase
        .from('buyer_transcripts')
        .select('id, title, call_date, extracted_insights, extraction_status')
        .eq('buyer_id', buyerId)
        .eq('extraction_status', 'completed')
        .not('extracted_insights', 'is', null)
        .order('call_date', { ascending: false });

      if (error) throw error;
      if (!transcripts?.length) return null;

      // Merge criteria from all transcripts (latest takes priority)
      const merged: TranscriptCriteria = {
        target_revenue_min: null,
        target_revenue_max: null,
        target_ebitda_min: null,
        target_ebitda_max: null,
        target_geographies: [],
        target_states: [],
        geographic_exclusions: [],
        geographic_flexibility: null,
        target_services: [],
        service_exclusions: [],
        deal_types: [],
        structure_preferences: [],
        preferred_characteristics: [],
        thesis_summary: null,
        acquisition_timeline: null,
        overall_confidence: null,
        sources: [],
      };

      // Process most recent first (already sorted desc)
      for (const t of transcripts) {
        const insights = t.extracted_insights as any;
        if (!insights) continue;

        const bc = insights.buyer_criteria;
        const bp = insights.buyer_profile;

        merged.sources.push({
          transcript_id: t.id,
          title: t.title || 'Untitled',
          call_date: t.call_date,
          confidence: insights.overall_confidence || 0,
        });

        if (bc?.size_criteria) {
          if (!merged.target_revenue_min && bc.size_criteria.revenue_min)
            merged.target_revenue_min = bc.size_criteria.revenue_min;
          if (!merged.target_revenue_max && bc.size_criteria.revenue_max)
            merged.target_revenue_max = bc.size_criteria.revenue_max;
          if (!merged.target_ebitda_min && bc.size_criteria.ebitda_min)
            merged.target_ebitda_min = bc.size_criteria.ebitda_min;
          if (!merged.target_ebitda_max && bc.size_criteria.ebitda_max)
            merged.target_ebitda_max = bc.size_criteria.ebitda_max;
        }

        if (bc?.geography_criteria) {
          if (!merged.target_geographies.length && bc.geography_criteria.target_regions?.length) {
            merged.target_geographies = bc.geography_criteria.target_regions;
          }
          if (!merged.target_states.length && bc.geography_criteria.target_states?.length) {
            merged.target_states = bc.geography_criteria.target_states;
          }
          if (!merged.geographic_flexibility && bc.geography_criteria.geographic_flexibility) {
            merged.geographic_flexibility = bc.geography_criteria.geographic_flexibility;
          }
        }

        if (bc?.service_criteria) {
          if (!merged.target_services.length && bc.service_criteria.target_services?.length) {
            merged.target_services = bc.service_criteria.target_services;
          }
        }

        if (bc?.deal_structure) {
          if (!merged.deal_types.length && bc.deal_structure.deal_types?.length) {
            merged.deal_types = bc.deal_structure.deal_types;
          }
          if (
            !merged.structure_preferences.length &&
            bc.deal_structure.structure_preferences?.length
          ) {
            merged.structure_preferences = bc.deal_structure.structure_preferences;
          }
          if (
            !merged.preferred_characteristics.length &&
            bc.deal_structure.preferred_characteristics?.length
          ) {
            merged.preferred_characteristics = bc.deal_structure.preferred_characteristics;
          }
        }

        if (bp) {
          if (!merged.thesis_summary && bp.thesis_summary)
            merged.thesis_summary = bp.thesis_summary;
          if (!merged.acquisition_timeline && bp.acquisition_timeline)
            merged.acquisition_timeline = bp.acquisition_timeline;
        }

        if (!merged.overall_confidence && insights.overall_confidence) {
          merged.overall_confidence = insights.overall_confidence;
        }
      }

      return merged;
    },
    enabled: !!buyerId,
    staleTime: 60_000,
  });
}
