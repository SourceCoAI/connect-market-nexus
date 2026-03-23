import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BookOpen, Sparkles, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { GuideGenerationErrorPanel } from '../GuideGenerationErrorPanel';
import { GenerationSummaryPanel } from '../GenerationSummaryPanel';
import { GuideCompletionDialog } from '../GuideCompletionDialog';

import type { AIResearchSectionProps } from './types';
import { ClarificationPanel } from './ClarificationPanel';
import { GenerationProgress } from './GenerationProgress';
import { useGuideUpload } from './useGuideUpload';
import { useClarification } from './useClarification';
import { useGenerationEngine } from './useGenerationEngine';
import { DuplicateWarningBanner } from './DuplicateWarningBanner';
import { SavedProgressBanner } from './SavedProgressBanner';
import { GuideInputForm } from './GuideInputForm';

// Re-export types for external consumers
export type { ExtractedCriteria, AIResearchSectionProps } from './types';

export const AIResearchSection = ({
  onGuideGenerated,
  universeName,
  existingContent,
  universeId,
  onDocumentAdded,
}: AIResearchSectionProps) => {
  const [isOpen, setIsOpen] = useState(!!existingContent && existingContent.length > 100);
  const [industryName, setIndustryName] = useState(universeName || '');
  const [industryDescription, setIndustryDescription] = useState('');

  useEffect(() => {
    if (universeName && !industryName) setIndustryName(universeName);
  }, [universeName, industryName]);

  const engine = useGenerationEngine({
    universeId,
    universeName,
    existingContent,
    onGuideGenerated,
    onDocumentAdded,
    industryName,
    industryDescription,
  });

  const upload = useGuideUpload({
    universeId,
    onDocumentAdded,
    onGuideGenerated,
  });

  const clarification = useClarification({
    industryName,
    industryDescription,
    existingContent,
    onGenerate: engine.handleGenerate,
  });

  const handleStartClarification = () => {
    clarification.handleStartClarification(engine.setState);
  };

  const handleCancel = () => {
    engine.handleCancel();
    clarification.resetClarification();
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">M&A Research Guide</CardTitle>
              <CardDescription>
                {existingContent && existingContent.length > 100
                  ? `${engine.wordCount.toLocaleString()} word industry research guide`
                  : 'Generate comprehensive 30,000+ word industry research guide'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {engine.state === 'complete' && (
              <Badge variant="default" className="bg-green-600">
                <Check className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            )}
            {engine.wordCount > 0 && engine.state !== 'complete' && (
              <Badge variant="secondary">{engine.wordCount.toLocaleString()} words</Badge>
            )}
            {(engine.state === 'idle' || engine.state === 'complete' || engine.state === 'error') &&
              !isOpen && (
                <Button
                  size="sm"
                  variant={existingContent && existingContent.length > 100 ? 'outline' : 'default'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  {existingContent && existingContent.length > 100
                    ? 'View Guide'
                    : 'Run AI Research'}
                </Button>
              )}
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>
        {!isOpen && existingContent && existingContent.length > 100 && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground line-clamp-2">
              {existingContent.replace(/[#*`]/g, '').substring(0, 200)}...
            </p>
          </div>
        )}
      </CardHeader>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {clarification.showDuplicateWarning && (
              <DuplicateWarningBanner
                existingWordCount={existingContent?.split(/\s+/).length || 0}
                onRegenerate={() => clarification.proceedWithClarification(engine.setState)}
                onCancel={() => clarification.setShowDuplicateWarning(false)}
              />
            )}

            {engine.savedProgress &&
              engine.state === 'idle' &&
              !clarification.showDuplicateWarning && (
                <SavedProgressBanner
                  batchIndex={engine.savedProgress.batchIndex}
                  savedWordCount={engine.savedProgress.content.split(/\s+/).length}
                  onResume={() => engine.resumeGeneration(engine.savedProgress)}
                  onStartOver={engine.clearProgress}
                />
              )}

            {engine.generationSummary && engine.state !== 'generating' && (
              <GenerationSummaryPanel
                summary={engine.generationSummary}
                onResume={
                  engine.generationSummary.isRecoverable ? engine.handleErrorResume : undefined
                }
                onDismiss={() => engine.setGenerationSummary(null)}
                hasCheckpoint={
                  !!engine.savedProgress ||
                  (engine.content.length > 0 && engine.generationSummary.wordCount > 0)
                }
              />
            )}

            {engine.state === 'error' && engine.errorDetails && !engine.generationSummary && (
              <GuideGenerationErrorPanel
                errorDetails={engine.errorDetails}
                onRetry={engine.handleErrorRetry}
                onResume={engine.handleErrorResume}
                onCancel={engine.handleErrorCancel}
                hasCheckpoint={
                  !!engine.savedProgress ||
                  (engine.content.length > 0 &&
                    engine.errorDetails.savedWordCount !== undefined &&
                    engine.errorDetails.savedWordCount > 0)
                }
                totalBatches={engine.totalBatches}
              />
            )}

            {(engine.state === 'idle' ||
              engine.state === 'complete' ||
              (engine.state === 'error' && !engine.errorDetails)) && (
              <GuideInputForm
                industryName={industryName}
                onIndustryNameChange={setIndustryName}
                industryDescription={industryDescription}
                onIndustryDescriptionChange={setIndustryDescription}
                state={engine.state}
                onStartClarification={handleStartClarification}
                guideFileInputRef={upload.guideFileInputRef}
                isUploadingGuide={upload.isUploadingGuide}
                onUploadGuide={upload.handleUploadGuide}
              />
            )}

            {engine.state === 'clarifying' && (
              <ClarificationPanel
                questions={clarification.clarifyingQuestions}
                answers={clarification.clarifyAnswers}
                onSelectOption={clarification.handleSelectOption}
                onTextAnswer={clarification.handleTextAnswer}
                onConfirm={clarification.handleConfirmAndGenerate}
                onSkip={clarification.handleSkipClarification}
                onCancel={handleCancel}
                clarifyingStatus={clarification.clarifyingStatus}
                onCancelLoading={() => clarification.cancelClarifyingLoading(engine.setState)}
              />
            )}

            <GenerationProgress
              state={engine.state}
              currentBatch={engine.currentBatch}
              totalBatches={engine.totalBatches}
              currentPhase={engine.currentPhase}
              totalPhases={engine.totalPhases}
              phaseName={engine.phaseName}
              wordCount={engine.wordCount}
              onCancel={handleCancel}
              qualityResult={engine.qualityResult}
              missingElements={engine.missingElements}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <GuideCompletionDialog
        open={engine.showCompletionDialog}
        onOpenChange={engine.setShowCompletionDialog}
        industryName={industryName}
        wordCount={engine.wordCount}
        documentUrl={engine.completedDocumentUrl || undefined}
      />
    </Card>
  );
};
