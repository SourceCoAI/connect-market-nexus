import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/error-response.ts';
import { requireAdmin } from '../_shared/auth.ts';

interface BuyerRecord {
  buyer: Record<string, unknown>;
  contact: Record<string, string> | null;
  existingBuyerId: string | null;
}

interface ImportRequest {
  buyers: BuyerRecord[];
  universeId: string | null;
}

function normalizeDomain(url: string | null): string | null {
  if (!url) return null;
  let domain = url.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.replace(/[/?#].*$/, '');
  domain = domain.replace(/:\d+$/, '');
  domain = domain.replace(/\.$/, '');
  domain = domain.trim();
  return domain || null;
}

/** Columns safe to insert into the buyers table */
const KNOWN_BUYER_COLUMNS = new Set([
  'company_name', 'company_website', 'platform_website', 'pe_firm_name',
  'pe_firm_website', 'buyer_type', 'hq_city', 'hq_state', 'hq_country',
  'hq_region', 'thesis_summary', 'target_revenue_min', 'target_revenue_max',
  'target_ebitda_min', 'target_ebitda_max', 'target_geographies',
  'target_services', 'target_industries', 'geographic_footprint',
  'investment_date', 'notes', 'universe_id', 'buyer_linkedin',
  'pe_firm_linkedin', 'business_summary', 'business_type',
  'industry_vertical', 'services_offered', 'num_employees',
  'number_of_locations', 'revenue_model', 'service_regions',
  'operating_locations',
]);

/** Build a parameterized INSERT from a buyer object */
function buildInsertQuery(buyer: Record<string, unknown>): { sql: string; values: unknown[] } {
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(buyer)) {
    if (!KNOWN_BUYER_COLUMNS.has(key) || value === undefined) continue;
    columns.push(key);
    placeholders.push(Array.isArray(value) ? `$${idx}::text[]` : `$${idx}`);
    values.push(value);
    idx++;
  }

  if (columns.length === 0) return { sql: '', values: [] };
  return {
    sql: `INSERT INTO public.buyers (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    values,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return errorResponse(
        auth.error || 'Admin access required',
        auth.authenticated ? 403 : 401,
        corsHeaders,
        auth.authenticated ? 'forbidden' : 'unauthorized',
      );
    }

    const { buyers: records, universeId }: ImportRequest = await req.json();

    if (!records || !Array.isArray(records)) {
      return errorResponse('buyers array is required', 400, corsHeaders, 'validation_error');
    }
    if (records.length > 5000) {
      return errorResponse(`Too many buyers: ${records.length} (max 5000)`, 400, corsHeaders, 'validation_error');
    }

    let success = 0;
    let errors = 0;
    let skipped = 0;
    let linked = 0;
    let contactsCreated = 0;
    const errorDetails: Array<{ company: string; code: string; message: string }> = [];

    if (records.length > 0) {
      console.log('First buyer payload:', JSON.stringify(records[0].buyer));
    }

    // Use direct Postgres connection to bypass PostgREST + pg_safeupdate.
    // Supabase loads pg_safeupdate for all PostgREST sessions (including service_role),
    // which blocks triggers that do UPDATE without WHERE clause during INSERT.
    let pool: Pool | null = null;
    let conn: Awaited<ReturnType<Pool['connect']>> | null = null;

    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (dbUrl) {
      try {
        pool = new Pool(dbUrl, 1, true);
        conn = await pool.connect();
        // Disable triggers to bypass broken audit_buyer_changes + pg_safeupdate issues
        await conn.queryArray(`SET session_replication_role = 'replica'`);
        console.log('Direct Postgres: connected, triggers disabled');
      } catch (e) {
        console.warn('Direct Postgres unavailable, falling back to PostgREST:', (e as Error).message);
        conn = null;
      }
    } else {
      console.warn('SUPABASE_DB_URL not set, using PostgREST (may fail with pg_safeupdate)');
    }

    try {
      for (const record of records) {
        const { buyer, contact, existingBuyerId } = record;

        // ── Path 1: Link existing buyer to universe ──
        if (existingBuyerId && universeId) {
          let linkSucceeded = false;

          if (conn) {
            try {
              await conn.queryArray(
                `UPDATE public.buyers SET universe_id = $1, updated_at = now() WHERE id = $2`,
                [universeId, existingBuyerId],
              );
              linked++;
              linkSucceeded = true;
            } catch (e) {
              const err = e as Error & { fields?: { code?: string } };
              console.error('Link failed:', existingBuyerId, err.message);
              errors++;
              if (errorDetails.length < 5) {
                errorDetails.push({
                  company: String(buyer?.company_name || existingBuyerId),
                  code: err.fields?.code || 'unknown',
                  message: err.message,
                });
              }
            }
          } else {
            // PostgREST fallback
            const { error: linkError } = await supabase.rpc(
              'update_buyer_universe' as never,
              { p_buyer_id: existingBuyerId, p_universe_id: universeId } as never,
            );
            if (linkError && (linkError as { code?: string }).code === '42883') {
              const { error: directError } = await supabase
                .from('buyers')
                .update({ universe_id: universeId })
                .eq('id', existingBuyerId);
              if (directError) {
                errors++;
                if (errorDetails.length < 5) {
                  errorDetails.push({ company: String(buyer?.company_name || existingBuyerId), code: (directError as { code?: string }).code || 'unknown', message: directError.message });
                }
              } else {
                linked++;
                linkSucceeded = true;
              }
            } else if (linkError) {
              errors++;
              if (errorDetails.length < 5) {
                errorDetails.push({ company: String(buyer?.company_name || existingBuyerId), code: (linkError as { code?: string }).code || 'unknown', message: linkError.message });
              }
            } else {
              linked++;
              linkSucceeded = true;
            }
          }

          // Create contact for existing buyer
          if (contact && linkSucceeded) {
            const contactName =
              contact.name ||
              `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
              'Unknown';
            const { error: contactError } = await supabase
              .from('remarketing_buyer_contacts')
              .insert({
                buyer_id: existingBuyerId,
                name: contactName,
                email: contact.email || null,
                phone: contact.phone || null,
                role: contact.title || null,
                linkedin_url: contact.linkedin_url || null,
                is_primary: true,
              });
            if (!contactError) contactsCreated++;
          }
          continue;
        }

        // ── Path 2: Insert new buyer ──
        if (!buyer || !buyer.company_name) {
          errors++;
          if (errorDetails.length < 5) {
            errorDetails.push({ company: 'Unknown', code: 'missing_name', message: 'company_name is required' });
          }
          continue;
        }

        if (!buyer.company_website || String(buyer.company_website).trim() === '') {
          errors++;
          if (errorDetails.length < 5) {
            errorDetails.push({ company: String(buyer.company_name), code: 'missing_website', message: 'company_website is required' });
          }
          continue;
        }

        if (conn) {
          // ── Direct Postgres INSERT ──
          try {
            const { sql, values } = buildInsertQuery(buyer);
            if (!sql) {
              errors++;
              if (errorDetails.length < 5) {
                errorDetails.push({ company: String(buyer.company_name), code: 'no_columns', message: 'No valid columns' });
              }
              continue;
            }

            const result = await conn.queryObject<{ id: string }>(sql, values);
            const insertedId = result.rows[0]?.id;
            success++;

            // Create contact for new buyer
            if (contact && insertedId) {
              const contactName =
                contact.name ||
                `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
                'Unknown';
              const { error: contactError } = await supabase
                .from('remarketing_buyer_contacts')
                .insert({
                  buyer_id: insertedId,
                  name: contactName,
                  email: contact.email || null,
                  phone: contact.phone || null,
                  role: contact.title || null,
                  linkedin_url: contact.linkedin_url || null,
                  is_primary: true,
                });
              if (!contactError) contactsCreated++;
            }
          } catch (e) {
            const err = e as Error & { fields?: { code?: string } };
            const pgCode = err.fields?.code || '';

            if (pgCode === '23505' && universeId) {
              // Duplicate — try to link to universe
              const domain =
                normalizeDomain(buyer.company_website as string | null) ||
                normalizeDomain(buyer.platform_website as string | null) ||
                normalizeDomain(buyer.pe_firm_website as string | null);
              if (domain) {
                try {
                  const linkResult = await conn.queryObject<{ id: string }>(
                    `UPDATE public.buyers SET universe_id = $1, updated_at = now()
                     WHERE lower(company_website) LIKE $2 AND archived = false
                     RETURNING id`,
                    [universeId, `%${domain}%`],
                  );
                  if (linkResult.rows.length > 0) linked++;
                  else skipped++;
                } catch {
                  skipped++;
                }
              } else {
                skipped++;
              }
            } else if (pgCode === '23505') {
              skipped++;
            } else {
              console.warn('Insert failed:', buyer.company_name, pgCode, err.message);
              errors++;
              if (errorDetails.length < 5) {
                errorDetails.push({ company: String(buyer.company_name), code: pgCode || 'unknown', message: err.message });
              }
            }
          }
        } else {
          // ── PostgREST fallback INSERT ──
          const { error: insertError } = await supabase
            .from('buyers')
            .insert(buyer);

          if (insertError) {
            if (insertError.code === '23505' && universeId) {
              const domain =
                normalizeDomain(buyer.company_website as string | null) ||
                normalizeDomain(buyer.platform_website as string | null) ||
                normalizeDomain(buyer.pe_firm_website as string | null);
              if (domain) {
                const { data: existing } = await supabase
                  .from('buyers')
                  .select('id')
                  .ilike('company_website', `%${domain}%`)
                  .eq('archived', false)
                  .limit(1)
                  .single();
                if (existing) {
                  const { error: directErr } = await supabase
                    .from('buyers')
                    .update({ universe_id: universeId })
                    .eq('id', existing.id);
                  if (!directErr) linked++;
                  else skipped++;
                } else {
                  skipped++;
                }
              } else {
                skipped++;
              }
            } else if (insertError.code === '23505') {
              skipped++;
            } else {
              console.warn('Insert failed:', buyer.company_name, insertError.code, insertError.message);
              errors++;
              if (errorDetails.length < 5) {
                errorDetails.push({ company: String(buyer.company_name), code: insertError.code || 'unknown', message: insertError.message });
              }
            }
            continue;
          }

          success++;

          // Create contact — look up inserted buyer by domain
          if (contact) {
            const domain = normalizeDomain(buyer.company_website as string | null);
            if (domain) {
              const { data: newBuyer } = await supabase
                .from('buyers')
                .select('id')
                .ilike('company_website', `%${domain}%`)
                .eq('archived', false)
                .limit(1)
                .single();
              if (newBuyer?.id) {
                const contactName =
                  contact.name ||
                  `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
                  'Unknown';
                const { error: contactError } = await supabase
                  .from('remarketing_buyer_contacts')
                  .insert({
                    buyer_id: newBuyer.id,
                    name: contactName,
                    email: contact.email || null,
                    phone: contact.phone || null,
                    role: contact.title || null,
                    linkedin_url: contact.linkedin_url || null,
                    is_primary: true,
                  });
                if (!contactError) contactsCreated++;
              }
            }
          }
        }
      }
    } finally {
      // Clean up Postgres connection
      if (conn) {
        try {
          await conn.queryArray(`SET session_replication_role = 'origin'`);
        } catch { /* ignore */ }
        conn.release();
      }
      if (pool) {
        try { await pool.end(); } catch { /* ignore */ }
      }
    }

    return new Response(
      JSON.stringify({ success, errors, skipped, linked, contactsCreated, errorDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('import-buyers error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return errorResponse(message, 500, corsHeaders, 'internal_error');
  }
});
