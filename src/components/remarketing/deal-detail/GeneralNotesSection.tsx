import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, FileText, Sparkles, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface GeneralNotesSectionProps {
  notes: string | null;
  onSave: (notes: string) => Promise<void>;
  onAnalyze?: (notes: string) => Promise<void>;
  isAnalyzing?: boolean;
}

export const GeneralNotesSection = ({
  notes,
  onSave,
  onAnalyze,
  isAnalyzing = false
}: GeneralNotesSectionProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedNotes, setEditedNotes] = useState(notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedNotes = useRef(notes || "");

  // Sync editedNotes when the prop changes externally (e.g. after save/refetch)
  // but only if the user hasn't made local edits since the last known value
  useEffect(() => {
    const incoming = notes || "";
    if (incoming !== lastSavedNotes.current) {
      // Prop changed externally — update if there are no unsaved local edits
      if (editedNotes === lastSavedNotes.current) {
        setEditedNotes(incoming);
      }
      lastSavedNotes.current = incoming;
    }
  }, [notes, editedNotes]);

  const hasChanges = editedNotes !== (notes || "");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedNotes);
      lastSavedNotes.current = editedNotes;
      toast.success("Notes saved successfully");
    } catch (error) {
      toast.error("Failed to save notes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (onAnalyze && editedNotes.trim()) {
      try {
        await onAnalyze(editedNotes);
      } catch (error) {
        toast.error("Failed to enrich notes");
      }
    }
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                General Notes
              </CardTitle>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste general notes here... Call transcripts, owner conversations, business details, etc."
              value={editedNotes}
              onChange={(e) => setEditedNotes(e.target.value)}
              className="min-h-[150px] resize-y"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Notes
              </Button>
              {onAnalyze && (
                <Button
                  variant="secondary"
                  onClick={handleAnalyze}
                  disabled={!editedNotes.trim() || isAnalyzing}
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Enrich Notes
                </Button>
              )}
            </div>
            {isAnalyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing notes and extracting deal intelligence... This may take a minute.</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Use "Enrich Notes" to automatically extract deal information from pasted notes.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default GeneralNotesSection;
