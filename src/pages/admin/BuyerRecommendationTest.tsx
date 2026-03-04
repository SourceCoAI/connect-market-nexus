/**
 * BuyerRecommendationTest — Interactive diagnostic panel for the AI Buyer
 * Recommendation Engine.  Lives in the Testing Hub and exercises:
 *
 *   1. score-deal-buyers  (scoring engine)
 *   2. seed-buyers         (AI seeding engine → DB writes)
 *   3. Database inspection  (cache, seed log, seeded buyers)
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Users,
  Sparkles,
  Database,
  Zap,
  Star,
  HelpCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SectionCard, JsonBlock, EntityPicker, ts } from './enrichment-test/shared';
import type { LogEntry, AddLogFn } from './enrichment-test/shared';

// ─── Helpers ────────────────────────────────────────────────────────

/** Extract detailed error from Supabase FunctionsHttpError */
async function extractError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const ctx = (error as { context: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) return body.error + (body.details ? `: ${body.details}` : '');
        return JSON.stringify(body);
      }
    } catch {
      // fall through
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

// ─── Log Console ────────────────────────────────────────────────────

function LogConsole({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) return null;
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium">Execution Log</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ScrollArea className="h-56 rounded-md border bg-muted p-3">
          <div className="space-y-1 font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">[{log.ts}]</span>
                {log.ok ? (
                  <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 mt-0.5 text-red-500 shrink-0" />
                )}
                <span className={log.ok ? 'text-foreground' : 'text-red-500'}>{log.msg}</span>
                {log.durationMs !== undefined && (
                  <span className="text-muted-foreground ml-auto shrink-0">{log.durationMs}ms</span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Tier badge ─────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const map: Record<string, { color: string; icon: typeof Zap }> = {
    move_now: { color: 'bg-emerald-100 text-emerald-800', icon: Zap },
    strong: { color: 'bg-blue-100 text-blue-800', icon: Star },
    speculative: { color: 'bg-amber-100 text-amber-800', icon: HelpCircle },
  };
  const cfg = map[tier] || map.speculative;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
      <Icon className="h-2.5 w-2.5 mr-0.5" />
      {tier.replace('_', ' ')}
    </Badge>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function BuyerRecommendationTest() {
  const [dealId, setDealId] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Scoring state
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<Record<string, unknown> | null>(null);
  const [scoreBuyers, setScoreBuyers] = useState<Record<string, unknown>[]>([]);

  // Seeding state
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<Record<string, unknown> | null>(null);

  // DB inspection state
  const [inspecting, setInspecting] = useState(false);
  const [dbSnapshot, setDbSnapshot] = useState<Record<string, unknown> | null>(null);

  const addLog: AddLogFn = useCallback((msg, durationMs?, ok = true) => {
    setLogs((prev) => [...prev, { ts: ts(), msg, durationMs, ok }]);
  }, []);

  // ── Run Score Engine ──────────────────────────────────────────────

  const runScoring = async (forceRefresh = false) => {
    if (!dealId) return;
    setScoring(true);
    setScoreResult(null);
    setScoreBuyers([]);
    addLog(`Calling score-deal-buyers for ${dealId.slice(0, 8)}… (force=${forceRefresh})`);

    const t0 = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('score-deal-buyers', {
        body: { listingId: dealId, forceRefresh },
      });

      const elapsed = Date.now() - t0;

      if (error) {
        const msg = await extractError(error);
        addLog(`score-deal-buyers FAILED: ${msg}`, elapsed, false);
        setScoreResult({ error: msg });
        return;
      }

      if (!data) {
        addLog('score-deal-buyers returned null', elapsed, false);
        return;
      }

      setScoreResult(data);
      setScoreBuyers(data.buyers || []);

      const moveNow = (data.buyers || []).filter(
        (b: { tier: string }) => b.tier === 'move_now',
      ).length;
      const strong = (data.buyers || []).filter(
        (b: { tier: string }) => b.tier === 'strong',
      ).length;
      const spec = (data.buyers || []).filter(
        (b: { tier: string }) => b.tier === 'speculative',
      ).length;

      addLog(
        `Scored ${data.total} buyers — ${moveNow} move_now, ${strong} strong, ${spec} speculative` +
          (data.cached ? ' (CACHED)' : ''),
        elapsed,
      );

      // Validate structure
      for (const buyer of (data.buyers || []).slice(0, 3)) {
        if (!buyer.buyer_id) addLog('WARN: Buyer missing buyer_id', undefined, false);
        if (typeof buyer.composite_score !== 'number')
          addLog('WARN: Buyer missing composite_score', undefined, false);
        if (!['move_now', 'strong', 'speculative'].includes(buyer.tier))
          addLog(`WARN: Invalid tier "${buyer.tier}"`, undefined, false);
      }
    } catch (err) {
      addLog(
        `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        Date.now() - t0,
        false,
      );
    } finally {
      setScoring(false);
    }
  };

  // ── Run AI Seeding ────────────────────────────────────────────────

  const runSeeding = async (forceRefresh = false) => {
    if (!dealId) return;
    setSeeding(true);
    setSeedResult(null);
    addLog(`Calling seed-buyers for ${dealId.slice(0, 8)}… (force=${forceRefresh})`);

    const t0 = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('seed-buyers', {
        body: { listingId: dealId, maxBuyers: 10, forceRefresh },
      });

      const elapsed = Date.now() - t0;

      if (error) {
        const msg = await extractError(error);
        addLog(`seed-buyers FAILED: ${msg}`, elapsed, false);
        setSeedResult({ error: msg });
        return;
      }

      if (!data) {
        addLog('seed-buyers returned null', elapsed, false);
        return;
      }

      setSeedResult(data);

      const inserted = data.inserted || 0;
      const enriched = data.enriched_existing || 0;
      const dupes = data.probable_duplicates || 0;

      addLog(
        `AI seeded ${data.total} buyers — ${inserted} new, ${enriched} enriched, ${dupes} dupes` +
          (data.cached ? ' (CACHED)' : '') +
          (data.model ? ` [model: ${data.model}]` : ''),
        elapsed,
      );

      if (data.usage) {
        addLog(`Token usage: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`);
      }

      // Validate seeded buyers
      for (const buyer of (data.seeded_buyers || []).slice(0, 3)) {
        if (!buyer.buyer_id) addLog('WARN: Seeded buyer missing buyer_id', undefined, false);
        if (
          !['inserted', 'enriched_existing', 'probable_duplicate', 'cached'].includes(buyer.action)
        )
          addLog(`WARN: Invalid action "${buyer.action}"`, undefined, false);
      }
    } catch (err) {
      addLog(
        `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        Date.now() - t0,
        false,
      );
    } finally {
      setSeeding(false);
    }
  };

  // ── Inspect DB State ──────────────────────────────────────────────

  const inspectDb = async () => {
    if (!dealId) return;
    setInspecting(true);
    setDbSnapshot(null);
    addLog(`Inspecting database state for deal ${dealId.slice(0, 8)}…`);

    const t0 = Date.now();
    try {
      // Fetch cache entry
      const { data: cache, error: cacheErr } = await supabase
        .from('buyer_recommendation_cache')
        .select('listing_id, buyer_count, scored_at, expires_at, score_version')
        .eq('listing_id', dealId)
        .maybeSingle();

      if (cacheErr) {
        addLog(`Cache table query failed: ${cacheErr.message}`, undefined, false);
      } else if (cache) {
        const expired = cache.expires_at && new Date(cache.expires_at) < new Date();
        addLog(
          `Cache: ${cache.buyer_count} buyers, scored ${cache.scored_at}${expired ? ' (EXPIRED)' : ''}`,
        );
      } else {
        addLog('No cache entry for this deal');
      }

      // Fetch seed logs
      const { data: seedLogs, error: seedLogErr } = await supabase
        .from('buyer_seed_log')
        .select('id, remarketing_buyer_id, action, was_new_record, seed_model, seeded_at')
        .eq('source_deal_id', dealId)
        .order('seeded_at', { ascending: false })
        .limit(25);

      if (seedLogErr) {
        addLog(`Seed log query failed: ${seedLogErr.message}`, undefined, false);
      } else {
        addLog(`Seed logs: ${seedLogs?.length || 0} entries for this deal`);
      }

      // Fetch AI-seeded buyers from this deal
      const { data: seededBuyers, error: seededErr } = await supabase
        .from('buyers')
        .select(
          'id, company_name, buyer_type, hq_state, ai_seeded, ai_seeded_at, verification_status',
        )
        .eq('ai_seeded', true)
        .eq('ai_seeded_from_deal_id', dealId)
        .order('ai_seeded_at', { ascending: false })
        .limit(50);

      if (seededErr) {
        addLog(`AI-seeded buyers query failed: ${seededErr.message}`, undefined, false);
      } else {
        addLog(`AI-seeded buyers from this deal: ${seededBuyers?.length || 0}`);
        const pending = (seededBuyers || []).filter(
          (b) => b.verification_status === 'pending',
        ).length;
        if (pending > 0) {
          addLog(`  ${pending} still pending verification`);
        }
      }

      // Fetch seed cache
      const { data: seedCaches, error: seedCacheErr } = await supabase
        .from('buyer_seed_cache')
        .select('cache_key, buyer_ids, seeded_at, expires_at')
        .limit(10);

      if (seedCacheErr) {
        addLog(`Seed cache query failed: ${seedCacheErr.message}`, undefined, false);
      } else {
        addLog(`Seed cache entries: ${seedCaches?.length || 0} total`);
      }

      // Fetch deal info for context
      const { data: deal, error: dealErr } = await supabase
        .from('listings')
        .select(
          'id, title, industry, category, categories, ebitda, address_state, geographic_states',
        )
        .eq('id', dealId)
        .maybeSingle();

      if (dealErr) {
        addLog(`Deal query failed: ${dealErr.message}`, undefined, false);
      } else if (deal) {
        addLog(
          `Deal: "${deal.title || 'Untitled'}" — ${deal.industry || 'no industry'}, ${deal.address_state || 'no state'}`,
        );
      } else {
        addLog('Deal not found — this listing ID may not exist', undefined, false);
      }

      const elapsed = Date.now() - t0;
      addLog(`DB inspection complete`, elapsed);

      setDbSnapshot({
        deal,
        recommendation_cache: cache,
        seed_logs: seedLogs,
        ai_seeded_buyers: seededBuyers,
        seed_cache_entries: seedCaches,
      });
    } catch (err) {
      addLog(
        `DB inspection failed: ${err instanceof Error ? err.message : String(err)}`,
        Date.now() - t0,
        false,
      );
    } finally {
      setInspecting(false);
    }
  };

  // ── Full Pipeline Run ─────────────────────────────────────────────

  const [runningFull, setRunningFull] = useState(false);

  const runFullPipeline = async () => {
    if (!dealId) return;
    setRunningFull(true);
    setLogs([]);
    addLog('=== FULL PIPELINE TEST START ===');

    try {
      // Step 1: Inspect DB before
      addLog('Step 1: Inspecting pre-run database state…');
      await inspectDb();

      // Step 2: Run scoring
      addLog('Step 2: Running scoring engine (force refresh)…');
      await runScoring(true);

      // Step 3: Run AI seeding
      addLog('Step 3: Running AI seeding engine…');
      await runSeeding(false);

      // Step 4: Re-score to include newly seeded buyers
      addLog('Step 4: Re-scoring with newly seeded buyers (force refresh)…');
      await runScoring(true);

      // Step 5: Inspect DB after
      addLog('Step 5: Inspecting post-run database state…');
      await inspectDb();

      addLog('=== FULL PIPELINE TEST COMPLETE ===');
    } catch (err) {
      addLog(
        `Pipeline error: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        false,
      );
    } finally {
      setRunningFull(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Deal Picker */}
      <SectionCard title="Select Deal" icon={<Users className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground">
          Pick a deal to test the buyer recommendation and AI seeding engines against.
        </p>
        <EntityPicker
          entity="deal"
          value={dealId}
          onChange={setDealId}
          placeholder="Select a deal to test…"
        />
        {dealId && <p className="text-xs font-mono text-muted-foreground">Selected: {dealId}</p>}
      </SectionCard>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => runScoring(true)} disabled={!dealId || scoring || runningFull}>
              {scoring ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Score Buyers
            </Button>
            <Button
              variant="secondary"
              onClick={() => runSeeding(false)}
              disabled={!dealId || seeding || runningFull}
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              AI Search for Buyers
            </Button>
            <Button
              variant="secondary"
              onClick={() => runSeeding(true)}
              disabled={!dealId || seeding || runningFull}
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              AI Search (Force Refresh)
            </Button>
            <Button
              variant="outline"
              onClick={inspectDb}
              disabled={!dealId || inspecting || runningFull}
            >
              {inspecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Inspect DB
            </Button>

            <Separator orientation="vertical" className="h-9" />

            <Button
              variant="default"
              className="bg-purple-600 hover:bg-purple-700"
              onClick={runFullPipeline}
              disabled={!dealId || runningFull}
            >
              {runningFull ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Run Full Pipeline
            </Button>
          </div>
          {!dealId && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Select a deal above to enable testing
            </p>
          )}
        </CardContent>
      </Card>

      {/* Log Console */}
      <LogConsole logs={logs} />

      {/* Scoring Results */}
      {scoreResult && (
        <SectionCard title="Scoring Results" icon={<Star className="h-5 w-5" />}>
          {'error' in scoreResult ? (
            <div className="text-sm text-red-600 font-medium">{String(scoreResult.error)}</div>
          ) : (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span>
                  Total: <strong>{String(scoreResult.total ?? 0)}</strong>
                </span>
                {Boolean(scoreResult.cached) && <Badge variant="secondary">Cached</Badge>}
                {String(scoreResult.scored_at ?? '') !== '' && (
                  <span className="text-xs text-muted-foreground">
                    Scored: {new Date(String(scoreResult.scored_at)).toLocaleString()}
                  </span>
                )}
              </div>
              {scoreBuyers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Top {Math.min(10, scoreBuyers.length)} of {scoreBuyers.length} buyers:
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2 font-medium">Company</th>
                            <th className="text-left p-2 font-medium">Type</th>
                            <th className="text-left p-2 font-medium">State</th>
                            <th className="text-center p-2 font-medium">Score</th>
                            <th className="text-center p-2 font-medium">Svc</th>
                            <th className="text-center p-2 font-medium">Geo</th>
                            <th className="text-center p-2 font-medium">Size</th>
                            <th className="text-left p-2 font-medium">Tier</th>
                            <th className="text-left p-2 font-medium">Signals</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scoreBuyers.slice(0, 10).map((b, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2 font-medium max-w-[180px] truncate">
                                {String(b.company_name || '')}
                              </td>
                              <td className="p-2 capitalize">
                                {String(b.buyer_type || '').replace('_', ' ')}
                              </td>
                              <td className="p-2">{String(b.hq_state || '-')}</td>
                              <td className="p-2 text-center font-mono font-bold">
                                {String(b.composite_score)}
                              </td>
                              <td className="p-2 text-center font-mono">
                                {String(b.service_score)}
                              </td>
                              <td className="p-2 text-center font-mono">
                                {String(b.geography_score)}
                              </td>
                              <td className="p-2 text-center font-mono">{String(b.size_score)}</td>
                              <td className="p-2">
                                <TierBadge tier={String(b.tier)} />
                              </td>
                              <td className="p-2 max-w-[200px] truncate text-muted-foreground">
                                {Array.isArray(b.fit_signals) ? b.fit_signals.join(', ') : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Raw JSON response
                </summary>
                <div className="mt-2">
                  <JsonBlock data={scoreResult} />
                </div>
              </details>
            </>
          )}
        </SectionCard>
      )}

      {/* Seed Results */}
      {seedResult && (
        <SectionCard title="AI Seeding Results" icon={<Sparkles className="h-5 w-5" />}>
          {'error' in seedResult ? (
            <div className="text-sm text-red-600 font-medium">{String(seedResult.error)}</div>
          ) : (
            <>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span>
                  Total: <strong>{String(seedResult.total ?? 0)}</strong>
                </span>
                {Number(seedResult.inserted) > 0 && (
                  <Badge className="bg-green-100 text-green-800">
                    {String(seedResult.inserted)} New
                  </Badge>
                )}
                {Number(seedResult.enriched_existing) > 0 && (
                  <Badge className="bg-blue-100 text-blue-800">
                    {String(seedResult.enriched_existing)} Updated
                  </Badge>
                )}
                {Number(seedResult.probable_duplicates) > 0 && (
                  <Badge variant="secondary">{String(seedResult.probable_duplicates)} Dupes</Badge>
                )}
                {Boolean(seedResult.cached) && <Badge variant="secondary">Cached</Badge>}
                {String(seedResult.model ?? '') !== '' && (
                  <span className="text-xs text-muted-foreground">
                    Model: {String(seedResult.model)}
                  </span>
                )}
              </div>
              {seedResult.usage && (
                <p className="text-xs text-muted-foreground">
                  Tokens: {String((seedResult.usage as { input_tokens: number }).input_tokens)} in /{' '}
                  {String((seedResult.usage as { output_tokens: number }).output_tokens)} out
                </p>
              )}
              {Array.isArray(seedResult.seeded_buyers) && seedResult.seeded_buyers.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Company</th>
                          <th className="text-left p-2 font-medium">Action</th>
                          <th className="text-left p-2 font-medium">New?</th>
                          <th className="text-left p-2 font-medium">Why Relevant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(seedResult.seeded_buyers as Array<Record<string, unknown>>).map(
                          (b, i) => {
                            const actionColor: Record<string, string> = {
                              inserted: 'bg-green-100 text-green-800',
                              enriched_existing: 'bg-blue-100 text-blue-800',
                              probable_duplicate: 'bg-gray-100 text-gray-600',
                              cached: 'bg-purple-100 text-purple-800',
                            };
                            return (
                              <tr key={i} className="border-b last:border-0">
                                <td className="p-2 font-medium">{String(b.company_name || '')}</td>
                                <td className="p-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${actionColor[String(b.action)] || ''}`}
                                  >
                                    {String(b.action || '')}
                                  </Badge>
                                </td>
                                <td className="p-2">{b.was_new_record ? 'Yes' : 'No'}</td>
                                <td className="p-2 max-w-[300px] truncate text-muted-foreground">
                                  {String(b.why_relevant || '-')}
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Raw JSON response
                </summary>
                <div className="mt-2">
                  <JsonBlock data={seedResult} />
                </div>
              </details>
            </>
          )}
        </SectionCard>
      )}

      {/* DB Snapshot */}
      {dbSnapshot && (
        <SectionCard title="Database State" icon={<Database className="h-5 w-5" />}>
          {/* Deal info */}
          {Boolean(dbSnapshot.deal) && (
            <div>
              <p className="text-xs font-medium mb-1">Deal Profile</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs border rounded p-3 bg-muted/30">
                {Object.entries(dbSnapshot.deal as Record<string, unknown>).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground">{k}:</span>{' '}
                    <span className="font-mono">
                      {v === null ? '—' : Array.isArray(v) ? v.join(', ') : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cache */}
          <div>
            <p className="text-xs font-medium mb-1">Recommendation Cache</p>
            {dbSnapshot.recommendation_cache ? (
              <JsonBlock data={dbSnapshot.recommendation_cache} />
            ) : (
              <p className="text-xs text-muted-foreground">No cache entry</p>
            )}
          </div>

          {/* AI-seeded buyers */}
          <div>
            <p className="text-xs font-medium mb-1">
              AI-Seeded Buyers from This Deal (
              {Array.isArray(dbSnapshot.ai_seeded_buyers) ? dbSnapshot.ai_seeded_buyers.length : 0})
            </p>
            {Array.isArray(dbSnapshot.ai_seeded_buyers) &&
            dbSnapshot.ai_seeded_buyers.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Company</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">State</th>
                        <th className="text-left p-2 font-medium">Seeded At</th>
                        <th className="text-left p-2 font-medium">Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dbSnapshot.ai_seeded_buyers as Array<Record<string, unknown>>).map(
                        (b, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2 font-medium">{String(b.company_name || '')}</td>
                            <td className="p-2 capitalize">
                              {String(b.buyer_type || '').replace('_', ' ')}
                            </td>
                            <td className="p-2">{String(b.hq_state || '-')}</td>
                            <td className="p-2 text-muted-foreground">
                              {b.ai_seeded_at
                                ? new Date(String(b.ai_seeded_at)).toLocaleString()
                                : '-'}
                            </td>
                            <td className="p-2">
                              <Badge
                                variant={
                                  b.verification_status === 'pending' ? 'secondary' : 'outline'
                                }
                                className="text-[10px]"
                              >
                                {String(b.verification_status || '-')}
                              </Badge>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No AI-seeded buyers for this deal</p>
            )}
          </div>

          {/* Seed logs */}
          <div>
            <p className="text-xs font-medium mb-1">
              Seed Logs ({Array.isArray(dbSnapshot.seed_logs) ? dbSnapshot.seed_logs.length : 0})
            </p>
            {Array.isArray(dbSnapshot.seed_logs) && dbSnapshot.seed_logs.length > 0 ? (
              <JsonBlock data={dbSnapshot.seed_logs} />
            ) : (
              <p className="text-xs text-muted-foreground">No seed logs for this deal</p>
            )}
          </div>

          {/* Seed cache */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Seed Cache Entries (
              {Array.isArray(dbSnapshot.seed_cache_entries)
                ? dbSnapshot.seed_cache_entries.length
                : 0}
              )
            </summary>
            <div className="mt-2">
              <JsonBlock data={dbSnapshot.seed_cache_entries} />
            </div>
          </details>
        </SectionCard>
      )}
    </div>
  );
}
