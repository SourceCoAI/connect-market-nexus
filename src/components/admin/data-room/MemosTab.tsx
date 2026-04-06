/**
 * MemosTab: Two-slot memo interface for the deal page.
 *
 * Each deal has two memo slots: Anonymous Teaser & Full Lead Memo
 *
 * Workflow per slot:
 *   1. Generate Draft → AI creates content saved to lead_memos table (viewable in-app)
 *   2. Download Draft → Export saved draft as .docx for editing in Word
 *   3. Upload Final PDF → Upload the polished PDF to data_room_documents
 */

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Upload,
  Sparkles,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  FileUp,
  CheckCircle2,
  Calendar,
  Eye,
  BookOpen,
  Save,
  Tag,
} from 'lucide-react';
import {
  useDataRoomDocuments,
  useUploadDocument,
  useDeleteDocument,
  useDocumentUrl,
  useGenerateMemo,
  useLeadMemos,
  DataRoomDocument,
  LeadMemo,
} from '@/hooks/admin/data-room/use-data-room';
import { generateMemoDocx } from '@/lib/generate-memo-docx';
import { format } from 'date-fns';
import { extractCompanyInfo } from '@/lib/memo-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ─── Module-level generation tracker ───
// Persists across component mount/unmount so navigating away doesn't lose state.

interface ActiveGeneration {
  progress: number;
  intervalId: ReturnType<typeof setInterval>;
  promise: Promise<unknown>;
  listeners: Set<() => void>;
}

const activeGenerations = new Map<string, ActiveGeneration>();

function getGenerationKey(dealId: string, slotType: string) {
  return `${dealId}:${slotType}`;
}

function notifyListeners(key: string) {
  activeGenerations.get(key)?.listeners.forEach((fn) => fn());
}

function startTrackedGeneration(
  key: string,
  generationPromise: Promise<unknown>,
) {
  // If already generating, don't restart
  if (activeGenerations.has(key)) return activeGenerations.get(key)!;

  const entry: ActiveGeneration = {
    progress: 0,
    intervalId: setInterval(() => {
      const gen = activeGenerations.get(key);
      if (!gen || gen.progress >= 90) return;
      const increment = gen.progress < 30 ? 8 : gen.progress < 60 ? 4 : 2;
      gen.progress = Math.min(gen.progress + increment, 90);
      notifyListeners(key);
    }, 800),
    promise: generationPromise,
    listeners: new Set(),
  };

  activeGenerations.set(key, entry);

  generationPromise
    .then(() => {
      const gen = activeGenerations.get(key);
      if (gen) {
        gen.progress = 100;
        notifyListeners(key);
        // Brief pause to show 100% before cleanup
        setTimeout(() => cleanupGeneration(key), 500);
      }
    })
    .catch(() => {
      cleanupGeneration(key);
    });

  return entry;
}

function cleanupGeneration(key: string) {
  const gen = activeGenerations.get(key);
  if (gen) {
    clearInterval(gen.intervalId);
    activeGenerations.delete(key);
    // Notify so components re-render with isGenerating=false
    gen.listeners.forEach((fn) => fn());
  }
}

function useGenerationProgress(dealId: string, slotType: string) {
  const key = getGenerationKey(dealId, slotType);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const gen = activeGenerations.get(key);
      if (gen) {
        gen.listeners.add(onStoreChange);
        return () => {
          gen.listeners.delete(onStoreChange);
        };
      }
      // Not currently generating — poll briefly to detect when a generation starts
      const id = setInterval(() => {
        if (activeGenerations.has(key)) {
          onStoreChange();
          clearInterval(id);
        }
      }, 200);
      return () => clearInterval(id);
    },
    [key],
  );

  // Return a primitive (number) so useSyncExternalStore can do simple === comparison.
  // -1 means not generating, 0-100 means generating with that progress.
  const getSnapshot = useCallback(() => {
    const gen = activeGenerations.get(key);
    return gen ? gen.progress : -1;
  }, [key]);

  const progressValue = useSyncExternalStore(subscribe, getSnapshot);

  return {
    isGenerating: progressValue >= 0,
    progress: progressValue >= 0 ? progressValue : 0,
  };
}

// ─── Component types ───

interface MemosTabProps {
  dealId: string;
  dealTitle?: string;
  projectName?: string | null;
}

type MemoSlotType = 'anonymous_teaser' | 'full_memo';

