/**
 * BuyerDataRoom: Buyer-facing view of documents shared with them
 *
 * Shown on a deal's listing detail page when the buyer has data room access.
 * Only shows documents matching their enabled categories.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  Download,
  Eye,
  Loader2,
  FolderOpen,
  Lock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeHtml } from '@/lib/sanitize';
import { DataRoomOrientation } from './DataRoomOrientation';

interface BuyerDataRoomProps {
  dealId: string;
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

export function BuyerDataRoom({ dealId }: BuyerDataRoomProps) {
  const { user } = useAuth();
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

  // Check if buyer has any access
  const { data: access } = useQuery({
    queryKey: ['buyer-data-room-access', dealId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_room_access')
        .select('can_view_teaser, can_view_full_memo, can_view_data_room')
        .eq('deal_id', dealId)
        .eq('marketplace_user_id', user?.id ?? '')
        .is('revoked_at', null)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!dealId && !!user?.id,
  });

  // Fetch documents (RLS will filter based on access)
  const { data: documents = [], isLoading: _isLoading } = useQuery({
    queryKey: ['buyer-data-room-documents', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_room_documents')
        .select(
          'id, folder_name, file_name, file_type, file_size_bytes, document_category, allow_download, created_at',
        )
        .eq('deal_id', dealId)
        .order('folder_name')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BuyerDocument[];
    },
    enabled: !!dealId && !!access,
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
    return null; // No access — don't show anything
  }

  const handleViewDocument = async (docId: string) => {
    setLoadingDoc(docId);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
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
    if (!fileType) return <File className="h-5 w-5 text-gray-400" />;
    if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (fileType.includes('spreadsheet') || fileType.includes('csv'))
      return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    if (fileType.includes('image')) return <FileImage className="h-5 w-5 text-blue-500" />;
    return <File className="h-5 w-5 text-gray-400" />;
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

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Lock className="h-5 w-5" />
        Data Room
      </h3>

      {/* Data Room Orientation */}
      {(documents.length > 0 || memos.length > 0) && (
        <DataRoomOrientation documents={documents} memoCount={memos.length} />
      )}

      {/* Published Memos */}
      {memos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lead Memos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {memos.map((memo) => (
                <div key={memo.id} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">
                      {memo.memo_type === 'anonymous_teaser' ? 'Teaser' : 'Full Memo'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {memo.published_at && new Date(memo.published_at).toLocaleDateString()}
                    </span>
                  </div>
                  {memo.html_content ? (
                    <div
                      className="prose prose-sm max-w-none"
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
                          <h4 className="font-medium text-sm mb-1">{section.title}</h4>
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
          </CardContent>
        </Card>
      )}

      {/* Documents by Folder */}
      {Object.keys(documentsByFolder).length > 0 &&
        Object.entries(documentsByFolder)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([folder, docs]) => (
            <Card key={folder}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  {folder}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 py-2">
                      {getFileIcon(doc.file_type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{doc.file_name}</p>
                          {Date.now() - new Date(doc.created_at).getTime() <
                            7 * 24 * 60 * 60 * 1000 && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] bg-green-50 text-green-700 border-green-200 shrink-0"
                            >
                              New
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size_bytes)}
                          {' · '}
                          {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDocument(doc.id)}
                          disabled={loadingDoc === doc.id}
                        >
                          {loadingDoc === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 mr-1" />
                          )}
                          View
                        </Button>
                        {doc.allow_download && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadDocument(doc.id)}
                            disabled={loadingDoc === doc.id}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

      {documents.length === 0 && memos.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FolderOpen className="mx-auto h-8 w-8 mb-2" />
            No documents available yet
          </CardContent>
        </Card>
      )}
    </div>
  );
}
