import { useRef } from 'react';
import { Send, Paperclip, AtSign, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { MAX_ATTACHMENT_SIZE, ACCEPTED_FILE_TYPES } from './types';
import type { MessageReference } from './types';
import { ReferenceChip, ReferencePicker } from './ReferencePicker';
import type { BuyerThread } from './helpers';

// ─── MessageInput ───

interface MessageInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  isSending: boolean;
  isUploading: boolean;
  attachment: File | null;
  onAttachmentChange: (file: File | null) => void;
  placeholder?: string;
  /** Current message reference */
  reference?: MessageReference | null;
  /** Set the reference */
  onReferenceChange?: (ref: MessageReference | null) => void;
  /** Available threads for the reference picker */
  threads?: BuyerThread[];
  /** Available documents for the reference picker */
  documents?: Array<{ type: 'nda' | 'fee_agreement'; label: string }>;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  isSending,
  isUploading,
  attachment,
  onAttachmentChange,
  placeholder = 'Type a message...',
  reference,
  onReferenceChange,
  threads = [],
  documents = [],
}: MessageInputProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'Maximum file size is 10MB.',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }
    onAttachmentChange(file);
    e.target.value = '';
  };

  const canSend = (value.trim() || attachment) && !isSending && !isUploading;
  const showPicker = onReferenceChange && (documents.length > 0 || threads.length > 0);

  return (
    <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid #F0EDE6' }}>
      {/* Reference chip */}
      {reference && onReferenceChange && (
        <div className="mb-2">
          <ReferenceChip
            reference={reference}
            variant="compose"
            onRemove={() => onReferenceChange(null)}
          />
        </div>
      )}

      {/* Attachment chip */}
      {attachment && (
        <div
          className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg text-xs"
          style={{ backgroundColor: '#F8F8F6', color: '#0E101A' }}
        >
          <Paperclip className="h-3 w-3 shrink-0" style={{ color: '#CBCBCB' }} />
          <span className="truncate flex-1">{attachment.name}</span>
          <span className="text-[10px] shrink-0" style={{ color: '#CBCBCB' }}>
            {(attachment.size / 1024).toFixed(0)}KB
          </span>
          <button
            type="button"
            onClick={() => onAttachmentChange(null)}
            className="shrink-0 p-0.5 rounded hover:bg-black/5"
          >
            <X className="h-3 w-3" style={{ color: '#9A9A9A' }} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Reference picker button */}
        {showPicker && (
          <ReferencePicker
            threads={threads}
            documents={documents}
            onSelect={(ref) => onReferenceChange?.(ref)}
          >
            <button
              type="button"
              className="shrink-0 p-1 rounded-full hover:bg-[#F8F8F6] transition-colors"
              title="Reference a document, deal, or request"
            >
              <AtSign className="h-4 w-4" style={{ color: reference ? '#DEC76B' : '#CBCBCB' }} />
            </button>
          </ReferencePicker>
        )}

        {/* Attach file button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 p-1 rounded-full hover:bg-[#F8F8F6] transition-colors"
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" style={{ color: '#CBCBCB' }} />
        </button>

        <input
          type="text"
          value={value}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          className="flex-1 text-sm py-2 bg-transparent focus:outline-none"
          style={{ color: '#0E101A' }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full transition-colors disabled:opacity-30"
          style={{ backgroundColor: canSend ? '#0E101A' : 'transparent' }}
        >
          {isUploading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send
              className="w-3.5 h-3.5"
              style={{ color: canSend ? '#FFFFFF' : '#CBCBCB' }}
            />
          )}
        </button>
      </div>
    </div>
  );
}
