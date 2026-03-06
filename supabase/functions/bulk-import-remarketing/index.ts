import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/error-response.ts';

// Helper to extract error message from unknown error type
function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

interface ImportData {
  [key: string]: unknown;
  universes: Record<string, unknown>[];
  buyers: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  transcripts: Record<string, unknown>[];
  scores: Record<string, unknown>[];
  learningHistory: Record<string, unknown>[];
  companies: Record<string, unknown>[];
}

// ============= INPUT VALIDATION =============

/**
 * Validate the import data structure before processing
 * Returns { valid: true } or { valid: false, errors: string[] }
 */
function validateImportData(data: ImportData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Import data must be an object'] };
  }

  // Check that arrays are arrays
  const arrayFields = [
    'universes',
    'buyers',
    'contacts',
    'transcripts',
    'scores',
    'learningHistory',
    'companies',
  ];
  for (const field of arrayFields) {
    if (data[field] !== undefined && !Array.isArray(data[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  // Validate universe structure
  if (data.universes?.length > 0) {
    for (let i = 0; i < Math.min(data.universes.length, 5); i++) {
      const u = data.universes[i];
      if (!u.industry_name && !u.name) {
        errors.push(`Universe at index ${i} missing required field: industry_name or name`);
      }
    }
  }

  // Validate buyer structure
  if (data.buyers?.length > 0) {
    for (let i = 0; i < Math.min(data.buyers.length, 5); i++) {
      const b = data.buyers[i];
      if (!b.platform_company_name && !b.company_name) {
        errors.push(
          `Buyer at index ${i} missing required field: platform_company_name or company_name`,
        );
      }
    }
  }

  // Validate contact structure
  if (data.contacts?.length > 0) {
    for (let i = 0; i < Math.min(data.contacts.length, 5); i++) {
      const c = data.contacts[i];
      if (!c.buyer_id) {
        errors.push(`Contact at index ${i} missing required field: buyer_id`);
      }
    }
  }

  // Size limits to prevent abuse
  const MAX_UNIVERSES = 100;
  const MAX_BUYERS = 10000;
  const MAX_CONTACTS = 50000;
  const MAX_TRANSCRIPTS = 10000;
  const MAX_SCORES = 100000;
  const MAX_LEARNING = 100000;

  if (data.universes?.length > MAX_UNIVERSES) {
    errors.push(`Too many universes: ${data.universes.length} (max: ${MAX_UNIVERSES})`);
  }
  if (data.buyers?.length > MAX_BUYERS) {
    errors.push(`Too many buyers: ${data.buyers.length} (max: ${MAX_BUYERS})`);
  }
  if (data.contacts?.length > MAX_CONTACTS) {
    errors.push(`Too many contacts: ${data.contacts.length} (max: ${MAX_CONTACTS})`);
  }
  if (data.transcripts?.length > MAX_TRANSCRIPTS) {
    errors.push(`Too many transcripts: ${data.transcripts.length} (max: ${MAX_TRANSCRIPTS})`);
  }
  if (data.scores?.length > MAX_SCORES) {
    errors.push(`Too many scores: ${data.scores.length} (max: ${MAX_SCORES})`);
  }
  if (data.learningHistory?.length > MAX_LEARNING) {
    errors.push(
      `Too many learning history records: ${data.learningHistory.length} (max: ${MAX_LEARNING})`,
    );
  }

  return { valid: errors.length === 0, errors };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // ── Auth guard: require valid JWT + admin role ──
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return errorResponse('Unauthorized', 401, corsHeaders, 'unauthorized');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return errorResponse('Unauthorized', 401, corsHeaders, 'unauthorized');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: callerUser.id });
    if (!isAdmin) {
      return errorResponse('Forbidden: admin access required', 403, corsHeaders, 'forbidden');
    }
    // ── End auth guard ──

    const {
      action,
      data,
      confirmClear,
    }: { action: string; data?: ImportData; confirmClear?: boolean } = await req.json();

    // Validate action
    if (!['clear', 'import', 'validate'].includes(action)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid action. Must be: clear, import, or validate',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (action === 'clear') {
      // SECURITY: Require explicit confirmation for destructive action
      if (confirmClear !== true) {
        return new Response(
          JSON.stringify({
            error: 'Clear action requires explicit confirmation',
            message:
              'Set confirmClear: true to confirm you want to delete ALL remarketing data. This action cannot be undone.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      // Clear existing data in reverse dependency order
      // Track what we're deleting for audit
      const { count: learningCount } = await supabase
        .from('buyer_learning_history')
        .select('*', { count: 'exact', head: true });
      const { count: scoreCount } = await supabase
        .from('remarketing_scores')
        .select('*', { count: 'exact', head: true });
      const { count: transcriptCount } = await supabase
        .from('buyer_transcripts')
        .select('*', { count: 'exact', head: true });
      const { count: contactCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });
      const { count: buyerCount } = await supabase
        .from('buyers')
        .select('*', { count: 'exact', head: true });
      const { count: universeCount } = await supabase
        .from('buyer_universes')
        .select('*', { count: 'exact', head: true });

      // Audit log: record who cleared data and what was deleted
      await supabase.from('user_activity').insert({
        user_id: callerUser.id,
        activity_type: 'bulk_clear_remarketing',
        metadata: {
          timestamp: new Date().toISOString(),
          counts_before_delete: {
            learningHistory: learningCount || 0,
            scores: scoreCount || 0,
            transcripts: transcriptCount || 0,
            contacts: contactCount || 0,
            buyers: buyerCount || 0,
            universes: universeCount || 0,
          },
        },
      });

      // Delete in order respecting foreign key constraints
      const deleteErrors: string[] = [];

      const { error: learningError } = await supabase
        .from('buyer_learning_history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (learningError) {
        console.error('Failed to delete learning history:', learningError);
        deleteErrors.push(`learning_history: ${learningError.message}`);
      }

      const { error: scoresError } = await supabase
        .from('remarketing_scores')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (scoresError) {
        console.error('Failed to delete scores:', scoresError);
        deleteErrors.push(`scores: ${scoresError.message}`);
      }

      const { error: transcriptsError } = await supabase
        .from('buyer_transcripts')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (transcriptsError) {
        console.error('Failed to delete transcripts:', transcriptsError);
        deleteErrors.push(`transcripts: ${transcriptsError.message}`);
      }

      const { error: contactsError } = await supabase
        .from('contacts')
        .delete()
        .eq('contact_type', 'buyer')
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (contactsError) {
        console.error('Failed to delete contacts:', contactsError);
        deleteErrors.push(`contacts: ${contactsError.message}`);
      }

      const { error: buyersError } = await supabase
        .from('buyers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (buyersError) {
        console.error('Failed to delete buyers:', buyersError);
        deleteErrors.push(`buyers: ${buyersError.message}`);
      }

      const { error: universesError } = await supabase
        .from('buyer_universes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (universesError) {
        console.error('Failed to delete universes:', universesError);
        deleteErrors.push(`universes: ${universesError.message}`);
      }

      if (deleteErrors.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Some delete operations failed',
            errors: deleteErrors,
            deleted: {
              learningHistory: learningError ? 0 : learningCount || 0,
              scores: scoresError ? 0 : scoreCount || 0,
              transcripts: transcriptsError ? 0 : transcriptCount || 0,
              contacts: contactsError ? 0 : contactCount || 0,
              buyers: buyersError ? 0 : buyerCount || 0,
              universes: universesError ? 0 : universeCount || 0,
            },
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Cleared all remarketing data',
          deleted: {
            learningHistory: learningCount || 0,
            scores: scoreCount || 0,
            transcripts: transcriptCount || 0,
            contacts: contactCount || 0,
            buyers: buyerCount || 0,
            universes: universeCount || 0,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Handle 'validate' action - dry run to check data before import
    if (action === 'validate') {
      if (!data) {
        return errorResponse(
          'No data provided for validation',
          400,
          corsHeaders,
          'validation_error',
        );
      }

      const validation = validateImportData(data);
      return new Response(
        JSON.stringify({
          valid: validation.valid,
          errors: validation.errors,
          summary: {
            universes: data.universes?.length || 0,
            buyers: data.buyers?.length || 0,
            contacts: data.contacts?.length || 0,
            transcripts: data.transcripts?.length || 0,
            scores: data.scores?.length || 0,
            learningHistory: data.learningHistory?.length || 0,
            companies: data.companies?.length || 0,
          },
        }),
        {
          status: validation.valid ? 200 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (action === 'import' && data) {
      // SECURITY: Validate input before processing
      const validation = validateImportData(data);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            error: 'Invalid import data',
            validationErrors: validation.errors,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      console.log(`Starting import at ${new Date().toISOString()}`);
      console.log(
        `Data counts: ${data.universes?.length || 0} universes, ${data.buyers?.length || 0} buyers, ${data.contacts?.length || 0} contacts`,
      );

      const results = {
        universes: { imported: 0, errors: [] as string[] },
        buyers: { imported: 0, errors: [] as string[] },
        contacts: { imported: 0, errors: [] as string[] },
        transcripts: { imported: 0, errors: [] as string[] },
        scores: { imported: 0, errors: [] as string[] },
        learningHistory: { imported: 0, errors: [] as string[] },
        dealMappings: {} as Record<string, string>,
      };

      // ID Mappings
      const universeIdMap: Record<string, string> = {};
      const buyerIdMap: Record<string, string> = {};
      const dealIdMap: Record<string, string> = {};

      // Step 1: Import Universes (industry_trackers -> buyer_universes)
      console.log(`Importing ${data.universes?.length || 0} universes...`);
      for (const row of (data.universes || []) as Record<string, unknown>[]) {
        try {
          const universeData = {
            name: row.industry_name || 'Unknown',
            description: null,
            fit_criteria: row.fit_criteria || null,
            size_criteria: parseJson(row.size_criteria) || {},
            geography_criteria: parseJson(row.geography_criteria) || {},
            service_criteria: parseJson(row.service_criteria) || {},
            buyer_types_criteria: parseJson(row.buyer_types_criteria) || {},
            geography_weight: parseInt(String(row.geography_weight)) || 25,
            size_weight: parseInt(String(row.size_weight)) || 25,
            service_weight: parseInt(String(row.service_mix_weight)) || 25,
            owner_goals_weight: parseInt(String(row.owner_goals_weight)) || 25,
            scoring_behavior: parseJson(row.scoring_behavior) || {},
            ma_guide_content: row.industry_template || row.ma_guide_content || null,
            documents: parseJson(row.documents) || [],
            archived: row.archived === 'true',
          };

          const { data: inserted, error } = await supabase
            .from('buyer_universes')
            .insert(universeData)
            .select('id')
            .single();

          if (error) {
            results.universes.errors.push(`Universe ${row.industry_name}: ${error.message}`);
          } else {
            universeIdMap[String(row.id)] = inserted.id;
            results.universes.imported++;
          }
        } catch (e) {
          results.universes.errors.push(`Universe ${row.industry_name}: ${getErrorMessage(e)}`);
        }
      }
      console.log(`Imported ${results.universes.imported} universes`);

      // Step 2: Import Buyers
      console.log(`Importing ${data.buyers?.length || 0} buyers...`);
      for (const row of (data.buyers || []) as Record<string, unknown>[]) {
        try {
          const mappedUniverseId = universeIdMap[String(row.tracker_id)] || null;

          const buyerData = {
            universe_id: mappedUniverseId,
            company_name: row.platform_company_name || row.company_name || 'Unknown',
            company_website:
              normalizeDomainUrl(row.platform_website as string | null | undefined) || null,
            buyer_type: 'corporate',
            is_pe_backed: !!row.pe_firm_name,
            buyer_type_source: 'import',
            thesis_summary: row.thesis_summary || null,

            target_revenue_min: parseFloat(String(row.min_revenue)) || null,
            target_revenue_max: parseFloat(String(row.max_revenue)) || null,
            target_ebitda_min: parseFloat(String(row.min_ebitda)) || null,
            target_ebitda_max: parseFloat(String(row.max_ebitda)) || null,
            target_geographies: parseArray(row.target_geographies) || [],
            target_services: parseArray(row.services_offered) || [],
            target_industries: parseArray(row.target_industries) || [],
            geographic_footprint: parseArray(row.geographic_footprint) || [],
            recent_acquisitions: parseJson(row.recent_acquisitions) || [],
            portfolio_companies: parseJson(row.portfolio_companies) || [],
            extraction_sources: parseJson(row.extraction_sources) || [],
            notes: null,
            archived: false,
            pe_firm_name: row.pe_firm_name || null,
            hq_city: row.hq_city || null,
            hq_state: row.hq_state || null,
            hq_country: row.hq_country || 'United States',
            hq_region: row.hq_region || null,
            pe_firm_website:
              normalizeDomainUrl(row.pe_firm_website as string | null | undefined) || null,
            buyer_linkedin: row.buyer_linkedin || null,
            pe_firm_linkedin: row.pe_firm_linkedin || null,
            business_summary: row.business_summary || null,
            industry_vertical: row.industry_vertical || null,
            specialized_focus: row.specialized_focus || null,
            acquisition_appetite: row.acquisition_appetite || null,
            strategic_priorities: parseArray(row.strategic_priorities) || [],
            total_acquisitions: parseInt(String(row.total_acquisitions)) || null,
            acquisition_frequency: row.acquisition_frequency || null,
            fee_agreement_status: row.fee_agreement_status || null,
          };

          const { data: inserted, error } = await supabase
            .from('buyers')
            .insert(buyerData)
            .select('id')
            .single();

          if (error) {
            results.buyers.errors.push(
              `Buyer ${row.platform_company_name || row.company_name}: ${error.message}`,
            );
          } else {
            buyerIdMap[String(row.id)] = inserted.id;
            results.buyers.imported++;
          }
        } catch (e) {
          results.buyers.errors.push(
            `Buyer ${row.platform_company_name || row.company_name}: ${getErrorMessage(e)}`,
          );
        }
      }
      console.log(`Imported ${results.buyers.imported} buyers`);

      // Step 3: Build deal mappings (companies -> listings)
      console.log('Building deal mappings...');
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, location, revenue');

      // Known mappings from scores/learning_history deal_ids to listing titles
      // These map legacy deal IDs to search terms that match listings in the DB
      const knownDealMappings: Record<string, string> = {
        '74cbd4bb-d32f-47c8-b4e8-d9f8812384af': 'Missouri', // Auto Body Brothers - Missouri
        '72557118-7fe3-4b6a-aa5e-e497599669f5': 'Roofing', // Quality Roofing - Florida
        '919a987d-a16b-4a43-9828-d8ac115bc1a1': 'Collision', // Threefold Collision - OK
        '28ba3ed0-b463-41b8-924f-48ca2cedab62': 'HVAC', // Dockery's HVAC - GA
        '894cd67e-a9bf-42b0-96cf-179080f5e702': 'Auto', // Auto repair
        'd8ea8f3c-ac2e-49ce-a245-08474dbcc9c0': 'Connecticut', // Shoreline CT Collision - map to CT
        'd7f0c8f3-a46d-4f58-9f12-f28203b4d2d0': 'Mississippi', // MS collision deal - may not have matching listing
      };

      // First, use known mappings
      if (listings) {
        for (const [oldDealId, searchTerm] of Object.entries(knownDealMappings)) {
          const match = listings.find((l) =>
            l.title?.toLowerCase().includes(searchTerm.toLowerCase()),
          );
          if (match) {
            dealIdMap[oldDealId] = match.id;
            console.log(`Mapped deal ${oldDealId} -> ${match.title}`);
          }
        }
      }

      // Then map companies data
      for (const company of (data.companies || []) as Record<string, unknown>[]) {
        let matchedListingId = null;

        if (listings) {
          // Try domain match first
          if (company.domain && !(company.domain as string).startsWith('manual-')) {
            const domainMatch = listings.find((l) =>
              l.title
                ?.toLowerCase()
                .includes(
                  (company.domain as string).replace(/\.com|\.net|\.org/g, '').toLowerCase(),
                ),
            );
            if (domainMatch) matchedListingId = domainMatch.id;
          }

          // Try name match
          if (!matchedListingId && company.company_name) {
            const nameWords = (company.company_name as string)
              .toLowerCase()
              .split(/\s+/)
              .filter((w: string) => w.length > 3);
            const nameMatch = listings.find((l) => {
              const titleLower = l.title?.toLowerCase() || '';
              return nameWords.some((word: string) => titleLower.includes(word));
            });
            if (nameMatch) matchedListingId = nameMatch.id;
          }
        }

        if (matchedListingId) {
          dealIdMap[String(company.id)] = matchedListingId;
        }
      }
      results.dealMappings = dealIdMap;
      console.log(`Mapped ${Object.keys(dealIdMap).length} deals to listings`);

      // Step 4: Import Contacts
      console.log(`Importing ${data.contacts?.length || 0} contacts...`);
      for (const row of (data.contacts || []) as Record<string, unknown>[]) {
        try {
          const mappedBuyerId = buyerIdMap[String(row.buyer_id)];
          if (!mappedBuyerId) {
            results.contacts.errors.push(`Contact ${row.name}: No buyer mapping`);
            continue;
          }

          const nameParts = (row.name || 'Unknown').trim().split(/\s+/);
          const contactData = {
            remarketing_buyer_id: mappedBuyerId,
            first_name: nameParts[0] || 'Unknown',
            last_name: nameParts.slice(1).join(' ') || '',
            email: row.email || null,
            phone: row.phone || null,
            title: row.title || null,
            linkedin_url: row.linkedin_url || null,
            is_primary_at_firm: row.is_primary_contact === 'true',
            contact_type: 'buyer',
            source: row.source || 'import',
          };

          const { error } = await supabase
            .from('contacts')
            .upsert(contactData, {
              onConflict: 'remarketing_buyer_id,first_name,last_name',
              ignoreDuplicates: false,
            });

          if (error) {
            results.contacts.errors.push(`Contact ${row.name}: ${error.message}`);
          } else {
            results.contacts.imported++;
          }
        } catch (e) {
          results.contacts.errors.push(`Contact ${row.name}: ${getErrorMessage(e)}`);
        }
      }
      console.log(`Imported ${results.contacts.imported} contacts`);

      // Step 5: Import Transcripts
      console.log(`Importing ${data.transcripts?.length || 0} transcripts...`);
      for (const row of (data.transcripts || []) as Record<string, unknown>[]) {
        try {
          const mappedBuyerId = buyerIdMap[String(row.buyer_id)];
          if (!mappedBuyerId) {
            console.log(`Transcript: No buyer mapping for ${row.buyer_id}`);
            results.transcripts.errors.push(
              `Transcript ${row.title || row.id}: No buyer mapping for ${row.buyer_id}`,
            );
            continue;
          }

          // The CSV has: title, transcript_type, url, notes, extracted_data
          // The source column has a check constraint: must be 'call', 'meeting', 'email', 'other'
          // Valid source values: 'call', 'meeting', 'email', 'other'
          let sourceValue = 'other';
          if (row.transcript_type) {
            const typeLC = (row.transcript_type as string).toLowerCase();
            if (typeLC.includes('call')) sourceValue = 'call';
            else if (typeLC.includes('meeting')) sourceValue = 'meeting';
            else if (typeLC.includes('email')) sourceValue = 'email';
          }

          const transcriptData = {
            buyer_id: mappedBuyerId,
            transcript_text: row.notes || row.title || row.transcript_type || 'Imported transcript',
            source: sourceValue,
            extracted_data: parseJson(row.extracted_data),
            processed_at: row.processed_at || null,
          };

          console.log(`Inserting transcript for buyer ${mappedBuyerId}`);
          const { error } = await supabase.from('buyer_transcripts').insert(transcriptData);

          if (error) {
            console.log(`Transcript error: ${error.message}`);
            results.transcripts.errors.push(`Transcript ${row.title}: ${error.message}`);
          } else {
            results.transcripts.imported++;
          }
        } catch (e) {
          console.log(`Transcript exception: ${getErrorMessage(e)}`);
          results.transcripts.errors.push(`Transcript ${row.title}: ${getErrorMessage(e)}`);
        }
      }
      console.log(`Imported ${results.transcripts.imported} transcripts`);

      // Step 6: Import Scores
      console.log(`Importing ${data.scores?.length || 0} scores...`);
      console.log(`Available deal mappings: ${JSON.stringify(Object.keys(dealIdMap))}`);

      // Sample unique deal IDs from scores to understand what we need to map
      const uniqueDealIds = [
        ...new Set((data.scores || []).map((s: Record<string, unknown>) => s.deal_id)),
      ];
      console.log(`Unique deal IDs in scores: ${JSON.stringify(uniqueDealIds.slice(0, 10))}...`);

      for (const row of (data.scores || []) as Record<string, unknown>[]) {
        try {
          const mappedBuyerId = buyerIdMap[String(row.buyer_id)];
          const mappedListingId = dealIdMap[String(row.deal_id)];

          if (!mappedBuyerId) {
            results.scores.errors.push(`Score: No buyer mapping for ${row.buyer_id}`);
            continue;
          }
          if (!mappedListingId) {
            // Only log first few to avoid spam
            if (results.scores.errors.length < 10) {
              console.log(`Score: No listing mapping for deal ${row.deal_id}`);
            }
            results.scores.errors.push(`Score: No listing mapping for deal ${row.deal_id}`);
            continue;
          }

          const scoreData = {
            buyer_id: mappedBuyerId,
            listing_id: mappedListingId,
            universe_id: null,
            composite_score: parseFloat(String(row.composite_score)) || 0,
            geography_score: parseFloat(String(row.geography_score)) || 0,
            size_score: 0,
            service_score: parseFloat(String(row.service_score)) || 0,
            owner_goals_score: 0,
            tier: calculateTier(parseFloat(String(row.composite_score)) || 0),
            fit_reasoning: row.fit_reasoning || null,
            status: row.selected_for_outreach === 'true' ? 'approved' : 'pending',
            human_override_score: parseFloat(String(row.human_override_score)) || null,
            scored_at: (row.scored_at as string) || new Date().toISOString(),
            pass_reason: row.pass_reason || null,
            pass_category: row.pass_category || null,
          };

          const { error } = await supabase.from('remarketing_scores').insert(scoreData);

          if (error) {
            results.scores.errors.push(`Score: ${error.message}`);
          } else {
            results.scores.imported++;
          }
        } catch (e) {
          results.scores.errors.push(`Score: ${getErrorMessage(e)}`);
        }
      }
      console.log(`Imported ${results.scores.imported} scores`);

      // Step 7: Import Learning History
      console.log(`Importing ${data.learningHistory?.length || 0} learning history records...`);
      for (const row of (data.learningHistory || []) as Record<string, unknown>[]) {
        try {
          const mappedBuyerId = buyerIdMap[String(row.buyer_id)];
          const mappedListingId = dealIdMap[String(row.deal_id)];

          console.log(
            `Learning: buyer ${row.buyer_id} -> ${mappedBuyerId}, deal ${row.deal_id} -> ${mappedListingId}`,
          );

          if (!mappedBuyerId) {
            console.log(`Learning: No buyer mapping for ${row.buyer_id}`);
            results.learningHistory.errors.push(`Learning: No buyer mapping for ${row.buyer_id}`);
            continue;
          }
          if (!mappedListingId) {
            console.log(`Learning: No listing mapping for ${row.deal_id}`);
            results.learningHistory.errors.push(`Learning: No listing mapping for ${row.deal_id}`);
            continue;
          }

          // Map action_type to allowed values: 'approved', 'passed', 'hidden'
          // CSV has: not_a_fit, approved, hidden, etc.
          let mappedAction = 'passed'; // default
          const actionType = String(row.action_type || '').toLowerCase();
          if (actionType === 'approved' || actionType === 'approve') {
            mappedAction = 'approved';
          } else if (actionType === 'hidden' || actionType === 'hide') {
            mappedAction = 'hidden';
          } else if (
            actionType === 'not_a_fit' ||
            actionType === 'passed' ||
            actionType === 'reject'
          ) {
            mappedAction = 'passed';
          }

          const historyData = {
            buyer_id: mappedBuyerId,
            listing_id: mappedListingId,
            action: mappedAction,
            pass_category: row.rejection_categories || null,
            pass_reason: row.rejection_reason || null,
            action_by: row.created_by || null,
          };

          console.log(`Inserting learning history: ${JSON.stringify(historyData)}`);
          const { error } = await supabase.from('buyer_learning_history').insert(historyData);

          if (error) {
            console.log(`Learning error: ${error.message}`);
            results.learningHistory.errors.push(`Learning: ${error.message}`);
          } else {
            results.learningHistory.imported++;
          }
        } catch (e) {
          results.learningHistory.errors.push(`Learning: ${getErrorMessage(e)}`);
        }
      }
      console.log(`Imported ${results.learningHistory.imported} learning history records`);

      // Sanitize error messages before returning to client (remove buyer names, schema details)
      const sanitizeErrors = (errors: string[]) =>
        errors.map((e) =>
          e.replace(/Buyer [^:]+:/g, 'Record:').replace(/at index \d+/g, 'at index [N]'),
        );
      const sanitizedResults = {
        ...results,
        universes: { ...results.universes, errors: sanitizeErrors(results.universes.errors) },
        buyers: { ...results.buyers, errors: sanitizeErrors(results.buyers.errors) },
        contacts: { ...results.contacts, errors: sanitizeErrors(results.contacts.errors) },
        scores: { ...results.scores, errors: sanitizeErrors(results.scores.errors) },
        learningHistory: {
          ...results.learningHistory,
          errors: sanitizeErrors(results.learningHistory.errors),
        },
      };

      return new Response(JSON.stringify(sanitizedResults), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return errorResponse('Invalid action', 400, corsHeaders, 'validation_error');
  } catch (error) {
    console.error('Import error:', error);
    return errorResponse(getErrorMessage(error), 500, corsHeaders, 'internal_error');
  }
});

// Domain normalization for dedup
function normalizeDomainUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let domain = url.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.split('/')[0];
  domain = domain.split(':')[0];
  if (!domain || !domain.includes('.')) return url.trim() || null; // fallback to original if not a valid domain
  return domain;
}

// Helper functions
function parseJson(value: unknown, fieldName?: string): unknown {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (e) {
    console.warn(
      `Failed to parse JSON${fieldName ? ` in field '${fieldName}'` : ''}: ${e instanceof Error ? e.message : 'unknown error'}`,
    );
    return null;
  }
}

function parseArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }
}

function calculateTier(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}
