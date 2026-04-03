/**
 * send-memo-email: Sends a lead memo PDF to a buyer via email
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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

  try {
    const { memo_id, buyer_id, email_address, email_subject, email_body } = await req.json();

    if (!memo_id || !buyer_id || !email_address || !email_subject || !email_body) {
      return new Response(
        JSON.stringify({ error: 'memo_id, buyer_id, email_address, email_subject, and email_body are all required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: memo, error: memoError } = await supabaseAdmin
      .from('lead_memos').select('*').eq('id', memo_id).single();

    let dealTitle = 'Deal';
    if (memo?.deal_id) {
      const { data: listing } = await supabaseAdmin
        .from('listings').select('internal_company_name, title').eq('id', memo.deal_id).single();
      if (listing) dealTitle = listing.internal_company_name || listing.title || 'Deal';
    }

    if (memoError || !memo) {
      return new Response(JSON.stringify({ error: 'Memo not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: buyer } = await supabaseAdmin
      .from('buyers').select('company_name, pe_firm_name').eq('id', buyer_id).single();

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles').select('full_name, email').eq('id', auth.userId).single();

    const senderName = adminProfile?.full_name || 'SourceCo Team';
    const replyToEmail = adminProfile?.email || 'adam.haile@sourcecodeals.com';

    const emailResult = await sendEmail({
      templateName: 'memo_email',
      to: email_address,
      toName: buyer?.pe_firm_name || buyer?.company_name || email_address,
      subject: email_subject,
      htmlContent: wrapEmailHtml({
        bodyHtml: `<div>${email_body}</div><p style="margin-top: 32px; font-size: 14px; color: #6B6B6B;">${senderName}<br>SourceCo</p>`,
        showHeader: false,
        recipientEmail: email_address,
      }),
      senderName,
      replyTo: replyToEmail,
      isTransactional: true,
    });

    if (!emailResult.success) {
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await supabaseAdmin.from('memo_distribution_log').insert({
      deal_id: memo.deal_id, memo_id: memo.id, remarketing_buyer_id: buyer_id,
      memo_type: memo.memo_type, channel: 'email', sent_by: auth.userId,
      email_address, email_subject,
    });

    const { data: buyerUsers } = await supabaseAdmin
      .from('profiles').select('id, email').eq('email', email_address).limit(1);

    if (buyerUsers && buyerUsers.length > 0) {
      await supabaseAdmin.from('user_notifications').insert({
        user_id: buyerUsers[0].id, notification_type: 'memo_shared',
        title: `New memo shared: ${dealTitle}`,
        message: `A ${memo.memo_type === 'teaser' ? 'teaser' : 'lead memo'} has been shared with you for ${dealTitle}.`,
        metadata: { memo_id: memo.id, memo_type: memo.memo_type, deal_id: memo.deal_id, deal_title: dealTitle },
      });
    }

    await supabaseAdmin.rpc('log_data_room_event', {
      p_deal_id: memo.deal_id, p_user_id: auth.userId, p_action: 'send_memo_email',
      p_metadata: { memo_id: memo.id, memo_type: memo.memo_type, buyer_id, buyer_name: buyer?.pe_firm_name || buyer?.company_name, email_address, email_subject },
      p_ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      p_user_agent: req.headers.get('user-agent') || null,
    });

    return new Response(JSON.stringify({ success: true, message_id: emailResult.providerMessageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Send memo email error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to send memo email', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
