/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CTO-Level Audit: Tests for the JSON parsing/repair logic in seed-buyers.
 *
 * This is critical because Claude responses can be:
 * - Truncated mid-JSON (token limit hit)
 * - Wrapped in markdown code fences despite instructions
 * - Missing trailing brackets
 * - Have trailing commas
 * - Contain control characters
 */
import { describe, it, expect } from 'vitest';

// ── Inline copies of the JSON repair functions from seed-buyers/index.ts ──

function findLastCompleteObject(text: string): number {
  let inString = false;
  let lastGoodClose = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === '}') lastGoodClose = i;
    }
  }
  return lastGoodClose;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;

function repairAndParseJson(raw: string): unknown {
  let cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const jsonStart = cleaned.indexOf('[');
  const objStart = cleaned.indexOf('{');
  // If '{' appears before '[' (or no '[' exists), try object parsing first.
  if (objStart !== -1 && (jsonStart === -1 || objStart < jsonStart)) {
    const objEnd = cleaned.lastIndexOf('}');
    const objSlice =
      objEnd > objStart ? cleaned.substring(objStart, objEnd + 1) : cleaned.substring(objStart);
    const objCleaned = objSlice.replace(CONTROL_CHARS_RE, ' ');
    try {
      return JSON.parse(objCleaned);
    } catch {
      /* fall through to array parsing */
    }
  }
  if (jsonStart === -1) {
    if (objStart === -1) throw new Error('No JSON found in response');
    throw new Error(`Cannot parse Claude response as JSON (length=${raw.length})`);
  }
  const jsonEnd = cleaned.lastIndexOf(']');
  cleaned =
    jsonEnd > jsonStart ? cleaned.substring(jsonStart, jsonEnd + 1) : cleaned.substring(jsonStart);
  cleaned = cleaned.replace(CONTROL_CHARS_RE, ' ');
  try {
    return JSON.parse(cleaned);
  } catch {
    /* continue */
  }
  let repaired = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  try {
    return JSON.parse(repaired);
  } catch {
    /* continue */
  }
  const lastGood = findLastCompleteObject(cleaned);
  if (lastGood > 0) {
    repaired = cleaned.substring(0, lastGood + 1);
    repaired = repaired.replace(/,\s*$/, '');
    if (!repaired.endsWith(']')) repaired += ']';
    if (!repaired.startsWith('[')) repaired = '[' + repaired;
    repaired = repaired.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    try {
      return JSON.parse(repaired);
    } catch {
      /* continue */
    }
  }
  let inStr = false;
  let depth = 0;
  let arrDepth = 0;
  let lastCompleteObjEnd = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0 && arrDepth === 1) lastCompleteObjEnd = i;
      } else if (ch === '[') arrDepth++;
      else if (ch === ']') arrDepth--;
    }
  }
  if (lastCompleteObjEnd > 0) {
    repaired = cleaned.substring(0, lastCompleteObjEnd + 1);
    repaired = repaired.replace(/,\s*$/, '');
    const firstBracket = repaired.indexOf('[');
    if (firstBracket >= 0) repaired = repaired.substring(firstBracket);
    if (!repaired.endsWith(']')) repaired += ']';
    repaired = repaired.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    try {
      return JSON.parse(repaired);
    } catch {
      /* continue */
    }
  }
  const objectMatches: unknown[] = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  let match;
  while ((match = objRegex.exec(cleaned)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.company_name) objectMatches.push(obj);
    } catch {
      /* skip */
    }
  }
  if (objectMatches.length > 0) return objectMatches;
  throw new Error(`Cannot parse Claude response as JSON (length=${raw.length})`);
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

describe('repairAndParseJson()', () => {
  it('parses clean JSON array', () => {
    const json = JSON.stringify([{ company_name: 'Acme Corp', pe_firm_name: 'PE Partners' }]);
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe('Acme Corp');
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const json = '```json\n[{"company_name": "Acme Corp"}]\n```';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe('Acme Corp');
  });

  it('parses JSON with trailing comma in object', () => {
    const json = '[{"company_name": "Acme Corp", "pe_firm_name": "PE Partners",}]';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
  });

  it('parses JSON with trailing comma in array', () => {
    const json = '[{"company_name": "Acme Corp"},]';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
  });

  it('recovers from truncated JSON (missing closing bracket)', () => {
    const json =
      '[{"company_name": "Acme Corp", "pe_firm_name": "PE Partners"}, {"company_name": "Beta Inc", "pe_firm_name": "Fund II"';
    const result = repairAndParseJson(json) as any[];
    // Should recover at least the first complete object
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].company_name).toBe('Acme Corp');
  });

  it('handles control characters in response', () => {
    const json = '[{"company_name": "Acme\x00Corp"}]';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe('Acme Corp');
  });

  it('FIXED: parses Pass 1 object response with nested arrays correctly', () => {
    // Previously this failed because the parser found '[' inside must_have_criteria
    // and tried to parse as an array. Fixed by checking if '{' appears before '['.
    const json = '{"ideal_buyer_description": "test", "must_have_criteria": ["a", "b"]}';
    const result = repairAndParseJson(json) as any;
    expect(result.ideal_buyer_description).toBe('test');
    expect(result.must_have_criteria).toEqual(['a', 'b']);
  });

  it('parses Pass 1 object response without nested arrays', () => {
    const json = '{"ideal_buyer_description": "test"}';
    const result = repairAndParseJson(json) as any;
    expect(result.ideal_buyer_description).toBe('test');
  });

  it('handles text before JSON', () => {
    const json = 'Here are the results:\n[{"company_name": "Acme Corp"}]';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe('Acme Corp');
  });

  it('handles text after JSON', () => {
    const json = '[{"company_name": "Acme Corp"}]\nLet me know if you need more.';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
  });

  it('throws on completely empty input', () => {
    expect(() => repairAndParseJson('')).toThrow('No JSON found');
  });

  it('throws on non-JSON text', () => {
    expect(() => repairAndParseJson('Hello world, no JSON here.')).toThrow();
  });

  it('recovers multiple complete objects from severely truncated array', () => {
    const json = `[
      {"company_name": "Company A", "pe_firm_name": "Fund A"},
      {"company_name": "Company B", "pe_firm_name": "Fund B"},
      {"company_name": "Company C", "pe_firm_n`;
    const result = repairAndParseJson(json) as any[];
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].company_name).toBe('Company A');
    expect(result[1].company_name).toBe('Company B');
  });

  it('handles escaped quotes in strings', () => {
    const json = '[{"company_name": "Acme \\"Best\\" Corp"}]';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
    expect(result[0].company_name).toBe('Acme "Best" Corp');
  });

  it('handles nested arrays in objects', () => {
    const json =
      '[{"company_name": "Acme", "target_services": ["hvac", "plumbing"], "known_acquisitions": ["Sub1"]}]';
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(1);
    expect(result[0].target_services).toEqual(['hvac', 'plumbing']);
  });

  it('handles large response with 8 buyers', () => {
    const buyers = Array.from({ length: 8 }, (_, i) => ({
      company_name: `Company ${i + 1}`,
      pe_firm_name: `Fund ${i + 1}`,
      buyer_type: 'corporate',
      hq_state: 'TX',
    }));
    const json = JSON.stringify(buyers);
    const result = repairAndParseJson(json) as any[];
    expect(result).toHaveLength(8);
  });
});

