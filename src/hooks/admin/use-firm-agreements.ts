/**
 * Firm Agreements hooks — barrel re-export
 *
 * All query hooks live in ./use-firm-agreement-queries.ts
 * All mutation hooks live in ./use-firm-agreement-mutations.ts
 *
 * This file re-exports everything for backward compatibility.
 */

// ─── Types ───

export type AgreementStatus =
  | 'not_started'
  | 'sent'
  | 'redlined'
  | 'under_review'
  | 'signed'
  | 'expired'
  | 'declined';
export type AgreementSource = 'platform' | 'manual' | 'docusign' | 'other';
export type AgreementScope = 'blanket' | 'deal_specific';

export interface FirmAgreement {
  id: string;
  normalized_company_name: string;
  primary_company_name: string;
  website_domain: string | null;
  email_domain: string | null;
  company_name_variations: string[];
  // Legacy booleans (kept for backward compat)
  fee_agreement_signed: boolean;
  fee_agreement_signed_at: string | null;
  fee_agreement_signed_by: string | null;
  fee_agreement_signed_by_name: string | null;
  fee_agreement_email_sent: boolean;
  fee_agreement_email_sent_at: string | null;
  nda_signed: boolean;
  nda_signed_at: string | null;
  nda_signed_by: string | null;
  nda_signed_by_name: string | null;
  nda_email_sent: boolean;
  nda_email_sent_at: string | null;
  // Expanded status fields
  nda_status: AgreementStatus;
  fee_agreement_status: AgreementStatus;
  fee_agreement_scope: AgreementScope;
  fee_agreement_deal_id: string | null;
  nda_expires_at: string | null;
  fee_agreement_expires_at: string | null;
  nda_document_url: string | null;
  fee_agreement_document_url: string | null;
  nda_source?: AgreementSource;
  fee_agreement_source_type?: AgreementSource;
  nda_redline_notes: string | null;
  fee_agreement_redline_notes: string | null;
  nda_redline_document_url: string | null;
  fee_agreement_redline_document_url: string | null;
  nda_custom_terms: string | null;
  fee_agreement_custom_terms: string | null;
  nda_inherited_from_firm_id: string | null;
  fee_inherited_from_firm_id: string | null;
  nda_sent_at: string | null;
  fee_agreement_sent_at: string | null;
  // PandaDoc fields (optional — columns may not exist yet)
  nda_pandadoc_document_id?: string | null;
  nda_pandadoc_status?: string | null;
  nda_pandadoc_signed_url?: string | null;
  fee_pandadoc_document_id?: string | null;
  fee_pandadoc_status?: string | null;
  fee_pandadoc_signed_url?: string | null;
  member_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Include firm members for search
  firm_members?: Array<{
    id: string;
    user: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  }>;
  // Stats for leads, requests, and deals
  lead_count?: number;
  request_count?: number;
  deal_count?: number;
}

export interface FirmMember {
  id: string;
  firm_id: string;
  user_id: string | null;
  member_type: 'marketplace_user' | 'lead';
  lead_email: string | null;
  lead_name: string | null;
  lead_company: string | null;
  connection_request_id: string | null;
  inbound_lead_id: string | null;
  is_primary_contact: boolean;
  added_at: string;
  user?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    company_name: string;
    buyer_type: string;
  } | null;
}

export interface UpdateAgreementStatusParams {
  firmId: string;
  agreementType: 'nda' | 'fee_agreement';
  newStatus: AgreementStatus;
  signedByName?: string | null;
  signedByUserId?: string | null;
  documentUrl?: string | null;
  redlineNotes?: string | null;
  redlineDocumentUrl?: string | null;
  customTerms?: string | null;
  expiresAt?: string | null;
  source?: AgreementSource;
  scope?: AgreementScope;
  dealId?: string | null;
  notes?: string | null;
}

export interface AgreementAuditEntry {
  id: string;
  firm_id: string;
  agreement_type: 'nda' | 'fee_agreement';
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  changed_by_name: string | null;
  document_url: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Query hooks ───

export {
  useFirmAgreements,
  useFirmMembers,
  useAllFirmMembersForSearch,
  useAgreementAuditLog,
  useFirmDomainAliases,
} from './use-firm-agreement-queries';

// ─── Mutation hooks ───

export {
  useUpdateFirmFeeAgreement,
  useUpdateFirmNDA,
  useUpdateAgreementStatus,
  useAddDomainAlias,
  useRemoveDomainAlias,
  useReassignFirmMember,
  useRemoveFirmMember,
} from './use-firm-agreement-mutations';
