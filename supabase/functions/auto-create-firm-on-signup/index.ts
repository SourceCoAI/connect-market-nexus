import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { GENERIC_EMAIL_DOMAINS as SHARED_GENERIC_DOMAINS } from '../_shared/generic-email-domains.ts';

/**
 * auto-create-firm-on-signup
 * Called immediately after buyer signup to create the firm_agreements
 * and firm_members records. This allows the NDA signing panel to
 * render on the Pending Approval page before admin approval.
 *
 * Requires an authenticated request (JWT) — extracts userId from token.
 */

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate from JWT — no body fallback to prevent impersonation
    let userId: string | null = null;

    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
      const {
        data: { user },
        error: authError,
      } = await anonClient.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    const body = await req.json().catch(() => ({}));

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Fetch the user's profile to get email and company
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, company, first_name, last_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Profile not found for userId:', userId, profileError);
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Check if user already has a firm membership
    const { data: existingMember } = await supabaseAdmin
      .from('firm_members')
      .select('firm_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (existingMember) {
      console.log(`User ${userId} already has firm ${existingMember.firm_id}`);
      return new Response(
        JSON.stringify({ success: true, firmId: existingMember.firm_id, alreadyExisted: true }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Determine company name and email domain
    const companyName = profile.company || body.company || 'Unknown Company';
    // Strip common business suffixes before normalizing so "ABC Inc" and "ABC Inc." match.
    const BUSINESS_SUFFIXES =
      /\b(inc|llc|llp|ltd|corp|corporation|company|co|group|holdings|partners|lp|plc|pllc|pa|pc|sa|gmbh|ag|pty|srl|bv|nv)\b/gi;
    const normalizedName = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(BUSINESS_SUFFIXES, '')
      .replace(/\s+/g, ' ')
      .trim();
    const emailDomain = profile.email?.split('@')[1] || null;

    // Generic/free email providers — never use these for firm matching because
    // unrelated companies sharing gmail.com would be grouped together.
    const isGenericDomain = emailDomain
      ? SHARED_GENERIC_DOMAINS.has(emailDomain.toLowerCase())
      : false;

    // Find or create firm
    let firmId: string | null = null;

    // Check by email domain first (skip for generic providers)
    if (emailDomain && !isGenericDomain) {
      const { data } = await supabaseAdmin
        .from('firm_agreements')
        .select('id')
        .eq('email_domain', emailDomain)
        .maybeSingle();
      if (data) firmId = data.id;
    }

    // Check by normalized company name
    if (!firmId) {
      const { data } = await supabaseAdmin
        .from('firm_agreements')
        .select('id')
        .eq('normalized_company_name', normalizedName)
        .maybeSingle();
      if (data) firmId = data.id;
    }

    // Create new firm if none found
    if (!firmId) {
      const { data: newFirm, error: firmError } = await supabaseAdmin
        .from('firm_agreements')
        .insert({
          primary_company_name: companyName,
          normalized_company_name: normalizedName,
          email_domain: isGenericDomain ? null : emailDomain,
          nda_signed: false,
          fee_agreement_signed: false,
        })
        .select('id')
        .single();

      if (firmError) {
        console.error('Failed to create firm:', firmError);
        return new Response(JSON.stringify({ error: 'Failed to create firm agreement' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      firmId = newFirm.id;
      console.log(`Created new firm ${firmId} for company "${companyName}"`);
    } else {
      console.log(`Found existing firm ${firmId} for company "${companyName}"`);
    }

    // Create firm_member
    const { error: memberError } = await supabaseAdmin.from('firm_members').insert({
      firm_id: firmId,
      user_id: userId,
      role: 'member',
    });

    if (memberError) {
      console.error('Failed to create firm member:', memberError);
      // Non-fatal — firm exists, member link failed (could be duplicate)
    }

    console.log(`Firm setup complete: user ${userId} → firm ${firmId}`);

    return new Response(
      JSON.stringify({
        success: true,
        firmId,
        firmCreated: true,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('Error in auto-create-firm-on-signup:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
