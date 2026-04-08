/**
 * MemosPanel: AI lead memo generation and publishing
 *
 * Features:
 * - Generate anonymous teaser or full memo via AI
 * - Branding selection
 * - Publish to data room
 * - Export PDF with professional letterhead
 * - Send via email with AI-drafted outreach
 * - Manual log send
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  Sparkles,
  FileText,
  Send,
  Download,
  Edit,
  Loader2,
  CheckCircle,
  Clock,
  Archive,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useLeadMemos,
  useGenerateMemo,
  useGenerateTeaser,
  usePublishMemo,
  LeadMemo,
} from '@/hooks/admin/data-room/use-data-room';
import { SendMemoDialog } from './SendMemoDialog';
import { ManualLogDialog } from './ManualLogDialog';
import { buildMemoPdfHtml, openPrintWindow } from '@/lib/memo-pdf-template';

interface MemosPanelProps {
  dealId: string;
  dealTitle?: string;
}

const BRANDING_OPTIONS = [
  { value: 'sourceco', label: 'SourceCo' },
  { value: 'new_heritage', label: 'New Heritage Capital' },
  { value: 'renovus', label: 'Renovus Capital' },
  { value: 'cortec', label: 'Cortec Group' },
];

const STATUS_BADGES: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  draft: { label: 'Draft', icon: Edit, className: 'bg-amber-100 text-amber-800' },
  published: { label: 'Published', icon: CheckCircle, className: 'bg-green-100 text-green-800' },
  archived: { label: 'Archived', icon: Archive, className: 'bg-gray-100 text-gray-600' },
};

export function MemosPanel({ dealId, dealTitle }: MemosPanelProps) {
  const { data: memos = [], isLoading } = useLeadMemos(dealId);
  const generateMemo = useGenerateMemo();
  const generateTeaser = useGenerateTeaser();
  const publishMemo = usePublishMemo();

  const [generateType, setGenerateType] = useState<'anonymous_teaser' | 'full_memo' | 'both'>(
    'both',
  );
  const [branding, setBranding] = useState('sourceco');
  const [projectName, setProjectName] = useState('Project ');
  const [teaserValidation, setTeaserValidation] = useState<{
    pass: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [sendingMemo, setSendingMemo] = useState<LeadMemo | null>(null);
  const [loggingMemo, setLoggingMemo] = useState<LeadMemo | null>(null);

  const teaserMemos = memos.filter((m) => m.memo_type === 'anonymous_teaser');
  const fullMemos = memos.filter((m) => m.memo_type === 'full_memo');

  const hasCompletedMemo = fullMemos.some((m) => m.status === 'published');

  const handleGenerate = () => {
    generateMemo.mutate({
      deal_id: dealId,
      memo_type: generateType,
      branding,
    });
  };

  const handleGenerateTeaser = () => {
    setTeaserValidation(null);
    generateTeaser.mutate(
      { deal_id: dealId, project_name: projectName.trim() || undefined },
      {
        onSuccess: (data) => {
          if (data?.validation) {
            setTeaserValidation(data.validation);
          }
        },
      },
    );
  };

  const handlePublish = (memoId: string) => {
    publishMemo.mutate({ memoId, dealId });
  };

  const handleExportPdf = (memo: LeadMemo) => {
    const sections =
      (
        memo.content as {
          sections?: Array<{ title: string; content: string; key?: string }>;
        } | null
      )?.sections || [];
    const isAnonymous = memo.memo_type === 'anonymous_teaser';
    const displayTitle = isAnonymous ? (projectName || 'Deal') : (dealTitle || 'Deal');

    const html = buildMemoPdfHtml({
      sections,
      memoType: memo.memo_type || 'lead_memo',
      dealTitle: displayTitle,
      branding: memo.branding || 'sourceco',
      content: memo.content as Record<string, unknown>,
    });
    openPrintWindow(html);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Generate Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Lead Memo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Memo Type
              </label>
              <Select
                value={generateType}
                onValueChange={(v: string) =>
                  setGenerateType(v as 'anonymous_teaser' | 'full_memo' | 'both')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anonymous_teaser">Anonymous Teaser</SelectItem>
                  <SelectItem value="full_memo">Full Lead Memo</SelectItem>
                  <SelectItem value="both">Both (Teaser + Full)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Branding
              </label>
              <Select value={branding} onValueChange={setBranding}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANDING_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={generateMemo.isPending}>
              {generateMemo.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            AI will draft from transcripts, enrichment data, and manual entries. Download the .docx
            to edit in Word.
          </p>
        </CardContent>
      </Card>

      {/* Generate Anonymous Teaser Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Anonymous Teaser
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Project Name
              </label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project HVAC"
              />
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={handleGenerateTeaser}
                      disabled={!hasCompletedMemo || generateTeaser.isPending}
                    >
                      {generateTeaser.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Generate Teaser
                    </Button>
                  </span>
                </TooltipTrigger>
                {!hasCompletedMemo && (
                  <TooltipContent>Generate and approve the lead memo first.</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Generates an anonymized teaser from the published lead memo. All identifying info is
            stripped.
          </p>
          {teaserValidation && (
            <div className="mt-3 space-y-1">
              {teaserValidation.pass && teaserValidation.warnings.length === 0 && (
                <p className="text-xs text-green-600 font-medium">All validation checks passed.</p>
              )}
              {teaserValidation.warnings.map((w, i) => (
                <p key={`w-${i}`} className="text-xs text-amber-600">
                  Warning: {w}
                </p>
              ))}
              {teaserValidation.errors.map((e, i) => (
                <p key={`e-${i}`} className="text-xs text-red-600">
                  Error: {e}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Memos */}
      {memos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BookOpen className="mx-auto h-8 w-8 mb-2" />
            No memos generated yet. Click "Generate" to create an AI draft.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Anonymous Teasers */}
          {teaserMemos.length > 0 && (
            <MemoSection
              title="Anonymous Teasers"
              memos={teaserMemos}
              onPublish={handlePublish}
              onExportPdf={handleExportPdf}
              onSendEmail={setSendingMemo}
              onManualLog={setLoggingMemo}
            />
          )}

          {/* Full Memos */}
          {fullMemos.length > 0 && (
            <MemoSection
              title="Full Lead Memos"
              memos={fullMemos}
              onPublish={handlePublish}
              onExportPdf={handleExportPdf}
              onSendEmail={setSendingMemo}
              onManualLog={setLoggingMemo}
            />
          )}
        </>
      )}

      {/* Send Email Dialog */}
      {sendingMemo && (
        <SendMemoDialog memo={sendingMemo} dealId={dealId} onClose={() => setSendingMemo(null)} />
      )}

      {/* Manual Log Dialog */}
      {loggingMemo && (
        <ManualLogDialog memo={loggingMemo} dealId={dealId} onClose={() => setLoggingMemo(null)} />
      )}
    </div>
  );
}

