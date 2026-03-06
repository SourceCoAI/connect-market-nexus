import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { Resend } from 'resend';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface DataRecoveryEmailRequest {
  userIds: string[];
  template: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // AUTH: Admin-only — sends data recovery emails to users
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userIds, template }: DataRecoveryEmailRequest = await req.json();

    console.log(`Processing data recovery emails for ${userIds.length} users`);

    // Get user data for the specified user IDs
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, buyer_type')
      .in('id', userIds);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw new Error('Failed to fetch user data');
    }

    if (!users || users.length === 0) {
      throw new Error('No users found for the provided IDs');
    }

    const emailPromises = users.map(async (user) => {
      try {
        const emailResponse = await resend.emails.send({
          from: `Data Recovery <${Deno.env.get('NOREPLY_EMAIL') || 'noreply@sourcecodeals.com'}>`,
          to: [user.email],
          subject: 'Complete Your Profile - Missing Information',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Complete Your Profile</h2>
              
              <p>Hi ${escapeHtml(user.first_name || 'there')},</p>

              <p>We noticed that some important information is missing from your profile. To ensure you receive relevant opportunities and maintain your account in good standing, please complete the missing fields.</p>

              ${escapeHtml(template)}
              
              <div style="margin: 30px 0;">
                <a href="${supabaseUrl.replace('.supabase.co', '')}.lovableapp.com/profile" 
                   style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  Complete Profile Now
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                If you have any questions, please don't hesitate to contact our support team.
              </p>
              
              <p style="color: #666; font-size: 14px;">
                Best regards,<br>
                The Support Team
              </p>
            </div>
          `,
        });

        console.log(`Email sent successfully to ${user.email}:`, emailResponse);

        // Log the email delivery
        await supabase.from('email_delivery_logs').insert({
          email: user.email,
          email_type: 'data_recovery',
          status: 'sent',
          correlation_id: `recovery_${user.id}_${Date.now()}`,
        });

        return { userId: user.id, email: user.email, status: 'sent' };
      } catch (error) {
        console.error(`Failed to send email to ${user.email}:`, error);

        // Log the failed delivery
        await supabase.from('email_delivery_logs').insert({
          email: user.email,
          email_type: 'data_recovery',
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          correlation_id: `recovery_${user.id}_${Date.now()}`,
        });

        return {
          userId: user.id,
          email: user.email,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r) => r.status === 'sent').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    console.log(`Data recovery campaign completed: ${successCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        totalEmails: userIds.length,
        successCount,
        failedCount,
        results,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-data-recovery-email function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

serve(handler);