export function MemosTab({ dealId, dealTitle, projectName }: MemosTabProps) {
  const { data: documents = [], isLoading: docsLoading } = useDataRoomDocuments(dealId);
  const { data: memos = [], isLoading: memosLoading } = useLeadMemos(dealId);
  const { toast } = useToast();

  // Project Name state
  const [editableProjectName, setEditableProjectName] = useState(projectName || '');
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);

  useEffect(() => {
    setEditableProjectName(projectName || '');
  }, [projectName]);

  const handleSaveProjectName = async () => {
    setIsSavingProjectName(true);
    try {
      const { error } = await supabase
        .from('listings')
        .update({ project_name: editableProjectName.trim() || null })
        .eq('id', dealId);
      if (error) throw error;
      toast({ title: 'Project name saved' });
    } catch {
      toast({ title: 'Failed to save project name', variant: 'destructive' });
    } finally {
      setIsSavingProjectName(false);
    }
  };

  // Find the most recent PDF for each slot
  const teaserDoc = documents.find((d) => d.document_category === 'anonymous_teaser');
  const fullMemoDoc = documents.find((d) => d.document_category === 'full_memo');

  // Find the most recent AI draft for each slot
  const teaserDraft = memos.find((m) => m.memo_type === 'anonymous_teaser');
  const fullMemoDraft = memos.find((m) => m.memo_type === 'full_memo');

  const isLoading = docsLoading || memosLoading;

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="animate-pulse">
          <CardContent className="py-12" />
        </Card>
        <Card className="animate-pulse">
          <CardContent className="py-12" />
        </Card>
      </div>
    );
  }

  // Anonymous Teaser is fully locked until a Full Lead Memo Final PDF exists
  const teaserLocked = !fullMemoDoc;

  return (
    <div className="space-y-6">
      {/* Project Name Field */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="project-name" className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Tag className="h-3.5 w-3.5" />
                Project Name
              </Label>
              <Input
                id="project-name"
                placeholder='e.g. "Project Central" — used as the codename in anonymous teasers'
                value={editableProjectName}
                onChange={(e) => setEditableProjectName(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={handleSaveProjectName}
              disabled={isSavingProjectName || editableProjectName === (projectName || '')}
            >
              {isSavingProjectName ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            This codename replaces the real company name in anonymous teasers and lead memos.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
      <MemoSlotCard
        dealId={dealId}
        dealTitle={dealTitle}
        projectName={editableProjectName || projectName}
        slotType="anonymous_teaser"
        title="Anonymous Teaser"
        description="One-page blind profile. No company name, no owner name, no identifying details. Used for initial interest gauging."
        document={teaserDoc}
        draft={teaserLocked ? undefined : teaserDraft}
        locked={teaserLocked}
        lockedMessage="Upload a Final PDF for the Full Lead Memo before drafting the Anonymous Teaser."
      />
      <MemoSlotCard
        dealId={dealId}
        dealTitle={dealTitle}
        projectName={projectName}
        slotType="full_memo"
        title="Full Lead Memo"
        description="Comprehensive investment memo. Includes company name, financials, operations detail. Sent after NDA execution."
        document={fullMemoDoc}
        draft={fullMemoDraft}
      />
      </div>
    </div>
  );
}

// ─── Individual Memo Slot Card ───

interface MemoSlotCardProps {
  dealId: string;
  dealTitle?: string;
  projectName?: string | null;
  slotType: MemoSlotType;
  title: string;
  description: string;
  document?: DataRoomDocument;
  draft?: LeadMemo;
  generateDisabledReason?: string;
  locked?: boolean;
  lockedMessage?: string;
}

function MemoSlotCard({
  dealId,
  dealTitle,
  projectName,
  slotType,
  title,
  description,
  document,
  draft,
  generateDisabledReason,
  locked,
  lockedMessage,
}: MemoSlotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const documentUrl = useDocumentUrl();
  const generateMemo = useGenerateMemo();

  const { isGenerating, progress: generateProgress } = useGenerationProgress(dealId, slotType);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasDocument = !!document;
  const hasDraft = !!draft;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      return;
    }

    // If replacing, delete the old document first
    if (document) {
      await deleteDocument.mutateAsync({ documentId: document.id, dealId });
    }

    uploadDocument.mutate({
      file,
      dealId,
      folderName: slotType === 'anonymous_teaser' ? 'Teasers' : 'Memos',
      documentCategory: slotType,
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadPdf = () => {
    if (!document) return;
    documentUrl.mutate(
      { documentId: document.id, action: 'download' },
      {
        onSuccess: (data) => {
          if (data?.url) {
            window.open(data.url, '_blank');
          }
        },
      },
    );
  };

  const handleRemove = () => {
    if (!document) return;
    deleteDocument.mutate({ documentId: document.id, dealId });
    setConfirmRemove(false);
  };

  const handleGenerateDraft = () => {
    const key = getGenerationKey(dealId, slotType);
    // Don't restart if already generating
    if (activeGenerations.has(key)) return;

    const promise = generateMemo.mutateAsync({
      deal_id: dealId,
      memo_type: slotType,
      branding: 'sourceco',
      project_name: projectName || undefined,
    });

    startTrackedGeneration(key, promise);
  };

  const getMemoSections = () => {
    if (!draft?.content?.sections) return null;
    const rawSections = draft.content.sections as Array<{
      heading?: string;
      body?: string;
      bullets?: string[];
      key?: string;
      title?: string;
      content?: string;
    }>;
    return rawSections.map((s, i) => ({
      key: s.key || `section-${i}`,
      title: s.title || s.heading || '',
      content: s.content || s.body || (s.bullets ? s.bullets.join('\n') : ''),
    }));
  };

  const handleDownloadDocx = async () => {
    const sections = getMemoSections();
    if (!sections) return;
    setIsDownloadingDocx(true);
    try {
      const company = extractCompanyInfo(draft!.content as Record<string, unknown>);
      await generateMemoDocx({
        sections,
        memoType: slotType,
        dealTitle: slotType === 'anonymous_teaser' ? (projectName || 'Deal') : (dealTitle || 'Deal'),
        branding: 'SourceCo',
        companyInfo: company,
      });
    } finally {
      setIsDownloadingDocx(false);
    }
  };

  const handleDownloadDraftPdf = () => {
    const sections = getMemoSections();
    if (!sections) return;
    const title = slotType === 'anonymous_teaser'
      ? `Anonymous Teaser – ${projectName || 'Deal'}`
      : `Lead Memo – ${dealTitle || 'Deal'}`;

    const htmlContent = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { margin: 1in; size: letter; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 100%; margin: 0; padding: 0; font-size: 11pt; }
  h1 { font-size: 18pt; font-weight: 700; margin: 0 0 6pt 0; letter-spacing: -0.02em; }
  h2 { font-size: 13pt; font-weight: 600; margin: 20pt 0 8pt 0; padding-bottom: 4pt; border-bottom: 1px solid #e5e5e5; }
  p { margin: 0 0 8pt 0; }
  .subtitle { font-size: 10pt; color: #666; margin-bottom: 20pt; }
  .section-content { white-space: pre-wrap; }
  .confidential { font-size: 8pt; color: #999; text-align: center; margin-top: 30pt; border-top: 1px solid #e5e5e5; padding-top: 8pt; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head><body>
<h1>${title}</h1>
<p class="subtitle">Prepared by SourceCo Advisors &bull; ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
${sections.map(s => `<h2>${s.title}</h2><div class="section-content">${s.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>`).join('\n')}
<p class="confidential">CONFIDENTIAL — This document contains proprietary information and is intended solely for the recipient.</p>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
  };

  const isUploading = uploadDocument.isPending;
  const isDeleting = deleteDocument.isPending;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {title}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {hasDraft && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <BookOpen className="h-3 w-3 mr-1" />
                  Draft
                </Badge>
              )}
              {hasDocument && (
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Final PDF
                </Badge>
              )}
              {!hasDraft && !hasDocument && (
                <Badge variant="outline" className="text-muted-foreground">
                  No memo
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {locked ? (
            /* ─── Locked State: entire card is disabled ─── */
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  AI Draft
                </p>
                <div className="flex items-center justify-center py-6 border-2 border-dashed rounded-lg bg-muted/20 opacity-60">
                  <div className="text-center space-y-1">
                    <FileText className="h-6 w-6 mx-auto text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">{lockedMessage}</p>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Final PDF
                </p>
                <div className="flex items-center justify-center py-4 border-2 border-dashed rounded-lg bg-muted/20 opacity-60">
                  <div className="text-center">
                    <FileUp className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1" />
                    <p className="text-xs text-muted-foreground">
                      Requires Full Lead Memo PDF first
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ─── AI Draft Section ─── */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  AI Draft
                </p>
                {isGenerating ? (
                  <div className="space-y-3 p-4 rounded-lg border bg-blue-50/30 dark:bg-blue-950/10">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {hasDraft ? 'Regenerating' : 'Generating'}{' '}
                          {slotType === 'anonymous_teaser' ? 'Anonymous Teaser' : 'Full Lead Memo'}…
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {generateProgress < 30
                            ? 'Analyzing deal data and transcripts…'
                            : generateProgress < 60
                              ? 'Drafting memo sections…'
                              : generateProgress < 90
                                ? 'Finalizing content…'
                                : 'Almost done…'}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-blue-700">{generateProgress}%</span>
                    </div>
                    <Progress value={generateProgress} className="h-2" />
                  </div>
                ) : hasDraft ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
                      <div className="h-9 w-9 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {slotType === 'anonymous_teaser' ? 'Anonymous Teaser' : 'Full Lead Memo'}{' '}
                          — v{draft.version || 1}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Generated {format(new Date(draft.created_at!), 'MMM d, yyyy h:mm a')}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {draft.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setPreviewOpen(true)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleDownloadDocx}
                        disabled={isDownloadingDocx}
                      >
                        {isDownloadingDocx ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        .docx
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleDownloadDraftPdf}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        .pdf
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateDraft}
                        disabled={isGenerating}
                      >
                        {isGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Regenerate
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Button
                      className="w-full"
                      onClick={handleGenerateDraft}
                      disabled={isGenerating || !!generateDisabledReason}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Generate Draft
                    </Button>
                    {generateDisabledReason && (
                      <p className="text-xs text-muted-foreground text-center">
                        {generateDisabledReason}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* ─── Final PDF Section ─── */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Final PDF
                </p>
                {hasDocument ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20">
                      <div className="h-9 w-9 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{document.file_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Uploaded {format(new Date(document.created_at), 'MMM d, yyyy')}
                          </span>
                          {document.file_size_bytes && (
                            <>
                              <span>·</span>
                              <span>{(document.file_size_bytes / 1024).toFixed(0)} KB</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleDownloadPdf}
                        disabled={documentUrl.isPending}
                      >
                        {documentUrl.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleUploadClick}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Replace
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmRemove(true)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center py-4 border-2 border-dashed rounded-lg bg-muted/30">
                      <div className="text-center">
                        <FileUp className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1" />
                        <p className="text-xs text-muted-foreground">No final PDF uploaded</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleUploadClick}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Upload PDF
                    </Button>
                  </div>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      {draft && (
        <PreviewDialog
          draft={draft}
          title={title}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the uploaded PDF. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Preview Dialog ───

function PreviewDialog({
  draft,
  title,
  open,
  onOpenChange,
}: {
  draft: LeadMemo;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title} — Draft Preview</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <DraftPreview draft={draft} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Draft Preview Component ───

function DraftPreview({ draft }: { draft: LeadMemo }) {
  const sections = (
    draft.content as {
      sections?: Array<{
        key?: string;
        title?: string;
        heading?: string;
        content?: string;
        body?: string;
        bullets?: string[];
      }>;
    }
  )?.sections;
  const company = extractCompanyInfo(draft.content);
  const isAnonymous = draft.memo_type === 'anonymous_teaser';
  const logoUrl = '/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png';

  if (!sections || !Array.isArray(sections)) {
    return (
      <p className="text-sm text-muted-foreground italic">No preview available for this draft.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Letterhead */}
      <div className="flex items-center gap-3 pb-3 border-b-2 border-[#1a1a2e]">
        <img src={logoUrl} alt="SourceCo" className="w-10 h-10 rounded-full object-cover" />
        <span className="text-lg font-bold tracking-widest text-[#1a1a2e]">SOURCECO</span>
      </div>

      {/* Company info block — anonymous teasers show only project codename */}
      {isAnonymous ? (
        company.company_name && (
          <div className="pl-3 border-l-4 border-[#1a1a2e] bg-muted/30 py-2 px-3">
            <p className="font-bold text-sm text-[#1a1a2e]">{company.company_name}</p>
          </div>
        )
      ) : (
        (company.company_name || company.company_address || company.company_website) && (
          <div className="pl-3 border-l-4 border-[#1a1a2e] bg-muted/30 py-2 px-3">
            {company.company_name && (
              <p className="font-bold text-sm text-[#1a1a2e]">{company.company_name}</p>
            )}
            {company.company_address && (
              <p className="text-xs text-muted-foreground">{company.company_address}</p>
            )}
            {company.company_website && (
              <p className="text-xs text-muted-foreground">{company.company_website}</p>
            )}
            {company.company_phone && (
              <p className="text-xs text-muted-foreground">{company.company_phone}</p>
            )}
          </div>
        )
      )}

      {/* Memo type */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">
          {isAnonymous ? 'Anonymous Teaser' : 'Confidential Lead Memo'}
        </p>
      </div>

      <Separator />

      {/* Sections as continuous document */}
      {sections
        .filter((s) => s.key !== 'header_block' && s.key !== 'contact_information')
        .map((section) => {
          const sectionTitle = section.title || section.heading || '';
          const sectionContent = section.content || section.body || '';
          return (
            <div key={sectionTitle || sectionContent?.slice(0, 40)}>
              {sectionTitle && (
                <h3 className="text-sm font-semibold mb-1 text-[#1a1a2e] border-b border-muted pb-1">
                  {sectionTitle}
                </h3>
              )}
              {sectionContent && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {sectionContent}
                </p>
              )}
              {section.bullets && Array.isArray(section.bullets) && (
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-0.5 mt-1">
                  {section.bullets.map((bullet: string) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
    </div>
  );
}
