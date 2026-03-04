/**
 * Admin Data Access
 *
 * Admin-specific queries including view state tracking,
 * notification counts, and admin-only data access.
 */

import { supabase } from '@/integrations/supabase/client';
import { safeQuery, type DatabaseResult } from '@/lib/database';
import type { AdminViewState } from './types';

type ViewType = 'connection_requests' | 'deal_sourcing' | 'owner_leads' | 'users';

/**
 * Get the last viewed timestamp for a specific admin view.
 * Works with both the legacy individual tables and the new unified table.
 */
export async function getAdminLastViewed(
  adminId: string,
  viewType: ViewType,
): Promise<DatabaseResult<AdminViewState>> {
  return safeQuery(async () => {
    return supabase
      .from('admin_view_state')
      .select('view_type, last_viewed_at')
      .eq('admin_id', adminId)
      .eq('view_type', viewType)
      .single();
  });
}

/**
 * Mark an admin view as viewed (upsert).
 */
export async function markAdminViewAsViewed(
  adminId: string,
  viewType: ViewType,
): Promise<DatabaseResult<AdminViewState>> {
  return safeQuery(async () => {
    return supabase
      .from('admin_view_state')
      .upsert(
        {
          admin_id: adminId,
          view_type: viewType,
          last_viewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'admin_id,view_type' },
      )
      .select('view_type, last_viewed_at')
      .single();
  });
}

/**
 * Get all admin view states for an admin.
 */
export async function getAdminViewStates(
  adminId: string,
): Promise<DatabaseResult<AdminViewState[]>> {
  return safeQuery(async () => {
    return supabase
      .from('admin_view_state')
      .select('view_type, last_viewed_at')
      .eq('admin_id', adminId);
  });
}
