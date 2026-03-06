import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

interface ValidationResult {
  status: 'complete' | 'partial' | 'insufficient';
  completenessScore: number;
  missingFields: string[];
  warnings: string[];
  fieldScores: Record<string, { score: number; present: boolean; quality: string }>;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { tracker_id, size_criteria, service_criteria, geography_criteria, buyer_types_criteria } = await req.json();

    let criteria = {
      size_criteria,
      service_criteria,
      geography_criteria,
      buyer_types_criteria
    };

    // If tracker_id provided, fetch criteria from database
    if (tracker_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: tracker, error } = await supabase
        .from('industry_trackers')
        .select('size_criteria, service_criteria, geography_criteria, buyer_types_criteria')
        .eq('id', tracker_id)
        .single();

      if (error) throw error;
      
      criteria = {
        size_criteria: tracker?.size_criteria || size_criteria,
        service_criteria: tracker?.service_criteria || service_criteria,
        geography_criteria: tracker?.geography_criteria || geography_criteria,
        buyer_types_criteria: tracker?.buyer_types_criteria || buyer_types_criteria
      };
    }

    const result = validateCriteria(criteria);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in validate-criteria:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function validateCriteria(criteria: Record<string, unknown>): ValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  const fieldScores: Record<string, { score: number; present: boolean; quality: string }> = {};

  let totalScore = 0;
  const weights = {
    size_criteria: 40,
    service_criteria: 25,
    geography_criteria: 20,
    buyer_types_criteria: 15
  };

  // Validate size criteria (40 points)
  const sizeScore = validateSizeCriteria(criteria.size_criteria as Record<string, unknown> | undefined);
  fieldScores['size_criteria'] = sizeScore;
  totalScore += sizeScore.score * (weights.size_criteria / 100);
  if (!sizeScore.present) missingFields.push('Size criteria (revenue/EBITDA ranges)');
  if (sizeScore.quality === 'low') warnings.push('Size criteria may be too broad or missing key ranges');

  // Validate service criteria (25 points)
  const serviceScore = validateServiceCriteria(criteria.service_criteria as Record<string, unknown> | undefined);
  fieldScores['service_criteria'] = serviceScore;
  totalScore += serviceScore.score * (weights.service_criteria / 100);
  if (!serviceScore.present) missingFields.push('Service/industry criteria');
  if (serviceScore.quality === 'low') warnings.push('Service criteria lacks specific keywords or categories');

  // Validate geography criteria (20 points)
  const geoScore = validateGeographyCriteria(criteria.geography_criteria as Record<string, unknown> | undefined);
  fieldScores['geography_criteria'] = geoScore;
  totalScore += geoScore.score * (weights.geography_criteria / 100);
  if (!geoScore.present) missingFields.push('Geographic preferences');
  if (geoScore.quality === 'low') warnings.push('Geographic criteria is vague (e.g., just "USA")');

  // Validate buyer types criteria (15 points)
  const buyerScore = validateBuyerTypesCriteria(criteria.buyer_types_criteria as Record<string, unknown> | undefined);
  fieldScores['buyer_types_criteria'] = buyerScore;
  totalScore += buyerScore.score * (weights.buyer_types_criteria / 100);
  if (!buyerScore.present) missingFields.push('Buyer type preferences (PE, Strategic, etc.)');

  const completenessScore = Math.round(totalScore);

  let status: 'complete' | 'partial' | 'insufficient';
  if (completenessScore >= 80) {
    status = 'complete';
  } else if (completenessScore >= 50) {
    status = 'partial';
  } else {
    status = 'insufficient';
  }

  return {
    status,
    completenessScore,
    missingFields,
    warnings,
    fieldScores
  };
}

function validateSizeCriteria(criteria: Record<string, unknown> | undefined): { score: number; present: boolean; quality: string } {
  if (!criteria || typeof criteria !== 'object') {
    return { score: 0, present: false, quality: 'none' };
  }

  let score = 0;
  const checks = [
    'min_revenue', 'max_revenue', 'min_ebitda', 'max_ebitda',
    'sweet_spot_revenue', 'sweet_spot_ebitda', 'revenue_range', 'ebitda_range'
  ];

  for (const check of checks) {
    if (criteria[check] !== undefined && criteria[check] !== null) {
      score += 12.5;
    }
  }

  score = Math.min(score, 100);

  return {
    score,
    present: score > 0,
    quality: score >= 75 ? 'high' : score >= 40 ? 'medium' : 'low'
  };
}

function validateServiceCriteria(criteria: Record<string, unknown> | undefined): { score: number; present: boolean; quality: string } {
  if (!criteria || typeof criteria !== 'object') {
    return { score: 0, present: false, quality: 'none' };
  }

  let score = 0;

  if (criteria.target_services && Array.isArray(criteria.target_services) && criteria.target_services.length > 0) {
    score += 40;
    if (criteria.target_services.length >= 3) score += 20;
  }

  if (criteria.excluded_services && Array.isArray(criteria.excluded_services) && criteria.excluded_services.length > 0) {
    score += 20;
  }

  if (criteria.primary_service || criteria.industry_focus) {
    score += 20;
  }

  score = Math.min(score, 100);

  return {
    score,
    present: score > 0,
    quality: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
  };
}

function validateGeographyCriteria(criteria: Record<string, unknown> | undefined): { score: number; present: boolean; quality: string } {
  if (!criteria || typeof criteria !== 'object') {
    return { score: 0, present: false, quality: 'none' };
  }

  let score = 0;

  if (criteria.target_states && Array.isArray(criteria.target_states) && criteria.target_states.length > 0) {
    score += 50;
    if (criteria.target_states.length >= 3 && criteria.target_states.length <= 15) {
      score += 20; // Specific but not too broad
    }
  }

  if (criteria.excluded_states && Array.isArray(criteria.excluded_states)) {
    score += 15;
  }

  if (criteria.regions || criteria.national === false) {
    score += 15;
  }

  score = Math.min(score, 100);

  return {
    score,
    present: score > 0,
    quality: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
  };
}

function validateBuyerTypesCriteria(criteria: Record<string, unknown> | undefined): { score: number; present: boolean; quality: string } {
  if (!criteria || typeof criteria !== 'object') {
    return { score: 0, present: false, quality: 'none' };
  }

  let score = 0;

  // Audit P1: Added individual_buyers to match 6-type taxonomy
  const buyerTypes = ['pe_firms', 'strategics', 'family_offices', 'search_funds', 'independents', 'individual_buyers'];
  for (const type of buyerTypes) {
    if (criteria[type] !== undefined) {
      score += 20;
    }
  }

  score = Math.min(score, 100);

  return {
    score,
    present: score > 0,
    quality: score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low'
  };
}
