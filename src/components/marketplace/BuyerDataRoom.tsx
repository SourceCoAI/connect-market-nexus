/**
 * BuyerDataRoom: Bank-grade secure data room for PE/M&A buyers.
 *
 * Premium vault experience communicating security, exclusivity,
 * and institutional trust.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  Download,
  Eye,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeHtml } from '@/lib/sanitize';

interface BuyerDataRoomProps {
  dealId: string;
  connectionApproved?: boolean;
}

interface BuyerDocument {
  id: string;
  folder_name: string;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  document_category: string;
  allow_download: boolean;
  created_at: string;
}

export function BuyerDataRoom({ dealId, connectionApproved }: BuyerDataRoomProps) {
  const { user } = useAuth();
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

  // Check if buyer has any access
  const { data: access } = useQuery({
    queryKey: ['buyer-data-room-access', dealId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_room_access')
        .select('can_view_teaser, can_view_full_memo, can_view_data_room, granted_at')
        .eq('deal_id', dealId)
        .eq('marketplace_user_id', user?.id ?? '')
        .is('revoked_at', null)
        .maybeSingle();

      if (error) throw error;
      if (data) return data;

      // Dual-ID fallback: check if access exists on the source deal
      const { data: listingRow } = await supabase
        .from('listings')
        .select('source_deal_id')
        .eq('id', dealId)
        .maybeSingle();

      if (listingRow?.source_deal_id) {
        const { data: sourceAccess, error: sourceErr } = await supabase
          .from('data_room_access')
          .select('can_view_teaser, can_view_full_memo, can_view_data_room, granted_at')
          .eq('deal_id', listingRow.source_deal_id)
          .eq('marketplace_user_id', user?.id ?? '')
          .is('revoked_at', null)
          .maybeSingle();

        if (sourceErr) throw sourceErr;
        return sourceAccess;
      }

      return null;
    },
    enabled: !!dealId && !!user?.id,
  });

  // Build allowed categories from access toggles
  const allowedCategories = new Set<string>();
  if (access?.can_view_teaser) allowedCategories.add('anonymous_teaser');
  if (access?.can_view_full_memo) allowedCategories.add('full_memo');
  if (access?.can_view_data_room) allowedCategories.add('data_room');

  const hasFullAccess = access?.can_view_full_memo && access?.can_view_data_room;

  // Fetch documents filtered by status, then client-filter by category
  const { data: documents = [] } = useQuery({
    queryKey: ['buyer-data-room-documents', dealId, Array.from(allowedCategories).sort().join(',')],
    queryFn: async () => {
      const selectCols =
        'id, folder_name, file_name, file_type, file_size_bytes, document_category, allow_download, created_at';

      const { data: primaryDocs, error } = await supabase
        .from('data_room_documents')
        .select(selectCols)
        .eq('deal_id', dealId)
        .eq('status', 'active')
        .order('folder_name')
        .order('created_at', { ascending: false });

      if (error) throw error;

      let allDocs = (primaryDocs || []) as BuyerDocument[];

      // Fallback: check source_deal_id documents
      if (allDocs.length === 0) {
        const { data: listingRow } = await supabase
          .from('listings')
          .select('source_deal_id')
          .eq('id', dealId)
          .maybeSingle();

        if (listingRow?.source_deal_id) {
          const { data: sourceDocs } = await supabase
            .from('data_room_documents')
            .select(selectCols)
            .eq('deal_id', listingRow.source_deal_id)
            .eq('status', 'active')
            .order('folder_name')
            .order('created_at', { ascending: false });

          if (sourceDocs) {
            allDocs = sourceDocs as BuyerDocument[];
          }
        }
      }

      return allDocs.filter((doc) => allowedCategories.has(doc.document_category));
    },
    enabled: !!dealId && !!access && allowedCategories.size > 0,
  });

  // Fetch published memos
  const { data: memos = [] } = useQuery({
    queryKey: ['buyer-published-memos', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_memos')
        .select('id, memo_type, content, html_content, branding, published_at')
        .eq('deal_id', dealId)
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!dealId && !!access,
  });

  if (
    !access ||
    (!access.can_view_teaser && !access.can_view_full_memo && !access.can_view_data_room)
  ) {
    if (connectionApproved) {
      return (
        <div className="space-y-4 py-2">
          <VaultHeader />
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Your data room is being prepared.
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Access credentials are being provisioned. Check back shortly.
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleViewDocument = async (docId: string) => {
    setLoadingDoc(docId);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-room-download?document_id=${docId}&action=view`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );

      if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
      }
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleDownloadDocument = async (docId: string) => {
    setLoadingDoc(docId);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-room-download?document_id=${docId}&action=download`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );

      if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
      }
    } finally {
      setLoadingDoc(null);
    }
  };

  const getFileIcon = (fileType: string | null) => {
    const baseClass = 'h-4 w-4 text-muted-foreground/50';
    if (!fileType) return <File className={baseClass} />;
    if (fileType.includes('pdf')) return <FileText className={baseClass} />;
    if (fileType.includes('spreadsheet') || fileType.includes('csv'))
      return <FileSpreadsheet className={baseClass} />;
    if (fileType.includes('image')) return <FileImage className={baseClass} />;
    return <File className={baseClass} />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Group documents by folder
  const documentsByFolder = documents.reduce(
    (acc, doc) => {
      if (!acc[doc.folder_name]) acc[doc.folder_name] = [];
      acc[doc.folder_name].push(doc);
      return acc;
    },
    {} as Record<string, BuyerDocument[]>,
  );

  const totalCount = documents.length + memos.length;

  return (
    <div className="space-y-0 py-2">
      {/* Vault Header */}
      <VaultHeader />

      {/* Access Tier + Security Metadata */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/20">
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${hasFullAccess ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-[11px] font-medium text-muted-foreground">
            {hasFullAccess ? 'Full Access' : 'Teaser Access'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
          {totalCount > 0 && (
            <span>{totalCount} document{totalCount !== 1 ? 's' : ''}</span>
          )}
          {access?.granted_at && (
            <span>Granted {new Date(access.granted_at).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* Upgrade prompt for partial access */}
      {!hasFullAccess && (
        <div className="px-5 py-3 border-b border-border/20">
          <p className="text-[11px] text-muted-foreground/60">
            Sign Fee Agreement to unlock all documents.
          </p>
        </div>
      )}

      {/* Published Memos */}
      {memos.length > 0 && (
        <div className="px-5 pt-5 pb-2">
          <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-muted-foreground/50 mb-3">
            Lead Memos
          </p>
          {memos.map((memo) => (
            <div key={memo.id} className="py-3 border-t border-border/20">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-foreground">
                  {memo.memo_type === 'anonymous_teaser' ? 'Teaser' : 'Full Memo'}
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                  {memo.published_at && new Date(memo.published_at).toLocaleDateString()}
                </span>
              </div>
              {memo.html_content ? (
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(memo.html_content) }}
                />
              ) : (
                <div className="space-y-3">
                  {(
                    (
                      memo.content as {
                        sections?: Array<{ title: string; content: string }>;
                      } | null
                    )?.sections || []
                  ).map((section: { title: string; content: string }) => (
                    <div key={section.title}>
                      <h4 className="text-sm font-medium mb-1">{section.title}</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {section.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Documents by Folder */}
      {Object.keys(documentsByFolder).length > 0 && (
        <div className="px-5 pt-4 pb-2">
          {Object.entries(documentsByFolder)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([folder, docs]) => (
              <div key={folder} className="mb-4">
                <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-muted-foreground/50 mb-2">
                  {folder}
                </p>
                <div className="border-t border-border/30" />
                {docs.map((doc, i) => (
                  <div
                    key={doc.id}
                    className={`group flex items-center gap-3 py-3 transition-all duration-150 hover:translate-x-0.5 hover:bg-muted/10 -mx-2 px-2 rounded ${
                      i < docs.length - 1 ? 'border-b border-border/10' : ''
                    }`}
                  >
                    <div className="border-l-2 border-transparent group-hover:border-emerald-500/40 pl-2 transition-colors duration-150">
                      {getFileIcon(doc.file_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {formatFileSize(doc.file_size_bytes)}
                        {doc.file_size_bytes ? ' | ' : ''}
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDocument(doc.id)}
                        disabled={loadingDoc === doc.id}
                        className="h-7 rounded-full px-3 text-[11px] border-border/40 text-muted-foreground hover:text-foreground"
                      >
                        {loadingDoc === doc.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </>
                        )}
                      </Button>
                      {doc.allow_download && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadDocument(doc.id)}
                          disabled={loadingDoc === doc.id}
                          className="h-7 rounded-full px-3 text-[11px] border-border/40 text-muted-foreground hover:text-foreground"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && memos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center px-5">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            Your data room is being prepared.
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-1">
            Documents will appear here once released by the advisor.
          </p>
        </div>
      )}

      {/* Security Footer */}
      <div className="border-t border-border/20 px-5 py-3 mt-2">
        <p className="text-[10px] text-muted-foreground/40 text-center">
          Documents shared under NDA. Unauthorized distribution is prohibited.
        </p>
      </div>
    </div>
  );
}

/** Dark vault header with security signal */
function VaultHeader() {
  return (
    <div className="bg-[#0E101A] rounded-t-lg px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="h-4 w-4 text-emerald-400/80" />
        <h3 className="text-sm font-semibold tracking-wide text-white/90">
          Secure Data Room
        </h3>
      </div>
      <span className="text-[10px] text-white/30 tracking-wide">
        256-bit encrypted
      </span>
    </div>
  );
}
