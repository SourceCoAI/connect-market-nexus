import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

interface ImportOptions {
  clearExisting?: boolean;
  universeIdMapping?: Record<string, string>;
  buyerIdMapping?: Record<string, string>;
}

interface ImportRequest {
  dataType: 'universes' | 'buyers' | 'contacts' | 'scores' | 'transcripts' | 'learning_history';
  data: Record<string, unknown>[];
  options?: ImportOptions;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SECURITY: Require admin authentication for bulk data imports
    const auth = await requireAdmin(req, supabase);
    if (!auth.authenticated || !auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error || 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { dataType, data, options = {} } = (await req.json()) as ImportRequest;

    console.log(`Importing ${data.length} records of type: ${dataType}`);

    let result: { imported: number; errors: string[]; idMapping?: Record<string, string> } = {
      imported: 0,
      errors: [],
      idMapping: {},
    };

    switch (dataType) {
      case 'universes':
        result = await importUniverses(supabase, data, options);
        break;
      case 'buyers':
        result = await importBuyers(supabase, data, options);
        break;
      case 'contacts':
        result = await importContacts(supabase, data, options);
        break;
      case 'scores':
        result = await importScores(supabase, data, options);
        break;
      case 'transcripts':
        result = await importTranscripts(supabase, data, options);
        break;
      case 'learning_history':
        result = await importLearningHistory(supabase, data, options);
        break;
      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function importUniverses(
  supabase: SupabaseClient,
  data: Record<string, unknown>[],
  _options: ImportOptions,
) {
  const idMapping: Record<string, string> = {};
  const errors: string[] = [];
  let imported = 0;

  for (const row of data) {
    try {
      // Map from SourceCo schema to our schema
      const universe = {
        name: row.industry_name || row.name,
        description: null,
        fit_criteria: row.fit_criteria || null,
        size_criteria: parseJsonField(row.size_criteria),
        geography_criteria: parseJsonField(row.geography_criteria),
        service_criteria: parseJsonField(row.service_criteria),
        buyer_types_criteria: parseJsonField(row.buyer_types_criteria),
        geography_weight: parseFloat(row.geography_weight) || 25,
        size_weight: parseFloat(row.size_weight) || 25,
        service_weight: parseFloat(row.service_mix_weight) || 25,
        owner_goals_weight: parseFloat(row.owner_goals_weight) || 25,
        scoring_behavior: parseJsonField(row.scoring_behavior),
        ma_guide_content: row.ma_guide_content || null,
        kpi_scoring_config: parseJsonField(row.kpi_scoring_config),
        industry_template: row.industry_template || null,
        documents: parseJsonField(row.documents) || [],
        archived: row.archived === 'true' || row.archived === true,
        created_at: row.created_at || new Date().toISOString(),
      };

      const { data: inserted, error } = await supabase
        .from('buyer_universes')
        .insert(universe)
        .select('id')
        .single();

      if (error) {
        console.error(`Error inserting universe ${row.industry_name}:`, error);
        errors.push(`Universe "${row.industry_name}": ${error.message}`);
      } else {
        idMapping[row.id] = inserted.id;
        imported++;
        console.log(`Imported universe: ${row.industry_name} (${row.id} -> ${inserted.id})`);

        // Auto-generate description via clarify-industry (non-blocking)
        const universeName = String(row.industry_name || row.name || '');
        if (universeName) {
          generateUniverseDescription(supabase, inserted.id, universeName).catch((e) =>
            console.warn(`Failed to generate description for ${universeName}:`, e)
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Universe "${row.industry_name}": ${msg}`);
    }
  }

  return { imported, errors, idMapping };
}

async function generateUniverseDescription(supabase: SupabaseClient, universeId: string, name: string) {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${supabaseUrl}/functions/v1/clarify-industry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ industry_name: name, generate_description: true }),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.description) {
        await supabase.from('buyer_universes').update({ description: result.description }).eq('id', universeId);
      }
    }
  } catch (e) {
    console.warn(`Description generation failed for ${name}:`, e);
  }
}

async function importBuyers(
  supabase: SupabaseClient,
  data: Record<string, unknown>[],
  options: ImportOptions,
) {
  const idMapping: Record<string, string> = {};
  const errors: string[] = [];
  let imported = 0;
  const universeMapping = options.universeIdMapping || {};

  for (const row of data) {
    try {
      // Map tracker_id to our universe_id
      const mappedUniverseId = universeMapping[row.tracker_id] || null;

      const buyer = {
        universe_id: mappedUniverseId,
        company_name: row.platform_company_name || row.pe_firm_name || 'Unknown',
        company_website: row.platform_website || null,
        buyer_type: determineBuyerType(row),
        thesis_summary: row.thesis_summary || null,

        target_revenue_min: parseNumber(row.min_revenue),
        target_revenue_max: parseNumber(row.max_revenue),
        target_ebitda_min: parseNumber(row.min_ebitda),
        target_ebitda_max: parseNumber(row.max_ebitda),
        target_geographies:
          parseArrayField(row.target_geographies) || parseArrayField(row.geo_preferences) || [],
        target_services: parseArrayField(row.services_offered) || [],
        target_industries: parseArrayField(row.industry_vertical) || [],
        geographic_footprint: parseArrayField(row.geographic_footprint) || [],
        recent_acquisitions: parseJsonField(row.recent_acquisitions) || [],
        portfolio_companies: parseJsonField(row.portfolio_companies) || [],
        extraction_sources: parseJsonField(row.extraction_sources) || [],
        notes: row.key_quotes || null,
        archived: row.archived === 'true' || row.archived === true,
        // New columns from Phase 1
        pe_firm_name: row.pe_firm_name || null,
        platform_website: row.platform_website || null,
        num_platforms: parseInt(row.num_platforms) || 0,
        hq_city: row.hq_city || null,
        hq_state: row.hq_state || null,
        hq_country: row.hq_country || 'United States',
        hq_region: row.hq_region || null,
        service_regions: parseArrayField(row.service_regions) || [],
        pe_firm_website: row.pe_firm_website || null,
        buyer_linkedin: row.buyer_linkedin || null,
        pe_firm_linkedin: row.pe_firm_linkedin || null,
        operating_locations: parseArrayField(row.operating_locations) || [],
        has_fee_agreement:
          row.has_fee_agreement === 'true' || row.fee_agreement_status === 'signed',
        business_summary: row.business_summary || null,
        industry_vertical: row.industry_vertical || null,
        specialized_focus: row.specialized_focus || null,
        acquisition_appetite: row.acquisition_appetite || null,
        strategic_priorities: parseArrayField(row.strategic_priorities) || [],
        total_acquisitions: parseInt(row.total_acquisitions) || null,
        acquisition_frequency: row.acquisition_frequency || null,
        fee_agreement_status: row.fee_agreement_status || null,

        created_at: row.created_at || new Date().toISOString(),
      };

      const { data: inserted, error } = await supabase
        .from('buyers')
        .insert(buyer)
        .select('id')
        .single();

      if (error) {
        console.error(`Error inserting buyer ${buyer.company_name}:`, error);
        errors.push(`Buyer "${buyer.company_name}": ${error.message}`);
      } else {
        idMapping[row.id] = inserted.id;
        imported++;
        console.log(`Imported buyer: ${buyer.company_name} (${row.id} -> ${inserted.id})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Buyer "${row.platform_company_name || row.pe_firm_name}": ${msg}`);
    }
  }

  return { imported, errors, idMapping };
}

async function importContacts(
  supabase: SupabaseClient,
  data: Record<string, unknown>[],
  options: ImportOptions,
) {
  const errors: string[] = [];
  let imported = 0;
  const buyerMapping = options.buyerIdMapping || {};

  for (const row of data) {
    try {
      const mappedBuyerId = buyerMapping[row.buyer_id];
      if (!mappedBuyerId) {
        errors.push(`Contact "${row.name}": No matching buyer found for ${row.buyer_id}`);
        continue;
      }

      const nameParts = (row.name || 'Unknown').trim().split(/\s+/);
      const contact = {
        remarketing_buyer_id: mappedBuyerId,
        first_name: nameParts[0] || 'Unknown',
        last_name: nameParts.slice(1).join(' ') || '',
        email: row.email || null,
        phone: row.phone || null,
        title: row.title || null,
        linkedin_url: row.linkedin_url || null,
        is_primary_at_firm: row.is_primary_contact === 'true' || row.is_primary_contact === true,
        contact_type: 'buyer',
        source: row.source || 'import',
      };

      const { error } = await supabase
        .from('contacts')
        .upsert(contact, {
          onConflict: 'remarketing_buyer_id,first_name,last_name',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`Error inserting contact ${row.name}:`, error);
        errors.push(`Contact "${row.name}": ${error.message}`);
      } else {
        imported++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Contact "${row.name}": ${msg}`);
    }
  }

  return { imported, errors };
}

async function importScores(
  supabase: SupabaseClient,
  data: Record<string, unknown>[],
  options: ImportOptions,
) {
  const errors: string[] = [];
  let imported = 0;
  const buyerMapping = options.buyerIdMapping || {};

  // First, get existing listings to try to map deal_ids
  const { data: listings } = await supabase.from('listings').select('id, title, domain');

  const listingByDomain: Record<string, string> = {};
  for (const listing of listings || []) {
    if (listing.domain) {
      listingByDomain[listing.domain.toLowerCase()] = listing.id;
    }
  }

  for (const row of data) {
    try {
      const mappedBuyerId = buyerMapping[row.buyer_id];
      if (!mappedBuyerId) {
        errors.push(`Score: No matching buyer for ${row.buyer_id}`);
        continue;
      }

      // Try to find matching listing (you may need to adjust this logic)
      // For now, skip scores that can't be mapped to existing listings
      // This should be handled manually or with a deal import step

      const score = {
        buyer_id: mappedBuyerId,
        listing_id: null, // Will need manual mapping
        universe_id: null,
        composite_score: parseFloat(row.composite_score) || 0,
        geography_score: parseFloat(row.geography_score) || 0,
        size_score: 0, // Not in source data
        service_score: parseFloat(row.service_score) || 0,
        owner_goals_score: 0,
        tier: calculateTier(parseFloat(row.composite_score) || 0),
        fit_reasoning: row.fit_reasoning || null,
        status: row.passed_on_deal ? 'passed' : row.interested ? 'approved' : 'pending',
        pass_reason: row.pass_reason || null,
        pass_category: row.pass_category || null,
        // New columns
        acquisition_score: parseFloat(row.acquisition_score) || null,
        portfolio_score: parseFloat(row.portfolio_score) || null,
        business_model_score: parseFloat(row.business_model_score) || null,
        thesis_bonus: parseFloat(row.thesis_bonus) || 0,
        hidden_from_deal: row.hidden_from_deal === 'true' || row.hidden_from_deal === true,
        rejection_category: row.rejection_category || null,
        rejection_reason: row.rejection_reason || null,
        rejection_notes: row.rejection_notes || null,
        rejected_at: row.rejected_at || null,
        created_at: row.scored_at || new Date().toISOString(),
      };

      // Skip if no listing_id (needs manual mapping)
      if (!score.listing_id) {
        errors.push(`Score for buyer ${row.buyer_id}: Skipped - needs deal mapping`);
        continue;
      }

      const { error } = await supabase.from('remarketing_scores').insert(score);

      if (error) {
        errors.push(`Score: ${error.message}`);
      } else {
        imported++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Score: ${msg}`);
    }
  }

  return { imported, errors };
}

async function importTranscripts(
  supabase: SupabaseClient,
  data: Record<string, unknown>[],
  options: ImportOptions,
) {
  const errors: string[] = [];
  let imported = 0;
  const buyerMapping = options.buyerIdMapping || {};

  for (const row of data) {
    try {
      const mappedBuyerId = buyerMapping[row.buyer_id];
      if (!mappedBuyerId) {
        errors.push(`Transcript: No matching buyer for ${row.buyer_id}`);
        continue;
      }

      const transcript = {
        buyer_id: mappedBuyerId,
        transcript_text: row.transcript || row.transcript_text || '',
        source: row.source || 'call',
        extracted_data: parseJsonField(row.extracted_data) || {},
        processed_at: row.processed_at || null,
        created_at: row.created_at || new Date().toISOString(),
      };

      const { error } = await supabase.from('buyer_transcripts').insert(transcript);

      if (error) {
        errors.push(`Transcript: ${error.message}`);
      } else {
        imported++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Transcript: ${msg}`);
    }
  }

  return { imported, errors };
}

async function importLearningHistory(
  supabase: SupabaseClient,
  data: Record<string, unknown>[],
  options: ImportOptions,
) {
  const errors: string[] = [];
  let imported = 0;
  const buyerMapping = options.buyerIdMapping || {};

  for (const row of data) {
    try {
      const mappedBuyerId = buyerMapping[row.buyer_id];
      if (!mappedBuyerId) {
        errors.push(`Learning history: No matching buyer for ${row.buyer_id}`);
        continue;
      }

      const history = {
        buyer_id: mappedBuyerId,
        listing_id: null, // Needs mapping
        action: row.action_type || 'unknown',
        pass_category: parseArrayField(row.rejection_categories)?.[0] || null,
        pass_reason: row.rejection_reason || null,
        created_at: row.created_at || new Date().toISOString(),
      };

      // Skip if no listing_id mapping
      if (!history.listing_id) {
        continue;
      }

      const { error } = await supabase.from('buyer_learning_history').insert(history);

      if (error) {
        errors.push(`Learning history: ${error.message}`);
      } else {
        imported++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Learning history: ${msg}`);
    }
  }

  return { imported, errors };
}

// Helper functions
function parseJsonField(value: string | object | null | undefined): unknown {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseArrayField(value: string | string[] | null | undefined): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Try splitting by comma
    if (typeof value === 'string' && value.includes(',')) {
      return value.split(',').map((s) => s.trim());
    }
    return value ? [value] : null;
  }
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num =
    typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? null : num;
}

function determineBuyerType(row: Record<string, unknown>): string {
  // PE firm name + separate platform company = corporate (PE-backed)
  if (row.pe_firm_name && row.platform_company_name) return 'corporate';
  // Only PE firm name, no platform = private equity firm itself
  if (row.pe_firm_name) return 'private_equity';
  // Operating company = corporate
  if (row.platform_company_name) return 'corporate';
  return 'corporate';
}

function calculateTier(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}
