import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminListing } from '@/types/admin';
import { toast } from '@/hooks/use-toast';
import { uploadListingImage } from '@/lib/storage-utils';
import { parseCurrency } from '@/lib/currency-utils';

// Validation and sanitization utilities
const sanitizeArrayField = (field: unknown): string[] => {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.filter((item) => item && typeof item === 'string' && item.trim().length > 0);
  }
  return [];
};

const sanitizeStringField = (field: unknown, defaultValue: string = ''): string => {
  if (typeof field === 'string') return field.trim();
  return defaultValue;
};

const sanitizeNumericField = (field: unknown): number => {
  // Use parseCurrency to handle formatted strings like "$1.5M", "1,500,000", etc.
  if (typeof field === 'string') return parseCurrency(field);
  const num = Number(field);
  return isNaN(num) ? 0 : num;
};

// Core listing data structure that matches the database exactly
interface DatabaseListingInsert {
  title: string;
  categories: string[];
  category: string;
  acquisition_type?: 'add_on' | 'platform' | null;
  description: string;
  description_html: string | null;
  description_json: Record<string, unknown> | null;
  location: string;
  revenue: number;
  ebitda: number;
  tags: string[];
  owner_notes: string | null;
  status: 'active' | 'inactive';
  image_url: string | null;

  // CRITICAL: Marketplace visibility control
  is_internal_deal: boolean;

  // Employee metrics
  full_time_employees?: number | null;
  part_time_employees?: number | null;

  // Hero & Status
  hero_description?: string | null;
  status_tag?: string | null;
  visible_to_buyer_types?: string[] | null;

  // Internal company info
  internal_company_name?: string | null;
  internal_salesforce_link?: string | null;
  internal_deal_memo_link?: string | null;
  internal_contact_info?: string | null;
  internal_notes?: string | null;

  // Ownership
  primary_owner_id?: string | null;
  presented_by_admin_id?: string | null;

  // Custom metrics (metric 2)
  custom_metric_label?: string | null;
  custom_metric_value?: string | null;
  custom_metric_subtitle?: string | null;

  // Metric 3
  metric_3_type?: string | null;
  metric_3_custom_label?: string | null;
  metric_3_custom_value?: string | null;
  metric_3_custom_subtitle?: string | null;

  // Metric 4
  metric_4_type?: string | null;
  metric_4_custom_label?: string | null;
  metric_4_custom_value?: string | null;
  metric_4_custom_subtitle?: string | null;

  // Revenue/EBITDA subtitles
  revenue_metric_subtitle?: string | null;
  ebitda_metric_subtitle?: string | null;

  // Source deal linkage
  source_deal_id?: string | null;

  // Structured contact fields (tied to deal contact)
  main_contact_first_name?: string | null;
  main_contact_last_name?: string | null;
  main_contact_name?: string | null;
  main_contact_email?: string | null;
  main_contact_phone?: string | null;
  main_contact_linkedin?: string | null;

  // Content sections (populated by lead memo generator)
  custom_sections?: Array<{ title: string; description: string }> | null;

  // Deal detail fields (used in admin pipeline, remarketing, buyer universe)
  investment_thesis?: string | null;
  services?: string[] | null;
  growth_drivers?: string[] | null;
  competitive_position?: string | null;
  ownership_structure?: string | null;
  seller_motivation?: string | null;
  business_model?: string | null;
  customer_geography?: string | null;
  customer_types?: string | null;
  revenue_model?: string | null;
  end_market_description?: string | null;
}

/**
 * Robust listing creation hook with comprehensive error handling
 * and isolation from external dependencies
 */
