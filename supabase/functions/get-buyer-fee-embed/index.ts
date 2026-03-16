import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

/**
 * get-buyer-fee-embed
 * Buyer-facing endpoint: returns the PandaDoc embedded signing session URL for the buyer's Fee Agreement.
 * Uses canonical resolve_user_firm_id() RPC for deterministic firm resolution.
 */

const PANDADOC_API_BASE = 'https://api.pandadoc.com/public/v1';

/** Notify all admins that a buyer opened a signing form */
async function notifyAdminsSigningRequested(
  supabaseAdmin: ReturnType<typeof createClient>,
  buyerName: string,
  buyerEmail: string,
  firmId: string,
  docType: 'nda' | 'fee_agreement',
  isNewDocument: boolean,
) {
  try {
    const { data: adminRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'owner']);

    const admins = (adminRoles || []).map((r: { user_id: string }) => r.user_id);
    if (!admins.length) return;

    const docLabel = docType === 'nda' ? 'NDA' : 'Fee Agreement';
    const action = isNewDocument ? 'initiated signing of' : 'opened signing form for';

    const notifications = admins.map((adminId: string) => ({
      admin_id: adminId,
      title: `${docLabel} Signing Requested`,
      message: `${buyerName} (${buyerEmail}) ${action} the ${docLabel}.`,
      notification_type: 'document_signing_requested',
      metadata: {
        firm_id: firmId,
        document_type: docType,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        is_new_document: isNewDocument,
      },
      action_url: '/admin/documents',
      is_read: false,
    }));

    await supabaseAdmin.from('admin_notifications').insert(notifications);
    console.log(`🔔 Notified ${admins.length} admins: ${buyerName} requested ${docLabel} signing`);
  } catch (err) {
    console.error('⚠️ Failed to create admin signing notification:', err);
  }
}

