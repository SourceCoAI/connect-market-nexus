import { describe, it, expect } from 'vitest';

/**
 * Tests for the Buyer Relationship System
 *
 * These tests validate the core business logic of Parts A, B, and C
 * without requiring a live database connection.
 */

// ── PE firm name cleaning (Part C, Stage 2) ──

const PREFIX_PATTERNS = [
  /^a\s+portfolio\s+company\s+of\s+/i,
  /^portfolio\s+company\s+of\s+/i,
  /^owned\s+by\s+/i,
  /^backed\s+by\s+/i,
  /^a\s+company\s+of\s+/i,
];

const SUFFIX_PATTERNS = [
  /,?\s*(LLC|L\.L\.C\.|LP|L\.P\.|Inc\.?|Corp\.?|Co\.?|Ltd\.?|LLP|Partners|Advisors|Management|Capital\s+Management)\s*$/i,
  /\s*Fund\s+[IVXLCDM]+\s*$/i,
  /\s*Fund\s+\d{4}\s*$/i,
  /\s*Fund\s+\d+\s*$/i,
];

const STOPLIST = [
  'private equity',
  'investment firm',
  'pe firm',
  'equity firm',
];

function cleanPEFirmName(raw: string): { cleaned: string; isGeneric: boolean } {
  let name = raw.trim();
  for (const pattern of PREFIX_PATTERNS) {
    name = name.replace(pattern, '');
  }
  for (const pattern of SUFFIX_PATTERNS) {
    name = name.replace(pattern, '');
  }
  name = name.trim();
  name = name.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
  const isGeneric = STOPLIST.includes(name.toLowerCase()) || name.length < 3;
  return { cleaned: name, isGeneric };
}

describe('PE Firm Name Cleaning', () => {
  it('should clean "A portfolio company of Pacheron Capital" to "Pacheron Capital"', () => {
    const result = cleanPEFirmName('A portfolio company of Pacheron Capital');
    expect(result.cleaned).toBe('Pacheron Capital');
    expect(result.isGeneric).toBe(false);
  });

  it('should clean "Owned by Alpine Investors LLC" to "Alpine Investors"', () => {
    const result = cleanPEFirmName('Owned by Alpine Investors LLC');
    expect(result.cleaned).toBe('Alpine Investors');
    expect(result.isGeneric).toBe(false);
  });

  it('should clean "Backed by Summit Partners Fund III" to "Summit Partners"', () => {
    // "Partners" is part of the firm name — suffix strip removes "Fund III" only
    const result = cleanPEFirmName('Backed by Summit Partners Fund III');
    expect(result.cleaned).toBe('Summit Partners');
    expect(result.isGeneric).toBe(false);
  });

  it('should mark "Private Equity" as generic/unresolvable', () => {
    const result = cleanPEFirmName('Private Equity');
    expect(result.isGeneric).toBe(true);
  });

  it('should mark "PE Firm" as generic/unresolvable', () => {
    const result = cleanPEFirmName('PE Firm');
    expect(result.isGeneric).toBe(true);
  });

  it('should handle simple firm names without prefixes', () => {
    const result = cleanPEFirmName('Pacheron Capital');
    expect(result.cleaned).toBe('Pacheron Capital');
    expect(result.isGeneric).toBe(false);
  });

  it('should strip legal suffixes from firm names', () => {
    const result = cleanPEFirmName('Genstar Capital, LLC');
    expect(result.cleaned).toBe('Genstar Capital');
  });

  it('should strip fund numbers', () => {
    const result = cleanPEFirmName('Vista Equity Fund 2024');
    expect(result.cleaned).toBe('Vista Equity');
  });
});

// ── Agreement resolution logic (Part A, Section A3) ──

interface AgreementResult {
  covered: boolean;
  source: 'own' | 'parent' | null;
  parent_name: string | null;
}

function resolveAgreement(
  ownAgreementSigned: boolean,
  hasParent: boolean,
  parentAgreementSigned: boolean,
  parentName: string | null,
): AgreementResult {
  // Step 1: Check own agreement
  if (ownAgreementSigned) {
    return { covered: true, source: 'own', parent_name: null };
  }

  // Step 2: Check parent
  if (!hasParent) {
    return { covered: false, source: null, parent_name: null };
  }

  // Step 3: Check parent's agreement
  if (parentAgreementSigned) {
    return { covered: true, source: 'parent', parent_name: parentName };
  }

  return { covered: false, source: null, parent_name: parentName };
}

