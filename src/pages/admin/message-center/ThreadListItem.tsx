import {
  Building2,
  FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { InboxThread } from "./types";

// ─── Props ───

export interface ThreadListItemProps {
  thread: InboxThread;
  isSelected: boolean;
  onClick: () => void;
  adminProfiles?: Record<string, unknown> | null;
  nested?: boolean;
}

// ─── Component ───

export function ThreadListItem({
  thread,
  isSelected,
  onClick,
  nested,
}: ThreadListItemProps) {
  const timeLabel = thread.last_message_at
    ? formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: false })
    : formatDistanceToNow(new Date(thread.created_at), { addSuffix: false });

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 transition-colors",
        nested && "pl-10",
      )}
      style={{
        borderBottom: '1px solid #F0EDE6',
        ...(isSelected
          ? { backgroundColor: '#FAFAF8', borderLeft: '2px solid #DEC76B' }
          : { borderLeft: '2px solid transparent' }),
      }}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          {/* Row 1: Buyer name + time */}
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              "text-sm truncate",
              thread.unread_count > 0 ? "font-semibold" : "font-normal"
            )} style={{ color: '#0E101A' }}>
              {thread.buyer_name}
            </span>
            <span className="text-[10px] flex-shrink-0" style={{ color: '#CBCBCB' }}>{timeLabel}</span>
          </div>

          {/* Row 2: Company + deal */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {thread.buyer_company && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: '#9A9A9A' }}>
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{thread.buyer_company}</span>
              </span>
            )}
            {!nested && thread.deal_title && (
              <>
                {thread.buyer_company && <span style={{ color: '#F0EDE6' }}>·</span>}
                <span className="text-[11px] truncate flex items-center gap-1" style={{ color: '#CBCBCB' }}>
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{thread.deal_title}</span>
                </span>
              </>
            )}
          </div>

          {/* Row 3: Request status only */}
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] font-medium" style={{
              color: thread.request_status === 'approved' ? '#0E101A'
                : thread.request_status === 'rejected' ? '#991B1B'
                : '#9A9A9A'
            }}>
              {thread.request_status}
            </span>
          </div>

          {/* Row 4: Last message preview */}
          <p className={cn(
            "text-[11px] mt-0.5 truncate",
            thread.unread_count > 0 ? "font-medium" : "font-normal"
          )} style={{ color: thread.unread_count > 0 ? '#0E101A' : '#9A9A9A' }}>
            {thread.last_message_sender_role === "admin" && "You: "}
            {thread.last_message_preview || thread.user_message || "No messages yet"}
          </p>
        </div>

        {/* Unread badge */}
        {thread.unread_count > 0 && (
          <span className="mt-1 flex-shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
            style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}>
            {thread.unread_count}
          </span>
        )}
      </div>
    </button>
  );
}
