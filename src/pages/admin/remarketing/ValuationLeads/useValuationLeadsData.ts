/**
 * Barrel re-export composing query and mutation hooks for ValuationLeads.
 *
 * All original exports remain accessible from this path
 * for backwards compatibility.
 */

import { useValuationLeadsQueries, PAGE_SIZE } from './useValuationLeadsQueries';
import { useValuationLeadsMutations } from './useValuationLeadsMutations';

export { PAGE_SIZE };
export { useValuationLeadsMutations };

export function useValuationLeadsData() {
  const queries = useValuationLeadsQueries();

  const mutations = useValuationLeadsMutations({
    leads: queries.leads,
    filteredLeads: queries.filteredLeads,
    selectedIds: queries.selectedIds,
    setSelectedIds: queries.setSelectedIds,
    enrichmentSummary: queries.enrichmentSummary,
    dismissSummary: queries.dismissSummary,
  });

  return {
    ...queries,
    ...mutations,
  };
}
