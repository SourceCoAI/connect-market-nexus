import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface DataRecoveryEmailRequest { userIds: string[]; template: string; }

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userIds, template }: DataRecoveryEmailRequest = await req.json();
    const { data: users, error: usersError } = await supabase
      .from('profiles').select('id, email, first_name, last_name, buyer_type').in('id', userIds);

    if (usersError) throw new Error('Failed to fetch user data');
    if (!users || users.length === 0) throw new Error('No users found for the provided IDs');

    const emailPromises = users.map(async (user) => {
      try {
        const result = await sendEmail({
          templateName: 'data_recovery',
          to: user.email,
          toName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          subject: 'Complete Your Profile - Missing Information',
          htmlContent: wrapEmailHtml({
            bodyHtml: `
              <p>Hi ${escapeHtml(user.first_name || 'there')},</p>
              <p>Some important information is missing from your profile. Please take a moment to complete it so we can match you with relevant deals.</p>
              ${escapeHtml(template)}
              <div style="text-align: center; margin: 28px 0;">
                <a href="https://marketplace.sourcecodeals.com/profile" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Complete Profile</a>
              </div>
              <p style="color: #6B6B6B;">The SourceCo Team</p>`,
            preheader: 'Complete your SourceCo profile',
            recipientEmail: user.email,
          }),
          senderName: 'SourceCo',
          isTransactional: true,
        });

        if (!result.success) throw new Error(result.error || 'Failed to send');
        return { userId: user.id, email: user.email, status: 'sent' };
      } catch (error) {
        console.error(`Failed to send email to ${user.email}:`, error);
        return { userId: user.id, email: user.email, status: 'failed', error: error instanceof Error ? error.message : String(error) };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r) => r.status === 'sent').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    return new Response(JSON.stringify({ success: true, totalEmails: userIds.length, successCount, failedCount, results }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('Error in send-data-recovery-email function:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

serve(handler);
