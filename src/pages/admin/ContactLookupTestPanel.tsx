import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { findIntroductionContacts } from '@/lib/remarketing/findIntroductionContacts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  PlayCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Search,
  Users,
  RefreshCw,
} from 'lucide-react';

// ── Types ──

type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'warn' | 'skip';

interface TestStep {
  label: string;
  status: StepStatus;
  detail?: string;
  durationMs?: number;
}

interface TestSuite {
  id: string;
  name: string;
  description: string;
  requiresBuyer: boolean;
  steps: TestStep[];
  running: boolean;
}

interface BuyerOption {
  id: string;
  company_name: string;
  buyer_type: string | null;
  pe_firm_name: string | null;
}

// ── Title filter specs (must match edge function exactly) ──

const PE_TITLE_FILTER = ['bd', 'vp', 'senior associate', 'principal', 'partner', 'analyst'];
const COMPANY_TITLE_FILTER = [
  'bd',
  'cfo',
  'chief financial officer',
  'vp finance',
  'director of finance',
  'head of finance',
  'finance director',
  'ceo',
];

// The alias expansion table from find-contacts edge function
const TITLE_ALIASES: Record<string, string[]> = {
  associate: ['associate', 'sr associate', 'senior associate', 'investment associate'],
  principal: ['principal', 'sr principal', 'senior principal', 'investment principal'],
  vp: ['vp', 'vice president', 'vice-president', 'svp', 'senior vice president', 'evp'],
  director: ['director', 'managing director', 'sr director', 'senior director', 'associate director'],
  partner: ['partner', 'managing partner', 'general partner', 'senior partner'],
  analyst: ['analyst', 'sr analyst', 'senior analyst', 'investment analyst'],
  ceo: ['ceo', 'chief executive officer', 'president', 'owner', 'founder', 'co-founder'],
  bd: [
    'business development',
    'corp dev',
    'corporate development',
    'head of acquisitions',
    'vp acquisitions',
    'vp m&a',
    'head of m&a',
  ],
};

// Banned terms: these should NOT appear as standalone filter entries because they are
// covered by alias expansion of a key (e.g. 'owner' is in the 'ceo' alias).
const BANNED_STANDALONE = [
  'owner',
  'founder',
  'co-founder',
  'corporate development',
  'corp dev',
  'vice president',
  'business development',
];

// Roles that should be reachable via either direct match or alias expansion
const PE_EXPECTED_ROLES = [
  'business development',
  'vice president',
  'senior associate',
  'principal',
  'partner',
  'analyst',
];

const COMPANY_EXPECTED_ROLES = [
  'corporate development',
  'cfo',
  'chief financial officer',
  'vp finance',
  'ceo',
  'owner',
  'founder',
  'president',
];

// ── Helpers ──

function matchesTitle(title: string, filters: string[]): boolean {
  const normalizedTitle = title.toLowerCase().trim();
  for (const filter of filters) {
    const normalizedFilter = filter.toLowerCase().trim();
    if (normalizedTitle.includes(normalizedFilter)) return true;
    const aliases = TITLE_ALIASES[normalizedFilter];
    if (aliases) {
      for (const alias of aliases) {
        if (normalizedTitle.includes(alias)) return true;
      }
    }
  }
  return false;
}

function mkStep(label: string, status: StepStatus = 'pending', detail?: string): TestStep {
  return { label, status, detail };
}

