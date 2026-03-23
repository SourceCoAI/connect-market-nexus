import { useDealsData } from "./useDealsData";
import { useDealsActions } from "./useDealsActions";

export function useReMarketingDeals() {
  const data = useDealsData();
  const actions = useDealsActions({
    listings: data.listings,
    localOrder: data.localOrder,
    setLocalOrder: data.setLocalOrder,
    sortedListingsRef: data.sortedListingsRef,
    refetchListings: data.refetchListings,
    adminProfiles: data.adminProfiles,
    setHideNotAFit: data.setHideNotAFit,
  });

  return {
    ...data,
    ...actions,
  };
}
