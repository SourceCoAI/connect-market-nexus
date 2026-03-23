import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

/**
 * Escape special characters in a LIKE/ILIKE pattern to prevent
 * user-supplied values from being interpreted as wildcards.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

/**
 * Normalize a URL to its root domain.
 * Mirrors the DB's `extract_domain()` function.
 */
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // Auth guard: require admin
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
      return errorResponse(
        `Too many buyers: ${records.length} (max 5000)`,
        400,
        corsHeaders,
        'validation_error',
      );
    }

    let success = 0;
    let errors = 0;
    let skipped = 0;
    let linked = 0;
    let contactsCreated = 0;
    const errorDetails: Array<{ company: string; code: string; message: string }> = [];

    // Log first buyer for debugging (remove once stable)
    if (records.length > 0) {
      console.log('First buyer payload:', JSON.stringify(records[0].buyer));
    }

    for (const record of records) {
      const { buyer, contact, existingBuyerId } = record;

      // Path 1: Link existing buyer to universe
      if (existingBuyerId && universeId) {
        let linkSucceeded = false;

        // Use RPC to bypass any broken triggers on the buyers table.
        // The audit_buyer_changes trigger may reference dropped columns
        // (deal_breakers) which causes UPDATE to fail.
        const { error: linkError } = await supabase.rpc(
          'update_buyer_universe' as never,
          { p_buyer_id: existingBuyerId, p_universe_id: universeId } as never,
        );

        // Fallback to direct update if RPC doesn't exist
        if (linkError && (linkError as { code?: string }).code === '42883') {
          const { error: directError } = await supabase
            .from('buyers')
            .update({ universe_id: universeId })
            .eq('id', existingBuyerId);

          if (directError) {
            console.error('Link failed:', existingBuyerId, directError.message);
            errors++;
            if (errorDetails.length < 5) {
              errorDetails.push({
                company: String(buyer?.company_name || existingBuyerId),
                code: (directError as { code?: string }).code || 'unknown',
                message: directError.message,
              });
            }
          } else {
            linked++;
            linkSucceeded = true;
          }
        } else if (linkError) {
          console.error('Link failed:', existingBuyerId, linkError.message);
          errors++;
          if (errorDetails.length < 5) {
            errorDetails.push({
              company: String(buyer?.company_name || existingBuyerId),
              code: (linkError as { code?: string }).code || 'unknown',
              message: linkError.message,
            });
          }
        } else {
          linked++;
          linkSucceeded = true;
        }

        // Create contact for existing buyer if provided
        if (contact && linkSucceeded) {
          const nameParts = (contact.name || '').trim().split(/\s+/);
          const firstName = contact.first_name || nameParts[0] || 'Unknown';
          const lastName = contact.last_name || nameParts.slice(1).join(' ') || '';
          const { error: contactError } = await supabase.from('contacts').upsert(
            {
              remarketing_buyer_id: existingBuyerId,
              first_name: firstName,
              last_name: lastName,
              email: contact.email || null,
              phone: contact.phone || null,
              title: contact.title || null,
              linkedin_url: contact.linkedin_url || null,
              is_primary_at_firm: true,
              contact_type: 'buyer',
              source: 'import',
            },
            { onConflict: 'remarketing_buyer_id,first_name,last_name', ignoreDuplicates: false },
          );
          if (!contactError) contactsCreated++;
        }
        continue;
      }

      // Path 2: Insert new buyer
      if (!buyer || !buyer.company_name) {
        errors++;
        if (errorDetails.length < 5) {
          errorDetails.push({
            company: 'Unknown',
            code: 'missing_name',
            message: 'company_name is required',
          });
        }
        continue;
      }

      // Validate company_website (required by DB CHECK constraint for active buyers)
      if (!buyer.company_website || String(buyer.company_website).trim() === '') {
        errors++;
        if (errorDetails.length < 5) {
          errorDetails.push({
            company: String(buyer.company_name),
            code: 'missing_website',
            message: 'company_website is required for active buyers',
          });
        }
        continue;
      }

      const { error: insertError } = await supabase.from('buyers').insert(buyer);

      if (insertError) {
        if (insertError.code === '23505' && universeId) {
          // Unique constraint violation — buyer already exists, try to link
          const domain =
            normalizeDomain(buyer.company_website as string | null) ||
            normalizeDomain(buyer.platform_website as string | null) ||
            normalizeDomain(buyer.pe_firm_website as string | null);

          if (domain) {
            const { data: existing } = await supabase
              .from('buyers')
              .select('id')
              .ilike('company_website', `%${escapeLikePattern(domain)}%`)
              .eq('archived', false)
              .limit(1)
              .single();

            if (existing) {
              // Use RPC to bypass broken audit trigger (same as Path 1)
              const { error: linkErr } = await supabase.rpc(
                'update_buyer_universe' as never,
                { p_buyer_id: existing.id, p_universe_id: universeId } as never,
              );
              // Fallback if RPC doesn't exist
              if (linkErr && (linkErr as { code?: string }).code === '42883') {
                const { error: directErr } = await supabase
                  .from('buyers')
                  .update({ universe_id: universeId })
                  .eq('id', existing.id);
                if (!directErr) linked++;
                else skipped++;
              } else if (!linkErr) {
                linked++;
              } else {
                skipped++;
              }
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
            errorDetails.push({
              company: String(buyer.company_name),
              code: insertError.code || 'unknown',
              message: insertError.message,
            });
          }
        }
        continue;
      }

      success++;

      // Create contact for new buyer — look up the inserted ID by domain
      if (contact) {
        const domain = normalizeDomain(buyer.company_website as string | null);
        if (domain) {
          const { data: newBuyer } = await supabase
            .from('buyers')
            .select('id')
            .ilike('company_website', `%${escapeLikePattern(domain)}%`)
            .eq('archived', false)
            .limit(1)
            .single();

          if (newBuyer?.id) {
            const nameParts2 = (contact.name || '').trim().split(/\s+/);
            const fn = contact.first_name || nameParts2[0] || 'Unknown';
            const ln = contact.last_name || nameParts2.slice(1).join(' ') || '';
            const { error: contactError } = await supabase.from('contacts').upsert(
              {
                remarketing_buyer_id: newBuyer.id,
                first_name: fn,
                last_name: ln,
                email: contact.email || null,
                phone: contact.phone || null,
                title: contact.title || null,
                linkedin_url: contact.linkedin_url || null,
                is_primary_at_firm: true,
                contact_type: 'buyer',
                source: 'import',
              },
              { onConflict: 'remarketing_buyer_id,first_name,last_name', ignoreDuplicates: false },
            );
            if (contactError) {
              console.warn('Contact creation failed for buyer:', newBuyer.id, contactError.message);
            } else {
              contactsCreated++;
            }
          }
        }
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
