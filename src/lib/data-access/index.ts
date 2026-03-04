/**
 * Data Access Layer
 *
 * Typed, domain-specific query functions that centralize all database access.
 * Built on top of the generic helpers in `@/lib/database`.
 *
 * Usage:
 *   import { getActiveListings, getListingById } from '@/lib/data-access';
 *
 * Why this exists:
 *   Instead of 800+ scattered `.from('listings').select(...)` calls throughout
 *   hooks and components, all queries go through these typed functions. When a
 *   column name changes or a table is restructured, you only update one file.
 *
 * Adding new queries:
 *   1. Add the function to the appropriate domain module (listings.ts, buyers.ts, etc.)
 *   2. Re-export it from this index file
 *   3. Update the hook that currently uses a raw `.from()` call to use the new function
 */

export * from './listings';
export * from './buyers';
export * from './deals';
export * from './contacts';
export * from './agreements';
export * from './admin';
export * from './types';
