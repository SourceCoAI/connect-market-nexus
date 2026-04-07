// ─── Shared Types for Message Center ───

export interface InboxThread {
  connection_request_id: string;
  user_id: string | null;
  buyer_name: string;
  buyer_company: string | null;
  buyer_email: string | null;
  buyer_type: string | null;
  deal_title: string | null;
  listing_id: string | null;
  request_status: string;
  conversation_state: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_role: string | null;
  claimed_by: string | null;
  unread_count: number;
  total_messages: number;
  user_message: string | null;
  created_at: string;
  pipeline_deal_id: string | null;
  // Agreement status fields (enriched)
  nda_status: string | null;
  fee_status: string | null;
  firm_name: string | null;
}

export type InboxFilter = "all" | "unread" | "waiting_on_admin" | "waiting_on_buyer" | "claimed" | "closed";
export type ViewMode = "all" | "by_deal" | "by_buyer";

export interface DealGroup {
  listing_id: string;
  deal_title: string;
  threads: InboxThread[];
  total_unread: number;
  last_activity: string;
}

export interface BuyerGroup {
  user_id: string;
  buyer_name: string;
  buyer_company: string | null;
  buyer_email: string | null;
  buyer_type: string | null;
  threads: InboxThread[];
  total_unread: number;
  last_activity: string;
  last_message_preview: string | null;
  last_message_sender_role: string | null;
}

// Activity timeline event for the user profile panel
export interface UserActivityEvent {
  id: string;
  type: 'signup' | 'connection_request' | 'message_sent' | 'message_received' | 'nda_sent' | 'nda_signed' | 'fee_sent' | 'fee_signed' | 'status_change' | 'approval' | 'rejection';
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
