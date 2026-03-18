import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ExternalLink,
  Flag,
  Globe,
  History,
  Loader2,
  Pencil,
  PhoneCall,
  Search,
  Sparkles,
  Store,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UniverseAssignmentButton } from '@/components/remarketing/deal-detail';

interface DealForWebsiteActions {
  needs_owner_contact?: boolean | null;
  needs_buyer_search?: boolean | null;
  category?: string | null;
  universe_build_flagged?: boolean | null;
  pushed_to_marketplace?: boolean | null;
  pushed_to_marketplace_at?: string | null;
  website?: string | null;
  revenue?: number | null;
  ebitda?: number | null;
  address_state?: string | null;
  location?: string | null;
  industry?: string | null;
  executive_summary?: string | null;
  description?: string | null;
  main_contact_name?: string | null;
  main_contact_email?: string | null;
}

interface WebsiteActionsCardProps {
  deal: DealForWebsiteActions;
  dealId: string;
  effectiveWebsite: string | null;
  scoreStats: { count: number; approved: number; passed: number; avgScore: number } | undefined;
  isEnriching: boolean;
  handleEnrichFromWebsite: () => void;
  setBuyerHistoryOpen: (v: boolean) => void;
  toggleContactOwnerMutation: { mutate: (v: boolean) => void; isPending: boolean };
  toggleBuyerSearchMutation: { mutate: (v: boolean) => void; isPending: boolean };
  toggleUniverseFlagMutation: { mutate: (v: boolean) => void; isPending: boolean };
}

