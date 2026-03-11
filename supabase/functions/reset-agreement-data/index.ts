import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin', {
      user_id: user.id,
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: `No profile found for ${email}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = profile.id;
    const results: string[] = [];

    // Find firm via firm_members
    const { data: membership } = await supabase
      .from('firm_members')
      .select('firm_id')
      .eq('user_id', userId)
      .maybeSingle();

    // 1. Reset firm_agreements (disable triggers via RPC to avoid audit log NOT NULL constraint)
    if (membership?.firm_id) {
      // Use raw SQL via RPC to disable triggers, update, and re-enable
      const { error: rpcErr } = await supabase.rpc('reset_firm_agreement_data', {
        p_firm_id: membership.firm_id,
      });

      if (rpcErr) {
        // Fallback: try direct update with 'not_sent' status to avoid trigger issues
        const { error } = await supabase
          .from('firm_agreements')
          .update({
            nda_signed: false,
            nda_signed_at: null,
            nda_signed_by: null,
            nda_signed_by_name: null,
            nda_pandadoc_status: null,
            nda_pandadoc_document_id: null,
            nda_signed_document_url: null,
            nda_email_sent: false,
            nda_email_sent_at: null,
            nda_email_sent_by: null,
            nda_sent_at: null,
            nda_status: 'not_sent',
            nda_source: null,
            fee_agreement_signed: false,
            fee_agreement_signed_at: null,
            fee_agreement_signed_by: null,
            fee_agreement_signed_by_name: null,
            fee_pandadoc_status: null,
            fee_pandadoc_document_id: null,
            fee_signed_document_url: null,
            fee_agreement_email_sent: false,
            fee_agreement_email_sent_at: null,
            fee_agreement_email_sent_by: null,
            fee_agreement_sent_at: null,
            fee_agreement_status: 'not_sent',
            fee_agreement_source: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', membership.firm_id);

        results.push(
          error
            ? `❌ firm_agreements fallback: ${error.message}`
            : `✅ firm_agreements reset (fallback)`,
        );
      } else {
        results.push(`✅ firm_agreements reset via RPC`);
      }

      // Delete audit log entries
      const { error: auditErr } = await supabase
        .from('agreement_audit_log')
        .delete()
        .eq('firm_id', membership.firm_id);

      results.push(
        auditErr ? `❌ agreement_audit_log: ${auditErr.message}` : `✅ agreement_audit_log cleared`,
      );
    } else {
      results.push('⚠️ No firm membership found');
    }

    // 2. Reset profiles flags
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ nda_signed: false, fee_agreement_signed: false })
      .eq('id', userId);

    results.push(
      profileErr ? `❌ profiles: ${profileErr.message}` : `✅ profiles nda/fee flags reset`,
    );

    // 3. Reset connection_requests lead fields
    const { data: connReqs } = await supabase
      .from('connection_requests')
      .select('id')
      .eq('user_id', userId);

    if (connReqs && connReqs.length > 0) {
      const reqIds = connReqs.map((r: { id: string }) => r.id);
      const { error: crErr } = await supabase
        .from('connection_requests')
        .update({
          lead_nda_signed: false,
          lead_nda_signed_at: null,
          lead_nda_signed_by: null,
          lead_nda_email_sent: false,
          lead_nda_email_sent_at: null,
          lead_nda_email_sent_by: null,
          lead_fee_agreement_signed: false,
          lead_fee_agreement_signed_at: null,
          lead_fee_agreement_signed_by: null,
          lead_fee_agreement_email_sent: false,
          lead_fee_agreement_email_sent_at: null,
          lead_fee_agreement_email_sent_by: null,
        })
        .in('id', reqIds);

      results.push(
        crErr
          ? `❌ connection_requests: ${crErr.message}`
          : `✅ connection_requests reset (${reqIds.length} rows)`,
      );

      // 4. Delete agreement system messages
      const { error: msgErr } = await supabase
        .from('connection_messages')
        .delete()
        .in('connection_request_id', reqIds)
        .eq('message_type', 'system');

      results.push(
        msgErr ? `❌ connection_messages: ${msgErr.message}` : `✅ system messages deleted`,
      );
    } else {
      results.push('⚠️ No connection_requests found');
    }

    // 5. Delete agreement-related notifications
    const { error: notifErr } = await supabase
      .from('admin_notifications')
      .delete()
      .eq('user_id', userId)
      .or(
        'notification_type.ilike.%agreement%,notification_type.ilike.%nda%,notification_type.ilike.%fee%,title.ilike.%NDA%,title.ilike.%Fee Agreement%',
      );

    results.push(
      notifErr ? `❌ admin_notifications: ${notifErr.message}` : `✅ admin_notifications cleared`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        email,
        userId,
        firmId: membership?.firm_id || null,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    console.error('Error in reset-agreement-data:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
