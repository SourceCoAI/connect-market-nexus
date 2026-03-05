import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MultiSelect } from "@/components/ui/multi-select";
import { EnhancedMultiCategorySelect } from "@/components/ui/enhanced-category-select";
import { STANDARDIZED_LOCATIONS } from "@/lib/financial-parser";
import { 
  SizeCriteria, 
  GeographyCriteria, 
  ServiceCriteria, 
  BuyerTypesCriteria,
  ScoringBehavior
} from "@/types/remarketing";
import { 
  MapPin, 
  DollarSign, 
  Briefcase, 
  Users, 
  Settings2,
  X,
  Plus
} from "lucide-react";

interface StructuredCriteriaPanelProps {
  sizeCriteria: SizeCriteria;
  geographyCriteria: GeographyCriteria;
  serviceCriteria: ServiceCriteria;
  buyerTypesCriteria: BuyerTypesCriteria;
  scoringBehavior: ScoringBehavior;
  onSizeCriteriaChange: (criteria: SizeCriteria) => void;
  onGeographyCriteriaChange: (criteria: GeographyCriteria) => void;
  onServiceCriteriaChange: (criteria: ServiceCriteria) => void;
  onBuyerTypesCriteriaChange: (criteria: BuyerTypesCriteria) => void;
  onScoringBehaviorChange: (behavior: ScoringBehavior) => void;
}

const locationOptions = STANDARDIZED_LOCATIONS.map(loc => ({
  value: loc,
  label: loc
}));

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

const stateOptions = US_STATES.map(state => ({
  value: state,
  label: state
}));

