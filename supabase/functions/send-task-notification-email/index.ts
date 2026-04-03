import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';

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

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const {
      assignee_email,
      assignee_name,
      assigner_name,
      task_title,
      task_description,
      task_priority,
      task_due_date,
      deal_title,
      deal_id,
    }: TaskNotificationRequest = await req.json();

    const correlationId = crypto.randomUUID();
    console.log('Sending task notification email to:', assignee_email);

    // Format due date if provided
    const dueDateFormatted = task_due_date
      ? new Date(task_due_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

    // Priority badge color
    const priorityColor =
      {
        high: '#EF4444',
        medium: '#F59E0B',
        low: '#3B82F6',
      }[task_priority] || '#6B7280';

    // Construct email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Task Assigned</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111827;">
                📋 New Task Assigned
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151; line-height: 1.5;">
                Hi ${assignee_name},
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151; line-height: 1.5;">
                <strong>${assigner_name}</strong> has assigned you a new task:
              </p>
              
              <!-- Task Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; margin: 20px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="display: flex; align-items: center; margin-bottom: 12px;">
                      <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">
                        ${task_title}
                      </h2>
                      <span style="display: inline-block; margin-left: 12px; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #ffffff; background-color: ${priorityColor};">
                        ${task_priority}
                      </span>
                    </div>
                    
                    ${
                      task_description
                        ? `
                      <p style="margin: 12px 0 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                        ${task_description}
                      </p>
                    `
                        : ''
                    }
                    
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                        <strong style="color: #374151;">Deal:</strong> ${deal_title}
                      </p>
                      ${
                        dueDateFormatted
                          ? `
                        <p style="margin: 0; font-size: 13px; color: #6b7280;">
                          <strong style="color: #374151;">Due:</strong> ${dueDateFormatted}
                        </p>
                      `
                          : ''
                      }
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${deal_id}&tab=tasks" 
                       style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;">
                      View Task in Pipeline
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                Click the button above to view this task in the admin pipeline and get started.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
                This is an automated notification from your admin task management system.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Plain text version
    const textContent = `Hi ${assignee_name},

${assigner_name} has assigned you a new task:

Task: ${task_title}
Priority: ${task_priority.toUpperCase()}
${task_description ? `Description: ${task_description}\n` : ''}
Deal: ${deal_title}
${dueDateFormatted ? `Due Date: ${dueDateFormatted}\n` : ''}

View this task in the pipeline: https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${deal_id}&tab=tasks

---
This is an automated notification from your admin task management system.`;

    // Send via shared Brevo sender
    const { sendViaBervo } = await import('../_shared/brevo-sender.ts');

    const result = await sendViaBervo({
      to: assignee_email,
      toName: assignee_name,
      subject: `New Task Assigned: ${task_title}`,
      htmlContent: emailHtml,
      textContent: textContent,
      senderName: 'SourceCo Pipeline',
      isTransactional: true,
    });

    if (!result.success) {
      console.error('Brevo email error:', result.error);
      await logEmailDelivery(supabaseClient, {
        email: assignee_email,
        emailType: 'task_notification',
        status: 'failed',
        correlationId,
        errorMessage: result.error,
      });
      return new Response(
        JSON.stringify({
          success: true,
          warning: 'Email failed but notification created',
          error: result.error,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    console.log('Email sent successfully:', result.messageId);

    await logEmailDelivery(supabaseClient, {
      email: assignee_email,
      emailType: 'task_notification',
      status: 'sent',
      correlationId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email notification sent',
        messageId: result.messageId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Error sending task notification email:', error);
    try {
      const sbClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      await logEmailDelivery(sbClient, {
        email: 'unknown',
        emailType: 'task_notification',
        status: 'failed',
        errorMessage: String(error),
      });
    } catch (_) {
      /* logging best-effort */
    }
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to send notification',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
