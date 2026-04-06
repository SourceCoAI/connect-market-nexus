/**
 * DealDocumentsCard — Agreements + Data Room preview card.
 * Uses "either doc" rule for access gating.
 * Supports dual-ID fallback (listing → source_deal_id) for documents.
 */

import { useState } from 'react';
import {
  Shield,
  FileSignature,
  Check,
  FolderOpen,
  Lock,
  ArrowRight,
  FileText,
  BarChart3,
  Building2,
  Eye,
  Download,
  Loader2,
} from 'lucide-react';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';
import { useQuery } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DealDocumentsCardProps {
  dealId: string;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'on_hold';
  ndaSigned: boolean;
  feeCovered: boolean;
  feeStatus?: string;
  onViewDocuments?: () => void;
}

interface DataRoomDoc {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  document_category: string;
  allow_download: boolean;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function getFileIcon(fileType: string | null) {
  if (!fileType) return FileText;
  if (fileType.includes('pdf')) return FileText;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv'))
    return BarChart3;
  return FileText;
}

export function DealDocumentsCard({
  dealId,
  requestStatus,
  ndaSigned,
  feeCovered,
  feeStatus: _feeStatus,
  onViewDocuments,
}: DealDocumentsCardProps) {
  const { user } = useAuth();
  const [signingOpen, setSigningOpen] = useState(false);
  const [signingType, setSigningType] = useState<'nda' | 'fee_agreement'>('nda');
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

  const openSigning = (type: 'nda' | 'fee_agreement') => {
    setSigningType(type);
    setSigningOpen(true);
  };

  const hasAnyAgreement = ndaSigned || feeCovered;

  // ─── Access query with dual-ID fallback ───
  const { data: access } = useQuery({
    queryKey: ['buyer-data-room-access', dealId, user?.id],
    queryFn: async () => {
      // Try listing ID first
      const { data, error } = await supabase
        .from('data_room_access')
        .select('can_view_teaser, can_view_full_memo, can_view_data_room, fee_agreement_override')
        .eq('deal_id', dealId)
        .eq('marketplace_user_id', user?.id ?? '')
        .is('revoked_at', null)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // Fallback: check source_deal_id
      const { data: listing } = await supabase
        .from('listings')
        .select('source_deal_id')
        .eq('id', dealId)
        .maybeSingle();

      if (listing?.source_deal_id) {
        const { data: fallback, error: fbErr } = await supabase
          .from('data_room_access')
          .select('can_view_teaser, can_view_full_memo, can_view_data_room, fee_agreement_override')
          .eq('deal_id', listing.source_deal_id)
          .eq('marketplace_user_id', user?.id ?? '')
          .is('revoked_at', null)
          .maybeSingle();
        if (fbErr) throw fbErr;
        return fallback;
      }
      return null;
    },
    enabled: !!dealId && !!user?.id && requestStatus !== 'pending',
  });

  // ─── Document list with dual-ID fallback ───
  const { data: documents = [] } = useQuery({
    queryKey: ['buyer-data-room-docs-inline', dealId],
    queryFn: async (): Promise<DataRoomDoc[]> => {
      // Try listing ID
      const { data, error } = await supabase
        .from('data_room_documents')
        .select('id, file_name, file_type, file_size_bytes, document_category, allow_download')
        .eq('deal_id', dealId)
        .eq('status', 'active')
        .order('folder_name')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) return data as DataRoomDoc[];

      // Fallback: source_deal_id
      const { data: listing } = await supabase
        .from('listings')
        .select('source_deal_id')
        .eq('id', dealId)
        .maybeSingle();

      if (listing?.source_deal_id) {
        const { data: fallback, error: fbErr } = await supabase
          .from('data_room_documents')
          .select('id, file_name, file_type, file_size_bytes, document_category, allow_download')
          .eq('deal_id', listing.source_deal_id)
          .eq('status', 'active')
          .order('folder_name')
          .order('created_at', { ascending: false });
        if (fbErr) throw fbErr;
        return (fallback as DataRoomDoc[]) || [];
      }
      return [];
    },
    enabled: !!dealId && !!access,
  });

  // ─── Memo count with dual-ID fallback ───
  const { data: memoCount = 0 } = useQuery({
    queryKey: ['buyer-published-memo-count', dealId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('lead_memos')
        .select('id', { count: 'exact', head: true })
        .eq('deal_id', dealId)
        .eq('status', 'published');
      if (error) throw error;
      if (count && count > 0) return count;

      const { data: listing } = await supabase
        .from('listings')
        .select('source_deal_id')
        .eq('id', dealId)
        .maybeSingle();

      if (listing?.source_deal_id) {
        const { count: fbCount, error: fbErr } = await supabase
          .from('lead_memos')
          .select('id', { count: 'exact', head: true })
          .eq('deal_id', listing.source_deal_id)
          .eq('status', 'published');
        if (fbErr) throw fbErr;
        return fbCount || 0;
      }
      return 0;
    },
    enabled: !!dealId && !!access,
  });

  const hasAccess =
    access && (access.can_view_teaser || access.can_view_full_memo || access.can_view_data_room);
  const totalDocs = documents.length + memoCount;
  const docsLocked = requestStatus === 'pending' || !hasAccess;

