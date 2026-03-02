import { Download } from 'lucide-react';

import type { MessageVariant } from './types';

// ─── AttachmentChip ───

export function AttachmentChip({
  fileName,
  url,
  variant,
}: {
  fileName: string;
  url: string;
  variant: MessageVariant;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
      style={{
        backgroundColor: variant === 'buyer' ? 'rgba(255,255,255,0.1)' : '#F8F8F6',
        color: variant === 'buyer' ? '#FFFFFF' : '#0E101A',
      }}
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[200px]">{fileName}</span>
    </a>
  );
}

// ─── MessageBody ───

export function MessageBody({ body, variant }: { body: string; variant: MessageVariant }) {
  const attachmentRegex = /\[📎\s+([^\]]+)\]\(([^)]+)\)/g;
  const segments: Array<
    { type: 'text'; value: string } | { type: 'attachment'; fileName: string; url: string }
  > = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = attachmentRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: body.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'attachment', fileName: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ type: 'text', value: body.slice(lastIndex) });
  }

  return (
    <div
      className="whitespace-pre-wrap break-words space-y-1.5"
      style={{ overflowWrap: 'anywhere' }}
    >
      {segments.map((seg, segIdx) => {
        if (seg.type === 'attachment') {
          return (
            <AttachmentChip key={segIdx} fileName={seg.fileName} url={seg.url} variant={variant} />
          );
        }
        const parts = seg.value.split(/(https?:\/\/[^\s]+)/g);
        const trimmed = seg.value.trim();
        if (!trimmed) return null;
        return (
          <p
            key={segIdx}
            className="whitespace-pre-wrap break-words"
            style={{ overflowWrap: 'anywhere' }}
          >
            {parts.map((part, i) => {
              if (/^https?:\/\//.test(part)) {
                let displayUrl: string;
                try {
                  const url = new URL(part);
                  const path =
                    url.pathname.length > 30 ? url.pathname.slice(0, 30) + '\u2026' : url.pathname;
                  displayUrl = url.hostname + path;
                } catch {
                  displayUrl = part.length > 50 ? part.slice(0, 50) + '\u2026' : part;
                }

                const linkColor =
                  variant === 'buyer'
                    ? 'underline underline-offset-2 opacity-80'
                    : 'underline underline-offset-2';

                return (
                  <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${linkColor} hover:opacity-80 break-all text-sm`}
                  >
                    {displayUrl}
                  </a>
                );
              }
              return <span key={i}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

// ─── TypingIndicator ───

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-[16px] rounded-bl-[6px] px-4 py-3"
        style={{ backgroundColor: '#F8F8F6' }}
      >
        <div className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: '#CBCBCB', animationDelay: '0ms', animationDuration: '1s' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: '#CBCBCB', animationDelay: '150ms', animationDuration: '1s' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: '#CBCBCB', animationDelay: '300ms', animationDuration: '1s' }}
          />
        </div>
      </div>
    </div>
  );
}
