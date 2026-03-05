/**
 * Data Room hooks — barrel re-export
 *
 * All query hooks live in ./use-data-room-queries.ts
 * All mutation hooks live in ./use-data-room-mutations.ts
 *
 * This file re-exports everything for backward compatibility.
 */

// ─── Types ───

export interface DataRoomDocument {
  id: string;
  deal_id: string;
  folder_name: string;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  storage_path: string;
  document_category: 'anonymous_teaser' | 'full_memo' | 'data_room';
  is_generated: boolean;
  version: number;
  allow_download: boolean;
  status: 'active' | 'archived' | 'deleted';
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataRoomAccessRecord {
  access_id: string;
  remarketing_buyer_id: string | null;
  marketplace_user_id: string | null;
  contact_id: string | null;
  buyer_name: string;
  buyer_company: string;
  contact_title: string | null;
  can_view_teaser: boolean;
  can_view_full_memo: boolean;
  can_view_data_room: boolean;
  fee_agreement_signed: boolean;
  fee_agreement_override: boolean;
  fee_agreement_override_reason: string | null;
  granted_at: string;
  revoked_at: string | null;
  expires_at: string | null;
  last_access_at: string | null;
  access_token: string | null;
  link_sent_at: string | null;
  link_sent_to_email: string | null;
  link_sent_via: string | null;
}

export interface LeadMemo {
  id: string;
  deal_id: string;
  memo_type: 'anonymous_teaser' | 'full_memo';
  branding: string;
  content: Record<string, unknown>;
  html_content: string | null;
  status: 'draft' | 'published' | 'archived';
  generated_from: Record<string, unknown> | null;
  version: number;
  pdf_storage_path: string | null;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DistributionLogEntry {
  log_id: string;
  buyer_name: string;
  buyer_company: string;
  memo_type: string;
  channel: string;
  sent_by_name: string;
  sent_at: string;
  email_address: string | null;
  notes: string | null;
}

export interface AuditLogEntry {
  id: string;
  deal_id: string;
  document_id: string | null;
  user_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ─── Query hooks ───

export {
  useDataRoomDocuments,
  useDataRoomAccess,
  useLeadMemos,
  useDistributionLog,
  useDataRoomAuditLog,
  useBuyerDealHistory,
} from './use-data-room-queries';

// ─── Mutation hooks ───

export {
  useUploadDocument,
  useDeleteDocument,
  useUpdateAccess,
  useRevokeAccess,
  useBulkUpdateAccess,
  useDocumentUrl,
  useGenerateMemo,
  useGenerateTeaser,
  useUpdateMemo,
  usePublishMemo,
  useLogManualSend,
  useDraftOutreachEmail,
  useSendMemoEmail,
} from './use-data-room-mutations';
