/**
 * Clay Email Lookup Tool + Shared Helper
 *
 * Exposes Clay's email enrichment to the chat widget as a synchronous tool,
 * and provides a reusable `clayLookupEmail` helper for use by other enrichment tools.
 *
 * Sends name+domain or LinkedIn URL to Clay, then polls the
 * clay_enrichment_requests table for the async callback result.
 *
 * Two lookup modes:
 *   1. LinkedIn URL → email
 *   2. First name + Last name + Domain → email
 */

import type { SupabaseClient, ClaudeTool, ToolResult } from './common.ts';
import { sendToClayNameDomain, sendToClayLinkedIn } from '../../../_shared/clay-client.ts';

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Shared helper: synchronous Clay email lookup ----------

export interface ClayLookupParams {
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  domain?: string;
  company?: string;
  title?: string;
  /** Source function name for tracking (default: 'ai-command-center') */
  sourceFunction?: string;
  /** Optional CRM contact ID to link the result to */
  sourceEntityId?: string;
}

export interface ClayLookupResult {
  email: string | null;
  source: string;
  requestId: string;
  timedOut?: boolean;
}

/**
 * Synchronous Clay email lookup — sends to Clay webhook and polls for the callback result.
 * Use this from any enrichment tool when Prospeo/other methods fail.
 *
 * Returns { email, source, requestId } — email is null if not found or timed out.
 */
export async function clayLookupEmail(
  supabase: SupabaseClient,
  userId: string,
  params: ClayLookupParams,
): Promise<ClayLookupResult> {
  const linkedinUrl = params.linkedinUrl?.trim() || '';
  const firstName = params.firstName?.trim() || '';
  const lastName = params.lastName?.trim() || '';
  const domain = params.domain?.trim() || '';

  const hasLinkedIn = linkedinUrl.includes('linkedin.com/in/');
  const hasNameDomain = !!firstName && !!lastName && !!domain;

  if (!hasLinkedIn && !hasNameDomain) {
    return { email: null, source: 'clay_insufficient_data', requestId: '' };
  }

  const requestId = crypto.randomUUID();
  const requestType = hasLinkedIn ? 'linkedin' : 'name_domain';

  // 1. Insert tracking row
  const { error: insertErr } = await supabase.from('clay_enrichment_requests').insert({
    request_id: requestId,
    request_type: requestType,
    status: 'pending',
    workspace_id: userId,
    first_name: firstName || null,
    last_name: lastName || null,
    domain: domain || null,
    linkedin_url: linkedinUrl || null,
    company_name: params.company || null,
    title: params.title || null,
    source_function: params.sourceFunction || 'ai-command-center',
    source_entity_id: params.sourceEntityId || null,
  });

  if (insertErr) {
    console.error(`[clayLookupEmail] DB insert failed: ${insertErr.message}`);
    return { email: null, source: `clay_${requestType}`, requestId };
  }

  // 2. Send to Clay
  const sendResult = hasLinkedIn
    ? await sendToClayLinkedIn({ requestId, linkedinUrl })
    : await sendToClayNameDomain({ requestId, firstName, lastName, domain });

  if (!sendResult.success) {
    console.warn(`[clayLookupEmail] Clay webhook failed: ${sendResult.error}`);
    return { email: null, source: `clay_${requestType}`, requestId };
  }

  const lookupDesc = hasLinkedIn ? linkedinUrl : `${firstName} ${lastName} @ ${domain}`;
  console.log(`[clayLookupEmail] Sent to Clay (${requestType}): ${lookupDesc} — polling...`);

  // 3. Poll for result
  const deadline = Date.now() + MAX_POLL_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const { data: row, error: pollErr } = await supabase
      .from('clay_enrichment_requests')
      .select('status, result_email')
      .eq('request_id', requestId)
      .maybeSingle();

    if (pollErr) {
      console.warn(`[clayLookupEmail] Poll error: ${pollErr.message}`);
      continue;
    }

    if (!row || row.status === 'pending') continue;

    if (row.status === 'completed' && row.result_email) {
      console.log(`[clayLookupEmail] Email found: ${row.result_email} for ${lookupDesc}`);
      return { email: row.result_email, source: `clay_${requestType}`, requestId };
    }

    // Status is 'failed' or completed without email
    console.log(`[clayLookupEmail] No email found by Clay for ${lookupDesc}`);
    return { email: null, source: `clay_${requestType}`, requestId };
  }

  // Timed out
  console.log(`[clayLookupEmail] Timed out waiting for Clay result: ${lookupDesc}`);
  return { email: null, source: `clay_${requestType}`, requestId, timedOut: true };
}

/**
 * Fire-and-forget batch Clay lookup — sends multiple contacts to Clay without waiting.
 * Returns the request IDs for tracking. Results arrive asynchronously via webhook callbacks.
 */
