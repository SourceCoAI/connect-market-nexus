/**
 * Integration Outreach Tools
 * Push contacts to PhoneBurner dialer for calling.
 */

import type { SupabaseClient, ClaudeTool, ToolResult } from './common.ts';

// ---------- Tool definitions ----------

export const outreachToolDefinitions: ClaudeTool[] = [
  {
    name: 'push_to_phoneburner',
    description:
      'Push contacts to PhoneBurner dialer for calling. Accepts buyer IDs or contact IDs — resolves to phone-number contacts, filters recently contacted, and pushes to the user\'s PhoneBurner account. Requires the user to have PhoneBurner connected. Use when the user says "push these to PhoneBurner" or "add to dialer".',
    input_schema: {
      type: 'object',
      properties: {
        entity_type: {
          type: 'string',
          enum: ['contacts', 'buyers'],
          description:
            'Type of entity: "contacts" for unified contact IDs, "buyers" for remarketing_buyer IDs',
        },
        entity_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of UUIDs to push',
        },
        session_name: {
          type: 'string',
          description: 'Optional name for the dialing session',
        },
        skip_recent_days: {
          type: 'number',
          description: 'Skip contacts called within this many days (default 7)',
        },
      },
      required: ['entity_type', 'entity_ids'],
    },
  },
];

// ---------- PhoneBurner helpers ----------

const PB_API_BASE = 'https://www.phoneburner.com/rest/1';

async function getPhoneBurnerToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: tokenRow } = await supabase
    .from('phoneburner_oauth_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();

  return tokenRow?.access_token || null;
}

// ---------- Executor ----------

export async function pushToPhoneBurner(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const entityType = args.entity_type as string;
  const entityIds = args.entity_ids as string[];
  const skipRecentDays = (args.skip_recent_days as number) || 7;

  if (!entityIds?.length) return { error: 'entity_ids is required and must not be empty' };

  // Get PhoneBurner token
  const pbToken = await getPhoneBurnerToken(supabase, userId);
  if (!pbToken) {
    return {
      error:
        'PhoneBurner not connected. Please connect your PhoneBurner account in Settings first.',
    };
  }

  // Resolve contacts based on entity type
  interface PBContact {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
  }

  let contacts: PBContact[] = [];

  if (entityType === 'contacts') {
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, title, remarketing_buyer_id')
      .in('id', entityIds)
      .eq('archived', false);

    if (data) {
      // Get buyer company names
      const buyerIds = [
        ...new Set(
          data
            .filter((c: { remarketing_buyer_id?: string }) => c.remarketing_buyer_id)
            .map((c: { remarketing_buyer_id: string }) => c.remarketing_buyer_id),
        ),
      ];
      const buyerMap = new Map<string, string>();
      if (buyerIds.length > 0) {
        const { data: buyers } = await supabase
          .from('buyers')
          .select('id, company_name')
          .in('id', buyerIds);
        for (const b of buyers || []) buyerMap.set(b.id, b.company_name);
      }

      contacts = data.map(
        (c: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          title: string;
          remarketing_buyer_id?: string;
        }) => ({
          id: c.id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          phone: c.phone,
          email: c.email,
          title: c.title,
          company: c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) || null : null,
        }),
      );
    }
  } else if (entityType === 'buyers') {
    // Resolve contacts from buyers
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, title, remarketing_buyer_id')
      .in('remarketing_buyer_id', entityIds)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const { data: buyers } = await supabase
      .from('buyers')
      .select('id, company_name')
      .in('id', entityIds);
    const buyerMap = new Map<string, string>();
    for (const b of buyers || []) buyerMap.set(b.id, b.company_name);

    contacts = (data || []).map(
      (c: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        phone: string;
        title: string;
        remarketing_buyer_id: string;
      }) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        phone: c.phone,
        email: c.email,
        title: c.title,
        company: buyerMap.get(c.remarketing_buyer_id) || null,
      }),
    );
  } else {
    return { error: `Invalid entity_type: ${entityType}. Use "contacts" or "buyers".` };
  }

  if (contacts.length === 0) {
    return { error: 'No contacts found for the given entity IDs' };
  }

  // Filter: must have phone, skip recently contacted
  const skipCutoff = new Date(Date.now() - skipRecentDays * 86400000).toISOString();
  const eligible: PBContact[] = [];
  const excluded: { name: string; reason: string }[] = [];

  // Check recent activity
  const contactIds = contacts.map((c) => c.id);
  const { data: recentActivity } = await supabase
    .from('contact_activities')
    .select('contact_id')
    .in('contact_id', contactIds)
    .gte('created_at', skipCutoff);
  const recentlyContacted = new Set(
    (recentActivity || []).map((a: { contact_id: string }) => a.contact_id),
  );

  for (const contact of contacts) {
    if (!contact.phone) {
      excluded.push({ name: contact.name, reason: 'No phone number' });
      continue;
    }
    if (recentlyContacted.has(contact.id)) {
      excluded.push({ name: contact.name, reason: `Contacted within ${skipRecentDays} days` });
      continue;
    }
    eligible.push(contact);
  }

  if (eligible.length === 0) {
    return {
      data: {
        success: false,
        contacts_added: 0,
        contacts_excluded: excluded.length,
        exclusions: excluded,
        message: 'All contacts were excluded (no phone number or recently contacted)',
      },
    };
  }

  // Push to PhoneBurner
  let added = 0;
  let failed = 0;
  const pushErrors: string[] = [];

  for (const contact of eligible) {
    const nameParts = contact.name.split(' ');
    try {
      const res = await fetch(`${PB_API_BASE}/contacts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pbToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          phone: contact.phone,
          email: contact.email || '',
          company: contact.company || '',
          title: contact.title || '',
          custom_fields: {
            sourceco_id: contact.id,
            contact_source: 'SourceCo AI Command Center',
          },
        }),
      });
      if (res.ok) {
        added++;
      } else {
        failed++;
        pushErrors.push(`${contact.name}: Push failed`);
      }
    } catch {
      failed++;
      pushErrors.push(`${contact.name}: Network error`);
    }
  }

  // Log session
  await supabase.from('phoneburner_sessions').insert({
    session_name: (args.session_name as string) || `AI Push - ${new Date().toLocaleDateString()}`,
    session_type: 'buyer_outreach',
    total_contacts_added: added,
    session_status: 'active',
    created_by_user_id: userId,
    started_at: new Date().toISOString(),
  });

  return {
    data: {
      success: added > 0,
      contacts_added: added,
      contacts_failed: failed,
      contacts_excluded: excluded.length,
      exclusions: excluded.length > 0 ? excluded : undefined,
      errors: pushErrors.length > 0 ? pushErrors : undefined,
      message: `Pushed ${added} contacts to PhoneBurner${failed > 0 ? ` (${failed} failed)` : ''}${excluded.length > 0 ? ` (${excluded.length} excluded)` : ''}`,
    },
  };
}
