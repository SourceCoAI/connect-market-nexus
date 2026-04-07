import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, X, ChevronDown, ChevronUp, Mail } from 'lucide-react';

interface DataRoomDocument {
  id: string;
  folder_name: string;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  document_category: string;
  created_at: string;
}

interface DataRoomOrientationProps {
  documents: DataRoomDocument[];
  memoCount: number;
  advisorName?: string;
  advisorEmail?: string;
}

export function DataRoomOrientation({
  documents,
  memoCount,
  advisorName,
  advisorEmail,
}: DataRoomOrientationProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const orientation = useMemo(() => {
    const totalDocs = documents.length + memoCount;
    const folders = [...new Set(documents.map((d) => d.folder_name))];

    // Find recommended starting docs
    const recommended: { name: string; reason: string }[] = [];

    // Look for memo docs first
    if (memoCount > 0) {
      recommended.push({ name: 'Lead Memo', reason: 'Start here for a business overview' });
    }

    // Look for financial model / financial docs
    const financialDoc = documents.find(
      (d) => /financ|model|projec/i.test(d.file_name) || /financ/i.test(d.folder_name),
    );
    if (financialDoc) {
      recommended.push({ name: financialDoc.file_name, reason: 'Detailed financial projections' });
    }

    // Look for deal memo / overview docs
    const memoDoc = documents.find((d) => /memo|overview|summary|deal.*doc/i.test(d.file_name));
    if (memoDoc && !recommended.some((r) => r.name === memoDoc.file_name)) {
      recommended.push({ name: memoDoc.file_name, reason: 'Comprehensive deal overview' });
    }

    // Recently uploaded docs
    const recentDocs = documents
      .filter((d) => {
        const daysSince = (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      })
      .map((d) => d.file_name);

    return {
      totalDocs,
      folderCount: folders.length,
      folders,
      recommended: recommended.slice(0, 3),
      recentDocs: recentDocs.slice(0, 3),
    };
  }, [documents, memoCount]);

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="text-xs text-muted-foreground hover:text-foreground underline mb-2"
      >
        Show orientation
      </button>
    );
  }

  return (
    <Card className="mb-4 border-purple-100 bg-gradient-to-br from-purple-50/50 to-white">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-purple-600" />
            <h4 className="text-sm font-semibold text-purple-900">Data Room Overview</h4>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-6 w-6 p-0 text-purple-400 hover:text-purple-600"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="h-6 w-6 p-0 text-purple-400 hover:text-purple-600"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-3">
            {/* Summary */}
            <p className="text-xs text-slate-600">
              This data room contains{' '}
              <strong>
                {orientation.totalDocs} document{orientation.totalDocs !== 1 ? 's' : ''}
              </strong>{' '}
              across{' '}
              <strong>
                {orientation.folderCount} folder{orientation.folderCount !== 1 ? 's' : ''}
              </strong>
              {orientation.folders.length > 0 && (
                <>
                  {' '}
                  ({orientation.folders.slice(0, 3).join(', ')}
                  {orientation.folders.length > 3 ? '...' : ''})
                </>
              )}
              .
            </p>

            {/* Recommended starting point */}
            {orientation.recommended.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-700 mb-1">Where to start:</p>
                <ol className="space-y-1">
                  {orientation.recommended.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="bg-purple-100 text-purple-700 rounded-full w-4 h-4 flex items-center justify-center shrink-0 text-[10px] font-semibold mt-0.5">
                        {i + 1}
                      </span>
                      <span>
                        <strong>{rec.name}</strong> — {rec.reason}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Recently added */}
            {orientation.recentDocs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-700 mb-1">Recently added:</p>
                <div className="flex flex-wrap gap-1.5">
                  {orientation.recentDocs.map((name, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="text-[10px] bg-green-50 text-green-700 border-green-200"
                    >
                      New: {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Advisor contact */}
            {advisorName && (
              <div className="flex items-center gap-2 pt-1 border-t border-purple-100">
                <Mail className="h-3 w-3 text-slate-400" />
                <p className="text-xs text-slate-500">
                  Questions? Contact{' '}
                  {advisorEmail ? (
                    <a
                      href={`mailto:${advisorEmail}`}
                      className="font-medium text-purple-700 hover:underline"
                    >
                      {advisorName}
                    </a>
                  ) : (
                    <span className="font-medium">{advisorName}</span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