async function createPandaDocSession(
  pandadocApiKey: string,
  documentId: string,
  recipientEmail: string,
): Promise<string | null> {
  const sessionResponse = await fetch(
    `${PANDADOC_API_BASE}/documents/${documentId}/session`,
    {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandadocApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: recipientEmail,
        lifetime: 3600,
      }),
    },
  );

  if (sessionResponse.ok) {
    const result = await sessionResponse.json();
    return result.id || null;
  }
  console.warn(`⚠️ Failed to create PandaDoc session: HTTP ${sessionResponse.status}`);
  return null;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
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
    const { data: firmId, error: resolveErr } = await supabaseAdmin.rpc('resolve_user_firm_id', {
      p_user_id: userId,
    });
    if (resolveErr) {
      console.error('❌ resolve_user_firm_id error:', resolveErr);
    }

    if (!firmId) {
      return new Response(
        JSON.stringify({ error: 'No firm found for this buyer', hasFirm: false }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(`🔍 Resolved firm ${firmId} for user ${userId}`);

    const { data: firm } = await supabaseAdmin
      .from('firm_agreements')
      .select('id, fee_agreement_signed, fee_pandadoc_document_id, fee_pandadoc_status')
      .eq('id', firmId)
      .single();

    if (!firm) {
      return new Response(JSON.stringify({ error: 'Firm agreement not found', hasFirm: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (firm.fee_agreement_signed) {
      return new Response(JSON.stringify({ feeSigned: true, embedUrl: null, resolvedFirmId: firmId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', userId)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const buyerName =
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email;

    const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY');
    if (!pandadocApiKey) {
      return new Response(JSON.stringify({ error: 'PandaDoc not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // If we have an existing PandaDoc document, get a fresh session
    if (firm.fee_pandadoc_document_id) {
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 15000);
      try {
        const statusRes = await fetch(
          `${PANDADOC_API_BASE}/documents/${firm.fee_pandadoc_document_id}`,
          {
            headers: { 'Authorization': `API-Key ${pandadocApiKey}` },
            signal: fetchController.signal,
          },
        );

        if (statusRes.ok) {
          const docData = await statusRes.json();

          // Self-heal: if PandaDoc says completed but our DB doesn't reflect it
          if (docData.status === 'document.completed') {
            const now = new Date().toISOString();
            await supabaseAdmin
              .from('firm_agreements')
              .update({
                fee_agreement_signed: true,
                fee_agreement_signed_at: now,
                fee_pandadoc_status: 'completed',
                fee_agreement_status: 'signed',
                updated_at: now,
              })
              .eq('id', firmId);

            // firm_agreements is the single source of truth — no profile-level writes

            console.log(`🔧 Self-healed: fee agreement for firm ${firmId} marked as signed`);
            return new Response(JSON.stringify({ feeSigned: true, embedUrl: null, resolvedFirmId: firmId }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }

          // Document exists and is not completed — create a fresh session
          const sessionToken = await createPandaDocSession(
            pandadocApiKey,
            firm.fee_pandadoc_document_id,
            profile.email,
          );

          if (sessionToken) {
            const embedUrl = `https://app.pandadoc.com/s/${sessionToken}?embedded=1`;
            await notifyAdminsSigningRequested(supabaseAdmin, buyerName, profile.email, firmId, 'fee_agreement', false);
            return new Response(JSON.stringify({ feeSigned: false, embedUrl, resolvedFirmId: firmId }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
        }
      } finally {
        clearTimeout(fetchTimeout);
      }
    }

    // No existing document — create new
    const feeTemplateUuid = Deno.env.get('PANDADOC_FEE_TEMPLATE_UUID');
    if (!feeTemplateUuid) {
      return new Response(JSON.stringify({ error: 'Fee agreement template not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const nameParts = buyerName.split(/\s+/);
    const firstName = nameParts[0] || buyerName;
    const lastName = nameParts.slice(1).join(' ') || '';

    // Step 1: Create document from template
    const createController = new AbortController();
    const createTimeout = setTimeout(() => createController.abort(), 15000);
    let createResponse: Response;
    try {
      createResponse = await fetch(`${PANDADOC_API_BASE}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `API-Key ${pandadocApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Fee Agreement — ${buyerName}`,
          template_uuid: feeTemplateUuid,
          recipients: [
            {
              email: profile.email,
              first_name: firstName,
              last_name: lastName,
              role: 'Signer',
            },
          ],
          metadata: {
            firm_id: firmId,
            document_type: 'fee_agreement',
          },
          tags: ['fee_agreement', `firm:${firmId}`],
        }),
        signal: createController.signal,
      });
    } finally {
      clearTimeout(createTimeout);
    }

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('❌ PandaDoc API error (create):', errorText);
      return new Response(JSON.stringify({ error: 'Failed to create signing form' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const createResult = await createResponse.json();
    const documentId = createResult.id;

    // Step 2: Send the document (silent — no email from PandaDoc)
    await new Promise((r) => setTimeout(r, 2000));

    const sendResponse = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${pandadocApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Please review and sign the Fee Agreement to proceed.',
        silent: true,
      }),
    });

    if (!sendResponse.ok) {
      console.error('❌ PandaDoc send failed:', await sendResponse.text());
    }

    // Step 3: Create signing session
    const sessionToken = await createPandaDocSession(pandadocApiKey, documentId, profile.email);
    const embedUrl = sessionToken
      ? `https://app.pandadoc.com/s/${sessionToken}?embedded=1`
      : null;

    // Update DB
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('firm_agreements')
      .update({
        fee_pandadoc_document_id: documentId,
        fee_pandadoc_status: 'sent',
        fee_agreement_status: 'sent',
        fee_agreement_sent_at: now,
        updated_at: now,
      })
      .eq('id', firmId);

    await supabaseAdmin.from('pandadoc_webhook_log').insert({
      event_type: 'document_created',
      document_id: documentId,
      document_type: 'fee_agreement',
      external_id: firmId,
      signer_email: profile.email,
      raw_payload: { created_by_buyer: userId },
    });

    console.log(`✅ Created fee agreement document ${documentId} for buyer ${userId} (firm ${firmId})`);

    await notifyAdminsSigningRequested(supabaseAdmin, buyerName, profile.email, firmId, 'fee_agreement', true);

    return new Response(JSON.stringify({ feeSigned: false, embedUrl, resolvedFirmId: firmId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('❌ Error in get-buyer-fee-embed:', error instanceof Error ? error.message : String(error));
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
