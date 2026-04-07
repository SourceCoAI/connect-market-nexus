/**
 * EditorDocumentsSection: Shows documents attached to a listing and its source deal.
 * Read-only overview for admins to verify document readiness before publishing.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, AlertCircle, FolderOpen } from 'lucide-react';

interface EditorDocumentsSectionProps {
  listingId?: string;
  sourceDealId?: string | null;
}

interface DocRecord {
  id: string;
  file_name: string;
  document_category: string;
  file_size_bytes: number | null;
  status: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  anonymous_teaser: 'Anonymous Teaser',
  full_memo: 'Full Memo / CIM',
  data_room: 'Data Room',
};

export function EditorDocumentsSection({ listingId, sourceDealId }: EditorDocumentsSectionProps) {
  const dealIds = [listingId, sourceDealId].filter(Boolean) as string[];

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['editor-documents', ...dealIds],
    queryFn: async () => {
      if (dealIds.length === 0) return [];
      const { data, error } = await supabase
        .from('data_room_documents')
        .select('id, file_name, document_category, file_size_bytes, status, created_at, deal_id')
        .in('deal_id', dealIds)
        .eq('status', 'active')
        .order('document_category')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as (DocRecord & { deal_id: string })[];
    },
    enabled: dealIds.length > 0,
  });

  if (!listingId && !sourceDealId) return null;

  const categories = ['anonymous_teaser', 'full_memo', 'data_room'];
  const docsByCategory = categories.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] || cat,
    docs: documents.filter((d) => d.document_category === cat),
  }));

  const hasTeaser = docsByCategory[0].docs.length > 0;
  const hasMemo = docsByCategory[1].docs.length > 0;

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Documents
          </span>
          <div className="flex items-center gap-2">
            {hasTeaser && (
              <Badge variant="secondary" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Teaser
              </Badge>
            )}
            {hasMemo && (
              <Badge variant="secondary" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Memo
              </Badge>
            )}
            {!hasTeaser && (
              <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                <AlertCircle className="h-3 w-3" />
                No Teaser
              </Badge>
            )}
            {!hasMemo && (
              <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                <AlertCircle className="h-3 w-3" />
                No Memo
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No documents uploaded. Upload documents in the Deal Data Room tab.
          </p>
        ) : (
          <div className="space-y-3">
            {docsByCategory
              .filter((group) => group.docs.length > 0)
              .map((group) => (
                <div key={group.category}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                      >
                        <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        <span className="truncate flex-1">{doc.file_name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatSize(doc.file_size_bytes)}
                        </span>
                        {sourceDealId && (doc as { deal_id: string }).deal_id === sourceDealId && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Source Deal
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
