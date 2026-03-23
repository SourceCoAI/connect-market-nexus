import { z } from 'zod/v3';
import type { User } from '@/types';

// Protected signup flow states - NEVER MODIFY WITHOUT TEAM APPROVAL
export const SIGNUP_FLOW_STATES = {
  IDLE: 'idle',
  SIGNING_UP: 'signing_up',
  SUCCESS: 'success',
  EMAIL_VERIFICATION: 'email_verification',
  PENDING_APPROVAL: 'pending_approval',
  ERROR: 'error'
} as const;

export type SignupFlowState = typeof SIGNUP_FLOW_STATES[keyof typeof SIGNUP_FLOW_STATES];

// Protected state transitions - CRITICAL: DO NOT MODIFY
export const ALLOWED_SIGNUP_TRANSITIONS: Record<SignupFlowState, SignupFlowState[]> = {
  [SIGNUP_FLOW_STATES.IDLE]: [SIGNUP_FLOW_STATES.SIGNING_UP],
  [SIGNUP_FLOW_STATES.SIGNING_UP]: [SIGNUP_FLOW_STATES.SUCCESS, SIGNUP_FLOW_STATES.ERROR],
  [SIGNUP_FLOW_STATES.SUCCESS]: [SIGNUP_FLOW_STATES.EMAIL_VERIFICATION],
  [SIGNUP_FLOW_STATES.EMAIL_VERIFICATION]: [SIGNUP_FLOW_STATES.PENDING_APPROVAL],
  [SIGNUP_FLOW_STATES.PENDING_APPROVAL]: [], // Terminal state
  [SIGNUP_FLOW_STATES.ERROR]: [SIGNUP_FLOW_STATES.IDLE, SIGNUP_FLOW_STATES.SIGNING_UP]
};

// Signup form validation schema with conditional validation
export const signupFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  company: z.string().min(1, 'Company is required'),
  buyerType: z.enum(['corporate', 'privateEquity', 'familyOffice', 'searchFund', 'individual', 'independentSponsor', 'advisor', 'businessOwner']),
  website: z.string().optional().or(z.literal('')),
  phone_number: z.string().optional(),
  linkedinProfile: z.string().optional().or(z.literal('')),
  idealTargetDescription: z.string().optional(),
  businessCategories: z.array(z.string()).optional(),
  targetLocations: z.string().optional(),
  revenueRangeMin: z.string().optional(),
  revenueRangeMax: z.string().optional(),
  specificBusinessSearch: z.string().optional(),
  // New common fields
  jobTitle: z.string().optional(),
  
  // Corporate/PE fields
  estimatedRevenue: z.string().optional(),
  fundSize: z.string().optional(),
  investmentSize: z.string().optional(),
  aum: z.string().optional(),
  
  // Private Equity fields
  portfolioCompanyAddon: z.string().optional(),
  deployingCapitalNow: z.string().optional(),
  
  // Corporate Development fields
  owningBusinessUnit: z.string().optional(),
  dealSizeBand: z.string().optional(),
  integrationPlan: z.array(z.string()).optional(),
  corpdevIntent: z.string().optional(),
  
  // Family Office fields
  discretionType: z.string().optional(),
  permanentCapital: z.boolean().optional(),
  operatingCompanyTargets: z.array(z.string()).optional(),
  
  // Independent Sponsor fields
  committedEquityBand: z.string().optional(),
  equitySource: z.array(z.string()).optional(),
  flexSubXmEbitda: z.boolean().optional(),
  backersSummary: z.string().optional(),
  deploymentTiming: z.string().optional(),
  
  // Search Fund fields (redesigned)
  searchType: z.string().optional(),
  acqEquityBand: z.string().optional(),
  financingPlan: z.array(z.string()).optional(),
  flexSub2mEbitda: z.boolean().optional(),
  anchorInvestorsSummary: z.string().optional(),
  searchStage: z.string().optional(),
  
  // Legacy Search Fund fields (keep for compatibility)
  isFunded: z.string().optional(),
  fundedBy: z.string().optional(),
  targetCompanySize: z.string().optional(),
  
  // Advisor/Banker fields
  onBehalfOfBuyer: z.string().optional(),
  buyerRole: z.string().optional(),
  buyerOrgUrl: z.string().optional(),
  mandateBlurb: z.string().optional(),
  
  // Business Owner fields
  ownerIntent: z.string().optional(),
  ownerTimeline: z.string().optional(),
  
  // Individual fields (enhanced)
  fundingSource: z.string().optional(),
  needsLoan: z.string().optional(),
  idealTarget: z.string().optional(),
  maxEquityTodayBand: z.string().optional(),
  usesBankFinance: z.string().optional(),
  
  // New Step 4 fields
  dealIntent: z.string().optional(),
  exclusions: z.array(z.string()).optional(),
  includeKeywords: z.array(z.string()).optional()
}).refine((data) => {
  // Conditional validation for Search Fund (new fields)
  if (data.buyerType === 'searchFund') {
    if (!data.searchType) return false;
    if (!data.acqEquityBand) return false;
    if (!data.financingPlan || data.financingPlan.length === 0) return false;
    // flexSub2mEbitda is required - can be true or false but must be set
    if (data.flexSub2mEbitda === undefined) return false;
  }
  
  // Conditional validation for Private Equity
  if (data.buyerType === 'privateEquity') {
    if (!data.deployingCapitalNow) return false;
  }
  
  // Conditional validation for Corporate Development
  if (data.buyerType === 'corporate') {
    if (!data.dealSizeBand) return false;
  }
  
  // Conditional validation for Family Office
  if (data.buyerType === 'familyOffice') {
    if (!data.discretionType) return false;
  }
  
  // Conditional validation for Independent Sponsor
  if (data.buyerType === 'independentSponsor') {
    if (!data.committedEquityBand) return false;
    if (!data.equitySource || data.equitySource.length === 0) return false;
    // flexSubXmEbitda is required - can be true or false but must be set
    if (data.flexSubXmEbitda === undefined) return false;
  }
  
  // Conditional validation for Individual
  if (data.buyerType === 'individual') {
    if (!data.fundingSource || !data.needsLoan || !data.idealTarget) return false;
  }
  
  return true;
}, {
  message: "Please complete all required fields for your buyer type",
  path: ["buyerType"]
}).refine((data) => {
  return !!(data.website || data.linkedinProfile);
}, {
  message: "Please provide at least a website or LinkedIn profile so we can verify your credibility",
  path: ["website"]
});

export type SignupFormData = z.infer<typeof signupFormSchema>;

// Protected auth context interface
export interface ProtectedAuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (userData: Partial<User>, password: string) => Promise<void>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  isLoading: boolean;
  isAdmin: boolean;
  isBuyer: boolean;
  authChecked: boolean;
  // Protected signup flow state
  signupFlowState: SignupFlowState;
  transitionSignupState: (newState: SignupFlowState) => void;
}

// State transition guard
export class SignupStateTransitionError extends Error {
  constructor(from: SignupFlowState, to: SignupFlowState) {
    super(`Invalid signup state transition from ${from} to ${to}`);
    this.name = 'SignupStateTransitionError';
  }
}

export function validateSignupStateTransition(
  currentState: SignupFlowState,
  newState: SignupFlowState
): void {
  const allowedTransitions = ALLOWED_SIGNUP_TRANSITIONS[currentState];
  if (!allowedTransitions.includes(newState)) {
    throw new SignupStateTransitionError(currentState, newState);
  }
}