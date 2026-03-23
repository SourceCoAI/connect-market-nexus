import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, Upload } from 'lucide-react';

import type { GenerationState } from './types';

interface GuideInputFormProps {
  industryName: string;
  onIndustryNameChange: (value: string) => void;
  industryDescription: string;
  onIndustryDescriptionChange: (value: string) => void;
  state: GenerationState;
  onStartClarification: () => void;
  guideFileInputRef: React.RefObject<HTMLInputElement | null>;
  isUploadingGuide: boolean;
  onUploadGuide: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const GuideInputForm = ({
  industryName,
  onIndustryNameChange,
  industryDescription,
  onIndustryDescriptionChange,
  state,
  onStartClarification,
  guideFileInputRef,
  isUploadingGuide,
  onUploadGuide,
}: GuideInputFormProps) => (
  <div className="space-y-4">
    <div className="flex gap-4 items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="industry-name">Industry Name</Label>
        <Input
          id="industry-name"
          placeholder="e.g., Collision Repair, HVAC, Pest Control, Restoration"
          value={industryName}
          onChange={(e) => onIndustryNameChange(e.target.value)}
        />
      </div>
      <Button onClick={onStartClarification} disabled={!industryName.trim()}>
        <Sparkles className="h-4 w-4 mr-2" />
        {state === 'complete' ? 'Regenerate' : 'Generate Guide'}
      </Button>
      <span className="text-xs text-muted-foreground self-center">or</span>
      <Button
        variant="outline"
        onClick={() => guideFileInputRef.current?.click()}
        disabled={isUploadingGuide}
      >
        {isUploadingGuide ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-2" />
        )}
        Upload Guide
      </Button>
      <input
        ref={guideFileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.html,.htm"
        className="hidden"
        onChange={onUploadGuide}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="industry-description">
        Industry Description <span className="text-muted-foreground text-xs">(optional)</span>
      </Label>
      <Textarea
        id="industry-description"
        placeholder="Provide a 2-3 sentence description..."
        value={industryDescription}
        onChange={(e) => onIndustryDescriptionChange(e.target.value)}
        className="min-h-[80px] resize-none"
      />
    </div>
  </div>
);
