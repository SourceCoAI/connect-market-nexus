import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";

// ─── Skeleton Loading State ───

export function MessageCenterSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden h-full" style={{ border: '1px solid #F0EDE6', backgroundColor: '#FFFFFF' }}>
      <div className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-start gap-4">
            <Skeleton className="h-8 w-8 rounded-full" style={{ backgroundColor: '#F0EDE6' }} />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-[200px]" style={{ backgroundColor: '#F0EDE6' }} />
              <Skeleton className="h-3 w-[300px]" style={{ backgroundColor: '#F8F8F6' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ───

export function MessageCenterEmpty() {
  return (
    <div className="rounded-xl overflow-hidden h-full flex items-center justify-center" style={{ border: '1px solid #F0EDE6', backgroundColor: '#FFFFFF' }}>
      <div className="text-center py-16">
        <Inbox className="h-12 w-12 mx-auto mb-4" style={{ color: '#F0EDE6' }} />
        <h3 className="text-base font-medium mb-1" style={{ color: '#0E101A' }}>No conversations yet</h3>
        <p className="text-xs max-w-xs mx-auto" style={{ color: '#9A9A9A' }}>
          Messages will appear here when buyers start conversations through connection requests.
        </p>
      </div>
    </div>
  );
}
