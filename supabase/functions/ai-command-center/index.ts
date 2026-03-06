/**
 * AI Command Center - Main Edge Function
 *
 * Endpoints:
 * POST /ai-command-center  — Main chat endpoint (SSE streaming)
 *   Body: { query, conversation_id?, history?, page_context?, confirmed_action? }
 *
 * Handles:
 * 1. Auth verification
 * 2. Intent routing (Haiku or context bypass)
 * 3. Orchestration (tool-calling loop with streaming)
 * 4. Usage tracking
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { routeIntent } from './router.ts';
import { orchestrate, executeConfirmedAction } from './orchestrator.ts';
import type { ClaudeMessage } from '../_shared/claude-client.ts';

// ---------- Request/Response types ----------

interface ChatRequest {
  query: string;
  conversation_id?: string;
  history?: ClaudeMessage[];
  page_context?: {
    page?: string;
    entity_id?: string;
    entity_type?: string;
    tab?: string;
  };
  confirmed_action?: {
    tool_id: string;
    tool_name: string;
    args: Record<string, unknown>;
  };
}

// ---------- Handler ----------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  // Compute CORS headers early so every response path includes them.
  // Without this, an unhandled error would cause Supabase to return a 500
  // without CORS headers, which the browser surfaces as "Failed to fetch".
  const corsHeaders = getCorsHeaders(req);

  try {
    // Auth check — admin only
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const auth = await requireAdmin(req, supabaseAdmin);
    if (!auth.authenticated || !auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
        status: auth.authenticated ? 403 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = auth.userId!;

    // Rate limiting: max 120 queries per hour per user
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('ai_command_center_usage')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo);

      if (count !== null && count >= 120) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded. Maximum 120 queries per hour. Please wait and try again.',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } catch (rateLimitErr) {
      // Non-critical: if rate limit check fails, allow the request
      console.warn('[ai-cc] Rate limit check failed:', rateLimitErr);
    }

    // Parse request body
    let body: ChatRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!body.query?.trim()) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Set up SSE streaming response
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writable = stream.writable.getWriter();

    const writer = {
      write: async (chunk: string) => {
        await writable.write(encoder.encode(chunk));
      },
      close: async () => {
        await writable.close();
      },
    };

    // Start processing in the background
    const processPromise = processChat(supabaseAdmin, userId, body, writer);

    // Return the streaming response immediately
    const response = new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });

    // Ensure processing completes and stream closes
    processPromise
      .catch((err) => {
        console.error('[ai-cc] Processing error:', err);
        writer
          .write(
            `event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : 'Internal error' })}\n\n`,
          )
          .catch(() => {});
      })
      .finally(() => {
        writer.close().catch(() => {});
      });

    return response;
  } catch (err) {
    // Top-level catch: ensures CORS headers are always returned so the
    // browser doesn't mask the real error behind "Failed to fetch".
    console.error('[ai-cc] Unhandled error in request handler:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ---------- Main processing ----------

async function processChat(
  supabase: SupabaseClient,
  userId: string,
  body: ChatRequest,
  writer: { write: (chunk: string) => Promise<void>; close: () => Promise<void> },
): Promise<void> {
  const startTime = Date.now();
  const { query, history = [], page_context, confirmed_action } = body;

  // 1. Handle confirmed action (skip routing)
  if (confirmed_action) {
    await writer.write(
      `event: status\ndata: ${JSON.stringify({ phase: 'executing_confirmed_action' })}\n\n`,
    );

    const result = await executeConfirmedAction(
      {
        supabase,
        userId,
        query,
        conversationHistory: history,
        category: 'ACTION',
        tier: 'STANDARD',
        toolNames: [confirmed_action.tool_name],
        pageContext: page_context,
        confirmedToolId: confirmed_action.tool_id,
        confirmedToolName: confirmed_action.tool_name,
        confirmedArgs: confirmed_action.args,
      },
      writer,
    );

    await trackUsage(supabase, userId, body.conversation_id, {
      query,
      category: 'ACTION',
      model: result.model,
      inputTokens: result.totalInputTokens,
      outputTokens: result.totalOutputTokens,
      cost: result.totalCost,
      toolCalls: result.toolCallCount,
      durationMs: Date.now() - startTime,
    });

    return;
  }

  // 2. Route intent
  await writer.write(`event: status\ndata: ${JSON.stringify({ phase: 'routing' })}\n\n`);
  const routerResult = await routeIntent(query, page_context);

  await writer.write(
    `event: routed\ndata: ${JSON.stringify({
      category: routerResult.category,
      tier: routerResult.tier,
      tools: routerResult.tools,
      confidence: routerResult.confidence,
      bypassed: routerResult.bypassed,
    })}\n\n`,
  );

  console.log(
    `[ai-cc] Routed: ${routerResult.category} (${routerResult.tier}) tools=[${routerResult.tools.join(',')}] confidence=${routerResult.confidence} bypassed=${routerResult.bypassed}`,
  );

  // 3. Orchestrate (tool-calling loop)
  await writer.write(`event: status\ndata: ${JSON.stringify({ phase: 'processing' })}\n\n`);

  const result = await orchestrate(
    {
      supabase,
      userId,
      query,
      conversationHistory: history,
      category: routerResult.category,
      tier: routerResult.tier,
      toolNames: routerResult.tools,
      pageContext: page_context,
    },
    writer,
  );

  // 4. Track usage
  const durationMs = Date.now() - startTime;
  console.log(
    `[ai-cc] Complete: ${durationMs}ms, ${result.toolCallCount} tools, $${result.totalCost.toFixed(4)}`,
  );

  await trackUsage(supabase, userId, body.conversation_id, {
    query,
    category: routerResult.category,
    model: result.model,
    inputTokens: result.totalInputTokens,
    outputTokens: result.totalOutputTokens,
    cost: result.totalCost,
    toolCalls: result.toolCallCount,
    durationMs,
    routerBypassed: routerResult.bypassed,
  });
}

// ---------- Usage tracking ----------

interface UsageData {
  query: string;
  category: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  toolCalls: number;
  durationMs: number;
  routerBypassed?: boolean;
}

async function trackUsage(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string | undefined,
  usage: UsageData,
): Promise<void> {
  try {
    await supabase.from('ai_command_center_usage').insert({
      user_id: userId,
      conversation_id: conversationId || null,
      query: usage.query.substring(0, 500),
      category: usage.category,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      estimated_cost: usage.cost,
      tool_calls: usage.toolCalls,
      duration_ms: usage.durationMs,
      router_bypassed: usage.routerBypassed || false,
    });
  } catch (err) {
    // Non-critical — don't fail the request
    console.error('[ai-cc] Usage tracking failed:', err);
  }
}
