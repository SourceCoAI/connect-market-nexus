/**
 * AddDealForm.tsx
 *
 * The "Create New" deal form with company info, main contact, and transcript
 * upload fields. Used inside the AddDealDialog's "Create New" tab.
 *
 * Extracted from AddDealDialog.tsx for maintainability.
 */
import React, { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Loader2,
  Link2,
  Upload,
  X,
  FileText,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AddDealFormData } from './useAddDealSubmit';

const normalizeName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, '');

interface AddDealFormProps {
  formData: AddDealFormData;
  onFormChange: (field: string, value: string) => void;
  transcriptFiles: File[];
  onFilesChange: (files: File[]) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export const AddDealForm = ({
  formData,
  onFormChange,
  transcriptFiles,
  onFilesChange,
  onSubmit,
  isSubmitting,
}: AddDealFormProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length === 0) return;

    const existingNames = new Set(transcriptFiles.map((f) => normalizeName(f.name)));
    const uniqueNew = newFiles.filter((f) => !existingNames.has(normalizeName(f.name)));

    if (uniqueNew.length < newFiles.length) {
      const skipped = newFiles.length - uniqueNew.length;
      toast.info(`${skipped} duplicate file${skipped > 1 ? 's' : ''} skipped`);
    }

    if (uniqueNew.length > 0) {
      onFilesChange([...transcriptFiles, ...uniqueNew]);
      onFormChange('transcriptLink', '');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    onFilesChange(transcriptFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Company Name *</Label>
        <Input
          id="title"
          placeholder="Enter company name"
          value={formData.title}
          onChange={(e) => onFormChange('title', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">Website *</Label>
        <Input
          id="website"
          placeholder="https://example.com"
          value={formData.website}
          onChange={(e) => onFormChange('website', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Required for AI enrichment to extract company data
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="City, State"
          value={formData.location}
          onChange={(e) => onFormChange('location', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="revenue">Revenue</Label>
          <Input
            id="revenue"
            placeholder="$0"
            value={formData.revenue}
            onChange={(e) => onFormChange('revenue', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ebitda">EBITDA</Label>
          <Input
            id="ebitda"
            placeholder="$0"
            value={formData.ebitda}
            onChange={(e) => onFormChange('ebitda', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="executive_summary">Executive Summary</Label>
        <Textarea
          id="executive_summary"
          placeholder="Brief description of the business..."
          value={formData.executive_summary}
          onChange={(e) => onFormChange('executive_summary', e.target.value)}
          rows={3}
        />
      </div>

      {/* Main Contact Section */}
      <div className="space-y-3 border-t pt-4">
        <Label className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Main Contact
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mainContactName" className="text-xs">
              Name
            </Label>
            <Input
              id="mainContactName"
              placeholder="Contact name"
              value={formData.mainContactName}
              onChange={(e) => onFormChange('mainContactName', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mainContactEmail" className="text-xs">
              Email
            </Label>
            <Input
              id="mainContactEmail"
              type="email"
              placeholder="email@example.com"
              value={formData.mainContactEmail}
              onChange={(e) => onFormChange('mainContactEmail', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mainContactPhone" className="text-xs">
              Phone
            </Label>
            <Input
              id="mainContactPhone"
              type="tel"
              placeholder="(555) 123-4567"
              value={formData.mainContactPhone}
              onChange={(e) => onFormChange('mainContactPhone', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mainContactTitle" className="text-xs">
              Title
            </Label>
            <Input
              id="mainContactTitle"
              placeholder="CEO, CFO, Owner..."
              value={formData.mainContactTitle}
              onChange={(e) => onFormChange('mainContactTitle', e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Used to find Fireflies transcripts automatically
        </p>
      </div>

      {/* Transcript Section */}
      <div className="space-y-3 border-t pt-4">
        <Label className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Call Transcripts (Optional)
        </Label>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <Input
              id="transcriptLink"
              placeholder="Fireflies, Otter.ai, or other transcript link..."
              value={formData.transcriptLink}
              onChange={(e) => onFormChange('transcriptLink', e.target.value)}
              disabled={transcriptFiles.length > 0}
              className="flex-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 border-t" />
          <span>or</span>
          <div className="flex-1 border-t" />
        </div>

        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.vtt,.srt,.pdf,.doc,.docx"
            multiple
            onChange={handleFileChange}
            className="hidden"
            id="transcript-file"
          />

          {transcriptFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                {transcriptFiles.length} file{transcriptFiles.length > 1 ? 's' : ''}{' '}
                selected
              </p>
              {transcriptFiles.map((file, index) => (
                <div
                  key={file.name}
                  className="flex items-center gap-2 p-2 bg-muted rounded-md"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(file.size / 1024).toFixed(0)}KB
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="h-6 w-6 p-0 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={!!formData.transcriptLink}
          >
            <Upload className="h-4 w-4 mr-2" />
            {transcriptFiles.length > 0 ? 'Add More Files' : 'Upload Transcript Files'}
          </Button>

          <p className="text-xs text-muted-foreground">
            Supports .txt, .vtt, .srt, .pdf, .doc, .docx -- select multiple files at once
          </p>
        </div>
      </div>

      <Button
        onClick={onSubmit}
        disabled={!formData.title || !formData.website || isSubmitting}
        className="w-full"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Create Deal
      </Button>
    </div>
  );
};
