import { useState } from 'react';
import { Users, Kanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntroductionPipeline } from './hooks/use-introduction-pipeline';
import { RecommendedBuyersTab } from './tabs/RecommendedBuyersTab';
import { IntroductionPipelineTab } from './tabs/IntroductionPipelineTab';

interface BuyerIntroductionPageProps {
  listingId: string;
  listingTitle: string;
}

type TabValue = 'recommended' | 'pipeline';

export function BuyerIntroductionPage({ listingId, listingTitle }: BuyerIntroductionPageProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('recommended');
  const { introductionIds } = useIntroductionPipeline(listingId);

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b">
        <button
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'recommended'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
          )}
          onClick={() => setActiveTab('recommended')}
        >
          <Users className="h-4 w-4" />
          Recommended Buyers
        </button>
        <button
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'pipeline'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
          )}
          onClick={() => setActiveTab('pipeline')}
        >
          <Kanban className="h-4 w-4" />
          Introduction Pipeline
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'recommended' && (
        <RecommendedBuyersTab
          listingId={listingId}
          listingTitle={listingTitle}
          pipelineBuyerIds={introductionIds}
        />
      )}
      {activeTab === 'pipeline' && (
        <IntroductionPipelineTab listingId={listingId} listingTitle={listingTitle} />
      )}
    </div>
  );
}
