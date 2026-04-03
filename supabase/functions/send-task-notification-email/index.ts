import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface TaskNotificationRequest {
  assignee_email: string;
  assignee_name: string;
  assigner_name: string;
  task_title: string;
  task_description?: string;
  task_priority: string;
  task_due_date?: string;
  deal_title: string;
  deal_id: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const {
      assignee_email, assignee_name, assigner_name, task_title, task_description,
      task_priority, task_due_date, deal_title, deal_id,
    }: TaskNotificationRequest = await req.json();

    console.log('Sending task notification email to:', assignee_email);

    const dueDateFormatted = task_due_date
      ? new Date(task_due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    const emailHtml = wrapEmailHtml({
      bodyHtml: `
        <p>Hi ${assignee_name},</p>
        <p>${assigner_name} assigned you a new task.</p>
        <div style="background: #F7F6F3; padding: 24px; margin: 24px 0;">
          <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600;">${task_title}</p>
          <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Priority: ${task_priority.toUpperCase()}</p>
          <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Deal: ${deal_title}</p>
          ${dueDateFormatted ? `<p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Due: ${dueDateFormatted}</p>` : ''}
          ${task_description ? `<p style="margin: 12px 0 0; font-size: 14px; color: #6B6B6B;">${task_description}</p>` : ''}
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${deal_id}&tab=tasks" style="display: inline-block; padding: 14px 28px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">View Task in Pipeline</a>
        </div>`,
      preheader: `New task assigned: ${task_title}`,
      recipientEmail: assignee_email,
    });

    const textContent = `Hi ${assignee_name},\n\n${assigner_name} has assigned you a new task:\n\nTask: ${task_title}\nPriority: ${task_priority.toUpperCase()}\n${task_description ? `Description: ${task_description}\n` : ''}Deal: ${deal_title}\n${dueDateFormatted ? `Due Date: ${dueDateFormatted}\n` : ''}\nView this task: https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${deal_id}&tab=tasks`;

    const result = await sendEmail({
      templateName: 'task_notification',
      to: assignee_email,
      toName: assignee_name,
      subject: `New Task Assigned: ${task_title}`,
      htmlContent: emailHtml,
      textContent,
      senderName: 'SourceCo',
      isTransactional: true,
      metadata: { dealId: deal_id, taskTitle: task_title },
    });

    if (!result.success) {
      console.error('Email error:', result.error);
      return new Response(
        JSON.stringify({ success: true, warning: 'Email failed but notification created', error: result.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    console.log('Email sent successfully:', result.providerMessageId);

    return new Response(
      JSON.stringify({ success: true, message: 'Email notification sent', messageId: result.providerMessageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('Error sending task notification email:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to send notification' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
