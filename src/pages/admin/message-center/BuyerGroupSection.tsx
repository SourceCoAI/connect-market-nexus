import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Building2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { BuyerGroup } from "./types";

export interface BuyerGroupSectionProps {
  group: BuyerGroup;
  isSelected: boolean;
  selectedThreadId: string | null;
  onClick: () => void;
  onSelectThread: (id: string) => void;
}

export function BuyerGroupSection({
  group,
  isSelected,
  selectedThreadId,
  onClick,
  onSelectThread,
}: BuyerGroupSectionProps) {
  const hasSelectedThread = group.threads.some(t => t.connection_request_id === selectedThreadId);
  const [open, setOpen] = useState(hasSelectedThread);

  const timeLabel = formatDistanceToNow(new Date(group.last_activity), { addSuffix: false });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full" onClick={(e) => {
        // If not already open/selected, select this buyer group
        if (!isSelected) {
          e.preventDefault();
          onClick();
          setOpen(true);
        }
      }}>
        <div
          className="flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-accent/30"
          style={{
            borderBottom: '1px solid #F0EDE6',
            ...(isSelected
              ? { backgroundColor: '#FAFAF8', borderLeft: '2px solid #DEC76B' }
              : { borderLeft: '2px solid transparent' }),
          }}
        >
          <div className="flex-1 min-w-0">
            {/* Row 1: Name + time */}
            <div className="flex items-center justify-between gap-2">
              <span className={cn(
                "text-sm truncate",
                group.total_unread > 0 ? "font-semibold" : "font-normal"
              )} style={{ color: '#0E101A' }}>
                {group.buyer_name}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px]" style={{ color: '#CBCBCB' }}>{timeLabel}</span>
                {open
                  ? <ChevronDown className="w-3 h-3" style={{ color: '#CBCBCB' }} />
                  : <ChevronRight className="w-3 h-3" style={{ color: '#CBCBCB' }} />
                }
              </div>
            </div>

            {/* Row 2: Company */}
            {group.buyer_company && (
              <span className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: '#9A9A9A' }}>
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{group.buyer_company}</span>
              </span>
            )}

            {/* Row 3: Thread count + last message */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-medium" style={{ color: '#9A9A9A' }}>
                {group.threads.length} thread{group.threads.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Row 4: Preview */}
            <p className={cn(
              "text-[11px] mt-0.5 truncate",
              group.total_unread > 0 ? "font-medium" : "font-normal"
            )} style={{ color: group.total_unread > 0 ? '#0E101A' : '#9A9A9A' }}>
              {group.last_message_sender_role === "admin" && "You: "}
              {group.last_message_preview || "No messages yet"}
            </p>
          </div>

          {/* Unread badge */}
          {group.total_unread > 0 && (
            <span className="mt-1 flex-shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
              style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}>
              {group.total_unread}
            </span>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {group.threads.map(thread => (
          <button
            key={thread.connection_request_id}
            onClick={() => onSelectThread(thread.connection_request_id)}
            className="w-full text-left pl-10 pr-4 py-2 transition-colors hover:bg-accent/30"
            style={{
              borderBottom: '1px solid #F0EDE6',
              ...(selectedThreadId === thread.connection_request_id
                ? { backgroundColor: '#FAFAF8' }
                : {}),
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] truncate flex items-center gap-1" style={{ color: '#0E101A' }}>
                <FileText className="w-3 h-3 flex-shrink-0" style={{ color: '#CBCBCB' }} />
                {thread.deal_title || 'General Inquiry'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: '#9A9A9A' }}>{thread.request_status}</span>
                {thread.unread_count > 0 && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
                    style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}>
                    {thread.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
