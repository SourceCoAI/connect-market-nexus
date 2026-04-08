import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { stale_threshold_days = 7, critical_threshold_days = 14 } = await req
      .json()
      .catch(() => ({}));

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - stale_threshold_days);
    const criticalDate = new Date();
    criticalDate.setDate(criticalDate.getDate() - critical_threshold_days);

    // Find potentially stale deals — fetch all active deals and check per-deal cadence
    const { data: staleDeals } = await supabase
      .from('deal_pipeline')
      .select(
        'id, title, assigned_to, stage_id, last_activity_at, follow_up_cadence_days, listing:listings!listing_id(internal_company_name)',
      )
      .lt('last_activity_at', staleDate.toISOString())
      .not('stage_id', 'is', null)
      .order('last_activity_at', { ascending: true })
      .limit(100);

    if (!staleDeals?.length) {
      return new Response(JSON.stringify({ message: 'No stale deals found', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter out closed deals by checking stage
    const { data: closedStages } = await supabase
      .from('deal_stages')
      .select('id')
      .or('name.ilike.%closed%,name.ilike.%lost%,name.ilike.%won%');

    const closedStageIds = new Set((closedStages || []).map((s) => s.id));
    const activeStaleDeals = staleDeals.filter((d) => !closedStageIds.has(d.stage_id));

    let tasksCreated = 0;
    let criticalCount = 0;

    for (const deal of activeStaleDeals) {
      const daysSinceActivity = Math.floor(
        (Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      // Use per-deal cadence if set, otherwise fall back to global threshold
      const dealCadence = (deal as any).follow_up_cadence_days || stale_threshold_days;
      if (daysSinceActivity < dealCadence) continue; // Not stale per this deal's cadence
      const isCritical = daysSinceActivity >= dealCadence * 2;
      const companyName = (deal.listing as any)?.internal_company_name || deal.title || 'Unknown';

      // Check if we already created a stale-deal task recently (avoid duplicates)
      const recentCutoff = new Date();
      recentCutoff.setDate(recentCutoff.getDate() - 3);
      const { data: existingTask } = await supabase
        .from('daily_standup_tasks')
        .select('id')
        .eq('deal_id', deal.id)
        .eq('generation_source', 'stale_deal')
        .gte('created_at', recentCutoff.toISOString())
        .limit(1)
        .maybeSingle();

      if (existingTask) continue;

      // Create re-engagement task
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (isCritical ? 1 : 2));

      await supabase.from('daily_standup_tasks').insert({
        title: `${isCritical ? 'CRITICAL: ' : ''}Re-engage: ${companyName} (${daysSinceActivity}d inactive)`,
        description: `This deal has had no activity for ${daysSinceActivity} days. Please review and take action or update the status.`,
        task_type: 'follow_up_with_buyer',
        status: 'pending',
        priority: isCritical ? 'high' : 'medium',
        priority_score: isCritical ? 80 : 50,
        due_date: dueDate.toISOString().split('T')[0],
        entity_type: 'deal',
        entity_id: deal.id,
        deal_id: deal.id,
        assignee_id: deal.assigned_to,
        auto_generated: true,
        generation_source: 'stale_deal',
        source: 'system',
      });

      // Log to deal_activities
      await supabase.rpc('log_deal_activity', {
        p_deal_id: deal.id,
        p_activity_type: 'stale_deal_flagged',
        p_title: `Deal flagged as ${isCritical ? 'critically ' : ''}stale (${daysSinceActivity}d inactive)`,
        p_description: 'Auto-created re-engagement task for deal owner',
        p_admin_id: null,
        p_metadata: { days_inactive: daysSinceActivity, is_critical: isCritical },
      });

      tasksCreated++;
      if (isCritical) criticalCount++;

      // Notify deal owner for critical deals
      if (isCritical && deal.assigned_to) {
        await supabase.from('user_notifications').insert({
          user_id: deal.assigned_to,
          notification_type: 'stale_deal_flagged',
          title: `Deal going cold: ${companyName}`,
          message: `No activity in ${daysSinceActivity} days. A re-engagement task has been created.`,
          metadata: { deal_id: deal.id, days_inactive: daysSinceActivity },
        });
      }
    }

    console.log(
      `Stale deal detection complete: ${activeStaleDeals.length} stale, ${tasksCreated} tasks created, ${criticalCount} critical`,
    );

    return new Response(
      JSON.stringify({
        message: 'Stale deal detection complete',
        stale_deals_found: activeStaleDeals.length,
        tasks_created: tasksCreated,
        critical_count: criticalCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('detect-stale-deals error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
