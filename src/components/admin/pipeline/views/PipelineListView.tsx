
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DollarSign,
  Calendar,
  User,
  Building2,
  MoreVertical,
  Percent,
  ListChecks,
} from 'lucide-react';
import { usePipelineCore } from '@/hooks/admin/use-pipeline-core';
import { formatDistanceToNow } from 'date-fns';
import { ScoreBadge } from '@/components/shared/ScoreBadge';

interface PipelineListViewProps {
  pipeline: ReturnType<typeof usePipelineCore>;
}

export function PipelineListView({ pipeline }: PipelineListViewProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: value >= 100000 ? 'compact' : 'standard',
    }).format(value);
  };
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };
  
  const getStageColor = (stageId: string) => {
    const stage = pipeline.stages.find(s => s.id === stageId);
    return stage?.color || '#6b7280';
  };
  
  if (pipeline.deals.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/10">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground mb-2">No deals found</p>
          <p className="text-sm text-muted-foreground">Try adjusting your filters or create a new deal</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Checkbox 
            checked={pipeline.selectedDeals.length === pipeline.deals.length}
            onCheckedChange={(checked) => {
              if (checked) {
                pipeline.handleMultiSelect(pipeline.deals.map(d => d.deal_id));
              } else {
                pipeline.handleMultiSelect([]);
              }
            }}
          />
          <span className="text-sm text-muted-foreground">
            {pipeline.selectedDeals.length > 0 
              ? `${pipeline.selectedDeals.length} selected`
              : `${pipeline.deals.length} deals`
            }
          </span>
        </div>
        
        {pipeline.selectedDeals.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Bulk Actions
            </Button>
          </div>
        )}
      </div>
      
      {/* Deal List */}
      <div className="space-y-3">
        {pipeline.deals.map((deal) => (
          <Card 
            key={deal.deal_id}
            className={`
              cursor-pointer hover:shadow-md transition-all duration-200
              ${pipeline.selectedDeals.includes(deal.deal_id) ? 'ring-2 ring-primary' : ''}
              ${deal.under_loi ? 'ring-2 ring-purple-500 bg-purple-50/50' : ''}
            `}
            onClick={() => pipeline.handleDealSelect(deal)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Checkbox 
                    checked={pipeline.selectedDeals.includes(deal.deal_id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        pipeline.handleMultiSelect([...pipeline.selectedDeals, deal.deal_id]);
                      } else {
                        pipeline.handleMultiSelect(pipeline.selectedDeals.filter(id => id !== deal.deal_id));
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  {/* Deal Info */}
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <h3 className="font-semibold text-sm truncate">{deal.title}</h3>
                        {deal.deal_score != null && (
                          <ScoreBadge variant="deal" score={deal.deal_score} size="sm" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(deal.deal_priority === 'high' || deal.deal_priority === 'urgent') && (
                          <Badge className={`${getPriorityColor(deal.deal_priority)} h-5 px-2 text-xs`}>
                            {deal.deal_priority}
                          </Badge>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      {/* Contact */}
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{deal.contact_name || 'Unknown'}</span>
                      </div>
                      
                      {/* Value */}
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{formatCurrency(deal.deal_value)}</span>
                      </div>
                      
                      {/* Probability */}
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4 text-muted-foreground" />
                        <span>{deal.deal_probability}%</span>
                      </div>
                      
                      {/* Expected Close */}
                      {deal.deal_expected_close_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {formatDistanceToNow(new Date(deal.deal_expected_close_date), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Stage and Listing */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getStageColor(deal.stage_id) }}
                        />
                        <span className="text-sm text-muted-foreground">{deal.stage_name}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        <span className="truncate max-w-48">{deal.listing_title}</span>
                      </div>
                    </div>
                    
                    {/* Documents & Tasks */}
                    <div className="flex items-center gap-2 mt-2">
                      {deal.nda_status === 'signed' && (
                        <Badge variant="outline" className="h-4 px-1 text-xs bg-green-50 text-green-700 border-green-200">
                          NDA
                        </Badge>
                      )}
                      {deal.fee_agreement_status === 'signed' && (
                        <Badge variant="outline" className="h-4 px-1 text-xs bg-blue-50 text-blue-700 border-blue-200">
                          Fee
                        </Badge>
                      )}
                      {deal.under_loi && (
                        <Badge variant="outline" className="h-4 px-1 text-xs bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                          Under LOI
                        </Badge>
                      )}
                      {deal.pending_tasks > 0 && (
                        <Badge variant="outline" className="h-4 px-1.5 text-xs bg-red-50 text-red-700 border-red-200 gap-0.5">
                          <ListChecks className="h-3 w-3" />
                          {deal.pending_tasks} open
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
