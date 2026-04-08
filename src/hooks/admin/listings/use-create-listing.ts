import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminListing } from '@/types/admin';
import { toast } from '@/hooks/use-toast';
import { uploadListingImage } from '@/lib/storage-utils';

/**
 * Hook for creating a new listing
 */
export function useCreateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listing,
      image,
      sendDealAlerts: _sendDealAlerts,
      targetType: _targetType,
    }: {
      listing: Omit<AdminListing, 'id' | 'created_at' | 'updated_at'>;
      image?: File | null;
      sendDealAlerts?: boolean;
      targetType?: 'marketplace' | 'research';
    }) => {
      // Step 1: Create the listing with proper PostgreSQL array formatting
      const categoriesArray = Array.isArray(listing.categories)
        ? listing.categories.filter((cat) => cat && typeof cat === 'string')
        : [];
      const tagsArray = Array.isArray(listing.tags)
        ? listing.tags.filter((tag) => tag && typeof tag === 'string')
        : [];

      const insertData = {
        title: listing.title,
        categories: categoriesArray, // PostgreSQL array - never null
        category: categoriesArray.length > 0 ? categoriesArray[0] : '',
        description: listing.description,
        location: listing.location,
        revenue: listing.revenue,
        ebitda: listing.ebitda,
        tags: tagsArray, // PostgreSQL array - never null
        owner_notes: listing.owner_notes || null,
        status: listing.status || 'active',
        image_url: null,
        webflow_slug: (listing as any).webflow_slug || null,
        // CRITICAL: Create as internal draft - must use publish-listing to go public
        is_internal_deal: true,
      };

      const { data, error } = await supabase
        .from('listings')
        .insert(insertData as never)
        .select()
        .single();

      if (error) {
        throw error;
      }
      if (!data) throw new Error('No data returned from insert');

      // Step 2: Upload image if provided
      let updatedListing = data;

      if (image) {
        try {
          const publicUrl = await uploadListingImage(image, data.id);

          // Update listing with image URL
          const { data: updatedData, error: updateError } = await supabase
            .from('listings')
            .update({
              image_url: publicUrl,
              // Add the image URL to files array as well if needed
              files: [publicUrl],
            })
            .eq('id', data.id)
            .select()
            .single();

          if (updateError) {
            // Don't throw here, we already have the listing created
            toast({
              variant: 'destructive',
              title: 'Image attachment partial failure',
              description:
                'Listing created but image URL update failed. The image may not display correctly.',
            });
          } else {
            updatedListing = updatedData;
          }
        } catch (imageError: unknown) {
          toast({
            variant: 'destructive',
            title: 'Image Upload Failed',
            description:
              imageError instanceof Error
                ? imageError.message
                : 'Failed to upload image, but listing was created',
          });
        }
      }

      return updatedListing as unknown as AdminListing;
    },
    onSuccess: (data) => {
      // Strategy: Clear all caches completely, then trigger fresh fetches
      const queriesToClear = [['admin-listings'], ['listings'], ['listing-metadata'], ['listing']];

      // Remove all cached data
      queriesToClear.forEach((queryKey) => {
        queryClient.removeQueries({ queryKey });
      });

      // Immediately trigger fresh fetches with no stale data
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ['listings'],
          exact: false,
          refetchType: 'all',
        });

        queryClient.invalidateQueries({
          queryKey: ['admin-listings'],
          exact: false,
          refetchType: 'all',
        });

        queryClient.invalidateQueries({
          queryKey: ['listing-metadata'],
          exact: false,
          refetchType: 'all',
        });
      }, 100);

      toast({
        title: 'Listing Created as Draft',
        description: `"${data.title}" has been created. Use Publish to make it visible on the marketplace.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error Creating Listing',
        description: error.message || 'Failed to create listing',
      });
    },
  });
}
