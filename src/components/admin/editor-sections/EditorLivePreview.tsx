import { useMemo } from 'react';
import { CheckCircle2, AlertCircle, Shield, MapPin, ImageIcon, ExternalLink } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import ListingStatusTag from '@/components/listing/ListingStatusTag';
import ListingCardBadges from '@/components/listing/ListingCardBadges';
import ListingCardTitle from '@/components/listing/ListingCardTitle';
import ListingCardFinancials from '@/components/listing/ListingCardFinancials';
import { RichTextDisplay } from '@/components/ui/rich-text-display';
import { BusinessDetailsGrid } from '@/components/listing-detail/BusinessDetailsGrid';
import { formatCurrency } from '@/lib/currency-utils';
import { Card, CardContent } from '@/components/ui/card';
import { useRelatedDeals } from '@/hooks/useDealLandingPage';
import type { LandingPageDeal } from '@/hooks/useDealLandingPage';
import LandingHeader from '@/pages/DealLandingPage/components/LandingHeader';
import DealHero from '@/pages/DealLandingPage/components/DealHero';
import MetricsStrip from '@/pages/DealLandingPage/components/MetricsStrip';
import ContentSections from '@/pages/DealLandingPage/components/ContentSections';
import DealRequestForm from '@/pages/DealLandingPage/components/DealRequestForm';
import DealSidebar from '@/pages/DealLandingPage/components/DealSidebar';
import RelatedDeals from '@/pages/DealLandingPage/components/RelatedDeals';

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
  // Additional fields for full-fidelity landing page preview
  metric_3_type?: string;
  metric_3_custom_label?: string | null;
  metric_3_custom_value?: string | null;
  metric_3_custom_subtitle?: string | null;
  metric_4_type?: string;
  metric_4_custom_label?: string | null;
  metric_4_custom_value?: string | null;
  metric_4_custom_subtitle?: string | null;
  revenue_metric_subtitle?: string | null;
  ebitda_metric_subtitle?: string | null;
  geographic_states?: string[];
  services?: string[];
  number_of_locations?: number;
  customer_types?: string | null;
  revenue_model?: string | null;
  business_model?: string | null;
  growth_trajectory?: string | null;
  presented_by_admin_id?: string | null;
  deal_identifier?: string | null;
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
          {formValues.categories
            ?.filter(
              (cat) =>
                cat.length <= 60 &&
                !/\b(is|are|was|were|the|that|this|their|which|also|primarily)\b/i.test(cat),
            )
            .map((cat) => (
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

        {/* Financial Grid — gated: buyers see this only after connection approval */}
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Visible after connection approval only</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 border-b border-border/30 pb-4 mb-6 opacity-80">
          {[
            {
              label: `${new Date().getFullYear() - 1} Revenue`,
              value: formatCurrency(revenue),
              subtitle: formValues.revenue_metric_subtitle || formValues.categories?.[0] || '',
            },
            {
              label: 'EBITDA',
              value: formatCurrency(ebitda),
              subtitle: formValues.ebitda_metric_subtitle || `~${ebitdaMargin}% margin`,
            },
            // Metric 3
            ...(formValues.metric_3_type === 'custom' && formValues.metric_3_custom_label
              ? [{ label: formValues.metric_3_custom_label, value: formValues.metric_3_custom_value || '', subtitle: formValues.metric_3_custom_subtitle || '' }]
              : ((formValues.full_time_employees || 0) + (formValues.part_time_employees || 0)) > 0
                ? [{ label: 'Team Size', value: `${(formValues.full_time_employees || 0) + (formValues.part_time_employees || 0)}`, subtitle: `${formValues.full_time_employees || 0} FT, ${formValues.part_time_employees || 0} PT` }]
                : []),
            // Metric 4
            ...(formValues.metric_4_type === 'custom' && formValues.metric_4_custom_label
              ? [{ label: formValues.metric_4_custom_label, value: formValues.metric_4_custom_value || '', subtitle: formValues.metric_4_custom_subtitle || '' }]
              : [{ label: 'EBITDA Margin', value: `${ebitdaMargin}%`, subtitle: formValues.metric_4_custom_subtitle || formValues.categories?.[0] || '' }]),
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
        </div>

        {/* Business Details Grid */}
        <BusinessDetailsGrid
          geographic_states={formValues.geographic_states}
          services={formValues.services}
          number_of_locations={formValues.number_of_locations}
          customer_types={formValues.customer_types}
          revenue_model={formValues.revenue_model}
          business_model={formValues.business_model}
          growth_trajectory={formValues.growth_trajectory}
        />

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

// ─── Preview 3: Full-Fidelity Landing Page Preview ───────────────────────────
// Renders the actual DealLandingPage components with real related deals,
// giving admins a pixel-accurate preview of the public deal page.

function formValuesToLandingPageDeal(
  formValues: EditorPreviewFormValues,
  imagePreview: string | null,
): LandingPageDeal {
  const revenue = parseNum(formValues.revenue);
  const ebitda = parseNum(formValues.ebitda);
  return {
    id: 'preview',
    title: formValues.title || 'Untitled Listing',
    deal_identifier: formValues.deal_identifier || null,
    hero_description: formValues.hero_description || null,
    description: formValues.description || null,
    description_html: formValues.description_html || null,
    location: formValues.location?.[0] || null,
    revenue,
    ebitda,
    categories: formValues.categories || null,
    category: formValues.categories?.[0] || null,
    custom_sections: Array.isArray(formValues.custom_sections)
      ? (formValues.custom_sections as Array<{ title: string; description: string }>)
      : null,
    image_url: imagePreview,
    revenue_metric_subtitle: formValues.revenue_metric_subtitle || null,
    ebitda_metric_subtitle: formValues.ebitda_metric_subtitle || null,
    metric_3_type: formValues.metric_3_type || null,
    metric_3_custom_label: formValues.metric_3_custom_label || null,
    metric_3_custom_value: formValues.metric_3_custom_value || null,
    metric_3_custom_subtitle: formValues.metric_3_custom_subtitle || null,
    metric_4_type: formValues.metric_4_type || null,
    metric_4_custom_label: formValues.metric_4_custom_label || null,
    metric_4_custom_value: formValues.metric_4_custom_value || null,
    metric_4_custom_subtitle: formValues.metric_4_custom_subtitle || null,
    
    full_time_employees: formValues.full_time_employees || null,
    part_time_employees: formValues.part_time_employees || null,
    status: 'active',
    presented_by_admin_id: formValues.presented_by_admin_id || null,
    is_internal_deal: false,
    acquisition_type: formValues.acquisition_type || null,
    geographic_states: formValues.geographic_states || null,
    services: formValues.services || null,
    number_of_locations: formValues.number_of_locations || null,
    customer_types: formValues.customer_types || null,
    revenue_model: formValues.revenue_model || null,
    business_model: formValues.business_model || null,
    growth_trajectory: formValues.growth_trajectory || null,
    featured_deal_ids: null,
  };
}

function LandingPageFooter() {
  return (
    <footer
      style={{
        borderTop: '1px solid #DDD8D0',
        background: '#FDFCFA',
        padding: '28px 24px',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 16,
            color: '#1A1714',
          }}
        >
          Source<span style={{ color: '#B8933A' }}>Co</span>
        </span>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {['Marketplace', 'For Buyers', 'For Sellers', 'Blog', 'Contact'].map((label) => (
            <span key={label} style={{ fontSize: 12, color: '#6B6560', cursor: 'default' }}>
              {label}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#6B6560' }}>
          &copy; SourceCo {new Date().getFullYear()}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function FullFidelityLandingPreview({ formValues, imagePreview }: EditorLivePreviewProps) {
  const deal = useMemo(
    () => formValuesToLandingPageDeal(formValues, imagePreview),
    [formValues, imagePreview],
  );

  // Fetch real related deals from the database (excluding the current listing if it has an ID)
  const { data: relatedDeals } = useRelatedDeals('preview');

  return (
    <div
      className="rounded-lg border border-border overflow-hidden"
      style={{ background: '#F5F2ED', maxHeight: '80vh', overflowY: 'auto' }}
    >
      {/* Real LandingHeader component */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        <LandingHeader />
      </div>

      <main style={{ maxWidth: 1180, margin: '0 auto' }} className="px-4 sm:px-6">
        <DealHero deal={deal} />
        <MetricsStrip deal={deal} />

        <div
          style={{ display: 'grid', gap: 24, marginBottom: 48 }}
          className="grid-cols-1 lg:grid-cols-[1fr_300px]"
        >
          {/* Left column — content + form */}
          <div>
            <ContentSections deal={deal} />
            <DealRequestForm listingId="preview" dealTitle={deal.title} />
          </div>

          {/* Right column — sticky sidebar */}
          <div className="hidden lg:block">
            <div style={{ position: 'sticky', top: 60 }}>
              <DealSidebar listingId="preview" presentedByAdminId={deal.presented_by_admin_id} />
            </div>
          </div>
        </div>

        {relatedDeals && relatedDeals.length > 0 && <RelatedDeals deals={relatedDeals} />}
      </main>

      <LandingPageFooter />
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
                    Landing Page
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>

          <TabsContent value="card" className="mt-0">
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Marketplace browse view. The tile buyers see when browsing deals.
              </p>
              <MarketplaceCardPreview formValues={formValues} imagePreview={imagePreview} />
            </div>
          </TabsContent>

          <TabsContent value="full" className="mt-0">
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Full listing page. What a buyer sees after clicking into the deal from the
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
                  Full landing page preview. Exactly how anonymous visitors see this deal at
                  /deals/:id, including sidebar, request form, and related deals funnel.
                </span>
              </p>
              <FullFidelityLandingPreview formValues={formValues} imagePreview={imagePreview} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
