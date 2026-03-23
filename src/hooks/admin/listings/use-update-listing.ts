import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminListing } from '@/types/admin';
import { toast } from '@/hooks/use-toast';
import { uploadListingImage, ensureListingsBucketExists } from '@/lib/storage-utils';

/**
 * Hook for updating an existing listing
 */
export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      listing,
      image,
    }: {
      id: string;
      listing: Partial<Omit<AdminListing, 'id' | 'created_at' | 'updated_at'>>;
      image?: File | null;
    }) => {
      // Ensure bucket exists before attempting upload
      if (image) {
        const bucketExists = await ensureListingsBucketExists();
        if (!bucketExists) {
          toast({
            title: 'Storage not ready',
            description: 'The listing will be updated without changing the image.',
          });
          // Continue without image update
        }
      }

      // H-3 FIX: If the listing is published, validate that the update won't violate
      // publishing gate requirements before applying. This prevents published listings
      // from being edited into an invalid state.
      const { data: currentListing } = await supabase
        .from('listings')
        .select(
          'is_internal_deal, published_at, title, description, categories, location, revenue, ebitda, image_url',
        )
        .eq('id', id)
        .single();

      const isPublished =
        currentListing && !currentListing.is_internal_deal && currentListing.published_at;
      if (isPublished) {
        const merged = { ...currentListing, ...listing };
        const violations: string[] = [];
        if (merged.title != null && String(merged.title).length < 5)
          violations.push('Title must be at least 5 characters');
        if (merged.description != null && String(merged.description).length < 50)
          violations.push('Description must be at least 50 characters');
        if (
          listing.categories !== undefined &&
          (!merged.categories || (merged.categories as string[]).length === 0)
        )
          violations.push('At least one category is required');
        if (listing.location !== undefined && !merged.location)
          violations.push('Location is required');
        if (listing.revenue !== undefined && (!merged.revenue || Number(merged.revenue) <= 0))
          violations.push('Revenue must be greater than 0');
        if (listing.ebitda !== undefined && merged.ebitda == null)
          violations.push('EBITDA is required');
        if (listing.image_url !== undefined && !merged.image_url)
          violations.push('Image is required for published listings');
        if (violations.length > 0) {
          throw new Error(
            `Cannot save: published listing would violate requirements. ${violations.join('. ')}`,
          );
        }
      }

      // Step 1: Update the listing details
      const { data, error } = await supabase
        .from('listings')
        .update({
          ...listing,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error(
          'Update failed: No listing found with that ID or insufficient permissions. Please verify the listing exists and you have admin access.',
        );
      }

      // Listing updated successfully

      // Step 2: Upload new image if provided
      let updatedListing = data;

      if (image) {
        try {
          // Upload new image for listing
          const publicUrl = await uploadListingImage(image, id);

          // Update listing with new image URL
          const { data: updatedData, error: updateError } = await supabase
            .from('listings')
            .update({
              image_url: publicUrl,
              // Add the image URL to files array as well
              files: [publicUrl],
            })
            .eq('id', id)
            .select()
            .single();

          if (updateError) {
            toast({
              variant: 'destructive',
              title: 'Image Update Partial Failure',
              description:
                'Listing updated but image URL update failed. The image may not display correctly.',
            });
          } else {
            // Listing updated with new image URL
            updatedListing = updatedData;
          }
        } catch (imageError: unknown) {
          toast({
            variant: 'destructive',
            title: 'Image Upload Failed',
            description:
              imageError instanceof Error
                ? imageError.message
                : 'Failed to update image, but listing was updated',
          });
        }
      }

      return updatedListing as unknown as AdminListing;
    },
    onSuccess: () => {
      // Small delay to ensure DB transaction is committed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
        queryClient.invalidateQueries({ queryKey: ['listings'] });
        queryClient.invalidateQueries({ queryKey: ['listing'] }); // Invalidate single listing queries too
        queryClient.invalidateQueries({ queryKey: ['deals'] }); // Invalidate deals to sync real company name changes
      }, 100);

      toast({
        title: 'Listing Updated',
        description: 'The listing has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error Updating Listing',
        description: error.message || 'Failed to update listing',
      });
    },
  });
}
