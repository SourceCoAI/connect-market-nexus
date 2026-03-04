import { describe, it, expect } from 'vitest';

/**
 * Tests for the generate-lead-memo edge function's pure logic.
 *
 * Since the edge function runs in Deno and uses `Deno.serve`, we test the
 * pure validation/processing functions by re-implementing them locally
 * (same pattern used by existing tests in supabase/functions/).
 */

// ─── Types ───

interface MemoSection {
  key: string;
  title: string;
  content: string;
}

interface ValidationResult {
  passed: boolean;
  reason: string;
}

// ─── Constants (mirrored from edge function) ───

const BANNED_WORDS = [
  'strong',
  'robust',
  'impressive',
  'attractive',
  'compelling',
  'well-positioned',
  'significant opportunity',
  'poised for growth',
  'track record of success',
  'best-in-class',
  'proven',
  'demonstrated',
  'synergies',
  'uniquely positioned',
  'market leader',
  'value creation opportunity',
  'healthy',
  'recession-resistant',
  'scalable',
  'turnkey',
  'world-class',
  'industry-leading',
  'deep bench',
  'blue-chip',
  'mission-critical',
  'sticky revenue',
  'white-space',
  'low-hanging fruit',
  'runway',
  'tailwinds',
  'fragmented market',
  'platform opportunity',
  'notable',
  'consistent',
  'solid',
  'substantial',
  'meaningful',
  'considerable',
  'positioned for',
  'well-established',
  'high-quality',
  'top-tier',
  'premier',
  'best-of-breed',
  'differentiated',
  'defensible',
  'diversified',
];

const FULL_MEMO_EXPECTED_SECTIONS = [
  'COMPANY OVERVIEW',
  'FINANCIAL SNAPSHOT',
  'SERVICES AND OPERATIONS',
  'OWNERSHIP AND TRANSACTION',
  'MANAGEMENT AND STAFFING',
  'KEY STRUCTURAL NOTES',
];

const FULL_MEMO_REQUIRED_SECTIONS = ['COMPANY OVERVIEW'];

const TEASER_EXPECTED_SECTIONS = [
  'BUSINESS OVERVIEW',
  'DEAL SNAPSHOT',
  'KEY FACTS',
  'GROWTH CONTEXT',
  'OWNER OBJECTIVES',
];

const TEASER_REQUIRED_SECTIONS = ['BUSINESS OVERVIEW', 'DEAL SNAPSHOT'];

const EVALUATIVE_ADJECTIVES = [
  'strong',
  'large',
  'high',
  'good',
  'great',
  'excellent',
  'growing',
  'stable',
  'mature',
  'efficient',
  'clean',
  'lean',
  'tight',
  'reliable',
];

// ─── Re-implemented pure functions ───

function enforceBannedWords(sections: MemoSection[]): MemoSection[] {
  return sections.map((s) => {
    let content = s.content;
    const parts = content.split(/("[^"]*")/g);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        for (const banned of BANNED_WORDS) {
          const escaped = banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
          parts[i] = parts[i].replace(regex, '');
        }
      }
    }
    content = parts.join('');
    content = content.replace(/  +/g, ' ').replace(/ ,/g, ',').replace(/ \./g, '.');
    return { ...s, content };
  });
}

function stripDataNeededTags(sections: MemoSection[]): MemoSection[] {
  return sections.map((s) => {
    let content = s.content;
    content = content.replace(/\[DATA NEEDED:[^\]]*\]/g, '');
    content = content.replace(/\[VERIFY:[^\]]*\]/g, '');
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    content = content.replace(/  +/g, ' ').replace(/ +\n/g, '\n').trim();
    return { ...s, content };
  });
}

function parseMarkdownToSections(markdown: string): MemoSection[] {
  const sections: MemoSection[] = [];
  const parts = markdown.split(/^## /gm);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const newlineIdx = trimmed.indexOf('\n');
    if (newlineIdx === -1) continue;
    const title = trimmed.substring(0, newlineIdx).trim();
    const content = trimmed.substring(newlineIdx + 1).trim();
    if (!content) continue;
    const key = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
    sections.push({ key, title, content });
  }
  return sections;
}

function validateFullMemoSections(sections: MemoSection[]): ValidationResult {
  const sectionTitles = sections.map((s) => s.title.toUpperCase().trim());
  for (const required of FULL_MEMO_REQUIRED_SECTIONS) {
    if (!sectionTitles.includes(required)) {
      return { passed: false, reason: `Missing required section: "${required}"` };
    }
  }
  for (const title of sectionTitles) {
    if (!FULL_MEMO_EXPECTED_SECTIONS.includes(title)) {
      return {
        passed: false,
        reason: `Unexpected section header: "${title}". Expected one of: ${FULL_MEMO_EXPECTED_SECTIONS.join(', ')}`,
      };
    }
  }
  const allContent = sections.map((s) => s.content).join(' ');
  const wordCount = allContent.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount > 1000) {
    return {
      passed: false,
      reason: `Word count is ${wordCount}. The maximum is 1,000 words. Shorten by removing lowest-priority content (enrichment details first, then operational details).`,
    };
  }
  return { passed: true, reason: '' };
}

