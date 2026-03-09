/**
 * Temporary one-shot trigger for contact discovery.
 * Deploy, call once, then delete.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error } = await supabase.functions.invoke('find-introduction-contacts', {
      body: {
        buyer_id: '89bffd5b-f87c-4507-b217-7f595c05efbf',
        buyer_type: 'private_equity',
        pe_firm_name: 'Trivest Partners',
        pe_firm_website: 'trivest.com',
        company_name: 'Trivest Partners',
        company_website: 'https://www.trivest.com',
        email_domain: 'trivest.com',
        trigger_source: 'manual',
      },
      headers: {
        'x-internal-secret': serviceRoleKey,
      },
    });

    return new Response(JSON.stringify({ data, error: error?.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
