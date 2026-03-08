import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings2, MapPin, Wrench, MessageSquare, RotateCcw, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScoringBehavior } from '@/types/remarketing';

interface ScoringBehaviorPanelEnhancedProps {
  scoringBehavior: ScoringBehavior;
  weights: {
    geography: number;
    service: number;
    ownerGoals: number;
  };
  onScoringBehaviorChange?: (behavior: ScoringBehavior) => void;
  onWeightsChange?: (weights: { geography: number; service: number; ownerGoals: number }) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

const INDUSTRY_PRESETS: Record<string, Partial<ScoringBehavior>> = {
  collision_repair: {
    geography_strictness: 'moderate',
    single_location_matching: 'adjacent_states',
    multi_location_matching: 'same_region',
    allow_national_buyers: true,
    size_strictness: 'moderate',
    below_minimum_handling: 'penalize',
    penalize_single_location: false,
    service_matching_mode: 'keyword',
    require_primary_focus: true,
    excluded_services_dealbreaker: true,
    can_override_geography: true,
    can_override_size: false,
    engagement_weight_multiplier: 1.0,
  },
  software: {
    geography_strictness: 'flexible',
    single_location_matching: 'same_region',
    multi_location_matching: 'national',
    allow_national_buyers: true,
    size_strictness: 'strict',
    below_minimum_handling: 'disqualify',
    penalize_single_location: false,
    service_matching_mode: 'semantic',
    require_primary_focus: true,
    excluded_services_dealbreaker: false,
    can_override_geography: true,
    can_override_size: true,
    engagement_weight_multiplier: 1.5,
  },
  hvac: {
    geography_strictness: 'strict',
    single_location_matching: 'exact_state',
    multi_location_matching: 'same_region',
    allow_national_buyers: false,
    size_strictness: 'moderate',
    below_minimum_handling: 'penalize',
    penalize_single_location: true,
    service_matching_mode: 'keyword',
    require_primary_focus: true,
    excluded_services_dealbreaker: true,
    can_override_geography: false,
    can_override_size: true,
    engagement_weight_multiplier: 1.0,
  },
  pest_control: {
    geography_strictness: 'moderate',
    single_location_matching: 'adjacent_states',
    multi_location_matching: 'same_region',
    allow_national_buyers: true,
    size_strictness: 'flexible',
    below_minimum_handling: 'allow',
    penalize_single_location: false,
    service_matching_mode: 'keyword',
    require_primary_focus: false,
    excluded_services_dealbreaker: true,
    can_override_geography: true,
    can_override_size: true,
    engagement_weight_multiplier: 1.25,
  },
};

const DEFAULT_BEHAVIOR: ScoringBehavior = {
  boost_adjacency: true,
  penalize_distance: true,
  require_thesis_match: false,
  industry_preset: 'custom',
  geography_strictness: 'moderate',
  single_location_matching: 'adjacent_states',
  multi_location_matching: 'same_region',
  allow_national_buyers: true,
  size_strictness: 'moderate',
  below_minimum_handling: 'penalize',
  penalize_single_location: false,
  service_matching_mode: 'keyword',
  require_primary_focus: false,
  excluded_services_dealbreaker: false,
  can_override_geography: true,
  can_override_size: false,
  engagement_weight_multiplier: 1.0,
};

export const ScoringBehaviorPanelEnhanced = ({
  scoringBehavior,
  weights: _weights,
  onScoringBehaviorChange,
  onWeightsChange: _onWeightsChange,
  onSave,
  readOnly = false,
}: ScoringBehaviorPanelEnhancedProps) => {
  const handleChange = <K extends keyof ScoringBehavior>(key: K, value: ScoringBehavior[K]) => {
    if (onScoringBehaviorChange && !readOnly) {
      onScoringBehaviorChange({ ...scoringBehavior, [key]: value, industry_preset: 'custom' });
    }
  };

  const applyPreset = (preset: string) => {
    if (onScoringBehaviorChange && !readOnly && preset in INDUSTRY_PRESETS) {
      onScoringBehaviorChange({
        ...scoringBehavior,
        ...INDUSTRY_PRESETS[preset],
        industry_preset: preset as ScoringBehavior['industry_preset'],
      });
    }
  };

  const resetToDefaults = () => {
    if (onScoringBehaviorChange && !readOnly) {
      onScoringBehaviorChange(DEFAULT_BEHAVIOR);
    }
  };

  const presets = [
    { id: 'collision_repair', label: 'Collision Repair' },
    { id: 'software', label: 'Software' },
    { id: 'hvac', label: 'HVAC' },
    { id: 'pest_control', label: 'Pest Control' },
  ];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Scoring Behavior Configuration</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Configure how buyers are scored against deals
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Industry Preset Pills */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Industry Preset</Label>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                disabled={readOnly}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  'border focus:outline-none focus:ring-2 focus:ring-primary/50',
                  scoringBehavior.industry_preset === preset.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border text-foreground',
                  readOnly && 'opacity-50 cursor-not-allowed',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Presets configure scoring rules based on typical industry patterns
          </p>
        </div>

        {/* 2x2 Grid of Scoring Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Geography Scoring */}
          <div className="space-y-4 p-4 rounded-lg border border-dashed">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-500" />
              <h4 className="font-medium text-sm">Geography Scoring</h4>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Strictness Level</Label>
                <Select
                  value={scoringBehavior.geography_strictness || 'moderate'}
                  onValueChange={(v) =>
                    handleChange(
                      'geography_strictness',
                      v as ScoringBehavior['geography_strictness'],
                    )
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strict">Strict - Location matters significantly</SelectItem>
                    <SelectItem value="moderate">Moderate - Some flexibility allowed</SelectItem>
                    <SelectItem value="flexible">Relaxed - Location is secondary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Single-Location Deals</Label>
                  <Select
                    value={scoringBehavior.single_location_matching || 'adjacent_states'}
                    onValueChange={(v) =>
                      handleChange(
                        'single_location_matching',
                        v as ScoringBehavior['single_location_matching'],
                      )
                    }
                    disabled={readOnly}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exact_state">Same state only</SelectItem>
                      <SelectItem value="adjacent_states">Adjacent states</SelectItem>
                      <SelectItem value="same_region">Same region</SelectItem>
                      <SelectItem value="national">National (no restriction)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Multi-Location Deals (3+)</Label>
                  <Select
                    value={scoringBehavior.multi_location_matching || 'same_region'}
                    onValueChange={(v) =>
                      handleChange(
                        'multi_location_matching',
                        v as ScoringBehavior['multi_location_matching'],
                      )
                    }
                    disabled={readOnly}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adjacent_states">Adjacent states</SelectItem>
                      <SelectItem value="same_region">Same region</SelectItem>
                      <SelectItem value="national">National (no restriction)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5">
                  <Label className="text-xs">Allow national buyers for attractive deals</Label>
                  <p className="text-xs text-muted-foreground">
                    High-value deals can attract buyers from further away
                  </p>
                </div>
                <Switch
                  checked={scoringBehavior.allow_national_buyers ?? true}
                  onCheckedChange={(checked) => handleChange('allow_national_buyers', checked)}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          {/* Service Matching */}
          <div className="space-y-4 p-4 rounded-lg border border-dashed">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-500" />
              <h4 className="font-medium text-sm">Service Matching</h4>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Matching Mode</Label>
                <Select
                  value={scoringBehavior.service_matching_mode || 'keyword'}
                  onValueChange={(v) =>
                    handleChange(
                      'service_matching_mode',
                      v as ScoringBehavior['service_matching_mode'],
                    )
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semantic">Semantic (AI-powered) - Best accuracy</SelectItem>
                    <SelectItem value="keyword">Keyword - Faster, exact matches</SelectItem>
                    <SelectItem value="hybrid">Hybrid - Keywords with AI fallback</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Require primary focus match</Label>
                  <p className="text-xs text-muted-foreground">
                    Buyer's core service must match deal's primary offering
                  </p>
                </div>
                <Switch
                  checked={scoringBehavior.require_primary_focus ?? false}
                  onCheckedChange={(checked) => handleChange('require_primary_focus', checked)}
                  disabled={readOnly}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Excluded services are dealbreakers</Label>
                  <p className="text-xs text-muted-foreground">
                    Disqualify if deal has services buyer explicitly avoids
                  </p>
                </div>
                <Switch
                  checked={scoringBehavior.excluded_services_dealbreaker ?? false}
                  onCheckedChange={(checked) =>
                    handleChange('excluded_services_dealbreaker', checked)
                  }
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          {/* Engagement Overrides */}
          <div className="space-y-4 p-4 rounded-lg border border-dashed">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-500" />
              <h4 className="font-medium text-sm">Engagement Overrides</h4>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Can override geography</Label>
                  <p className="text-xs text-muted-foreground">
                    Active engagement can bypass geo restrictions
                  </p>
                </div>
                <Switch
                  checked={scoringBehavior.can_override_geography ?? true}
                  onCheckedChange={(checked) => handleChange('can_override_geography', checked)}
                  disabled={readOnly}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs">Can override size</Label>
                  <p className="text-xs text-muted-foreground">
                    Active engagement can bypass size requirements
                  </p>
                </div>
                <Switch
                  checked={scoringBehavior.can_override_size ?? false}
                  onCheckedChange={(checked) => handleChange('can_override_size', checked)}
                  disabled={readOnly}
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Engagement weight multiplier</Label>
                  <span className="text-sm font-medium">
                    {(scoringBehavior.engagement_weight_multiplier ?? 1.0).toFixed(1)}x
                  </span>
                </div>
                <Slider
                  value={[(scoringBehavior.engagement_weight_multiplier ?? 1.0) * 100]}
                  min={50}
                  max={200}
                  step={25}
                  onValueChange={([v]) => handleChange('engagement_weight_multiplier', v / 100)}
                  disabled={readOnly}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>1.5x</span>
                  <span>2.0x</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {!readOnly && (
          <div className="flex justify-between items-center pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToDefaults}
              className="text-muted-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to defaults
            </Button>
            {onSave && (
              <Button onClick={onSave} size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ScoringBehaviorPanelEnhanced;
