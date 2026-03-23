/**
 * Shared HeyReach API client for edge functions.
 *
 * Centralizes authentication (API key via X-API-KEY header), base URL, and
 * common request patterns so individual edge functions stay thin.
 *
 * Requires HEYREACH_API_KEY environment variable.
 *
 * API Reference: https://api.heyreach.io/api/public/
 */

const HEYREACH_BASE_URL = 'https://api.heyreach.io/api/public';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

export interface HeyReachRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  queryParams?: Record<string, string | number>;
  timeoutMs?: number;
}

export interface HeyReachResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

function getApiKey(): string {
  const key = Deno.env.get('HEYREACH_API_KEY');
  if (!key) throw new Error('HEYREACH_API_KEY is not set');
  return key;
}

/**
 * Make an authenticated request to the HeyReach API.
 *
 * Retries transient errors (5xx / network) with exponential backoff.
 * Does NOT retry client errors (4xx).
 */
export async function heyreachRequest<T = unknown>(
  options: HeyReachRequestOptions,
): Promise<HeyReachResponse<T>> {
  const apiKey = getApiKey();
  const { method = 'GET', path, body, queryParams, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  // Build URL with any extra query params
  const url = new URL(`${HEYREACH_BASE_URL}${path}`);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-API-KEY': apiKey,
  };

  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      };

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url.toString(), fetchOptions);

      // Try to parse JSON regardless of status
      let data: T | null = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = (await response.json()) as T;
      } else {
        const text = await response.text();
        data = text as unknown as T;
      }

      if (response.ok) {
        if (attempt > 0) {
          console.log(`[heyreach] Succeeded on retry ${attempt}/${MAX_RETRIES}`);
        }
        return { ok: true, status: response.status, data };
      }

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        const errorMsg = typeof data === 'string' && data.trim()
          ? data
          : (data ? JSON.stringify(data) : `HeyReach API returned ${response.status} for ${method} ${path}`);
        console.error(`[heyreach] Client error ${response.status} for ${method} ${path}:`, errorMsg);
        return {
          ok: false,
          status: response.status,
          data: null,
          error: errorMsg,
        };
      }

      // Server error (5xx) — retry
      lastError = `HTTP ${response.status}: ${JSON.stringify(data)}`;
      console.warn(
        `[heyreach] Server error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        lastError,
      );
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[heyreach] Fetch error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        lastError,
      );
    }

    // Exponential backoff before retry
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error(`[heyreach] All ${MAX_RETRIES + 1} attempts failed for ${method} ${path}`);
  return {
    ok: false,
    status: 0,
    data: null,
    error: `All retries exhausted: ${lastError}`,
  };
}

// ─── Convenience wrappers ───────────────────────────────────────────────────

/** Check API key validity */
export function checkApiKey() {
  return heyreachRequest({ path: '/auth/CheckApiKey' });
}

/** List all campaigns (paginated) */
export function listCampaigns(offset = 0, limit = 50) {
  return heyreachRequest<unknown>({
    method: 'POST',
    path: '/campaign/GetAll',
    body: { offset, limit },
  });
}

/** Get campaign details by ID */
export function getCampaign(campaignId: number) {
  return heyreachRequest({
    method: 'GET',
    path: '/campaign/GetById',
    queryParams: { campaignId },
  });
}

/** Pause a campaign */
export function pauseCampaign(campaignId: number) {
  return heyreachRequest({
    method: 'POST',
    path: '/campaign/Pause',
    queryParams: { campaignId },
  });
}

/** Resume a campaign */
export function resumeCampaign(campaignId: number) {
  return heyreachRequest({
    method: 'POST',
    path: '/campaign/Resume',
    queryParams: { campaignId },
  });
}

/** Add leads to a campaign (V2 — returns counts) */
export function addLeadsToCampaign(
  campaignId: number,
  accountLeadPairs: Array<{
    linkedInAccountId?: number;
    lead: {
      profileUrl: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      emailAddress?: string;
    };
    customUserFields?: Array<{ fieldName: string; fieldValue: string }>;
  }>,
) {
  return heyreachRequest({
    method: 'POST',
    path: '/campaign/AddLeadsToCampaignV2',
    body: {
      campaignId,
      accountLeadPairs,
      resumeFinishedCampaign: false,
      resumePausedCampaign: true,
    },
  });
}

/** Get lead details by LinkedIn profile URL */
export function getLeadDetails(profileUrl: string) {
  return heyreachRequest({
    method: 'POST',
    path: '/lead/GetLead',
    body: { profileUrl },
  });
}

/** Get all lists (paginated) */
export function getAllLists(offset = 0, limit = 50) {
  return heyreachRequest<unknown>({
    method: 'POST',
    path: '/list/GetAll',
    body: { offset, limit },
  });
}

/** Create an empty list */
export function createEmptyList(name: string, listType = 'USER_LIST') {
  return heyreachRequest({
    method: 'POST',
    path: '/list/CreateEmptyList',
    body: { name, type: listType },
  });
}

/** Add leads to a list (V2 — returns counts) */
export function addLeadsToList(
  listId: number,
  leads: Array<{
    profileUrl: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    emailAddress?: string;
  }>,
) {
  return heyreachRequest({
    method: 'POST',
    path: '/list/AddLeadsToListV2',
    body: { listId, leads },
  });
}

/** Get leads from a list (paginated) */
export function getLeadsFromList(listId: number, offset = 0, limit = 100) {
  return heyreachRequest({
    method: 'POST',
    path: '/list/GetLeadsFromList',
    body: { listId, offset, limit },
  });
}

/** Get conversations (paginated, with filters) */
export function getConversations(filters: Record<string, unknown> = {}) {
  return heyreachRequest({
    method: 'POST',
    path: '/inbox/GetConversationsV2',
    body: filters,
  });
}

/** Get overall stats */
export function getOverallStats(campaignIds: number[] = [], accountIds: number[] = []) {
  return heyreachRequest({
    method: 'POST',
    path: '/stats/GetOverallStats',
    body: { campaignIds, accountIds },
  });
}

/** Get all LinkedIn accounts (paginated) */
export function getLinkedInAccounts(offset = 0, limit = 100) {
  return heyreachRequest({
    method: 'POST',
    path: '/li_account/GetAll',
    body: { offset, limit },
  });
}

/** Get network for a sender (paginated) */
export function getMyNetworkForSender(senderId: number, offset = 0, limit = 100) {
  return heyreachRequest({
    method: 'POST',
    path: '/network/GetMyNetworkForSender',
    body: { senderId, offset, limit },
  });
}

/** Create a webhook */
export function createWebhook(webhook: Record<string, unknown>) {
  return heyreachRequest({
    method: 'POST',
    path: '/webhook/Create',
    body: webhook,
  });
}

/** Delete a webhook */
export function deleteWebhook(webhookId: string) {
  return heyreachRequest({
    method: 'DELETE',
    path: '/webhook/Delete',
    body: { webhookId },
  });
}
