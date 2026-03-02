import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

/**
 * confirm-agreement-signed
 *
 * Called by the frontend after DocuSeal onCompleted fires.
 * Uses deterministic firm resolution and retry polling for DocuSeal status.
 */

async function resolveFirmId(supabaseAdmin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: reqFirm } = await supabaseAdmin
    .from('connection_requests')
    .select('firm_id')
    .eq('user_id', userId)
    .not('firm_id', 'is', null)
    .in('status', ['approved', 'pending', 'on_hold'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reqFirm?.firm_id) return reqFirm.firm_id;

  const { data: membership } = await supabaseAdmin
    .from('firm_members')
    .select('firm_id')
    .eq('user_id', userId)
    .order('added_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return membership?.firm_id || null;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
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

    const body = await req.json().catch(() => ({}));
    const documentType: string = body.documentType;
    if (documentType !== 'nda' && documentType !== 'fee_agreement') {
      return new Response(
        JSON.stringify({ error: 'Invalid documentType. Must be "nda" or "fee_agreement".' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const isNda = documentType === 'nda';
    const docLabel = isNda ? 'NDA' : 'Fee Agreement';

    // Deterministic firm resolution
    const firmId = await resolveFirmId(supabaseAdmin, userId);

    if (!firmId) {
      return new Response(
        JSON.stringify({ error: 'No firm found', confirmed: false }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(`🔍 Resolved firm ${firmId} for user ${userId} (${docLabel})`);

    const signedCol = isNda ? 'nda_signed' : 'fee_agreement_signed';
    const submissionCol = isNda ? 'nda_docuseal_submission_id' : 'fee_docuseal_submission_id';
    const { data: firm } = await supabaseAdmin
      .from('firm_agreements')
      .select(`id, primary_company_name, ${signedCol}, ${submissionCol}`)
      .eq('id', firmId)
      .single();

    if (!firm) {
      return new Response(
        JSON.stringify({ error: 'Firm agreement not found', confirmed: false, resolvedFirmId: firmId }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // If already marked signed
    if (firm[signedCol]) {
      const docUrlCol = isNda ? 'nda_signed_document_url' : 'fee_signed_document_url';
      const { data: docData } = await supabaseAdmin
        .from('firm_agreements')
        .select(docUrlCol)
        .eq('id', firmId)
        .single();
      return new Response(
        JSON.stringify({ confirmed: true, alreadySigned: true, signedDocumentUrl: docData?.[docUrlCol] || null, resolvedFirmId: firmId }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const submissionId = firm[submissionCol];
    if (!submissionId) {
      return new Response(
        JSON.stringify({ confirmed: false, error: 'No submission found', resolvedFirmId: firmId }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const docusealApiKey = Deno.env.get('DOCUSEAL_API_KEY');
    if (!docusealApiKey) {
      return new Response(
        JSON.stringify({ error: 'DocuSeal not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Get buyer's email for matching
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    // Retry polling: check DocuSeal status with retries (0s, 1.5s, 3s)
    const retryDelays = [0, 1500, 3000];
    let submitter: { status?: string; documents?: { url?: string }[]; email?: string } | null = null;

    for (const delay of retryDelays) {
      if (delay > 0) await sleep(delay);

      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 10000);
      try {
        const submitterRes = await fetch(
          `https://api.docuseal.com/submitters?submission_id=${submissionId}`,
          {
            headers: { 'X-Auth-Token': docusealApiKey },
            signal: fetchController.signal,
          },
        );

        if (submitterRes.ok) {
          const submitters = await submitterRes.json();
          const data = Array.isArray(submitters?.data) ? submitters.data : Array.isArray(submitters) ? submitters : [];
          submitter = data.find((s: { email?: string }) => s.email === profile?.email) || data[0];

          if (submitter?.status === 'completed') {
            console.log(`✅ DocuSeal confirmed completed on attempt ${retryDelays.indexOf(delay) + 1}`);
            break;
          }
        }
      } catch (e) {
        console.warn(`DocuSeal check attempt failed:`, e);
      } finally {
        clearTimeout(fetchTimeout);
      }
    }

    if (!submitter || submitter.status !== 'completed') {
      return new Response(
        JSON.stringify({ confirmed: false, status: submitter?.status || 'unknown', resolvedFirmId: firmId, reason: 'DocuSeal not yet confirmed' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // ─── DocuSeal confirmed completed — update everything ───

    const now = new Date().toISOString();
    const rawSignedDocUrl = submitter.documents?.[0]?.url || null;
    const signedDocUrl = rawSignedDocUrl && rawSignedDocUrl.startsWith('https://') ? rawSignedDocUrl : null;
    const firmName = firm.primary_company_name || 'Unknown Firm';

    const updates: Record<string, unknown> = { updated_at: now };
    if (isNda) {
      updates.nda_signed = true;
      updates.nda_signed_at = now;
      updates.nda_docuseal_status = 'completed';
      updates.nda_status = 'signed';
      if (signedDocUrl) {
        updates.nda_signed_document_url = signedDocUrl;
        updates.nda_document_url = signedDocUrl;
      }
    } else {
      updates.fee_agreement_signed = true;
      updates.fee_agreement_signed_at = now;
      updates.fee_docuseal_status = 'completed';
      updates.fee_agreement_status = 'signed';
      if (signedDocUrl) {
        updates.fee_signed_document_url = signedDocUrl;
        updates.fee_agreement_document_url = signedDocUrl;
      }
    }

    await supabaseAdmin
      .from('firm_agreements')
      .update(updates)
      .eq('id', firmId);

    // Dedup log
    await supabaseAdmin.from('docuseal_webhook_log').insert({
      event_type: 'form.completed',
      submission_id: String(submissionId),
      external_id: firmId,
      raw_payload: { confirmed_by_frontend: userId, document_type: documentType },
      processed_at: now,
    }).then(({ error: logErr }: { error: { code?: string; message?: string } | null }) => {
      if (logErr && logErr.code !== '23505') {
        console.warn('Failed to write dedup log entry:', logErr);
      }
    });

    // Sync to profiles
    const { data: members } = await supabaseAdmin
      .from('firm_members')
      .select('user_id')
      .eq('firm_id', firmId);

    if (members?.length) {
      const profileUpdates = isNda
        ? { nda_signed: true, nda_signed_at: now, updated_at: now }
        : { fee_agreement_signed: true, fee_agreement_signed_at: now, updated_at: now };

      for (const member of members) {
        await supabaseAdmin
          .from('profiles')
          .update(profileUpdates)
          .eq('id', member.user_id);
      }

      await sendBuyerSignedDocNotification(supabaseAdmin, members, firmId, docLabel, signedDocUrl);
    }

    await createAdminNotification(supabaseAdmin, firmId, firmName, docLabel);

    console.log(`✅ Confirmed ${docLabel} signed for firm ${firmId} (buyer ${userId})`);

    return new Response(
      JSON.stringify({ confirmed: true, signedDocumentUrl: signedDocUrl, resolvedFirmId: firmId }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('Error in confirm-agreement-signed:', error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});

async function sendBuyerSignedDocNotification(
  supabase: SupabaseClient,
  members: { user_id: string }[],
  firmId: string,
  docLabel: string,
  signedDocUrl: string | null,
) {
  try {
    const downloadNote = signedDocUrl
      ? `You can download your signed copy from your Profile → Documents tab, or use this link: ${signedDocUrl}`
      : `You can view your signed documents in your Profile → Documents tab.`;

    const docType = docLabel.toLowerCase().replace(/ /g, '_');

    for (const member of members) {
      const { data: existingNotif } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('user_id', member.user_id)
        .eq('notification_type', 'agreement_signed')
        .eq('title', `${docLabel} Signed Successfully`)
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (!existingNotif) {
        await supabase.from('user_notifications').insert({
          user_id: member.user_id,
          notification_type: 'agreement_signed',
          title: `${docLabel} Signed Successfully`,
          message: `Your ${docLabel} has been signed and recorded. ${downloadNote}`,
          metadata: {
            firm_id: firmId,
            document_type: docType,
            signed_document_url: signedDocUrl || null,
          },
        });
      }

      const { data: generalRequest } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('user_id', member.user_id)
        .in('status', ['approved', 'pending', 'on_hold'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (generalRequest) {
        const messageBody = signedDocUrl
          ? `✅ Your ${docLabel} has been signed successfully. For your compliance records, you can download the signed copy here: ${signedDocUrl}\n\nA copy is also permanently available in your Profile → Documents tab.`
          : `✅ Your ${docLabel} has been signed successfully. A copy is available in your Profile → Documents tab.`;

        const { data: existingMsg } = await supabase
          .from('connection_messages')
          .select('id')
          .eq('connection_request_id', generalRequest.id)
          .eq('message_type', 'system')
          .ilike('body', `%Your ${docLabel} has been signed%`)
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();

        if (!existingMsg) {
          await supabase.from('connection_messages').insert({
            connection_request_id: generalRequest.id,
            sender_role: 'admin',
            sender_id: null,
            body: messageBody,
            message_type: 'system',
            is_read_by_admin: true,
            is_read_by_buyer: false,
          });
        }
      }
    }
    console.log(`📨 Sent signed doc notifications to ${members.length} buyer(s) for ${docLabel}`);
  } catch (err) {
    console.error('Buyer notification error:', err);
  }
}

async function createAdminNotification(
  supabase: SupabaseClient,
  firmId: string,
  firmName: string,
  docLabel: string,
) {
  try {
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'owner']);

    const admins = adminRoles?.map((r: { user_id: string }) => ({ id: r.user_id })) || [];
    if (!admins?.length) return;

    const notifications = admins.map((admin: { id: string }) => ({
      admin_id: admin.id,
      title: `${docLabel} Signed`,
      message: `${firmName} has signed the ${docLabel}.`,
      notification_type: 'document_completed',
      metadata: { firm_id: firmId, document_type: docLabel.toLowerCase().replace(/ /g, '_'), docuseal_status: 'completed' },
      is_read: false,
    }));

    await supabase.from('admin_notifications').insert(notifications);
  } catch (err) {
    console.error('Admin notification error:', err);
  }
}
