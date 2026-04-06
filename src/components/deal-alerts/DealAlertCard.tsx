import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Bell, BellOff } from 'lucide-react';
import { DealAlert } from '@/hooks/use-deal-alerts';

interface DealAlertCardProps {
  alert: DealAlert;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onEdit: (alert: DealAlert) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

export function DealAlertCard({ alert, selected, onSelect, onEdit, onDelete, onToggle }: DealAlertCardProps) {
  const formatCurrency = (value?: number) => {
    if (!value) return 'Any';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCriteria = () => {
    const criteria = alert.criteria;
    const parts = [];

    if (criteria.categories && criteria.categories.length > 0) parts.push(`Categories: ${criteria.categories.join(', ')}`);
    else if (criteria.category) parts.push(`Category: ${criteria.category}`);
    if (criteria.locations && criteria.locations.length > 0) parts.push(`Locations: ${criteria.locations.join(', ')}`);
    else if (criteria.location) parts.push(`Location: ${criteria.location}`);
    if (criteria.revenueMin || criteria.revenueMax) {
      const min = formatCurrency(criteria.revenueMin);
      const max = formatCurrency(criteria.revenueMax);
      parts.push(`Revenue: ${min} - ${max}`);
    }
    if (criteria.ebitdaMin || criteria.ebitdaMax) {
      const min = formatCurrency(criteria.ebitdaMin);
      const max = formatCurrency(criteria.ebitdaMax);
      parts.push(`EBITDA: ${min} - ${max}`);
    }
    if (criteria.search) parts.push(`Search: "${criteria.search}"`);

    return parts.length > 0 ? parts.join(' • ') : 'All listings';
  };

  const getFrequencyBadgeVariant = (frequency: string) => {
    switch (frequency) {
      case 'instant': return 'default';
      case 'daily': return 'secondary';
      case 'weekly': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <Card className={`transition-all duration-200 ${selected ? 'ring-2 ring-primary border-primary' : ''} ${alert.is_active ? 'border-primary/20' : 'border-muted opacity-75'}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {onSelect && (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onSelect(alert.id)}
                aria-label={`Select ${alert.name}`}
                className="mt-0.5 flex-shrink-0"
              />
            )}
            {alert.is_active ? (
              <Bell className="h-4 w-4 text-primary flex-shrink-0" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <CardTitle className="text-lg truncate">{alert.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={getFrequencyBadgeVariant(alert.frequency)}>
              {alert.frequency}
            </Badge>
            <Switch
              checked={alert.is_active}
              onCheckedChange={(checked) => onToggle(alert.id, checked)}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{formatCriteria()}</p>
          
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Created {new Date(alert.created_at).toLocaleDateString()}
              {alert.last_sent_at && (
                <span className="ml-2">
                  • Last sent {new Date(alert.last_sent_at).toLocaleDateString()}
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(alert)}
              >
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(alert.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}