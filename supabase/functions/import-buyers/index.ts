import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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

    for (const record of records) {
      const { buyer, contact, existingBuyerId } = record;

      // Path 1: Link existing buyer to universe
      if (existingBuyerId && universeId) {
        const { error: linkError } = await supabase
          .from('buyers')
          .update({ universe_id: universeId })
          .eq('id', existingBuyerId);

        if (linkError) {
          console.error('Link failed:', existingBuyerId, linkError.message);
          errors++;
        } else {
          linked++;
        }

        // Create contact for existing buyer if provided
        if (contact && !linkError) {
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

      // Path 2: Insert new buyer
      if (!buyer || !buyer.company_name) {
        errors++;
        continue;
      }

      const { error: insertError } = await supabase
        .from('buyers')
        .insert(buyer);

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
              .ilike('company_website', `%${domain}%`)
              .eq('archived', false)
              .limit(1)
              .single();

            if (existing) {
              const { error: linkErr } = await supabase
                .from('buyers')
                .update({ universe_id: universeId })
                .eq('id', existing.id);

              if (!linkErr) {
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
      JSON.stringify({ success, errors, skipped, linked, contactsCreated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('import-buyers error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return errorResponse(message, 500, corsHeaders, 'internal_error');
  }
});