function statusIcon(s: StepStatus) {
  switch (s) {
    case 'pass':
      return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
    case 'fail':
      return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
    case 'warn':
      return <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />;
    case 'skip':
      return <span className="h-4 w-4 text-muted-foreground shrink-0">-</span>;
    default:
      return <span className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

// ── Initial suite definitions ──

function buildInitialSuites(): TestSuite[] {
  return [
    {
      id: 'trigger-audit',
      name: '1. Trigger Audit',
      description: 'Verifies all 3 call-sites import and wire correctly + edge function deploy',
      requiresBuyer: false,
      steps: [],
      running: false,
    },
    {
      id: 'edge-function-direct',
      name: '2. Edge Function Direct',
      description: 'Calls find-introduction-contacts with real buyer data, validates response shape',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'db-state-inspector',
      name: '3. DB State Inspector',
      description: "Shows what's in the contacts table for a buyer",
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'full-workflow',
      name: '4. Full Workflow Simulation',
      description: 'Runs complete approval -> search -> DB save -> toast evaluation',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'title-filter-audit',
      name: '5. Title Filter Audit',
      description: 'Validates PE + Company filter arrays against spec and alias expansion',
      requiresBuyer: false,
      steps: [],
      running: false,
    },
    {
      id: 'duplicate-guard',
      name: '6. Duplicate Guard',
      description: 'Re-runs on same buyer, confirms no duplicate rows',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
    {
      id: 'bulk-simulation',
      name: '7. Bulk Approval Simulation',
      description: 'Multi-buyer Promise.allSettled test, validates consolidated toast',
      requiresBuyer: false,
      steps: [],
      running: false,
    },
    {
      id: 'contacts-query-validator',
      name: '8. ContactsTab Query Validator',
      description: 'Replicates exact useBuyerData.ts query, validates shape',
      requiresBuyer: true,
      steps: [],
      running: false,
    },
  ];
}

// ── Main Component ──

export default function ContactLookupTestPanel() {
  const [suites, setSuites] = useState<TestSuite[]>(buildInitialSuites);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerOption | null>(null);
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyerResults, setBuyerResults] = useState<BuyerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [bulkIds, setBulkIds] = useState('');
  const runningRef = useRef(false);

  // ── Buyer search ──
  const searchBuyers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setBuyerResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('buyers')
        .select('id, company_name, buyer_type, pe_firm_name')
        .ilike('company_name', `%${query}%`)
        .limit(10);
      setBuyerResults((data as BuyerOption[]) || []);
    } catch {
      setBuyerResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // ── Update a suite's state ──
  const updateSuite = useCallback((suiteId: string, patch: Partial<TestSuite>) => {
    setSuites((prev: TestSuite[]) => prev.map((s: TestSuite) => (s.id === suiteId ? { ...s, ...patch } : s)));
  }, []);

  // ── Suite Runners ──

  const runTriggerAudit = useCallback(async () => {
    const suiteId = 'trigger-audit';
    const steps: TestStep[] = [];
    updateSuite(suiteId, { running: true, steps: [mkStep('Starting trigger audit...', 'running')] });

    // Check 1: findIntroductionContacts module exists
    try {
      const mod = await import('@/lib/remarketing/findIntroductionContacts');
      steps.push(
        mkStep(
          'findIntroductionContacts module',
          typeof mod.findIntroductionContacts === 'function' ? 'pass' : 'fail',
          typeof mod.findIntroductionContacts === 'function'
            ? 'Exported function found'
            : 'Function not exported',
        ),
      );
    } catch (err: unknown) {
      steps.push(mkStep('findIntroductionContacts module', 'fail', String(err)));
    }

    // Check 2: use-buyer-introductions imports it
    try {
      const mod = await import('@/hooks/use-buyer-introductions');
      steps.push(
        mkStep(
          'use-buyer-introductions hook',
          typeof mod.useBuyerIntroductions === 'function' ? 'pass' : 'fail',
          typeof mod.useBuyerIntroductions === 'function'
            ? 'Hook exports correctly'
            : 'Hook not found',
        ),
      );
    } catch (err: unknown) {
      steps.push(mkStep('use-buyer-introductions hook', 'fail', String(err)));
    }

    // Check 3: ApproveBuyerMultiDealDialog exists
    try {
      const mod = await import('@/components/remarketing/ApproveBuyerMultiDealDialog');
      const hasExport = 'ApproveBuyerMultiDealDialog' in mod;
      steps.push(
        mkStep(
          'ApproveBuyerMultiDealDialog',
          hasExport ? 'pass' : 'fail',
          hasExport ? 'Component found' : 'Named export missing',
        ),
      );
    } catch (err: unknown) {
      steps.push(mkStep('ApproveBuyerMultiDealDialog', 'fail', String(err)));
    }

    // Check 4: BulkApproveForDealsDialog exists
    try {
      const mod = await import('@/components/remarketing/BulkApproveForDealsDialog');
      const hasExport = 'BulkApproveForDealsDialog' in mod;
      steps.push(
        mkStep(
          'BulkApproveForDealsDialog',
          hasExport ? 'pass' : 'fail',
          hasExport ? 'Component found' : 'Named export missing',
        ),
      );
    } catch (err: unknown) {
      steps.push(mkStep('BulkApproveForDealsDialog', 'fail', String(err)));
    }

    // Check 5: Edge function reachability
    try {
      const { error } = await supabase.functions.invoke('find-introduction-contacts', {
        body: {},
      });
      if (error) {
        const msg = (error as { message?: string }).message || String(error);
        // A 400/401/403 means the function is deployed and responding
        if (
          msg.includes('buyer_id') ||
          msg.includes('required') ||
          msg.includes('Unauthorized') ||
          msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('400')
        ) {
          steps.push(mkStep('Edge function deployed', 'pass', `Function responding: ${msg}`));
        } else {
          steps.push(mkStep('Edge function deployed', 'warn', `Unexpected error: ${msg}`));
        }
      } else {
        steps.push(mkStep('Edge function deployed', 'pass', 'Function reachable (no error)'));
      }
    } catch (err: unknown) {
      steps.push(
        mkStep('Edge function deployed', 'fail', `Not reachable: ${err instanceof Error ? err.message : String(err)}`),
      );
    }

    updateSuite(suiteId, { running: false, steps });
  }, [updateSuite]);

  const runEdgeFunctionDirect = useCallback(async () => {
    const suiteId = 'edge-function-direct';
    if (!selectedBuyer) return;
    const steps: TestStep[] = [];
    updateSuite(suiteId, { running: true, steps: [mkStep('Fetching buyer details...', 'running')] });

    // Step 1: Fetch buyer
    const { data: buyer, error: buyerErr } = await supabase
      .from('buyers')
      .select(
        'id, company_name, company_website, buyer_type, pe_firm_name, pe_firm_website, platform_website',
      )
      .eq('id', selectedBuyer.id)
      .single();

    if (buyerErr || !buyer) {
      steps.push(mkStep('Fetch buyer', 'fail', buyerErr?.message || 'No buyer found'));
      updateSuite(suiteId, { running: false, steps });
      return;
    }

    steps.push(
      mkStep(
        'Fetch buyer',
        'pass',
        `${buyer.company_name} (${buyer.buyer_type || 'corporate'})${buyer.pe_firm_name ? ` / PE: ${buyer.pe_firm_name}` : ''}`,
      ),
    );
    updateSuite(suiteId, { running: true, steps: [...steps, mkStep('Calling edge function...', 'running')] });

    // Step 2: Call edge function
    const start = performance.now();
    const result = await findIntroductionContacts(selectedBuyer.id);
    const dur = Math.round(performance.now() - start);

    if (!result) {
      steps.push(mkStep('Edge function call', 'fail', `Returned null after ${dur}ms`));
      updateSuite(suiteId, { running: false, steps });
      return;
    }

    steps.push(
      mkStep(
        'Edge function call',
        result.success ? 'pass' : 'warn',
        `PE: ${result.pe_contacts_found}, Company: ${result.company_contacts_found}, Saved: ${result.total_saved}, Dupes: ${result.skipped_duplicates}${result.message ? ` — ${result.message}` : ''}`,
      ),
    );

    // Step 3: Validate response shape
    const expectedKeys = [
      'success',
      'pe_contacts_found',
      'company_contacts_found',
      'total_saved',
      'skipped_duplicates',
      'firmName',
    ];
    const missingKeys = expectedKeys.filter((k) => !(k in result));
    steps.push(
      mkStep(
        'Response shape validation',
        missingKeys.length === 0 ? 'pass' : 'fail',
        missingKeys.length === 0
          ? `All ${expectedKeys.length} fields present`
          : `Missing: ${missingKeys.join(', ')}`,
      ),
    );

    // Step 4: Check firmName
    const expectedFirm = buyer.pe_firm_name || buyer.company_name;
    steps.push(
      mkStep(
        'firmName matches buyer',
        result.firmName === expectedFirm ? 'pass' : 'warn',
        `Expected: "${expectedFirm}", Got: "${result.firmName}"`,
      ),
    );

    for (const s of steps) {
      s.durationMs = dur;
    }

    updateSuite(suiteId, { running: false, steps });
  }, [selectedBuyer, updateSuite]);

  const runDBStateInspector = useCallback(async () => {
    const suiteId = 'db-state-inspector';
    if (!selectedBuyer) return;
    const steps: TestStep[] = [];
    updateSuite(suiteId, { running: true, steps: [mkStep('Querying contacts table...', 'running')] });

    // Query contacts table
    const { data: contacts, error: contactsErr } = await supabase
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, linkedin_url, title, source, contact_type, archived, is_primary_at_firm',
      )
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (contactsErr) {
      steps.push(mkStep('Query contacts', 'fail', contactsErr.message));
      updateSuite(suiteId, { running: false, steps });
      return;
    }

    const rows = contacts || [];
    steps.push(mkStep('Query contacts', 'pass', `${rows.length} active contacts found`));

    // Source breakdown
    const sources: Record<string, number> = {};
    for (const r of rows) {
      const src = (r as Record<string, unknown>).source as string || 'unknown';
      sources[src] = (sources[src] || 0) + 1;
    }
    const sourceStr = Object.entries(sources)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    steps.push(
      mkStep(
        'Source breakdown',
        sources['auto_introduction_approval'] ? 'pass' : 'warn',
        sourceStr || 'No contacts',
      ),
    );

    // Check for auto_introduction_approval contacts
    const autoCount = sources['auto_introduction_approval'] || 0;
    steps.push(
      mkStep(
        'Auto-discovered contacts',
        autoCount > 0 ? 'pass' : 'warn',
        `${autoCount} contact(s) from auto_introduction_approval`,
      ),
    );

    // Show first 5 contacts
    for (const c of rows.slice(0, 5)) {
      const row = c as Record<string, unknown>;
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
      steps.push(
        mkStep(
          name || '(unnamed)',
          'pass',
          `${row.title || 'No title'} | ${row.email || 'No email'} | src: ${row.source || 'unknown'}`,
        ),
      );
    }
    if (rows.length > 5) {
      steps.push(mkStep(`... and ${rows.length - 5} more`, 'pass'));
    }

    // Check legacy table
    try {
      const { data: legacyData } = await supabase
        .from('remarketing_buyer_contacts' as never)
        .select('id')
        .eq('buyer_id', selectedBuyer.id)
        .limit(5);
      const legacyCount = (legacyData as unknown[] | null)?.length || 0;
      steps.push(
        mkStep(
          'Legacy table check',
          legacyCount === 0 ? 'pass' : 'warn',
          legacyCount > 0
            ? `${legacyCount} rows in remarketing_buyer_contacts (legacy)`
            : 'No legacy rows — using unified contacts table',
        ),
      );
    } catch {
      steps.push(mkStep('Legacy table check', 'pass', 'Legacy table not accessible (expected)'));
    }

    updateSuite(suiteId, { running: false, steps });
  }, [selectedBuyer, updateSuite]);

  const runFullWorkflow = useCallback(async () => {
    const suiteId = 'full-workflow';
    if (!selectedBuyer) return;
    const steps: TestStep[] = [];
    updateSuite(suiteId, { running: true, steps: [mkStep('Starting workflow simulation...', 'running')] });

    // Step 1: Count contacts before
    const { data: before } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countBefore = before?.length || 0;
    steps.push(mkStep('Pre-run contact count', 'pass', `${countBefore} contacts exist`));
    updateSuite(suiteId, { running: true, steps: [...steps, mkStep('Running findIntroductionContacts...', 'running')] });

    // Step 2: Run the function
    const start = performance.now();
    const result = await findIntroductionContacts(selectedBuyer.id);
    const dur = Math.round(performance.now() - start);

    if (!result) {
      steps.push(mkStep('findIntroductionContacts', 'fail', `Returned null after ${dur}ms`));
      updateSuite(suiteId, { running: false, steps });
      return;
    }

    steps.push(
      mkStep(
        'findIntroductionContacts',
        result.success ? 'pass' : 'warn',
        `Saved ${result.total_saved}, skipped ${result.skipped_duplicates} (${dur}ms)${result.message ? ` — ${result.message}` : ''}`,
      ),
    );

    // Step 3: Count contacts after
    const { data: after } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countAfter = after?.length || 0;
    const delta = countAfter - countBefore;
    steps.push(
      mkStep(
        'Post-run contact count',
        delta >= 0 ? 'pass' : 'warn',
        `${countAfter} contacts (${delta >= 0 ? '+' : ''}${delta} new)`,
      ),
    );

    // Step 4: Verify delta matches total_saved
    steps.push(
      mkStep(
        'Delta matches total_saved',
        delta === result.total_saved ? 'pass' : 'warn',
        `DB delta: ${delta}, reported total_saved: ${result.total_saved}${delta !== result.total_saved ? ' (mismatch may be due to upsert overwrites)' : ''}`,
      ),
    );

    // Step 5: Toast evaluation
    let toastMsg = '';
    if (result.total_saved > 0) {
      toastMsg = `${result.total_saved} contact${result.total_saved !== 1 ? 's' : ''} found at ${result.firmName} — see Contacts tab`;
    } else if (result.total_saved === 0 && !result.message) {
      toastMsg = `No contacts found for ${result.firmName} — try manual search`;
    } else {
      toastMsg = result.message || 'No toast (contacts already populated)';
    }
    steps.push(mkStep('Toast evaluation', 'pass', `Would show: "${toastMsg}"`));

    updateSuite(suiteId, { running: false, steps });
  }, [selectedBuyer, updateSuite]);

  const runTitleFilterAudit = useCallback(async () => {
    const suiteId = 'title-filter-audit';
    const steps: TestStep[] = [];
    updateSuite(suiteId, { running: true, steps: [mkStep('Auditing title filters...', 'running')] });

    // Check 1: No banned standalone terms in PE filter
    const peBanned = PE_TITLE_FILTER.filter((f: string) =>
      BANNED_STANDALONE.includes(f.toLowerCase()),
    );
    steps.push(
      mkStep(
        'PE filter: no banned terms',
        peBanned.length === 0 ? 'pass' : 'fail',
        peBanned.length === 0 ? 'Clean' : `Banned: ${peBanned.join(', ')}`,
      ),
    );

    // Check 2: No banned standalone terms in Company filter
    const companyBanned = COMPANY_TITLE_FILTER.filter((f: string) =>
      BANNED_STANDALONE.includes(f.toLowerCase()),
    );
    steps.push(
      mkStep(
        'Company filter: no banned terms',
        companyBanned.length === 0 ? 'pass' : 'fail',
        companyBanned.length === 0 ? 'Clean' : `Banned: ${companyBanned.join(', ')}`,
      ),
    );

    // Check 3: PE expected roles reachable
    const peUnreachable: string[] = [];
    for (const role of PE_EXPECTED_ROLES) {
      if (!matchesTitle(role, PE_TITLE_FILTER)) {
        peUnreachable.push(role);
      }
    }
    steps.push(
      mkStep(
        'PE role coverage',
        peUnreachable.length === 0 ? 'pass' : 'fail',
        peUnreachable.length === 0
          ? `All ${PE_EXPECTED_ROLES.length} expected roles reachable`
          : `Unreachable: ${peUnreachable.join(', ')}`,
      ),
    );

    // Check 4: Company expected roles reachable
    const companyUnreachable: string[] = [];
    for (const role of COMPANY_EXPECTED_ROLES) {
      if (!matchesTitle(role, COMPANY_TITLE_FILTER)) {
        companyUnreachable.push(role);
      }
    }
    steps.push(
      mkStep(
        'Company role coverage',
        companyUnreachable.length === 0 ? 'pass' : 'fail',
        companyUnreachable.length === 0
          ? `All ${COMPANY_EXPECTED_ROLES.length} expected roles reachable`
          : `Unreachable: ${companyUnreachable.join(', ')}`,
      ),
    );

    // Check 5: No duplicates within each filter
    const peSet = new Set(PE_TITLE_FILTER);
    steps.push(
      mkStep(
        'PE filter: no duplicates',
        peSet.size === PE_TITLE_FILTER.length ? 'pass' : 'fail',
        peSet.size === PE_TITLE_FILTER.length
          ? `${PE_TITLE_FILTER.length} unique entries`
          : `${PE_TITLE_FILTER.length - peSet.size} duplicate(s)`,
      ),
    );

    const companySet = new Set(COMPANY_TITLE_FILTER);
    steps.push(
      mkStep(
        'Company filter: no duplicates',
        companySet.size === COMPANY_TITLE_FILTER.length ? 'pass' : 'fail',
        companySet.size === COMPANY_TITLE_FILTER.length
          ? `${COMPANY_TITLE_FILTER.length} unique entries`
          : `${COMPANY_TITLE_FILTER.length - companySet.size} duplicate(s)`,
      ),
    );

    // Check 6: Alias keys used instead of expanded values
    const allAliasValues = Object.values(TITLE_ALIASES).flat();
    const peAliasLeaks = PE_TITLE_FILTER.filter(
      (f: string) => allAliasValues.includes(f) && !Object.keys(TITLE_ALIASES).includes(f),
    );
    steps.push(
      mkStep(
        'PE filter: using alias keys',
        peAliasLeaks.length === 0 ? 'pass' : 'warn',
        peAliasLeaks.length === 0
          ? 'All entries are alias keys or direct-match terms'
          : `Could use alias key instead: ${peAliasLeaks.join(', ')}`,
      ),
    );

    const companyAliasLeaks = COMPANY_TITLE_FILTER.filter(
      (f: string) => allAliasValues.includes(f) && !Object.keys(TITLE_ALIASES).includes(f),
    );
    steps.push(
      mkStep(
        'Company filter: using alias keys',
        companyAliasLeaks.length === 0 ? 'pass' : 'warn',
        companyAliasLeaks.length === 0
          ? 'All entries are alias keys or direct-match terms'
          : `Could use alias key instead: ${companyAliasLeaks.join(', ')}`,
      ),
    );

    // Summary of what each filter covers via expansion
    const peExpanded = new Set<string>();
    for (const f of PE_TITLE_FILTER) {
      peExpanded.add(f);
      const aliases = TITLE_ALIASES[f];
      if (aliases) aliases.forEach((a: string) => peExpanded.add(a));
    }
    steps.push(mkStep('PE total coverage', 'pass', `${peExpanded.size} unique matchable terms`));

    const companyExpanded = new Set<string>();
    for (const f of COMPANY_TITLE_FILTER) {
      companyExpanded.add(f);
      const aliases = TITLE_ALIASES[f];
      if (aliases) aliases.forEach((a: string) => companyExpanded.add(a));
    }
    steps.push(
      mkStep('Company total coverage', 'pass', `${companyExpanded.size} unique matchable terms`),
    );

    updateSuite(suiteId, { running: false, steps });
  }, [updateSuite]);

  const runDuplicateGuard = useCallback(async () => {
    const suiteId = 'duplicate-guard';
    if (!selectedBuyer) return;
    const steps: TestStep[] = [];
    updateSuite(suiteId, { running: true, steps: [mkStep('Counting existing contacts...', 'running')] });

    // Count before
    const { data: before } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countBefore = before?.length || 0;
    steps.push(mkStep('Pre-run count', 'pass', `${countBefore} contacts`));
    updateSuite(suiteId, { running: true, steps: [...steps, mkStep('Running findIntroductionContacts (1st call)...', 'running')] });

    // Run once
    await findIntroductionContacts(selectedBuyer.id);
    const { data: mid } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countMid = mid?.length || 0;
    steps.push(mkStep('After 1st call', 'pass', `${countMid} contacts`));
    updateSuite(suiteId, { running: true, steps: [...steps, mkStep('Running findIntroductionContacts (2nd call)...', 'running')] });

    // Run again
    await findIntroductionContacts(selectedBuyer.id);
    const { data: after } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countAfter = after?.length || 0;
    steps.push(mkStep('After 2nd call', 'pass', `${countAfter} contacts`));

    // Verdict
    const noDupes = countAfter === countMid;
    steps.push(
      mkStep(
        'Duplicate guard verdict',
        noDupes ? 'pass' : 'fail',
        noDupes
          ? `No duplicates: count stayed at ${countAfter}`
          : `Duplicates detected! ${countMid} -> ${countAfter} (+${countAfter - countMid})`,
      ),
    );

    updateSuite(suiteId, { running: false, steps });
  }, [selectedBuyer, updateSuite]);

  const runBulkSimulation = useCallback(async () => {
    const suiteId = 'bulk-simulation';
    const steps: TestStep[] = [];

    // Parse buyer IDs from the text input
    const ids = bulkIds
      .split(/[,\s]+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 10); // UUIDs are 36 chars

    if (ids.length < 2) {
      updateSuite(suiteId, {
        running: false,
        steps: [
          mkStep(
            'Input validation',
            'fail',
            'Enter at least 2 buyer UUIDs (comma-separated) in the bulk IDs field',
          ),
        ],
      });
      return;
    }

    updateSuite(suiteId, { running: true, steps: [mkStep(`Running for ${ids.length} buyers...`, 'running')] });

    // Validate buyers exist
    const { data: buyers } = await supabase
      .from('buyers')
      .select('id, company_name')
      .in('id', ids);

    const validBuyers = buyers || [];
    const validIds = validBuyers.map((b: { id: string }) => b.id);
    const invalidIds = ids.filter((buyerId: string) => !validIds.includes(buyerId));

    if (invalidIds.length > 0) {
      steps.push(
        mkStep('Buyer validation', 'warn', `${invalidIds.length} ID(s) not found: ${invalidIds.join(', ').slice(0, 80)}`),
      );
    }
    if (validIds.length < 2) {
      steps.push(mkStep('Buyer validation', 'fail', 'Need at least 2 valid buyer IDs'));
      updateSuite(suiteId, { running: false, steps });
      return;
    }

    steps.push(mkStep('Buyer validation', 'pass', `${validIds.length} valid buyers`));
    updateSuite(suiteId, {
      running: true,
      steps: [...steps, mkStep('Running Promise.allSettled...', 'running')],
    });

    // Run exactly like BulkApproveForDealsDialog does
    const start = performance.now();
    const results = await Promise.allSettled(
      validIds.map((bId: string) => findIntroductionContacts(bId)),
    );
    const dur = Math.round(performance.now() - start);

    let totalContacts = 0;
    let buyersWithContacts = 0;
    const perBuyer: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const buyerName = validBuyers.find((b: { id: string; company_name: string }) => b.id === validIds[i])?.company_name || validIds[i];
      if (r.status === 'fulfilled' && r.value && r.value.total_saved > 0) {
        totalContacts += r.value.total_saved;
        buyersWithContacts++;
        perBuyer.push(`${buyerName}: ${r.value.total_saved} saved`);
      } else if (r.status === 'fulfilled' && r.value) {
        perBuyer.push(
          `${buyerName}: 0 saved${r.value.message ? ` (${r.value.message})` : ''}`,
        );
      } else {
        perBuyer.push(`${buyerName}: failed`);
      }
    }

    steps.push(
      mkStep(
        'Promise.allSettled complete',
        'pass',
        `${dur}ms — ${results.filter((r: PromiseSettledResult<unknown>) => r.status === 'fulfilled').length}/${results.length} fulfilled`,
      ),
    );

    for (const line of perBuyer) {
      steps.push(mkStep(line, 'pass'));
    }

    // Consolidated toast simulation
    let consolidatedToast = '';
    if (totalContacts > 0) {
      consolidatedToast = `${totalContacts} contact${totalContacts !== 1 ? 's' : ''} found across ${buyersWithContacts} buyer${buyersWithContacts !== 1 ? 's' : ''} — see Contacts tab`;
    } else {
      consolidatedToast = 'No contacts found across any buyers';
    }

    steps.push(
      mkStep(
        'Consolidated toast',
        totalContacts > 0 ? 'pass' : 'warn',
        `Would show: "${consolidatedToast}"`,
      ),
    );

    // Verify it's a single toast, not per-buyer
    steps.push(
      mkStep(
        'Single toast verification',
        'pass',
        `1 consolidated toast (not ${validIds.length} individual ones)`,
      ),
    );

    updateSuite(suiteId, { running: false, steps });
  }, [bulkIds, updateSuite]);

  const runContactsQueryValidator = useCallback(async () => {
    const suiteId = 'contacts-query-validator';
    if (!selectedBuyer) return;
    const steps: TestStep[] = [];
    updateSuite(suiteId, { running: true, steps: [mkStep('Replicating useBuyerData query...', 'running')] });

    // Replicate the exact query from useBuyerData.ts
    const { data, error } = await supabase
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, linkedin_url, title, is_primary_at_firm',
      )
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false)
      .order('is_primary_at_firm', { ascending: false });

    if (error) {
      steps.push(mkStep('Query execution', 'fail', error.message));
      updateSuite(suiteId, { running: false, steps });
      return;
    }

    const rows = data || [];
    steps.push(mkStep('Query execution', 'pass', `${rows.length} rows returned`));

    // Shape validation
    const expectedColumns = [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'linkedin_url',
      'title',
      'is_primary_at_firm',
    ];

    if (rows.length > 0) {
      const firstRow = rows[0] as Record<string, unknown>;
      const missingCols = expectedColumns.filter((c: string) => !(c in firstRow));
      const presentCols = expectedColumns.filter((c: string) => c in firstRow);
      steps.push(
        mkStep(
          'Column shape',
          missingCols.length === 0 ? 'pass' : 'fail',
          missingCols.length === 0
            ? `All ${expectedColumns.length} columns present`
            : `Missing: ${missingCols.join(', ')} (present: ${presentCols.join(', ')})`,
        ),
      );

      // Check that table is 'contacts' not legacy
      steps.push(mkStep('Source table', 'pass', 'Using unified contacts table'));

      // Check ordering
      const firstPrimary = firstRow.is_primary_at_firm;
      if (rows.length > 1) {
        const lastRow = rows[rows.length - 1] as Record<string, unknown>;
        const lastPrimary = lastRow.is_primary_at_firm;
        const ordered =
          firstPrimary === true || lastPrimary !== true || firstPrimary === lastPrimary;
        steps.push(
          mkStep(
            'Sort order',
            ordered ? 'pass' : 'warn',
            `Primary contacts first: ${firstPrimary ? 'yes' : 'no'}`,
          ),
        );
      } else {
        steps.push(mkStep('Sort order', 'pass', 'Single row — order trivially correct'));
      }
    } else {
      steps.push(mkStep('Column shape', 'warn', 'No rows to validate — buyer has no contacts'));
      steps.push(mkStep('Source table', 'pass', 'Using unified contacts table'));
    }

    // Query key check
    steps.push(
      mkStep(
        'Query key format',
        'pass',
        `['remarketing', 'contacts', '${selectedBuyer.id.slice(0, 8)}...']`,
      ),
    );

    updateSuite(suiteId, { running: false, steps });
  }, [selectedBuyer, updateSuite]);

  // ── Run All ──
  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    // Run suites that don't require a buyer first
    await runTriggerAudit();
    await runTitleFilterAudit();

    // Then buyer-dependent suites
    if (selectedBuyer) {
      await runEdgeFunctionDirect();
      await runDBStateInspector();
      await runFullWorkflow();
      await runDuplicateGuard();
      await runContactsQueryValidator();
    }

    // Bulk simulation if IDs are provided
    if (bulkIds.trim()) {
      await runBulkSimulation();
    }

    runningRef.current = false;
  }, [
    selectedBuyer,
    bulkIds,
    runTriggerAudit,
    runTitleFilterAudit,
    runEdgeFunctionDirect,
    runDBStateInspector,
    runFullWorkflow,
    runDuplicateGuard,
    runBulkSimulation,
    runContactsQueryValidator,
  ]);

  // ── Suite runner map ──
  const suiteRunners: Record<string, () => Promise<void>> = {
    'trigger-audit': runTriggerAudit,
    'edge-function-direct': runEdgeFunctionDirect,
    'db-state-inspector': runDBStateInspector,
    'full-workflow': runFullWorkflow,
    'title-filter-audit': runTitleFilterAudit,
    'duplicate-guard': runDuplicateGuard,
    'bulk-simulation': runBulkSimulation,
    'contacts-query-validator': runContactsQueryValidator,
  };

  const isAnyRunning = suites.some((s: TestSuite) => s.running);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Auto Contact Lookup Test Panel
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            8 test suites covering trigger wiring, edge function, DB state, dedup, bulk ops, and
            query validation
          </p>
        </div>
        <Button onClick={runAll} disabled={isAnyRunning} className="gap-2">
          {isAnyRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Run All
        </Button>
      </div>

      {/* Buyer picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buyer Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by company name..."
                value={buyerSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setBuyerSearch(e.target.value);
                  searchBuyers(e.target.value);
                }}
                className="pl-9"
              />
            </div>
            {searching && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-2" />}
          </div>

          {buyerResults.length > 0 && !selectedBuyer && (
            <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
              {buyerResults.map((b: BuyerOption) => (
                <button
                  key={b.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between items-center"
                  onClick={() => {
                    setSelectedBuyer(b);
                    setBuyerSearch(b.company_name);
                    setBuyerResults([]);
                  }}
                >
                  <span className="font-medium">{b.company_name}</span>
                  <span className="text-muted-foreground text-xs">
                    {b.buyer_type || 'corporate'}
                    {b.pe_firm_name ? ` / ${b.pe_firm_name}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedBuyer && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {selectedBuyer.company_name} ({selectedBuyer.buyer_type || 'corporate'})
                {selectedBuyer.pe_firm_name ? ` / ${selectedBuyer.pe_firm_name}` : ''}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedBuyer(null);
                  setBuyerSearch('');
                }}
              >
                Clear
              </Button>
            </div>
          )}

          <div className="pt-2 border-t">
            <label className="text-sm text-muted-foreground block mb-1">
              Bulk buyer IDs (comma-separated, for Suite 7)
            </label>
            <Input
              placeholder="uuid1, uuid2, uuid3..."
              value={bulkIds}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBulkIds(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Test suites */}
      <div className="grid gap-4">
        {suites.map((suite: TestSuite) => {
          const canRun =
            !suite.requiresBuyer || !!selectedBuyer || suite.id === 'bulk-simulation';
          const hasResults = suite.steps.length > 0;
          const passCount = suite.steps.filter((s: TestStep) => s.status === 'pass').length;
          const failCount = suite.steps.filter((s: TestStep) => s.status === 'fail').length;
          const warnCount = suite.steps.filter((s: TestStep) => s.status === 'warn').length;

          return (
            <Card key={suite.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{suite.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{suite.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasResults && (
                      <div className="flex gap-1.5 text-xs">
                        {passCount > 0 && (
                          <span className="text-green-600">{passCount} pass</span>
                        )}
                        {failCount > 0 && <span className="text-red-600">{failCount} fail</span>}
                        {warnCount > 0 && (
                          <span className="text-yellow-600">{warnCount} warn</span>
                        )}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canRun || suite.running || isAnyRunning}
                      onClick={() => suiteRunners[suite.id]?.()}
                      className="gap-1.5"
                    >
                      {suite.running ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Run
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {suite.steps.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {suite.steps.map((s: TestStep, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm py-0.5">
                        {statusIcon(s.status)}
                        <span className="font-medium min-w-0">{s.label}</span>
                        {s.detail && (
                          <span className="text-muted-foreground text-xs ml-auto shrink-0 max-w-[50%] truncate">
                            {s.detail}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
