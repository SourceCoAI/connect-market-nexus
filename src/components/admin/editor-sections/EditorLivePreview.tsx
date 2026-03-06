import { CheckCircle2, AlertCircle, Shield, MapPin, ImageIcon, ExternalLink } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import ListingStatusTag from '@/components/listing/ListingStatusTag';
import ListingCardBadges from '@/components/listing/ListingCardBadges';
import ListingCardTitle from '@/components/listing/ListingCardTitle';
import ListingCardFinancials from '@/components/listing/ListingCardFinancials';
import { RichTextDisplay } from '@/components/ui/rich-text-display';
import { formatCurrency } from '@/lib/currency-utils';
import { Card, CardContent } from '@/components/ui/card';

export interface EditorPreviewFormValues {
  title?: string;
  categories?: string[];
  location?: string[];
  revenue?: string | number;
  ebitda?: string | number;
  description_html?: string;
  description?: string;
  hero_description?: string | null;
  status_tag?: string | null;
  acquisition_type?: string;
  full_time_employees?: number;
  part_time_employees?: number;
  custom_sections?: Array<{ title: string; description: string }> | unknown;
  internal_company_name?: string;
}

interface EditorLivePreviewProps {
  formValues: EditorPreviewFormValues;
  imagePreview: string | null;
  listingId?: string | null;
}

function parseNum(val: string | number | undefined): number {
  if (val === undefined || val === '') return 0;
  return typeof val === 'number' ? val : parseFloat(val) || 0;
}

// ─── Quality Score ────────────────────────────────────────────────────────────

