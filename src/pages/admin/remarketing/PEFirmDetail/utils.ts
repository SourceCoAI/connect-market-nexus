export const getFirmTypeLabel = (type: string | null) => {
  const labels: Record<string, string> = {
    private_equity: "PE Firm",
    independent_sponsor: "Independent Sponsor",
    search_fund: "Search Fund",
    family_office: "Family Office",
    corporate: "Corporate / Strategic",
    individual_buyer: "Individual / Wealth Buyer",
  };
  return labels[type || ""] || type || "Sponsor";
};
