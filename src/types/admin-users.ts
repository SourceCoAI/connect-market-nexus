// Comprehensive type definitions for admin user management

import type { ApprovalStatus } from './status-enums';
export type { ApprovalStatus };

/** @deprecated Use AdminUser instead */
export type User = AdminUser;

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company?: string;
  website?: string;
  phone_number?: string;
  buyer_type?: string;
  approval_status: ApprovalStatus;
  email_verified: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  business_categories?: string[] | null;
  revenue_range_min?: number;
  revenue_range_max?: number;
  onboarding_completed?: boolean;
  fee_agreement_signed?: boolean;
  fee_agreement_signed_at?: string;
  fee_agreement_email_sent?: boolean;
  fee_agreement_email_sent_at?: string;
  nda_email_sent?: boolean;
  nda_email_sent_at?: string;
  nda_signed?: boolean;
  nda_signed_at?: string;
  linkedin_profile?: string;
  bio?: string;
  ideal_target_description?: string;
  target_locations?: string;
  specific_business_search?: string;
  estimated_revenue?: string;
  fund_size?: string;
  investment_size?: string;
  aum?: string;
  is_funded?: string;
  funded_by?: string;
  target_company_size?: string;
  funding_source?: string;
  needs_loan?: string;
  ideal_target?: string;
  // Sourcing & Discovery fields
  referral_source?: string;
  referral_source_detail?: string;
  deal_sourcing_methods?: string[] | unknown;
  target_acquisition_volume?: string;
}

export interface AdminConnectionRequest {
  id: string;
  user_id: string;
  listing_id: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_comment?: string;
  user_message?: string;
  created_at: string;
  updated_at: string;
  decision_at?: string;
  followed_up?: boolean;
  followed_up_at?: string;
  followed_up_by?: string;
}

export interface UserActionHandlers {
  handleUserApproval: (user: User) => void;
  handleUserRejection: (user: User) => void;
  handleMakeAdmin: (user: User) => void;
  handleRevokeAdmin: (user: User) => void;
  handleDeleteUser: (user: User) => void;
  handleCustomApprovalEmail: (user: User, options: ApprovalEmailOptions) => Promise<void>;
}

export interface ApprovalEmailOptions {
  subject: string;
  message: string;
  customSignatureHtml?: string;
  customSignatureText?: string;
}

export interface UserActionsState {
  isDialogOpen: boolean;
  selectedUser: User | null;
  actionType: 'approve' | 'reject' | 'make_admin' | 'revoke_admin' | 'delete' | null;
  isLoading: boolean;
}

export interface QueryCacheUpdate {
  queryKey: readonly string[];
  updater: (old: User[] | undefined) => User[] | undefined;
}
