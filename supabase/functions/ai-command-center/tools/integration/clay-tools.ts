/**
 * Clay Email Lookup Tool
 *
 * Exposes Clay's email enrichment to the chat widget as a synchronous tool.
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

// ---------- Executor ----------

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
    source_function: 'ai-command-center',
  });

  if (insertErr) {
    return { error: `Failed to create Clay request: ${insertErr.message}` };
  }

  // 2. Send to Clay
  const sendResult = hasLinkedIn
    ? await sendToClayLinkedIn({ requestId, linkedinUrl })
    : await sendToClayNameDomain({ requestId, firstName, lastName, domain });

  if (!sendResult.success) {
    return { error: `Clay webhook failed: ${sendResult.error}` };
  }

  const lookupDesc = hasLinkedIn ? linkedinUrl : `${firstName} ${lastName} @ ${domain}`;
  console.log(`[clay_find_email] Sent to Clay (${requestType}): ${lookupDesc} — polling...`);

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
      console.warn(`[clay_find_email] Poll error: ${pollErr.message}`);
      continue;
    }

    if (!row || row.status === 'pending') continue;

    if (row.status === 'completed' && row.result_email) {
      return {
        data: {
          email: row.result_email,
          lookup: lookupDesc,
          source: `clay_${requestType}`,
        },
      };
    }

    // Status is 'failed' or completed without email
    return {
      data: {
        email: null,
        message: 'No email found',
        lookup: lookupDesc,
        source: `clay_${requestType}`,
      },
    };
  }

  // Timed out — Clay hasn't called back yet
  return {
    data: {
      email: null,
      message: 'No email found (Clay lookup timed out — result may arrive later)',
      lookup: lookupDesc,
      source: `clay_${requestType}`,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
