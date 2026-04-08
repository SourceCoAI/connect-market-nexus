import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

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

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - 7);

    // Get all admin users
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('is_admin', true);

    if (!admins?.length) {
      return new Response(JSON.stringify({ message: 'No admin users found', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get closed stage IDs so we can exclude closed deals
    const { data: closedStages } = await supabase
      .from('deal_stages')
      .select('id')
      .or('name.ilike.%closed%,name.ilike.%lost%,name.ilike.%won%');
    const closedStageIds = new Set((closedStages || []).map((s) => s.id));

    let sentCount = 0;

    for (const admin of admins) {
      if (!admin.email) continue;

      const firstName = admin.first_name || 'there';

      // 1. Today's tasks for this user
      const { data: todayTasks } = await supabase
        .from('daily_standup_tasks')
        .select('id, title, priority, status, deal:deals!deal_id(title)')
        .eq('assignee_id', admin.id)
        .eq('due_date', today)
        .in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: true });

      // 2. Overdue tasks for this user
      const { data: overdueTasks } = await supabase
        .from('daily_standup_tasks')
        .select('id, title, priority, due_date, deal:deals!deal_id(title)')
        .eq('assignee_id', admin.id)
        .lt('due_date', today)
        .in('status', ['pending', 'in_progress', 'overdue'])
        .order('due_date', { ascending: true });

      // 3. Stale deals assigned to this user
      const { data: staleDeals } = await supabase
        .from('deal_pipeline')
        .select(
          'id, title, stage_id, last_activity_at, listing:listings!listing_id(internal_company_name)',
        )
        .eq('assigned_to', admin.id)
        .lt('last_activity_at', staleThreshold.toISOString())
        .not('stage_id', 'is', null)
        .order('last_activity_at', { ascending: true })
        .limit(10);

      const activeStaleDeals = (staleDeals || []).filter((d) => !closedStageIds.has(d.stage_id));

      // 4. Yesterday's standup meetings processed
      const { data: yesterdayMeetings } = await supabase
        .from('standup_meetings')
        .select('id, meeting_title, transcript_source, tasks_extracted')
        .gte('meeting_date', yesterday)
        .lt('meeting_date', today)
        .order('created_at', { ascending: false })
        .limit(5);

      // Skip sending if there's nothing to report
      const todayCount = todayTasks?.length || 0;
      const overdueCount = overdueTasks?.length || 0;
      const staleCount = activeStaleDeals.length;
      const meetingCount = yesterdayMeetings?.length || 0;

      if (todayCount === 0 && overdueCount === 0 && staleCount === 0 && meetingCount === 0) {
        continue;
      }

      // Build email sections
      let bodyHtml = `<p>Hi ${firstName},</p><p>Here is your daily digest for ${today}.</p>`;

      // Today's Tasks section
      bodyHtml += `<div style="margin: 24px 0;">`;
      bodyHtml += `<p style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">Today's Tasks (${todayCount})</p>`;
      if (todayCount > 0) {
        bodyHtml += `<div style="background: #F7F6F3; padding: 16px; border-radius: 6px;">`;
        for (const task of todayTasks!) {
          const dealName = (task.deal as any)?.title || '';
          const priorityLabel =
            task.priority === 'high' ? ' [HIGH]' : task.priority === 'urgent' ? ' [URGENT]' : '';
          bodyHtml += `<p style="margin: 4px 0; font-size: 14px;">${priorityLabel}${task.title}${dealName ? ` <span style="color: #9B9B9B;">- ${dealName}</span>` : ''}</p>`;
        }
        bodyHtml += `</div>`;
      } else {
        bodyHtml += `<p style="font-size: 14px; color: #9B9B9B;">No tasks due today.</p>`;
      }
      bodyHtml += `</div>`;

      // Overdue Tasks section
      if (overdueCount > 0) {
        bodyHtml += `<div style="margin: 24px 0;">`;
        bodyHtml += `<p style="font-size: 15px; font-weight: 600; margin-bottom: 8px; color: #D32F2F;">Overdue Tasks (${overdueCount})</p>`;
        bodyHtml += `<div style="background: #FFF3F3; padding: 16px; border-radius: 6px;">`;
        for (const task of overdueTasks!) {
          const dealName = (task.deal as any)?.title || '';
          bodyHtml += `<p style="margin: 4px 0; font-size: 14px;">${task.title} <span style="color: #D32F2F;">due ${task.due_date}</span>${dealName ? ` <span style="color: #9B9B9B;">- ${dealName}</span>` : ''}</p>`;
        }
        bodyHtml += `</div>`;
        bodyHtml += `</div>`;
      }

      // Stale Deals section
      if (staleCount > 0) {
        bodyHtml += `<div style="margin: 24px 0;">`;
        bodyHtml += `<p style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">Deals Needing Attention (${staleCount})</p>`;
        bodyHtml += `<div style="background: #F7F6F3; padding: 16px; border-radius: 6px;">`;
        for (const deal of activeStaleDeals) {
          const companyName =
            (deal.listing as any)?.internal_company_name || deal.title || 'Unknown';
          const daysSince = Math.floor(
            (Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24),
          );
          bodyHtml += `<p style="margin: 4px 0; font-size: 14px;">${companyName} <span style="color: #D32F2F;">${daysSince}d inactive</span></p>`;
        }
        bodyHtml += `</div>`;
        bodyHtml += `</div>`;
      }

      // Yesterday's Activity Summary
      if (meetingCount > 0) {
        const totalTasksExtracted = (yesterdayMeetings || []).reduce(
          (sum, m) => sum + (m.tasks_extracted || 0),
          0,
        );
        bodyHtml += `<div style="margin: 24px 0;">`;
        bodyHtml += `<p style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">Yesterday's Activity Summary</p>`;
        bodyHtml += `<div style="background: #F7F6F3; padding: 16px; border-radius: 6px;">`;
        bodyHtml += `<p style="margin: 4px 0; font-size: 14px;">${meetingCount} meeting(s) processed, ${totalTasksExtracted} task(s) extracted</p>`;
        for (const meeting of yesterdayMeetings!) {
          bodyHtml += `<p style="margin: 4px 0; font-size: 14px; color: #6B6B6B;">${meeting.meeting_title || 'Untitled meeting'} (${meeting.tasks_extracted || 0} tasks)</p>`;
        }
        bodyHtml += `</div>`;
        bodyHtml += `</div>`;
      }

      // CTA button
      bodyHtml += `
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline" style="display: inline-block; padding: 14px 28px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">View Pipeline</a>
        </div>`;

      const emailHtml = wrapEmailHtml({
        bodyHtml,
        preheader: `Daily digest: ${todayCount} tasks, ${overdueCount} overdue`,
        recipientEmail: admin.email,
      });

      // Build text version
      let textContent = `Hi ${firstName},\n\nDaily digest for ${today}\n\n`;
      textContent += `TODAY'S TASKS (${todayCount})\n`;
      if (todayTasks?.length) {
        for (const task of todayTasks) {
          textContent += `- ${task.title}\n`;
        }
      } else {
        textContent += 'No tasks due today.\n';
      }
      if (overdueCount > 0) {
        textContent += `\nOVERDUE TASKS (${overdueCount})\n`;
        for (const task of overdueTasks!) {
          textContent += `- ${task.title} (due ${task.due_date})\n`;
        }
      }
      if (staleCount > 0) {
        textContent += `\nDEALS NEEDING ATTENTION (${staleCount})\n`;
        for (const deal of activeStaleDeals) {
          const companyName =
            (deal.listing as any)?.internal_company_name || deal.title || 'Unknown';
          textContent += `- ${companyName}\n`;
        }
      }
      textContent += `\nView pipeline: https://marketplace.sourcecodeals.com/admin/deals/pipeline`;

      const result = await sendEmail({
        templateName: 'daily_digest',
        to: admin.email,
        toName: `${admin.first_name || ''} ${admin.last_name || ''}`.trim(),
        subject: `Daily Digest: ${todayCount} tasks, ${overdueCount} overdue`,
        htmlContent: emailHtml,
        textContent,
        senderName: 'SourceCo',
        isTransactional: true,
        metadata: {
          userId: admin.id,
          todayTasks: todayCount,
          overdueTasks: overdueCount,
          staleDeals: staleCount,
        },
      });

      if (result.success) {
        sentCount++;
      } else {
        console.error(`Failed to send digest to ${admin.email}:`, result.error);
      }
    }

    console.log(`Daily digest sent to ${sentCount}/${admins.length} admin users`);

    return new Response(
      JSON.stringify({
        message: 'Daily digest complete',
        admins_found: admins.length,
        emails_sent: sentCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('send-daily-digest error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
