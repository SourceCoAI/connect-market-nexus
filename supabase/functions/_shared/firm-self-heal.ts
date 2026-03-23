/**
 * Firm Self-Healing Helper
 *
 * When resolve_user_firm_id() returns null, this helper auto-creates
 * the firm_agreements + firm_members rows using the same matching logic
 * as auto-create-firm-on-signup.
 *
 * Only creates/links — never writes agreement booleans to profiles.
 */

import { GENERIC_EMAIL_DOMAINS } from './generic-email-domains.ts';

const BUSINESS_SUFFIXES =
  /\b(inc|llc|llp|ltd|corp|corporation|company|co|group|holdings|partners|lp|plc|pllc|pa|pc|sa|gmbh|ag|pty|srl|bv|nv)\b/gi;

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(BUSINESS_SUFFIXES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface SelfHealResult {
  firmId: string;
  created: boolean;
}

/**
 * Resolve or create a firm for a user who has no firm_members row.
 * Returns the firmId (existing or newly created).
 */
export async function selfHealFirm(
  supabaseAdmin: any,
  userId: string,
  profile: { email?: string | null; company?: string | null },
): Promise<SelfHealResult | null> {
  const companyName = profile.company || 'Unknown Company';
  const normalizedName = normalizeCompanyName(companyName);
  const emailDomain = profile.email?.split('@')[1]?.toLowerCase() || null;
  const isGenericDomain = emailDomain ? GENERIC_EMAIL_DOMAINS.has(emailDomain) : true;

  let firmId: string | null = null;
  let created = false;

  // 1. Match by email domain (skip generic)
  if (emailDomain && !isGenericDomain) {
    const { data } = await supabaseAdmin
      .from('firm_agreements')
      .select('id')
      .eq('email_domain', emailDomain)
      .maybeSingle();
    if (data) firmId = data.id;
  }

  // 2. Match by normalized company name
  if (!firmId) {
    const { data } = await supabaseAdmin
      .from('firm_agreements')
      .select('id')
      .eq('normalized_company_name', normalizedName)
      .maybeSingle();
    if (data) firmId = data.id;
  }

  // 3. Create new firm
  if (!firmId) {
    const { data: newFirm, error: firmError } = await supabaseAdmin
      .from('firm_agreements')
      .insert({
        primary_company_name: companyName,
        normalized_company_name: normalizedName,
        email_domain: isGenericDomain ? null : emailDomain,
        nda_signed: false,
        fee_agreement_signed: false,
      })
      .select('id')
      .single();

    if (firmError || !newFirm) {
      console.error('❌ selfHealFirm: failed to create firm:', firmError);
      return null;
    }
    firmId = newFirm.id;
    created = true;
    console.log(`🔧 Self-healed: created firm ${firmId} for "${companyName}"`);
  } else {
    console.log(`🔧 Self-healed: matched existing firm ${firmId} for "${companyName}"`);
  }

  // 4. Create firm_members link (ignore duplicates)
  const { error: memberError } = await supabaseAdmin.from('firm_members').insert({
    firm_id: firmId,
    user_id: userId,
    role: 'member',
  });

  if (memberError && memberError.code !== '23505') {
    console.error('⚠️ selfHealFirm: failed to create firm_member:', memberError);
  }

  return { firmId, created };
}
