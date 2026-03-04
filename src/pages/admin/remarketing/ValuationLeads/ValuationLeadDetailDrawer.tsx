import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Mail,
  Phone,
  Globe,
  Star,
  ThumbsDown,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Linkedin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompactCurrency } from '@/lib/utils';
import type { ValuationLead } from './types';
import { extractBusinessName, inferWebsite } from './helpers';
import { parseCalculatorInputs, parseValuationResults } from './detailHelpers';

interface Props {
  lead: ValuationLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPushToDeals: (leadIds: string[]) => void;
  onMarkNotFit: (leadIds: string[]) => void;
  onViewDeal: (listingId: string) => void;
  isPushing?: boolean;
}

export function ValuationLeadDetailDrawer({
  lead,
  open,
  onOpenChange,
  onPushToDeals,
  onMarkNotFit,
  onViewDeal,
  isPushing,
}: Props) {
  if (!lead) return null;

  const businessName = extractBusinessName(lead);
  const website = inferWebsite(lead);
  const inputs = parseCalculatorInputs(lead.raw_calculator_inputs);
  const results = parseValuationResults(lead.raw_valuation_results);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="text-xl font-bold">{businessName}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {lead.calculator_type && (
              <Badge variant="secondary" className="text-xs capitalize">
                {lead.calculator_type.replace(/_/g, ' ')}
              </Badge>
            )}
            {lead.lead_source && (
              <Badge variant="outline" className="text-xs">
                {lead.lead_source === 'full_report' ? 'Full Report'
                  : lead.lead_source === 'initial_unlock' ? 'Initial Unlock'
                  : lead.lead_source === 'spreadsheet_upload' ? 'Spreadsheet Upload'
                  : lead.lead_source.replace(/_/g, ' ')}
              </Badge>
            )}
            {results?.tier && (
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
                {lead.quality_label}
              </Badge>
            )}
            {lead.pushed_to_all_deals && (
              <Badge variant="success" className="text-xs">In Active Deals</Badge>
            )}
            {lead.not_a_fit && (
              <Badge variant="destructive" className="text-xs">Not a Fit</Badge>
            )}
            {lead.is_priority_target && (
              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                <Star className="h-3 w-3 mr-1" /> Priority
              </Badge>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-4 space-y-6">
            {/* Contact Info */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Contact</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {lead.full_name && (
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{lead.full_name}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`mailto:${lead.email}`} className="text-primary hover:underline truncate">
                      {lead.email}
                    </a>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{lead.phone}</span>
                  </div>
                )}
                {website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <a
                      href={`https://${website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate"
                    >
                      {website}
                    </a>
                  </div>
                )}
                {lead.linkedin_url && (
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
                    <a
                      href={lead.linkedin_url}
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
                    <span>{lead.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 col-span-2">
                  <span className="text-muted-foreground">Submitted:</span>
                  <span>{format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>
            </section>

            <Separator />

            {/* Financial Summary */}
            {results && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Valuation Results</h3>

                {/* Business Value */}
                {results.businessValue && (
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Business Value Range</p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-bold text-foreground">
                        {formatCompactCurrency(results.businessValue.mid)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatCompactCurrency(results.businessValue.low)} – {formatCompactCurrency(results.businessValue.high)}
                      </span>
                    </div>
                    {results.ebitdaMultiple && (
                      <p className="text-xs text-muted-foreground">
                        EBITDA Multiple: {results.ebitdaMultiple.toFixed(1)}x
                        {results.revenueMultiple ? ` · Revenue Multiple: ${results.revenueMultiple.toFixed(2)}x` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Property Value */}
                {results.propertyValue && (
                  <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Property Value</p>
                    <p className="text-lg font-semibold">
                      {formatCompactCurrency(results.propertyValue.mid)}
                      <span className="text-sm text-muted-foreground ml-2">
                        ({formatCompactCurrency(results.propertyValue.low)} – {formatCompactCurrency(results.propertyValue.high)})
                      </span>
                    </p>
                    {results.propertyValue.capRate && (
                      <p className="text-xs text-muted-foreground">
                        Cap Rate: {(results.propertyValue.capRate * 100).toFixed(1)}%
                        {results.propertyValue.envDiscount ? ` · Environmental Discount: ${(results.propertyValue.envDiscount * 100).toFixed(0)}%` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Quality & Buyer Lane */}
                <div className="grid grid-cols-2 gap-3">
                  {results.qualityLabel && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Quality Tier</p>
                      <p className="font-semibold text-foreground">{results.qualityLabel.label}</p>
                      {results.qualityLabel.description && (
                        <p className="text-xs text-muted-foreground mt-1">{results.qualityLabel.description}</p>
                      )}
                    </div>
                  )}
                  {results.buyerLane && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Buyer Lane</p>
                      <p className="font-semibold text-foreground">{results.buyerLane.title}</p>
                      {results.buyerLane.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{results.buyerLane.description}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Narrative */}
                {results.narrative && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Analysis</p>
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
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
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
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                              <span className="text-red-600 mt-0.5">−</span> {f}
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
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Score Breakdown</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {results.scoreBreakdown.map(({ label, value }) => (
                        <div key={label} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className={cn(
                            'font-mono tabular-nums',
                            typeof value === 'number' && value > 0 && 'text-green-600',
                            typeof value === 'number' && value < 0 && 'text-red-600',
                            typeof value === 'number' && value === 0 && 'text-muted-foreground',
                          )}>
                            {typeof value === 'number' ? (value > 0 ? `+${value}` : value) : value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <Separator />

            {/* Calculator Inputs */}
            {inputs.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Calculator Inputs</h3>
                <Accordion type="multiple" defaultValue={inputs.map(g => g.groupName)} className="space-y-1">
                  {inputs.map((group) => (
                    <AccordionItem key={group.groupName} value={group.groupName} className="border rounded-lg px-3">
                      <AccordionTrigger className="text-sm font-medium py-2 hover:no-underline">
                        {group.groupName}
                        <span className="text-xs text-muted-foreground ml-2">({group.fields.length})</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pb-2">
                          {group.fields.map((field, idx) => (
                            <div key={idx} className="flex justify-between items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-muted-foreground">{field.question}</p>
                                {field.description && (
                                  <p className="text-xs text-muted-foreground/70 mt-0.5">{field.description}</p>
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
              </section>
            )}
          </div>
        </ScrollArea>

        {/* Actions Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center gap-2">
          {lead.pushed_listing_id ? (
            <Button
              onClick={() => onViewDeal(lead.pushed_listing_id!)}
              className="flex-1"
            >
              View Deal <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={() => onPushToDeals([lead.id])}
              disabled={isPushing}
              className="flex-1"
            >
              <DollarSign className="h-4 w-4 mr-1" />
              Push to Active Deals
            </Button>
          )}
          {!lead.not_a_fit && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => onMarkNotFit([lead.id])}
              title="Mark as Not a Fit"
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
