import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * get-document-download
 *
 * Returns a downloadable PDF URL for unsigned (draft) or signed documents.
 * Uses DocuSeal's GET /submissions/{id}/documents API, with template fallback.
 *
 * Query params: document_type=nda|fee_agreement
 */
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  try {
    const docusealApiKey = Deno.env.get("DOCUSEAL_API_KEY");
    if (!docusealApiKey) {
      return new Response(
        JSON.stringify({ error: "DocuSeal API not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Auth via shared helper
    const auth = await requireAuth(req);
    if (!auth.authenticated || !auth.userId) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse document type from query string OR request body (POST)
    const url = new URL(req.url);
    let documentType = url.searchParams.get("document_type");

    if (!documentType) {
      try {
        const body = await req.clone().json();
        documentType = body?.document_type || "nda";
      } catch {
        documentType = "nda";
      }
    }
    if (documentType !== "nda" && documentType !== "fee_agreement") {
      return new Response(
        JSON.stringify({ error: 'Invalid document_type. Must be "nda" or "fee_agreement".' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Get user's firm
    const { data: membership } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", auth.userId)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "No firm found for user" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const isNda = documentType === "nda";
    const submissionField = isNda ? "nda_docuseal_submission_id" : "fee_docuseal_submission_id";
    const documentUrlField = isNda ? "nda_document_url" : "fee_agreement_document_url";
    const signedUrlField = isNda ? "nda_signed_document_url" : "fee_signed_document_url";

    const { data: firm } = await supabase
      .from("firm_agreements")
      .select(`${submissionField}, ${documentUrlField}, ${signedUrlField}`)
      .eq("id", membership.firm_id)
      .maybeSingle();

    if (!firm) {
      return new Response(
        JSON.stringify({ error: "No firm agreement found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const firmRecord = firm as Record<string, unknown>;
    const existingUrl = (firmRecord[signedUrlField] as string) || (firmRecord[documentUrlField] as string);
    if (existingUrl) {
      return new Response(
        JSON.stringify({ url: existingUrl }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const submissionId = firmRecord[submissionField] as string | null;
    if (!submissionId) {
      // No submission — try template PDF fallback
      const templateId = isNda
        ? Deno.env.get("DOCUSEAL_NDA_TEMPLATE_ID")
        : Deno.env.get("DOCUSEAL_FEE_TEMPLATE_ID");

      if (!templateId) {
        return new Response(
          JSON.stringify({ error: "No document available for download" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const templateRes = await fetch(`https://api.docuseal.com/templates/${templateId}`, {
        headers: { "X-Auth-Token": docusealApiKey },
      });

      if (templateRes.ok) {
        const templateData = await templateRes.json();
        const docUrl = templateData?.documents?.[0]?.url;
        if (docUrl) {
          return new Response(
            JSON.stringify({ url: docUrl }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      } else {
        await templateRes.text(); // consume body
      }

      return new Response(
        JSON.stringify({ error: "Template document not available" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Fetch submission documents
    console.log(`📄 Fetching documents for submission ${submissionId}`);
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 15000);
    let docsRes: Response;
    try {
      docsRes = await fetch(
        `https://api.docuseal.com/submissions/${submissionId}/documents`,
        {
          headers: { "X-Auth-Token": docusealApiKey },
          signal: fetchController.signal,
        },
      );
    } finally {
      clearTimeout(fetchTimeout);
    }

    if (!docsRes.ok) {
      const errText = await docsRes.text();
      console.error("❌ DocuSeal documents API error:", docsRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch document" }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const docsData = await docsRes.json();
    const documents = docsData?.documents || (Array.isArray(docsData) ? docsData : []);
    const docUrl = documents[0]?.url;

    if (!docUrl) {
      return new Response(
        JSON.stringify({ error: "No document found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Cache URL
    await supabase
      .from("firm_agreements")
      .update({ [documentUrlField]: docUrl, updated_at: new Date().toISOString() })
      .eq("id", membership.firm_id);

    console.log(`✅ Document URL retrieved and cached for firm ${membership.firm_id}`);

    return new Response(
      JSON.stringify({ url: docUrl }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err: unknown) {
    const corsHeaders = getCorsHeaders(req);
    console.error("❌ Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