  // ─── View / Download handlers ───
  const handleView = async (docId: string) => {
    setLoadingDoc(docId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in to view documents.');
        return;
      }
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/data-room-download?document_id=${docId}&action=view`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(errBody?.error || 'Failed to load document.');
        return;
      }
      const data = await res.json();
      window.open(data.url, '_blank');
    } catch {
      toast.error('Failed to load document.');
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleDownload = async (docId: string) => {
    setLoadingDoc(docId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in to download documents.');
        return;
      }
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/data-room-download?document_id=${docId}&action=download`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(errBody?.error || 'Failed to download document.');
        return;
      }
      const data = await res.json();
      window.open(data.url, '_blank');
    } catch {
      toast.error('Failed to download document.');
    } finally {
      setLoadingDoc(null);
    }
  };

  const MAX_INLINE = 5;
  const visibleDocs = documents.slice(0, MAX_INLINE);
  const hasMore = documents.length > MAX_INLINE || memoCount > 0;

  return (
    <>
      <div className="rounded-lg border border-[#F0EDE6] bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-[#F0EDE6]">
          <h3 className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em]">
            Documents & Agreements
          </h3>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          {/* NDA row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield
                className={cn('h-4 w-4', ndaSigned ? 'text-emerald-600' : 'text-[#8B6F47]')}
              />
              <span className="text-[13px] text-[#0E101A]/70">NDA</span>
            </div>
            {ndaSigned ? (
              <div className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-[12px] font-medium text-emerald-700">Signed</span>
              </div>
            ) : (
              <button
                onClick={() => openSigning('nda')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#0E101A] text-white hover:bg-[#0E101A]/85 transition-colors"
              >
                Request <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Fee Agreement row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileSignature
                className={cn('h-4 w-4', feeCovered ? 'text-emerald-600' : 'text-[#8B6F47]')}
              />
              <span className="text-[13px] text-[#0E101A]/70">Fee Agreement</span>
            </div>
            {feeCovered ? (
              <div className="flex items-center gap-1.5">
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-[12px] font-medium text-emerald-700">Signed</span>
              </div>
            ) : (
              <button
                onClick={() => openSigning('fee_agreement')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#0E101A] text-white hover:bg-[#0E101A]/85 transition-colors"
              >
                Request <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="border-t border-[#F0EDE6]" />

          {/* Data Room section */}
          <div className="flex items-center gap-2.5 mb-1">
            <FolderOpen
              className={cn('h-4 w-4', hasAccess ? 'text-[#0E101A]/50' : 'text-[#0E101A]/20')}
            />
            <span className="text-[10px] font-semibold text-[#0E101A]/30 uppercase tracking-[0.12em]">
              Data Room
            </span>
            {hasAccess && totalDocs > 0 && (
              <span className="text-[10px] text-[#0E101A]/30 ml-auto">
                {totalDocs} file{totalDocs !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {docsLocked ? (
            <div className="space-y-2 pl-[30px]">
              <div className="flex items-center gap-2.5 opacity-40">
                <Building2 className="h-3.5 w-3.5 text-[#0E101A]/50 shrink-0" />
                <span className="text-[12px] text-[#0E101A]/60">Confidential Company Profile</span>
                <Lock className="h-3 w-3 text-[#0E101A]/30 ml-auto shrink-0" />
              </div>
              <div className="flex items-center gap-2.5 opacity-40">
                <FileText className="h-3.5 w-3.5 text-[#0E101A]/50 shrink-0" />
                <span className="text-[12px] text-[#0E101A]/60">Deal Memorandum / CIM</span>
                <Lock className="h-3 w-3 text-[#0E101A]/30 ml-auto shrink-0" />
              </div>
              <div className="flex items-center gap-2.5 opacity-40">
                <BarChart3 className="h-3.5 w-3.5 text-[#0E101A]/50 shrink-0" />
                <span className="text-[12px] text-[#0E101A]/60">Detailed Financial Statements</span>
                <Lock className="h-3 w-3 text-[#0E101A]/30 ml-auto shrink-0" />
              </div>
              <p className="text-[11px] text-[#8B6F47] mt-2 font-medium">
                {!hasAnyAgreement
                  ? 'Sign an agreement (NDA or Fee Agreement) to begin unlocking these materials.'
                  : requestStatus === 'pending'
                    ? 'Available once your request is approved by the owner.'
                    : 'Documents are being prepared by our team.'}
              </p>
            </div>
          ) : totalDocs === 0 ? (
            <div className="pl-[30px]">
              <p className="text-[12px] text-[#0E101A]/40">
                Documents will appear here once released by the advisor.
              </p>
            </div>
          ) : (
            <div className="pl-[30px] space-y-0.5">
              {visibleDocs.map((doc) => {
                const Icon = getFileIcon(doc.file_type);
                const isLoading = loadingDoc === doc.id;
                return (
                  <div
                    key={doc.id}
                    className="group flex items-center gap-2.5 py-1.5 rounded-md hover:bg-[#0E101A]/[0.02] transition-colors -mx-2 px-2"
                  >
                    <Icon className="h-3.5 w-3.5 text-[#0E101A]/30 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#0E101A]/70 truncate leading-tight">
                        {doc.file_name}
                      </p>
                      {doc.file_size_bytes && (
                        <p className="text-[10px] text-[#0E101A]/30 leading-tight">
                          {formatFileSize(doc.file_size_bytes)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin text-[#0E101A]/30" />
                      ) : (
                        <>
                          <button
                            onClick={() => handleView(doc.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-[#0E101A]/50 hover:text-[#0E101A] hover:bg-[#0E101A]/[0.04] transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                          {doc.allow_download && (
                            <button
                              onClick={() => handleDownload(doc.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-[#0E101A]/50 hover:text-[#0E101A] hover:bg-[#0E101A]/[0.04] transition-colors"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {hasMore && onViewDocuments && (
                <button
                  onClick={onViewDocuments}
                  className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-[#0E101A]/50 hover:text-[#0E101A] transition-colors"
                >
                  View all in Data Room <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <AgreementSigningModal
        open={signingOpen}
        onOpenChange={setSigningOpen}
        documentType={signingType}
      />
    </>
  );
}
