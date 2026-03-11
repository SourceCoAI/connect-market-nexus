/**
 * Merge field registry and utilities for SmartLead campaign outreach.
 *
 * Provides tag extraction from campaign sequences (including variants and
 * Handlebars conditionals), a registry of known auto-mappable fields, and
 * available data sources for user-driven mapping of unknown tags.
 */

import type { SmartleadSequence } from '@/types/smartlead';

// ─── Known merge fields the system auto-populates ─────────────────────────

export interface MergeFieldDef {
  tag: string;
  label: string;
  source: 'lead' | 'deal_profile' | 'derived' | 'internal';
}

export const KNOWN_MERGE_FIELDS: MergeFieldDef[] = [
  // Lead-level (from contact record)
  { tag: 'first_name', label: 'First Name', source: 'lead' },
  { tag: 'last_name', label: 'Last Name', source: 'lead' },
  { tag: 'email', label: 'Email', source: 'lead' },
  { tag: 'phone', label: 'Phone', source: 'lead' },
  { tag: 'company_name', label: 'Company Name', source: 'lead' },
  { tag: 'title', label: 'Title', source: 'lead' },
  // Deal profile (from deal_outreach_profiles)
  { tag: 'deal_descriptor', label: 'Deal Descriptor', source: 'deal_profile' },
  { tag: 'geography', label: 'Geography', source: 'deal_profile' },
  { tag: 'ebitda', label: 'EBITDA', source: 'deal_profile' },
  // Derived
  { tag: 'buyer_ref', label: 'Buyer Reference', source: 'derived' },
  // Internal IDs
  { tag: 'sourceco_deal_id', label: 'SourceCo Deal ID', source: 'internal' },
  { tag: 'sourceco_buyer_id', label: 'SourceCo Buyer ID', source: 'internal' },
];

export const KNOWN_TAGS = new Set(KNOWN_MERGE_FIELDS.map((f) => f.tag));

// ─── SmartLead system variables (resolved by SmartLead, not us) ───────────

export const SMARTLEAD_SYSTEM_TAGS = new Set([
  'unsubscribe_link',
  'sender_name',
  'sender_email',
  'sender_company',
  'sender_signature',
  'sl_spintax',
]);

// ─── Available data sources for user-driven mapping ───────────────────────

export interface DataSourceOption {
  value: string;
  label: string;
  group: string;
}

export const AVAILABLE_DATA_SOURCES: DataSourceOption[] = [
  // Contact fields
  { value: 'first_name', label: 'First Name', group: 'Contact' },
  { value: 'last_name', label: 'Last Name', group: 'Contact' },
  { value: 'email', label: 'Email', group: 'Contact' },
  { value: 'phone', label: 'Phone', group: 'Contact' },
  { value: 'company_name', label: 'Company Name', group: 'Contact' },
  { value: 'title', label: 'Title', group: 'Contact' },
  // Deal profile
  { value: 'deal_descriptor', label: 'Deal Descriptor', group: 'Deal Profile' },
  { value: 'geography', label: 'Geography', group: 'Deal Profile' },
  { value: 'ebitda', label: 'EBITDA', group: 'Deal Profile' },
  // Derived
  { value: 'buyer_ref', label: 'Buyer Reference', group: 'Derived' },
  // Buyer fields
  { value: 'buyer_type', label: 'Buyer Type', group: 'Buyer' },
  { value: 'buyer_company_name', label: 'Buyer Company', group: 'Buyer' },
  { value: 'pe_firm_name', label: 'PE Firm Name', group: 'Buyer' },
];

// ─── Tag extraction ───────────────────────────────────────────────────────

/**
 * Extracts unique merge tag names from a text string.
 * Handles both simple {{tag}} and Handlebars conditionals like {{#if tag}}.
 */
export function extractMergeTags(text: string): string[] {
  if (!text) return [];
  const tags = new Set<string>();

  // Match simple {{tag}} — excludes Handlebars helpers (#if, /if, else, etc.)
  const simpleRe = /\{\{(?!#|\/|else\b)(\w+)\}\}/g;
  let match;
  while ((match = simpleRe.exec(text)) !== null) {
    tags.add(match[1]);
  }

  // Match {{#if tag}} to also capture conditional tags
  const ifRe = /\{\{#if\s+(\w+)\}\}/g;
  while ((match = ifRe.exec(text)) !== null) {
    tags.add(match[1]);
  }

  return [...tags];
}

/**
 * Extracts all unique merge tags from all sequences and their variants.
 * Scans subject + email_body across all steps and active (non-deleted) variants.
 */
export function extractTagsFromSequences(sequences: SmartleadSequence[]): string[] {
  const allTags = new Set<string>();

  for (const seq of sequences) {
    // Scan parent-level subject/body
    for (const tag of extractMergeTags(seq.subject || '')) allTags.add(tag);
    for (const tag of extractMergeTags(seq.email_body || '')) allTags.add(tag);

    // Scan variants (A/B test content)
    if (seq.sequence_variants) {
      for (const v of seq.sequence_variants) {
        if (v.is_deleted) continue;
        for (const tag of extractMergeTags(v.subject || '')) allTags.add(tag);
        for (const tag of extractMergeTags(v.email_body || '')) allTags.add(tag);
      }
    }
  }

  return [...allTags];
}

// ─── Tag classification ──────────────────────────────────────────────────

export type TagStatus = 'auto-mapped' | 'system' | 'needs-mapping';

export interface ClassifiedTag {
  tag: string;
  status: TagStatus;
  label?: string; // human-readable label for auto-mapped tags
}

/**
 * Classifies extracted tags as auto-mapped, system, or needs-mapping.
 */
export function classifyTags(tags: string[]): ClassifiedTag[] {
  return tags.map((tag) => {
    if (SMARTLEAD_SYSTEM_TAGS.has(tag)) {
      return { tag, status: 'system' as const };
    }
    const known = KNOWN_MERGE_FIELDS.find((f) => f.tag === tag);
    if (known) {
      return { tag, status: 'auto-mapped' as const, label: known.label };
    }
    return { tag, status: 'needs-mapping' as const };
  });
}