// ─── Memo Section Component ───

function MemoSection({
  title,
  memos,
  onPublish,
  onExportPdf,
  onSendEmail,
  onManualLog,
}: {
  title: string;
  memos: LeadMemo[];
  onPublish: (memoId: string) => void;
  onExportPdf: (memo: LeadMemo) => void;
  onSendEmail: (memo: LeadMemo) => void;
  onManualLog: (memo: LeadMemo) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {memos.map((memo) => {
            const statusInfo = STATUS_BADGES[memo.status];
            const StatusIcon = statusInfo.icon;

            return (
              <div key={memo.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {memo.memo_type === 'anonymous_teaser'
                        ? 'Anonymous Teaser'
                        : 'Full Lead Memo'}
                      <span className="text-xs text-muted-foreground ml-1">v{memo.version}</span>
                    </p>
                    <Badge className={statusInfo.className} variant="secondary">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {BRANDING_OPTIONS.find((b) => b.value === memo.branding)?.label ||
                      memo.branding}
                    {' · '}
                    {new Date(memo.created_at).toLocaleDateString()}
                    {memo.published_at &&
                      ` · Published ${new Date(memo.published_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExportPdf(memo)}
                    title="Export PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSendEmail(memo)}
                    title="Send via Email"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onManualLog(memo)}
                    title="Log Manual Send"
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </Button>
                  {memo.status === 'draft' && (
                    <Button variant="outline" size="sm" onClick={() => onPublish(memo.id)}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
