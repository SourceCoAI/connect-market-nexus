/**
 * handle-buyer-approval: Full buyer integration on admin approval
 *
 * When an admin approves a marketplace buyer, this function runs all
 * integration steps in sequence:
 *   1. Fetch profile data
 *   2. Domain-match existing firm_agreements
 *   3. Create/link firm_agreements
 *   4. Create firm_members
 *   5. Find/create remarketing_buyers
 *   6. Map profile → remarketing_buyers (priority 40, never overwrite)
 *   7. Set marketplace bridge fields
 *   8. Create/update contacts
 *   9. Enqueue PE link check for corporate buyers
 *  10. Resolve agreements (NDA + fee_agreement)
 *  11. Send PandaDoc NDA if not already covered
 *
 * POST body:
 *   - profile_id: UUID of the profiles row
 *
 * Must be called by an admin.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { normalizeBuyerType } from '../_shared/buyer-type-definitions.ts';
import { GENERIC_EMAIL_DOMAINS } from '../_shared/generic-email-domains.ts';

function extractDomain(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase();
  // Exclude generic email providers
  if (GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function extractWebsiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const headers = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const auth = await requireAdmin(req, supabase);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { profile_id } = body;

    if (!profile_id) {
      return new Response(
        JSON.stringify({ error: 'profile_id is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // ── Step 1: Fetch profile ──
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found', details: profileError?.message }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const email = profile.email || '';
    const emailDomain = extractDomain(email);
    const websiteDomain = extractWebsiteDomain(profile.website || profile.buyer_org_url);
    const companyName = profile.company || profile.company_name || '';
    const normalizedBuyerType = normalizeBuyerType(profile.buyer_type);

    // ── Step 2: Domain check — find existing firm ──
    let firmAgreement: Record<string, unknown> | null = null;

    if (emailDomain) {
      const { data: existingFirm } = await supabase
        .from('firm_agreements')
        .select('*')
        .eq('email_domain', emailDomain)
        .limit(1)
        .maybeSingle();

      if (existingFirm) {
        firmAgreement = existingFirm;
      }
    }

    if (!firmAgreement && websiteDomain) {
      const { data: existingFirm } = await supabase
        .from('firm_agreements')
        .select('*')
        .eq('website_domain', websiteDomain)
        .limit(1)
        .maybeSingle();

      if (existingFirm) {
        firmAgreement = existingFirm;
      }
    }

    // ── Step 3: Create firm_agreements if not found ──
    if (!firmAgreement) {
      const { data: newFirm, error: firmError } = await supabase
        .from('firm_agreements')
        .insert({
          primary_company_name: companyName,
          normalized_company_name: companyName.toLowerCase().trim(),
          email_domain: emailDomain,
          website_domain: websiteDomain,
          nda_signed: false,
          fee_agreement_signed: false,
        })
        .select()
        .single();

      if (firmError) {
        console.error('Failed to create firm_agreements:', firmError);
        return new Response(
          JSON.stringify({ error: 'Failed to create firm agreement', details: firmError.message }),
          { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }
      firmAgreement = newFirm;
    }

    const firmId = (firmAgreement as Record<string, unknown>).id as string;

    // ── Step 4: Create firm_members ──
    // Check if this user is already a member
    const { data: existingMember } = await supabase
      .from('firm_members')
      .select('id')
      .eq('firm_id', firmId)
      .eq('user_id', profile_id)
      .maybeSingle();

    if (!existingMember) {
      // Check if this is the first member
      const { count: memberCount } = await supabase
        .from('firm_members')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firmId);

      await supabase
        .from('firm_members')
        .insert({
          firm_id: firmId,
          user_id: profile_id,
          is_primary_contact: (memberCount || 0) === 0,
        });
    }

    // ── Step 5: Find or create remarketing_buyers ──
    let buyerRecord: Record<string, unknown> | null = null;

    // 5a: Search by email domain match on contacts
    if (emailDomain) {
      const { data: contactMatch } = await supabase
        .from('contacts')
        .select('remarketing_buyer_id')
        .ilike('email', `%@${emailDomain}`)
        .eq('contact_type', 'buyer')
        .not('remarketing_buyer_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (contactMatch?.remarketing_buyer_id) {
        const { data: matched } = await supabase
          .from('remarketing_buyers')
          .select('*')
          .eq('id', contactMatch.remarketing_buyer_id)
          .eq('archived', false)
          .maybeSingle();

        if (matched) buyerRecord = matched;
      }
    }

    // 5b: Fuzzy company name match via pg_trgm
    if (!buyerRecord && companyName) {
      const { data: fuzzyMatches } = await supabase
        .rpc('search_buyers_by_similarity', {
          search_name: companyName.toLowerCase().trim(),
          min_similarity: 0.7,
        });

      if (fuzzyMatches && fuzzyMatches.length > 0) {
        const bestMatch = fuzzyMatches[0];
        const { data: matched } = await supabase
          .from('remarketing_buyers')
          .select('*')
          .eq('id', bestMatch.id)
          .eq('archived', false)
          .maybeSingle();

        if (matched) buyerRecord = matched;
      }
    }

    // 5c: Website domain match
    if (!buyerRecord && websiteDomain) {
      const { data: websiteMatch } = await supabase
        .from('remarketing_buyers')
        .select('*')
        .ilike('company_website', `%${websiteDomain}%`)
        .eq('archived', false)
        .limit(1)
        .maybeSingle();

      if (websiteMatch) buyerRecord = websiteMatch;
    }

    // 5d: Create new remarketing_buyers record if no match
    if (!buyerRecord) {
      const newBuyer: Record<string, unknown> = {
        company_name: companyName,
        buyer_type: normalizedBuyerType,
        buyer_type_source: 'signup',
        company_website: profile.website || profile.buyer_org_url || null,
        thesis_summary: profile.ideal_target_description || null,
        target_industries: profile.business_categories || null,
        target_geographies: profile.target_locations || null,
        marketplace_firm_id: firmId,
        is_marketplace_member: true,
        marketplace_joined_at: new Date().toISOString(),
        archived: false,
      };

      // Map deal size fields based on buyer type
      const dealMin = parseFloat(profile.target_deal_size_min || profile.revenue_range_min || '0');
      const dealMax = parseFloat(profile.target_deal_size_max || profile.revenue_range_max || '0');
      if (normalizedBuyerType === 'private_equity' || normalizedBuyerType === 'independent_sponsor') {
        if (dealMin > 0) newBuyer.target_ebitda_min = dealMin;
        if (dealMax > 0) newBuyer.target_ebitda_max = dealMax;
      } else {
        if (dealMin > 0) newBuyer.target_revenue_min = dealMin;
        if (dealMax > 0) newBuyer.target_revenue_max = dealMax;
      }

      const { data: created, error: createError } = await supabase
        .from('remarketing_buyers')
        .insert(newBuyer)
        .select('*')
        .single();

      if (createError) {
        console.error('Failed to create remarketing_buyers:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create buyer record', details: createError.message }),
          { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
        );
      }

      buyerRecord = created;
    }

    const buyerId = (buyerRecord as Record<string, unknown>).id as string;

    // ── Step 6–7: Map profile fields → remarketing_buyers (only fill empty fields) ──
    const updates: Record<string, unknown> = {};

    // Only write to fields that are currently NULL/empty — priority 40 (marketplace profile)
    const br = buyerRecord as Record<string, unknown>;

    if (!br.company_name && companyName) updates.company_name = companyName;
    if (!br.buyer_type && normalizedBuyerType) updates.buyer_type = normalizedBuyerType;
    if (!br.thesis_summary && profile.ideal_target_description) updates.thesis_summary = profile.ideal_target_description;
    if ((!br.target_industries || (Array.isArray(br.target_industries) && br.target_industries.length === 0)) && profile.business_categories?.length) {
      updates.target_industries = profile.business_categories;
    }
    if ((!br.target_geographies || (Array.isArray(br.target_geographies) && br.target_geographies.length === 0)) && profile.target_locations?.length) {
      updates.target_geographies = profile.target_locations;
    }
    if (!br.company_website && (profile.website || profile.buyer_org_url)) {
      updates.company_website = profile.website || profile.buyer_org_url;
    }

    // Step 8: Set marketplace bridge fields
    updates.marketplace_firm_id = firmId;
    updates.is_marketplace_member = true;
    updates.marketplace_joined_at = new Date().toISOString();

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('remarketing_buyers')
        .update(updates)
        .eq('id', buyerId);
    }

    // ── Step 9: Create or update contacts ──
    const contactEmail = email.toLowerCase().trim();
    if (contactEmail) {
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', contactEmail)
        .eq('contact_type', 'buyer')
        .maybeSingle();

      if (existingContact) {
        // Update existing contact
        const contactUpdates: Record<string, unknown> = {
          profile_id: profile_id,
          remarketing_buyer_id: buyerId,
        };
        if (profile.first_name) contactUpdates.first_name = profile.first_name;
        if (profile.last_name) contactUpdates.last_name = profile.last_name;
        if (profile.phone_number) contactUpdates.phone = profile.phone_number;
        if (profile.job_title) contactUpdates.title = profile.job_title;
        if (profile.linkedin_profile) contactUpdates.linkedin_url = profile.linkedin_profile;

        await supabase
          .from('contacts')
          .update(contactUpdates)
          .eq('id', existingContact.id);
      } else {
        // Create new contact
        await supabase
          .from('contacts')
          .insert({
            first_name: profile.first_name || '',
            last_name: profile.last_name || '',
            email: contactEmail,
            phone: profile.phone_number || null,
            title: profile.job_title || null,
            linkedin_url: profile.linkedin_profile || null,
            remarketing_buyer_id: buyerId,
            profile_id: profile_id,
            contact_type: 'buyer',
            is_primary_at_firm: true,
          });
      }
    }

    // ── Step 10: Enqueue PE link check for corporate buyers ──
    if (normalizedBuyerType === 'corporate') {
      const peFirmName = (br.pe_firm_name as string) || null;
      if (peFirmName) {
        await supabase
          .from('pe_link_queue')
          .upsert({
            buyer_id: buyerId,
            pe_firm_name_raw: peFirmName,
            queued_at: new Date().toISOString(),
            status: 'pending',
          }, { onConflict: 'buyer_id' });
      }
    }

    // ── Step 11: Resolve agreements ──
    let ndaCovered = false;
    let feeCovered = false;
    let parentName: string | null = null;

    // Check NDA coverage
    try {
      const ndaRes = await fetch(`${supabaseUrl}/functions/v1/resolve-buyer-agreement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ buyer_id: buyerId, agreement_type: 'nda' }),
      });
      const ndaResult = await ndaRes.json();
      ndaCovered = ndaResult.covered === true;
      if (ndaResult.parent_name) parentName = ndaResult.parent_name;
    } catch (err) {
      console.error('Failed to resolve NDA agreement:', err);
    }

    // Check fee agreement coverage
    try {
      const feeRes = await fetch(`${supabaseUrl}/functions/v1/resolve-buyer-agreement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ buyer_id: buyerId, agreement_type: 'fee_agreement' }),
      });
      const feeResult = await feeRes.json();
      feeCovered = feeResult.covered === true;
    } catch (err) {
      console.error('Failed to resolve fee agreement:', err);
    }

    // ── Step 12: Send PandaDoc NDA if not covered ──
    let ndaSent = false;
    if (!ndaCovered && contactEmail) {
      try {
        const pandaDocRes = await fetch(`${supabaseUrl}/functions/v1/create-pandadoc-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            firmId: firmId,
            documentType: 'nda',
            signerEmail: contactEmail,
            signerName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            deliveryMode: 'email',
          }),
        });

        if (pandaDocRes.ok) {
          ndaSent = true;
          // Update NDA status on firm_agreements
          await supabase
            .from('firm_agreements')
            .update({ nda_email_sent: true, nda_email_sent_at: new Date().toISOString() })
            .eq('id', firmId);
        }
      } catch (err) {
        console.error('Failed to send PandaDoc NDA:', err);
      }
    } else if (ndaCovered && parentName) {
      console.log(`NDA covered by parent: ${parentName}. Skipping PandaDoc send.`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        buyer_id: buyerId,
        firm_id: firmId,
        buyer_existed: buyerRecord !== null && !(buyerRecord as Record<string, unknown>).__newly_created,
        nda_covered: ndaCovered,
        fee_covered: feeCovered,
        nda_sent: ndaSent,
        parent_name: parentName,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('handle-buyer-approval error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});
