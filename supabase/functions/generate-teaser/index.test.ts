import { describe, it, expect } from 'vitest';

/**
 * Tests for the generate-teaser edge function's validation logic.
 *
 * Re-implements the validateTeaser function locally for unit testing
 * (same pattern used by existing tests in supabase/functions/).
 */

// ─── Re-implemented validateTeaser ───

function validateTeaser(
  teaserText: string,
  companyName: string,
  ownerName: string,
  leadMemoCity: string | null,
  employeeNames: string[],
): { pass: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- ANONYMITY CHECKS ---

  if (
    companyName &&
    new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(teaserText)
  ) {
    errors.push(`ANONYMITY BREACH: Company name "${companyName}" found in teaser`);
  }

  if (ownerName) {
    const nameParts = ownerName.split(' ').filter((p) => p.length > 2);
    for (const part of nameParts) {
      if (new RegExp(`\\b${part}\\b`, 'i').test(teaserText)) {
        errors.push(`ANONYMITY BREACH: Owner name part "${part}" found`);
      }
    }
  }

  for (const name of employeeNames) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(teaserText)) {
      errors.push(`ANONYMITY BREACH: Employee name "${name}" found`);
    }
  }

  if (leadMemoCity && new RegExp(`\\b${leadMemoCity}\\b`, 'i').test(teaserText)) {
    errors.push(`ANONYMITY BREACH: City "${leadMemoCity}" found`);
  }

  const states = [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ];
  for (const state of states) {
    if (new RegExp(`\\b${state}\\b`, 'i').test(teaserText)) {
      errors.push(`ANONYMITY BREACH: State "${state}" not converted to region`);
    }
  }

  // --- STRUCTURE CHECKS ---

  if (/not provided|not stated|not confirmed|not discussed|not yet provided/i.test(teaserText)) {
    errors.push('Contains banned placeholder language');
  }

  if (/information not yet provided/i.test(teaserText)) {
    errors.push('Contains INFORMATION NOT YET PROVIDED section');
  }

  const wordCount = teaserText.split(/\s+/).filter(Boolean).length;
  if (wordCount > 700) errors.push(`Exceeds 700 word limit (${wordCount} words)`);

  if (!/## COMPANY OVERVIEW/i.test(teaserText)) errors.push('Missing COMPANY OVERVIEW section');

  const allowed = [
    'COMPANY OVERVIEW',
    'FINANCIAL SNAPSHOT',
    'SERVICES AND OPERATIONS',
    'OWNERSHIP AND TRANSACTION',
    'MANAGEMENT AND STAFFING',
    'KEY STRUCTURAL NOTES',
  ];
  const headers = teaserText.match(/^## .+$/gm) || [];
  for (const h of headers) {
    const title = h.replace('## ', '').trim().toUpperCase();
    if (!allowed.includes(title)) errors.push(`Unexpected section: "${h}"`);
  }

  // --- WARNINGS ---

  if (wordCount < 150) warnings.push(`Only ${wordCount} words`);

  const banned = [
    'robust',
    'impressive',
    'attractive',
    'compelling',
    'well-positioned',
    'best-in-class',
    'world-class',
    'industry-leading',
    'turnkey',
    'synergies',
    'uniquely positioned',
    'market leader',
    'poised for growth',
  ];
  const found = banned.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(teaserText));
  if (found.length) warnings.push(`Banned words: ${found.join(', ')}`);

  return { pass: errors.length === 0, errors, warnings };
}

// ─── Test Data ───

/** A clean, properly anonymized teaser that should pass all checks */
const CLEAN_TEASER = `## COMPANY OVERVIEW
Project HVAC is an HVAC services company founded in 2008, operating 3 locations across the Mountain West region. The company employs 45 people.

## FINANCIAL SNAPSHOT
* 2024 Revenue: $4,200,000
* 2023 Revenue: $3,800,000
* EBITDA: $850,000

## SERVICES AND OPERATIONS
- 70% commercial HVAC, 30% residential
- Serves multiple hospitality clients across the region

## OWNERSHIP AND TRANSACTION
- **Transaction type:** Full sale
- The owner (sole owner) seeks a full sale
- Expecting approximately 5x EBITDA
- Legal counsel retained for transaction

## MANAGEMENT AND STAFFING
- 45 total employees across 3 locations
- The General Manager oversees daily operations`;

// ─── Tests ───

