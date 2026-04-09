import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ImageIcon,
  MapPin,
  Shield,
  Building2,
  DollarSign,
  XCircle,
  HelpCircle,
  Handshake,
  MessageSquare,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import { stateToRegion } from '@/lib/deal-to-listing-anonymizer';
import { getListingImage } from '@/lib/listing-image-utils';
import { CategoryLocationBadges } from '@/components/shared/CategoryLocationBadges';
import ListingStatusTag from '@/components/listing/ListingStatusTag';
import { untypedFrom } from '@/integrations/supabase/client';

interface ClientPreviewDialogProps {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen dialog that lets admins preview what clients see —
 * both the marketplace listing view and the client portal deal view.
 * No separate sign-in required; data is fetched with admin auth.
 */
export function ClientPreviewDialog({ listingId, open, onOpenChange }: ClientPreviewDialogProps) {
  const [tab, setTab] = useState<'portal' | 'marketplace'>('portal');

  // Fetch the latest portal push for this listing (if any)
  const { data: portalPush, isLoading: loadingPush } = useQuery({
    queryKey: ['client-preview-portal', listingId],
    queryFn: async () => {
      const { data, error } = await untypedFrom('portal_deal_pushes')
        .select(
          `*,
          portal_org:portal_organizations!portal_deal_pushes_portal_org_id_fkey(id, name)`,
        )
        .eq('listing_id', listingId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    enabled: open && !!listingId,
    staleTime: 30_000,
  });

  // Fetch marketplace listing data
  const { data: listing, isLoading: loadingListing } = useQuery({
    queryKey: ['client-preview-marketplace', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          [
            'id',
            'title',
            'description',
            'description_html',
            'hero_description',
            'category',
            'categories',
            'location',
            'geographic_states',
            'revenue',
            'ebitda',
            'image_url',
            'status',
            'status_tag',
            'tags',
            'created_at',
            'acquisition_type',
            'full_time_employees',
            'part_time_employees',
            'revenue_metric_subtitle',
            'ebitda_metric_subtitle',
            'metric_3_type',
            'metric_3_custom_label',
            'metric_3_custom_value',
            'metric_3_custom_subtitle',
            'metric_4_type',
            'metric_4_custom_label',
            'metric_4_custom_value',
            'metric_4_custom_subtitle',
          ].join(', '),
        )
        .eq('id', listingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!listingId,
    staleTime: 30_000,
  });

  const isLoading = tab === 'portal' ? loadingPush : loadingListing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Preview Mode Banner */}
        <div className="sticky top-0 z-10 bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-medium text-amber-800">
              Preview Mode — No sign-in required
            </span>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'portal' | 'marketplace')}>
            <TabsList className="h-7">
              <TabsTrigger value="portal" className="text-xs h-6 px-3">
                Client Portal
              </TabsTrigger>
              <TabsTrigger value="marketplace" className="text-xs h-6 px-3">
                Marketplace
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        ) : tab === 'portal' ? (
          <PortalPreview push={portalPush ?? null} />
        ) : (
          <MarketplacePreview listing={listing} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Portal Deal View (what the client sees in their portal) ── */

function PortalPreview({ push }: { push: Record<string, unknown> | null }) {
  if (!push) {
    return (
      <div className="p-8 text-center text-muted-foreground space-y-2">
        <Building2 className="h-8 w-8 mx-auto opacity-40" />
        <p className="text-sm">This deal hasn't been pushed to any client portal yet.</p>
        <p className="text-xs">Push the deal to a portal to preview the client view.</p>
      </div>
    );
  }

  const snapshot = (push.deal_snapshot || {}) as Record<string, unknown>;
  const orgName = (push.portal_org as Record<string, unknown>)?.name || 'Client';

  const fmtCurrency = (val: unknown): string => {
    const n = Number(val);
    if (!n) return '-';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };

  return (
    <div className="bg-gray-50 min-h-[60vh]">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Client org label */}
        <div className="text-xs text-muted-foreground">
          Viewing as: <span className="font-medium text-foreground">{String(orgName)}</span>
        </div>

        {/* Deal header */}
        <div>
          <h1 className="text-2xl font-bold">{String(snapshot.headline || 'Untitled Deal')}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              {String(push.status || 'sent')}
            </Badge>
            {push.priority ? (
              <Badge
                variant={push.priority === 'high' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {String(push.priority)} priority
              </Badge>
            ) : null}
            <span className="text-sm text-muted-foreground">
              Shared {new Date(String(push.created_at)).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="md:col-span-2 space-y-6">
            {/* Key metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Key Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {snapshot.industry ? (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Industry</p>
                        <p className="font-medium text-sm">{String(snapshot.industry)}</p>
                      </div>
                    </div>
                  ) : null}
                  {snapshot.geography ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="font-medium text-sm">{String(snapshot.geography)}</p>
                      </div>
                    </div>
                  ) : null}
                  {snapshot.ebitda != null ? (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">EBITDA</p>
                        <p className="font-medium text-sm">{fmtCurrency(snapshot.ebitda)}</p>
                      </div>
                    </div>
                  ) : null}
                  {snapshot.revenue != null ? (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="font-medium text-sm">{fmtCurrency(snapshot.revenue)}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Business description */}
            {Boolean(snapshot.business_description) ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Business Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {String(snapshot.business_description).replace(/<[^>]*>/g, '')}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {/* Push note */}
            {push.push_note ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Note from SourceCo</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">
                    &ldquo;{String(push.push_note)}&rdquo;
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {/* Data room */}
            {push.data_room_access_token ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-blue-600 font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    View Data Room
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Access deal documents, CIM, and financials.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Sidebar — response buttons (preview only) */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client Response Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  {
                    label: 'Connect with Owner',
                    icon: <Handshake className="h-4 w-4" />,
                    variant: 'default' as const,
                  },
                  {
                    label: 'Learn More From SourceCo',
                    icon: <HelpCircle className="h-4 w-4" />,
                    variant: 'outline' as const,
                  },
                  {
                    label: 'Pass',
                    icon: <XCircle className="h-4 w-4" />,
                    variant: 'destructive' as const,
                  },
                ].map((btn) => (
                  <Button
                    key={btn.label}
                    variant={btn.variant}
                    className="w-full justify-start gap-2 pointer-events-none opacity-70"
                    size="sm"
                    disabled
                  >
                    {btn.icon}
                    {btn.label}
                  </Button>
                ))}
                <p className="text-[10px] text-muted-foreground text-center pt-1">
                  (Preview — buttons are disabled)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Deal Chat
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-md py-3 px-4 text-xs text-muted-foreground text-center">
                  Chat appears here for clients
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Marketplace Listing View (what buyers see on the marketplace) ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MarketplacePreview({ listing }: { listing: any }) {
  if (!listing) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Listing not found or not yet created.</p>
      </div>
    );
  }

  const imageData = getListingImage(listing.image_url ?? null, listing.category);

  const formatListedDate = () => {
    const listedDate = new Date(listing.created_at);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - listedDate.getTime()) / (1000 * 3600 * 24));
    if (daysDiff === 0) return 'Listed today';
    if (daysDiff === 1) return 'Listed yesterday';
    if (daysDiff < 7) return `Listed ${daysDiff}d ago`;
    if (daysDiff < 14) return `Listed ${Math.floor(daysDiff / 7)}w ago`;
    return 'Listed 14+ days ago';
  };

  return (
    <div className="p-6 sm:p-8 space-y-8">
      {/* Status & Acquisition Type */}
      <div className="flex items-center gap-2 flex-wrap">
        {listing.status_tag && <ListingStatusTag status={listing.status_tag} variant="inline" />}
        {listing.acquisition_type && (
          <CategoryLocationBadges acquisitionType={listing.acquisition_type} variant="default" />
        )}
      </div>

      {/* Hero Image */}
      {imageData && (
        <div className="w-full h-40 sm:h-56 border border-slate-200/40 bg-slate-50 rounded-lg overflow-hidden shadow-sm">
          {imageData.type === 'image' ? (
            <img src={imageData.value} alt={listing.title} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: imageData.value }}
            >
              <ImageIcon className="h-24 w-24 text-white opacity-40" />
            </div>
          )}
        </div>
      )}

      {/* Title */}
      <div>
        <h1 className="text-[22px] sm:text-[30px] leading-[28px] sm:leading-[38px] font-light tracking-tight text-foreground mb-3">
          {listing.title}
        </h1>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-foreground/80 mb-4">
          <div className="flex items-center">
            <MapPin size={12} className="mr-1" />
            <span className="text-xs font-semibold tracking-wide uppercase">
              {listing.location ? stateToRegion(listing.location) : listing.location}
              {listing.location &&
                listing.geographic_states?.length === 1 &&
                ` | ${listing.geographic_states[0]}`}
            </span>
          </div>
          <CategoryLocationBadges
            categories={listing.categories}
            category={listing.category}
            variant="default"
          />
          <div className="text-xs text-muted-foreground">{formatListedDate()}</div>
        </div>
        {listing.hero_description && (
          <p className="text-foreground/80 text-sm font-normal leading-relaxed max-w-2xl">
            {listing.hero_description}
          </p>
        )}
      </div>

      {/* Confidential Banner */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200/60 rounded-lg px-4 py-3">
        <Shield className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Business identity is confidential. Request access to receive full deal materials including
          the company name.
        </p>
      </div>

      {/* Financial Grid */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
          Financials (visible after connection approved)
        </p>
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
              <FinancialMetric
                label={`${new Date().getFullYear() - 1} Revenue`}
                value={formatCurrency(listing.revenue)}
                subtitle={listing.revenue_metric_subtitle || listing.category}
              />
              <FinancialMetric
                label="EBITDA"
                value={formatCurrency(listing.ebitda)}
                subtitle={
                  listing.ebitda_metric_subtitle ||
                  (listing.revenue > 0
                    ? `~${((listing.ebitda / listing.revenue) * 100).toFixed(1)}% margin profile`
                    : undefined)
                }
              />
              {listing.metric_3_type === 'custom' && listing.metric_3_custom_label ? (
                <FinancialMetric
                  label={listing.metric_3_custom_label}
                  value={listing.metric_3_custom_value || ''}
                  subtitle={listing.metric_3_custom_subtitle ?? undefined}
                />
              ) : (listing.full_time_employees || 0) + (listing.part_time_employees || 0) > 0 ? (
                <FinancialMetric
                  label="Team Size"
                  value={`${(listing.full_time_employees || 0) + (listing.part_time_employees || 0)}`}
                  subtitle={`${listing.full_time_employees || 0} FT, ${listing.part_time_employees || 0} PT`}
                />
              ) : null}
              {listing.metric_4_type === 'custom' && listing.metric_4_custom_label ? (
                <FinancialMetric
                  label={listing.metric_4_custom_label}
                  value={listing.metric_4_custom_value || ''}
                  subtitle={listing.metric_4_custom_subtitle ?? undefined}
                />
              ) : (
                <FinancialMetric
                  label="EBITDA Margin"
                  value={
                    listing.revenue > 0
                      ? `${((listing.ebitda / listing.revenue) * 100).toFixed(1)}%`
                      : '—'
                  }
                  subtitle={listing.metric_4_custom_subtitle || listing.category || undefined}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Business Overview */}
      <div className="py-6 border-t border-slate-100">
        <h2 className="text-sm font-medium leading-5 mb-4">Business Overview</h2>
        <div className="prose max-w-none text-sm">
          {listing.description_html ? (
            <div dangerouslySetInnerHTML={{ __html: listing.description_html }} />
          ) : (
            <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {listing.description}
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {listing.tags && listing.tags.length > 0 && (
        <div className="py-4 border-t border-slate-100">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Tags
          </h3>
          <div className="flex flex-wrap gap-2">
            {listing.tags.map((tag: string) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Request Access CTA */}
      <div className="py-6 border-t border-slate-100">
        <Card>
          <CardContent className="pt-6 text-center space-y-3">
            <h3 className="text-base font-medium text-foreground">Request Access to This Deal</h3>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Request a connection to receive deal materials from the advisor.
            </p>
            <div className="bg-muted rounded-md py-3 px-4 text-xs text-muted-foreground">
              [Request Connection button appears here for buyers]
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FinancialMetric({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
