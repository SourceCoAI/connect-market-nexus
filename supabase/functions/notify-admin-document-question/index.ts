import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const { admin_id, user_id, document_type, question, connection_request_id } = await req.json();

    if (!admin_id || !user_id || !document_type || !question) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Build action URL with deep-link to the thread if we have a request ID
    const actionUrl = connection_request_id
      ? `/admin/marketplace/messages?thread=${connection_request_id}`
      : '/admin/marketplace/requests';

    const { error } = await supabaseAdmin.from('admin_notifications').insert({
      admin_id,
      user_id,
      notification_type: 'document_question',
      title: `Document Question: ${document_type}`,
      message: question,
      action_url: actionUrl,
      metadata: {
        document_type,
        connection_request_id: connection_request_id || null,
      },
    });

    if (error) {
      console.error('Failed to insert notification:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
