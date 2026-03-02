import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThreadListItem } from "./ThreadListItem";
import type { DealGroup } from "./types";

// ─── Props ───

export interface DealGroupSectionProps {
  group: DealGroup;
  selectedThreadId: string | null;
  onSelectThread: (id: string) => void;
  adminProfiles?: Record<string, unknown> | null;
}

// ─── Component ───

export function DealGroupSection({
  group,
  selectedThreadId,
  onSelectThread,
  adminProfiles,
}: DealGroupSectionProps) {
  const hasSelected = group.threads.some(t => t.connection_request_id === selectedThreadId);
  const [open, setOpen] = useState(hasSelected || group.total_unread > 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors"
          style={{ borderBottom: '1px solid #F0EDE6' }}
        >
          {open
            ? <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: '#CBCBCB' }} />
            : <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: '#CBCBCB' }} />
          }
          <div className="flex-1 min-w-0 text-left">
            <p className={cn(
              "text-xs truncate",
              group.total_unread > 0 ? "font-semibold" : "font-medium"
            )} style={{ color: '#0E101A' }}>
              {group.deal_title}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#CBCBCB' }}>
              {group.threads.length} conversation{group.threads.length !== 1 ? 's' : ''}
            </p>
          </div>
          {group.total_unread > 0 && (
            <span className="flex-shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
              style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}>
              {group.total_unread}
            </span>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {group.threads.map(thread => (
          <ThreadListItem
            key={thread.connection_request_id}
            thread={thread}
            isSelected={selectedThreadId === thread.connection_request_id}
            onClick={() => onSelectThread(thread.connection_request_id)}
            adminProfiles={adminProfiles}
            nested
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
