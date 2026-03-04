/**
 * resolve-buyer-agreement: Shared agreement resolution logic
 *
 * Determines whether a buyer is covered by an NDA or fee agreement,
 * checking the buyer's own agreement first, then the parent PE firm's.
 *
 * POST body:
 *   - buyer_id: UUID of the remarketing_buyers record
 *   - agreement_type: 'nda' | 'fee_agreement'
 *
 * Returns:
 *   { covered: boolean, source: 'own' | 'parent' | null,
 *     agreement_id: string | null, parent_name: string | null,
 *     parent_exists: boolean }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface ResolutionResult {
  covered: boolean;
  source: 'own' | 'parent' | null;
  agreement_id: string | null;
  parent_name: string | null;
  parent_exists: boolean;
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { buyer_id, agreement_type } = body;

    if (!buyer_id || !agreement_type) {
      return new Response(
        JSON.stringify({ error: 'buyer_id and agreement_type are required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    if (!['nda', 'fee_agreement'].includes(agreement_type)) {
      return new Response(
        JSON.stringify({ error: 'agreement_type must be "nda" or "fee_agreement"' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const result = await resolveBuyerAgreement(supabase, buyer_id, agreement_type);

    return new Response(JSON.stringify(result), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('resolve-buyer-agreement error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});

/**
 * Core resolution logic — exported for use by other edge functions.
 */
export async function resolveBuyerAgreement(
  supabase: ReturnType<typeof createClient>,
  buyerId: string,
  agreementType: 'nda' | 'fee_agreement',
): Promise<ResolutionResult> {
  // Step 1: Fetch the buyer record
  const { data: buyer, error: buyerError } = await supabase
    .from('remarketing_buyers')
    .select('id, marketplace_firm_id, parent_pe_firm_id, parent_pe_firm_name, has_fee_agreement')
    .eq('id', buyerId)
    .single();

  if (buyerError || !buyer) {
    return { covered: false, source: null, agreement_id: null, parent_name: null, parent_exists: false };
  }

  // Determine which status field to check based on agreement_type
  const statusField = agreementType === 'nda' ? 'nda_signed' : 'fee_agreement_signed';

  // Step 2: Check the buyer's own agreement
  if (buyer.marketplace_firm_id) {
    const { data: ownAgreement } = await supabase
      .from('firm_agreements')
      .select('id, nda_signed, fee_agreement_signed')
      .eq('id', buyer.marketplace_firm_id)
      .single();

    if (ownAgreement && ownAgreement[statusField] === true) {
      return {
        covered: true,
        source: 'own',
        agreement_id: ownAgreement.id,
        parent_name: null,
        parent_exists: !!buyer.parent_pe_firm_id,
      };
    }
  }

  // Also check has_fee_agreement flag for fee_agreement type (legacy support)
  if (agreementType === 'fee_agreement' && buyer.has_fee_agreement === true) {
    return {
      covered: true,
      source: 'own',
      agreement_id: buyer.marketplace_firm_id || null,
      parent_name: null,
      parent_exists: !!buyer.parent_pe_firm_id,
    };
  }

  // Step 3: Check parent PE firm
  if (!buyer.parent_pe_firm_id) {
    return {
      covered: false,
      source: null,
      agreement_id: null,
      parent_name: null,
      parent_exists: false,
    };
  }

  // Step 4: Fetch parent record
  const { data: parent, error: parentError } = await supabase
    .from('remarketing_buyers')
    .select('id, company_name, marketplace_firm_id, has_fee_agreement')
    .eq('id', buyer.parent_pe_firm_id)
    .single();

  if (parentError || !parent) {
    return {
      covered: false,
      source: null,
      agreement_id: null,
      parent_name: buyer.parent_pe_firm_name || null,
      parent_exists: true,
    };
  }

  // Step 5: Check parent's agreement
  if (parent.marketplace_firm_id) {
    const { data: parentAgreement } = await supabase
      .from('firm_agreements')
      .select('id, nda_signed, fee_agreement_signed')
      .eq('id', parent.marketplace_firm_id)
      .single();

    if (parentAgreement && parentAgreement[statusField] === true) {
      return {
        covered: true,
        source: 'parent',
        agreement_id: parentAgreement.id,
        parent_name: parent.company_name,
        parent_exists: true,
      };
    }
  }

  // Check parent's has_fee_agreement flag (legacy)
  if (agreementType === 'fee_agreement' && parent.has_fee_agreement === true) {
    return {
      covered: true,
      source: 'parent',
      agreement_id: parent.marketplace_firm_id || null,
      parent_name: parent.company_name,
      parent_exists: true,
    };
  }

  // Step 6: Not covered, but parent exists
  return {
    covered: false,
    source: null,
    agreement_id: null,
    parent_name: parent.company_name,
    parent_exists: true,
  };
}
