import { useEffect, useRef } from 'react';
import { ExternalLink, Mail, User, Calendar, MapPin, Building2, Briefcase, Users, Sparkles, Target, TrendingUp, Globe, ArrowRight, Clock } from 'lucide-react';
import { ClickToDialPhone } from '@/components/shared/ClickToDialPhone';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import type { MatchToolLead } from './types';

interface MatchToolLeadPanelProps {
  lead: MatchToolLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrich: (lead_id: string, website: string) => void;
  isEnriching: boolean;
}

function cleanDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url;
  }
}

const REVENUE_LABELS: Record<string, string> = {
  'under_500k': '<$500K', '500k_1m': '$500K–1M', '1m_5m': '$1M–5M',
  '5m_10m': '$5M–10M', '10m_25m': '$10M–25M', '25m_50m': '$25M–50M', '50m_plus': '$50M+',
};

const PROFIT_LABELS: Record<string, string> = {
  'under_100k': '<$100K', '100k_500k': '$100K–500K', '500k_1m': '$500K–1M',
  '1m_3m': '$1M–3M', '3m_5m': '$3M–5M', '5m_plus': '$5M+',
};

const TIMELINE_CONFIG: Record<string, { label: string; color: string }> = {
  'less_than_6_months': { label: '<6 months', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  '6_to_12_months': { label: '6–12 months', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  '1_to_2_years': { label: '1–2 years', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  '2_plus_years': { label: '2+ years', color: 'bg-muted text-muted-foreground' },
  'not_sure': { label: 'Not sure', color: 'bg-muted text-muted-foreground' },
};

const FUNNEL_STEPS = ['hero', 'basics', 'financials', 'results', 'form'];

export function MatchToolLeadPanel({ lead, open, onOpenChange, onEnrich, isEnriching }: MatchToolLeadPanelProps) {
  const enrichedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (open && lead && !lead.enrichment_data && !enrichedIdsRef.current.has(lead.id)) {
      enrichedIdsRef.current.add(lead.id);
      onEnrich(lead.id, lead.website);
    }
  }, [open, lead?.id]);

  if (!lead) return null;

  const enrichment = lead.enrichment_data as Record<string, any> | null;
  const domain = getDomain(lead.website);
  const websiteUrl = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
  const raw = lead.raw_inputs as Record<string, any> | null;

  // Seller intent data
  const exitTiming = raw?.exit_timing || raw?.timeline || lead.timeline;
  const intentScore = raw?.intent_score ? Number(raw.intent_score) : null;
  const converted = raw?.converted === true || lead.submission_stage === 'full_form';
  const matchCount = raw?.match_count ? Number(raw.match_count) : null;

  // Business profile
  const selfReportedName = raw?.company_name || raw?.business_name;
  const sector = raw?.sector;

  // Location
  const city = raw?.city;
  const region = raw?.region;
  const country = raw?.country;
  const location = city && region ? `${city}, ${region}` : city || region || country || null;
  const lat = raw?.latitude;
  const lon = raw?.longitude;

  // Traffic source
  const trafficSource = raw?.source;
  const utmSource = raw?.utm_source;
  const utmMedium = raw?.utm_medium;
  const utmCampaign = raw?.utm_campaign;
  const hasUtm = utmSource || utmMedium || utmCampaign;

  // Funnel journey
  const reachedStep = raw?.reached_step;
  const reachedStepIndex = reachedStep ? FUNNEL_STEPS.indexOf(reachedStep) : -1;

  const timelineConfig = exitTiming ? TIMELINE_CONFIG[exitTiming] || { label: exitTiming, color: 'bg-muted text-muted-foreground' } : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] overflow-y-auto p-0">
        <div className="p-6 space-y-5">
          {/* Header */}
          <SheetHeader className="space-y-3">
            <div className="flex items-start gap-3">
              <img
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                alt=""
                className="h-10 w-10 rounded-lg border border-border/50 bg-muted/30 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base font-semibold tracking-tight truncate">
                  {enrichment?.company_name || selfReportedName || lead.business_name || cleanDomain(lead.website)}
                </SheetTitle>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5"
                >
                  {cleanDomain(lead.website)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {converted ? (
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  Wants Buyers
                </span>
              ) : lead.submission_stage === 'financials' ? (
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                  Financials
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Browse
                </span>
              )}
              <span className="text-[11px] text-muted-foreground/60">
                {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </SheetHeader>

          {/* ── Seller Intent ── */}
          {(timelineConfig || intentScore !== null || converted) && (
            <Section title="Seller Intent">
              <div className="space-y-2.5">
                {timelineConfig && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Exit Timeline</span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${timelineConfig.color}`}>
                      <Clock className="h-3 w-3 mr-1" />
                      {timelineConfig.label}
                    </span>
                  </div>
                )}
                {intentScore !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-muted-foreground">Intent Score</span>
                      <span className="text-[13px] font-semibold text-foreground">{intentScore}/100</span>
                    </div>
                    <Progress value={intentScore} className="h-1.5" />
                  </div>
                )}
                {converted && (
                  <div className="flex items-center gap-2 rounded-md bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
                    <Target className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400">Submitted form — wants buyer list</span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ── Contact Info ── */}
          {(lead.full_name || lead.email || lead.phone) && (
            <Section title="Contact">
              {lead.full_name && <InfoRow icon={User} label={lead.full_name} />}
              {lead.email && <InfoRow icon={Mail} label={lead.email} href={`mailto:${lead.email}`} />}
              {lead.phone && (
                <ClickToDialPhone
                  phone={lead.phone}
                  name={lead.full_name || undefined}
                  email={lead.email || undefined}
                  company={lead.company_name || undefined}
                  size="sm"
                />
              )}
            </Section>
          )}

          {/* ── Business Profile + Financials ── */}
          {(lead.revenue || lead.profit || sector) && (
            <Section title="Business Profile">
              {sector && <InfoRow icon={Building2} label={sector} />}
              {lead.revenue && <InfoRow icon={Briefcase} label={`Revenue: ${REVENUE_LABELS[lead.revenue] || lead.revenue}`} />}
              {lead.profit && <InfoRow icon={TrendingUp} label={`Profit: ${PROFIT_LABELS[lead.profit] || lead.profit}`} />}
            </Section>
          )}

          {/* ── Buyer Match Results ── */}
          {matchCount !== null && matchCount > 0 && (
            <Section title="Match Results">
              <div className="flex items-center gap-3 rounded-md bg-primary/5 border border-primary/10 px-3 py-2.5">
                <Users className="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <span className="text-[15px] font-semibold text-foreground">{matchCount}</span>
                  <span className="text-[12px] text-muted-foreground ml-1.5">buyers matched</span>
                </div>
              </div>
            </Section>
          )}

          {/* ── Location ── */}
          {location && (
            <Section title="Visitor Location">
              <InfoRow icon={MapPin} label={location} />
              {lat && lon && (
                <a
                  href={`https://www.google.com/maps?q=${lat},${lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary/70 hover:text-primary flex items-center gap-1 ml-5.5"
                >
                  View on map <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </Section>
          )}

          {/* ── Funnel Journey ── */}
          {reachedStepIndex >= 0 && (
            <Section title="Funnel Journey">
              <div className="flex items-center gap-1">
                {FUNNEL_STEPS.map((step, i) => (
                  <div key={step} className="flex items-center">
                    <div className={`flex items-center justify-center rounded-full h-6 px-2 text-[10px] font-medium transition-colors ${
                      i <= reachedStepIndex
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/50 text-muted-foreground/40'
                    }`}>
                      {step}
                    </div>
                    {i < FUNNEL_STEPS.length - 1 && (
                      <ArrowRight className={`h-2.5 w-2.5 mx-0.5 ${
                        i < reachedStepIndex ? 'text-primary/40' : 'text-muted-foreground/20'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
              {lead.submission_count && lead.submission_count > 1 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">{lead.submission_count} visits</p>
              )}
            </Section>
          )}

          {/* ── Traffic Source ── */}
          {(trafficSource || hasUtm) && (
            <Section title="Traffic Source">
              {trafficSource && <InfoRow icon={Globe} label={`Source: ${trafficSource}`} />}
              {utmSource && <InfoRow icon={Globe} label={`UTM Source: ${utmSource}`} />}
              {utmMedium && <InfoRow icon={Globe} label={`UTM Medium: ${utmMedium}`} />}
              {utmCampaign && <InfoRow icon={Globe} label={`UTM Campaign: ${utmCampaign}`} />}
            </Section>
          )}

          {/* ── Company Intelligence ── */}
          <Section title="Company Intelligence">
            {isEnriching && !enrichment ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : isEnriching ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <p className="text-[11px] text-muted-foreground/60 mt-2">Generating company intel…</p>
              </div>
            ) : enrichment ? (
              <div className="space-y-3">
                {enrichment.one_liner && (
                  <p className="text-[13px] text-foreground/90 leading-relaxed">{enrichment.one_liner}</p>
                )}
                {enrichment.industry && <InfoRow icon={Building2} label={enrichment.industry} />}
                {enrichment.geography && <InfoRow icon={MapPin} label={enrichment.geography} />}
                {enrichment.employee_estimate && <InfoRow icon={Users} label={`~${enrichment.employee_estimate} employees`} />}
                {enrichment.year_founded && <InfoRow icon={Calendar} label={`Founded ${enrichment.year_founded}`} />}
                {enrichment.revenue_estimate && <InfoRow icon={Briefcase} label={`Est. revenue: ${enrichment.revenue_estimate}`} />}

                {enrichment.services?.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] font-medium text-muted-foreground/70 mb-1.5">Services</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(enrichment.services as string[]).map((s: string, i: number) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {enrichment.notable_signals?.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] font-medium text-muted-foreground/70 mb-1.5">Signals</p>
                    <div className="space-y-1">
                      {(enrichment.notable_signals as string[]).map((s: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <Sparkles className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                          <span className="text-[12px] text-foreground/70">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-muted-foreground/50">Couldn't generate intel for this website</p>
                <button
                  onClick={() => lead && onEnrich(lead.id, lead.website)}
                  className="text-[11px] text-primary hover:text-primary/80 underline"
                >
                  Retry enrichment
                </button>
              </div>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, href }: { icon: React.ComponentType<any>; label: string; href?: string }) {
  const content = (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
      <span className="text-[13px] text-foreground/80 truncate">{label}</span>
    </div>
  );
  if (href) {
    return <a href={href} className="hover:text-primary transition-colors block">{content}</a>;
  }
  return content;
}
