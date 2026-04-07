/**
 * Types for the Microsoft Outlook email integration.
 */

export type EmailDirection = 'inbound' | 'outbound';
export type EmailConnectionStatus = 'active' | 'expired' | 'revoked' | 'error';
export type EmailAccessAction = 'viewed' | 'sent' | 'replied';

export interface EmailMessage {
  id: string;
  microsoft_message_id: string;
  microsoft_conversation_id: string | null;
  contact_id: string;
  deal_id: string | null;
  sourceco_user_id: string;
  direction: EmailDirection;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
  synced_at: string;
  has_attachments: boolean;
  attachment_metadata: AttachmentMetadata[];
  created_at: string;
}

export interface AttachmentMetadata {
  name: string;
  size: number;
  contentType: string;
}

export interface EmailConnection {
  id: string;
  sourceco_user_id: string;
  microsoft_user_id: string;
  email_address: string;
  token_expires_at: string | null;
  webhook_subscription_id: string | null;
  webhook_expires_at: string | null;
  status: EmailConnectionStatus;
  last_sync_at: string | null;
  last_sync_error_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAccessLog {
  id: string;
  sourceco_user_id: string;
  email_message_id: string | null;
  action: EmailAccessAction;
  accessed_at: string;
  ip_address: string | null;
  metadata: Record<string, unknown>;
}

export interface EmailThread {
  conversationId: string;
  subject: string;
  lastMessageAt: string;
  messageCount: number;
  lastPreview: string;
  participants: string[];
  messages: EmailMessage[];
}

export interface SendEmailRequest {
  contactId: string;
  dealId?: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  replyToMessageId?: string;
  attachments?: { name: string; contentBytes: string; contentType: string }[];
}

export interface ContactAssignment {
  id: string;
  sourceco_user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
}