export function useRobustListingCreation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listing,
      image,
      sendDealAlerts,
      targetType: _targetType,
    }: {
      listing: Omit<AdminListing, 'id' | 'created_at' | 'updated_at'>;
      image?: File | null;
      sendDealAlerts?: boolean;
      targetType?: 'marketplace' | 'research';
    }) => {
      try {
        // Step 1: Validate and sanitize all input data
        const sanitizedCategories = sanitizeArrayField(listing.categories);
        const sanitizedTags = sanitizeArrayField(listing.tags);

        if (sanitizedCategories.length === 0) {
          throw new Error('At least one category is required');
        }

        // Step 2: Build the exact database structure
        // CRITICAL: Admin listings are created as drafts (internal) until explicitly published
        // This prevents accidental marketplace publication
        const databaseInsert: DatabaseListingInsert = {
          title: sanitizeStringField(listing.title),
          categories: sanitizedCategories,
          category: sanitizedCategories[0], // First category for backward compatibility
          acquisition_type:
            listing.acquisition_type === 'add_on' || listing.acquisition_type === 'platform'
              ? listing.acquisition_type
              : null,
          description: sanitizeStringField(listing.description),
          description_html: listing.description_html || null,
          description_json: listing.description_json || null,
          location: sanitizeStringField(listing.location),
          revenue: sanitizeNumericField(listing.revenue),
          ebitda: sanitizeNumericField(listing.ebitda),
          tags: sanitizedTags,
          owner_notes: listing.owner_notes ? sanitizeStringField(listing.owner_notes) : null,
          status: listing.status || 'active',
          image_url: null,
          // IMPORTANT: Create as internal draft - must use publish-listing to go public
          is_internal_deal: true,

          // Employee metrics (use ?? to preserve valid 0 values)
          full_time_employees: listing.full_time_employees ?? null,
          part_time_employees: listing.part_time_employees ?? null,

          // Hero & Status
          hero_description: listing.hero_description || null,
          status_tag: listing.status_tag || null,
          visible_to_buyer_types: listing.visible_to_buyer_types || null,

          // Internal company info
          internal_company_name: listing.internal_company_name || null,
          internal_salesforce_link: listing.internal_salesforce_link || null,
          internal_deal_memo_link: listing.internal_deal_memo_link || null,
          internal_contact_info: listing.internal_contact_info || null,
          internal_notes: listing.internal_notes || null,

          // Ownership
          primary_owner_id: listing.primary_owner_id || null,
          presented_by_admin_id: listing.presented_by_admin_id || null,

          // Custom metrics (metric 2)
          custom_metric_label: listing.custom_metric_label || null,
          custom_metric_value: listing.custom_metric_value || null,
          custom_metric_subtitle: listing.custom_metric_subtitle || null,

          // Metric 3
          metric_3_type: listing.metric_3_type || null,
          metric_3_custom_label: listing.metric_3_custom_label || null,
          metric_3_custom_value: listing.metric_3_custom_value || null,
          metric_3_custom_subtitle: listing.metric_3_custom_subtitle || null,

          // Metric 4
          metric_4_type: listing.metric_4_type || null,
          metric_4_custom_label: listing.metric_4_custom_label || null,
          metric_4_custom_value: listing.metric_4_custom_value || null,
          metric_4_custom_subtitle: listing.metric_4_custom_subtitle || null,

          // Revenue/EBITDA subtitles
          revenue_metric_subtitle: listing.revenue_metric_subtitle || null,
          ebitda_metric_subtitle: listing.ebitda_metric_subtitle || null,

          // Source deal linkage
          source_deal_id: listing.source_deal_id || null,

          // Structured contact fields (tied to deal contact)
          main_contact_first_name: listing.main_contact_first_name || null,
          main_contact_last_name: listing.main_contact_last_name || null,
          main_contact_name: listing.main_contact_name ||
            (listing.main_contact_first_name || listing.main_contact_last_name
              ? `${listing.main_contact_first_name || ''} ${listing.main_contact_last_name || ''}`.trim()
              : null),
          main_contact_email: listing.main_contact_email || null,
          main_contact_phone: listing.main_contact_phone || null,
          main_contact_linkedin: listing.main_contact_linkedin || null,

          // Content sections (populated by lead memo generator)
          custom_sections: listing.custom_sections || null,

          // Deal detail fields
          investment_thesis: listing.investment_thesis || null,
          services: listing.services || null,
          growth_drivers: listing.growth_drivers || null,
          competitive_position: listing.competitive_position || null,
          ownership_structure: listing.ownership_structure || null,
          seller_motivation: listing.seller_motivation || null,
          business_model: listing.business_model || null,
          customer_geography: listing.customer_geography || null,
          customer_types: listing.customer_types || null,
          revenue_model: listing.revenue_model || null,
          end_market_description: listing.end_market_description || null,
        };

        // Step 3: Insert listing with isolated transaction
        const { data: insertedListing, error: insertError } = await supabase
          .from('listings')
          .insert(databaseInsert as never)
          .select()
          .single();

        if (insertError) {
          throw new Error(`Database error: ${insertError.message}`);
        }

        if (!insertedListing) {
          throw new Error('No data returned from database insert');
        }

        // Step 4: Handle image upload separately (isolated from main transaction)
        let finalListing = insertedListing;

        if (image) {
          try {
            const publicUrl = await uploadListingImage(image, insertedListing.id);

            // Update listing with image URL
            const { data: updatedListing, error: updateError } = await supabase
              .from('listings')
              .update({
                image_url: publicUrl,
                files: [publicUrl],
              })
              .eq('id', insertedListing.id)
              .select()
              .single();

            if (updateError) {
              toast({
                variant: 'destructive',
                title: 'Partial Success',
                description:
                  'Listing created but image attachment failed. You can edit the listing to add an image.',
              });
            } else {
              finalListing = updatedListing;
            }
          } catch (_imageError: unknown) {
            toast({
              variant: 'destructive',
              title: 'Image Upload Failed',
              description:
                'Listing created successfully, but image upload failed. You can edit the listing to add an image.',
            });
          }
        }

        // Step 5: Handle deal alerts separately (completely isolated)
        if (sendDealAlerts) {
          try {
            // Call deal alerts function separately to avoid transaction interference
            await triggerDealAlertsForListing(finalListing);
          } catch (_alertError: unknown) {
            // Don't fail the entire operation for deal alerts
            toast({
              title: 'Listing Created',
              description: 'Listing created successfully, but deal alerts could not be sent.',
            });
          }
        }

        return finalListing as unknown as AdminListing;
      } catch (error: unknown) {
        throw new Error(error instanceof Error ? error.message : 'Failed to create listing');
      }
    },
    onSuccess: (data) => {
      // Clear all relevant caches
      const queriesToInvalidate = [
        ['admin-listings'],
        ['listings'],
        ['listing-metadata'],
        ['listing', data.id],
      ];

      queriesToInvalidate.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });

      toast({
        title: 'Listing Created as Draft',
        description: `"${data.title}" has been created. Use Publish to make it visible on the marketplace.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Create Listing',
        description: error.message || 'An unexpected error occurred',
      });
    },
  });
}

/**
 * Separate function to handle deal alerts without affecting main listing creation
 */
async function triggerDealAlertsForListing(listing: Record<string, unknown>): Promise<void> {
  try {
    // Query deal alerts that match this listing
    const { data: matchingAlerts, error } = await supabase.rpc('match_deal_alerts_with_listing', {
      listing_data: listing as unknown as Record<string, never>,
    });

    if (error) {
      return;
    }

    if (matchingAlerts && matchingAlerts.length > 0) {
      // Process instant alerts
      for (const alert of matchingAlerts) {
        if (alert.alert_frequency === 'instant') {
          // Log delivery attempt
          await supabase.from('alert_delivery_logs').insert({
            alert_id: alert.alert_id as string,
            listing_id: listing.id as string,
            user_id: alert.user_id as string,
            delivery_status: 'pending',
          });

          // Trigger edge function
          try {
            const { error: functionError } = await supabase.functions.invoke('send-deal-alert', {
              body: {
                alert_id: alert.alert_id,
                user_email: alert.user_email,
                user_id: alert.user_id,
                listing_id: listing.id,
                alert_name: alert.alert_name,
                listing_data: listing,
              },
            });

            if (functionError) {
              throw functionError;
            }
          } catch (emailError) {
            // Deal alert email failed for this user
          }
        }
      }
    }
  } catch (_triggerError) {
    // Silently fail deal alerts - they should not block listing creation
  }
}
