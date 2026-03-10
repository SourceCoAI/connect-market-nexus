import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/**
 * pandadoc-integration-test
 *
 * Server-side health check for the PandaDoc signing pipeline.
 * Runs 6 tests covering: env vars, API auth, template resolution,
 * document creation, session token, and webhook simulation (HMAC-SHA256).
 *
 * Admin-only. All secrets stay server-side — no API key exposure to the browser.
 */

const PANDADOC_API_BASE = "https://api.pandadoc.com/public/v1";

interface TestResult {
  id: string;
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail: string;
  durationMs: number;
}

async function runTest(
  id: string,
  name: string,
  fn: () => Promise<{ status: "pass" | "fail" | "warn" | "skip"; detail: string }>
): Promise<TestResult> {
  const start = performance.now();
  try {
    const result = await fn();
    return { id, name, ...result, durationMs: Math.round(performance.now() - start) };
  } catch (e: unknown) {
    return {
      id,
      name,
      status: "fail",
      detail: (e as Error).message || String(e),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

async function computeHmac(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Admin-only
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const pandadocApiKey = Deno.env.get("PANDADOC_API_KEY") || "";
    const webhookKey = Deno.env.get("PANDADOC_WEBHOOK_KEY") || "";
    const ndaTemplateUuid = Deno.env.get("PANDADOC_NDA_TEMPLATE_UUID") || "";
    const feeTemplateUuid = Deno.env.get("PANDADOC_FEE_TEMPLATE_UUID") || "";

    const results: TestResult[] = [];
    let documentId: string | null = null;
    let testFirmId: string | null = null;

    // ═══════════════════════════════════════
    // Test 1: Environment Configuration
    // ═══════════════════════════════════════
    results.push(
      await runTest("env_config", "Environment Variables", async () => {
        const missing: string[] = [];
        if (!pandadocApiKey) missing.push("PANDADOC_API_KEY");
        if (!webhookKey) missing.push("PANDADOC_WEBHOOK_KEY");
        if (!ndaTemplateUuid) missing.push("PANDADOC_NDA_TEMPLATE_UUID");
        if (!feeTemplateUuid) missing.push("PANDADOC_FEE_TEMPLATE_UUID");

        if (missing.length > 0) {
          return { status: "fail", detail: `Missing: ${missing.join(", ")}` };
        }
        return { status: "pass", detail: "All 4 environment variables configured" };
      })
    );

    if (!pandadocApiKey) {
      return new Response(JSON.stringify({ results, summary: "Cannot run tests — PANDADOC_API_KEY not set" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ═══════════════════════════════════════
    // Test 2: API Authentication
    // ═══════════════════════════════════════
    results.push(
      await runTest("api_auth", "PandaDoc API Authentication", async () => {
        const resp = await fetch(`${PANDADOC_API_BASE}/templates?count=1`, {
          headers: { "Authorization": `API-Key ${pandadocApiKey}` },
        });
        if (resp.ok) {
          return { status: "pass", detail: `Authenticated successfully (HTTP ${resp.status})` };
        }
        const body = await resp.text().catch(() => "");
        return { status: "fail", detail: `HTTP ${resp.status}: ${body.substring(0, 200)}` };
      })
    );

    if (results[results.length - 1].status === "fail") {
      return new Response(JSON.stringify({ results, summary: "API authentication failed — check PANDADOC_API_KEY" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ═══════════════════════════════════════
    // Test 3: Template Resolution
    // ═══════════════════════════════════════
    results.push(
      await runTest("templates", "NDA & Fee Agreement Templates", async () => {
        const details: string[] = [];
        let allGood = true;

        for (const [label, uuid] of [["NDA", ndaTemplateUuid], ["Fee Agreement", feeTemplateUuid]]) {
          if (!uuid) {
            details.push(`${label}: not configured`);
            allGood = false;
            continue;
          }
          const resp = await fetch(`${PANDADOC_API_BASE}/templates/${uuid}/details`, {
            headers: { "Authorization": `API-Key ${pandadocApiKey}` },
          });
          if (resp.ok) {
            const tmpl = await resp.json();
            details.push(`${label}: "${tmpl.name}" (UUID ${uuid}) — ${tmpl.roles?.length || 0} role(s)`);
          } else {
            details.push(`${label}: template UUID ${uuid} returned HTTP ${resp.status}`);
            allGood = false;
          }
        }

        return {
          status: allGood ? "pass" : "warn",
          detail: details.join(". "),
        };
      })
    );

    // ═══════════════════════════════════════
    // Test 4: Create Test Document
    // ═══════════════════════════════════════
    const targetTemplateUuid = ndaTemplateUuid || feeTemplateUuid;
    results.push(
      await runTest("create_document", "Create Test Document", async () => {
        if (!targetTemplateUuid) {
          return { status: "skip", detail: "No template UUID configured" };
        }

        const resp = await fetch(`${PANDADOC_API_BASE}/documents`, {
          method: "POST",
          headers: {
            "Authorization": `API-Key ${pandadocApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Integration Test Document — Auto Delete",
            template_uuid: targetTemplateUuid,
            recipients: [
              {
                email: "integration-test@sourceco-internal.test",
                first_name: "Integration",
                last_name: "Test",
                role: "Signer",
              },
            ],
            tags: ["integration-test", "auto-delete"],
            metadata: {
              test: "true",
              source: "pandadoc-integration-test",
            },
          }),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          return { status: "fail", detail: `HTTP ${resp.status}: ${body.substring(0, 300)}` };
        }

        const data = await resp.json();
        documentId = data.id;

        return {
          status: "pass",
          detail: `Document ${documentId} created. Status: ${data.status}. Template: ${targetTemplateUuid}.`,
        };
      })
    );

    // ═══════════════════════════════════════
    // Test 5: Create Embedded Session Token
    // ═══════════════════════════════════════
    results.push(
      await runTest("session_token", "Create Embedded Session", async () => {
        if (!documentId) {
          return { status: "skip", detail: "No document to create session for" };
        }

        // Need to send the document first before creating a session
        await new Promise((r) => setTimeout(r, 2000));

        const sendResp = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/send`, {
          method: "POST",
          headers: {
            "Authorization": `API-Key ${pandadocApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: "Integration test", silent: true }),
        });

        if (!sendResp.ok) {
          const body = await sendResp.text().catch(() => "");
          return { status: "warn", detail: `Document send failed (HTTP ${sendResp.status}): ${body.substring(0, 200)}. Session test skipped.` };
        }

        const resp = await fetch(`${PANDADOC_API_BASE}/documents/${documentId}/session`, {
          method: "POST",
          headers: {
            "Authorization": `API-Key ${pandadocApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipient: "integration-test@sourceco-internal.test",
            lifetime: 300,
          }),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          return { status: "fail", detail: `Session creation failed (HTTP ${resp.status}): ${body.substring(0, 200)}` };
        }

        const sessionData = await resp.json();
        const hasToken = !!sessionData.id;
        return {
          status: "pass",
          detail: `Session token: ${hasToken ? "present" : "missing"}. Embed URL would be: https://app.pandadoc.com/s/${sessionData.id}?embedded=1`,
        };
      })
    );

    // ═══════════════════════════════════════
    // Test 6: Webhook Handler (HMAC Simulation)
    // ═══════════════════════════════════════
    results.push(
      await runTest("webhook_handler", "Webhook Handler (HMAC Simulation)", async () => {
        if (!webhookKey) {
          return { status: "warn", detail: "PANDADOC_WEBHOOK_KEY not set — cannot simulate webhook" };
        }
        if (!documentId) {
          return { status: "skip", detail: "No document to simulate webhook for" };
        }

        // Create a temporary test firm record
        const { data: testFirm, error: firmError } = await supabase
          .from("firm_agreements")
          .insert({
            primary_company_name: "__INTEGRATION_TEST__",
            normalized_company_name: "__integration_test__",
            email_domain: "sourceco-internal.test",
            nda_pandadoc_document_id: documentId,
            nda_pandadoc_status: "sent",
          })
          .select("id")
          .single();

        if (firmError || !testFirm) {
          return { status: "fail", detail: `Failed to create test firm: ${firmError?.message || "unknown"}` };
        }
        testFirmId = testFirm.id;

        // Construct PandaDoc webhook payload
        const webhookPayload = JSON.stringify([{
          event: "document_state_change",
          data: {
            id: documentId,
            status: "document.viewed",
            name: "Integration Test Document",
            recipients: [
              { email: "integration-test@sourceco-internal.test" },
            ],
            metadata: {
              firm_id: testFirmId,
              document_type: "nda",
            },
          },
        }]);

        // Compute HMAC-SHA256 signature
        const hmacSignature = await computeHmac(webhookPayload, webhookKey);

        // POST to our webhook handler
        const webhookUrl = `${supabaseUrl}/functions/v1/pandadoc-webhook-handler`;
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PandaDoc-Signature": hmacSignature,
          },
          body: webhookPayload,
        });

        const respBody = await resp.json().catch(() => null);

        if (!resp.ok) {
          return {
            status: "fail",
            detail: `Webhook handler returned HTTP ${resp.status}: ${JSON.stringify(respBody)}`,
          };
        }

        return {
          status: "pass",
          detail: `Webhook handler accepted document.viewed event (HTTP ${resp.status}). HMAC verified. Response: ${JSON.stringify(respBody)}`,
        };
      })
    );

    // ═══════════════════════════════════════
    // Cleanup
    // ═══════════════════════════════════════
    const cleanupNotes: string[] = [];

    // Delete test document on PandaDoc
    if (documentId) {
      try {
        await fetch(`${PANDADOC_API_BASE}/documents/${documentId}`, {
          method: "DELETE",
          headers: { "Authorization": `API-Key ${pandadocApiKey}` },
        });
        cleanupNotes.push(`Deleted document ${documentId}`);
      } catch (e: unknown) {
        cleanupNotes.push(`Failed to delete document: ${(e as Error).message}`);
      }
    }

    // Remove test webhook log entries
    if (documentId) {
      await supabase
        .from("pandadoc_webhook_log")
        .delete()
        .eq("document_id", documentId);
      cleanupNotes.push("Cleaned webhook log entries");
    }

    // Remove test firm
    if (testFirmId) {
      await supabase
        .from("firm_agreements")
        .delete()
        .eq("id", testFirmId);
      cleanupNotes.push("Removed test firm record");
    }

    // Summary
    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    const warned = results.filter((r) => r.status === "warn").length;
    const totalMs = results.reduce((a, r) => a + r.durationMs, 0);

    return new Response(
      JSON.stringify({
        results,
        cleanup: cleanupNotes,
        summary: `${passed} passed, ${failed} failed, ${warned} warnings — ${totalMs}ms total`,
        ranAt: new Date().toISOString(),
        ranBy: auth.userId,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Integration test error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
