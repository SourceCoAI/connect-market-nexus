import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  SizeCriteria, 
  GeographyCriteria, 
  ServiceCriteria, 
  BuyerTypesCriteria,
  ScoringBehavior
} from "@/types/remarketing";
import { 
  LayoutTemplate, 
  Building2, 
  Home, 
  Truck, 
  Briefcase,
  Factory,
  Heart,
  Utensils,
  Wrench,
  Check
} from "lucide-react";
import { toast } from "sonner";

interface UniverseTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  config: {
    fit_criteria: string;
    size_criteria: SizeCriteria;
    geography_criteria: GeographyCriteria;
    service_criteria: ServiceCriteria;
    buyer_types_criteria: BuyerTypesCriteria;
    scoring_behavior: ScoringBehavior;
    geography_weight: number;
    size_weight: number;
    service_weight: number;
    owner_goals_weight: number;
  };
}

const UNIVERSE_TEMPLATES: UniverseTemplate[] = [
  {
    id: 'home-services-pe',
    name: 'Home Services PE',
    description: 'Private equity firms focused on residential home services',
    icon: <Home className="h-5 w-5" />,
    category: 'Home Services',
    config: {
      fit_criteria: 'Private equity firms with existing home services platforms seeking add-on acquisitions. Target companies with $3M-$25M revenue in HVAC, plumbing, electrical, or related residential services. Geographic preference for Southeast and Southwest US with strong recurring revenue models.',
      size_criteria: {
        revenue_min: 3000000,
        revenue_max: 25000000,
        ebitda_min: 500000,
        ebitda_max: 5000000
      },
      geography_criteria: {
        target_regions: ['Southeast US', 'Southwest US'],
        adjacency_preference: true
      },
      service_criteria: {
        required_services: ['HVAC', 'Plumbing', 'Electrical'],
        preferred_services: ['Home Services', 'Residential Services']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: false,
        include_family_office: false,
        include_independent_sponsors: true,
        include_search_funds: false,
        include_individual_buyers: false
      },
      scoring_behavior: {
        boost_adjacency: true,
        penalize_distance: true,
        require_thesis_match: true,
      },
      geography_weight: 25,
      size_weight: 25,
      service_weight: 45,
      owner_goals_weight: 5
    }
  },
  {
    id: 'commercial-services',
    name: 'Commercial Services',
    description: 'Strategic acquirers and platforms in B2B services',
    icon: <Building2 className="h-5 w-5" />,
    category: 'Commercial',
    config: {
      fit_criteria: 'Strategic acquirers and platform companies focused on commercial and B2B services. Target businesses with $5M-$50M revenue providing facility management, janitorial, security, or commercial maintenance services.',
      size_criteria: {
        revenue_min: 5000000,
        revenue_max: 50000000,
        ebitda_min: 750000,
        ebitda_max: 10000000
      },
      geography_criteria: {
        target_regions: ['United States']
      },
      service_criteria: {
        required_services: ['Commercial Services', 'Facility Management'],
        preferred_services: ['Janitorial', 'Security Services', 'Maintenance']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: true,
        include_family_office: true,
        include_independent_sponsors: true,
        include_search_funds: true,
        include_individual_buyers: true
      },
      scoring_behavior: {
        boost_adjacency: false,
        penalize_distance: false,
        require_thesis_match: false,
      },
      geography_weight: 15,
      size_weight: 35,
      service_weight: 45,
      owner_goals_weight: 5
    }
  },
  {
    id: 'logistics-distribution',
    name: 'Logistics & Distribution',
    description: 'Transportation, warehousing, and distribution buyers',
    icon: <Truck className="h-5 w-5" />,
    category: 'Logistics',
    config: {
      fit_criteria: 'Buyers focused on logistics, transportation, and distribution services. Seeking companies with $10M-$75M revenue, asset-light or asset-moderate models, with regional or national coverage.',
      size_criteria: {
        revenue_min: 10000000,
        revenue_max: 75000000,
        ebitda_min: 1500000,
        ebitda_max: 15000000
      },
      geography_criteria: {
        target_regions: ['United States', 'North America']
      },
      service_criteria: {
        required_services: ['Transportation & Logistics', 'Distribution'],
        preferred_services: ['Warehousing', 'Last-Mile Delivery']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: true,
        include_family_office: false
      },
      scoring_behavior: {
        boost_adjacency: false,
        penalize_distance: false,
        require_thesis_match: true,
      },
      geography_weight: 15,
      size_weight: 35,
      service_weight: 45,
      owner_goals_weight: 5
    }
  },
  {
    id: 'professional-services',
    name: 'Professional Services',
    description: 'Consulting, accounting, and professional services',
    icon: <Briefcase className="h-5 w-5" />,
    category: 'Professional',
    config: {
      fit_criteria: 'Buyers seeking professional services firms including accounting, consulting, engineering, and legal support services. Revenue range $2M-$20M with emphasis on recurring client relationships and professional staff.',
      size_criteria: {
        revenue_min: 2000000,
        revenue_max: 20000000,
        ebitda_min: 400000,
        ebitda_max: 4000000
      },
      geography_criteria: {
        target_regions: ['United States']
      },
      service_criteria: {
        required_services: ['Professional Services', 'Consulting'],
        preferred_services: ['Accounting', 'Legal Services', 'Engineering']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: true,
        include_family_office: true,
        include_independent_sponsors: true,
        include_search_funds: true,
        include_individual_buyers: true
      },
      scoring_behavior: {
        boost_adjacency: false,
        penalize_distance: false,
        require_thesis_match: false,
      },
      geography_weight: 10,
      size_weight: 35,
      service_weight: 50,
      owner_goals_weight: 5
    }
  },
  {
    id: 'manufacturing-industrial',
    name: 'Manufacturing & Industrial',
    description: 'Industrial manufacturing and production buyers',
    icon: <Factory className="h-5 w-5" />,
    category: 'Industrial',
    config: {
      fit_criteria: 'Strategic and financial buyers focused on manufacturing, industrial production, and related services. Target companies with $15M-$100M revenue, established customer bases, and modern equipment.',
      size_criteria: {
        revenue_min: 15000000,
        revenue_max: 100000000,
        ebitda_min: 2000000,
        ebitda_max: 20000000
      },
      geography_criteria: {
        target_regions: ['United States', 'North America']
      },
      service_criteria: {
        required_services: ['Manufacturing', 'Industrial Equipment'],
        preferred_services: ['Precision Manufacturing', 'Metal Fabrication']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: true,
        include_family_office: false
      },
      scoring_behavior: {
        boost_adjacency: false,
        penalize_distance: false,
        require_thesis_match: true,
      },
      geography_weight: 15,
      size_weight: 35,
      service_weight: 45,
      owner_goals_weight: 5
    }
  },
  {
    id: 'healthcare-services',
    name: 'Healthcare Services',
    description: 'Healthcare and medical services consolidators',
    icon: <Heart className="h-5 w-5" />,
    category: 'Healthcare',
    config: {
      fit_criteria: 'Healthcare-focused PE firms and strategic buyers seeking medical practices, healthcare services, and related businesses. Revenue range $3M-$30M with emphasis on recurring patient relationships and regulatory compliance.',
      size_criteria: {
        revenue_min: 3000000,
        revenue_max: 30000000,
        ebitda_min: 500000,
        ebitda_max: 6000000
      },
      geography_criteria: {
        target_regions: ['United States']
      },
      service_criteria: {
        required_services: ['Healthcare & Medical'],
        preferred_services: ['Medical Practices', 'Healthcare Services', 'Dental']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: true,
        include_family_office: false
      },
      scoring_behavior: {
        boost_adjacency: true,
        penalize_distance: true,
        require_thesis_match: true,
      },
      geography_weight: 20,
      size_weight: 30,
      service_weight: 45,
      owner_goals_weight: 5
    }
  },
  {
    id: 'food-beverage',
    name: 'Food & Beverage',
    description: 'Food production, distribution, and services',
    icon: <Utensils className="h-5 w-5" />,
    category: 'Food & Beverage',
    config: {
      fit_criteria: 'Buyers focused on food manufacturing, distribution, and food service businesses. Target companies with $5M-$50M revenue, strong brand recognition, and established distribution channels.',
      size_criteria: {
        revenue_min: 5000000,
        revenue_max: 50000000,
        ebitda_min: 750000,
        ebitda_max: 10000000
      },
      geography_criteria: {
        target_regions: ['United States']
      },
      service_criteria: {
        required_services: ['Food & Beverage'],
        preferred_services: ['Food Manufacturing', 'Food Distribution']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: true,
        include_family_office: true,
        include_independent_sponsors: true,
        include_search_funds: true,
        include_individual_buyers: true
      },
      scoring_behavior: {
        boost_adjacency: false,
        penalize_distance: false,
        require_thesis_match: false,
      },
      geography_weight: 15,
      size_weight: 35,
      service_weight: 45,
      owner_goals_weight: 5
    }
  },
  {
    id: 'field-services',
    name: 'Field Services',
    description: 'Field service and maintenance companies',
    icon: <Wrench className="h-5 w-5" />,
    category: 'Field Services',
    config: {
      fit_criteria: 'Buyers seeking field service companies including equipment maintenance, repair services, and on-site technical services. Revenue range $3M-$25M with mobile workforce and service contract revenue.',
      size_criteria: {
        revenue_min: 3000000,
        revenue_max: 25000000,
        ebitda_min: 500000,
        ebitda_max: 5000000
      },
      geography_criteria: {
        target_regions: ['United States'],
        adjacency_preference: true
      },
      service_criteria: {
        required_services: ['Field Services', 'Maintenance'],
        preferred_services: ['Equipment Repair', 'Technical Services']
      },
      buyer_types_criteria: {
        include_pe_firms: true,
        include_platforms: true,
        include_strategic: true,
        include_family_office: true,
        include_independent_sponsors: true,
        include_search_funds: true,
        include_individual_buyers: true
      },
      scoring_behavior: {
        boost_adjacency: true,
        penalize_distance: true,
        require_thesis_match: false,
      },
      geography_weight: 30,
      size_weight: 25,
      service_weight: 40,
      owner_goals_weight: 5
    }
  }
];

