/**
 * data-room-download: Generates signed URLs for document access
 *
 * Handles both admin and buyer access:
 * - Admins: Full access to all documents
 * - Buyers: Only documents matching their access toggles
 *
 * GET params:
 *   - document_id: UUID of the document
 *   - action: "view" | "download" (default: "view")
 *
 * Returns: { url: string, expires_in: 300 }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const BUCKET_NAME = "deal-data-rooms";
const SIGNED_URL_EXPIRY = 300; // 5 minutes

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Auth check (any authenticated user)
  const auth = await requireAuth(req);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const documentId = url.searchParams.get("document_id");
    const action = url.searchParams.get("action") || "view";

    if (!documentId) {
      return new Response(JSON.stringify({ error: "document_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get document record
    const { data: doc, error: docError } = await supabaseAdmin
      .from("data_room_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if download is allowed for this document
    if (action === "download" && !doc.allow_download) {
      return new Response(
        JSON.stringify({ error: "Download not permitted for this document. View only." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check access
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { user_id: auth.userId });

    if (!isAdmin) {
      // Buyer access check — the RPC now handles dual-ID (source_deal_id) awareness
      const hasAccess = await supabaseAdmin.rpc("check_data_room_access", {
        p_deal_id: doc.deal_id,
        p_user_id: auth.userId,
        p_category: doc.document_category,
      });

      if (!hasAccess.data) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generate signed URL
    const { data: signedUrl, error: urlError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(doc.storage_path, SIGNED_URL_EXPIRY, {
        download: action === "download",
      });

    if (urlError || !signedUrl) {
      console.error("Signed URL error:", urlError);
      return new Response(
        JSON.stringify({ error: "Failed to generate access URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the access event
    const auditAction = action === "download" ? "download_document" : "view_document";
    await supabaseAdmin.rpc("log_data_room_event", {
      p_deal_id: doc.deal_id,
      p_user_id: auth.userId,
      p_action: auditAction,
      p_document_id: documentId,
      p_metadata: {
        file_name: doc.file_name,
        document_category: doc.document_category,
        is_admin: !!isAdmin,
      },
      p_ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      p_user_agent: req.headers.get("user-agent") || null,
    });

    return new Response(
      JSON.stringify({
        url: signedUrl.signedUrl,
        expires_in: SIGNED_URL_EXPIRY,
        file_name: doc.file_name,
        file_type: doc.file_type,
        allow_download: doc.allow_download,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Download error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