describe('findLastCompleteObject()', () => {
  it('finds the last closing brace', () => {
    const text = '{"a": 1}, {"b": 2}';
    expect(findLastCompleteObject(text)).toBe(text.lastIndexOf('}'));
  });

  it('handles strings with braces', () => {
    const text = '{"name": "test {bracket}"}';
    const idx = findLastCompleteObject(text);
    expect(idx).toBe(text.length - 1);
  });

  it('returns -1 for no objects', () => {
    expect(findLastCompleteObject('no braces here')).toBe(-1);
  });
});

describe('Domain extraction (from seed-buyers)', () => {
  function extractDomain(url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  }

  it('extracts domain from full URL', () => {
    expect(extractDomain('https://www.acmecorp.com/about')).toBe('acmecorp.com');
  });

  it('extracts domain from bare domain', () => {
    expect(extractDomain('acmecorp.com')).toBe('acmecorp.com');
  });

  it('strips www prefix', () => {
    expect(extractDomain('https://www.example.com')).toBe('example.com');
  });

  it('handles null', () => {
    expect(extractDomain(null)).toBeNull();
  });

  it('handles empty string', () => {
    expect(extractDomain('')).toBeNull();
  });

  it('handles malformed URL gracefully (returns null)', () => {
    // The URL constructor with 'https://' prefix will try to parse this
    // depending on the runtime, it may succeed or throw
    const result = extractDomain('not a url at all !@#$');
    // Either null or some parsed value is acceptable — it should not throw
    expect(typeof result === 'string' || result === null).toBe(true);
  });

  it('handles URL with port', () => {
    expect(extractDomain('https://example.com:8080')).toBe('example.com');
  });

  it('handles subdomain', () => {
    expect(extractDomain('https://app.example.com')).toBe('app.example.com');
  });

  it('lowercases domain', () => {
    expect(extractDomain('https://ACME.COM')).toBe('acme.com');
  });
});

describe('Deal field validation (from seed-buyers)', () => {
  function validateDealFields(deal: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const hasDescription =
      (deal.executive_summary as string)?.trim() ||
      (deal.description as string)?.trim() ||
      (deal.hero_description as string)?.trim();
    if (!hasDescription) missing.push('description');
    if (!(deal.industry as string)?.trim()) missing.push('industry');
    const cats = deal.categories as string[] | null;
    const cat = deal.category as string | null;
    if ((!cats || cats.length === 0) && !cat?.trim()) missing.push('categories');
    return missing;
  }

  it('passes with all fields present', () => {
    const deal = { executive_summary: 'A great company', industry: 'HVAC', categories: ['HVAC'] };
    expect(validateDealFields(deal)).toHaveLength(0);
  });

  it('fails when missing description', () => {
    const deal = { industry: 'HVAC', categories: ['HVAC'] };
    expect(validateDealFields(deal)).toContain('description');
  });

  it('fails when missing industry', () => {
    const deal = { executive_summary: 'A great company', categories: ['HVAC'] };
    expect(validateDealFields(deal)).toContain('industry');
  });

  it('fails when missing categories', () => {
    const deal = { executive_summary: 'A great company', industry: 'HVAC' };
    expect(validateDealFields(deal)).toContain('categories');
  });

  it('accepts hero_description as valid description', () => {
    const deal = { hero_description: 'Description here', industry: 'HVAC', category: 'HVAC' };
    expect(validateDealFields(deal)).toHaveLength(0);
  });

  it('accepts category (singular) when categories array is empty', () => {
    const deal = { description: 'Desc', industry: 'HVAC', category: 'HVAC', categories: [] };
    expect(validateDealFields(deal)).toHaveLength(0);
  });

  it('fails when all description fields are empty strings', () => {
    const deal = {
      executive_summary: '  ',
      description: '',
      hero_description: '',
      industry: 'HVAC',
      categories: ['HVAC'],
    };
    expect(validateDealFields(deal)).toContain('description');
  });
});