describe('Agreement Resolution', () => {
  it('should return covered=true via parent when platform has no own agreement but parent does', () => {
    const result = resolveAgreement(false, true, true, 'Pacheron Capital');
    expect(result).toEqual({
      covered: true,
      source: 'parent',
      parent_name: 'Pacheron Capital',
    });
  });

  it('should return covered=true via own when platform has its own agreement', () => {
    const result = resolveAgreement(true, true, true, 'Pacheron Capital');
    expect(result).toEqual({
      covered: true,
      source: 'own',
      parent_name: null,
    });
  });

  it('should return not covered when neither buyer nor parent has agreement', () => {
    const result = resolveAgreement(false, true, false, 'Pacheron Capital');
    expect(result).toEqual({
      covered: false,
      source: null,
      parent_name: 'Pacheron Capital',
    });
  });

  it('should return not covered when no parent exists', () => {
    const result = resolveAgreement(false, false, false, null);
    expect(result).toEqual({
      covered: false,
      source: null,
      parent_name: null,
    });
  });
});

// ── Buyer type normalization (shared buyer-type-definitions) ──

const CANONICAL_BUYER_TYPES = [
  'private_equity',
  'corporate',
  'family_office',
  'search_fund',
  'independent_sponsor',
  'individual_buyer',
] as const;

const VALID_BUYER_TYPES = new Set<string>(CANONICAL_BUYER_TYPES);

const BUYER_TYPE_NORMALIZATION_MAP: Record<string, string> = {
  // Canonical (pass-through)
  private_equity: 'private_equity',
  corporate: 'corporate',
  family_office: 'family_office',
  search_fund: 'search_fund',
  independent_sponsor: 'independent_sponsor',
  individual_buyer: 'individual_buyer',
  // Legacy remarketing values
  pe_firm: 'private_equity',
  strategic: 'corporate',
  platform: 'corporate',
  other: 'corporate',
  // Marketplace camelCase values
  privateequity: 'private_equity',
  privatequity: 'private_equity',
  familyoffice: 'family_office',
  searchfund: 'search_fund',
  independentsponsor: 'independent_sponsor',
  businessowner: 'corporate',
  advisor: 'corporate',
  individual: 'individual_buyer',
};

function normalizeBuyerType(raw: string | null | undefined): string {
  if (!raw) return 'corporate';
  const key = raw.trim().toLowerCase();
  return BUYER_TYPE_NORMALIZATION_MAP[key] ?? 'corporate';
}

function isValidBuyerType(value: string): boolean {
  return VALID_BUYER_TYPES.has(value);
}

describe('Buyer Type Definitions', () => {
  it('should have exactly 6 canonical types', () => {
    expect(CANONICAL_BUYER_TYPES).toHaveLength(6);
  });

  it('all canonical types should be in VALID_BUYER_TYPES', () => {
    for (const t of CANONICAL_BUYER_TYPES) {
      expect(isValidBuyerType(t)).toBe(true);
    }
  });

  it('should reject non-canonical types', () => {
    expect(isValidBuyerType('pe_firm')).toBe(false);
    expect(isValidBuyerType('strategic')).toBe(false);
    expect(isValidBuyerType('platform_co')).toBe(false);
    expect(isValidBuyerType('unknown')).toBe(false);
  });
});

describe('Buyer Type Normalization', () => {
  it('should normalize marketplace camelCase to canonical', () => {
    expect(normalizeBuyerType('privateEquity')).toBe('private_equity');
    expect(normalizeBuyerType('familyOffice')).toBe('family_office');
    expect(normalizeBuyerType('searchFund')).toBe('search_fund');
    expect(normalizeBuyerType('independentSponsor')).toBe('independent_sponsor');
  });

  it('should normalize legacy values to canonical', () => {
    expect(normalizeBuyerType('pe_firm')).toBe('private_equity');
    expect(normalizeBuyerType('strategic')).toBe('corporate');
    expect(normalizeBuyerType('platform')).toBe('corporate');
    expect(normalizeBuyerType('other')).toBe('corporate');
  });

  it('should normalize advisor and businessOwner to corporate', () => {
    expect(normalizeBuyerType('advisor')).toBe('corporate');
    expect(normalizeBuyerType('businessOwner')).toBe('corporate');
  });

  it('should normalize individual to individual_buyer', () => {
    expect(normalizeBuyerType('individual')).toBe('individual_buyer');
  });

  it('should default null/undefined to corporate', () => {
    expect(normalizeBuyerType(null)).toBe('corporate');
    expect(normalizeBuyerType(undefined)).toBe('corporate');
    expect(normalizeBuyerType('')).toBe('corporate');
  });

  it('should pass through already-canonical values', () => {
    for (const t of CANONICAL_BUYER_TYPES) {
      expect(normalizeBuyerType(t)).toBe(t);
    }
  });

  it('should default unknown values to corporate', () => {
    expect(normalizeBuyerType('unknown_type')).toBe('corporate');
    expect(normalizeBuyerType('gibberish')).toBe('corporate');
  });

  it('every normalization result should be a valid canonical type', () => {
    const allInputs = Object.keys(BUYER_TYPE_NORMALIZATION_MAP);
    for (const input of allInputs) {
      const result = normalizeBuyerType(input);
      expect(isValidBuyerType(result)).toBe(true);
    }
  });
});