function validateTeaserSections(sections: MemoSection[]): ValidationResult {
  const sectionTitles = sections.map((s) => s.title.toUpperCase().trim());
  for (const required of TEASER_REQUIRED_SECTIONS) {
    if (!sectionTitles.includes(required)) {
      return { passed: false, reason: `Missing required section: "${required}"` };
    }
  }
  for (const title of sectionTitles) {
    if (!TEASER_EXPECTED_SECTIONS.includes(title)) {
      return {
        passed: false,
        reason: `Unexpected section header: "${title}". Expected one of: ${TEASER_EXPECTED_SECTIONS.join(', ')}`,
      };
    }
  }
  const allContent = sections.map((s) => s.content).join(' ');
  const wordCount = allContent.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount > 600) {
    return {
      passed: false,
      reason: `Word count is ${wordCount}. The maximum is 600 words. Shorten by removing lowest-priority content.`,
    };
  }
  return { passed: true, reason: '' };
}

function runMemoWarnings(sections: MemoSection[]): { warnings: string[] } {
  const warnings: string[] = [];

  // Check 5: Financial Figure Repetition
  const figuresBySection: Map<string, string[]> = new Map();
  for (const section of sections) {
    const figures = section.content.match(/\$[\d,.]+[KMBkmb]?|\d+(\.\d+)?%/g) || [];
    for (const fig of figures) {
      const existing = figuresBySection.get(fig);
      if (existing) {
        existing.push(section.title);
      } else {
        figuresBySection.set(fig, [section.title]);
      }
    }
  }
  for (const [figure, sectionNames] of figuresBySection) {
    if (sectionNames.length > 1) {
      warnings.push(
        `Financial figure "${figure}" appears in multiple sections: ${sectionNames.join(', ')}`,
      );
    }
  }

  // Check 6: Adjective Audit
  for (const section of sections) {
    const unquoted = section.content.replace(/"[^"]*"/g, '');
    for (const adj of EVALUATIVE_ADJECTIVES) {
      const regex = new RegExp(`\\b${adj}\\b`, 'gi');
      let match;
      while ((match = regex.exec(unquoted)) !== null) {
        const start = Math.max(0, match.index - 30);
        const end = Math.min(unquoted.length, match.index + adj.length + 30);
        const surrounding = unquoted.substring(start, end);
        if (!/\d/.test(surrounding)) {
          warnings.push(
            `Adjective "${adj}" in ${section.title} without nearby number: "...${surrounding.trim()}..."`,
          );
        }
      }
    }
  }

  return { warnings };
}

// ─── Helpers ───

function makeSection(key: string, title: string, content: string): MemoSection {
  return { key, title, content };
}

/** Generate a valid full memo section set */
function fullMemoSections(overrides: Partial<Record<string, string>> = {}): MemoSection[] {
  return [
    makeSection(
      'company_overview',
      overrides['COMPANY OVERVIEW'] ? 'COMPANY OVERVIEW' : 'COMPANY OVERVIEW',
      overrides['COMPANY OVERVIEW'] ||
        'Acme Corp is a commercial HVAC company founded in 2010 in Dallas, TX. The company operates 3 locations with 45 employees.',
    ),
    makeSection(
      'financial_snapshot',
      'FINANCIAL SNAPSHOT',
      overrides['FINANCIAL SNAPSHOT'] ||
        '- **Revenue:** $5.2M (2024)\n- **EBITDA:** $1.1M\n- **Owner compensation:** $350K',
    ),
    makeSection(
      'services_and_operations',
      'SERVICES AND OPERATIONS',
      overrides['SERVICES AND OPERATIONS'] ||
        '- Commercial HVAC installation and repair\n- 3 service trucks\n- Serves Dallas-Fort Worth metro',
    ),
    makeSection(
      'ownership_and_transaction',
      'OWNERSHIP AND TRANSACTION',
      overrides['OWNERSHIP AND TRANSACTION'] ||
        '- 100% owner-operated\n- **Transaction type:** Full sale\n- **Reason for sale:** Retirement',
    ),
    makeSection(
      'management_and_staffing',
      'MANAGEMENT AND STAFFING',
      overrides['MANAGEMENT AND STAFFING'] || '- 45 total employees\n- 2 managers report to owner',
    ),
    makeSection(
      'key_structural_notes',
      'KEY STRUCTURAL NOTES',
      overrides['KEY STRUCTURAL NOTES'] || '- Real estate is leased\n- No pending litigation',
    ),
  ];
}

