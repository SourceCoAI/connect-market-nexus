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
}

export type InboxFilter = "all" | "unread" | "waiting_on_admin" | "waiting_on_buyer" | "claimed" | "closed";
export type ViewMode = "all" | "by_deal";

export interface DealGroup {
  listing_id: string;
  deal_title: string;
  threads: InboxThread[];
  total_unread: number;
  last_activity: string;
}
