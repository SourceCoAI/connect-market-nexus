/**
 * Canonical buyer-safe column list for marketplace listings.
 * 
 * IMPORTANT: This is the single source of truth for which columns
 * are safe to expose to buyer-facing queries. Never add internal_*
 * fields here. All buyer-facing listing hooks should import from here.
 */

export const MARKETPLACE_SAFE_COLUMNS = [
  'id',
  'title',
  'description',
  'description_html',
  'description_json',
  'hero_description',
  'category',
  'categories',
  'acquisition_type',
  'location',
  'revenue',
  'ebitda',
  'tags',
  'image_url',
  'status',
  'status_tag',
  'visible_to_buyer_types',
  'created_at',
  'updated_at',
  'published_at',
  'is_internal_deal',
  'deleted_at',
  'full_time_employees',
  'part_time_employees',
  'custom_metric_label',
  'custom_metric_value',
  'custom_metric_subtitle',
  'metric_3_type',
  'metric_3_custom_label',
  'metric_3_custom_value',
  'metric_3_custom_subtitle',
  'metric_4_type',
  'metric_4_custom_label',
  'metric_4_custom_value',
  'metric_4_custom_subtitle',
  'revenue_metric_subtitle',
  'ebitda_metric_subtitle',
  'owner_notes',
  'geographic_states',
  'services',
  'number_of_locations',
  'customer_types',
  'revenue_model',
  'business_model',
  'growth_trajectory',
] as const;

export const MARKETPLACE_SAFE_COLUMNS_STRING = MARKETPLACE_SAFE_COLUMNS.join(', ');