/** Generate a valid teaser section set */
function teaserSections(overrides: Partial<Record<string, string>> = {}): MemoSection[] {
  return [
    makeSection(
      'business_overview',
      'BUSINESS OVERVIEW',
      overrides['BUSINESS OVERVIEW'] ||
        'A commercial HVAC services provider in the Southwest region with 3 locations and 45 employees.',
    ),
    makeSection(
      'deal_snapshot',
      'DEAL SNAPSHOT',
      overrides['DEAL SNAPSHOT'] ||
        '- **Revenue:** $5M+\n- **EBITDA:** ~$1M\n- **Transaction type:** Full sale',
    ),
    makeSection(
      'key_facts',
      'KEY FACTS',
      overrides['KEY FACTS'] || '- 3 service locations\n- 45 employees\n- 15 years in business',
    ),
    makeSection(
      'growth_context',
      'GROWTH CONTEXT',
      overrides['GROWTH CONTEXT'] ||
        '- Owner has not pursued commercial contracts outside core metro area',
    ),
    makeSection(
      'owner_objectives',
      'OWNER OBJECTIVES',
      overrides['OWNER OBJECTIVES'] || '- Full sale preferred\n- Flexible on timeline',
    ),
  ];
}

// ─── Tests ───

describe('enforceBannedWords', () => {
  it('strips banned words from section content', () => {
    const sections = [
      makeSection('overview', 'Overview', 'The company has a robust pipeline and strong revenue.'),
    ];
    const result = enforceBannedWords(sections);
    expect(result[0].content).not.toContain('robust');
    expect(result[0].content).not.toContain('strong');
    expect(result[0].content).toContain('pipeline');
    expect(result[0].content).toContain('revenue');
  });

  it('preserves text inside quotation marks', () => {
    const sections = [
      makeSection(
        'overview',
        'Overview',
        'The owner said "our robust growth has been strong" during the call.',
      ),
    ];
    const result = enforceBannedWords(sections);
    expect(result[0].content).toContain('"our robust growth has been strong"');
  });

  it('strips multi-word banned phrases', () => {
    const sections = [
      makeSection(
        'overview',
        'Overview',
        'This is a significant opportunity with a track record of success.',
      ),
    ];
    const result = enforceBannedWords(sections);
    expect(result[0].content).not.toContain('significant opportunity');
    expect(result[0].content).not.toContain('track record of success');
  });

  it('is case-insensitive', () => {
    const sections = [makeSection('overview', 'Overview', 'ROBUST and Scalable operations.')];
    const result = enforceBannedWords(sections);
    expect(result[0].content.toLowerCase()).not.toContain('robust');
    expect(result[0].content.toLowerCase()).not.toContain('scalable');
  });

  it('cleans up double spaces after removal', () => {
    const sections = [makeSection('overview', 'Overview', 'A robust company.')];
    const result = enforceBannedWords(sections);
    expect(result[0].content).not.toContain('  ');
  });

  it('cleans up orphaned commas and periods', () => {
    const sections = [makeSection('overview', 'Overview', 'Revenue is strong, and growing.')];
    const result = enforceBannedWords(sections);
    // After removing "strong" — "Revenue is , and growing." should become "Revenue is, and growing."
    expect(result[0].content).not.toContain(' ,');
    expect(result[0].content).not.toContain(' .');
  });

  it('handles sections with no banned words unchanged', () => {
    const sections = [makeSection('overview', 'Overview', 'Revenue was $5.2M in 2024.')];
    const result = enforceBannedWords(sections);
    expect(result[0].content).toBe('Revenue was $5.2M in 2024.');
  });

  it('handles multiple sections independently', () => {
    const sections = [
      makeSection('a', 'A', 'A robust pipeline.'),
      makeSection('b', 'B', 'Clean data. Revenue $5M.'),
    ];
    const result = enforceBannedWords(sections);
    expect(result[0].content).not.toContain('robust');
    expect(result[1].content).toBe('Clean data. Revenue $5M.');
  });

  it('handles empty content gracefully', () => {
    const sections = [makeSection('empty', 'Empty', '')];
    const result = enforceBannedWords(sections);
    expect(result[0].content).toBe('');
  });
});

