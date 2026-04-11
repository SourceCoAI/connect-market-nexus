import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

/**
 * auto-create-firm-on-approval
 * When a connection request is approved, this function:
 * 1. Creates (or finds) a firm_agreement for the buyer's company
 * 2. Creates a firm_member linking the user to the firm
 * 3. Sends NDA agreement email for signing
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ApprovalRequest {
  connectionRequestId: string;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Admin-only
    const auth = await requireAdmin(req, supabaseAdmin as any);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { connectionRequestId }: ApprovalRequest = await req.json();

    // H1: Input validation
    if (!connectionRequestId) {
      return new Response(JSON.stringify({ error: 'connectionRequestId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!UUID_REGEX.test(connectionRequestId)) {
      return new Response(JSON.stringify({ error: 'Invalid connectionRequestId format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Fetch the connection request with user profile
    const { data: cr, error: crError } = await supabaseAdmin
      .from('connection_requests')
      .select(
        `
        id, user_id, lead_company, lead_email, lead_name, lead_role,
        listing_id, firm_id, status
      `,
      )
      .eq('id', connectionRequestId)
      .single();

    if (crError || !cr) {
      return new Response(JSON.stringify({ error: 'Connection request not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Prevent duplicate processing of already-approved requests
    if (cr.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Cannot approve: request is already ${cr.status}` }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log('📝 Processing approval for connection request:', {
      id: cr.id,
      company: cr.lead_company,
      existingFirmId: cr.firm_id,
    });

    // Always re-resolve firm via email domain / company name — NEVER trust cr.firm_id
    // because it may contain stale/corrupted values from the old circular resolver.
    const companyName = cr.lead_company || 'Unknown Company';
    const BUSINESS_SUFFIXES =
      /\b(inc|llc|llp|ltd|corp|corporation|company|co|group|holdings|partners|lp|plc|pllc|pa|pc|sa|gmbh|ag|pty|srl|bv|nv)\b/gi;
    const normalizedName = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(BUSINESS_SUFFIXES, '')
      .replace(/\s+/g, ' ')
      .trim();
    const emailDomain = cr.lead_email?.split('@')[1] || null;

    const GENERIC_EMAIL_DOMAINS = new Set([
      'gmail.com',
      'googlemail.com',
      'yahoo.com',
      'yahoo.co.uk',
      'outlook.com',
      'hotmail.com',
      'live.com',
      'msn.com',
      'aol.com',
      'icloud.com',
      'me.com',
      'mac.com',
      'protonmail.com',
      'proton.me',
      'mail.com',
      'zoho.com',
      'yandex.com',
      'gmx.com',
      'gmx.net',
      'fastmail.com',
    ]);
    const isGenericDomain = emailDomain
      ? GENERIC_EMAIL_DOMAINS.has(emailDomain.toLowerCase())
      : false;

    // Step 1: Always re-resolve firm (ignore cr.firm_id)
    let firmId: string | null = null;
    let existingFirm = null;

    if (emailDomain && !isGenericDomain) {
      const { data } = await supabaseAdmin
        .from('firm_agreements')
        .select('id')
        .eq('email_domain', emailDomain)
        .maybeSingle();
      existingFirm = data;
    }

    if (!existingFirm) {
      const { data } = await supabaseAdmin
        .from('firm_agreements')
        .select('id')
        .eq('normalized_company_name', normalizedName)
        .maybeSingle();
      existingFirm = data;
    }

    if (existingFirm) {
      firmId = existingFirm.id;
    } else {
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
        console.error('❌ Failed to create firm:', firmError);
        return new Response(JSON.stringify({ error: 'Failed to create firm agreement' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      firmId = newFirm.id;
    }

    // Always update connection request with the correctly resolved firm
    await supabaseAdmin
      .from('connection_requests')
      .update({ firm_id: firmId, updated_at: new Date().toISOString() })
      .eq('id', connectionRequestId);

    // Step 2: Create firm_member if user exists
    if (cr.user_id) {
      const { data: existingMember } = await supabaseAdmin
        .from('firm_members')
        .select('id')
        .eq('firm_id', firmId)
        .eq('user_id', cr.user_id)
        .maybeSingle();

      if (!existingMember) {
        const { error: memberError } = await supabaseAdmin.from('firm_members').insert({
          firm_id: firmId,
          user_id: cr.user_id,
          role: cr.lead_role || 'member',
        });

        if (memberError) {
          console.error('⚠️ Failed to create firm member:', memberError);
        }
      }
    }

    // Step 3: NDA agreement is now handled via email-based flow
    // (send-nda-reminder / request-agreement-email edge functions)

    return new Response(
      JSON.stringify({
        success: true,
        firmId,
        firmCreated: !cr.firm_id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('❌ Error in auto-create-firm-on-approval:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
