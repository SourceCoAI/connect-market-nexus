
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MoreVertical,
  ArrowUpDown,
  ListChecks,
} from 'lucide-react';
import { usePipelineCore } from '@/hooks/admin/use-pipeline-core';
import { formatDistanceToNow } from 'date-fns';

interface PipelineTableViewProps {
  pipeline: ReturnType<typeof usePipelineCore>;
}

export function PipelineTableView({ pipeline }: PipelineTableViewProps) {
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
    <div className="flex-1 overflow-auto">
      <div className="p-4">
        {/* Header Actions */}
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
        
        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
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
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0">
                    Deal <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Listing</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0">
                    Value <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Probability</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Expected Close</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipeline.deals.map((deal) => (
                <TableRow 
                  key={deal.deal_id}
                  className={`
                    cursor-pointer hover:bg-muted/50 transition-colors
                    ${pipeline.selectedDeals.includes(deal.deal_id) ? 'bg-primary/5' : ''}
                    ${deal.under_loi ? 'bg-purple-50/60' : ''}
                  `}
                  onClick={() => pipeline.handleDealSelect(deal)}
                >
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{deal.title}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{deal.contact_name || 'Unknown'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground truncate max-w-32">
                      {deal.listing_title}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-sm">{formatCurrency(deal.deal_value)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getStageColor(deal.stage_id) }}
                      />
                      <span className="text-sm">{deal.stage_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{deal.deal_probability}%</div>
                  </TableCell>
                  <TableCell>
                    {(deal.deal_priority === 'high' || deal.deal_priority === 'urgent') && (
                      <Badge className={`${getPriorityColor(deal.deal_priority)} h-5 px-2 text-xs`}>
                        {deal.deal_priority}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {deal.pending_tasks > 0 ? (
                      <div className="flex items-center gap-1 text-xs font-medium text-red-700">
                        <ListChecks className="h-3.5 w-3.5" />
                        {deal.pending_tasks}
                      </div>
                    ) : deal.total_tasks > 0 ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" />
                        {deal.completed_tasks}/{deal.total_tasks}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
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
                          LOI
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {deal.deal_expected_close_date && (
                      <div className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(deal.deal_expected_close_date), { addSuffix: true })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
