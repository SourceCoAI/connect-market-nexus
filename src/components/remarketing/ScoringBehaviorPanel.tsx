import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Settings, MapPin, Target, Award } from 'lucide-react';
import type { ScoringBehavior } from '@/types/remarketing';

interface ScoringBehaviorPanelProps {
  scoringBehavior: ScoringBehavior;
  weights: {
    geography: number;
    service: number;
    ownerGoals: number;
  };
  onScoringBehaviorChange?: (behavior: ScoringBehavior) => void;
  readOnly?: boolean;
}

export const ScoringBehaviorPanel = ({
  scoringBehavior,
  weights,
  onScoringBehaviorChange,
  readOnly = false,
}: ScoringBehaviorPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const totalWeight = weights.geography + weights.service + weights.ownerGoals;

  const handleChange = (key: keyof ScoringBehavior, value: boolean | string) => {
    if (onScoringBehaviorChange) {
      onScoringBehaviorChange({ ...scoringBehavior, [key]: value });
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Settings className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Scoring Configuration</CardTitle>
                  <CardDescription>Weight distribution and scoring behavior</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Weight Summary Pills */}
                <div className="hidden md:flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    <MapPin className="h-3 w-3 mr-1" />
                    {weights.geography}%
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-purple-50 text-purple-700 border-purple-200"
                  >
                    <Target className="h-3 w-3 mr-1" />
                    {weights.service}%
                  </Badge>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <Award className="h-3 w-3 mr-1" />
                    {weights.ownerGoals}%
                  </Badge>
                </div>
                <Badge variant={totalWeight === 100 ? 'secondary' : 'destructive'}>
                  Total: {totalWeight}%
                </Badge>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-6">
            {/* Weight Breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Geography</span>
                </div>
                <span className="text-2xl font-bold text-blue-700">{weights.geography}%</span>
              </div>
              <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-900">Service Mix</span>
                </div>
                <span className="text-2xl font-bold text-purple-700">{weights.service}%</span>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">Owner Goals</span>
                </div>
                <span className="text-2xl font-bold text-amber-700">{weights.ownerGoals}%</span>
              </div>
            </div>

            {/* Behavior Toggles */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground">Scoring Behavior</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <Label htmlFor="boost_adjacency" className="text-sm font-medium">
                      Boost Adjacent States
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Buyers near target geography score higher
                    </p>
                  </div>
                  <Switch
                    id="boost_adjacency"
                    checked={scoringBehavior.boost_adjacency ?? false}
                    onCheckedChange={(checked) => handleChange('boost_adjacency', checked)}
                    disabled={readOnly}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <Label htmlFor="penalize_distance" className="text-sm font-medium">
                      Penalize Distance
                    </Label>
                    <p className="text-xs text-muted-foreground">Reduce score for distant buyers</p>
                  </div>
                  <Switch
                    id="penalize_distance"
                    checked={scoringBehavior.penalize_distance ?? false}
                    onCheckedChange={(checked) => handleChange('penalize_distance', checked)}
                    disabled={readOnly}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <Label htmlFor="require_thesis_match" className="text-sm font-medium">
                      Require Thesis Match
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Must match buyer's stated thesis
                    </p>
                  </div>
                  <Switch
                    id="require_thesis_match"
                    checked={scoringBehavior.require_thesis_match ?? false}
                    onCheckedChange={(checked) => handleChange('require_thesis_match', checked)}
                    disabled={readOnly}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default ScoringBehaviorPanel;