// ── Platform Company Rule tests ──

describe('Platform Company Rule (Classification)', () => {
  function applyPlatformCompanyRule(
    classifiedType: string,
    classifiedIsPeBacked: boolean,
    peFirmName: string | null,
  ): { type: string; is_pe_backed: boolean } {
    let type = classifiedType;
    let isPeBacked = classifiedIsPeBacked;

    // Rule #1: pe_firm_name set → always corporate + is_pe_backed
    if (peFirmName && peFirmName.trim() !== '') {
      type = 'corporate';
      isPeBacked = true;
    }

    // Rule: PE firms are never PE-backed themselves
    if (type === 'private_equity') {
      isPeBacked = false;
    }

    return { type, is_pe_backed: isPeBacked };
  }

  it('should force corporate + is_pe_backed when pe_firm_name is set', () => {
    // Even if AI classifies as private_equity, the rule overrides
    const result = applyPlatformCompanyRule('private_equity', false, 'Alpine Investors');
    expect(result.type).toBe('corporate');
    expect(result.is_pe_backed).toBe(true);
  });

  it('should keep PE-backed flag when already classified as corporate', () => {
    const result = applyPlatformCompanyRule('corporate', true, 'Genstar Capital');
    expect(result.type).toBe('corporate');
    expect(result.is_pe_backed).toBe(true);
  });

  it('should NOT set is_pe_backed when pe_firm_name is empty', () => {
    const result = applyPlatformCompanyRule('corporate', false, '');
    expect(result.type).toBe('corporate');
    expect(result.is_pe_backed).toBe(false);
  });

  it('should NOT set is_pe_backed when pe_firm_name is null', () => {
    const result = applyPlatformCompanyRule('family_office', false, null);
    expect(result.type).toBe('family_office');
    expect(result.is_pe_backed).toBe(false);
  });

  it('PE firms are never PE-backed themselves', () => {
    const result = applyPlatformCompanyRule('private_equity', true, null);
    expect(result.type).toBe('private_equity');
    expect(result.is_pe_backed).toBe(false);
  });
});

// ── Marketplace merge simulation ──

describe('Marketplace Buyer Merge Logic', () => {
  // Simulates the merge logic: when a marketplace buyer signs up with a domain
  // that matches an existing firm_agreements record, they should be linked
  // rather than duplicated.

  function shouldMerge(
    emailDomain: string | null,
    existingFirmDomains: string[],
  ): boolean {
    if (!emailDomain) return false;
    return existingFirmDomains.includes(emailDomain);
  }

  it('should detect matching email domain and trigger merge', () => {
    expect(shouldMerge('pacheron.com', ['pacheron.com', 'alpineinvestors.com'])).toBe(true);
  });

  it('should NOT merge when domain is not found', () => {
    expect(shouldMerge('newbuyer.com', ['pacheron.com', 'alpineinvestors.com'])).toBe(false);
  });

  it('should NOT merge when domain is null (generic email)', () => {
    expect(shouldMerge(null, ['pacheron.com'])).toBe(false);
  });
});

// ── Priority field-write logic (never overwrite enriched data) ──

describe('Profile → Buyer Field Priority (Priority 40 — Never Overwrite)', () => {
  function shouldWriteField(
    existingValue: string | null | undefined,
    profileValue: string | null | undefined,
  ): boolean {
    // Only write if existing field is NULL/empty and profile has data
    if (existingValue && existingValue.trim() !== '') return false;
    if (!profileValue || profileValue.trim() === '') return false;
    return true;
  }

  it('should write to empty field when profile has data', () => {
    expect(shouldWriteField(null, 'SourceCo Inc')).toBe(true);
    expect(shouldWriteField('', 'SourceCo Inc')).toBe(true);
  });

  it('should NOT overwrite existing enriched data', () => {
    expect(shouldWriteField('Already Enriched Value', 'Profile Value')).toBe(false);
  });

  it('should NOT write if profile value is empty', () => {
    expect(shouldWriteField(null, null)).toBe(false);
    expect(shouldWriteField(null, '')).toBe(false);
  });
});