export const StructuredCriteriaPanel = ({
  sizeCriteria,
  geographyCriteria,
  serviceCriteria,
  buyerTypesCriteria,
  scoringBehavior,
  onSizeCriteriaChange,
  onGeographyCriteriaChange,
  onServiceCriteriaChange,
  onBuyerTypesCriteriaChange,
  onScoringBehaviorChange
}: StructuredCriteriaPanelProps) => {
  const [newRequiredService, setNewRequiredService] = useState("");
  const [newPreferredService, setNewPreferredService] = useState("");
  const [newExcludedService, setNewExcludedService] = useState("");

  const formatCurrency = (value: number | undefined) => {
    if (!value) return "";
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  const parseCurrency = (value: string): number | undefined => {
    if (!value) return undefined;
    const cleaned = value.replace(/[^0-9.MKmk]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) return undefined;
    if (cleaned.toLowerCase().includes('m')) return num * 1000000;
    if (cleaned.toLowerCase().includes('k')) return num * 1000;
    return num;
  };

  const addService = (
    type: 'required' | 'preferred' | 'excluded',
    service: string,
    setter: (value: string) => void
  ) => {
    if (!service.trim()) return;
    
    const currentServices = 
      type === 'required' ? serviceCriteria.required_services || [] :
      type === 'preferred' ? serviceCriteria.preferred_services || [] :
      serviceCriteria.excluded_services || [];
    
    if (!currentServices.includes(service.trim())) {
      onServiceCriteriaChange({
        ...serviceCriteria,
        [`${type}_services`]: [...currentServices, service.trim()]
      });
    }
    setter("");
  };

  const removeService = (type: 'required' | 'preferred' | 'excluded', service: string) => {
    const key = `${type}_services` as 'required_services' | 'preferred_services' | 'excluded_services';
    const currentServices = serviceCriteria[key] || [];
    onServiceCriteriaChange({
      ...serviceCriteria,
      [key]: (currentServices as string[]).filter(s => s !== service)
    });
  };

  return (
    <div className="space-y-6">
      {/* Size Criteria */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Size Criteria
          </CardTitle>
          <CardDescription>
            Define target revenue and EBITDA ranges for matching
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Min Revenue</Label>
              <Input
                placeholder="e.g., 5M"
                value={formatCurrency(sizeCriteria.revenue_min)}
                onChange={(e) => onSizeCriteriaChange({
                  ...sizeCriteria,
                  revenue_min: parseCurrency(e.target.value)
                })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max Revenue</Label>
              <Input
                placeholder="e.g., 50M"
                value={formatCurrency(sizeCriteria.revenue_max)}
                onChange={(e) => onSizeCriteriaChange({
                  ...sizeCriteria,
                  revenue_max: parseCurrency(e.target.value)
                })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Min EBITDA</Label>
              <Input
                placeholder="e.g., 1M"
                value={formatCurrency(sizeCriteria.ebitda_min)}
                onChange={(e) => onSizeCriteriaChange({
                  ...sizeCriteria,
                  ebitda_min: parseCurrency(e.target.value)
                })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max EBITDA</Label>
              <Input
                placeholder="e.g., 10M"
                value={formatCurrency(sizeCriteria.ebitda_max)}
                onChange={(e) => onSizeCriteriaChange({
                  ...sizeCriteria,
                  ebitda_max: parseCurrency(e.target.value)
                })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Min Employees</Label>
              <NumericInput
                placeholder="e.g., 10"
                value={sizeCriteria.employee_min || ""}
                onChange={(value) => onSizeCriteriaChange({
                  ...sizeCriteria,
                  employee_min: value ? parseInt(value) : undefined
                })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max Employees</Label>
              <NumericInput
                placeholder="e.g., 500"
                value={sizeCriteria.employee_max || ""}
                onChange={(value) => onSizeCriteriaChange({
                  ...sizeCriteria,
                  employee_max: value ? parseInt(value) : undefined
                })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Geography Criteria */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Geography Criteria
          </CardTitle>
          <CardDescription>
            Define target regions and state preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Target Regions</Label>
            <MultiSelect
              options={locationOptions}
              selected={geographyCriteria.target_regions || []}
              onSelectedChange={(selected) => onGeographyCriteriaChange({
                ...geographyCriteria,
                target_regions: selected
              })}
              placeholder="Select regions..."
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Target States</Label>
            <MultiSelect
              options={stateOptions}
              selected={geographyCriteria.target_states || []}
              onSelectedChange={(selected) => onGeographyCriteriaChange({
                ...geographyCriteria,
                target_states: selected
              })}
              placeholder="Select states..."
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Exclude States</Label>
            <MultiSelect
              options={stateOptions}
              selected={geographyCriteria.exclude_states || []}
              onSelectedChange={(selected) => onGeographyCriteriaChange({
                ...geographyCriteria,
                exclude_states: selected
              })}
              placeholder="Select states to exclude..."
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Adjacency Preference</Label>
              <p className="text-xs text-muted-foreground">
                Prefer buyers with presence in adjacent states
              </p>
            </div>
            <Switch
              checked={geographyCriteria.adjacency_preference || false}
              onCheckedChange={(checked) => onGeographyCriteriaChange({
                ...geographyCriteria,
                adjacency_preference: checked
              })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Service Criteria */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Service / Industry Criteria
          </CardTitle>
          <CardDescription>
            Define required, preferred, and excluded services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Required Services */}
          <div className="space-y-2">
            <Label className="text-sm">Required Services</Label>
            <div className="flex gap-2">
              <EnhancedMultiCategorySelect
                value={serviceCriteria.required_services || []}
                onValueChange={(selected) => onServiceCriteriaChange({
                  ...serviceCriteria,
                  required_services: selected
                })}
                placeholder="Select required services..."
                className="flex-1"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Add custom service..."
                value={newRequiredService}
                onChange={(e) => setNewRequiredService(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addService('required', newRequiredService, setNewRequiredService);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addService('required', newRequiredService, setNewRequiredService)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {serviceCriteria.required_services && serviceCriteria.required_services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {serviceCriteria.required_services.map((service) => (
                  <Badge key={service} variant="default" className="gap-1">
                    {service}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeService('required', service)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Preferred Services */}
          <div className="space-y-2">
            <Label className="text-sm">Preferred Services</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add preferred service..."
                value={newPreferredService}
                onChange={(e) => setNewPreferredService(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addService('preferred', newPreferredService, setNewPreferredService);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addService('preferred', newPreferredService, setNewPreferredService)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {serviceCriteria.preferred_services && serviceCriteria.preferred_services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {serviceCriteria.preferred_services.map((service) => (
                  <Badge key={service} variant="secondary" className="gap-1">
                    {service}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeService('preferred', service)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Excluded Services */}
          <div className="space-y-2">
            <Label className="text-sm">Excluded Services</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add excluded service..."
                value={newExcludedService}
                onChange={(e) => setNewExcludedService(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addService('excluded', newExcludedService, setNewExcludedService);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addService('excluded', newExcludedService, setNewExcludedService)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {serviceCriteria.excluded_services && serviceCriteria.excluded_services.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {serviceCriteria.excluded_services.map((service) => (
                  <Badge key={service} variant="destructive" className="gap-1">
                    {service}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeService('excluded', service)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Buyer Types */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Buyer Types
          </CardTitle>
          <CardDescription>
            Filter which types of buyers to include
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Private Equity Firms</Label>
            <Switch
              checked={buyerTypesCriteria.include_pe_firms ?? true}
              onCheckedChange={(checked) => onBuyerTypesCriteriaChange({
                ...buyerTypesCriteria,
                include_pe_firms: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Corporate / Strategic Buyers</Label>
            <Switch
              checked={buyerTypesCriteria.include_platforms ?? true}
              onCheckedChange={(checked) => onBuyerTypesCriteriaChange({
                ...buyerTypesCriteria,
                include_platforms: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Family Offices</Label>
            <Switch
              checked={buyerTypesCriteria.include_family_office ?? true}
              onCheckedChange={(checked) => onBuyerTypesCriteriaChange({
                ...buyerTypesCriteria,
                include_family_office: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Independent Sponsors</Label>
            <Switch
              checked={buyerTypesCriteria.include_independent_sponsors ?? true}
              onCheckedChange={(checked) => onBuyerTypesCriteriaChange({
                ...buyerTypesCriteria,
                include_independent_sponsors: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Search Funds</Label>
            <Switch
              checked={buyerTypesCriteria.include_search_funds ?? true}
              onCheckedChange={(checked) => onBuyerTypesCriteriaChange({
                ...buyerTypesCriteria,
                include_search_funds: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Individual Buyers</Label>
            <Switch
              checked={buyerTypesCriteria.include_individual_buyers ?? true}
              onCheckedChange={(checked) => onBuyerTypesCriteriaChange({
                ...buyerTypesCriteria,
                include_individual_buyers: checked
              })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Scoring Behavior */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Scoring Behavior
          </CardTitle>
          <CardDescription>
            Fine-tune how the AI scores buyer matches
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Boost Adjacency</Label>
              <p className="text-xs text-muted-foreground">
                Higher scores for buyers in nearby states
              </p>
            </div>
            <Switch
              checked={scoringBehavior.boost_adjacency ?? false}
              onCheckedChange={(checked) => onScoringBehaviorChange({
                ...scoringBehavior,
                boost_adjacency: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Penalize Distance</Label>
              <p className="text-xs text-muted-foreground">
                Lower scores for geographically distant buyers
              </p>
            </div>
            <Switch
              checked={scoringBehavior.penalize_distance ?? false}
              onCheckedChange={(checked) => onScoringBehaviorChange({
                ...scoringBehavior,
                penalize_distance: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Require Thesis Match</Label>
              <p className="text-xs text-muted-foreground">
                Only match buyers with clear thesis alignment
              </p>
            </div>
            <Switch
              checked={scoringBehavior.require_thesis_match ?? false}
              onCheckedChange={(checked) => onScoringBehaviorChange({
                ...scoringBehavior,
                require_thesis_match: checked
              })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
