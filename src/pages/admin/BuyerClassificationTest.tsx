/**
 * BuyerClassificationTest — Interactive test panel for the AI buyer type
 * classifier. Tests classification on random or specific buyers without
 * writing to the DB (always dry-run).
 *
 * Three modes:
 *   1. Random — picks N random buyers and classifies them
 *   2. Specific — pick a buyer from a dropdown and classify it
 *   3. Manual — enter company name + metadata, classify without DB lookup
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Shuffle,
  
  PenLine,
  BarChart3,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BUYER_TYPE_SHORT_LABELS } from '@/constants';

// ─── Types ──────────────────────────────────────────────────────────

interface TestResult {
  buyer_id: string;
  company_name: string;
  current_type: string | null;
  current_is_pe_backed: boolean;
  classified_type: string;
  classified_is_pe_backed: boolean;
  classified_pe_firm_name: string | null;
  confidence: number;
  reasoning: string;
  matches_current: boolean;
  platform_company_rule_applied: boolean;
}

interface Summary {
  total_tested: number;
  matches: number;
  mismatches: number;
  accuracy_pct: number;
  platform_rule_corrections: number;
  confidence_avg: number;
  type_distribution: Record<string, number>;
}

interface ApiResponse {
  mode: string;
  dry_run: boolean;
  summary: Summary;
  results: TestResult[];
  valid_types: string[];
  type_definitions: Record<string, string>;
  classification_rules: {
    PLATFORM_COMPANY_RULE: string;
    OPERATING_COMPANY_RULE: string;
    IS_PE_BACKED_RULES: string[];
    PE_BACKED_SECONDARY_CHECK: string;
  };
  usage: { input_tokens: number; output_tokens: number };
}

// ─── Helpers ────────────────────────────────────────────────────────

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

const BUYER_TYPE_COLORS: Record<string, string> = {
  private_equity: 'bg-[#1B3A6B]/10 text-[#1B3A6B] border-[#1B3A6B]/20',
  corporate: 'bg-[#1A6B3A]/10 text-[#1A6B3A] border-[#1A6B3A]/20',
  family_office: 'bg-[#5B2D8E]/10 text-[#5B2D8E] border-[#5B2D8E]/20',
  search_fund: 'bg-[#8B1A1A]/10 text-[#8B1A1A] border-[#8B1A1A]/20',
  independent_sponsor: 'bg-[#C25B00]/10 text-[#C25B00] border-[#C25B00]/20',
  individual_buyer: 'bg-[#4A4A4A]/10 text-[#4A4A4A] border-[#4A4A4A]/20',
};

// Uses BUYER_TYPE_SHORT_LABELS imported from @/constants

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${BUYER_TYPE_COLORS[type] || 'bg-gray-100 text-gray-600 border-gray-200'}`}
    >
      {BUYER_TYPE_SHORT_LABELS[type] || type}
    </Badge>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 85
      ? 'bg-green-100 text-green-700 border-green-200'
      : confidence >= 70
        ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
        : 'bg-red-100 text-red-700 border-red-200';

  return (
    <Badge variant="outline" className={`text-[10px] ${color}`}>
      {confidence}%
    </Badge>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function BuyerClassificationTest() {
  const [mode, setMode] = useState<'random' | 'manual'>('random');
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  // Manual mode fields
  const [manualBuyers, setManualBuyers] = useState([
    { company_name: '', pe_firm_name: '', thesis_snippet: '', website: '' },
  ]);

  const runTest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      let body: Record<string, unknown>;

      if (mode === 'random') {
        body = { mode: 'random', count };
      } else {
        const validBuyers = manualBuyers.filter((b) => b.company_name.trim());
        if (validBuyers.length === 0) {
          setError('Enter at least one company name');
          setLoading(false);
          return;
        }
        body = {
          mode: 'manual',
          buyers: validBuyers.map((b) => ({
            company_name: b.company_name,
            pe_firm_name: b.pe_firm_name || undefined,
            thesis_snippet: b.thesis_snippet || undefined,
            website: b.website || undefined,
          })),
        };
      }

      const { data, error: fnError } = await supabase.functions.invoke('test-classify-buyer', {
        body,
      });

      if (fnError) {
        const msg = await extractError(fnError);
        setError(msg);
        return;
      }

      setResponse(data as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mode, count, manualBuyers]);

  const addManualBuyer = () => {
    setManualBuyers((prev) => [
      ...prev,
      { company_name: '', pe_firm_name: '', thesis_snippet: '', website: '' },
    ]);
  };

  const updateManualBuyer = (index: number, field: string, value: string) => {
    setManualBuyers((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    );
  };

  const removeManualBuyer = (index: number) => {
    setManualBuyers((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Buyer Type Classification Test</h2>
          <p className="text-sm text-muted-foreground">
            Test the AI classifier on random or custom buyers. Always dry-run — no DB writes.
          </p>
        </div>
      </div>

      {/* Mode Selection */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Test Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === 'random' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('random')}
            >
              <Shuffle className="h-4 w-4 mr-1" />
              Random Buyers
            </Button>
            <Button
              variant={mode === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('manual')}
            >
              <PenLine className="h-4 w-4 mr-1" />
              Manual Input
            </Button>
          </div>

          {mode === 'random' && (
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Sample size:</Label>
              <Input
                type="number"
                min={1}
                max={25}
                value={count}
                onChange={(e) => setCount(Math.min(25, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">(max 25)</span>
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              {manualBuyers.map((buyer, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Company Name *</Label>
                    <Input
                      placeholder="Acme Services Inc."
                      value={buyer.company_name}
                      onChange={(e) => updateManualBuyer(i, 'company_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">PE Firm Name</Label>
                    <Input
                      placeholder="Alpine Investors"
                      value={buyer.pe_firm_name}
                      onChange={(e) => updateManualBuyer(i, 'pe_firm_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Thesis / Description</Label>
                    <Input
                      placeholder="Dental rollup in Southeast US..."
                      value={buyer.thesis_snippet}
                      onChange={(e) => updateManualBuyer(i, 'thesis_snippet', e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Website</Label>
                      <Input
                        placeholder="example.com"
                        value={buyer.website}
                        onChange={(e) => updateManualBuyer(i, 'website', e.target.value)}
                      />
                    </div>
                    {manualBuyers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-5"
                        onClick={() => removeManualBuyer(i)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addManualBuyer}>
                + Add another buyer
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={runTest} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Classifying...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Run Classification Test
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Calls Claude Sonnet — dry run only, no data changes
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {response && (
        <>
          {/* Summary Card */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Classification Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{response.summary.total_tested}</div>
                  <div className="text-xs text-muted-foreground">Tested</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {response.summary.accuracy_pct}%
                  </div>
                  <div className="text-xs text-muted-foreground">Match Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{response.summary.confidence_avg}%</div>
                  <div className="text-xs text-muted-foreground">Avg Confidence</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {response.summary.platform_rule_corrections}
                  </div>
                  <div className="text-xs text-muted-foreground">Platform Rule Fixes</div>
                </div>
              </div>

              <Separator className="my-3" />

              {/* Type Distribution */}
              <div className="flex flex-wrap gap-3">
                {Object.entries(response.summary.type_distribution)
                  .filter(([, count]) => count > 0)
                  .map(([type, typeCount]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <TypeBadge type={type} />
                      <span className="text-sm font-medium">{typeCount}</span>
                    </div>
                  ))}
              </div>

              {/* Token usage */}
              <div className="mt-3 text-xs text-muted-foreground">
                Tokens: {response.usage.input_tokens.toLocaleString()} in /{' '}
                {response.usage.output_tokens.toLocaleString()} out
              </div>
            </CardContent>
          </Card>

          {/* Results Table */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Classification Results</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Company</TableHead>
                      <TableHead className="text-xs">Current Type</TableHead>
                      <TableHead className="text-xs">Classified As</TableHead>
                      <TableHead className="text-xs">PE-Backed</TableHead>
                      <TableHead className="text-xs">Confidence</TableHead>
                      <TableHead className="text-xs">Match</TableHead>
                      <TableHead className="text-xs w-[300px]">Reasoning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {response.results.map((r) => (
                      <TableRow
                        key={r.buyer_id}
                        className={r.matches_current ? '' : 'bg-amber-50/50'}
                      >
                        <TableCell className="text-xs font-medium max-w-[200px] truncate">
                          {r.company_name}
                        </TableCell>
                        <TableCell>
                          <TypeBadge type={r.current_type || 'unclassified'} />
                        </TableCell>
                        <TableCell>
                          <TypeBadge type={r.classified_type} />
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.classified_is_pe_backed ? (
                            <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">
                              PE-Backed
                              {r.classified_pe_firm_name && (
                                <span className="ml-1 font-normal">({r.classified_pe_firm_name})</span>
                              )}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {r.platform_company_rule_applied && (
                            <Badge variant="outline" className="ml-1 text-[9px] bg-orange-50 text-orange-700 border-orange-200">
                              Rule Applied
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge confidence={r.confidence} />
                        </TableCell>
                        <TableCell>
                          {r.matches_current ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-amber-500" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[300px]">
                          {r.reasoning}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Classification Rules Reference */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                Active Classification Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Platform Company Rule
                </h4>
                <p className="text-xs">{response.classification_rules.PLATFORM_COMPANY_RULE}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Operating Company Rule
                </h4>
                <p className="text-xs">{response.classification_rules.OPERATING_COMPANY_RULE}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  is_pe_backed Rules
                </h4>
                <ul className="text-xs list-disc pl-4 space-y-0.5">
                  {response.classification_rules.IS_PE_BACKED_RULES.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">
                  Valid Buyer Types
                </h4>
                <div className="flex flex-wrap gap-2 mt-1">
                  {response.valid_types.map((t) => (
                    <div key={t} className="text-xs">
                      <TypeBadge type={t} />
                      <p className="mt-0.5 text-[10px] text-muted-foreground max-w-[200px]">
                        {response.type_definitions[t]?.slice(0, 100)}...
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