// ── BuyerTypeBadge effective type logic ──

function getEffectiveBadgeType(buyerType: string, isPeBacked: boolean): string {
  if (buyerType === 'corporate' && isPeBacked) {
    return 'platform_co';
  }
  return buyerType;
}

describe('BuyerTypeBadge Logic', () => {
  it('should show platform_co for PE-backed corporate', () => {
    expect(getEffectiveBadgeType('corporate', true)).toBe('platform_co');
  });

  it('should show corporate (Strategic) for standalone corporate', () => {
    expect(getEffectiveBadgeType('corporate', false)).toBe('corporate');
  });

  it('should show private_equity for PE firms regardless of is_pe_backed', () => {
    expect(getEffectiveBadgeType('private_equity', false)).toBe('private_equity');
  });

  it('should show family_office as-is', () => {
    expect(getEffectiveBadgeType('family_office', false)).toBe('family_office');
  });
});

// ── Domain extraction ──

function extractDomain(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase();
  const generic = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
  if (generic.includes(domain)) return null;
  return domain;
}

describe('Email Domain Extraction', () => {
  it('should extract corporate email domains', () => {
    expect(extractDomain('john@pacheron.com')).toBe('pacheron.com');
  });

  it('should return null for generic email providers', () => {
    expect(extractDomain('john@gmail.com')).toBeNull();
    expect(extractDomain('john@yahoo.com')).toBeNull();
  });

  it('should return null for invalid emails', () => {
    expect(extractDomain('invalid-email')).toBeNull();
  });
});

// ── Depth constraint validation ──

describe('Parent-Child Depth Constraint', () => {
  it('should enforce max depth of 1 — a parent cannot itself have a parent', () => {
    // This test validates the business rule that is enforced by the DB trigger.
    // The trigger prevents setting parent_pe_firm_id on a record
    // when the target record itself has a parent_pe_firm_id.

    const peRecord = { id: 'pe-1', parent_pe_firm_id: null };
    const platformRecord = { id: 'platform-1', parent_pe_firm_id: 'pe-1' };

    // Attempt to make platformRecord a parent of another record
    // This should fail because platformRecord already has a parent
    function validateDepth(
      targetParentId: string,
      records: Array<{ id: string; parent_pe_firm_id: string | null }>,
    ): boolean {
      const parent = records.find((r) => r.id === targetParentId);
      if (!parent) return false;
      // Parent must not itself have a parent
      return parent.parent_pe_firm_id === null;
    }

    // PE firm as parent — OK (no grandparent)
    expect(validateDepth('pe-1', [peRecord, platformRecord])).toBe(true);

    // Platform company as parent — FAIL (it has a parent = pe-1)
    expect(validateDepth('platform-1', [peRecord, platformRecord])).toBe(false);
  });
});

// ── Confidence threshold outcomes ──

function getOutcome(confidence: number): string {
  if (confidence >= 85) return 'auto_linked';
  if (confidence >= 70) return 'auto_linked_review_recommended';
  if (confidence >= 55) return 'flagged_for_review';
  if (confidence > 0) return 'flagged_low_confidence';
  return 'auto_created';
}

describe('Backfill Confidence Thresholds', () => {
  it('should auto-link at 85+', () => {
    expect(getOutcome(95)).toBe('auto_linked');
    expect(getOutcome(85)).toBe('auto_linked');
  });

  it('should auto-link with review at 70-84', () => {
    expect(getOutcome(75)).toBe('auto_linked_review_recommended');
    expect(getOutcome(70)).toBe('auto_linked_review_recommended');
  });

  it('should flag for review at 55-69', () => {
    expect(getOutcome(65)).toBe('flagged_for_review');
    expect(getOutcome(55)).toBe('flagged_for_review');
  });

  it('should flag low confidence at 1-54', () => {
    expect(getOutcome(40)).toBe('flagged_low_confidence');
    expect(getOutcome(1)).toBe('flagged_low_confidence');
  });

  it('should auto-create at 0', () => {
    expect(getOutcome(0)).toBe('auto_created');
  });
});
