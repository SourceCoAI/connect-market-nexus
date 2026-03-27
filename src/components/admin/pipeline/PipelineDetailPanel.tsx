import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { X, MoreVertical, Archive, Sparkles, Target } from 'lucide-react';
import { usePipelineCore } from '@/hooks/admin/use-pipeline-core';
import { PipelineDetailOverview } from './tabs/PipelineDetailOverview';
import { PipelineDetailNotes } from './tabs/PipelineDetailNotes';
import { PipelineDetailDataRoom } from './tabs/PipelineDetailDataRoom';
import { PipelineDetailDealInfo } from './tabs/PipelineDetailDealInfo';
import { PipelineDetailOtherBuyers } from './tabs/PipelineDetailOtherBuyers';
import { EntityTasksTab, CreateTaskButton } from '@/components/daily-tasks';
import { ArchiveDealDialog } from '@/components/admin/deals/ArchiveDealDialog';

interface PipelineDetailPanelProps {
  pipeline: ReturnType<typeof usePipelineCore>;
}

export function PipelineDetailPanel({ pipeline }: PipelineDetailPanelProps) {
  const { selectedDeal } = pipeline;
  const [activeTab, setActiveTab] = useState('overview');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!selectedDeal) {
    return (
      <div className="w-[900px] max-w-[95vw] border-l bg-background flex items-center justify-center shadow-2xl flex-shrink-0 overflow-y-auto overflow-x-hidden">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-muted/10 rounded-2xl flex items-center justify-center">
            <div className="w-8 h-8 bg-muted/30 rounded-xl" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Select a deal</p>
            <p className="text-xs text-muted-foreground">
              Choose from the pipeline to view details
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[900px] max-w-[95vw] border-l bg-background flex flex-col min-h-0 shadow-2xl flex-shrink-0 overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="px-8 py-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1 min-w-0">
            <h1 className="text-xl font-medium text-foreground tracking-tight truncate">
              {selectedDeal.listing_real_company_name?.trim()
                ? `${selectedDeal.listing_real_company_name} / ${selectedDeal.listing_title || selectedDeal.title}`
                : selectedDeal.listing_title || selectedDeal.title}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{selectedDeal.contact_name}</span>
              {selectedDeal.contact_company && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{selectedDeal.contact_company}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <CreateTaskButton
              entityType="deal"
              entityId={selectedDeal.deal_id}
              entityName={selectedDeal.title}
              dealId={selectedDeal.deal_id}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-full"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selectedDeal.listing_id && (
                  <>
                    <DropdownMenuItem
                      onClick={() =>
                        navigate(`/admin/remarketing/matching/${selectedDeal.listing_id}`)
                      }
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Match Buyers
                    </DropdownMenuItem>
                    {selectedDeal.remarketing_buyer_id && (
                      <DropdownMenuItem
                        onClick={() =>
                          navigate(`/admin/buyers/${selectedDeal.remarketing_buyer_id}`, { state: { from: location.pathname } })
                        }
                      >
                        <Target className="h-4 w-4 mr-2" />
                        View Remarketing Buyer
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Deal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pipeline.setSelectedDeal(null)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-full"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <ArchiveDealDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        deal={selectedDeal}
        onArchived={() => pipeline.setSelectedDeal(null)}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-8 mb-6">
          <TabsList className="grid w-full grid-cols-6 bg-muted/30 h-10 rounded-lg p-1">
            <TabsTrigger
              value="overview"
              className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="dealinfo"
              className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              Deal Overview
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              Notes
            </TabsTrigger>
            <TabsTrigger
              value="dataroom"
              className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              Data Room
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              Tasks
            </TabsTrigger>
            <TabsTrigger
              value="otherbuyers"
              className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              Other Buyers
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent
            value="overview"
            className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <PipelineDetailOverview deal={selectedDeal} onSwitchTab={setActiveTab} />
          </TabsContent>
          <TabsContent
            value="dealinfo"
            className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <PipelineDetailDealInfo deal={selectedDeal} />
          </TabsContent>
          <TabsContent
            value="notes"
            className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <PipelineDetailNotes deal={selectedDeal} />
          </TabsContent>
          <TabsContent
            value="dataroom"
            className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <PipelineDetailDataRoom deal={selectedDeal} />
          </TabsContent>
          <TabsContent
            value="tasks"
            className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <div className="flex-1 overflow-auto px-8 pb-8">
              <EntityTasksTab
                entityType="deal"
                entityId={selectedDeal.deal_id}
                entityName={selectedDeal.title}
                dealId={selectedDeal.deal_id}
              />
            </div>
          </TabsContent>
          <TabsContent
            value="otherbuyers"
            className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <PipelineDetailOtherBuyers deal={selectedDeal} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
