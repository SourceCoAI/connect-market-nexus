/**
 * record-data-room-view: Public data room access endpoint (token-gated)
 *
 * PUBLIC — no authentication required. Access is gated by access_token.
 *
 * Accepts GET (query params) or POST (JSON body):
 *   - access_token: string (required) — from deal_data_room_access
 *   - document_id: UUID (optional) — if provided, generates a signed download URL
 *
 * Without document_id:
 *   Returns { project_name, documents: [...list of granted documents] }
 *
 * With document_id:
 *   Validates document is in granted set, returns { download_url, document_title }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const BUCKET_NAME = 'deal-documents';
const SIGNED_URL_EXPIRY = 60; // 60 seconds

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Allow GET and POST for this public endpoint (frontend uses POST with JSON body)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Support both GET (query params) and POST (JSON body)
    let accessToken: string | null = null;
    let documentId: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      accessToken = body.access_token || null;
      documentId = body.document_id || null;
    } else {
      const url = new URL(req.url);
      accessToken = url.searchParams.get('access_token');
      documentId = url.searchParams.get('document_id');
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'access_token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Fetch deal_data_room_access by access_token ──

    const { data: accessRecord, error: accessError } = await supabaseAdmin
      .from('deal_data_room_access')
      .select('id, is_active, deal_id, granted_document_ids, buyer_email')
      .eq('access_token', accessToken)
      .single();

    if (accessError || !accessRecord) {
      return new Response(JSON.stringify({ error: 'Access not found or revoked' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Validate access is active ──

    if (!accessRecord.is_active) {
      return new Response(JSON.stringify({ error: 'Access not found or revoked' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Update last_accessed_at ──

    const { error: touchError } = await supabaseAdmin
      .from('deal_data_room_access')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', accessRecord.id);

    if (touchError) {
      console.error('Failed to update last_accessed_at:', touchError);
      // Continue — do not block the buyer from viewing
    }

    // ── 4. Fetch deal info ──

    const { data: deal, error: dealError } = await supabaseAdmin
      .from('listings')
      .select('id, project_name, title')
      .eq('id', accessRecord.deal_id)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const projectName = deal.project_name || deal.title || 'Confidential';

    // ── 5. If document_id provided: validate and return signed download URL ──

    if (documentId) {
      // Determine if this document is in the granted set
      const grantedIds: string[] | null = accessRecord.granted_document_ids;

      if (grantedIds && grantedIds.length > 0) {
        // Specific documents were granted — check if requested document is in the list
        if (!grantedIds.includes(documentId)) {
          return new Response(JSON.stringify({ error: 'Access denied to this document' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Also verify the document is still active (not deleted/archived)
        const { data: docActive, error: docActiveError } = await supabaseAdmin
          .from('deal_documents')
          .select('id')
          .eq('id', documentId)
          .eq('deal_id', accessRecord.deal_id)
          .eq('status', 'active')
          .single();

        if (docActiveError || !docActive) {
          return new Response(JSON.stringify({ error: 'Access denied to this document' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // No specific document_ids means all data_room_files for this deal are granted
        // Validate the document belongs to this deal and is a data_room_file
        const { data: docCheck, error: docCheckError } = await supabaseAdmin
          .from('deal_documents')
          .select('id')
          .eq('id', documentId)
          .eq('deal_id', accessRecord.deal_id)
          .eq('document_type', 'data_room_file')
          .eq('status', 'active')
          .single();

        if (docCheckError || !docCheck) {
          return new Response(JSON.stringify({ error: 'Access denied to this document' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Fetch the document details (scoped to deal for safety)
      const { data: document, error: docError } = await supabaseAdmin
        .from('deal_documents')
        .select('id, title, file_path')
        .eq('id', documentId)
        .eq('deal_id', accessRecord.deal_id)
        .single();

      if (docError || !document) {
        return new Response(JSON.stringify({ error: 'Document not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!document.file_path) {
        return new Response(JSON.stringify({ error: 'Document file not found in storage' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate 60-second signed URL
      const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(document.file_path, SIGNED_URL_EXPIRY, {
          download: true,
        });

      if (urlError || !signedUrlData) {
        console.error('Signed URL error:', urlError);
        return new Response(JSON.stringify({ error: 'Failed to generate download URL' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(
        `Data room download: document ${documentId} by ${accessRecord.buyer_email} (access: ${accessRecord.id})`,
      );

      return new Response(
        JSON.stringify({
          download_url: signedUrlData.signedUrl,
          document_title: document.title,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 6. No document_id: return list of granted documents ──

    let documentsQuery;

    const grantedIds: string[] | null = accessRecord.granted_document_ids;

    if (grantedIds && grantedIds.length > 0) {
      // Specific documents granted
      documentsQuery = supabaseAdmin
        .from('deal_documents')
        .select('id, title, file_size_bytes, created_at')
        .in('id', grantedIds)
        .eq('status', 'active')
        .order('created_at', { ascending: true });
    } else {
      // All data_room_files for this deal
      documentsQuery = supabaseAdmin
        .from('deal_documents')
        .select('id, title, file_size_bytes, created_at')
        .eq('deal_id', accessRecord.deal_id)
        .eq('document_type', 'data_room_file')
        .eq('status', 'active')
        .order('created_at', { ascending: true });
    }

    const { data: documents, error: docsError } = await documentsQuery;

    if (docsError) {
      console.error('Failed to fetch data room documents:', docsError);
      return new Response(JSON.stringify({ error: 'Failed to load data room documents' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(
      `Data room viewed: deal ${accessRecord.deal_id} by ${accessRecord.buyer_email} (access: ${accessRecord.id}, documents: ${documents?.length || 0})`,
    );

    return new Response(
      JSON.stringify({
        project_name: projectName,
        documents: (documents || []).map((doc) => ({
          id: doc.id,
          title: doc.title,
          file_size_bytes: doc.file_size_bytes,
          created_at: doc.created_at,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Record data room view error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
