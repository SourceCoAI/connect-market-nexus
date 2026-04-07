import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

/**
 * Creates an admin notification when a buyer saves a listing.
 * This gives admins visibility into buyer interest signals.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use authenticated client to get the user
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { listingId } = await req.json();
    if (!listingId) {
      return new Response(JSON.stringify({ error: 'listingId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch buyer profile and listing info for the notification
    const [profileRes, listingRes] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('first_name, last_name, company')
        .eq('id', user.id)
        .single(),
      supabaseAdmin
        .from('listings')
        .select('title, category')
        .eq('id', listingId)
        .single(),
    ]);

    const buyerName = profileRes.data
      ? `${profileRes.data.first_name || ''} ${profileRes.data.last_name || ''}`.trim()
      : user.email || 'A buyer';
    const company = profileRes.data?.company || '';
    const listingTitle = listingRes.data?.title || 'a listing';

    // Find all admins to notify
    const { data: adminRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create notifications for all admins
    const notifications = adminRoles.map((role) => ({
      admin_id: role.user_id,
      user_id: user.id,
      notification_type: 'listing_saved',
      title: `Listing Saved: ${listingTitle}`,
      message: `${buyerName}${company ? ` (${company})` : ''} saved "${listingTitle}"`,
      action_url: `/admin/marketplace/requests?buyer=${user.id}`,
      metadata: {
        listing_id: listingId,
        buyer_name: buyerName,
        buyer_company: company,
        listing_title: listingTitle,
        listing_category: listingRes.data?.category || null,
      },
    }));

    const { error: insertError } = await supabaseAdmin
      .from('admin_notifications')
      .insert(notifications);

    if (insertError) {
      console.error('Failed to insert notifications:', insertError);
      // Don't fail the save — notifications are non-critical
    }

    return new Response(
      JSON.stringify({ success: true, notified: adminRoles.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('notify-admin-listing-saved error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
