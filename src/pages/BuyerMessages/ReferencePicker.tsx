import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  
  FileText,
  ShoppingBag,
  MessageSquare,
  X,
  Shield,
  FileSignature,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageReference, ReferenceType } from './types';
import type { BuyerThread } from './helpers';

// ─── ReferenceChip ───
// Renders a styled chip for a referenced item (in compose bar or message bubble).

export function ReferenceChip({
  reference,
  variant = 'compose',
  onRemove,
}: {
  reference: MessageReference;
  variant?: 'compose' | 'buyer' | 'admin';
  onRemove?: () => void;
}) {
  const iconMap: Record<ReferenceType, React.ReactNode> = {
    document: reference.id === 'nda'
      ? <Shield className="h-3 w-3" />
      : <FileSignature className="h-3 w-3" />,
    deal: <ShoppingBag className="h-3 w-3" />,
    request: <MessageSquare className="h-3 w-3" />,
  };

  const labelMap: Record<ReferenceType, string> = {
    document: 'Document',
    deal: 'Deal',
    request: 'Request',
  };

  const isCompose = variant === 'compose';
  const isBuyer = variant === 'buyer';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium',
        isCompose && 'mr-1',
      )}
      style={
        isBuyer
          ? { backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF' }
          : variant === 'admin'
            ? { backgroundColor: '#F7F4DD', color: '#0E101A', border: '1px solid #E5DDD0' }
            : { backgroundColor: '#F8F8F6', color: '#0E101A', border: '1px solid #F0EDE6' }
      }
    >
      <span style={{ color: isBuyer ? 'rgba(255,255,255,0.6)' : '#DEC76B' }}>
        {iconMap[reference.type]}
      </span>
      <span style={{ color: isBuyer ? 'rgba(255,255,255,0.5)' : '#9A9A9A' }}>
        {labelMap[reference.type]}:
      </span>
      <span className="truncate max-w-[140px]">{reference.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-0.5 rounded hover:bg-black/5"
        >
          <X className="h-2.5 w-2.5" style={{ color: '#9A9A9A' }} />
        </button>
      )}
    </span>
  );
}

// ─── ReferencePicker ───
// Popover for selecting documents, deals, or connection requests to reference.

interface ReferencePickerProps {
  threads: BuyerThread[];
  documents: Array<{ type: 'nda' | 'fee_agreement'; label: string }>;
  onSelect: (ref: MessageReference) => void;
  children: React.ReactNode;
}

type Tab = 'document' | 'deal' | 'request';

export function ReferencePicker({
  threads,
  documents,
  onSelect,
  children,
}: ReferencePickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('document');

  const handleSelect = (ref: MessageReference) => {
    onSelect(ref);
    setOpen(false);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'document', label: 'Documents', icon: <FileText className="h-3.5 w-3.5" /> },
    { key: 'deal', label: 'Deals', icon: <ShoppingBag className="h-3.5 w-3.5" /> },
    { key: 'request', label: 'My Requests', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[300px] p-0 rounded-xl shadow-lg"
        style={{ border: '1px solid #F0EDE6' }}
      >
        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: '#F0EDE6' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors',
                tab === t.key ? '' : 'hover:bg-[#FAFAF8]',
              )}
              style={{
                color: tab === t.key ? '#0E101A' : '#9A9A9A',
                borderBottom: tab === t.key ? '2px solid #DEC76B' : '2px solid transparent',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <ScrollArea className="max-h-[200px]">
          <div className="py-1">
            {tab === 'document' && (
              <>
                {documents.length === 0 ? (
                  <p className="px-4 py-3 text-xs" style={{ color: '#9A9A9A' }}>
                    No documents available
                  </p>
                ) : (
                  documents.map((doc) => (
                    <button
                      key={doc.type}
                      onClick={() =>
                        handleSelect({ type: 'document', id: doc.type, label: doc.label })
                      }
                      className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-[#FAFAF8] transition-colors"
                    >
                      {doc.type === 'nda' ? (
                        <Shield className="h-3.5 w-3.5" style={{ color: '#DEC76B' }} />
                      ) : (
                        <FileSignature className="h-3.5 w-3.5" style={{ color: '#DEC76B' }} />
                      )}
                      <span className="text-xs font-medium" style={{ color: '#0E101A' }}>
                        {doc.label}
                      </span>
                    </button>
                  ))
                )}
              </>
            )}

            {tab === 'deal' && (
              <>
                {threads.length === 0 ? (
                  <p className="px-4 py-3 text-xs" style={{ color: '#9A9A9A' }}>
                    No deals to reference
                  </p>
                ) : (
                  threads.map((t) => (
                    <button
                      key={`deal-${t.listing_id}`}
                      onClick={() =>
                        handleSelect({
                          type: 'deal',
                          id: t.listing_id,
                          label: t.deal_title,
                        })
                      }
                      className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-[#FAFAF8] transition-colors"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" style={{ color: '#DEC76B' }} />
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block" style={{ color: '#0E101A' }}>
                          {t.deal_title}
                        </span>
                        {t.deal_category && (
                          <span className="text-[10px]" style={{ color: '#9A9A9A' }}>
                            {t.deal_category}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </>
            )}

            {tab === 'request' && (
              <>
                {threads.length === 0 ? (
                  <p className="px-4 py-3 text-xs" style={{ color: '#9A9A9A' }}>
                    No connection requests
                  </p>
                ) : (
                  threads.map((t) => (
                    <button
                      key={`req-${t.connection_request_id}`}
                      onClick={() =>
                        handleSelect({
                          type: 'request',
                          id: t.connection_request_id,
                          label: t.deal_title,
                        })
                      }
                      className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-[#FAFAF8] transition-colors"
                    >
                      <MessageSquare className="h-3.5 w-3.5" style={{ color: '#DEC76B' }} />
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block" style={{ color: '#0E101A' }}>
                          {t.deal_title}
                        </span>
                        <span className="text-[10px]" style={{ color: '#9A9A9A' }}>
                          {t.request_status === 'approved' ? 'Connected' : 'Under Review'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
