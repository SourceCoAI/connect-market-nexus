import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { MessageReference } from './types';
import type { BuyerThread } from './helpers';
import { getStatusLabel } from './helpers';
import { useFirmAgreementStatus } from './useMessagesData';
import { resolveAgreementStatus } from '@/lib/agreement-status';

// ─── ReferencePanel ───
// Always-visible right sidebar showing Documents, Deals, and Requests
// for one-tap referencing in the compose bar.

interface ReferencePanelProps {
  threads: BuyerThread[];
  documents: Array<{ type: 'nda' | 'fee_agreement'; label: string }>;
  activeReference: MessageReference | null;
  onSelectReference: (ref: MessageReference | null) => void;
}

export function ReferencePanel({
  threads,
  documents,
  activeReference,
  onSelectReference,
}: ReferencePanelProps) {
  const { data: firmStatus } = useFirmAgreementStatus();
  const fs = (firmStatus || {}) as Record<string, unknown>;

  const isActive = (type: string, id: string) =>
    activeReference?.type === type && activeReference?.id === id;

  const toggle = (ref: MessageReference) => {
    if (isActive(ref.type, ref.id)) {
      onSelectReference(null);
    } else {
      onSelectReference(ref);
    }
  };

  // Resolve document statuses
  const ndaStatus = resolveAgreementStatus(
    fs.nda_signed as boolean | null,
    (fs.nda_docuseal_status ?? fs.nda_status ?? null) as string | null,
  );
  const feeStatus = resolveAgreementStatus(
    fs.fee_agreement_signed as boolean | null,
    (fs.fee_docuseal_status ?? fs.fee_agreement_status ?? null) as string | null,
  );

  const docStatuses: Record<string, { label: string; signed: boolean }> = {
    nda: { label: ndaStatus === 'signed' ? 'Signed' : 'Pending', signed: ndaStatus === 'signed' },
    fee_agreement: { label: feeStatus === 'signed' ? 'Signed' : 'Pending', signed: feeStatus === 'signed' },
  };

  return (
    <div
      className="w-[220px] flex-shrink-0 hidden md:flex flex-col min-h-0"
      style={{ borderLeft: '1px solid #F0EDE6' }}
    >
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #F0EDE6' }}>
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: '#CBCBCB' }}
        >
          Quick Reference
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Documents Section */}
          <div className="px-4 pt-2 pb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: '#CBCBCB' }}
            >
              Documents
            </span>
          </div>
          {documents.map((doc) => {
            const active = isActive('document', doc.type);
            const status = docStatuses[doc.type];
            return (
              <button
                key={doc.type}
                onClick={() => toggle({ type: 'document', id: doc.type, label: doc.label })}
                className={cn(
                  'w-full text-left px-4 py-2 flex items-center justify-between transition-colors duration-150',
                  active ? '' : 'hover:bg-[#FAFAF8]',
                )}
                style={{
                  borderLeft: active ? '2px solid #DEC76B' : '2px solid transparent',
                  backgroundColor: active ? '#FDFCF9' : undefined,
                }}
              >
                <span
                  className="text-xs font-medium truncate"
                  style={{ color: '#0E101A' }}
                >
                  {doc.label}
                </span>
                <span
                  className="text-[10px] font-medium shrink-0"
                  style={{ color: status?.signed ? '#7A6F2A' : '#DEC76B' }}
                >
                  {status?.label || 'Pending'}
                </span>
              </button>
            );
          })}

          {/* Divider */}
          <div className="mx-4 my-2" style={{ borderTop: '1px solid #F0EDE6' }} />

          {/* Deals Section */}
          <div className="px-4 pt-1 pb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: '#CBCBCB' }}
            >
              Your Deals
            </span>
          </div>
          {threads.length === 0 ? (
            <p className="px-4 py-2 text-[11px]" style={{ color: '#CBCBCB' }}>
              No deals yet
            </p>
          ) : (
            threads.map((t) => {
              const active = isActive('deal', t.listing_id);
              return (
                <button
                  key={`deal-${t.listing_id}`}
                  onClick={() => toggle({ type: 'deal', id: t.listing_id, label: t.deal_title })}
                  className={cn(
                    'w-full text-left px-4 py-2 transition-colors duration-150',
                    active ? '' : 'hover:bg-[#FAFAF8]',
                  )}
                  style={{
                    borderLeft: active ? '2px solid #DEC76B' : '2px solid transparent',
                    backgroundColor: active ? '#FDFCF9' : undefined,
                  }}
                >
                  <span
                    className="text-xs font-medium truncate block"
                    style={{ color: '#0E101A' }}
                  >
                    {t.deal_title}
                  </span>
                  {t.deal_category && (
                    <span className="text-[10px]" style={{ color: '#9A9A9A' }}>
                      {t.deal_category}
                    </span>
                  )}
                </button>
              );
            })
          )}

          {/* Divider */}
          <div className="mx-4 my-2" style={{ borderTop: '1px solid #F0EDE6' }} />

          {/* Requests Section */}
          <div className="px-4 pt-1 pb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: '#CBCBCB' }}
            >
              Your Requests
            </span>
          </div>
          {threads.length === 0 ? (
            <p className="px-4 py-2 text-[11px]" style={{ color: '#CBCBCB' }}>
              No requests yet
            </p>
          ) : (
            threads.map((t) => {
              const active = isActive('request', t.connection_request_id);
              return (
                <button
                  key={`req-${t.connection_request_id}`}
                  onClick={() =>
                    toggle({
                      type: 'request',
                      id: t.connection_request_id,
                      label: t.deal_title,
                    })
                  }
                  className={cn(
                    'w-full text-left px-4 py-2 transition-colors duration-150',
                    active ? '' : 'hover:bg-[#FAFAF8]',
                  )}
                  style={{
                    borderLeft: active ? '2px solid #DEC76B' : '2px solid transparent',
                    backgroundColor: active ? '#FDFCF9' : undefined,
                  }}
                >
                  <span
                    className="text-xs font-medium truncate block"
                    style={{ color: '#0E101A' }}
                  >
                    {t.deal_title}
                  </span>
                  <span className="text-[10px]" style={{ color: '#9A9A9A' }}>
                    {getStatusLabel(t.request_status)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
