/**
 * notify-agreement-confirmed
 *
 * Sends an email to firm members when an admin marks their NDA or Fee Agreement as "signed".
 * Tells the buyer they can now browse deals and request introductions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { firmId, agreementType } = await req.json();

    if (!firmId || !agreementType) {
      return new Response(
        JSON.stringify({ error: 'firmId and agreementType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get firm name
    const { data: firm } = await supabase
      .from('firm_agreements')
      .select('primary_company_name')
      .eq('id', firmId)
      .single();

    const firmName = firm?.primary_company_name || 'your firm';

    // Get all firm members with emails
    const { data: members } = await supabase
      .from('firm_members')
      .select('user_id, lead_email, lead_name, member_type')
      .eq('firm_id', firmId);

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No members to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const docLabel = agreementType === 'nda' ? 'NDA' : 'Fee Agreement';
    const subject = `Your ${docLabel} has been confirmed`;
    const appUrl = 'https://app.sourcecodeals.com';

    let sent = 0;

    for (const member of members) {
      let email: string | null = null;
      let firstName: string | null = null;

      if (member.member_type === 'marketplace_user' && member.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, first_name')
          .eq('id', member.user_id)
          .single();
        email = profile?.email || null;
        firstName = profile?.first_name || null;
      } else {
        email = member.lead_email;
        firstName = member.lead_name?.split(' ')[0] || null;
      }

      if (!email) continue;

      const greeting = firstName ? `${firstName},` : 'Hello,';

      const bodyHtml = `
        <p>${greeting}</p>
        <p>Your ${docLabel} for ${firmName} has been recorded and confirmed. You now have full access to browse deals and request introductions on the SourceCo marketplace.</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${appUrl}/marketplace" style="background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Browse Deals</a>
        </div>
        <p style="color: #6B6B6B; font-size: 13px;">The SourceCo Team</p>
      `;

      const html = wrapEmailHtml({
        bodyHtml,
        preheader: `Your ${docLabel} is confirmed. You can now request deal introductions.`,
        recipientEmail: email,
      });

      try {
        await sendEmail({
          templateName: 'notify-agreement-confirmed',
          to: email,
          subject,
          html,
          tags: ['agreement-confirmed', agreementType],
          metadata: { firmId, agreementType, firmName },
        }, supabase);
        sent++;
      } catch (err) {
        console.error(`Failed to send to ${email}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('notify-agreement-confirmed error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