function QualityScore({ formValues, imagePreview }: EditorLivePreviewProps) {
  const calculateQuality = () => {
    let score = 0;
    const items = [];

    if (formValues.title && formValues.title.length >= 20) {
      score += 20;
      items.push({ label: 'Descriptive title', complete: true });
    } else {
      items.push({ label: 'Descriptive title (20+ chars)', complete: false });
    }

    if (formValues.categories && formValues.categories.length > 0) {
      score += 15;
      items.push({ label: 'Industry categories', complete: true });
    } else {
      items.push({ label: 'Industry categories', complete: false });
    }

    if (formValues.location && formValues.location.length > 0) {
      score += 15;
      items.push({ label: 'Geographic location', complete: true });
    } else {
      items.push({ label: 'Geographic location', complete: false });
    }

    if (formValues.revenue && parseFloat(String(formValues.revenue)) > 0) {
      score += 15;
      items.push({ label: 'Revenue data', complete: true });
    } else {
      items.push({ label: 'Revenue data', complete: false });
    }

    if (formValues.ebitda && parseFloat(String(formValues.ebitda)) > 0) {
      score += 15;
      items.push({ label: 'EBITDA data', complete: true });
    } else {
      items.push({ label: 'EBITDA data', complete: false });
    }

    if (formValues.description_html && formValues.description_html.length >= 200) {
      score += 15;
      items.push({ label: 'Detailed description', complete: true });
    } else {
      items.push({ label: 'Detailed description (200+ chars)', complete: false });
    }

    if (imagePreview) {
      score += 5;
      items.push({ label: 'Featured image', complete: true });
    } else {
      items.push({ label: 'Featured image', complete: false });
    }

    return { score, items };
  };

  const quality = calculateQuality();

  return (
    <div className="bg-background rounded-lg border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Listing Quality</h3>
        <span className="text-2xl font-light text-sourceco-accent">{quality.score}%</span>
      </div>
      <Progress value={quality.score} className="h-2" />
      <div className="space-y-2">
        {quality.items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            {item.complete ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={item.complete ? 'text-foreground' : 'text-muted-foreground'}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Preview 1: Marketplace Card Preview ──────────────────────────────────────

function MarketplaceCardPreview({ formValues, imagePreview }: EditorLivePreviewProps) {
  const revenue = parseNum(formValues.revenue);
  const ebitda = parseNum(formValues.ebitda);

  return (
    <Card className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-1 max-w-[400px]">
      <div className="relative rounded-t-lg">
        <div className="overflow-hidden rounded-t-lg">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt={formValues.title || 'Listing preview'}
              className="w-full h-48 object-cover"
            />
          ) : (
            <div className="w-full h-48 bg-muted flex items-center justify-center">
              <span className="text-sm text-muted-foreground">No image selected</span>
            </div>
          )}
        </div>
        <ListingStatusTag status={formValues.status_tag || null} />
      </div>

      <CardContent className="p-4 md:p-6">
        <div>
          <ListingCardBadges
            acquisitionType={formValues.acquisition_type}
            location={formValues.location?.[0] || ''}
            categories={formValues.categories}
          />

          <ListingCardTitle
            title={formValues.title || 'Untitled Listing'}
            connectionExists={false}
            connectionStatus=""
          />

          <ListingCardFinancials
            revenue={revenue}
            ebitda={ebitda}
            formatCurrency={formatCurrency}
            fullTimeEmployees={formValues.full_time_employees || 0}
            partTimeEmployees={formValues.part_time_employees || 0}
          />
        </div>

        {/* Clean excerpt instead of raw description dump */}
        <div className="mt-3 text-sm text-muted-foreground line-clamp-2">
          {formValues.hero_description ? (
            <span>{formValues.hero_description}</span>
          ) : formValues.description_html ? (
            <RichTextDisplay content={formValues.description_html} compact />
          ) : formValues.description ? (
            <span>{formValues.description.slice(0, 150)}</span>
          ) : (
            <span className="italic">No description yet...</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Preview 2: Full Listing Page Preview ─────────────────────────────────────

function FullListingPreview({ formValues, imagePreview }: EditorLivePreviewProps) {
  const revenue = parseNum(formValues.revenue);
  const ebitda = parseNum(formValues.ebitda);
  const ebitdaMargin = revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : '0';
  const customSections = Array.isArray(formValues.custom_sections)
    ? (formValues.custom_sections as Array<{ title: string; description: string }>)
    : [];

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden max-w-[720px]">
      {/* Header area */}
      <div className="p-6">
        {/* Status & badges */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {formValues.status_tag && (
            <ListingStatusTag status={formValues.status_tag} variant="inline" />
          )}
          {formValues.acquisition_type && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              {formValues.acquisition_type === 'add_on' ? 'Add-On' : 'Platform'}
            </span>
          )}
        </div>

        {/* Hero Image */}
        <div className="w-full h-56 bg-slate-50 rounded-lg overflow-hidden border border-slate-200/40 shadow-sm mb-6">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt={formValues.title || 'Listing'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, hsl(215, 16%, 47%) 0%, hsl(215, 16%, 65%) 100%)',
              }}
            >
              <ImageIcon className="h-24 w-24 text-white opacity-40" />
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-[30px] leading-[38px] font-light tracking-tight text-foreground mb-3">
          {formValues.title || 'Untitled Listing'}
        </h1>

        {/* Location & Categories row */}
        <div className="flex items-center gap-3 flex-wrap text-foreground/80 mb-4">
          {formValues.location?.[0] && (
            <div className="flex items-center">
              <MapPin size={12} className="mr-1" />
              <span className="text-xs font-semibold tracking-wide uppercase">
                {formValues.location[0]}
              </span>
            </div>
          )}
          {formValues.categories?.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600"
            >
              {cat}
            </span>
          ))}
        </div>

        {/* Hero description */}
        {formValues.hero_description && (
          <div className="text-foreground/80 text-sm font-normal leading-relaxed max-w-2xl line-clamp-3 mb-6">
            {formValues.hero_description}
          </div>
        )}

        {/* Confidential banner */}
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200/60 rounded-lg px-4 py-3 mb-6">
          <Shield className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-600 leading-relaxed">
            Business identity is confidential. Request access to receive full deal materials
            including the company name.
          </p>
        </div>

        {/* Financial Grid */}
        <div className="grid grid-cols-3 gap-8 border-b border-border/30 pb-4 mb-6">
          {[
            {
              label: `${new Date().getFullYear() - 1} Revenue`,
              value: formatCurrency(revenue),
              subtitle: formValues.categories?.[0] || '',
            },
            {
              label: 'EBITDA',
              value: formatCurrency(ebitda),
              subtitle: `~${ebitdaMargin}% margin profile`,
            },
            {
              label: 'EBITDA Margin',
              value: `${ebitdaMargin}%`,
              subtitle: 'Profitability metric',
            },
          ].map((metric) => (
            <div key={metric.label} className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {metric.label}
              </p>
              <p className="text-2xl font-light text-foreground">{metric.value}</p>
              {metric.subtitle && (
                <p className="text-xs text-muted-foreground">{metric.subtitle}</p>
              )}
            </div>
          ))}
        </div>

        {/* Business Overview */}
        <div className="py-6 border-b border-slate-100">
          <div className="space-y-4">
            <h2 className="text-sm font-medium leading-5">Business Overview</h2>
            <div className="prose prose-slate max-w-none text-sm [&_p]:text-sm [&_div]:text-sm [&_span]:text-sm">
              {formValues.description_html ? (
                <RichTextDisplay content={formValues.description_html} />
              ) : formValues.description ? (
                <p className="text-sm leading-relaxed text-slate-700">{formValues.description}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No description yet...</p>
              )}
            </div>
          </div>
        </div>

        {/* Custom Sections — only show when description_html is absent.
            When description_html exists (AI-generated marketplace listing),
            it already contains structured content and custom_sections are
            either duplicative or contain raw transcript fragments. */}
        {!formValues.description_html && customSections.length > 0 && (
          <div className="py-6 border-b border-slate-100 space-y-6">
            {customSections.map((section) => (
              <div key={section.title} className="space-y-2">
                <span className="text-sm font-medium text-foreground">{section.title}</span>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {section.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Sidebar CTA mockup */}
        <div className="mt-6 bg-white/50 border border-slate-200/60 rounded-lg p-6 shadow-sm max-w-[280px]">
          <div className="text-center mb-4">
            <h3 className="text-base font-medium text-foreground mb-2">Interested in This Deal?</h3>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Get full access to detailed financials and business metrics
            </p>
          </div>
          <div className="bg-primary text-primary-foreground rounded-md py-2.5 text-center text-sm font-medium">
            Request Connection
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preview 3: Anonymous Landing Page Preview ───────────────────────────────

function AnonymousLandingPreview({ formValues }: EditorLivePreviewProps) {
  const revenue = parseNum(formValues.revenue);
  const ebitda = parseNum(formValues.ebitda);
  const marginPct = revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : '0';
  // Simulate anonymization: strip company name from title if present
  const companyName = formValues.internal_company_name?.trim();
  const anonymizeText = (text: string): string => {
    if (!text || !companyName || companyName.length < 3) return text;
    const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), 'the Company');
  };

  const anonTitle = anonymizeText(formValues.title || 'Untitled Listing');
  const anonHero = formValues.hero_description ? anonymizeText(formValues.hero_description) : null;

  const metrics = [
    {
      label: `${new Date().getFullYear() - 1} Revenue`,
      value: revenue > 0 ? formatCurrency(revenue) : '—',
      subtitle: formValues.categories?.[0] || '',
    },
    {
      label: 'EBITDA',
      value: ebitda > 0 ? formatCurrency(ebitda) : '—',
      subtitle: `~${marginPct}% margin profile`,
    },
    {
      label: 'EBITDA Margin',
      value: `${marginPct}%`,
      subtitle: 'Profitability metric',
    },
  ];

  const customSections = Array.isArray(formValues.custom_sections)
    ? (formValues.custom_sections as Array<{ title: string; description: string }>)
    : [];

  return (
    <div className="bg-[#F7F5F0] rounded-lg border border-border overflow-hidden max-w-[720px]">
      {/* Landing header mock */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-3">
        <span className="text-sm font-semibold text-[#1A1A1A] tracking-tight font-['Inter',system-ui,sans-serif]">
          SourceCo
        </span>
      </div>

      <div className="px-6 py-8 space-y-6">
        {/* Deal identifier & confidential badge */}
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-[0.08em] font-['Inter',system-ui,sans-serif]">
            CONFIDENTIAL
          </span>
        </div>

        {/* Anonymous title */}
        <h1 className="text-[28px] sm:text-[32px] font-bold text-[#1A1A1A] leading-tight font-['Inter',system-ui,sans-serif]">
          {anonTitle}
        </h1>

        {/* Location */}
        {formValues.location?.[0] && (
          <div className="flex items-center gap-1.5 text-[#6B7280]">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-['Inter',system-ui,sans-serif]">
              {formValues.location[0]}
            </span>
          </div>
        )}

        {/* Hero description (anonymized) */}
        {anonHero && (
          <p className="text-[15px] leading-[1.6] text-[#374151] max-w-2xl font-['Inter',system-ui,sans-serif]">
            {anonHero}
          </p>
        )}

        {/* Confidential banner */}
        <div className="flex items-start gap-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg px-4 py-3">
          <Shield className="h-4 w-4 text-[#9CA3AF] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[#6B7280] leading-relaxed font-['Inter',system-ui,sans-serif]">
            Business identity is confidential. Request access to receive full deal materials
            including the company name.
          </p>
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 border-b border-[#E5E7EB] pb-6">
          {metrics.map((metric, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider font-['Inter',system-ui,sans-serif]">
                {metric.label}
              </p>
              <p className="text-2xl font-light text-[#1A1A1A] font-['Inter',system-ui,sans-serif]">
                {metric.value}
              </p>
              {metric.subtitle && (
                <p className="text-xs text-[#6B7280] font-['Inter',system-ui,sans-serif]">
                  {metric.subtitle}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Content: Business Overview (anonymized) */}
        {(formValues.description_html || formValues.description) && (
          <div className="border-b border-[#E5E7EB] pb-6">
            <h2 className="text-sm font-medium text-[#1A1A1A] leading-5 py-4 font-['Inter',system-ui,sans-serif]">
              Business Overview
            </h2>
            <div className="prose prose-slate max-w-none text-sm [&_p]:text-sm [&_div]:text-sm [&_span]:text-sm">
              {formValues.description_html ? (
                <RichTextDisplay content={anonymizeText(formValues.description_html)} />
              ) : (
                <p className="text-sm leading-relaxed text-[#374151] font-['Inter',system-ui,sans-serif]">
                  {anonymizeText(formValues.description || '')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Custom Sections (anonymized) */}
        {customSections.map((section, i) => (
          <div key={i} className="border-b border-[#E5E7EB] pb-6">
            <h2 className="text-sm font-medium text-[#1A1A1A] leading-5 py-4 font-['Inter',system-ui,sans-serif]">
              {anonymizeText(section.title)}
            </h2>
            <p className="text-sm leading-relaxed text-[#374151] font-['Inter',system-ui,sans-serif]">
              {anonymizeText(section.description)}
            </p>
          </div>
        ))}

        {/* Request form mockup */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1A1A1A] mb-2 font-['Inter',system-ui,sans-serif]">
            Request Full Details
          </h3>
          <p className="text-sm text-[#6B7280] mb-4 font-['Inter',system-ui,sans-serif]">
            Submit your information to access the complete deal package including financials,
            company identity, and management team details.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="h-10 rounded-md border border-[#D1D5DB] bg-[#F9FAFB]" />
              <div className="h-10 rounded-md border border-[#D1D5DB] bg-[#F9FAFB]" />
            </div>
            <div className="h-10 rounded-md border border-[#D1D5DB] bg-[#F9FAFB]" />
            <div className="h-20 rounded-md border border-[#D1D5DB] bg-[#F9FAFB]" />
            <div className="bg-[#C9A84C] text-white rounded-md py-2.5 text-center text-sm font-medium">
              Request Access
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function EditorLivePreview({ formValues, imagePreview, listingId }: EditorLivePreviewProps) {
  return (
    <div className="p-5 space-y-5">
      {/* Quality Score */}
      <QualityScore formValues={formValues} imagePreview={imagePreview} />

      {/* Tabbed Preview Panel */}
      <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
        <Tabs defaultValue="card">
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">Buyer Preview</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How buyers see this listing across different surfaces
                </p>
              </div>
              <div className="flex items-center gap-2">
                {listingId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-3 gap-1.5"
                    onClick={() => window.open(`/admin/listing-preview/${listingId}`, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in Browser
                  </Button>
                )}
                <TabsList className="h-8">
                  <TabsTrigger value="card" className="text-xs h-7 px-3">
                    Card
                  </TabsTrigger>
                  <TabsTrigger value="full" className="text-xs h-7 px-3">
                    Full Listing
                  </TabsTrigger>
                  <TabsTrigger value="anonymous" className="text-xs h-7 px-3">
                    Anonymous Page
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>

          <TabsContent value="card" className="mt-0">
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Marketplace browse view — the tile buyers see when browsing deals.
              </p>
              <MarketplaceCardPreview formValues={formValues} imagePreview={imagePreview} />
            </div>
          </TabsContent>

          <TabsContent value="full" className="mt-0">
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Full listing page — what a buyer sees after clicking into the deal from the
                marketplace.
              </p>
              <FullListingPreview formValues={formValues} imagePreview={imagePreview} />
            </div>
          </TabsContent>

          <TabsContent value="anonymous" className="mt-0">
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" />
                <span>
                  Anonymous View — buyer sees this before NDA. No company name, contact info, or
                  identifying details are revealed.
                </span>
              </p>
              <AnonymousLandingPreview formValues={formValues} imagePreview={imagePreview} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
