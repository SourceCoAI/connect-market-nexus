/**
 * PromptTestRunner — In-app quality tester for lead memo and teaser prompts.
 *
 * Tests both full_memo and anonymous_teaser generation via the generate-lead-memo
 * edge function against real deals. Runs the same validation checks as the edge
 * function (structure, banned words, word count, anonymity) and displays the
 * generated content for manual review.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronRight,
  Copy,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ─── Validation (mirrors edge function logic) ────────────────────

interface MemoSection {
  key: string;
  title: string;
  content: string;
}

const FULL_MEMO_ALLOWED_SECTIONS = [
  'COMPANY OVERVIEW',
  'FINANCIAL SNAPSHOT',
  'SERVICES AND OPERATIONS',
  'OWNERSHIP AND TRANSACTION',
  'MANAGEMENT AND STAFFING',
  'KEY STRUCTURAL NOTES',
];

const TEASER_EXPECTED_SECTIONS = [
  'BUSINESS OVERVIEW',
  'DEAL SNAPSHOT',
  'KEY FACTS',
  'GROWTH CONTEXT',
  'OWNER OBJECTIVES',
];

const BANNED_WORDS = [
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
  'track record of success',
  'low-hanging fruit',
  'white-space',
  'blue-chip',
  'mission-critical',
  'sticky revenue',
  'tailwinds',
  'fragmented market',
  'recession-resistant',
  'top-tier',
  'premier',
  'best-of-breed',
  'defensible',
  'notable',
  'consistent',
  'solid',
  'substantial',
  'meaningful',
  'considerable',
  'positioned for',
  'well-established',
  'high-quality',
  'differentiated',
  'diversified',
  'platform opportunity',
  'significant opportunity',
  'value creation opportunity',
  'proven',
  'demonstrated',
  'healthy',
  'scalable',
  'deep bench',
  'runway',
];

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

const NOT_PROVIDED_PATTERNS = [
  /not provided/i,
  /not stated/i,
  /not confirmed/i,
  /not discussed/i,
  /not yet provided/i,
  /not available/i,
  /data not .{0,20}(provided|stated|available)/i,
  /information .{0,10}(unavailable|pending)/i,
];

interface QualityCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
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

function runFullMemoChecks(sections: MemoSection[], markdown: string): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const allContent = sections.map((s) => s.content).join(' ');
  const wordCount = allContent.split(/\s+/).filter(Boolean).length;

  // Required sections
  const hasCO = sections.some((s) => s.title.toUpperCase() === 'COMPANY OVERVIEW');
  checks.push({
    name: 'Required: COMPANY OVERVIEW',
    status: hasCO ? 'pass' : 'fail',
    detail: hasCO ? 'Present' : 'Missing required section',
  });

  // Unexpected sections
  const sectionTitles = sections.map((s) => s.title.toUpperCase().trim());
  const unexpected = sectionTitles.filter((t) => !FULL_MEMO_ALLOWED_SECTIONS.includes(t));
  checks.push({
    name: 'Section headers valid',
    status: unexpected.length === 0 ? 'pass' : 'fail',
    detail:
      unexpected.length === 0
        ? `${sectionTitles.length} sections, all valid`
        : `Unexpected: ${unexpected.join(', ')}`,
  });

  // Word count
  checks.push({
    name: 'Word count',
    status:
      wordCount > 1200 ? 'fail' : wordCount > 900 ? 'warn' : wordCount < 200 ? 'warn' : 'pass',
    detail: `${wordCount} words (limit: 1,200, ideal: 300-900)`,
  });

  // Banned placeholder phrases
  const foundPhrases = NOT_PROVIDED_PATTERNS.filter((p) => p.test(markdown));
  checks.push({
    name: 'No placeholder phrases',
    status: foundPhrases.length === 0 ? 'pass' : 'fail',
    detail:
      foundPhrases.length === 0
        ? 'No "not provided/stated/confirmed" language found'
        : `Found: ${foundPhrases.map((p) => p.source).join(', ')}`,
  });

  // Banned promotional words
  const foundBanned = BANNED_WORDS.filter((w) =>
    new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(markdown),
  );
  checks.push({
    name: 'No banned promotional words',
    status: foundBanned.length === 0 ? 'pass' : 'warn',
    detail:
      foundBanned.length === 0
        ? 'Clean — no promotional language detected'
        : `Found: ${foundBanned.join(', ')}`,
  });

  // Financial snapshot format
  const financialSection = markdown.match(/## FINANCIAL SNAPSHOT[\s\S]*?(?=## [A-Z]|$)/i);
  if (financialSection) {
    const hasTable = /\|.*\|.*\|/.test(financialSection[0]);
    checks.push({
      name: 'Financial snapshot format',
      status: hasTable ? 'fail' : 'pass',
      detail: hasTable
        ? 'Contains markdown table — should use simple labeled lines'
        : 'Simple labeled lines (correct)',
    });

    const hasDollar = /\$[\d,]+/.test(financialSection[0]);
    checks.push({
      name: 'Financial data present',
      status: hasDollar ? 'pass' : 'warn',
      detail: hasDollar ? 'Dollar amounts found' : 'No dollar amounts in financial snapshot',
    });
  }

  // Evaluative adjectives without nearby numbers
  const adjWarnings: string[] = [];
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
          adjWarnings.push(`"${adj}" in ${section.title}`);
        }
      }
    }
  }
  if (adjWarnings.length > 0) {
    checks.push({
      name: 'Evaluative adjectives',
      status: 'warn',
      detail: `Adjectives without nearby numbers: ${adjWarnings.slice(0, 5).join('; ')}${adjWarnings.length > 5 ? ` (+${adjWarnings.length - 5} more)` : ''}`,
    });
  }

  // Figure repetition across sections
  const figuresBySection = new Map<string, string[]>();
  for (const section of sections) {
    const figures = section.content.match(/\$[\d,.]+[KMBkmb]?|\d+(\.\d+)?%/g) || [];
    for (const fig of figures) {
      const existing = figuresBySection.get(fig);
      if (existing) existing.push(section.title);
      else figuresBySection.set(fig, [section.title]);
    }
  }
  const repeated = [...figuresBySection.entries()].filter(([, s]) => s.length > 1);
  if (repeated.length > 0) {
    checks.push({
      name: 'Figure repetition',
      status: 'warn',
      detail: repeated.map(([fig, secs]) => `${fig} in ${secs.join(', ')}`).join('; '),
    });
  }

  // Company overview is prose (not bullets)
  const coSection = sections.find((s) => s.title.toUpperCase() === 'COMPANY OVERVIEW');
  if (coSection) {
    const hasBullets = /^[-*]\s/m.test(coSection.content);
    checks.push({
      name: 'Company Overview is prose',
      status: hasBullets ? 'warn' : 'pass',
      detail: hasBullets
        ? 'Contains bullet points — should be 3-5 sentence paragraph'
        : 'Prose paragraph (correct)',
    });
  }

  // INFORMATION NOT YET PROVIDED section
  if (/information not yet provided/i.test(markdown)) {
    checks.push({
      name: 'No "Information Not Yet Provided" section',
      status: 'fail',
      detail: 'Contains forbidden language about missing information',
    });
  }

  return checks;
}

function runTeaserChecks(
  sections: MemoSection[],
  markdown: string,
  dealInfo?: {
    company_name?: string;
    main_contact_name?: string;
    address_city?: string;
    address_state?: string;
  },
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const allContent = sections.map((s) => s.content).join(' ');
  const wordCount = allContent.split(/\s+/).filter(Boolean).length;

  // Required sections
  const sectionTitles = sections.map((s) => s.title.toUpperCase().trim());
  for (const required of ['BUSINESS OVERVIEW', 'DEAL SNAPSHOT']) {
    const has = sectionTitles.includes(required);
    checks.push({
      name: `Required: ${required}`,
      status: has ? 'pass' : 'fail',
      detail: has ? 'Present' : 'Missing required section',
    });
  }

  // Unexpected sections
  const unexpected = sectionTitles.filter((t) => !TEASER_EXPECTED_SECTIONS.includes(t));
  checks.push({
    name: 'Section headers valid',
    status: unexpected.length === 0 ? 'pass' : 'fail',
    detail:
      unexpected.length === 0
        ? `${sectionTitles.length} sections, all valid`
        : `Unexpected: ${unexpected.join(', ')}`,
  });

  // Word count
  checks.push({
    name: 'Word count',
    status: wordCount > 600 ? 'fail' : wordCount > 500 ? 'warn' : wordCount < 100 ? 'warn' : 'pass',
    detail: `${wordCount} words (limit: 600, ideal: 300-500)`,
  });

  // Banned placeholder phrases
  const foundPhrases = NOT_PROVIDED_PATTERNS.filter((p) => p.test(markdown));
  checks.push({
    name: 'No placeholder phrases',
    status: foundPhrases.length === 0 ? 'pass' : 'fail',
    detail:
      foundPhrases.length === 0
        ? 'Clean'
        : `Found: ${foundPhrases.map((p) => p.source).join(', ')}`,
  });

  // Banned promotional words
  const foundBanned = BANNED_WORDS.filter((w) =>
    new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(markdown),
  );
  checks.push({
    name: 'No banned promotional words',
    status: foundBanned.length === 0 ? 'pass' : 'warn',
    detail: foundBanned.length === 0 ? 'Clean' : `Found: ${foundBanned.join(', ')}`,
  });

  // Anonymity checks
  if (dealInfo) {
    const breaches: string[] = [];
    const lowerMd = markdown.toLowerCase();

    if (dealInfo.company_name && dealInfo.company_name.length > 2) {
      if (lowerMd.includes(dealInfo.company_name.toLowerCase())) {
        breaches.push(`Company name "${dealInfo.company_name}"`);
      }
    }
    if (dealInfo.main_contact_name && dealInfo.main_contact_name.length > 2) {
      if (lowerMd.includes(dealInfo.main_contact_name.toLowerCase())) {
        breaches.push(`Owner name "${dealInfo.main_contact_name}"`);
      }
    }
    if (dealInfo.address_city && dealInfo.address_city.length > 2) {
      if (lowerMd.includes(dealInfo.address_city.toLowerCase())) {
        breaches.push(`City "${dealInfo.address_city}"`);
      }
    }
    // Check for full state names (not abbreviations)
    if (dealInfo.address_state) {
      const stateNames: Record<string, string> = {
        AL: 'Alabama',
        AK: 'Alaska',
        AZ: 'Arizona',
        AR: 'Arkansas',
        CA: 'California',
        CO: 'Colorado',
        CT: 'Connecticut',
        DE: 'Delaware',
        FL: 'Florida',
        GA: 'Georgia',
        HI: 'Hawaii',
        ID: 'Idaho',
        IL: 'Illinois',
        IN: 'Indiana',
        IA: 'Iowa',
        KS: 'Kansas',
        KY: 'Kentucky',
        LA: 'Louisiana',
        ME: 'Maine',
        MD: 'Maryland',
        MA: 'Massachusetts',
        MI: 'Michigan',
        MN: 'Minnesota',
        MS: 'Mississippi',
        MO: 'Missouri',
        MT: 'Montana',
        NE: 'Nebraska',
        NV: 'Nevada',
        NH: 'New Hampshire',
        NJ: 'New Jersey',
        NM: 'New Mexico',
        NY: 'New York',
        NC: 'North Carolina',
        ND: 'North Dakota',
        OH: 'Ohio',
        OK: 'Oklahoma',
        OR: 'Oregon',
        PA: 'Pennsylvania',
        RI: 'Rhode Island',
        SC: 'South Carolina',
        SD: 'South Dakota',
        TN: 'Tennessee',
        TX: 'Texas',
        UT: 'Utah',
        VT: 'Vermont',
        VA: 'Virginia',
        WA: 'Washington',
        WV: 'West Virginia',
        WI: 'Wisconsin',
        WY: 'Wyoming',
      };
      const fullName = stateNames[dealInfo.address_state.toUpperCase()];
      if (fullName && lowerMd.includes(fullName.toLowerCase())) {
        breaches.push(`State name "${fullName}"`);
      }
    }

    // Check for URLs
    if (/https?:\/\//.test(markdown)) {
      breaches.push('Contains URL');
    }
    // Check for email addresses
    if (/\S+@\S+\.\S+/.test(markdown)) {
      breaches.push('Contains email address');
    }

    checks.push({
      name: 'Anonymity',
      status: breaches.length === 0 ? 'pass' : 'fail',
      detail:
        breaches.length === 0
          ? 'No identifying information detected'
          : `BREACHES: ${breaches.join('; ')}`,
    });
  }

  // Business overview is prose (not bullets)
  const bo = sections.find((s) => s.title.toUpperCase() === 'BUSINESS OVERVIEW');
  if (bo) {
    const hasBullets = /^[-*]\s/m.test(bo.content);
    const sentenceCount = bo.content.split(/[.!?]+/).filter((s) => s.trim().length > 10).length;
    checks.push({
      name: 'Business Overview format',
      status: hasBullets ? 'warn' : sentenceCount > 4 ? 'warn' : 'pass',
      detail: hasBullets
        ? 'Contains bullets — should be 2-3 sentence prose'
        : `${sentenceCount} sentences (ideal: 2-3)`,
    });
  }

  return checks;
}

function computeScore(checks: QualityCheck[]): { score: number; label: string; color: string } {
  const total = checks.length;
  if (total === 0) return { score: 0, label: 'N/A', color: 'text-muted-foreground' };
  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const score = Math.round(((passed + warned * 0.5) / total) * 100);
  if (score >= 90) return { score, label: 'Excellent', color: 'text-green-700' };
  if (score >= 70) return { score, label: 'Good', color: 'text-green-600' };
  if (score >= 50) return { score, label: 'Fair', color: 'text-amber-600' };
  return { score, label: 'Poor', color: 'text-red-600' };
}

// ─── Types ───────────────────────────────────────────────────────

type MemoType = 'full_memo' | 'anonymous_teaser';

interface TestRun {
  memoType: MemoType;
  status: 'pending' | 'running' | 'pass' | 'warn' | 'fail';
  checks: QualityCheck[];
  markdown?: string;
  durationMs?: number;
  error?: string;
}

// ─── Component ─────────────────────────────────────────────────────

export default function PromptTestRunner() {
  const [dealId, setDealId] = useState('');
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [running, setRunning] = useState(false);
  const [expandedMarkdown, setExpandedMarkdown] = useState<Record<number, boolean>>({});

  // Fetch recent deals with memos for quick-pick
  const { data: recentDeals } = useQuery({
    queryKey: ['prompt-test-recent-deals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_memos')
        .select(
          'deal_id, memo_type, created_at, listings!lead_memos_deal_id_fkey(internal_company_name, title)',
        )
        .order('created_at', { ascending: false })
        .limit(20);

      // Deduplicate by deal_id and pick one with the most info
      const seen = new Map<
        string,
        { deal_id: string; name: string; hasFull: boolean; hasTeaser: boolean }
      >();
      for (const row of data || []) {
        const listing = row.listings as unknown as {
          internal_company_name?: string;
          title?: string;
        } | null;
        const name = listing?.internal_company_name || listing?.title || row.deal_id.slice(0, 8);
        const existing = seen.get(row.deal_id);
        if (existing) {
          if (row.memo_type === 'full_memo') existing.hasFull = true;
          if (row.memo_type === 'anonymous_teaser') existing.hasTeaser = true;
        } else {
          seen.set(row.deal_id, {
            deal_id: row.deal_id,
            name,
            hasFull: row.memo_type === 'full_memo',
            hasTeaser: row.memo_type === 'anonymous_teaser',
          });
        }
      }
      return [...seen.values()].slice(0, 8);
    },
  });

  const runTest = useCallback(
    async (targetDealId?: string) => {
      const id = (targetDealId || dealId).trim();
      if (!id) return;

      setRunning(true);
      setRuns([
        { memoType: 'full_memo', status: 'pending', checks: [] },
        { memoType: 'anonymous_teaser', status: 'pending', checks: [] },
      ]);
      setExpandedMarkdown({});

      // Fetch deal info for anonymity checks
      const { data: dealInfo } = await supabase
        .from('listings')
        .select(
          'internal_company_name, title, main_contact_name, address_city, address_state, website',
        )
        .eq('id', id)
        .single();

      const dealMeta = dealInfo
        ? {
            company_name: (dealInfo.internal_company_name || dealInfo.title || '') as string,
            main_contact_name: (dealInfo.main_contact_name || '') as string,
            address_city: (dealInfo.address_city || '') as string,
            address_state: (dealInfo.address_state || '') as string,
          }
        : undefined;

      // Run full memo test
      setRuns((prev) => prev.map((r, i) => (i === 0 ? { ...r, status: 'running' } : r)));

      const fullResult = await runSingleTest(id, 'full_memo');
      const fullChecks = fullResult.markdown
        ? runFullMemoChecks(parseMarkdownToSections(fullResult.markdown), fullResult.markdown)
        : [];
      const fullStatus = fullResult.error
        ? 'fail'
        : fullChecks.some((c) => c.status === 'fail')
          ? 'fail'
          : fullChecks.some((c) => c.status === 'warn')
            ? 'warn'
            : 'pass';

      setRuns((prev) =>
        prev.map((r, i) =>
          i === 0
            ? {
                ...r,
                status: fullStatus as TestRun['status'],
                checks: fullChecks,
                markdown: fullResult.markdown,
                durationMs: fullResult.durationMs,
                error: fullResult.error,
              }
            : r,
        ),
      );

      // Run teaser test
      setRuns((prev) => prev.map((r, i) => (i === 1 ? { ...r, status: 'running' } : r)));

      const teaserResult = await runSingleTest(id, 'anonymous_teaser');
      const teaserChecks = teaserResult.markdown
        ? runTeaserChecks(
            parseMarkdownToSections(teaserResult.markdown),
            teaserResult.markdown,
            dealMeta,
          )
        : [];
      const teaserStatus = teaserResult.error
        ? 'fail'
        : teaserChecks.some((c) => c.status === 'fail')
          ? 'fail'
          : teaserChecks.some((c) => c.status === 'warn')
            ? 'warn'
            : 'pass';

      setRuns((prev) =>
        prev.map((r, i) =>
          i === 1
            ? {
                ...r,
                status: teaserStatus as TestRun['status'],
                checks: teaserChecks,
                markdown: teaserResult.markdown,
                durationMs: teaserResult.durationMs,
                error: teaserResult.error,
              }
            : r,
        ),
      );

      setRunning(false);
    },
    [dealId],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Lead Memo Quality Tester
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Generates a full lead memo and anonymous teaser for a deal, then validates structure,
            banned language, word count, anonymity, and formatting. Shows the raw output for manual
            review.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Deal ID
              </label>
              <Input
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                placeholder="Paste deal UUID..."
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={() => runTest()} disabled={running || !dealId.trim()}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run Quality Test
            </Button>
          </div>

          {recentDeals && recentDeals.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Recent deals with memos
              </p>
              <div className="flex flex-wrap gap-2">
                {recentDeals.map((d) => (
                  <Button
                    key={d.deal_id}
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    disabled={running}
                    onClick={() => {
                      setDealId(d.deal_id);
                      runTest(d.deal_id);
                    }}
                  >
                    {d.name}
                    {d.hasFull && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        M
                      </Badge>
                    )}
                    {d.hasTeaser && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        T
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {runs.map((run, idx) => (
        <MemoTestCard
          key={`${run.memoType}-${idx}`}
          run={run}
          expanded={!!expandedMarkdown[idx]}
          onToggleExpand={() => setExpandedMarkdown((prev) => ({ ...prev, [idx]: !prev[idx] }))}
        />
      ))}
    </div>
  );
}

// ─── Edge function call ──────────────────────────────────────────

async function runSingleTest(
  dealId: string,
  memoType: MemoType,
): Promise<{ markdown?: string; durationMs: number; error?: string }> {
  const start = performance.now();
  try {
    const { data, error } = await supabase.functions.invoke('generate-lead-memo', {
      body: { deal_id: dealId, memo_type: memoType, branding: 'sourceco' },
    });

    const durationMs = Math.round(performance.now() - start);

    if (error) {
      return { durationMs, error: error.message || 'Edge function error' };
    }

    // The response contains the saved memo record; extract markdown from content.sections
    const result = data as Record<string, unknown> | null;
    const memoRecord = memoType === 'full_memo' ? result?.full_memo : result?.anonymous_teaser;
    const content = (memoRecord as Record<string, unknown>)?.content as {
      sections?: MemoSection[];
    } | null;

    if (!content?.sections?.length) {
      return { durationMs, error: 'No sections returned from generation' };
    }

    const markdown = content.sections
      .filter((s) => s.key !== 'header_block' && s.key !== 'contact_information')
      .map((s) => `## ${s.title}\n${s.content}`)
      .join('\n\n');

    return { markdown, durationMs };
  } catch (err) {
    return {
      durationMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Result card ─────────────────────────────────────────────────

function MemoTestCard({
  run,
  expanded,
  onToggleExpand,
}: {
  run: TestRun;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const label = run.memoType === 'full_memo' ? 'Full Lead Memo' : 'Anonymous Teaser';
  const score = computeScore(run.checks);

  const statusIcon = (status: TestRun['status'] | QualityCheck['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  const copyMarkdown = () => {
    if (run.markdown) {
      navigator.clipboard.writeText(run.markdown);
      toast.success('Copied memo markdown');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {statusIcon(run.status)}
            {label}
            {run.durationMs != null && (
              <span className="text-xs text-muted-foreground font-normal">
                {(run.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {run.checks.length > 0 && (
              <span className={`text-sm font-semibold ${score.color}`}>
                {score.score}% {score.label}
              </span>
            )}
            <Badge
              variant="secondary"
              className={
                run.status === 'pass'
                  ? 'bg-green-100 text-green-800'
                  : run.status === 'warn'
                    ? 'bg-amber-100 text-amber-800'
                    : run.status === 'fail'
                      ? 'bg-red-100 text-red-800'
                      : ''
              }
            >
              {run.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {run.error && (
          <p className="text-xs text-red-600 bg-red-50 p-2 rounded">Error: {run.error}</p>
        )}

        {/* Quality checks */}
        {run.checks.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Quality Checks ({run.checks.filter((c) => c.status === 'pass').length}/
              {run.checks.length} passed)
            </p>
            {run.checks.map((check, ci) => (
              <div
                key={ci}
                className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                  check.status === 'fail'
                    ? 'bg-red-50/70'
                    : check.status === 'warn'
                      ? 'bg-amber-50/70'
                      : 'bg-green-50/50'
                }`}
              >
                {statusIcon(check.status)}
                <div className="min-w-0">
                  <span className="font-medium">{check.name}</span>
                  <span className="text-muted-foreground ml-1.5">{check.detail}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Generated memo content */}
        {run.markdown && (
          <Collapsible open={expanded} onOpenChange={onToggleExpand}>
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                  {expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {expanded ? 'Hide' : 'Show'} generated content
                </Button>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={copyMarkdown}
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            </div>
            <CollapsibleContent>
              <ScrollArea className="max-h-[500px] mt-2">
                <pre className="text-xs whitespace-pre-wrap bg-muted/50 p-4 rounded-lg border font-mono leading-relaxed">
                  {run.markdown}
                </pre>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
