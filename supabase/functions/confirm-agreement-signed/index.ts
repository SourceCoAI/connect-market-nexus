import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

/**
 * confirm-agreement-signed
 *
 * Called by the frontend after PandaDoc signing completes.
 * Uses deterministic firm resolution and retry polling for PandaDoc status.
 * Sends confirmation emails to buyer and admins.
 */

async function resolveFirmId(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<string | null> {
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
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const isFeeAgreement = documentType === 'fee_agreement';
    const docLabel = isNda ? 'NDA' : 'Fee Agreement';

    // Deterministic firm resolution
    const firmId = await resolveFirmId(supabaseAdmin, userId);

    if (!firmId) {
      return new Response(JSON.stringify({ error: 'No firm found', confirmed: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log(`🔍 Resolved firm ${firmId} for user ${userId} (${docLabel})`);

    const signedCol = isNda ? 'nda_signed' : 'fee_agreement_signed';
    const documentCol = isNda ? 'nda_pandadoc_document_id' : 'fee_pandadoc_document_id';
    const { data: firm } = await supabaseAdmin
      .from('firm_agreements')
      .select(`id, primary_company_name, ${signedCol}, ${documentCol}`)
      .eq('id', firmId)
      .single();

    if (!firm) {
      return new Response(
        JSON.stringify({
          error: 'Firm agreement not found',
          confirmed: false,
          resolvedFirmId: firmId,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // If already marked signed
    if ((firm as any)[signedCol]) {
      const docUrlCol = isNda ? 'nda_signed_document_url' : 'fee_signed_document_url';
      const { data: docData } = await supabaseAdmin
        .from('firm_agreements')
        .select(docUrlCol)
        .eq('id', firmId)
        .single();
      return new Response(
        JSON.stringify({
          confirmed: true,
          alreadySigned: true,
          signedDocumentUrl: (docData as any)?.[docUrlCol] || null,
          resolvedFirmId: firmId,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const documentId = (firm as any)[documentCol];
    if (!documentId) {
      return new Response(
        JSON.stringify({ confirmed: false, error: 'No document found', resolvedFirmId: firmId }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY');
    if (!pandadocApiKey) {
      return new Response(JSON.stringify({ error: 'PandaDoc not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Get buyer's profile for matching and name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', userId)
      .single();

    const signerName =
      `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Unknown';

    // Retry polling: check PandaDoc document status with retries (0s, 1.5s, 3s)
    const retryDelays = [0, 1500, 3000];
    let docStatus: string | null = null;

    for (const delay of retryDelays) {
      if (delay > 0) await sleep(delay);

      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 10000);
      try {
        const statusRes = await fetch(
          `https://api.pandadoc.com/public/v1/documents/${documentId}`,
          {
            headers: { 'Authorization': `API-Key ${pandadocApiKey}` },
            signal: fetchController.signal,
          },
        );

        if (statusRes.ok) {
          const docData = await statusRes.json();
          docStatus = docData.status;

          if (docStatus === 'document.completed') {
            console.log(
              `✅ PandaDoc confirmed completed on attempt ${retryDelays.indexOf(delay) + 1}`,
            );
            break;
          }
        }
      } catch (e) {
        console.warn(`PandaDoc check attempt failed:`, e);
      } finally {
        clearTimeout(fetchTimeout);
      }
    }

    if (docStatus !== 'document.completed') {
      return new Response(
        JSON.stringify({
          confirmed: false,
          status: docStatus || 'unknown',
          resolvedFirmId: firmId,
          reason: 'PandaDoc not yet confirmed',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // ─── PandaDoc confirmed completed — update everything ───

    const now = new Date().toISOString();
    const firmName = firm.primary_company_name || 'Unknown Firm';

    // PDF URLs are fetched fresh on demand via get-agreement-document — no caching here
    const updates: Record<string, unknown> = { updated_at: now };
    if (isNda) {
      updates.nda_signed = true;
      updates.nda_signed_at = now;
      updates.nda_pandadoc_status = 'completed';
      updates.nda_status = 'signed';
      updates.nda_signed_by_name = signerName;
    } else {
      updates.fee_agreement_signed = true;
      updates.fee_agreement_signed_at = now;
      updates.fee_pandadoc_status = 'completed';
      updates.fee_agreement_status = 'signed';
      updates.fee_agreement_signed_by_name = signerName;
    }

    await supabaseAdmin.from('firm_agreements').update(updates).eq('id', firmId);

    // Dedup log
    await supabaseAdmin
      .from('pandadoc_webhook_log')
      .insert({
        event_type: 'document.completed',
        document_id: String(documentId),
        external_id: firmId,
        raw_payload: { confirmed_by_frontend: userId, document_type: documentType },
        processed_at: now,
      })
      .then(({ error: logErr }: { error: { code?: string; message?: string } | null }) => {
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
        await supabaseAdmin.from('profiles').update(profileUpdates).eq('id', member.user_id);
      }

      await sendBuyerSignedDocNotification(supabaseAdmin, members, firmId, docLabel, signedDocUrl);
    }

    // Send confirmation emails
    await sendSigningConfirmationEmails(supabaseAdmin, {
      firmId,
      firmName,
      docLabel,
      signerName,
      signerEmail: profile?.email || '',
      signedDocUrl,
    });

    await createAdminNotification(supabaseAdmin, firmId, firmName, docLabel);

    console.log(`✅ Confirmed ${docLabel} signed for firm ${firmId} (buyer ${userId})`);

    return new Response(
      JSON.stringify({ confirmed: true, signedDocumentUrl: signedDocUrl, resolvedFirmId: firmId }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error(
      'Error in confirm-agreement-signed:',
      error instanceof Error ? error.message : String(error),
    );
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});

// ─── Send confirmation emails to buyer + admins ───

async function sendSigningConfirmationEmails(
  supabase: SupabaseClient,
  opts: {
    firmId: string;
    firmName: string;
    docLabel: string;
    signerName: string;
    signerEmail: string;
    signedDocUrl: string | null;
  },
) {
  const { firmId: _firmId, firmName, docLabel, signerName, signerEmail, signedDocUrl } = opts;
  const senderEmail = Deno.env.get('SENDER_EMAIL') || 'notifications@sourcecodeals.com';
  const senderName = Deno.env.get('SENDER_NAME') || 'SourceCo';

  // 1. Email to the buyer who signed
  if (signerEmail) {
    try {
      const downloadLine = signedDocUrl
        ? `<p style="margin: 0 0 16px 0;">You can <a href="${signedDocUrl}" style="color: #DEC76B; font-weight: 600;">download your signed copy here</a>, or view it anytime from your Profile → Documents tab.</p>`
        : `<p style="margin: 0 0 16px 0;">A copy is available in your Profile → Documents tab.</p>`;

      const buyerHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;color:#9A9A9A;text-transform:uppercase;margin-bottom:8px;">SOURCECO</div>
  <h1 style="color:#0E101A;font-size:20px;font-weight:700;margin:0 0 24px 0;line-height:1.4;">✅ ${docLabel} Signed Successfully</h1>
  <div style="color:#3A3A3A;font-size:15px;line-height:1.7;">
    <p style="margin:0 0 16px 0;">Hi ${signerName},</p>
    ${isNda ? `<p style="margin:0 0 16px 0;">Your NDA is signed and on file. That's the only signature you'll ever need on the platform — it covers every deal on SourceCo, now and in the future.</p>
<h3 style="color: #0e101a; font-size: 16px; margin: 24px 0 8px 0;">What to do next</h3>
<ul style="padding-left: 20px; color: #374151; margin: 0 0 24px 0;">
  <li>Browse every deal in the pipeline — deal summaries and business details are now visible</li>
  <li>When you find a fit, request an introduction — our team reviews every request and selects based on fit</li>
  <li>Tell us specifically why you're a strong match when you submit — it makes a difference</li>
</ul>` : `<p style="margin:0 0 16px 0;">Your fee agreement is signed and on file. You're fully set up — every deal on SourceCo is open to you and your introduction request is now being reviewed.</p>
<p style="margin:0 0 16px 0;">Our fee is success-only — nothing owed unless a deal closes.</p>`}
    ${downloadLine}
  </div>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://marketplace.sourcecodeals.com/messages" style="display:inline-block;background:#0E101A;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View Your Dashboard</a>
  </div>
  <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5DDD0;">
    <p style="color:#9A9A9A;font-size:12px;margin:0;">This is an automated confirmation from SourceCo.</p>
  </div>
</div></body></html>`;

      const buyerSubject = isNda
        ? `NDA signed — the full pipeline is open.`
        : `Fee agreement signed — you're fully set up.`;

      await sendViaBervo({
        to: signerEmail,
        toName: signerName,
        subject: buyerSubject,
        htmlContent: buyerHtml,
        senderName,
        senderEmail,
      });
      console.log(`📧 Buyer signing confirmation email sent to ${signerEmail}`);
    } catch (err) {
      console.error('Failed to send buyer confirmation email:', err);
    }
  }

  // 2. Email to all admins
  try {
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'owner']);

    if (adminRoles?.length) {
      const adminIds = adminRoles.map((r: { user_id: string }) => r.user_id);
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', adminIds);

      for (const admin of adminProfiles || []) {
        if (!admin.email) continue;
        const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin';

        const adminHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;color:#9A9A9A;text-transform:uppercase;margin-bottom:8px;">SOURCECO</div>
  <h1 style="color:#0E101A;font-size:20px;font-weight:700;margin:0 0 24px 0;line-height:1.4;">📄 ${docLabel} Signed: ${firmName}</h1>
  <div style="color:#3A3A3A;font-size:15px;line-height:1.7;">
    <p style="margin:0 0 16px 0;">Hi ${adminName},</p>
    <p style="margin:0 0 16px 0;"><strong>${signerName}</strong> (${signerEmail}) from <strong>${firmName}</strong> has signed the <strong>${docLabel}</strong>.</p>
    <div style="background:#FCF9F0;border-left:4px solid #DEC76B;padding:16px;border-radius:0 8px 8px 0;margin:0 0 24px 0;">
      <p style="margin:0;color:#3A3A3A;font-size:14px;"><strong>Document:</strong> ${docLabel}<br/><strong>Firm:</strong> ${firmName}<br/><strong>Signed by:</strong> ${signerName} (${signerEmail})</p>
    </div>
  </div>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://marketplace.sourcecodeals.com/admin/documents" style="display:inline-block;background:#0E101A;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View Document Tracking</a>
  </div>
  <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5DDD0;">
    <p style="color:#9A9A9A;font-size:12px;margin:0;">This is an automated notification from SourceCo.</p>
  </div>
</div></body></html>`;

        await sendViaBervo({
          to: admin.email,
          toName: adminName,
          subject: `📄 ${docLabel} Signed: ${firmName} — ${signerName}`,
          htmlContent: adminHtml,
          senderName,
          senderEmail,
        });
        console.log(`📧 Admin signing notification sent to ${admin.email}`);
      }
    }
  } catch (err) {
    console.error('Failed to send admin confirmation emails:', err);
  }
}

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
      metadata: {
        firm_id: firmId,
        document_type: docLabel.toLowerCase().replace(/ /g, '_'),
        pandadoc_status: 'completed',
      },
      is_read: false,
    }));

    await supabase.from('admin_notifications').insert(notifications);
  } catch (err) {
    console.error('Admin notification error:', err);
  }
}
