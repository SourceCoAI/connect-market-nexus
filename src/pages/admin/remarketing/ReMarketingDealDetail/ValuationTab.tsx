import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Calculator,
  Mail,
  Phone,
  Globe,
  Star,
  TrendingUp,
  TrendingDown,
  Linkedin,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCompactCurrency } from '@/lib/utils';
import {
  parseCalculatorInputs,
  parseValuationResults,
} from '../ValuationLeads/detailHelpers';

interface ValuationTabProps {
  dealId: string;
}

export function ValuationTab({ dealId }: ValuationTabProps) {
  const { data: lead, isLoading } = useQuery({
    queryKey: ['remarketing', 'valuation-lead-for-deal', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('valuation_leads')
        .select('*')
        .eq('pushed_listing_id', dealId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!lead) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calculator className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium">No valuation calculator data</p>
          <p className="text-sm text-muted-foreground mt-1">
            This deal does not have linked valuation calculator data.
          </p>
        </CardContent>
      </Card>
    );
  }

  const inputs = parseCalculatorInputs(lead.raw_calculator_inputs as Record<string, unknown> | null);
  const results = parseValuationResults(lead.raw_valuation_results as Record<string, unknown> | null);

  return (
    <div className="space-y-6">
      {/* Header badges */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Valuation Calculator Data
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {lead.calculator_type && (
                <Badge variant="secondary" className="text-xs capitalize">
                  {(lead.calculator_type as string).replace(/_/g, ' ')}
                </Badge>
              )}
              {lead.lead_source && (
                <Badge variant="outline" className="text-xs">
                  {lead.lead_source === 'full_report'
                    ? 'Full Report'
                    : lead.lead_source === 'initial_unlock'
                      ? 'Initial Unlock'
                      : lead.lead_source === 'spreadsheet_upload'
                        ? 'Spreadsheet Upload'
                        : (lead.lead_source as string).replace(/_/g, ' ')}
                </Badge>
              )}
              {lead.quality_label && (
                <Badge
                  variant={
                    lead.quality_label === 'Very Strong' || lead.quality_label === 'Strong'
                      ? 'success'
                      : lead.quality_label === 'Needs Work'
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="text-xs"
                >
                  {lead.quality_label as string}
                </Badge>
              )}
              {lead.is_priority_target && (
                <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                  <Star className="h-3 w-3 mr-1" /> Priority
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Info */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Contact
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {lead.full_name && (
                <div className="flex items-center gap-2 col-span-2">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{lead.full_name as string}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-primary hover:underline truncate"
                  >
                    {lead.email as string}
                  </a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{lead.phone as string}</span>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <a
                    href={
                      (lead.website as string).startsWith('http')
                        ? (lead.website as string)
                        : `https://${lead.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate"
                  >
                    {lead.website as string}
                  </a>
                </div>
              )}
              {lead.linkedin_url && (
                <div className="flex items-center gap-2">
                  <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
                  <a
                    href={lead.linkedin_url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate"
                  >
                    LinkedIn
                  </a>
                </div>
              )}
              {lead.location && (
                <div className="flex items-center gap-2 col-span-2">
                  <span className="text-muted-foreground">Location:</span>
                  <span>{lead.location as string}</span>
                </div>
              )}
              <div className="flex items-center gap-2 col-span-2">
                <span className="text-muted-foreground">Submitted:</span>
                <span>
                  {format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            </div>
          </section>

          <Separator />

          {/* Scoring & Status */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Lead Scoring
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {lead.lead_score != null && (
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Lead Score
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{lead.lead_score as number}</p>
                </div>
              )}
              {lead.readiness_score != null && (
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Readiness
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {lead.readiness_score as number}
                  </p>
                </div>
              )}
              {lead.exit_timing && (
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Exit Timing
                  </p>
                  <p className="text-sm font-semibold capitalize mt-1">
                    {(lead.exit_timing as string).replace(/_/g, ' ')}
                  </p>
                </div>
              )}
              {lead.open_to_intros != null && (
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Open to Intros
                  </p>
                  <p
                    className={cn(
                      'text-lg font-semibold mt-0.5',
                      lead.open_to_intros ? 'text-emerald-600' : 'text-muted-foreground',
                    )}
                  >
                    {lead.open_to_intros ? 'Yes' : 'No'}
                  </p>
                </div>
              )}
            </div>
            {lead.growth_trend && (
              <div className="text-sm">
                <span className="text-muted-foreground">Growth Trend:</span>{' '}
                <span className="capitalize">{(lead.growth_trend as string).replace(/_/g, ' ')}</span>
              </div>
            )}
            {lead.owner_dependency && (
              <div className="text-sm">
                <span className="text-muted-foreground">Owner Dependency:</span>{' '}
                <span className="capitalize">
                  {(lead.owner_dependency as string).replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {lead.buyer_lane && (
              <div className="text-sm">
                <span className="text-muted-foreground">Buyer Lane:</span>{' '}
                <span className="capitalize">{(lead.buyer_lane as string).replace(/_/g, ' ')}</span>
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      {/* Valuation Results */}
      {results && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Valuation Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Business Value */}
            {results.businessValue && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Business Value Range
                </p>
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-foreground">
                    {formatCompactCurrency(results.businessValue.mid)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatCompactCurrency(results.businessValue.low)} –{' '}
                    {formatCompactCurrency(results.businessValue.high)}
                  </span>
                </div>
                {results.ebitdaMultiple && (
                  <p className="text-xs text-muted-foreground">
                    EBITDA Multiple: {results.ebitdaMultiple.toFixed(1)}x
                    {results.revenueMultiple
                      ? ` · Revenue Multiple: ${results.revenueMultiple.toFixed(2)}x`
                      : ''}
                  </p>
                )}
              </div>
            )}

            {/* Property Value */}
            {results.propertyValue && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Property Value
                </p>
                <p className="text-lg font-semibold">
                  {formatCompactCurrency(results.propertyValue.mid)}
                  <span className="text-sm text-muted-foreground ml-2">
                    ({formatCompactCurrency(results.propertyValue.low)} –{' '}
                    {formatCompactCurrency(results.propertyValue.high)})
                  </span>
                </p>
                {results.propertyValue.capRate && (
                  <p className="text-xs text-muted-foreground">
                    Cap Rate: {(results.propertyValue.capRate * 100).toFixed(1)}%
                    {results.propertyValue.envDiscount
                      ? ` · Environmental Discount: ${(results.propertyValue.envDiscount * 100).toFixed(0)}%`
                      : ''}
                  </p>
                )}
              </div>
            )}

            {/* Quality & Buyer Lane */}
            <div className="grid grid-cols-2 gap-3">
              {results.qualityLabel && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Quality Tier
                  </p>
                  <p className="font-semibold text-foreground">{results.qualityLabel.label}</p>
                  {results.qualityLabel.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {results.qualityLabel.description}
                    </p>
                  )}
                </div>
              )}
              {results.buyerLane && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Buyer Lane
                  </p>
                  <p className="font-semibold text-foreground">{results.buyerLane.title}</p>
                  {results.buyerLane.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                      {results.buyerLane.description}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Tier badge */}
            {results.tier && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tier:</span>
                <Badge
                  className={cn('text-xs', {
                    'bg-emerald-100 text-emerald-800 border-emerald-300': results.tier === 'A',
                    'bg-amber-100 text-amber-800 border-amber-300': results.tier === 'B',
                    'bg-red-100 text-red-800 border-red-300': results.tier === 'C',
                  })}
                  variant="outline"
                >
                  Tier {results.tier}
                </Badge>
              </div>
            )}

            {/* Narrative */}
            {results.narrative && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                  Analysis
                </p>
                <p className="text-sm text-foreground leading-relaxed">{results.narrative}</p>
              </div>
            )}

            {/* Positive / Negative Factors */}
            {(results.positiveFactors.length > 0 || results.negativeFactors.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {results.positiveFactors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 uppercase flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Strengths
                    </p>
                    <ul className="space-y-1">
                      {results.positiveFactors.map((f, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-1"
                        >
                          <span className="text-green-600 mt-0.5">+</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {results.negativeFactors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-700 dark:text-red-400 uppercase flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" /> Weaknesses
                    </p>
                    <ul className="space-y-1">
                      {results.negativeFactors.map((f, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-1"
                        >
                          <span className="text-red-600 mt-0.5">{'\u2212'}</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Score Breakdown */}
            {results.scoreBreakdown.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  Score Breakdown
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {results.scoreBreakdown.map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span
                        className={cn(
                          'font-mono tabular-nums',
                          typeof value === 'number' && value > 0 && 'text-green-600',
                          typeof value === 'number' && value < 0 && 'text-red-600',
                          typeof value === 'number' && value === 0 && 'text-muted-foreground',
                        )}
                      >
                        {typeof value === 'number' ? (value > 0 ? `+${value}` : value) : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calculator Inputs */}
      {inputs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Calculator Inputs</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion
              type="multiple"
              defaultValue={inputs.map((g) => g.groupName)}
              className="space-y-1"
            >
              {inputs.map((group) => (
                <AccordionItem
                  key={group.groupName}
                  value={group.groupName}
                  className="border rounded-lg px-3"
                >
                  <AccordionTrigger className="text-sm font-medium py-2 hover:no-underline">
                    {group.groupName}
                    <span className="text-xs text-muted-foreground ml-2">
                      ({group.fields.length})
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pb-2">
                      {group.fields.map((field, idx) => (
                        <div key={idx} className="flex justify-between items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-muted-foreground">{field.question}</p>
                            {field.description && (
                              <p className="text-xs text-muted-foreground/70 mt-0.5">
                                {field.description}
                              </p>
                            )}
                          </div>
                          <span className="text-sm font-medium text-foreground shrink-0 text-right max-w-[200px]">
                            {field.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
