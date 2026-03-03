export const getFirmTypeLabel = (type: string | null) => {
  const labels: Record<string, string> = {
    private_equity: "Private Equity",
    pe_firm: "Private Equity",
    independent_sponsor: "Independent Sponsor",
    search_fund: "Search Fund",
    family_office: "Family Office",
  };
  return labels[type || ""] || type || "Sponsor";
};
