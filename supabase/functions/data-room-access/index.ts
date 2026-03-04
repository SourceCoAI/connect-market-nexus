/**
 * data-room-access: Manages buyer access to deal data rooms
 *
 * Admin-only. Supports:
 *   - GET: List access records for a deal (access matrix)
 *   - POST: Grant/update access for a buyer
 *   - DELETE: Revoke access for a buyer
 *
 * POST body:
 *   - deal_id: UUID
 *   - remarketing_buyer_id: UUID (for outbound buyers) — OR —
 *   - marketplace_user_id: UUID (for platform buyers)
 *   - can_view_teaser: boolean
 *   - can_view_full_memo: boolean
 *   - can_view_data_room: boolean
 *   - fee_agreement_override_reason: string (if overriding fee agreement check)
 *
 * POST body (bulk):
 *   - deal_id: UUID
 *   - buyer_ids: Array of { remarketing_buyer_id?: UUID, marketplace_user_id?: UUID }
 *   - can_view_teaser: boolean
 *   - can_view_full_memo: boolean
 *   - can_view_data_room: boolean
 *   - bulk: true
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

interface GrantBody {
  deal_id?: string;
  remarketing_buyer_id?: string;
  marketplace_user_id?: string;
  can_view_teaser?: boolean;
  can_view_full_memo?: boolean;
  can_view_data_room?: boolean;
  fee_agreement_override_reason?: string;
  expires_at?: string;
  bulk?: boolean;
  buyer_ids?: Array<{ remarketing_buyer_id?: string; marketplace_user_id?: string }>;
}

interface AccessRecord {
  deal_id: string;
  can_view_teaser: boolean;
  can_view_full_memo: boolean;
  can_view_data_room: boolean;
  last_modified_by: string;
  last_modified_at: string;
  revoked_at: string | null;
  remarketing_buyer_id?: string;
  marketplace_user_id?: string;
  fee_agreement_override?: boolean;
  fee_agreement_override_reason?: string;
  fee_agreement_override_by?: string;
  expires_at?: string;
  granted_by?: string;
  granted_at?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent') || null;

  try {
    // GET: List access records for a deal
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const dealId = url.searchParams.get('deal_id');

      if (!dealId) {
        return new Response(JSON.stringify({ error: 'deal_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseAdmin.rpc('get_deal_access_matrix', {
        p_deal_id: dealId,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST: Grant or update access
    if (req.method === 'POST') {
      const body = await req.json();

      if (body.bulk) {
        return await handleBulkGrant(
          supabaseAdmin,
          body,
          auth.userId!,
          ipAddress,
          userAgent,
          corsHeaders,
        );
      }

      return await handleSingleGrant(
        supabaseAdmin,
        body,
        auth.userId!,
        ipAddress,
        userAgent,
        corsHeaders,
      );
    }

    // DELETE: Revoke access
    if (req.method === 'DELETE') {
      const body = await req.json();
      const { access_id, deal_id } = body;

      if (!access_id) {
        return new Response(JSON.stringify({ error: 'access_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get the access record before revoking
      const { data: accessRecord } = await supabaseAdmin
        .from('data_room_access')
        .select('*')
        .eq('id', access_id)
        .single();

      if (!accessRecord) {
        return new Response(JSON.stringify({ error: 'Access record not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Revoke by setting revoked_at
      const { error } = await supabaseAdmin
        .from('data_room_access')
        .update({
          revoked_at: new Date().toISOString(),
          can_view_teaser: false,
          can_view_full_memo: false,
          can_view_data_room: false,
          last_modified_by: auth.userId,
          last_modified_at: new Date().toISOString(),
        })
        .eq('id', access_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Log revocation for each type that was active
      const revokeActions: string[] = [];
      if (accessRecord.can_view_teaser) revokeActions.push('revoke_teaser');
      if (accessRecord.can_view_full_memo) revokeActions.push('revoke_full_memo');
      if (accessRecord.can_view_data_room) revokeActions.push('revoke_data_room');

      for (const action of revokeActions) {
        await supabaseAdmin.rpc('log_data_room_event', {
          p_deal_id: deal_id || accessRecord.deal_id,
          p_user_id: auth.userId,
          p_action: action,
          p_metadata: {
            buyer_id: accessRecord.remarketing_buyer_id || accessRecord.marketplace_user_id,
            revoked_by: auth.userId,
          },
          p_ip_address: ipAddress,
          p_user_agent: userAgent,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Data room access error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleSingleGrant(
  supabase: SupabaseClient,
  body: GrantBody,
  adminUserId: string,
  ipAddress: string | null,
  userAgent: string | null,
  corsHeaders: Record<string, string>,
) {
  const {
    deal_id,
    remarketing_buyer_id,
    marketplace_user_id,
    can_view_teaser = false,
    can_view_full_memo = false,
    can_view_data_room = false,
    fee_agreement_override_reason,
    expires_at,
  } = body;

  if (!deal_id) {
    return new Response(JSON.stringify({ error: 'deal_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!remarketing_buyer_id && !marketplace_user_id) {
    return new Response(
      JSON.stringify({ error: 'Either remarketing_buyer_id or marketplace_user_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Check fee agreement if granting full memo
  let feeAgreementOverride = false;
  if (can_view_full_memo && remarketing_buyer_id) {
    const { data: buyer } = await supabase
      .from('buyers')
      .select('company_website, email_domain')
      .eq('id', remarketing_buyer_id)
      .single();

    if (buyer) {
      // Check firm_agreements for this buyer's domain
      const { data: feeAgreement } = await supabase
        .from('firm_agreements')
        .select('fee_agreement_signed')
        .or(`website_domain.eq.${buyer.company_website},email_domain.eq.${buyer.email_domain}`)
        .eq('fee_agreement_signed', true)
        .limit(1)
        .maybeSingle();

      if (!feeAgreement?.fee_agreement_signed) {
        if (!fee_agreement_override_reason) {
          return new Response(
            JSON.stringify({
              error: 'fee_agreement_required',
              message:
                'This buyer does not have a signed fee agreement. Releasing the full memo reveals the company name. Provide fee_agreement_override_reason to proceed.',
            }),
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        feeAgreementOverride = true;
      }
    }
  }

  // Upsert access record
  const accessData: AccessRecord = {
    deal_id: deal_id!,
    can_view_teaser,
    can_view_full_memo,
    can_view_data_room,
    last_modified_by: adminUserId,
    last_modified_at: new Date().toISOString(),
    revoked_at: null,
  };

  if (remarketing_buyer_id) {
    accessData.remarketing_buyer_id = remarketing_buyer_id;
  } else {
    accessData.marketplace_user_id = marketplace_user_id;
  }

  if (feeAgreementOverride) {
    accessData.fee_agreement_override = true;
    accessData.fee_agreement_override_reason = fee_agreement_override_reason;
    accessData.fee_agreement_override_by = adminUserId;
  }

  if (expires_at) {
    accessData.expires_at = expires_at;
  }

  // Check if access record already exists
  let query = supabase.from('data_room_access').select('id').eq('deal_id', deal_id);

  if (remarketing_buyer_id) {
    query = query.eq('remarketing_buyer_id', remarketing_buyer_id);
  } else {
    query = query.eq('marketplace_user_id', marketplace_user_id);
  }

  const { data: existing } = await query.maybeSingle();

  let result;
  if (existing) {
    result = await supabase
      .from('data_room_access')
      .update(accessData)
      .eq('id', existing.id)
      .select()
      .single();
  } else {
    accessData.granted_by = adminUserId;
    accessData.granted_at = new Date().toISOString();
    result = await supabase.from('data_room_access').insert(accessData).select().single();
  }

  if (result.error) {
    return new Response(JSON.stringify({ error: result.error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Log audit events
  const grantActions: string[] = [];
  if (can_view_teaser) grantActions.push('grant_teaser');
  if (can_view_full_memo) grantActions.push('grant_full_memo');
  if (can_view_data_room) grantActions.push('grant_data_room');

  for (const action of grantActions) {
    await supabase.rpc('log_data_room_event', {
      p_deal_id: deal_id,
      p_user_id: adminUserId,
      p_action: action,
      p_metadata: {
        buyer_id: remarketing_buyer_id || marketplace_user_id,
        buyer_type: remarketing_buyer_id ? 'remarketing' : 'marketplace',
        fee_agreement_override: feeAgreementOverride,
        fee_agreement_override_reason: fee_agreement_override_reason || null,
      },
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });
  }

  if (feeAgreementOverride) {
    await supabase.rpc('log_data_room_event', {
      p_deal_id: deal_id,
      p_user_id: adminUserId,
      p_action: 'fee_agreement_override',
      p_metadata: {
        buyer_id: remarketing_buyer_id || marketplace_user_id,
        reason: fee_agreement_override_reason,
      },
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });
  }

  return new Response(JSON.stringify({ success: true, data: result.data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleBulkGrant(
  supabase: SupabaseClient,
  body: GrantBody,
  adminUserId: string,
  ipAddress: string | null,
  userAgent: string | null,
  corsHeaders: Record<string, string>,
) {
  const {
    deal_id,
    buyer_ids,
    can_view_teaser = false,
    can_view_full_memo = false,
    can_view_data_room = false,
  } = body;

  if (!deal_id || !buyer_ids || !Array.isArray(buyer_ids) || buyer_ids.length === 0) {
    return new Response(
      JSON.stringify({ error: 'deal_id and non-empty buyer_ids array required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const results: Array<{ buyer_id: string | undefined; success: boolean }> = [];
  const errors: Array<{ buyer_id: string | undefined; error: string }> = [];

  for (const buyer of buyer_ids) {
    try {
      // For bulk, skip fee agreement check (admin is making a deliberate bulk decision)
      const accessData: AccessRecord = {
        deal_id: deal_id!,
        can_view_teaser,
        can_view_full_memo,
        can_view_data_room,
        last_modified_by: adminUserId,
        last_modified_at: new Date().toISOString(),
        revoked_at: null,
      };

      if (buyer.remarketing_buyer_id) {
        accessData.remarketing_buyer_id = buyer.remarketing_buyer_id;
      } else {
        accessData.marketplace_user_id = buyer.marketplace_user_id;
      }

      // Upsert
      let query = supabase.from('data_room_access').select('id').eq('deal_id', deal_id);

      if (buyer.remarketing_buyer_id) {
        query = query.eq('remarketing_buyer_id', buyer.remarketing_buyer_id);
      } else {
        query = query.eq('marketplace_user_id', buyer.marketplace_user_id);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        await supabase.from('data_room_access').update(accessData).eq('id', existing.id);
      } else {
        accessData.granted_by = adminUserId;
        accessData.granted_at = new Date().toISOString();
        await supabase.from('data_room_access').insert(accessData);
      }

      results.push({
        buyer_id: buyer.remarketing_buyer_id || buyer.marketplace_user_id,
        success: true,
      });
    } catch (err) {
      errors.push({
        buyer_id: buyer.remarketing_buyer_id || buyer.marketplace_user_id,
        error: (err as Error).message,
      });
    }
  }

  // Log bulk audit event
  await supabase.rpc('log_data_room_event', {
    p_deal_id: deal_id,
    p_user_id: adminUserId,
    p_action: 'bulk_grant',
    p_metadata: {
      buyer_count: buyer_ids.length,
      success_count: results.length,
      error_count: errors.length,
      can_view_teaser,
      can_view_full_memo,
      can_view_data_room,
    },
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });

  return new Response(JSON.stringify({ success: true, results, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
