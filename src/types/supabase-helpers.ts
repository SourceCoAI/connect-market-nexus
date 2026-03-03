/**
 * Typed Supabase query helpers and generic type utilities.
 *
 * These types make working with the auto-generated Supabase types
 * more ergonomic by providing shorthand aliases and utility types.
 *
 * Usage:
 *   import type { TableRow, TableInsert, ProfileRow, ListingRow } from '@/types/supabase-helpers';
 */

import type { Database } from '@/integrations/supabase/types';

// ─────────────────────────────────────────────────────────────────────────────
// Generic table helpers
// ─────────────────────────────────────────────────────────────────────────────

/** All public table names */
export type TableName = keyof Database['public']['Tables'];

/** Row type for a given table */
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];

/** Insert type for a given table */
export type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert'];

/** Update type for a given table */
export type TableUpdate<T extends TableName> = Database['public']['Tables'][T]['Update'];

/** Enum types from the database */
export type DbEnums = Database['public']['Enums'];

// ─────────────────────────────────────────────────────────────────────────────
// Convenience aliases for the most frequently used tables
// ─────────────────────────────────────────────────────────────────────────────

// Profiles
export type ProfileRow = TableRow<'profiles'>;
export type ProfileInsert = TableInsert<'profiles'>;
export type ProfileUpdate = TableUpdate<'profiles'>;

// Listings (the `listings` table holds the COMPANY/DEAL — the business being sold)
export type ListingRow = TableRow<'listings'>;
export type ListingInsert = TableInsert<'listings'>;
export type ListingUpdate = TableUpdate<'listings'>;

// Semantic aliases — the `listings` table is really "companies" or "deals" in business terms.
// The `deals` table is really "pipeline entries" (a buyer pursuing a deal).
// These aliases clarify the inverted naming convention (see audit Section 5).
export type CompanyRow = ListingRow;
export type CompanyInsert = ListingInsert;
export type CompanyUpdate = ListingUpdate;

// Connection Requests
export type ConnectionRequestRow = TableRow<'connection_requests'>;
export type ConnectionRequestInsert = TableInsert<'connection_requests'>;
export type ConnectionRequestUpdate = TableUpdate<'connection_requests'>;

// Deal Pipeline (the `deal_pipeline` table holds PIPELINE ENTRIES — a buyer pursuing a listing/company)
export type DealRow = TableRow<'deal_pipeline'>;
export type DealInsert = TableInsert<'deal_pipeline'>;
export type DealUpdate = TableUpdate<'deal_pipeline'>;

// Semantic aliases — see CompanyRow above for context.
export type PipelineEntryRow = DealRow;
export type PipelineEntryInsert = DealInsert;
export type PipelineEntryUpdate = DealUpdate;

// Deal Stages
export type DealStageRow = TableRow<'deal_stages'>;
export type DealStageInsert = TableInsert<'deal_stages'>;
export type DealStageUpdate = TableUpdate<'deal_stages'>;

// Buyers (ReMarketing)
export type BuyerRow = TableRow<'buyers'>;
export type BuyerInsert = TableInsert<'buyers'>;
export type BuyerUpdate = TableUpdate<'buyers'>;

// Contacts (unified contacts table — replaces legacy buyer_contacts)
export type BuyerContactRow = TableRow<'contacts'>;
export type BuyerContactInsert = TableInsert<'contacts'>;
export type BuyerContactUpdate = TableUpdate<'contacts'>;

// ReMarketing Buyer Universes
export type BuyerUniverseRow = TableRow<'remarketing_buyer_universes'>;
export type BuyerUniverseInsert = TableInsert<'remarketing_buyer_universes'>;
export type BuyerUniverseUpdate = TableUpdate<'remarketing_buyer_universes'>;

// Admin Notifications
export type AdminNotificationRow = TableRow<'admin_notifications'>;
export type AdminNotificationInsert = TableInsert<'admin_notifications'>;

// User Events
export type UserEventRow = TableRow<'user_events'>;
export type UserEventInsert = TableInsert<'user_events'>;

// Deal Activities
export type DealActivityRow = TableRow<'deal_activities'>;
export type DealActivityInsert = TableInsert<'deal_activities'>;

// Connection Messages
export type ConnectionMessageRow = TableRow<'connection_messages'>;
export type ConnectionMessageInsert = TableInsert<'connection_messages'>;

// Firm Agreements
export type FirmAgreementRow = TableRow<'firm_agreements'>;
export type FirmAgreementInsert = TableInsert<'firm_agreements'>;
export type FirmAgreementUpdate = TableUpdate<'firm_agreements'>;

// Inbound Leads
export type InboundLeadRow = TableRow<'inbound_leads'>;
export type InboundLeadInsert = TableInsert<'inbound_leads'>;
export type InboundLeadUpdate = TableUpdate<'inbound_leads'>;

// Saved Listings
export type SavedListingRow = TableRow<'saved_listings'>;
export type SavedListingInsert = TableInsert<'saved_listings'>;

// Categories
export type CategoryRow = TableRow<'categories'>;

// ─────────────────────────────────────────────────────────────────────────────
// Generic type utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Make a type nullable (T | null) */
export type Nullable<T> = T | null;

/** Deep partial — makes all nested properties optional */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Make specific keys required while keeping others unchanged */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/** Make specific keys optional while keeping others unchanged */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Extract the element type from an array type */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/** Make all properties non-nullable */
export type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/** Pick only the keys whose values match a given type */
export type PickByValue<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

/** Omit keys whose values match a given type */
export type OmitByValue<T, V> = {
  [K in keyof T as T[K] extends V ? never : K]: T[K];
};

/** Strictly typed Object.keys() return type */
export type StrictKeys<T> = (keyof T)[];

/** Create a branded/opaque type for nominal typing */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Common branded ID types */
export type UserId = Brand<string, 'UserId'>;
export type ListingId = Brand<string, 'ListingId'>;
export type DealId = Brand<string, 'DealId'>;
export type ConnectionRequestId = Brand<string, 'ConnectionRequestId'>;

/** Async function return type unwrapper */
export type AsyncReturnType<T extends (...args: unknown[]) => Promise<unknown>> =
  T extends (...args: unknown[]) => Promise<infer R> ? R : never;

/** Record with string keys and values of type T */
export type StringRecord<T = string> = Record<string, T>;

/** Ensure at least one property is provided */
export type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U];
