import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { NumericInput } from "@/components/ui/numeric-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Users, 
  Building2, 
  TrendingUp,
  Briefcase,
  Home,
  Store,
  Edit
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TargetBuyerTypeConfig } from "@/types/remarketing";

interface TargetBuyerTypesPanelProps {
  buyerTypes: TargetBuyerTypeConfig[];
  onBuyerTypesChange?: (types: TargetBuyerTypeConfig[]) => void;
  readOnly?: boolean;
}

const BUYER_TYPE_ICONS: Record<string, typeof Building2> = {
  large_mso: Building2,
  regional_mso: TrendingUp,
  pe_backed: Briefcase,
  independent_sponsor: Users,
  small_local: Home,
  local_strategic: Store,
};

export const TargetBuyerTypesPanel = ({
  buyerTypes = [],
  onBuyerTypesChange,
  readOnly = false,
}: TargetBuyerTypesPanelProps) => {
  const [, setEditingType] = useState<TargetBuyerTypeConfig | null>(null);

  const handleToggle = (id: string, enabled: boolean) => {
    if (onBuyerTypesChange && !readOnly) {
      onBuyerTypesChange(
        buyerTypes.map(t => t.id === id ? { ...t, enabled } : t)
      );
    }
  };

  const handleUpdate = (updated: TargetBuyerTypeConfig) => {
    if (onBuyerTypesChange && !readOnly) {
      onBuyerTypesChange(
        buyerTypes.map(t => t.id === updated.id ? updated : t)
      );
    }
    setEditingType(null);
  };

  const enabledCount = buyerTypes.filter(t => t.enabled).length;

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-500" />
          <h4 className="font-medium text-sm">Target Buyer Types</h4>
          <Badge variant="secondary" className="text-xs">
            {enabledCount} types
          </Badge>
        </div>
      </div>

      {/* Empty State */}
      {buyerTypes.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h4 className="font-medium text-sm mb-2">No Buyer Types Defined</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Run AI Research to automatically generate industry-specific buyer types based on your M&A guide.
          </p>
        </div>
      )}

      {/* 2-Column Grid of Buyer Type Cards */}
      {buyerTypes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {buyerTypes.sort((a, b) => a.rank - b.rank).map((buyerType) => {
          const Icon = BUYER_TYPE_ICONS[buyerType.id] || Building2;
          
          return (
            <Card 
              key={buyerType.id} 
              className={cn(
                "relative transition-all",
                !buyerType.enabled && "opacity-50",
                buyerType.rank === 1 && buyerType.enabled && "bg-amber-50/50 border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-800/50",
                buyerType.rank === 2 && buyerType.enabled && "bg-slate-50/50 border-slate-200/50 dark:bg-slate-950/20 dark:border-slate-700/50"
              )}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "h-7 w-7 rounded-md flex items-center justify-center shrink-0",
                      buyerType.enabled ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Icon className={cn(
                        "h-3.5 w-3.5",
                        buyerType.enabled ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="text-sm truncate">{buyerType.name}</CardTitle>
                        <Badge 
                          variant="default" 
                          className={cn(
                            "text-[10px] px-1 py-0 h-4 shrink-0",
                            buyerType.rank === 1 && "bg-amber-500",
                            buyerType.rank === 2 && "bg-slate-400",
                            buyerType.rank === 3 && "bg-amber-700",
                            buyerType.rank > 3 && "bg-muted-foreground"
                          )}
                        >
                          #{buyerType.rank}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!readOnly && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => setEditingType(buyerType)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit {buyerType.name}</DialogTitle>
                          </DialogHeader>
                          <BuyerTypeEditForm 
                            buyerType={buyerType} 
                            onSave={handleUpdate}
                            onCancel={() => setEditingType(null)}
                          />
                        </DialogContent>
                      </Dialog>
                    )}
                    <Switch
                      checked={buyerType.enabled}
                      onCheckedChange={(checked) => handleToggle(buyerType.id, checked)}
                      disabled={readOnly}
                      className="scale-90"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-0 px-4 pb-3 space-y-2">
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {buyerType.description}
                </p>
                
                {/* Metric pills */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center text-[11px] bg-muted/60 rounded px-1.5 py-0.5">
                    <span className="text-muted-foreground">Locations:</span>
                    <span className="ml-1 font-medium">
                      {buyerType.locations_min} - {buyerType.locations_max}
                    </span>
                  </span>
                  <span className="inline-flex items-center text-[11px] bg-muted/60 rounded px-1.5 py-0.5">
                    <span className="text-muted-foreground">Rev/Loc:</span>
                    <span className="ml-1 font-medium">
                      ${((buyerType.revenue_per_location || 0) / 1000000).toFixed(1)}M
                    </span>
                  </span>
                </div>

                {buyerType.deal_requirements && (
                  <div className="text-xs pt-1 border-t border-dashed">
                    <span className="text-muted-foreground">Deal Requirements</span>
                    <p className="mt-0.5 text-foreground line-clamp-2">
                      {buyerType.deal_requirements}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>
      )}
    </div>
  );
};

interface BuyerTypeEditFormProps {
  buyerType: TargetBuyerTypeConfig;
  onSave: (updated: TargetBuyerTypeConfig) => void;
  onCancel: () => void;
}

const BuyerTypeEditForm = ({ buyerType, onSave, onCancel }: BuyerTypeEditFormProps) => {
  const [form, setForm] = useState(buyerType);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min Locations</Label>
          <NumericInput
            value={form.locations_min || ''}
            onChange={(value) => setForm({ ...form, locations_min: parseInt(value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>Max Locations</Label>
          <NumericInput
            value={form.locations_max || ''}
            onChange={(value) => setForm({ ...form, locations_max: parseInt(value) || 0 })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Revenue per Location ($)</Label>
        <NumericInput
          value={form.revenue_per_location || ''}
          onChange={(value) => setForm({ ...form, revenue_per_location: parseInt(value) || 0 })}
        />
      </div>

      <div className="space-y-2">
        <Label>Deal Requirements</Label>
        <Textarea
          value={form.deal_requirements || ''}
          onChange={(e) => setForm({ ...form, deal_requirements: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save Changes</Button>
      </div>
    </div>
  );
};

export default TargetBuyerTypesPanel;