describe('stripDataNeededTags', () => {
  it('removes [DATA NEEDED: ...] tags', () => {
    const sections = [
      makeSection('overview', 'Overview', 'Revenue: $5M [DATA NEEDED: exact EBITDA figure]'),
    ];
    const result = stripDataNeededTags(sections);
    expect(result[0].content).not.toContain('[DATA NEEDED');
    expect(result[0].content).toContain('Revenue: $5M');
  });

  it('removes [VERIFY: ...] tags', () => {
    const sections = [
      makeSection('overview', 'Overview', 'Founded in 2010 [VERIFY: year from enrichment]'),
    ];
    const result = stripDataNeededTags(sections);
    expect(result[0].content).not.toContain('[VERIFY');
    expect(result[0].content).toContain('Founded in 2010');
  });

  it('removes multiple tags in the same section', () => {
    const sections = [
      makeSection(
        'overview',
        'Overview',
        'Revenue: $5M [DATA NEEDED: breakdown] and EBITDA: $1M [VERIFY: add-backs]',
      ),
    ];
    const result = stripDataNeededTags(sections);
    expect(result[0].content).not.toContain('[DATA NEEDED');
    expect(result[0].content).not.toContain('[VERIFY');
  });

  it('collapses triple newlines to double', () => {
    const sections = [makeSection('overview', 'Overview', 'Line one\n\n\nLine two')];
    const result = stripDataNeededTags(sections);
    expect(result[0].content).toBe('Line one\n\nLine two');
  });

  it('cleans up double spaces', () => {
    const sections = [makeSection('overview', 'Overview', 'Revenue:  $5M  annually')];
    const result = stripDataNeededTags(sections);
    expect(result[0].content).not.toMatch(/ {2}/);
  });

  it('handles content with no tags unchanged', () => {
    const sections = [makeSection('overview', 'Overview', 'Revenue: $5M')];
    const result = stripDataNeededTags(sections);
    expect(result[0].content).toBe('Revenue: $5M');
  });
});

describe('parseMarkdownToSections', () => {
  it('parses ## headers into sections', () => {
    const md =
      '## COMPANY OVERVIEW\nAcme Corp is a company.\n\n## FINANCIAL SNAPSHOT\n- Revenue: $5M';
    const sections = parseMarkdownToSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('COMPANY OVERVIEW');
    expect(sections[0].key).toBe('company_overview');
    expect(sections[0].content).toContain('Acme Corp');
    expect(sections[1].title).toBe('FINANCIAL SNAPSHOT');
    expect(sections[1].key).toBe('financial_snapshot');
  });

  it('ignores text before the first ## header', () => {
    const md = 'Some preamble text\n\n## COMPANY OVERVIEW\nContent here.';
    const sections = parseMarkdownToSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('COMPANY OVERVIEW');
  });

  it('generates snake_case keys from titles', () => {
    const md = '## SERVICES AND OPERATIONS\nSome content here.';
    const sections = parseMarkdownToSections(md);
    expect(sections[0].key).toBe('services_and_operations');
  });

  it('skips sections with no content', () => {
    const md = '## EMPTY SECTION\n\n## REAL SECTION\nActual content.';
    const sections = parseMarkdownToSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('REAL SECTION');
  });

  it('skips header-only lines with no newline', () => {
    const md = '## JUST A TITLE';
    const sections = parseMarkdownToSections(md);
    expect(sections).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(parseMarkdownToSections('')).toHaveLength(0);
  });

  it('preserves multiline content within a section', () => {
    const md = '## FINANCIAL SNAPSHOT\n- Revenue: $5M\n- EBITDA: $1M\n- Owner comp: $350K';
    const sections = parseMarkdownToSections(md);
    expect(sections[0].content).toContain('Revenue: $5M');
    expect(sections[0].content).toContain('EBITDA: $1M');
    expect(sections[0].content).toContain('Owner comp: $350K');
  });

  it('trims whitespace from title and content', () => {
    const md = '## COMPANY OVERVIEW  \n  Acme Corp.  ';
    const sections = parseMarkdownToSections(md);
    expect(sections[0].title).toBe('COMPANY OVERVIEW');
    expect(sections[0].content).toBe('Acme Corp.');
  });
});

describe('validateFullMemoSections', () => {
  it('passes for a complete valid section set', () => {
    const result = validateFullMemoSections(fullMemoSections());
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('');
  });

  it('fails when COMPANY OVERVIEW is missing', () => {
    const sections = fullMemoSections().filter((s) => s.title !== 'COMPANY OVERVIEW');
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('COMPANY OVERVIEW');
  });

  it('fails with an unexpected section header', () => {
    const sections = [
      ...fullMemoSections(),
      makeSection('random', 'COMPETITIVE ANALYSIS', 'Some content.'),
    ];
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unexpected section header');
    expect(result.reason).toContain('COMPETITIVE ANALYSIS');
  });

  it('fails when word count exceeds 1000', () => {
    const longContent = Array(1001).fill('word').join(' ');
    const sections = fullMemoSections({ 'COMPANY OVERVIEW': longContent });
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Word count');
    expect(result.reason).toContain('1,000');
  });

  it('passes with exactly 1000 words', () => {
    // Build sections that total exactly 1000 words
    const targetWords = 1000;
    // Minimal content for all sections except overview
    const minimalSections = fullMemoSections();
    const otherWordCount = minimalSections
      .filter((s) => s.title !== 'COMPANY OVERVIEW')
      .reduce((sum, s) => sum + s.content.split(/\s+/).filter((w) => w.length > 0).length, 0);
    const overviewWords = targetWords - otherWordCount;
    const overviewContent = Array(overviewWords).fill('word').join(' ');
    const sections = fullMemoSections({ 'COMPANY OVERVIEW': overviewContent });
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
  });

  it('passes with only the required section', () => {
    const sections = [makeSection('company_overview', 'COMPANY OVERVIEW', 'Acme Corp.')];
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
  });

  it('is case-insensitive for section title matching', () => {
    const sections = [
      makeSection('company_overview', 'Company Overview', 'Acme Corp.'),
      makeSection('financial_snapshot', 'Financial Snapshot', '- 2024 Revenue: $5,200,000'),
    ];
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
  });
});

