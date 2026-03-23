/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Integration Contact Tools
 * Save contacts to the CRM (unified contacts table) with buyer linkage.
 */

import type { SupabaseClient, ClaudeTool, ToolResult } from './common.ts';

// ---------- Tool definitions ----------

export const contactToolDefinitions: ClaudeTool[] = [
  {
    name: 'save_contacts_to_crm',
    description:
      'Save selected contacts to the CRM (unified contacts table) with buyer linkage. Use AFTER finding/enriching contacts when the user approves adding them. Takes contact data and links them to a remarketing buyer. REQUIRES CONFIRMATION. Use when the user says "add these contacts", "save the first 5", or "yes, add them to our system".',
    input_schema: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              title: { type: 'string' },
              linkedin_url: { type: 'string' },
              company_name: { type: 'string' },
            },
          },
          description: 'Array of contacts to save',
        },
        remarketing_buyer_id: {
          type: 'string',
          description: 'Link contacts to this remarketing buyer (optional)',
        },
        listing_id: {
          type: 'string',
          description: 'Link contacts to this deal/listing (optional)',
        },
        contact_type: {
          type: 'string',
          enum: ['buyer', 'seller', 'advisor', 'other'],
          description: 'Contact type (default "buyer")',
        },
      },
      required: ['contacts'],
    },
  },
];

// ---------- Executor ----------

export async function saveContactsToCrm(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const contactsInput = args.contacts as Array<{
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    title?: string;
    linkedin_url?: string;
    company_name?: string;
  }>;

  if (!contactsInput?.length) return { error: 'contacts array is required and must not be empty' };

  const buyerId = args.remarketing_buyer_id as string | undefined;
  const listingId = args.listing_id as string | undefined;
  const contactType = (args.contact_type as string) || 'buyer';

  const saved: Array<{ id: string; name: string; email: string | null }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const errors: string[] = [];

  for (const contact of contactsInput) {
    const firstName = contact.first_name?.trim() || '';
    const lastName = contact.last_name?.trim() || '';
    const email = contact.email?.trim() || null;
    const phone = contact.phone?.trim() || null;

    if (!firstName && !lastName && !email) {
      skipped.push({ name: 'Unknown', reason: 'No name or email provided' });
      continue;
    }

    // Check for existing contact by email
    if (email) {
      const { data: existing } = await (supabase as any)
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('email', email)
        .eq('archived', false)
        .limit(1)
        .maybeSingle();

      if (existing) {
        skipped.push({
          name: `${firstName} ${lastName}`.trim(),
          reason: `Duplicate — already exists as ${existing.first_name} ${existing.last_name} (${existing.id})`,
        });
        continue;
      }
    }

    // Insert
    const { data: inserted, error: insertError } = await (supabase as any)
      .from('contacts')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        title: contact.title?.trim() || null,
        linkedin_url: contact.linkedin_url?.trim() || null,
        company_name: contact.company_name?.trim() || null,
        contact_type: contactType,
        remarketing_buyer_id: buyerId || null,
        listing_id: listingId || null,
        source: 'ai_command_center',
        created_by: userId,
        archived: false,
      })
      .select('id, first_name, last_name, email')
      .single();

    if (insertError) {
      errors.push(`Failed to save ${firstName} ${lastName}: ${insertError.message}`);
      continue;
    }

    saved.push({
      id: inserted.id,
      name: `${inserted.first_name} ${inserted.last_name}`.trim(),
      email: inserted.email,
    });
  }

  // Log activity — only if we can resolve a deal for this listing+buyer
  if (saved.length > 0 && listingId && buyerId) {
    const { data: linkedDeal } = await (supabase as any)
      .from('deal_pipeline')
      .select('id')
      .eq('listing_id', listingId)
      .eq('remarketing_buyer_id', buyerId)
      .limit(1)
      .maybeSingle();

    if (linkedDeal) {
      await (supabase as any).from('deal_activities').insert({
        deal_id: linkedDeal.id,
        activity_type: 'contacts_added',
        title: `${saved.length} contact(s) added via AI Command Center`,
        description: `Contacts: ${saved.map((s) => s.name).join(', ')}`,
        admin_id: userId,
        metadata: {
          source: 'ai_command_center',
          contact_ids: saved.map((s) => s.id),
          buyer_id: buyerId,
        },
      });
    }
  }

  return {
    data: {
      saved,
      saved_count: saved.length,
      skipped,
      skipped_count: skipped.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Saved ${saved.length} contact(s) to CRM${skipped.length > 0 ? ` (${skipped.length} skipped)` : ''}`,
    },
  };
}
