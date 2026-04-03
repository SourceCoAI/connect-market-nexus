import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email-sender.ts";
import { wrapEmailHtml } from "../_shared/email-template-wrapper.ts";

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface AdminNotificationRequest {
  first_name: string;
  last_name: string;
  email: string;
  company: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
    });
    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { user_id: callerUser.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { first_name, last_name, email, company }: AdminNotificationRequest = await req.json();
    const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'admin@sourcecodeals.com';

    console.log(`Sending admin notification for new user: ${email}`);

    const htmlContent = wrapEmailHtml({
      bodyHtml: `
        <h2 style="margin-bottom: 16px;">New User Registration</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1a1a2e; margin-top: 0;">User Details</h3>
          <p><strong>Name:</strong> ${escapeHtml(first_name || '')} ${escapeHtml(last_name || '')}</p>
          <p><strong>Email:</strong> ${escapeHtml(email || '')}</p>
          <p><strong>Company:</strong> ${escapeHtml(company || '') || 'Not provided'}</p>
          <p><strong>Registration Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;"><strong>Action Required:</strong> Please review and approve/reject this user registration in the admin panel.</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${req.headers.get('origin')}/admin/marketplace/users" style="background-color: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Review User Registration</a>
        </div>
      `,
      preheader: `New user registration: ${first_name} ${last_name} (${email})`,
      recipientEmail: adminEmail,
    });

    const result = await sendEmail({
      templateName: 'admin_new_user_notification',
      to: adminEmail,
      subject: "New User Registration - Action Required",
      htmlContent,
      senderName: 'Admin Notifications',
      isTransactional: true,
      metadata: { userEmail: email, userName: `${first_name} ${last_name}` },
    });

    if (!result.success) {
      console.error("Email delivery failed:", result.error);
      return new Response(
        JSON.stringify({ error: "Failed to send admin notification", warning: "User registration successful but admin was not notified" }),
        { status: 207, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.log("Admin notification sent successfully via sendEmail");

    return new Response(
      JSON.stringify({ success: true, message: "Admin notification sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error("Error in enhanced-admin-notification function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
