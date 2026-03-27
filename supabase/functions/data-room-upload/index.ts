/**
 * data-room-upload: Handles document uploads to a deal's data room
 *
 * Admin-only. Uploads file to private Supabase Storage bucket,
 * creates data_room_documents record, logs audit event.
 *
 * POST body (multipart/form-data):
 *   - file: The document file
 *   - deal_id: UUID of the deal (listing)
 *   - folder_name: Folder to organize into (e.g., "Financials", "Legal")
 *   - document_category: "anonymous_teaser" | "full_memo" | "data_room"
 *   - allow_download: "true" | "false" (optional, default true)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { isExtractableType, extractAndStoreDocumentText } from "../_shared/document-text-extractor.ts";

const BUCKET_NAME = "deal-data-rooms";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "text/csv",
]);

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Admin auth check
  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dealId = formData.get("deal_id") as string;
    const folderName = (formData.get("folder_name") as string) || "General";
    const documentCategory = formData.get("document_category") as string;
    const allowDownload = formData.get("allow_download") !== "false";

    // Validate required fields
    if (!file) {
      return new Response(JSON.stringify({ error: "File is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!dealId) {
      return new Response(JSON.stringify({ error: "deal_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["anonymous_teaser", "full_memo", "data_room"].includes(documentCategory)) {
      return new Response(
        JSON.stringify({ error: "document_category must be anonymous_teaser, full_memo, or data_room" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response(
        JSON.stringify({ error: `File type ${file.type} not allowed. Allowed: PDF, DOCX, XLSX, PPTX, JPG, PNG, CSV` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify deal exists
    const { data: deal, error: dealError } = await supabaseAdmin
      .from("listings")
      .select("id")
      .eq("id", dealId)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map category to storage path
    const categoryPath = documentCategory === "anonymous_teaser" ? "teasers"
      : documentCategory === "full_memo" ? "memos"
      : "data-room";

    // Sanitize folder name for path safety
    const safeFolderName = folderName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "General";

    // Generate unique storage path
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-_]/g, "_");
    const storagePath = `${dealId}/${categoryPath}/${safeFolderName}/${timestamp}_${safeFileName}`;

    // Upload to storage
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create document record
    const { data: doc, error: docError } = await supabaseAdmin
      .from("data_room_documents")
      .insert({
        deal_id: dealId,
        folder_name: safeFolderName,
        file_name: file.name,
        file_type: file.type,
        file_size_bytes: file.size,
        storage_path: storagePath,
        document_category: documentCategory,
        allow_download: allowDownload,
        uploaded_by: auth.userId,
      })
      .select()
      .single();

    if (docError) {
      // Rollback: delete the uploaded file
      await supabaseAdmin.storage.from(BUCKET_NAME).remove([storagePath]);
      console.error("Document record error:", docError);
      return new Response(
        JSON.stringify({ error: "Failed to create document record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log audit event
    await supabaseAdmin.rpc("log_data_room_event", {
      p_deal_id: dealId,
      p_user_id: auth.userId,
      p_action: "upload_document",
      p_document_id: doc.id,
      p_metadata: {
        file_name: file.name,
        file_type: file.type,
        file_size_bytes: file.size,
        folder_name: safeFolderName,
        document_category: documentCategory,
      },
      p_ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      p_user_agent: req.headers.get("user-agent") || null,
    });

    // Extract text content from the document (non-blocking for the upload response).
    // Text is stored on the document record for use in deal enrichment and memo generation.
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiApiKey && documentCategory === "data_room" && isExtractableType(file.type)) {
      // Run text extraction in the background — don't block the upload response
      extractAndStoreDocumentText(
        supabaseAdmin as any,
        doc.id,
        storagePath,
        file.type,
        geminiApiKey,
      ).catch((err) => {
        console.error("Background text extraction failed (non-blocking):", err);
      });
    }

    return new Response(JSON.stringify({ success: true, document: doc }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
