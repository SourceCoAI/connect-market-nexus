import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

/**
 * get-buyer-nda-embed
 * Buyer-facing endpoint: returns the PandaDoc embedded signing session URL for the buyer's NDA.
 * Uses deterministic firm resolution: active connection_request.firm_id first,
 * then fallback to latest firm_members by added_at.
 *
 * PandaDoc flow:
 *   - If document exists: POST /public/v1/documents/{id}/session for fresh session token
 *   - If no document: create one via PandaDoc API, then get session
 *   - Returns embedUrl: https://app.pandadoc.com/s/{token}?embedded=1
 */

const PANDADOC_API_BASE = 'https://api.pandadoc.com/public/v1';

async function resolveFirmId(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  // Priority 1: Most recent active connection_request with non-null firm_id
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

  // Priority 2: Latest firm_members by added_at
  const { data: membership } = await supabaseAdmin
    .from('firm_members')
    .select('firm_id')
    .eq('user_id', userId)
    .order('added_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return membership?.firm_id || null;
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

    // Deterministic firm resolution
    const firmId = await resolveFirmId(supabaseAdmin, userId);

    if (!firmId) {
      return new Response(
        JSON.stringify({ error: 'No firm found for this buyer', hasFirm: false }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(`🔍 Resolved firm ${firmId} for user ${userId}`);

    // Get firm agreement
    const { data: firm } = await supabaseAdmin
      .from('firm_agreements')
      .select('id, nda_signed, nda_pandadoc_document_id, nda_pandadoc_status')
      .eq('id', firmId)
      .single();

    if (!firm) {
      return new Response(JSON.stringify({ error: 'Firm agreement not found', hasFirm: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // If already signed, no embed needed
    if (firm.nda_signed) {
      return new Response(JSON.stringify({ ndaSigned: true, embedUrl: null, resolvedFirmId: firmId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Get buyer profile for email/name
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
    if (firm.nda_pandadoc_document_id) {
      // Check document status via PandaDoc API for self-healing
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 15000);
      try {
        const statusRes = await fetch(
          `${PANDADOC_API_BASE}/documents/${firm.nda_pandadoc_document_id}`,
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
                nda_signed: true,
                nda_signed_at: now,
                nda_pandadoc_status: 'completed',
                nda_status: 'signed',
                updated_at: now,
              })
              .eq('id', firmId);

            const { data: members } = await supabaseAdmin
              .from('firm_members')
              .select('user_id')
              .eq('firm_id', firmId);
            if (members?.length) {
              for (const member of members) {
                await supabaseAdmin
                  .from('profiles')
                  .update({ nda_signed: true, nda_signed_at: now, updated_at: now })
                  .eq('id', member.user_id);
              }
            }

            console.log(`🔧 Self-healed: NDA for firm ${firmId} marked as signed`);
            return new Response(JSON.stringify({ ndaSigned: true, embedUrl: null, resolvedFirmId: firmId }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }

          // Document exists and is not completed — create a fresh session
          const sessionToken = await createPandaDocSession(
            pandadocApiKey,
            firm.nda_pandadoc_document_id,
            profile.email,
          );

          if (sessionToken) {
            const embedUrl = `https://app.pandadoc.com/s/${sessionToken}?embedded=1`;
            return new Response(JSON.stringify({ ndaSigned: false, embedUrl, resolvedFirmId: firmId }), {
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
    const ndaTemplateUuid = Deno.env.get('PANDADOC_NDA_TEMPLATE_UUID');
    if (!ndaTemplateUuid) {
      return new Response(JSON.stringify({ error: 'NDA template not configured' }), {
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
          name: `NDA — ${buyerName}`,
          template_uuid: ndaTemplateUuid,
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
            document_type: 'nda',
          },
          tags: ['nda', `firm:${firmId}`],
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
        message: 'Please review and sign the NDA to proceed.',
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
        nda_pandadoc_document_id: documentId,
        nda_pandadoc_status: 'sent',
        nda_status: 'sent',
        nda_sent_at: now,
        updated_at: now,
      })
      .eq('id', firmId);

    await supabaseAdmin.from('pandadoc_webhook_log').insert({
      event_type: 'document_created',
      document_id: documentId,
      document_type: 'nda',
      external_id: firmId,
      signer_email: profile.email,
      raw_payload: { created_by_buyer: userId },
    });

    console.log(`✅ Created NDA document ${documentId} for buyer ${userId} (firm ${firmId})`);

    return new Response(JSON.stringify({ ndaSigned: false, embedUrl, resolvedFirmId: firmId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('❌ Error in get-buyer-nda-embed:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
