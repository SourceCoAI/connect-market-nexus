import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSimpleListings } from '@/hooks/use-simple-listings';
import { useAllConnectionStatuses } from '@/hooks/marketplace/use-connections';
import { Button } from '@/components/ui/button';
import { Bell, ArrowRight, TrendingUp, Search } from 'lucide-react';
import { CreateDealAlertDialog } from '@/components/deal-alerts/CreateDealAlertDialog';
import { formatCurrency } from '@/lib/currency-utils';

interface PostRejectionPanelProps {
  listingCategory?: string;
  listingLocation?: string;
}

export function PostRejectionPanel({ listingCategory, listingLocation }: PostRejectionPanelProps) {
  const { data: listingsData } = useSimpleListings({
    page: 1,
    perPage: 50,
    search: '',
    category: '',
    location: '',
    revenueMin: undefined,
    revenueMax: undefined,
    ebitdaMin: undefined,
    ebitdaMax: undefined,
  });
  const { data: connectionMap } = useAllConnectionStatuses();

  const similarListings = useMemo(() => {
    if (!listingsData?.listings) return [];
    return listingsData.listings
      .filter((listing) => {
        if (connectionMap?.has(listing.id)) return false;
        const catMatch =
          listingCategory && listing.category?.toLowerCase() === listingCategory.toLowerCase();
        const locMatch =
          listingLocation &&
          listing.location?.toLowerCase().includes(listingLocation.toLowerCase());
        return catMatch || locMatch;
      })
      .slice(0, 3);
  }, [listingsData?.listings, listingCategory, listingLocation, connectionMap]);

  return (
    <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
      {/* Humanised message */}
      <div className="rounded-lg border border-[#F0EDE6] bg-[#F8F6F1] p-5">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-[#0E101A]/30 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-[13px] text-[#0E101A]/60">
              This deal went to a buyer whose profile was a closer strategic fit for the owner's
              specific goals. Your profile is strong for future deals like this one.
            </p>
            <p className="text-[11px] text-[#0E101A]/30">
              Selection is about deal-specific fit, not your qualifications.
            </p>
          </div>
        </div>
      </div>

      {/* Similar active listings */}
      {similarListings.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[#0E101A]/40 mb-2">
            {similarListings.length} similar deal{similarListings.length !== 1 ? 's' : ''} still
            accepting requests:
          </p>
          <div className="space-y-2">
            {similarListings.map((listing) => (
              <Link
                key={listing.id}
                to={`/listing/${listing.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-[#F0EDE6] bg-white hover:border-[#E5DDD0] transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[#0E101A] truncate">{listing.title}</p>
                  <p className="text-[11px] text-[#0E101A]/40 mt-0.5">
                    {listing.category} · {listing.location}
                    {listing.revenue ? ` · ${formatCurrency(listing.revenue)} revenue` : ''}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-[#0E101A]/20 group-hover:text-[#0E101A]/50 shrink-0 ml-2" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <CreateDealAlertDialog
          trigger={
            <Button
              variant="outline"
              size="sm"
              className="text-[11px] gap-1.5 border-[#E5DDD0] text-[#0E101A]/60 hover:text-[#0E101A] hover:border-[#0E101A]"
            >
              <Bell className="h-3 w-3" />
              Alert me for similar deals
            </Button>
          }
        />
        <Link
          to={
            listingCategory
              ? `/marketplace?category=${encodeURIComponent(listingCategory)}`
              : '/marketplace'
          }
        >
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] gap-1.5 border-[#E5DDD0] text-[#0E101A]/60 hover:text-[#0E101A] hover:border-[#0E101A]"
          >
            <Search className="h-3 w-3" />
            Browse {listingCategory || 'marketplace'}
          </Button>
        </Link>
      </div>
    </div>
  );
}
