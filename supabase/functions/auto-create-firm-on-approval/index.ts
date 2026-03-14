import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

/**
 * auto-create-firm-on-approval
 * When a connection request is approved, this function:
 * 1. Creates (or finds) a firm_agreement for the buyer's company
 * 2. Creates a firm_member linking the user to the firm
 * 3. Creates a PandaDoc NDA document for e-signing
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ApprovalRequest {
  connectionRequestId: string;
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

    // Admin-only
    const auth = await requireAdmin(req, supabaseAdmin as any);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { connectionRequestId }: ApprovalRequest = await req.json();

    // H1: Input validation
    if (!connectionRequestId) {
      return new Response(JSON.stringify({ error: 'connectionRequestId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!UUID_REGEX.test(connectionRequestId)) {
      return new Response(JSON.stringify({ error: 'Invalid connectionRequestId format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Fetch the connection request with user profile
    const { data: cr, error: crError } = await supabaseAdmin
      .from('connection_requests')
      .select(
        `
        id, user_id, lead_company, lead_email, lead_name, lead_role,
        listing_id, firm_id, status
      `,
      )
      .eq('id', connectionRequestId)
      .single();

    if (crError || !cr) {
      return new Response(JSON.stringify({ error: 'Connection request not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Prevent duplicate processing of already-approved requests
    if (cr.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Cannot approve: request is already ${cr.status}` }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log('📝 Processing approval for connection request:', {
      id: cr.id,
      company: cr.lead_company,
      existingFirmId: cr.firm_id,
    });

    let firmId = cr.firm_id;
    const companyName = cr.lead_company || 'Unknown Company';
    // Strip common business suffixes before normalizing so "ABC Inc" and "ABC Inc." match.
    const BUSINESS_SUFFIXES =
      /\b(inc|llc|llp|ltd|corp|corporation|company|co|group|holdings|partners|lp|plc|pllc|pa|pc|sa|gmbh|ag|pty|srl|bv|nv)\b/gi;
    const normalizedName = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(BUSINESS_SUFFIXES, '')
      .replace(/\s+/g, ' ')
      .trim();
    const emailDomain = cr.lead_email?.split('@')[1] || null;

    // Generic/free email providers — never use these for firm matching.
    const GENERIC_EMAIL_DOMAINS = new Set([
      'gmail.com',
      'googlemail.com',
      'yahoo.com',
      'yahoo.co.uk',
      'outlook.com',
      'hotmail.com',
      'live.com',
      'msn.com',
      'aol.com',
      'icloud.com',
      'me.com',
      'mac.com',
      'protonmail.com',
      'proton.me',
      'mail.com',
      'zoho.com',
      'yandex.com',
      'gmx.com',
      'gmx.net',
      'fastmail.com',
    ]);
    const isGenericDomain = emailDomain
      ? GENERIC_EMAIL_DOMAINS.has(emailDomain.toLowerCase())
      : false;

    // Step 1: Find or create firm
    if (!firmId) {
      let existingFirm = null;

      if (emailDomain && !isGenericDomain) {
        const { data } = await supabaseAdmin
          .from('firm_agreements')
          .select('id')
          .eq('email_domain', emailDomain)
          .maybeSingle();
        existingFirm = data;
      }

      if (!existingFirm) {
        const { data } = await supabaseAdmin
          .from('firm_agreements')
          .select('id')
          .eq('normalized_company_name', normalizedName)
          .maybeSingle();
        existingFirm = data;
      }

      if (existingFirm) {
        firmId = existingFirm.id;
      } else {
        const { data: newFirm, error: firmError } = await supabaseAdmin
          .from('firm_agreements')
          .insert({
            primary_company_name: companyName,
            normalized_company_name: normalizedName,
            email_domain: isGenericDomain ? null : emailDomain,
            nda_signed: false,
            fee_agreement_signed: false,
          })
          .select('id')
          .single();

        if (firmError) {
          console.error('❌ Failed to create firm:', firmError);
          return new Response(JSON.stringify({ error: 'Failed to create firm agreement' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        firmId = newFirm.id;
      }

      // Link firm to connection request
      await supabaseAdmin
        .from('connection_requests')
        .update({ firm_id: firmId, updated_at: new Date().toISOString() })
        .eq('id', connectionRequestId);
    }

    // Step 2: Create firm_member if user exists
    if (cr.user_id) {
      const { data: existingMember } = await supabaseAdmin
        .from('firm_members')
        .select('id')
        .eq('firm_id', firmId)
        .eq('user_id', cr.user_id)
        .maybeSingle();

      if (!existingMember) {
        const { error: memberError } = await supabaseAdmin.from('firm_members').insert({
          firm_id: firmId,
          user_id: cr.user_id,
          role: cr.lead_role || 'member',
        });

        if (memberError) {
          console.error('⚠️ Failed to create firm member:', memberError);
        }
      }
    }

    // Step 3: Create PandaDoc NDA document
    let ndaDocument = null;
    const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY');
    const ndaTemplateUuid = Deno.env.get('PANDADOC_NDA_TEMPLATE_UUID');

    if (pandadocApiKey && ndaTemplateUuid && cr.lead_email) {
      try {
        const signerName = cr.lead_name || cr.lead_email.split('@')[0];
        const nameParts = signerName.split(/\s+/);
        const firstName = nameParts[0] || signerName;
        const lastName = nameParts.slice(1).join(' ') || '';

        const documentPayload = {
          name: `NDA — ${signerName}`,
          template_uuid: ndaTemplateUuid,
          recipients: [
            {
              email: cr.lead_email,
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
        };

        // M1: Timeout on external API call
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        let pandadocResponse: Response;
        try {
          pandadocResponse = await fetch('https://api.pandadoc.com/public/v1/documents', {
            method: 'POST',
            headers: {
              'Authorization': `API-Key ${pandadocApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(documentPayload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (pandadocResponse.ok) {
          const result = await pandadocResponse.json();
          const documentId = result.id;

          ndaDocument = { documentId };

          // Send the document via email
          await new Promise((r) => setTimeout(r, 2000));
          const sendResponse = await fetch(`https://api.pandadoc.com/public/v1/documents/${documentId}/send`, {
            method: 'POST',
            headers: {
              'Authorization': `API-Key ${pandadocApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: 'Please review and sign the NDA to proceed.',
              silent: false,
            }),
          });

          if (!sendResponse.ok) {
            const sendErrorText = await sendResponse.text();
            console.warn(`⚠️ PandaDoc /send failed (${sendResponse.status}):`, sendErrorText);
          }

          const { error: firmUpdateError } = await supabaseAdmin
            .from('firm_agreements')
            .update({
              nda_pandadoc_document_id: documentId,
              nda_pandadoc_status: 'pending',
              nda_email_sent: true,
              nda_email_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', firmId);

          if (firmUpdateError) {
            console.warn('⚠️ Failed to update firm_agreements with NDA status:', firmUpdateError);
          }

          const { error: crUpdateError } = await supabaseAdmin
            .from('connection_requests')
            .update({
              lead_nda_email_sent: true,
              lead_nda_email_sent_at: new Date().toISOString(),
              lead_nda_email_sent_by: auth.userId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', connectionRequestId);

          if (crUpdateError) {
            console.warn('⚠️ Failed to update connection_request NDA status:', crUpdateError);
          }

          const { error: webhookLogError } = await supabaseAdmin.from('pandadoc_webhook_log').insert({
            event_type: 'nda_auto_created_on_approval',
            document_id: documentId,
            document_type: 'nda',
            external_id: firmId,
            raw_payload: { connection_request_id: connectionRequestId, created_by: auth.userId },
          });

          if (webhookLogError) {
            console.warn('⚠️ Failed to insert pandadoc_webhook_log entry:', webhookLogError);
          }
        } else {
          const errorText = await pandadocResponse.text();
          console.error('❌ PandaDoc NDA creation failed:', errorText);
        }
      } catch (docuError: unknown) {
        if (docuError instanceof Error && docuError.name === 'AbortError') {
          console.error('⚠️ PandaDoc NDA creation timed out');
        } else {
          console.error('⚠️ PandaDoc NDA creation error:', docuError);
        }
      }
    } else {
      console.log('ℹ️ Skipping PandaDoc NDA — missing API key, template, or email');
    }

    return new Response(
      JSON.stringify({
        success: true,
        firmId,
        firmCreated: !cr.firm_id,
        ndaDocument,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('❌ Error in auto-create-firm-on-approval:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