export function WebsiteActionsCard({
  deal,
  dealId,
  effectiveWebsite,
  scoreStats,
  isEnriching,
  handleEnrichFromWebsite,
  setBuyerHistoryOpen,
  toggleContactOwnerMutation,
  toggleBuyerSearchMutation,
  toggleUniverseFlagMutation,
}: WebsiteActionsCardProps) {
  const needsContact = deal?.needs_owner_contact;
  const needsBuyerSearch = deal?.needs_buyer_search;

  return (
    <Card
      className={
        needsContact
          ? 'border-red-400 border-2 bg-red-50 dark:bg-red-950/20'
          : needsBuyerSearch
            ? 'border-blue-400 border-2 bg-blue-50 dark:bg-blue-950/20'
            : ''
      }
    >
      {needsContact && (
        <div className="bg-red-500 text-white text-sm font-semibold px-4 py-2 flex items-center gap-2 rounded-t-lg">
          <PhoneCall className="h-4 w-4 animate-pulse" />
          ACTION REQUIRED: Owner needs to be contacted — we have a buyer ready!
        </div>
      )}
      {!needsContact && needsBuyerSearch && (
        <div className="bg-blue-500 text-white text-sm font-semibold px-4 py-2 flex items-center gap-2 rounded-t-lg">
          <Search className="h-4 w-4 animate-pulse" />
          ACTION REQUIRED: Need to find a buyer for this deal
        </div>
      )}
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className={`text-lg flex items-center gap-2 ${needsContact ? 'text-red-700' : ''}`}
          >
            <Globe className="h-5 w-5" />
            Website & Actions
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        {effectiveWebsite && (
          <p className="text-sm text-muted-foreground truncate">
            {effectiveWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-3">
          {effectiveWebsite && (
            <Button variant="outline" className="gap-2" asChild>
              <a
                href={
                  effectiveWebsite.startsWith('http')
                    ? effectiveWebsite
                    : `https://${effectiveWebsite}`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                View Website
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleEnrichFromWebsite}
            disabled={isEnriching || !effectiveWebsite}
          >
            {isEnriching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Enrich from Website
          </Button>
          <UniverseAssignmentButton
            dealId={dealId}
            dealCategory={deal?.category}
            scoreCount={scoreStats?.count || 0}
          />
          <Button variant="outline" className="gap-2" onClick={() => setBuyerHistoryOpen(true)}>
            <History className="h-4 w-4" />
            Buyer History
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={needsContact ? 'default' : 'outline'}
                  className={`gap-2 font-semibold ${
                    needsContact
                      ? 'bg-red-600 hover:bg-red-700 border-red-600 text-white shadow-md shadow-red-200'
                      : 'border-red-300 text-red-600 hover:bg-red-50 hover:border-red-500'
                  }`}
                  onClick={() => toggleContactOwnerMutation.mutate(!needsContact)}
                  disabled={toggleContactOwnerMutation.isPending}
                >
                  {toggleContactOwnerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PhoneCall className={`h-4 w-4 ${needsContact ? 'animate-pulse' : ''}`} />
                  )}
                  {needsContact ? '\u{1F6A8} Needs Owner Contact' : 'Flag: Contact Owner'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {needsContact
                  ? 'This deal is flagged \u2014 team must contact the owner, we have a buyer ready! Click to clear.'
                  : 'Flag this deal to alert the team that the owner needs to be contacted (buyer is ready).'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={needsBuyerSearch ? 'default' : 'outline'}
                  className={`gap-2 font-semibold ${
                    needsBuyerSearch
                      ? 'bg-blue-600 hover:bg-blue-700 border-blue-600 text-white shadow-md shadow-blue-200'
                      : 'border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-500'
                  }`}
                  onClick={() => toggleBuyerSearchMutation.mutate(!needsBuyerSearch)}
                  disabled={toggleBuyerSearchMutation.isPending}
                >
                  {toggleBuyerSearchMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className={`h-4 w-4 ${needsBuyerSearch ? 'animate-pulse' : ''}`} />
                  )}
                  {needsBuyerSearch ? 'Needs Buyer' : 'Flag: Find Buyer'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {needsBuyerSearch
                  ? 'This deal is flagged — team needs to find a buyer for it. Click to clear.'
                  : 'Flag this deal to indicate the team needs to find a buyer.'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={deal?.universe_build_flagged ? 'default' : 'outline'}
                  className={`gap-2 ${deal?.universe_build_flagged ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}`}
                  onClick={() => toggleUniverseFlagMutation.mutate(!deal?.universe_build_flagged)}
                  disabled={toggleUniverseFlagMutation.isPending}
                >
                  {toggleUniverseFlagMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Flag
                      className={`h-4 w-4 ${deal?.universe_build_flagged ? 'fill-white' : ''}`}
                    />
                  )}
                  {deal?.universe_build_flagged
                    ? 'Flagged: Build Universe'
                    : 'Flag for Universe Build'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {deal?.universe_build_flagged
                  ? 'This deal is flagged \u2014 a team member needs to build a buyer universe for it. Click to remove flag.'
                  : 'Flag this deal to indicate a buyer universe needs to be built by the team.'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Push to Marketplace Queue Button */}
          <PushToMarketplaceButton deal={deal} dealId={dealId} />
        </div>
        {isEnriching && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Queuing enrichment...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PushToMarketplaceButton({
  deal,
  dealId,
}: {
  deal: DealForWebsiteActions;
  dealId: string;
}) {
  const queryClient = useQueryClient();

  if (deal?.pushed_to_marketplace) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200 gap-1 py-1.5 px-3"
            >
              <Store className="h-3 w-3" />
              In Marketplace Queue
              {deal.pushed_to_marketplace_at && (
                <span className="text-blue-500 ml-1">
                  {format(new Date(deal.pushed_to_marketplace_at), 'MMM d, yyyy')}
                </span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            This deal is in the Marketplace Queue. It will be reviewed before going live.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  /**
   * Informational checks: show warnings for missing fields but allow push.
   * Missing fields will still need to be completed before creating a listing.
   */
  const gaps: string[] = [];

  if (!deal?.website) gaps.push('Website');

  if (deal?.revenue == null || deal?.revenue <= 0) gaps.push('Revenue');

  if (deal?.ebitda == null) gaps.push('EBITDA');

  if (!deal?.address_state && !deal?.location) gaps.push('Location / Geography');

  if (!deal?.category && !deal?.industry) gaps.push('Category / Industry');

  if (!deal?.executive_summary && !deal?.description) gaps.push('Description');

  if (!deal?.main_contact_name) gaps.push('Main contact name');

  if (!deal?.main_contact_email) gaps.push('Main contact email');

  return (
    <div className="flex flex-col gap-1">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-500"
              onClick={async () => {
                if (gaps.length > 0) {
                  toast.warning(
                    `Pushed to queue, but still missing: ${gaps.join(', ')}. These must be completed before creating a listing.`,
                    { duration: 5000 },
                  );
                }
                const {
                  data: { user: authUser },
                } = await supabase.auth.getUser();
                const { error } = await supabase
                  .from('listings')
                  .update({
                    pushed_to_marketplace: true,
                    pushed_to_marketplace_at: new Date().toISOString(),
                    pushed_to_marketplace_by: authUser?.id || null,
                  })
                  .eq('id', dealId);
                if (error) {
                  toast.error('Failed to push to marketplace queue');
                } else {
                  if (gaps.length === 0) {
                    toast.success('Deal pushed to Marketplace Queue');
                  }
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
                  queryClient.invalidateQueries({ queryKey: ['marketplace-queue'] });
                }
              }}
            >
              <Store className="h-4 w-4" />
              Push to Marketplace
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {gaps.length === 0
              ? 'Push this deal to the Marketplace Queue for review and publishing.'
              : `Push to queue for review. Missing fields (needed before listing):\n${gaps.map((g) => `• ${g}`).join('\n')}`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {gaps.length > 0 && (
        <span className="text-xs text-amber-600 ml-1">
          Missing for listing: {gaps.join(', ')}
        </span>
      )}
    </div>
  );
}
