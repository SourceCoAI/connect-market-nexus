import {
  Building2,
  MapPin,
  Globe,
  Briefcase,
  TrendingUp,
  Shield,
} from "lucide-react";

import type { FilterFieldDef } from "./types";

/** Buyer Universe / Tracker detail — fields match remarketing_buyers columns */
export const BUYER_UNIVERSE_FIELDS: FilterFieldDef[] = [
  {
    key: "company_name",
    label: "Company Name",
    type: "text",
    group: "Core",
    icon: Building2,
  },
  {
    key: "pe_firm_name",
    label: "PE Firm Name",
    type: "text",
    group: "Core",
    icon: Building2,
  },
  {
    key: "buyer_type",
    label: "Buyer Type",
    type: "select",
    group: "Core",
    icon: Briefcase,
    options: [
      { label: "PE Firm", value: "private_equity" },
      { label: "Corporate", value: "corporate" },
      { label: "Family Office", value: "family_office" },
      { label: "Ind. Sponsor", value: "independent_sponsor" },
      { label: "Search Fund", value: "search_fund" },
      { label: "Individual", value: "individual_buyer" },
    ],
  },
  {
    key: "hq_state",
    label: "HQ State",
    type: "select",
    group: "Location",
    icon: MapPin,
    dynamicOptions: true,
  },
  {
    key: "geographic_footprint",
    label: "Geographic Footprint",
    type: "multi_select",
    group: "Location",
    icon: Globe,
    dynamicOptions: true,
  },
  {
    key: "alignment_score",
    label: "Alignment Score",
    type: "number",
    group: "Scoring",
    icon: TrendingUp,
  },
  {
    key: "has_fee_agreement",
    label: "Fee Agreement",
    type: "boolean",
    group: "Admin",
    icon: Shield,
  },
  {
    key: "thesis_summary",
    label: "Thesis Summary",
    type: "text",
    group: "Business",
    icon: Briefcase,
  },
];
