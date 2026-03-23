import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/permissions/usePermissions';
import { usePendingReviewCount } from './hooks/useObjectionPlaybook';
import { PlaybookView } from './components/PlaybookView';
import { PendingReviewView } from './components/PendingReviewView';
import { CategoriesView } from './components/CategoriesView';

type SubTab = 'playbook' | 'pending_review' | 'categories';

export default function ObjectionTrackerPage() {
  const [activeTab, setActiveTab] = useState<SubTab>('playbook');
  const { isAdmin } = usePermissions();
  const { data: pendingCount } = usePendingReviewCount();

  const tabs: { id: SubTab; label: string; adminOnly?: boolean; badge?: number }[] = [
    { id: 'playbook', label: 'Playbook' },
    { id: 'pending_review', label: 'Pending Review', adminOnly: true, badge: pendingCount || 0 },
    { id: 'categories', label: 'Categories', adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Training Center</h1>
        <p className="text-muted-foreground mt-1">
          Call library, objection frameworks, playbook reference, and standup drills.
        </p>
      </div>

      {/* Sub-tab navigation */}
      <div className="border-b">
        <nav className="flex gap-1 -mb-px">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
              )}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <Badge
                  variant="default"
                  className="h-5 min-w-[20px] px-1.5 text-[10px] font-bold bg-primary"
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </Badge>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'playbook' && <PlaybookView />}
        {activeTab === 'pending_review' && isAdmin && <PendingReviewView />}
        {activeTab === 'categories' && isAdmin && <CategoriesView />}
      </div>
    </div>
  );
}
