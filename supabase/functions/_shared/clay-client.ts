/**
 * Clay Webhook Enrichment Client
 *
 * Sends contact data to Clay's inbound webhooks for async waterfall enrichment.
 * Clay processes data through its enrichment waterfall and sends results back
 * to our inbound webhook endpoints.
 *
 * Two outbound flows:
 *   1. Name + Domain → Clay (sends first_name, last_name, domain)
 *   2. LinkedIn URL → Clay (sends linkedin_url)
 *
 * Results arrive asynchronously via clay-webhook-name-domain / clay-webhook-linkedin edge functions.
 */

const CLAY_TIMEOUT_MS = 10_000;

export interface ClayOutboundResult {
  success: boolean;
  requestId: string;
  error?: string;
}

function getWebhookUrl(type: 'name_domain' | 'linkedin'): string {
  const envKey =
    type === 'name_domain' ? 'CLAY_WEBHOOK_NAME_DOMAIN_URL' : 'CLAY_WEBHOOK_LINKEDIN_URL';
  const url = Deno.env.get(envKey);
  if (!url) throw new Error(`${envKey} not configured`);
  return url;
}

async function clayFetch(url: string, body: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAY_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = Deno.env.get('CLAY_API_KEY');
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send name + domain data to Clay for async email enrichment.
 */
export async function sendToClayNameDomain(params: {
  requestId: string;
  firstName: string;
  lastName: string;
  domain: string;
}): Promise<ClayOutboundResult> {
  try {
    const url = getWebhookUrl('name_domain');
    const res = await clayFetch(url, {
      request_id: params.requestId,
      first_name: params.firstName,
      last_name: params.lastName,
      domain: params.domain,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, requestId: params.requestId, error: `HTTP ${res.status}: ${text}` };
    }
    return { success: true, requestId: params.requestId };
  } catch (err) {
    return {
      success: false,
      requestId: params.requestId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send LinkedIn URL to Clay for async email enrichment.
 */
export async function sendToClayLinkedIn(params: {
  requestId: string;
  linkedinUrl: string;
}): Promise<ClayOutboundResult> {
  try {
    const url = getWebhookUrl('linkedin');
    const res = await clayFetch(url, {
      request_id: params.requestId,
      linkedin_url: params.linkedinUrl,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, requestId: params.requestId, error: `HTTP ${res.status}: ${text}` };
    }
    return { success: true, requestId: params.requestId };
  } catch (err) {
    return {
      success: false,
      requestId: params.requestId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