describe('validateTeaserSections', () => {
  it('passes for a complete valid teaser section set', () => {
    const result = validateTeaserSections(teaserSections());
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('');
  });

  it('fails when BUSINESS OVERVIEW is missing', () => {
    const sections = teaserSections().filter((s) => s.title !== 'BUSINESS OVERVIEW');
    const result = validateTeaserSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('BUSINESS OVERVIEW');
  });

  it('fails when DEAL SNAPSHOT is missing', () => {
    const sections = teaserSections().filter((s) => s.title !== 'DEAL SNAPSHOT');
    const result = validateTeaserSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('DEAL SNAPSHOT');
  });

  it('fails with an unexpected section header', () => {
    const sections = [
      ...teaserSections(),
      makeSection('random', 'FINANCIAL DETAILS', 'Some content.'),
    ];
    const result = validateTeaserSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unexpected section header');
    expect(result.reason).toContain('FINANCIAL DETAILS');
  });

  it('fails when word count exceeds 600', () => {
    const longContent = Array(601).fill('word').join(' ');
    const sections = teaserSections({ 'BUSINESS OVERVIEW': longContent });
    const result = validateTeaserSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Word count');
    expect(result.reason).toContain('600');
  });

  it('passes with exactly 600 words', () => {
    const targetWords = 600;
    const minimalSections = teaserSections();
    const otherWordCount = minimalSections
      .filter((s) => s.title !== 'BUSINESS OVERVIEW')
      .reduce((sum, s) => sum + s.content.split(/\s+/).filter((w) => w.length > 0).length, 0);
    const overviewWords = targetWords - otherWordCount;
    const overviewContent = Array(overviewWords).fill('word').join(' ');
    const sections = teaserSections({ 'BUSINESS OVERVIEW': overviewContent });
    const result = validateTeaserSections(sections);
    expect(result.passed).toBe(true);
  });

  it('passes with only the two required sections', () => {
    const sections = [
      makeSection(
        'business_overview',
        'BUSINESS OVERVIEW',
        'A commercial services company in the Southwest.',
      ),
      makeSection('deal_snapshot', 'DEAL SNAPSHOT', '- Revenue: $5M+'),
    ];
    const result = validateTeaserSections(sections);
    expect(result.passed).toBe(true);
  });
});

