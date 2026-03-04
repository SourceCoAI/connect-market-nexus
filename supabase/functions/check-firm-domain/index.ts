/**
 * check-firm-domain: Real-time domain check during signup
 *
 * Given an email address, checks if the domain matches any existing
 * firm_agreements or remarketing_buyers record.
 *
 * POST body:
 *   - email: string
 *
 * Returns:
 *   { found: boolean, firm_name: string | null }
 *
 * Read-only — no DB writes.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

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
    const { email } = body;

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ found: false, firm_name: null }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return new Response(
        JSON.stringify({ found: false, firm_name: null }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Exclude generic email providers
    const generic = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'];
    if (generic.includes(domain)) {
      return new Response(
        JSON.stringify({ found: false, firm_name: null }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Check firm_agreements
    const { data: firmMatch } = await supabase
      .from('firm_agreements')
      .select('primary_company_name')
      .eq('email_domain', domain)
      .limit(1)
      .maybeSingle();

    if (firmMatch) {
      return new Response(
        JSON.stringify({ found: true, firm_name: firmMatch.primary_company_name }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Check remarketing_buyers by matching contacts email domain
    const { data: contactMatch } = await supabase
      .from('contacts')
      .select('remarketing_buyer_id, remarketing_buyers:remarketing_buyer_id(company_name)')
      .ilike('email', `%@${domain}`)
      .eq('contact_type', 'buyer')
      .not('remarketing_buyer_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (contactMatch && contactMatch.remarketing_buyers) {
      const buyer = contactMatch.remarketing_buyers as unknown as { company_name: string };
      return new Response(
        JSON.stringify({ found: true, firm_name: buyer.company_name }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    // Check remarketing_buyers by website domain
    const { data: websiteMatch } = await supabase
      .from('remarketing_buyers')
      .select('company_name')
      .ilike('company_website', `%${domain}%`)
      .eq('archived', false)
      .limit(1)
      .maybeSingle();

    if (websiteMatch) {
      return new Response(
        JSON.stringify({ found: true, firm_name: websiteMatch.company_name }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ found: false, firm_name: null }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('check-firm-domain error:', error);
    return new Response(
      JSON.stringify({ found: false, firm_name: null }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  }
});
