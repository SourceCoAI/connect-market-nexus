import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

/**
 * resolve-buyer-message-thread
 *
 * Guarantees a connection_request_id for the current buyer.
 * 1. Finds the latest active request (approved/on_hold/pending).
 * 2. If none, finds the latest non-rejected request.
 * 3. If none, creates a "General Inquiry" request using the internal listing.
 *
 * Returns: { connection_request_id: string }
 */

const GENERAL_INQUIRY_LISTING_ID = '00000000-0000-0000-0000-000000000001';

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const auth = await requireAuth(req);
    if (!auth.authenticated || !auth.userId) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const userId = auth.userId;

    // 1. Find latest active request
    const { data: activeReq } = await supabaseAdmin
      .from('connection_requests')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['approved', 'on_hold', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeReq) {
      return new Response(
        JSON.stringify({ connection_request_id: activeReq.id, source: 'existing_active' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // 2. Find latest non-rejected request (including general inquiry)
    const { data: anyReq } = await supabaseAdmin
      .from('connection_requests')
      .select('id')
      .eq('user_id', userId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anyReq) {
      return new Response(
        JSON.stringify({ connection_request_id: anyReq.id, source: 'existing_non_rejected' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // 3. Check for existing general inquiry request (even rejected)
    const { data: existingGeneral } = await supabaseAdmin
      .from('connection_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('listing_id', GENERAL_INQUIRY_LISTING_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingGeneral) {
      // Reactivate if rejected
      await supabaseAdmin
        .from('connection_requests')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', existingGeneral.id);

      return new Response(
        JSON.stringify({ connection_request_id: existingGeneral.id, source: 'reactivated_general' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // 4. Create new General Inquiry request
    const { data: newReq, error: insertError } = await supabaseAdmin
      .from('connection_requests')
      .insert({
        user_id: userId,
        listing_id: GENERAL_INQUIRY_LISTING_ID,
        status: 'approved',
        user_message: 'General Inquiry',
        conversation_state: 'active',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create general inquiry request:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create conversation thread' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(`✅ Created General Inquiry thread ${newReq.id} for buyer ${userId}`);

    return new Response(
      JSON.stringify({ connection_request_id: newReq.id, source: 'created_general' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('❌ Error in resolve-buyer-message-thread:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