describe('runMemoWarnings', () => {
  it('returns no warnings for clean content', () => {
    const sections = [
      makeSection('financial_snapshot', 'FINANCIAL SNAPSHOT', '- Revenue: $5.2M\n- EBITDA: $1.1M'),
      makeSection('overview', 'COMPANY OVERVIEW', 'Acme Corp operates 3 locations.'),
    ];
    const result = runMemoWarnings(sections);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when a financial figure appears in multiple sections', () => {
    const sections = [
      makeSection('financial', 'FINANCIAL SNAPSHOT', 'Revenue: $5.2M'),
      makeSection('overview', 'COMPANY OVERVIEW', 'The company generates $5.2M in revenue.'),
    ];
    const result = runMemoWarnings(sections);
    expect(result.warnings.some((w) => w.includes('$5.2M'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('multiple sections'))).toBe(true);
  });

  it('warns when a percentage appears in multiple sections', () => {
    const sections = [
      makeSection('financial', 'FINANCIAL SNAPSHOT', 'Margins: 22%'),
      makeSection('operations', 'SERVICES AND OPERATIONS', 'Efficiency rate of 22%.'),
    ];
    const result = runMemoWarnings(sections);
    expect(result.warnings.some((w) => w.includes('22%'))).toBe(true);
  });

  it('does not warn when different figures appear in different sections', () => {
    const sections = [
      makeSection('financial', 'FINANCIAL SNAPSHOT', 'Revenue: $5.2M'),
      makeSection('overview', 'COMPANY OVERVIEW', 'EBITDA: $1.1M'),
    ];
    const result = runMemoWarnings(sections);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when evaluative adjective has no nearby number', () => {
    const sections = [
      makeSection('overview', 'COMPANY OVERVIEW', 'The company has a stable customer base.'),
    ];
    const result = runMemoWarnings(sections);
    expect(result.warnings.some((w) => w.includes('stable'))).toBe(true);
  });

  it('does not warn when evaluative adjective is near a number', () => {
    const sections = [makeSection('financial', 'FINANCIAL SNAPSHOT', 'A high 22% margin.')];
    const result = runMemoWarnings(sections);
    // "high" is within 30 chars of "22", so no warning
    expect(result.warnings.filter((w) => w.includes('"high"'))).toHaveLength(0);
  });

  it('ignores evaluative adjectives inside quotation marks', () => {
    const sections = [
      makeSection(
        'overview',
        'COMPANY OVERVIEW',
        'Owner said "we have strong and stable operations" during the call.',
      ),
    ];
    const result = runMemoWarnings(sections);
    // "strong" and "stable" are inside quotes — should not trigger warnings
    expect(
      result.warnings.filter((w) => w.includes('"strong"') || w.includes('"stable"')),
    ).toHaveLength(0);
  });

  it('handles sections with no financial figures or adjectives', () => {
    const sections = [
      makeSection(
        'company_overview',
        'COMPANY OVERVIEW',
        'Acme Corp is a commercial HVAC company.',
      ),
    ];
    const result = runMemoWarnings(sections);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('parseMarkdownToSections → validateFullMemoSections integration', () => {
  it('parses a realistic full memo markdown and validates successfully', () => {
    const markdown = `## COMPANY OVERVIEW
Acme Corp (DBA "Acme Services") is a commercial HVAC company founded in 2010, headquartered in Dallas, TX. The company operates 3 locations across the Dallas-Fort Worth metro with 45 employees. Acme provides installation and repair services to commercial clients.

## FINANCIAL SNAPSHOT
- **Revenue:** $5.2M (2024)
- **EBITDA:** $1.1M (adjusted)
- **Owner compensation:** $350K
- **Add-backs:** $150K (personal vehicle, family cell phone)

## SERVICES AND OPERATIONS
- Commercial HVAC installation and repair
- 3 service locations across DFW
- Serves primarily commercial clients (80%) and residential (20%)

## OWNERSHIP AND TRANSACTION
- 100% owner-operated since founding
- **Transaction type:** Full sale
- **Reason for sale:** Retirement (owner age 62)
- **Valuation context:** Owner expects 5-6x EBITDA

## MANAGEMENT AND STAFFING
- 45 total employees: 30 field technicians, 10 office staff, 5 managers
- 2 senior managers could stay post-transaction
- Owner involved in sales and major client relationships

## KEY STRUCTURAL NOTES
- **Real estate:** All locations leased, 3-5 year terms remaining
- No pending litigation
- All licenses transferable`;

    const sections = parseMarkdownToSections(markdown);
    expect(sections).toHaveLength(6);

    const validation = validateFullMemoSections(sections);
    expect(validation.passed).toBe(true);
  });
});

describe('parseMarkdownToSections → validateTeaserSections integration', () => {
  it('parses a realistic teaser markdown and validates successfully', () => {
    const markdown = `## BUSINESS OVERVIEW
A commercial HVAC services provider operating in the Southwest region. The company maintains 3 service locations with 45 employees, serving both commercial and residential clients.

## DEAL SNAPSHOT
- **Revenue:** $5M+
- **EBITDA:** ~$1M (adjusted)
- **Transaction type:** Full sale
- **Asking valuation:** 5-6x EBITDA

## KEY FACTS
- 3 service locations
- 45 employees
- 15 years in business
- 80% commercial / 20% residential revenue mix

## GROWTH CONTEXT
- Owner has not pursued government or municipal contracts
- Second location added 2019, third in 2022

## OWNER OBJECTIVES
- Full sale preferred
- Retirement within 12-18 months
- Flexible on transition period`;

    const sections = parseMarkdownToSections(markdown);
    expect(sections).toHaveLength(5);

    const validation = validateTeaserSections(sections);
    expect(validation.passed).toBe(true);
  });
});

// ─── IC-readiness tests: ensure clean output suitable for investment committee ───

describe('IC-readiness: no "not provided" language in output', () => {
  const NOT_PROVIDED_PATTERNS = [
    /not yet provided/i,
    /not provided/i,
    /not stated/i,
    /not confirmed/i,
    /not discussed/i,
    /information not yet/i,
    /data not available/i,
    /not yet available/i,
  ];

  function assertNoNotProvidedLanguage(sections: MemoSection[]) {
    for (const section of sections) {
      for (const pattern of NOT_PROVIDED_PATTERNS) {
        expect(
          pattern.test(section.content),
          `Section "${section.title}" contains forbidden language matching ${pattern}: "${section.content}"`,
        ).toBe(false);
      }
    }
  }

  it('full memo with complete data has no "not provided" language', () => {
    const sections = fullMemoSections();
    assertNoNotProvidedLanguage(sections);
  });

  it('full memo with only company overview has no "not provided" language', () => {
    const sections = [
      makeSection(
        'company_overview',
        'COMPANY OVERVIEW',
        'Acme Corp is a commercial HVAC company founded in 2010 in Dallas, TX.',
      ),
    ];
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
    assertNoNotProvidedLanguage(sections);
  });

  it('sparse financial snapshot (revenue only, no EBITDA) passes without gap language', () => {
    const markdown = `## COMPANY OVERVIEW
Acme Corp is a commercial HVAC company in Dallas, TX with 3 locations and 45 employees.

## FINANCIAL SNAPSHOT
- 2024 Revenue: $5,200,000`;

    const sections = parseMarkdownToSections(markdown);
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
    assertNoNotProvidedLanguage(sections);
    // Verify only revenue is present, no EBITDA filler
    expect(sections[1].content).not.toContain('EBITDA');
  });

  it('memo with only revenue and transaction info omits unstated sections cleanly', () => {
    const markdown = `## COMPANY OVERVIEW
XYZ Services LLC operates a plumbing business in Phoenix, AZ with 12 employees.

## FINANCIAL SNAPSHOT
- 2025 Revenue: $1,800,000

## OWNERSHIP AND TRANSACTION
- 100% owner-operated
- **Transaction type:** Full sale
- **Reason for sale:** Retirement`;

    const sections = parseMarkdownToSections(markdown);
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
    assertNoNotProvidedLanguage(sections);
    // No SERVICES AND OPERATIONS, MANAGEMENT AND STAFFING, or KEY STRUCTURAL NOTES
    expect(sections).toHaveLength(3);
  });
});

describe('IC-readiness: INFORMATION NOT YET PROVIDED section is rejected', () => {
  it('rejects a memo that includes an INFORMATION NOT YET PROVIDED section', () => {
    const sections = [
      makeSection('company_overview', 'COMPANY OVERVIEW', 'Acme Corp.'),
      makeSection(
        'information_not_yet_provided',
        'INFORMATION NOT YET PROVIDED',
        '- Customer concentration\n- Balance sheet',
      ),
    ];
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Unexpected section header');
  });
});

describe('IC-readiness: financial snapshot format', () => {
  it('validates simple year-metric format', () => {
    const markdown = `## COMPANY OVERVIEW
ABC Corp is a collision repair business in Houston, TX with 5 locations and 85 employees.

## FINANCIAL SNAPSHOT
- 2024 Revenue: $12,500,000
- 2024 EBITDA: $2,100,000
- Owner Compensation: $450,000
- Add-backs: $200,000 (personal vehicle $80,000, family health insurance $120,000)`;

    const sections = parseMarkdownToSections(markdown);
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
    const financial = sections.find((s) => s.title === 'FINANCIAL SNAPSHOT')!;
    expect(financial.content).toContain('2024 Revenue: $12,500,000');
    expect(financial.content).toContain('2024 EBITDA: $2,100,000');
    expect(financial.content).toContain('Owner Compensation: $450,000');
  });

  it('validates multi-year financial data in simple line format', () => {
    const markdown = `## COMPANY OVERVIEW
DEF Corp is an IT services provider in Atlanta, GA.

## FINANCIAL SNAPSHOT
- 2024 Revenue: $8,200,000
- 2023 Revenue: $7,100,000
- 2022 Revenue: $6,500,000
- 2024 EBITDA: $1,400,000`;

    const sections = parseMarkdownToSections(markdown);
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
    const financial = sections.find((s) => s.title === 'FINANCIAL SNAPSHOT')!;
    expect(financial.content).toContain('2024 Revenue');
    expect(financial.content).toContain('2023 Revenue');
    expect(financial.content).toContain('2022 Revenue');
  });

  it('validates EBITDA-only snapshot without filler', () => {
    const markdown = `## COMPANY OVERVIEW
GHI Corp operates a staffing business in Chicago, IL.

## FINANCIAL SNAPSHOT
- 2025 EBITDA: $900,000`;

    const sections = parseMarkdownToSections(markdown);
    const result = validateFullMemoSections(sections);
    expect(result.passed).toBe(true);
    const financial = sections.find((s) => s.title === 'FINANCIAL SNAPSHOT')!;
    // Should only have the one data point, nothing else
    expect(financial.content.split('\n').filter((l: string) => l.trim()).length).toBe(1);
  });
});

describe('IC-readiness: full realistic memo end-to-end', () => {
  it('parses and validates a complete IC-ready memo', () => {
    const markdown = `## COMPANY OVERVIEW
Southwest Auto Group LLC (DBA "Southwest Collision") is a collision repair business founded in 2008, headquartered in Phoenix, AZ. The company operates 4 locations across the Phoenix metro area with 62 employees. Southwest provides auto body repair, paint services, and ADAS calibration to insurance carriers and retail customers.

## FINANCIAL SNAPSHOT
- 2024 Revenue: $9,800,000
- 2023 Revenue: $8,500,000
- 2024 EBITDA: $1,600,000
- Owner Compensation: $380,000

## SERVICES AND OPERATIONS
- Auto body repair, refinishing, and ADAS calibration
- 4 locations across Phoenix metro
- 65% DRP (direct repair program) revenue, 35% retail/walk-in
- 3 OEM certifications (Honda, Toyota, Hyundai)
- Average cycle time: 6.2 days

## OWNERSHIP AND TRANSACTION
- 100% owned by single operator since founding
- **Transaction type:** Full sale
- **Reason for sale:** Owner turning 60, planning retirement within 18 months
- **Valuation context:** Owner expects 5x EBITDA
- Owner willing to stay 6-12 months for transition

## MANAGEMENT AND STAFFING
- 62 total employees across 4 locations
- Each location has a general manager who runs day-to-day operations
- Owner focuses on insurance carrier relationships and new location buildouts
- 2 senior GMs have been with the company 8+ years

## KEY STRUCTURAL NOTES
- **Real estate:** 2 locations leased (3 and 5 year terms remaining), 2 locations owned by owner personally and leased to the business at market rate
- Owner open to including real estate in the transaction or continuing lease
- Arizona contractor license is transferable`;

    const sections = parseMarkdownToSections(markdown);
    expect(sections).toHaveLength(6);

    const validation = validateFullMemoSections(sections);
    expect(validation.passed).toBe(true);

    // No "not provided" language anywhere
    const allContent = sections.map((s) => s.content).join(' ');
    expect(allContent).not.toMatch(/not yet provided/i);
    expect(allContent).not.toMatch(/not provided/i);
    expect(allContent).not.toMatch(/not stated/i);
    expect(allContent).not.toMatch(/not confirmed/i);
    expect(allContent).not.toMatch(/INFORMATION NOT YET PROVIDED/i);

    // No banned marketing words
    const cleaned = enforceBannedWords(sections);
    for (let i = 0; i < sections.length; i++) {
      expect(cleaned[i].content).toBe(sections[i].content);
    }

    // Financial snapshot is simple labeled lines
    const financial = sections.find((s) => s.title === 'FINANCIAL SNAPSHOT')!;
    const lines = financial.content.split('\n').filter((l: string) => l.trim());
    expect(lines.length).toBe(4);
    expect(lines[0]).toMatch(/2024 Revenue/);
    expect(lines[1]).toMatch(/2023 Revenue/);
    expect(lines[2]).toMatch(/2024 EBITDA/);
    expect(lines[3]).toMatch(/Owner Compensation/);

    // Word count under limit
    const wordCount = allContent.split(/\s+/).filter((w: string) => w.length > 0).length;
    expect(wordCount).toBeLessThanOrEqual(1000);

    // No warnings
    const warnings = runMemoWarnings(sections);
    expect(warnings.warnings).toHaveLength(0);
  });

  it('parses and validates a sparse IC-ready memo (minimal data)', () => {
    const markdown = `## COMPANY OVERVIEW
JKL Plumbing Inc. is a residential plumbing company in El Paso, TX with approximately 8 employees. The owner operates the business full-time.

## FINANCIAL SNAPSHOT
- 2025 Revenue: $1,200,000

## OWNERSHIP AND TRANSACTION
- 100% owner-operated
- **Transaction type:** Full sale
- **Reason for sale:** Owner relocating out of state`;

    const sections = parseMarkdownToSections(markdown);
    expect(sections).toHaveLength(3);

    const validation = validateFullMemoSections(sections);
    expect(validation.passed).toBe(true);

    // No gap language
    const allContent = sections.map((s) => s.content).join(' ');
    expect(allContent).not.toMatch(/not yet provided/i);
    expect(allContent).not.toMatch(/not provided/i);
    expect(allContent).not.toMatch(/not stated/i);
    expect(allContent).not.toMatch(/balance sheet/i);
    expect(allContent).not.toMatch(/customer concentration/i);

    // Only 3 sections — omitted sections are just absent, not called out
    const sectionTitles = sections.map((s) => s.title);
    expect(sectionTitles).not.toContain('SERVICES AND OPERATIONS');
    expect(sectionTitles).not.toContain('MANAGEMENT AND STAFFING');
    expect(sectionTitles).not.toContain('KEY STRUCTURAL NOTES');
    expect(sectionTitles).not.toContain('INFORMATION NOT YET PROVIDED');
  });
});
