import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/error-response.ts';

interface NotifyRequest {
  score_id: string;
  buyer_id: string;
  listing_id: string;
  composite_score: number;
  tier?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth guard: require valid JWT + admin role
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return errorResponse('Unauthorized', 401, corsHeaders, 'unauthorized');
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const {
      data: { user: callerUser },
      error: callerError,
    } = await anonClient.auth.getUser();
    if (callerError || !callerUser) {
      return errorResponse('Unauthorized', 401, corsHeaders, 'unauthorized');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: callerUser.id });
    if (!isAdmin) {
      return errorResponse('Forbidden: admin access required', 403, corsHeaders, 'forbidden');
    }

    const body: NotifyRequest = await req.json();
    const { score_id, buyer_id, listing_id, composite_score, tier } = body;

    // Fetch buyer details
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .select('company_name, company_website')
      .eq('id', buyer_id)
      .single();

    if (buyerError) {
      console.error('Failed to fetch buyer:', buyerError);
      throw new Error('Buyer not found');
    }

    // Fetch listing details
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('title, category, location')
      .eq('id', listing_id)
      .single();

    if (listingError) {
      console.error('Failed to fetch listing:', listingError);
      throw new Error('Listing not found');
    }

    // Fetch all admin users
    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true);

    if (adminsError) {
      console.error('Failed to fetch admins:', adminsError);
      throw new Error('Failed to fetch admins');
    }

    if (!admins || admins.length === 0) {
      console.log('No admins to notify');
      return new Response(JSON.stringify({ success: true, message: 'No admins to notify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create notifications for all admins
    const notifications = admins.map((admin) => ({
      admin_id: admin.id,
      notification_type: 'remarketing_a_tier_match',
      title: `🎯 A-Tier Match: ${buyer.company_name}`,
      message: `${buyer.company_name} scored ${Math.round(composite_score)} for "${listing.title}" - recommended for outreach`,
      action_url: `/admin/remarketing/matching/${listing_id}?highlight=${score_id}`,
      metadata: {
        score_id,
        buyer_id,
        listing_id,
        composite_score,
        tier: tier || 'A',
        buyer_name: buyer.company_name,
        listing_title: listing.title,
      },
      is_read: false,
    }));

    const { error: insertError } = await supabase.from('admin_notifications').insert(notifications);

    if (insertError) {
      console.error('Failed to create notifications:', insertError);
      throw new Error('Failed to create notifications');
    }

    // Notification count logged without PII

    return new Response(
      JSON.stringify({
        success: true,
        notified: notifications.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Notify remarketing match error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      corsHeaders,
      'internal_error',
    );
  }
});
