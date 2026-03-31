import { BuyerType } from "@/types";

export interface SignupFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  company: string;
  website: string;
  linkedinProfile: string;
  phoneNumber: string;
  jobTitle?: string;
  buyerType: BuyerType | "";
  estimatedRevenue: string;
  fundSize: string;
  investmentSize: string[];
  aum: string;
  isFunded: string;
  fundedBy: string;
  targetCompanySize: string;
  fundingSource: string;
  needsLoan: string;
  idealTarget: string;
  idealTargetDescription: string;
  businessCategories: string[];
  targetLocations: string[];
  revenueRangeMin: string;
  revenueRangeMax: string;
  specificBusinessSearch: string;
  targetDealSizeMin: string;
  targetDealSizeMax: string;
  portfolioCompanyAddon?: string;
  deployingCapitalNow?: string;
  owningBusinessUnit?: string;
  dealSizeBand?: string;
  integrationPlan?: string[];
  corpdevIntent?: string;
  discretionType?: string;
  permanentCapital?: boolean;
  operatingCompanyTargets?: string[];
  committedEquityBand?: string;
  equitySource?: string[];
  flexSubxmEbitda?: boolean;
  backersSummary?: string;
  deploymentTiming?: string;
  searchType?: string;
  acqEquityBand?: string;
  financingPlan?: string[];
  flexSub2mEbitda?: boolean;
  anchorInvestorsSummary?: string;
  searchStage?: string;
  onBehalfOfBuyer?: string;
  buyerRole?: string;
  buyerOrgUrl?: string;
  mandateBlurb?: string;
  ownerIntent?: string;
  ownerTimeline?: string;
  usesBank?: string;
  maxEquityToday?: string;
  dealIntent?: string;
  exclusions?: string[];
  includeKeywords?: string[];
  referralSource?: string;
  referralSourceDetail?: string;
  dealSourcingMethods?: string[];
  targetAcquisitionVolume?: string;
}

export const INITIAL_FORM_DATA: SignupFormData = {
  email: "", password: "", confirmPassword: "",
  firstName: "", lastName: "", company: "", website: "", linkedinProfile: "",
  phoneNumber: "", jobTitle: "", buyerType: "",
  estimatedRevenue: "", fundSize: "", investmentSize: [], aum: "",
  isFunded: "", fundedBy: "", targetCompanySize: "", fundingSource: "",
  needsLoan: "", idealTarget: "",
  idealTargetDescription: "", businessCategories: [], targetLocations: [],
  revenueRangeMin: "", revenueRangeMax: "", specificBusinessSearch: "",
  targetDealSizeMin: "", targetDealSizeMax: "",
  portfolioCompanyAddon: "", deployingCapitalNow: "", owningBusinessUnit: "",
  dealSizeBand: "", integrationPlan: [], corpdevIntent: "", discretionType: "",
  permanentCapital: false, operatingCompanyTargets: [],
  committedEquityBand: "", equitySource: [], flexSubxmEbitda: false,
  backersSummary: "", deploymentTiming: "", searchType: "", acqEquityBand: "",
  financingPlan: [], flexSub2mEbitda: false, anchorInvestorsSummary: "",
  searchStage: "", onBehalfOfBuyer: "", buyerRole: "", buyerOrgUrl: "",
  mandateBlurb: "", ownerIntent: "", ownerTimeline: "", usesBank: "",
  maxEquityToday: "", dealIntent: "", exclusions: [], includeKeywords: [],
  referralSource: "", referralSourceDetail: "", dealSourcingMethods: [],
  targetAcquisitionVolume: "",
};

export const STEPS = [
  "Account Information",
  "Personal Details",
  "How did you hear about us?",
  "Buyer Type",
  "Buyer Profile",
];

export const BUYER_TYPE_OPTIONS = [
  { value: "corporate", label: "Corporate Development (Strategic)", description: "Corporate buyers seeking strategic acquisitions" },
  { value: "privateEquity", label: "Private Equity", description: "Investment funds focused on acquiring and growing companies" },
  { value: "familyOffice", label: "Family Office", description: "Private wealth management offices making direct investments" },
  { value: "searchFund", label: "Search Fund", description: "Entrepreneur-led acquisition vehicles" },
  { value: "individual", label: "Individual Investor", description: "High-net-worth individuals making personal investments" },
  { value: "independentSponsor", label: "Independent Sponsor", description: "Deal-by-deal investment professionals" },
  { value: "advisor", label: "Advisor / Banker", description: "Investment bankers and M&A advisors" },
  { value: "businessOwner", label: "Business Owner", description: "Current business owners exploring opportunities" },
];