interface UniverseTemplatesProps {
  onApplyTemplate: (template: UniverseTemplate['config'] & { name: string; description: string }) => void;
}

export const UniverseTemplates = ({ onApplyTemplate }: UniverseTemplatesProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState<UniverseTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customName, setCustomName] = useState("");

  const handleSelectTemplate = (template: UniverseTemplate) => {
    setSelectedTemplate(template);
    setCustomName(template.name);
    setDialogOpen(true);
  };

  const handleApply = () => {
    if (!selectedTemplate) return;

    onApplyTemplate({
      ...selectedTemplate.config,
      name: customName || selectedTemplate.name,
      description: selectedTemplate.description
    });

    setDialogOpen(false);
    setSelectedTemplate(null);
    setCustomName("");
    toast.success(`Applied "${customName || selectedTemplate.name}" template`);
  };

  // Group templates by category
  const groupedTemplates = UNIVERSE_TEMPLATES.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, UniverseTemplate[]>);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            Quick Start Templates
          </CardTitle>
          <CardDescription>
            Start with a pre-configured universe template for common buyer types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px] pr-4">
            <div className="space-y-4">
              {Object.entries(groupedTemplates).map(([category, templates]) => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{category}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="p-2 rounded-md bg-primary/10 text-primary">
                          {template.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{template.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {template.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Apply Template Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTemplate?.icon}
              Apply Template
            </DialogTitle>
            <DialogDescription>
              This will populate the universe with pre-configured settings for {selectedTemplate?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="universe-name">Universe Name</Label>
              <Input
                id="universe-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={selectedTemplate?.name}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Template includes:</Label>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">Fit Criteria</Badge>
                <Badge variant="secondary">Size Ranges</Badge>
                <Badge variant="secondary">Geography</Badge>
                <Badge variant="secondary">Service Focus</Badge>
                <Badge variant="secondary">Scoring Weights</Badge>
              </div>
            </div>

            {selectedTemplate && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <p className="font-medium mb-1">Revenue Range:</p>
                <p>
                  ${((selectedTemplate.config.size_criteria.revenue_min || 0) / 1000000).toFixed(0)}M - 
                  ${((selectedTemplate.config.size_criteria.revenue_max || 0) / 1000000).toFixed(0)}M
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              <Check className="mr-2 h-4 w-4" />
              Apply Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
