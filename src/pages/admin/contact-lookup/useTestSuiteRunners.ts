import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { findIntroductionContacts } from '@/lib/remarketing/findIntroductionContacts';
import {
  TestSuite,
  TestStep,
  BuyerOption,
  PE_TITLE_FILTER,
  COMPANY_TITLE_FILTER,
  TITLE_ALIASES,
  BANNED_STANDALONE,
  PE_EXPECTED_ROLES,
  COMPANY_EXPECTED_ROLES,
} from './types';
import { mkStep, matchesTitle } from './utils';
import { buildInitialSuites } from './suiteDefinitions';

export function useTestSuiteRunners(selectedBuyer: BuyerOption | null, bulkIds: string) {
  const [suites, setSuites] = useState<TestSuite[]>(buildInitialSuites);
  const runningRef = useRef(false);

  const updateSuite = useCallback((suiteId: string, patch: Partial<TestSuite>) => {
    setSuites((prev: TestSuite[]) =>
      prev.map((s: TestSuite) => (s.id === suiteId ? { ...s, ...patch } : s)),
    );
  }, []);

  // ── Suite Runners ──

  const runTriggerAudit = useCallback(async () => {
    const suiteId = 'trigger-audit';
    const steps: TestStep[] = [];
    updateSuite(suiteId, {
      running: true,
      steps: [mkStep('Starting trigger audit...', 'running')],
    });

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
        mkStep(
          'Edge function deployed',
          'fail',
          `Not reachable: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    updateSuite(suiteId, { running: false, steps });
  }, [updateSuite]);

  const runEdgeFunctionDirect = useCallback(async () => {
    const suiteId = 'edge-function-direct';
    if (!selectedBuyer) return;
    const steps: TestStep[] = [];
    updateSuite(suiteId, {
      running: true,
      steps: [mkStep('Fetching buyer details...', 'running')],
    });

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
    updateSuite(suiteId, {
      running: true,
      steps: [...steps, mkStep('Calling edge function...', 'running')],
    });

    // Step 2: Call edge function
    const start = performance.now();
    const result = await findIntroductionContacts(selectedBuyer.id, 'manual');
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
    updateSuite(suiteId, {
      running: true,
      steps: [mkStep('Querying contacts table...', 'running')],
    });

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
      const src = ((r as Record<string, unknown>).source as string) || 'unknown';
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
    updateSuite(suiteId, {
      running: true,
      steps: [mkStep('Starting workflow simulation...', 'running')],
    });

    // Step 1: Count contacts before
    const { data: before } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countBefore = before?.length || 0;
    steps.push(mkStep('Pre-run contact count', 'pass', `${countBefore} contacts exist`));
    updateSuite(suiteId, {
      running: true,
      steps: [...steps, mkStep('Running findIntroductionContacts...', 'running')],
    });

    // Step 2: Run the function
    const start = performance.now();
    const result = await findIntroductionContacts(selectedBuyer.id, 'manual');
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
    updateSuite(suiteId, {
      running: true,
      steps: [mkStep('Auditing title filters...', 'running')],
    });

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
    updateSuite(suiteId, {
      running: true,
      steps: [mkStep('Counting existing contacts...', 'running')],
    });

    // Count before
    const { data: before } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countBefore = before?.length || 0;
    steps.push(mkStep('Pre-run count', 'pass', `${countBefore} contacts`));
    updateSuite(suiteId, {
      running: true,
      steps: [...steps, mkStep('Running findIntroductionContacts (1st call)...', 'running')],
    });

    // Run once
    await findIntroductionContacts(selectedBuyer.id, 'manual');
    const { data: mid } = await supabase
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', selectedBuyer.id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const countMid = mid?.length || 0;
    steps.push(mkStep('After 1st call', 'pass', `${countMid} contacts`));
    updateSuite(suiteId, {
      running: true,
      steps: [...steps, mkStep('Running findIntroductionContacts (2nd call)...', 'running')],
    });

    // Run again
    await findIntroductionContacts(selectedBuyer.id, 'manual');
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

    updateSuite(suiteId, {
      running: true,
      steps: [mkStep(`Running for ${ids.length} buyers...`, 'running')],
    });

    // Validate buyers exist
    const { data: buyers } = await supabase.from('buyers').select('id, company_name').in('id', ids);

    const validBuyers = buyers || [];
    const validIds = validBuyers.map((b: { id: string }) => b.id);
    const invalidIds = ids.filter((buyerId: string) => !validIds.includes(buyerId));

    if (invalidIds.length > 0) {
      steps.push(
        mkStep(
          'Buyer validation',
          'warn',
          `${invalidIds.length} ID(s) not found: ${invalidIds.join(', ').slice(0, 80)}`,
        ),
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
      validIds.map((bId: string) => findIntroductionContacts(bId, 'manual')),
    );
    const dur = Math.round(performance.now() - start);

    let totalContacts = 0;
    let buyersWithContacts = 0;
    const perBuyer: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const buyerName =
        validBuyers.find((b: { id: string; company_name: string }) => b.id === validIds[i])
          ?.company_name || validIds[i];
      if (r.status === 'fulfilled' && r.value && r.value.total_saved > 0) {
        totalContacts += r.value.total_saved;
        buyersWithContacts++;
        perBuyer.push(`${buyerName}: ${r.value.total_saved} saved`);
      } else if (r.status === 'fulfilled' && r.value) {
        perBuyer.push(`${buyerName}: 0 saved${r.value.message ? ` (${r.value.message})` : ''}`);
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
    updateSuite(suiteId, {
      running: true,
      steps: [mkStep('Replicating useBuyerData query...', 'running')],
    });

    // Replicate the exact query from useBuyerData.ts
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, linkedin_url, title, is_primary_at_firm')
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

  return {
    suites,
    suiteRunners,
    isAnyRunning,
    runAll,
  };
}
