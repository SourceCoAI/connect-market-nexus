import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, 
  Sparkles, 
  Loader2, 
  ChevronDown, 
  ChevronUp,
  Check,
  X,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { SizeCriteria, GeographyCriteria, ServiceCriteria, BuyerTypesCriteria, ScoringBehavior } from "@/types/remarketing";

interface ExtractedCriteria {
  size_criteria?: SizeCriteria;
  geography_criteria?: GeographyCriteria;
  service_criteria?: ServiceCriteria;
  buyer_types_criteria?: BuyerTypesCriteria;
  scoring_behavior?: ScoringBehavior;
  extracted_keywords?: string[];
  confidence?: number;
}

interface TrackerNotesSectionProps {
  onApplyCriteria: (criteria: ExtractedCriteria) => void;
  universeName?: string;
  universeId?: string;
}

function getDraftKey(universeId?: string) {
  return `tracker-notes-draft-${universeId || 'new'}`;
}

function loadDraft(universeId?: string): { notes: string; criteria: ExtractedCriteria | null } | null {
  try {
    const raw = localStorage.getItem(getDraftKey(universeId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(universeId: string | undefined, notes: string, criteria: ExtractedCriteria | null) {
  try {
    localStorage.setItem(getDraftKey(universeId), JSON.stringify({ notes, criteria }));
  } catch {
    // localStorage full or unavailable
  }
}

function clearDraft(universeId?: string) {
  try {
    localStorage.removeItem(getDraftKey(universeId));
  } catch {
    // ignore
  }
}

export const TrackerNotesSection = ({
  onApplyCriteria,
  universeName,
  universeId,
}: TrackerNotesSectionProps) => {
  const draft = loadDraft(universeId);
  const [isOpen, setIsOpen] = useState(!!draft);
  const [notes, setNotes] = useState(draft?.notes || "");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedCriteria, setExtractedCriteria] = useState<ExtractedCriteria | null>(draft?.criteria || null);
  const [showPreview, setShowPreview] = useState(!!draft?.criteria);

  const handleAnalyze = async () => {
    if (!notes.trim()) {
      toast.error("Please enter some notes to analyze");
      return;
    }

    setIsAnalyzing(true);
    setShowPreview(false);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-tracker-notes', {
        body: {
          notes_text: notes,
          universe_name: universeName
        }
      });

      if (error) throw error;

      if (data) {
        setExtractedCriteria(data);
        setShowPreview(true);
        saveDraft(universeId, notes, data);
        toast.success(`Extracted criteria with ${Math.round((data.confidence || 0.5) * 100)}% confidence`);
      }
    } catch (error) {
      toast.error('Failed to analyze notes');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = () => {
    if (extractedCriteria) {
      onApplyCriteria(extractedCriteria);
      toast.success("Criteria applied to form");
      setShowPreview(false);
      setNotes("");
      setExtractedCriteria(null);
      clearDraft(universeId);
    }
  };

  const handleDiscard = () => {
    setShowPreview(false);
    setExtractedCriteria(null);
    clearDraft(universeId);
  };

  const formatCurrency = (value?: number) => {
    if (!value) return null;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Quick Import from Notes</CardTitle>
                  <CardDescription>
                    Paste call notes, emails, or meeting notes to extract criteria
                  </CardDescription>
                </div>
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Notes Input */}
            <div className="space-y-2">
              <Textarea
                placeholder="Paste your notes here...

Example:
Looking for collision repair shops in the Southeast, specifically Florida, Georgia, and Alabama. 
Revenue range $3M-$15M, EBITDA minimum $500K.
Must have DRP relationships. Prefer multi-location operations.
No body shops doing only paint work."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {notes.length} characters
                </span>
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !notes.trim()}
                  size="sm"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Analyze & Extract
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Preview Panel */}
            {showPreview && extractedCriteria && (
              <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Extracted Criteria</h4>
                    <Badge variant={extractedCriteria.confidence && extractedCriteria.confidence > 0.7 ? "default" : "secondary"}>
                      {Math.round((extractedCriteria.confidence || 0.5) * 100)}% confidence
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleDiscard}>
                      <X className="h-4 w-4 mr-1" />
                      Discard
                    </Button>
                    <Button size="sm" onClick={handleApply}>
                      <Check className="h-4 w-4 mr-1" />
                      Apply to Form
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Size Criteria */}
                  {extractedCriteria.size_criteria && Object.keys(extractedCriteria.size_criteria).length > 0 && (
                    <div className="space-y-1">
                      <h5 className="text-sm font-medium text-muted-foreground">Size Criteria</h5>
                      <div className="text-sm space-y-0.5">
                        {extractedCriteria.size_criteria.revenue_min && (
                          <div>Revenue: {formatCurrency(extractedCriteria.size_criteria.revenue_min)} - {formatCurrency(extractedCriteria.size_criteria.revenue_max)}</div>
                        )}
                        {extractedCriteria.size_criteria.ebitda_min && (
                          <div>EBITDA: {formatCurrency(extractedCriteria.size_criteria.ebitda_min)} - {formatCurrency(extractedCriteria.size_criteria.ebitda_max)}</div>
                        )}
                        {extractedCriteria.size_criteria.locations_min !== undefined && (
                          <div>Locations: {extractedCriteria.size_criteria.locations_min} - {extractedCriteria.size_criteria.locations_max || '∞'}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Geography Criteria */}
                  {extractedCriteria.geography_criteria && (
                    <div className="space-y-1">
                      <h5 className="text-sm font-medium text-muted-foreground">Geography</h5>
                      <div className="flex flex-wrap gap-1">
                        {extractedCriteria.geography_criteria.target_regions?.map((region) => (
                          <Badge key={region} variant="secondary" className="text-xs">{region}</Badge>
                        ))}
                        {extractedCriteria.geography_criteria.target_states?.slice(0, 5).map((state) => (
                          <Badge key={state} variant="outline" className="text-xs">{state}</Badge>
                        ))}
                        {(extractedCriteria.geography_criteria.target_states?.length || 0) > 5 && (
                          <Badge variant="outline" className="text-xs">+{(extractedCriteria.geography_criteria.target_states?.length || 0) - 5} more</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Service Criteria */}
                  {extractedCriteria.service_criteria && (
                    <div className="space-y-1">
                      <h5 className="text-sm font-medium text-muted-foreground">Services</h5>
                      <div className="space-y-1">
                        {extractedCriteria.service_criteria.primary_focus && extractedCriteria.service_criteria.primary_focus.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-primary font-medium">Primary:</span>
                            {extractedCriteria.service_criteria.primary_focus.map((s) => (
                              <Badge key={s} variant="default" className="text-xs">{s}</Badge>
                            ))}
                          </div>
                        )}
                        {extractedCriteria.service_criteria.required_services && extractedCriteria.service_criteria.required_services.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-muted-foreground">Required:</span>
                            {extractedCriteria.service_criteria.required_services.map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                            ))}
                          </div>
                        )}
                        {extractedCriteria.service_criteria.excluded_services && extractedCriteria.service_criteria.excluded_services.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-destructive">Excluded:</span>
                            {extractedCriteria.service_criteria.excluded_services.map((s) => (
                              <Badge key={s} variant="destructive" className="text-xs">{s}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Keywords */}
                  {extractedCriteria.extracted_keywords && extractedCriteria.extracted_keywords.length > 0 && (
                    <div className="space-y-1">
                      <h5 className="text-sm font-medium text-muted-foreground">Keywords</h5>
                      <div className="flex flex-wrap gap-1">
                        {extractedCriteria.extracted_keywords.map((kw) => (
                          <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Warning if primary_focus is missing */}
                {(!extractedCriteria.service_criteria?.primary_focus || extractedCriteria.service_criteria.primary_focus.length === 0) && (
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>No primary focus detected - this is required for scoring</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
