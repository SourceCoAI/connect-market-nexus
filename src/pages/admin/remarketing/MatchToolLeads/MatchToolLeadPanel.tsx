import { useEffect } from 'react';
import { ExternalLink, Mail, Phone, User, Calendar, MapPin, Building2, Briefcase, Users, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
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

export function MatchToolLeadPanel({ lead, open, onOpenChange, onEnrich, isEnriching }: MatchToolLeadPanelProps) {
  useEffect(() => {
    if (open && lead && !lead.enrichment_data) {
      onEnrich(lead.id, lead.website);
    }
  }, [open, lead?.id]);

  if (!lead) return null;

  const enrichment = lead.enrichment_data as Record<string, any> | null;
  const domain = getDomain(lead.website);
  const websiteUrl = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;

  const raw = lead.raw_inputs as Record<string, any> | null;
  const city = raw?.city;
  const region = raw?.region;
  const country = raw?.country;
  const location = city && region ? `${city}, ${region}` : city || region || country || null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto p-0">
        <div className="p-6 space-y-6">
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
                  {enrichment?.company_name || lead.business_name || cleanDomain(lead.website)}
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
            {/* Stage + Date */}
            <div className="flex items-center gap-2">
              {lead.submission_stage === 'full_form' ? (
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

          {/* Contact Info */}
          {(lead.full_name || lead.email || lead.phone) && (
            <Section title="Contact">
              {lead.full_name && <InfoRow icon={User} label={lead.full_name} />}
              {lead.email && <InfoRow icon={Mail} label={lead.email} href={`mailto:${lead.email}`} />}
              {lead.phone && <InfoRow icon={Phone} label={lead.phone} href={`tel:${lead.phone}`} />}
              {lead.timeline && <InfoRow icon={Calendar} label={`Timeline: ${lead.timeline}`} />}
            </Section>
          )}

          {/* Financials */}
          {(lead.revenue || lead.profit) && (
            <Section title="Financials">
              {lead.revenue && <InfoRow icon={Briefcase} label={`Revenue: ${REVENUE_LABELS[lead.revenue] || lead.revenue}`} />}
              {lead.profit && <InfoRow icon={Briefcase} label={`Profit: ${PROFIT_LABELS[lead.profit] || lead.profit}`} />}
            </Section>
          )}

          {/* Location */}
          {location && (
            <Section title="Location">
              <InfoRow icon={MapPin} label={location} />
            </Section>
          )}

          {/* Company Intel */}
          <Section title="Company Intelligence">
            {isEnriching && !enrichment ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-4/5" />
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
              <p className="text-[12px] text-muted-foreground/50">No enrichment data available</p>
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
