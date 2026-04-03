import { Info, MessageCircle, FileText, Building2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useFirmAgreementStatus } from './useMessagesData';
import type { BuyerThread } from './helpers';
import type { MessageReference } from './types';

interface NewMessagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threads: BuyerThread[];
  onSelectGeneral: () => void;
  onSelectThread: (requestId: string) => void;
  onReferenceChange: (ref: MessageReference | null) => void;
  children: React.ReactNode;
}

export function NewMessagePicker({
  open,
  onOpenChange,
  threads,
  onSelectGeneral,
  onSelectThread,
  onReferenceChange,
  children,
}: NewMessagePickerProps) {
  const { data: agreementStatus } = useFirmAgreementStatus();
  const hasFeeAgreement = agreementStatus?.fee_agreement_status === 'signed';

  const dealThreads = threads.filter((t) => t.deal_title !== 'SourceCo Team');

  const handleGeneral = () => {
    onReferenceChange(null);
    onSelectGeneral();
    onOpenChange(false);
  };

  const handleDocuments = () => {
    onReferenceChange({ type: 'document', id: 'fee_agreement', label: 'Documents' });
    onSelectGeneral();
    onOpenChange(false);
  };

  const handleDeal = (thread: BuyerThread) => {
    if (!hasFeeAgreement) return;
    onSelectThread(thread.connection_request_id);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[260px] p-0 rounded-lg shadow-lg border-none"
        style={{ border: '1px solid #F0EDE6' }}
      >
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-[12px] font-semibold tracking-tight" style={{ color: '#0E101A' }}>
            New Message
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: '#9A9A9A' }}>
            Choose a topic
          </p>
        </div>

        <div style={{ borderTop: '1px solid #F0EDE6' }} />

        {/* Quick topics */}
        <div className="py-1.5">
          <button
            onClick={handleGeneral}
            className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[#FAFAF8] transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#9A9A9A' }} />
            <span className="text-[12px] font-medium" style={{ color: '#0E101A' }}>
              General Support
            </span>
          </button>

          <button
            onClick={handleDocuments}
            className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[#FAFAF8] transition-colors"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: '#9A9A9A' }} />
            <span className="text-[12px] font-medium" style={{ color: '#0E101A' }}>
              Documents
            </span>
          </button>
        </div>

        {/* Deal topics */}
        {dealThreads.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid #F0EDE6' }} />
            <div className="py-1.5">
              <div className="px-4 py-1.5 flex items-center gap-1.5">
                <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: '#CBCBCB' }}>
                  Your Deals
                </p>
                {!hasFeeAgreement && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help" style={{ color: '#CBCBCB' }} />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px] text-xs">
                        Sign your Fee Agreement to message about specific deals.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {dealThreads.map((thread) => (
                <button
                  key={thread.connection_request_id}
                  onClick={() => handleDeal(thread)}
                  disabled={!hasFeeAgreement}
                  className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors disabled:cursor-not-allowed"
                  style={{
                    opacity: hasFeeAgreement ? 1 : 0.4,
                  }}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0" style={{ color: '#9A9A9A' }} />
                  <span className="text-[12px] truncate" style={{ color: '#0E101A' }}>
                    {thread.deal_title}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
