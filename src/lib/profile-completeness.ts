import { User, BuyerType } from '@/types';
import { FIELD_LABELS } from '@/lib/buyer-type-fields';

// Core required fields every buyer must have
const UNIVERSAL_REQUIRED_FIELDS = [
  'first_name',
  'last_name',
  'company',
  'phone_number',
  'buyer_type',
] as const;

// Critical buyer-type-specific required fields (subset of all type fields)
const BUYER_TYPE_REQUIRED_FIELDS: Partial<Record<string, readonly string[]>> = {
  corporate: ['estimated_revenue', 'deal_size_band', 'corpdev_intent'],
  privateEquity: ['fund_size', 'investment_size', 'aum'],
  private_equity: ['fund_size', 'investment_size', 'aum'],
  familyOffice: ['fund_size', 'investment_size', 'aum'],
  family_office: ['fund_size', 'investment_size', 'aum'],
  searchFund: ['search_type', 'acq_equity_band', 'search_stage'],
  search_fund: ['search_type', 'acq_equity_band', 'search_stage'],
  individual: ['funding_source', 'max_equity_today_band'],
  individual_buyer: ['funding_source', 'max_equity_today_band'],
  independentSponsor: ['committed_equity_band', 'equity_source', 'deployment_timing'],
  independent_sponsor: ['committed_equity_band', 'equity_source', 'deployment_timing'],
  advisor: ['on_behalf_of_buyer', 'buyer_role'],
  businessOwner: ['owner_intent', 'owner_timeline'],
  business_owner: ['owner_intent', 'owner_timeline'],
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Get all required field keys for a given buyer type. */
export const getRequiredFields = (buyerType?: BuyerType): string[] => {
  const fields: string[] = [...UNIVERSAL_REQUIRED_FIELDS];
  if (buyerType && BUYER_TYPE_REQUIRED_FIELDS[buyerType]) {
    fields.push(...BUYER_TYPE_REQUIRED_FIELDS[buyerType]);
  }
  return fields;
};

/** Returns field keys that are missing values. */
export const getMissingRequiredFields = (user: Partial<User>): string[] => {
  const required = getRequiredFields(user.buyer_type as BuyerType | undefined);
  return required.filter((key) => !hasValue((user as Record<string, unknown>)[key]));
};

/** Returns human-readable labels for missing fields. */
export const getMissingFieldLabels = (user: Partial<User>): string[] => {
  const missing = getMissingRequiredFields(user);
  return missing.map((key) => (FIELD_LABELS as Record<string, string>)[key] ?? key);
};

/** True when every required field has a value. */
export const isProfileComplete = (user: Partial<User>): boolean => {
  return getMissingRequiredFields(user).length === 0;
};

/** 0-100 percentage of required fields that are filled. */
export const getProfileCompletionPercentage = (user: Partial<User>): number => {
  const required = getRequiredFields(user.buyer_type as BuyerType | undefined);
  if (required.length === 0) return 100;
  const filled = required.filter((key) => hasValue((user as Record<string, unknown>)[key]));
  return Math.round((filled.length / required.length) * 100);
};
