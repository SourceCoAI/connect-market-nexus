import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  Trash2,
  Loader2,
  Link as _LinkIcon,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Users,
  Clock,
  Phone,
  Flame,
} from "lucide-react";
import { format } from "date-fns";
import { ExtractedIntelligenceView } from "./ExtractedIntelligenceView";

interface ExternalParticipant {
  name: string;
  email: string;
}

interface DealTranscript {
  id: string;
  listing_id: string;
  transcript_text: string;
  source: string | null;
  extracted_data: unknown;
  applied_to_deal: boolean | null;
  applied_at: string | null;
  processed_at: string | null;
  created_at: string;
  created_by?: string | null;
  updated_at?: string;
  title?: string | null;
  transcript_url?: string | null;
  recording_url?: string | null;
  call_date?: string | null;
  has_content?: boolean | null;
  match_type?: string | null;
  external_participants?: ExternalParticipant[] | null;
}

interface TranscriptListItemProps {
  transcript: DealTranscript;
  isExpanded: boolean;
  onToggleExpanded: (open: boolean) => void;
  isSelected: boolean;
  onToggleSelected: (id: string, e?: React.MouseEvent) => void;
  isProcessing: boolean;
  isApplying: boolean;
  onExtract: (transcript: DealTranscript) => void;
  onApply: (transcript: DealTranscript) => void;
  onDelete: (id: string) => void;
}

/**
 * Format external participants for display.
 * Shows "With: Name1, Name2" for external participants,
 * "Internal call" if all participants are internal.
 */
function formatParticipants(participants?: ExternalParticipant[] | null): string | null {
  if (!participants || participants.length === 0) return null;
  const names = participants.map(p => p.name).filter(Boolean);
  if (names.length === 0) return null;
  return names.join(', ');
}

export function TranscriptListItem({
  transcript,
  isExpanded,
  onToggleExpanded,
  isSelected,
  onToggleSelected,
  isProcessing,
  isApplying,
  onExtract,
  onApply,
  onDelete,
}: TranscriptListItemProps) {
  const hasExtracted = !!transcript.processed_at;
  const isApplied = transcript.applied_to_deal;
  const hasContent = transcript.has_content !== false; // treat null/undefined as true
  const isKeywordMatch = transcript.match_type === 'keyword';
  const isPendingFetch = hasContent && transcript.transcript_text &&
    (transcript.transcript_text.includes('pending fetch') ||
     transcript.transcript_text === 'Fireflies transcript' ||
     transcript.transcript_text.includes('Linked via URL'));

  const displayTitle = transcript.title ||
    `Transcript from ${format(new Date(transcript.created_at), 'MMM d, yyyy')}`;

  const participantDisplay = formatParticipants(transcript.external_participants);
  // If external_participants is empty but we know it's a Fireflies transcript, show "Internal call"
  const isFireflies = transcript.source === 'fireflies';
  const isPhoneBurner = transcript.source === 'phoneburner';
  const showInternalLabel = isFireflies && transcript.external_participants != null && transcript.external_participants.length === 0;
  const viewUrl = transcript.transcript_url || transcript.recording_url || null;

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={onToggleExpanded}
    >
      <div className={`border rounded-lg ${!hasContent ? 'opacity-60 bg-muted/30' : ''}`}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 hover:bg-muted/50">
            <div className="flex items-center gap-3">
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelected(transcript.id)}
                />
              </div>
              <FileText className={`h-4 w-4 ${!hasContent ? 'text-amber-500' : 'text-muted-foreground'}`} />
              <div className="text-left">
                <p className="font-medium text-sm">{displayTitle}</p>
                {transcript.call_date && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(transcript.call_date), 'MMM d, yyyy')}
                  </p>
                )}
                {/* Participant display */}
                {participantDisplay && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Users className="h-3 w-3" />
                    With: {participantDisplay}
                  </p>
                )}
                {showInternalLabel && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Users className="h-3 w-3" />
                    Internal call
                  </p>
                )}
                {/* No content warning */}
                {!hasContent && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3" />
                    Call recorded but no transcript captured
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-primary gap-1 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(viewUrl!, '_blank');
                  }}
                  title={isPhoneBurner ? 'Open recording' : 'Open in Fireflies'}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View
                </Button>
              )}
              {!hasContent && (
                <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  No Audio
                </Badge>
              )}
              {isFireflies && (
                <Badge variant="outline" className="gap-1 text-xs text-orange-600 border-orange-300">
                  <Flame className="h-3 w-3" />
                  Fireflies
                </Badge>
              )}
              {isPhoneBurner && (
                <Badge variant="outline" className="gap-1 text-xs text-green-600 border-green-300">
                  <Phone className="h-3 w-3" />
                  PhoneBurner
                </Badge>
              )}
              {isKeywordMatch && (
                <Badge variant="outline" className="gap-1 text-xs text-blue-600 border-blue-300">
                  Matched by Name
                </Badge>
              )}
              {hasExtracted && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Sparkles className="h-3 w-3" />
                  Extracted
                </Badge>
              )}
              {isApplied && (
                <Badge variant="default" className="gap-1 text-xs">
                  <Check className="h-3 w-3" />
                  Applied
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Delete this transcript?')) {
                    onDelete(transcript.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t p-4 space-y-4">
            {!hasContent ? (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                  No transcript available
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  This call was recorded but the audio was not captured — may be a Teams audio routing issue.
                </p>
                {viewUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => window.open(viewUrl!, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {isPhoneBurner ? 'Open Recording' : 'Open in Fireflies'}
                  </Button>
                )}
              </div>
            ) : isPendingFetch ? (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                <Clock className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                  Transcript content not yet loaded
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                  The full transcript will be fetched from Fireflies when you extract intelligence.
                </p>
                {viewUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                    onClick={() => window.open(viewUrl!, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View in Fireflies
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {viewUrl && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-primary"
                      onClick={() => window.open(viewUrl!, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {isPhoneBurner ? 'Open Recording' : 'Open in Fireflies'}
                    </Button>
                  </div>
                )}
                <div className="bg-muted/50 rounded-lg p-3 max-h-48 overflow-auto">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {transcript.transcript_text}
                  </pre>
                </div>
              </div>
            )}

            {hasExtracted && !!transcript.extracted_data && (
              <ExtractedIntelligenceView extractedData={transcript.extracted_data as Record<string, unknown>} />
            )}

            {hasContent && (
              <div className="flex items-center gap-2">
                {!hasExtracted ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onExtract(transcript)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Extract Intelligence
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onExtract(transcript)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Re-extract
                  </Button>
                )}
                {hasExtracted && !isApplied && (
                  <Button
                    size="sm"
                    onClick={() => onApply(transcript)}
                    disabled={isApplying}
                  >
                    {isApplying ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Apply to Deal
                  </Button>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
