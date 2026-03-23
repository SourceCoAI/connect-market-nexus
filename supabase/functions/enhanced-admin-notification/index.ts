
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

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
    // ── Auth guard: require valid JWT + admin role ──
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
    // ── End auth guard ──

    const { first_name, last_name, email, company }: AdminNotificationRequest = await req.json();

    // N08 FIX: Use env var for admin notification email instead of hardcoded address
    const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'admin@sourcecodeals.com';

    console.log(`Sending admin notification for new user: ${email}`);

    // Enhanced retry logic for email delivery
    let emailSent = false;
    let retryCount = 0;
    const maxRetries = 3;
    const providers = ['resend', 'brevo'];

    for (const provider of providers) {
      if (emailSent) break;
      
      retryCount = 0;
      while (!emailSent && retryCount < maxRetries) {
        try {
          let response;
          
          if (provider === 'resend') {
            const resendApiKey = Deno.env.get("RESEND_API_KEY");
            if (!resendApiKey) {
              console.log("Resend API key not found, trying next provider");
              break;
            }
            
            response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: adminEmail,
                to: [adminEmail],
                subject: "New User Registration - Action Required",
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">New User Registration</h2>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h3 style="color: #007bff; margin-top: 0;">User Details</h3>
                      <p><strong>Name:</strong> ${escapeHtml(first_name || '')} ${escapeHtml(last_name || '')}</p>
                      <p><strong>Email:</strong> ${escapeHtml(email || '')}</p>
                      <p><strong>Company:</strong> ${escapeHtml(company || '') || 'Not provided'}</p>
                      <p><strong>Registration Time:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0; color: #856404;"><strong>Action Required:</strong> Please review and approve/reject this user registration in the admin panel.</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${req.headers.get('origin')}/admin/marketplace/users"
                         style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                        Review User Registration
                      </a>
                    </div>
                    <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
                      This is an automated notification from your application's user registration system.
                    </p>
                  </div>
                `,
              }),
            });
          } else if (provider === 'brevo') {
            const brevoApiKey = Deno.env.get("BREVO_API_KEY");
            if (!brevoApiKey) {
              console.log("Brevo API key not found, trying next provider");
              break;
            }
            
            response = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: {
                "api-key": brevoApiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sender: {
                  name: "Admin Notifications",
                  email: adminEmail
                },
                to: [{ email: adminEmail, name: "Admin" }],
                subject: "New User Registration - Action Required",
                htmlContent: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">New User Registration</h2>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h3 style="color: #007bff; margin-top: 0;">User Details</h3>
                      <p><strong>Name:</strong> ${escapeHtml(first_name || '')} ${escapeHtml(last_name || '')}</p>
                      <p><strong>Email:</strong> ${escapeHtml(email || '')}</p>
                      <p><strong>Company:</strong> ${escapeHtml(company || '') || 'Not provided'}</p>
                      <p><strong>Registration Time:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0; color: #856404;"><strong>Action Required:</strong> Please review and approve/reject this user registration in the admin panel.</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${req.headers.get('origin')}/admin/marketplace/users"
                         style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                        Review User Registration
                      </a>
                    </div>
                    <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
                      This is an automated notification from your application's user registration system.
                    </p>
                  </div>
                `,
              }),
            });
          }

          if (response && response.ok) {
            console.log(`Admin notification sent successfully via ${provider}`);
            emailSent = true;
            break;
          } else {
            retryCount++;
            console.error(`${provider} attempt ${retryCount} failed:`, response ? await response.text() : 'No response');
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
          }
        } catch (error) {
          retryCount++;
          console.error(`${provider} attempt ${retryCount} error:`, error);
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }
    }

    if (!emailSent) {
      console.error("All email delivery attempts failed");
      return new Response(
        JSON.stringify({ 
          error: "Failed to send admin notification",
          warning: "User registration successful but admin was not notified"
        }),
        {
          status: 207, // Multi-status: partial success
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Admin notification sent successfully" 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: unknown) {
    console.error("Error in enhanced-admin-notification function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
