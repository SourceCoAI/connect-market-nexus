import { Checkbox } from '@/components/ui/checkbox';
import { useEnrichmentQueueStatus } from '@/hooks/useEnrichmentQueueStatus';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Plus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  RefreshCw,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SingleDealEnrichmentDialog } from '../SingleDealEnrichmentDialog';

// Sub-components
import { FirefliesLinkPanel } from '../transcript/FirefliesLinkPanel';
import { TranscriptAddDialog } from '../transcript/TranscriptAddDialog';
import { EnrichmentProgressCard } from '../transcript/EnrichmentProgressCard';
import { TranscriptListItem } from '../transcript/TranscriptListItem';

import type { DealTranscriptSectionProps } from './types';
import { useFirefliesSync } from './useFirefliesSync';
import { useTranscriptActions } from './useTranscriptActions';
import { useQueryClient } from '@tanstack/react-query';

export { type DealTranscript, type DealTranscriptSectionProps } from './types';

export function DealTranscriptSection({
  dealId,
  transcripts,
  isLoading,
  dealInfo,
  contactEmail,
  contactEmails,
  contactName,
  companyName,
  onSyncComplete,
  onTranscriptLinked,
}: DealTranscriptSectionProps) {
  const queryClient = useQueryClient();

  const ff = useFirefliesSync({
    dealId,
    contactEmail,
    contactEmails,
    companyName,
    transcripts,
    onSyncComplete,
    onTranscriptLinked,
  });
  const actions = useTranscriptActions({ dealId, transcripts, dealInfo });

  // Poll enrichment_queue for completion
  useEnrichmentQueueStatus({
    listingId: dealId,
    enabled: actions.enrichmentPollingEnabled,
    onComplete: () => actions.setEnrichmentPollingEnabled(false),
  });

  // === Shared UI pieces ===
  const enrichButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2" disabled={actions.isEnriching}>
          {actions.isEnriching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Enrich
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => actions.handleEnrichDeal(false)}>
          <Sparkles className="h-4 w-4 mr-2" /> Enrich New Only
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.handleEnrichDeal(true)}>
          <RefreshCw className="h-4 w-4 mr-2" /> Re-extract All Transcripts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const addTranscriptDialog = (
    <Dialog
      open={actions.isAddDialogOpen}
      onOpenChange={(open) => {
        actions.setIsAddDialogOpen(open);
        if (!open) actions.resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Add Transcript
        </Button>
      </DialogTrigger>
      <TranscriptAddDialog
        transcriptTitle={actions.transcriptTitle}
        onTranscriptTitleChange={actions.setTranscriptTitle}
        transcriptUrl={actions.transcriptUrl}
        onTranscriptUrlChange={actions.setTranscriptUrl}
        callDate={actions.callDate}
        onCallDateChange={actions.setCallDate}
        newTranscript={actions.newTranscript}
        onNewTranscriptChange={actions.setNewTranscript}
        fileInputRef={actions.fileInputRef}
        selectedFiles={actions.selectedFiles}
        onSelectedFilesChange={actions.setSelectedFiles}
        isMultiFileMode={actions.isMultiFileMode}
        onFileUpload={actions.handleFileUpload}
        addMutationPending={actions.addMutation.isPending}
        onAddMutate={() => actions.addMutation.mutate()}
        processingProgress={actions.processingProgress}
        addMode={actions.addMode}
        onAddModeChange={actions.setAddMode}
        firefliesEmail={actions.firefliesEmail}
        onFirefliesEmailChange={actions.setFirefliesEmail}
        firefliesSearching={actions.firefliesSearching}
        onFirefliesSearch={actions.handleFirefliesSearch}
        firefliesResults={actions.firefliesResults}
        selectedFirefliesIds={actions.selectedFirefliesIds}
        onToggleFirefliesId={(id) => {
          actions.setSelectedFirefliesIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        onToggleAllFireflies={() => {
          if (actions.selectedFirefliesIds.size === actions.firefliesResults.length)
            actions.setSelectedFirefliesIds(new Set());
          else
            actions.setSelectedFirefliesIds(
              new Set(actions.firefliesResults.map((r: { id: string }) => r.id)),
            );
        }}
        firefliesImporting={actions.firefliesImporting}
        onFirefliesImport={actions.handleFirefliesImport}
        firefliesSearchInfo={actions.firefliesSearchInfo}
        onClose={() => {
          actions.setIsAddDialogOpen(false);
          actions.resetForm();
        }}
      />
    </Dialog>
  );

  const enrichmentResultDialog = (
    <SingleDealEnrichmentDialog
      open={actions.showEnrichmentDialog}
      onOpenChange={actions.setShowEnrichmentDialog}
      result={actions.enrichmentResult}
      onRetry={() => actions.handleEnrichDeal(false)}
    />
  );

  const linkPanel = (
    <FirefliesLinkPanel
      contactEmail={contactEmail}
      contactEmails={ff.allContactEmails}
      contactName={contactName}
      lastSynced={ff.lastSynced}
      syncLoading={ff.syncLoading}
      onSync={ff.handleFirefliesSync}
      firefliesUrl={ff.firefliesUrl}
      onFirefliesUrlChange={ff.setFirefliesUrl}
      linkingUrl={ff.linkingUrl}
      onLinkByUrl={ff.handleLinkByUrl}
      ffFileInputRef={ff.ffFileInputRef}
      ffUploading={ff.ffUploading}
      onFfFileUpload={ff.handleFfFileUpload}
      ffQuery={ff.ffQuery}
      onFfQueryChange={ff.setFfQuery}
      ffSearchLoading={ff.ffSearchLoading}
      onFfQuickSearch={ff.handleFfQuickSearch}
      ffResults={ff.ffResults}
      ffHasSearched={ff.ffHasSearched}
      ffLinking={ff.ffLinking}
      onLinkSearchResult={
        ff.handleLinkSearchResult as unknown as (transcript: {
          id: string;
          [key: string]: unknown;
        }) => void
      }
      onClearResults={ff.clearFfResults}
    />
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
      </Card>
    );
  }

  // No transcripts
  if (transcripts.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" /> Call Transcripts
            </CardTitle>
            <div className="flex items-center gap-2">
              {enrichButton}
              {addTranscriptDialog}
            </div>
          </div>
        </CardHeader>
        {actions.isEnriching && (
          <CardContent className="py-3 pt-0">
            <EnrichmentProgressCard
              enrichmentPhase={actions.enrichmentPhase}
              enrichmentProgress={actions.enrichmentProgress}
              primaryCounter
            />
          </CardContent>
        )}
        <CardContent className="py-2 pt-0 space-y-3">
          {linkPanel}
          <p className="text-sm text-muted-foreground">No transcripts linked yet.</p>
        </CardContent>
        {enrichmentResultDialog}
      </Card>
    );
  }

  // Has transcripts
  return (
    <Card>
      <Collapsible open={actions.isListExpanded} onOpenChange={actions.setIsListExpanded}>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Call Transcripts
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {transcripts.length}
                </Badge>
                {actions.isListExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {enrichButton}
              {addTranscriptDialog}
            </div>
          </div>
        </CardHeader>
        {actions.isEnriching && (
          <CardContent className="py-3 pt-0">
            <EnrichmentProgressCard
              enrichmentPhase={actions.enrichmentPhase}
              enrichmentProgress={actions.enrichmentProgress}
            />
          </CardContent>
        )}
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {linkPanel}
            {/* Duplicate & failed cleanup */}
            {(() => {
              const normalize = (title: string) =>
                title.replace(/\.(pdf|docx?|txt|vtt|srt)$/i, '').trim();
              const groups = new Map<string, typeof transcripts>();
              transcripts.forEach((t) => {
                const key = normalize(t.title || t.transcript_text?.substring(0, 100) || t.id);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(t);
              });
              const dupeIds: string[] = [];
              const failedIds: string[] = [];
              for (const [, group] of groups) {
                if (group.length > 1) {
                  group.sort((a, b) => {
                    if (a.processed_at && !b.processed_at) return -1;
                    if (!a.processed_at && b.processed_at) return 1;
                    return (b.transcript_text?.length || 0) - (a.transcript_text?.length || 0);
                  });
                  for (let i = 1; i < group.length; i++) dupeIds.push(group[i].id);
                }
              }
              transcripts.forEach((t) => {
                if (
                  !dupeIds.includes(t.id) &&
                  t.transcript_text &&
                  t.transcript_text.length < 200 &&
                  (t.transcript_text.includes('[text extraction pending') ||
                    t.transcript_text.includes('[File uploaded:'))
                ) {
                  failedIds.push(t.id);
                }
              });
              const totalCleanup = dupeIds.length + failedIds.length;
              if (totalCleanup > 0) {
                return (
                  <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span>
                        {dupeIds.length > 0 &&
                          `${dupeIds.length} duplicate${dupeIds.length > 1 ? 's' : ''}`}
                        {dupeIds.length > 0 && failedIds.length > 0 && ' + '}
                        {failedIds.length > 0 &&
                          `${failedIds.length} failed extraction${failedIds.length > 1 ? 's' : ''}`}
                        {' detected'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={async () => {
                        const allIds = [...dupeIds, ...failedIds];
                        if (
                          !confirm(
                            `Delete ${allIds.length} transcript${allIds.length > 1 ? 's' : ''} (${dupeIds.length} duplicates, ${failedIds.length} failed)?`,
                          )
                        )
                          return;
                        const { error } = await supabase
                          .from('deal_transcripts')
                          .delete()
                          .in('id', allIds);
                        if (error) toast.error('Failed to delete');
                        else {
                          toast.success(
                            `Cleaned up ${allIds.length} transcript${allIds.length > 1 ? 's' : ''}`,
                          );
                          queryClient.invalidateQueries({
                            queryKey: ['remarketing', 'deal-transcripts', dealId],
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Clean Up
                    </Button>
                  </div>
                );
              }
              return null;
            })()}
            {/* Select all + bulk actions */}
            {transcripts.length > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={actions.selectedTranscriptIds.size === transcripts.length}
                    onCheckedChange={() => actions.toggleAllTranscripts(transcripts)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {actions.selectedTranscriptIds.size > 0
                      ? `${actions.selectedTranscriptIds.size} selected`
                      : 'Select all'}
                  </span>
                </div>
                {actions.selectedTranscriptIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete ${actions.selectedTranscriptIds.size} transcript${actions.selectedTranscriptIds.size > 1 ? 's' : ''}?`,
                        )
                      )
                        actions.bulkDeleteMutation.mutate(
                          Array.from(actions.selectedTranscriptIds),
                        );
                    }}
                    disabled={actions.bulkDeleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" /> Delete Selected
                  </Button>
                )}
              </div>
            )}
            {/* Email-matched transcripts (direct matches) */}
            {(() => {
              const emailMatches = transcripts.filter((t) => t.match_type !== 'keyword');
              const keywordMatches = transcripts.filter((t) => t.match_type === 'keyword');
              return (
                <>
                  {emailMatches.map((transcript) => (
                    <TranscriptListItem
                      key={transcript.id}
                      transcript={transcript}
                      isExpanded={actions.expandedId === transcript.id}
                      onToggleExpanded={(open) =>
                        actions.setExpandedId(open ? transcript.id : null)
                      }
                      isSelected={actions.selectedTranscriptIds.has(transcript.id)}
                      onToggleSelected={actions.toggleTranscriptSelection}
                      isProcessing={actions.processingId === transcript.id}
                      isApplying={actions.applyingId === transcript.id}
                      onExtract={actions.handleExtract}
                      onApply={actions.handleApply}
                      onDelete={(id) => actions.deleteMutation.mutate(id)}
                    />
                  ))}
                  {keywordMatches.length > 0 && (
                    <>
                      <div className="flex items-center gap-3 py-2">
                        <div className="flex-1 border-t border-blue-200 dark:border-blue-800" />
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">
                          Possibly related calls (matched by company name)
                        </span>
                        <div className="flex-1 border-t border-blue-200 dark:border-blue-800" />
                      </div>
                      {keywordMatches.map((transcript) => (
                        <TranscriptListItem
                          key={transcript.id}
                          transcript={transcript}
                          isExpanded={actions.expandedId === transcript.id}
                          onToggleExpanded={(open) =>
                            actions.setExpandedId(open ? transcript.id : null)
                          }
                          isSelected={actions.selectedTranscriptIds.has(transcript.id)}
                          onToggleSelected={actions.toggleTranscriptSelection}
                          isProcessing={actions.processingId === transcript.id}
                          isApplying={actions.applyingId === transcript.id}
                          onExtract={actions.handleExtract}
                          onApply={actions.handleApply}
                          onDelete={(id) => actions.deleteMutation.mutate(id)}
                        />
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </CardContent>
        </CollapsibleContent>
        {enrichmentResultDialog}
      </Collapsible>
    </Card>
  );
}
