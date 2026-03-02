/**
 * Clay Fallback Orchestrator
 *
 * Fire-and-forget: sends contact data to Clay for async enrichment
 * when Prospeo returns no results. Creates a tracking row in
 * clay_enrichment_requests and dispatches to the appropriate Clay webhook.
 *
 * Returns the request_id for tracking (or null if Clay is not configured / data insufficient).
 */

import { sendToClayNameDomain, sendToClayLinkedIn } from './clay-client.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ClayFallbackContact {
  firstName: string;
  lastName: string;
  linkedinUrl?: string;
  domain?: string;
  company?: string;
  title?: string;
}

export interface ClayFallbackContext {
  workspaceId: string;
  sourceFunction: string;
  sourceEntityId?: string;
}

/**
 * Send contact to Clay for async enrichment. Non-blocking — fires and forgets.
 * Returns the request_id or null if Clay can't process this contact.
 */
export async function fireClayFallback(
  supabase: SupabaseClient,
  contact: ClayFallbackContact,
  context: ClayFallbackContext,
): Promise<string | null> {
  // Determine which Clay flow to use
  const hasLinkedIn = !!contact.linkedinUrl?.includes('linkedin.com/in/');
  const hasNameDomain = !!contact.firstName && !!contact.lastName && !!contact.domain;

  if (!hasLinkedIn && !hasNameDomain) {
    return null; // Not enough data for Clay
  }

  // Check if Clay webhooks are configured
  const envKey = hasLinkedIn ? 'CLAY_WEBHOOK_LINKEDIN_URL' : 'CLAY_WEBHOOK_NAME_DOMAIN_URL';
  if (!Deno.env.get(envKey)) {
    return null; // Clay not configured
  }

  const requestId = crypto.randomUUID();
  const requestType = hasLinkedIn ? 'linkedin' : 'name_domain';

  try {
    // Insert tracking row
    const { error: insertErr } = await supabase.from('clay_enrichment_requests').insert({
      request_id: requestId,
      request_type: requestType,
      status: 'pending',
      workspace_id: context.workspaceId,
      first_name: contact.firstName || null,
      last_name: contact.lastName || null,
      domain: contact.domain || null,
      linkedin_url: contact.linkedinUrl || null,
      company_name: contact.company || null,
      title: contact.title || null,
      source_function: context.sourceFunction,
      source_entity_id: context.sourceEntityId || null,
    });

    if (insertErr) {
      console.error(`[clay-fallback] DB insert failed: ${insertErr.message}`);
      return null;
    }

    // Fire Clay webhook (non-blocking — don't await result for caller)
    if (hasLinkedIn) {
      sendToClayLinkedIn({
        requestId,
        linkedinUrl: contact.linkedinUrl!,
      })
        .then((res) => {
          if (!res.success) {
            console.warn(`[clay-fallback] LinkedIn webhook failed: ${res.error}`);
          } else {
            console.log(`[clay-fallback] LinkedIn webhook sent: ${requestId}`);
          }
        })
        .catch((err) => {
          console.error(`[clay-fallback] LinkedIn webhook error: ${err}`);
        });
    } else {
      sendToClayNameDomain({
        requestId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        domain: contact.domain!,
      })
        .then((res) => {
          if (!res.success) {
            console.warn(`[clay-fallback] Name+domain webhook failed: ${res.error}`);
          } else {
            console.log(`[clay-fallback] Name+domain webhook sent: ${requestId}`);
          }
        })
        .catch((err) => {
          console.error(`[clay-fallback] Name+domain webhook error: ${err}`);
        });
    }

    return requestId;
  } catch (err) {
    console.error(`[clay-fallback] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