export async function clayBatchSend(
  supabase: SupabaseClient,
  userId: string,
  contacts: ClayLookupParams[],
): Promise<string[]> {
  const requestIds: string[] = [];

  for (const params of contacts) {
    const linkedinUrl = params.linkedinUrl?.trim() || '';
    const firstName = params.firstName?.trim() || '';
    const lastName = params.lastName?.trim() || '';
    const domain = params.domain?.trim() || '';

    const hasLinkedIn = linkedinUrl.includes('linkedin.com/in/');
    const hasNameDomain = !!firstName && !!lastName && !!domain;
    if (!hasLinkedIn && !hasNameDomain) continue;

    const requestId = crypto.randomUUID();
    const requestType = hasLinkedIn ? 'linkedin' : 'name_domain';

    const { error: insertErr } = await supabase.from('clay_enrichment_requests').insert({
      request_id: requestId,
      request_type: requestType,
      status: 'pending',
      workspace_id: userId,
      first_name: firstName || null,
      last_name: lastName || null,
      domain: domain || null,
      linkedin_url: linkedinUrl || null,
      company_name: params.company || null,
      title: params.title || null,
      source_function: params.sourceFunction || 'ai-command-center',
      source_entity_id: params.sourceEntityId || null,
    });

    if (insertErr) {
      console.warn(
        `[clayBatchSend] Insert failed for ${firstName} ${lastName}: ${insertErr.message}`,
      );
      continue;
    }

    // Fire Clay webhook (non-blocking)
    const sendFn = hasLinkedIn
      ? sendToClayLinkedIn({ requestId, linkedinUrl })
      : sendToClayNameDomain({ requestId, firstName, lastName, domain });

    sendFn
      .then((res) => {
        if (!res.success) console.warn(`[clayBatchSend] Webhook failed: ${res.error}`);
      })
      .catch((err) => console.error(`[clayBatchSend] Webhook error: ${err}`));

    requestIds.push(requestId);
  }

  return requestIds;
}

/**
 * Poll for batch Clay results — checks multiple request IDs and returns completed emails.
 * Returns a map of requestId → email (only for successful results).
 */
export async function clayBatchPoll(
  supabase: SupabaseClient,
  requestIds: string[],
  maxWaitMs = MAX_POLL_MS,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (requestIds.length === 0) return results;

  const pending = new Set(requestIds);
  const deadline = Date.now() + maxWaitMs;

  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const { data: rows } = await supabase
      .from('clay_enrichment_requests')
      .select('request_id, status, result_email')
      .in('request_id', [...pending])
      .neq('status', 'pending');

    if (rows?.length) {
      for (const row of rows) {
        pending.delete(row.request_id);
        if (row.status === 'completed' && row.result_email) {
          results.set(row.request_id, row.result_email);
        }
      }
    }
  }

  return results;
}

// ---------- Tool definition ----------

export const clayToolDefinitions: ClaudeTool[] = [
  {
    name: 'clay_find_email',
    description:
      'Find a person\'s email address using Clay enrichment tables. Provide EITHER a LinkedIn URL, OR first_name + last_name + domain. Sends lookup to Clay and waits for the result (up to ~60s). Returns the email if found, or "no email found".',
    input_schema: {
      type: 'object',
      properties: {
        linkedin_url: {
          type: 'string',
          description:
            'LinkedIn profile URL (e.g. https://www.linkedin.com/in/john-smith). Use this OR name+domain.',
        },
        first_name: {
          type: 'string',
          description: 'First name of the person (used with last_name + domain).',
        },
        last_name: {
          type: 'string',
          description: 'Last name of the person (used with first_name + domain).',
        },
        domain: {
          type: 'string',
          description: 'Company email domain, e.g. "acme.com" (used with first_name + last_name).',
        },
      },
    },
  },
];

// ---------- Tool executor (uses shared helper) ----------

export async function clayFindEmail(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const linkedinUrl = (args.linkedin_url as string)?.trim() || '';
  const firstName = (args.first_name as string)?.trim() || '';
  const lastName = (args.last_name as string)?.trim() || '';
  const domain = (args.domain as string)?.trim() || '';

  const hasLinkedIn = linkedinUrl.includes('linkedin.com/in/');
  const hasNameDomain = !!firstName && !!lastName && !!domain;

  if (!hasLinkedIn && !hasNameDomain) {
    return {
      error:
        'Provide either a LinkedIn URL, or first_name + last_name + domain. Not enough data to look up an email.',
    };
  }

  const lookupDesc = hasLinkedIn ? linkedinUrl : `${firstName} ${lastName} @ ${domain}`;

  const result = await clayLookupEmail(supabase, userId, {
    linkedinUrl: linkedinUrl || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    domain: domain || undefined,
  });

  if (result.email) {
    return {
      data: {
        email: result.email,
        lookup: lookupDesc,
        source: result.source,
      },
    };
  }

  return {
    data: {
      email: null,
      message: result.timedOut
        ? 'No email found (Clay lookup timed out — result may arrive later)'
        : 'No email found',
      lookup: lookupDesc,
      source: result.source,
    },
  };
}