describe('validateTeaser — anonymity checks', () => {
  it('fails when company name appears in teaser', () => {
    const teaser = CLEAN_TEASER.replace('Project HVAC', 'Desert Air Mechanical LLC');
    const result = validateTeaser(teaser, 'Desert Air Mechanical LLC', '', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('Company name'))).toBe(true);
  });

  it('fails when owner first name appears in teaser', () => {
    const teaser = CLEAN_TEASER.replace('The owner', 'John');
    const result = validateTeaser(teaser, '', 'John Smith', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('Owner name part') && e.includes('John'))).toBe(
      true,
    );
  });

  it('fails when owner last name appears in teaser', () => {
    const teaser = CLEAN_TEASER.replace('The owner', 'Mr. Smith');
    const result = validateTeaser(teaser, '', 'John Smith', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('Owner name part') && e.includes('Smith'))).toBe(
      true,
    );
  });

  it('fails when city name from lead memo appears in teaser', () => {
    const teaser = CLEAN_TEASER.replace(
      'across the Mountain West region',
      'headquartered in Phoenix',
    );
    const result = validateTeaser(teaser, '', '', 'Phoenix', []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('City') && e.includes('Phoenix'))).toBe(true);
  });

  it('fails when US state name is not converted to region', () => {
    const teaser = CLEAN_TEASER.replace('the Mountain West region', 'Arizona');
    const result = validateTeaser(teaser, '', '', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('State') && e.includes('Arizona'))).toBe(true);
  });

  it('fails when employee name appears in teaser', () => {
    const teaser = CLEAN_TEASER.replace('The General Manager', 'David Chen');
    const result = validateTeaser(teaser, '', '', null, ['David Chen']);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('Employee name'))).toBe(true);
  });

  it('passes with a valid teaser that has no leaks', () => {
    const result = validateTeaser(
      CLEAN_TEASER,
      'Desert Air Mechanical LLC',
      'John Smith',
      'Phoenix',
      ['David Chen'],
    );
    expect(result.pass).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateTeaser — structure checks', () => {
  it('fails with unexpected section header', () => {
    const teaser = CLEAN_TEASER + '\n\n## GROWTH OPPORTUNITIES\n- Expansion into residential.';
    const result = validateTeaser(teaser, '', '', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('Unexpected section'))).toBe(true);
  });

  it('fails when COMPANY OVERVIEW is missing', () => {
    const teaser = `## FINANCIAL SNAPSHOT
* 2024 Revenue: $4,200,000
* EBITDA: $850,000`;
    const result = validateTeaser(teaser, '', '', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('COMPANY OVERVIEW'))).toBe(true);
  });

  it('fails when "not provided" appears in teaser', () => {
    const teaser = CLEAN_TEASER + '\n\nEBITDA breakdown not provided.';
    const result = validateTeaser(teaser, '', '', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('banned placeholder'))).toBe(true);
  });

  it('fails when over 700 words', () => {
    const longTeaser = CLEAN_TEASER + '\n\n' + Array(500).fill('additional word').join(' ');
    const result = validateTeaser(longTeaser, '', '', null, []);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('700 word limit'))).toBe(true);
  });
});

describe('validateTeaser — warnings', () => {
  it('warns on banned words (not hard failure)', () => {
    const teaser = CLEAN_TEASER.replace(
      'HVAC services company',
      'robust and impressive HVAC services company',
    );
    const result = validateTeaser(teaser, '', '', null, []);
    // Banned words are warnings, not errors
    expect(result.pass).toBe(true);
    expect(result.warnings.some((w) => w.includes('Banned words'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('robust'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('impressive'))).toBe(true);
  });

  it('warns when under 150 words', () => {
    const shortTeaser = '## COMPANY OVERVIEW\nA company in the region.';
    const result = validateTeaser(shortTeaser, '', '', null, []);
    expect(result.warnings.some((w) => w.includes('Only'))).toBe(true);
  });
});

describe('validateTeaser — clean teaser', () => {
  it('returns zero errors and zero warnings for a clean teaser', () => {
    // Build a teaser that is long enough to avoid the <150 word warning
    const fullTeaser = `## COMPANY OVERVIEW
Project HVAC is an HVAC services company founded in 2008, operating 3 locations across the Mountain West region. The company employs 45 people and provides commercial and residential heating, ventilation, and air conditioning services. The business model combines installation projects with recurring maintenance agreements.

## FINANCIAL SNAPSHOT
* 2024 Revenue: $4,200,000
* 2023 Revenue: $3,800,000
* EBITDA: $850,000
* Owner Compensation: $200,000
* EBITDA Margin: 20%

## SERVICES AND OPERATIONS
- 70% commercial HVAC installation and repair
- 30% residential services
- Serves multiple hospitality and commercial real estate clients
- 150 active maintenance agreements generating recurring revenue
- Fleet of 12 service vehicles

## OWNERSHIP AND TRANSACTION
- **Transaction type:** Full sale
- The owner (sole owner) seeks a full sale
- Expecting approximately 5x EBITDA
- Owner willing to transition for 12 months post-close
- **Real estate:** All locations leased, 3-5 year terms remaining

## MANAGEMENT AND STAFFING
- 45 total employees across 3 locations
- The General Manager has been with the company for 8 years and oversees daily operations
- 30 field technicians, 10 office staff, 5 managers
- Owner focuses on sales and key client relationships`;

    const result = validateTeaser(
      fullTeaser,
      'Desert Air Mechanical LLC',
      'John Smith',
      'Phoenix',
      ['David Chen', 'Maria Garcia'],
    );
    expect(result.pass).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
