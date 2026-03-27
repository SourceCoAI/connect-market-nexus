import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ListingsTabContent } from './ListingsTabContent';
import { ListingForm } from './ListingForm';
import { AdminListing } from '@/types/admin';
import { useAdmin } from '@/hooks/use-admin';
import { useListingTypeCounts } from '@/hooks/admin/listings/use-listings-by-type';
import { ListingType } from '@/hooks/admin/listings/use-listings-by-type';

const ListingsManagementTabs = () => {
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<AdminListing | null>(null);
  const [activeTab, setActiveTab] = useState<ListingType>('all');

  const { useCreateListing, useUpdateListing } = useAdmin();
  const { mutateAsync: createListing, isPending: isCreating } = useCreateListing();
  const { mutateAsync: updateListing, isPending: isUpdating } = useUpdateListing();
  const { data: counts } = useListingTypeCounts();

  const handleFormSubmit = async (
    data: Record<string, unknown>,
    image?: File | null,
    sendDealAlerts?: boolean,
  ) => {
    try {
      if (editingListing) {
        await updateListing({
          id: editingListing.id,
          listing: data as Partial<Omit<AdminListing, 'id' | 'created_at' | 'updated_at'>>,
          image,
        });
      } else {
        await createListing({
          listing: data as Omit<AdminListing, 'id' | 'created_at' | 'updated_at'>,
          image,
          sendDealAlerts,
          targetType: 'marketplace',
        });
      }
      handleFormClose();
    } catch (error) {
      console.error('[FORM SUBMIT] Mutation failed:', error);
    }
  };

  const handleFormClose = () => {
    setIsCreateFormOpen(false);
    setEditingListing(null);
  };

  if (isCreateFormOpen || editingListing) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <ListingForm
          listing={editingListing ?? undefined}
          onSubmit={handleFormSubmit}
          isLoading={isCreating || isUpdating}
          targetType="marketplace"
        />
        <div className="mt-6">
          <Button variant="outline" onClick={handleFormClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-light text-foreground tracking-tight">
              Listings Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage all listings — marketplace, internal, and queued deals
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ListingType)}>
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              All Listings
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {(counts.marketplace || 0) + (counts.research || 0)}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="gap-2">
              Published
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {counts.marketplace || 0}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="research" className="gap-2">
              Internal / Drafts
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {counts.research || 0}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <ListingsTabContent
              type="all"
              onEdit={setEditingListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
          <TabsContent value="marketplace">
            <ListingsTabContent
              type="marketplace"
              onEdit={setEditingListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
          <TabsContent value="research">
            <ListingsTabContent
              type="research"
              onEdit={setEditingListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ListingsManagementTabs;
