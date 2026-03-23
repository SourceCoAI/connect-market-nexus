/**
 * DocumentsPanel: Data room file upload and management
 *
 * Handles supporting documents only (financials, legal, ops, etc.).
 * Memo PDFs (teaser + full memo) are managed by the MemosTab.
 *
 * Features:
 * - Drag-and-drop file upload
 * - Flat file list (no folders)
 * - File preview via signed URLs
 * - Files are used for deal enrichment and memo generation
 */

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Upload, FileText, File, FileSpreadsheet, FileImage,
  Trash2, Download, Eye, Loader2, EyeOff,
} from 'lucide-react';
import {
  useDataRoomDocuments,
  useUploadDocument,
  useDeleteDocument,
  useDocumentUrl,
  DataRoomDocument,
} from '@/hooks/admin/data-room/use-data-room';

interface DocumentsPanelProps {
  dealId: string;
}

export function DocumentsPanel({ dealId }: DocumentsPanelProps) {
  const { data: documents = [], isLoading } = useDataRoomDocuments(dealId);
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();
  const documentUrlMutation = useDocumentUrl();

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only show data room files — memo PDFs are managed by the MemosTab
  const dataRoomDocs = documents.filter(d => d.document_category === 'data_room');

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await uploadMutation.mutateAsync({
        file,
        dealId,
        folderName: 'General',
        documentCategory: 'data_room',
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [dealId, uploadMutation]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const handleViewDocument = async (doc: DataRoomDocument) => {
    const result = await documentUrlMutation.mutateAsync({
      documentId: doc.id,
      action: 'view',
    });
    window.open(result.url, '_blank');
  };

  const handleDownloadDocument = async (doc: DataRoomDocument) => {
    const result = await documentUrlMutation.mutateAsync({
      documentId: doc.id,
      action: 'download',
    });
    window.open(result.url, '_blank');
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-5 w-5 text-gray-400" />;
    if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (fileType.includes('spreadsheet') || fileType.includes('csv')) return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
    if (fileType.includes('image')) return <FileImage className="h-5 w-5 text-blue-500" />;
    if (fileType.includes('presentation')) return <FileText className="h-5 w-5 text-orange-500" />;
    return <File className="h-5 w-5 text-gray-400" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Loading documents...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Data Room Files</CardTitle>
          <p className="text-xs text-muted-foreground">
            Supporting documents for due diligence. Uploaded files are used to enrich the company profile and generate lead memos.
          </p>
        </CardHeader>
        <CardContent>
          {/* Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {uploadMutation.isPending
                ? 'Uploading...'
                : 'Drag & drop files here, or click to browse'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, DOCX, XLSX, PPTX, JPG, PNG, CSV — Max 50MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFileUpload(e.target.files);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Document List */}
      {dataRoomDocs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileText className="mx-auto h-8 w-8 mb-2" />
            No data room files uploaded yet
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
              <Badge variant="secondary" className="ml-1">{dataRoomDocs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {dataRoomDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 py-2 group">
                  {getFileIcon(doc.file_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(doc.file_size_bytes)}
                      {' · '}
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {!doc.allow_download && (
                    <Badge variant="outline" className="text-xs">
                      <EyeOff className="h-3 w-3 mr-1" />
                      View only
                    </Badge>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleViewDocument(doc)}
                      title="View"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {doc.allow_download && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDownloadDocument(doc)}
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete document?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{doc.file_name}" from the data room.
                            Buyers who had access will no longer be able to view it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate({ documentId: doc.id, dealId })}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
