import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';

interface ContactResponseData {
  to: string;
  subject: string;
  content: string;
  feedbackId: string;
  userName?: string;
  category?: string;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  console.log('🚀 Contact response function invoked');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request');
    return corsPreflightResponse(req);
  }

  try {
    const requestBody = await req.json();
    console.log('📝 Request body received:', { ...requestBody, content: '[HIDDEN]' });

    const { to, subject, content, feedbackId, userName, category }: ContactResponseData =
      requestBody;

    if (!to || !subject || !content) {
      console.error('❌ Missing required fields:', {
        to: !!to,
        subject: !!subject,
        content: !!content,
      });
      throw new Error('Missing required fields: to, subject, or content');
    }

    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    if (!brevoApiKey) {
      console.error('❌ BREVO_API_KEY not configured');
      throw new Error('BREVO_API_KEY not configured');
    }

    console.log('📧 Preparing email for category:', category);

    // Create email content based on category
    let emailHtml = '';
    let emailSubject = subject;

    if (category === 'contact') {
      emailSubject = `Thank you for your message${userName ? `, ${userName}` : ''}`;
      emailHtml = `Hello${userName ? ` ${userName}` : ''},

Thank you for reaching out to us! We have received your message and our team will get back to you within 24 hours.

Your message:
"${content}"

In the meantime, feel free to explore our marketplace and discover great business opportunities.

Best regards,
The SourcecodeAls Team

---
This is an automated response. Please do not reply to this email.`;
    } else {
      // Create contextual emails for different categories
      const getEmailContent = (category: string) => {
        switch (category) {
          case 'bug':
            return {
              subject: `Thank you for reporting a bug${userName ? `, ${userName}` : ''}`,
              title: 'Thank You for Reporting a Bug!',
              mainText:
                'Thank you for helping us improve our platform by reporting this bug! Your report has been received and our development team will investigate the issue.',
              followUpText:
                "We take all bug reports seriously and work quickly to fix issues. We'll keep you updated on the progress.",
              borderColor: '#dc3545',
              backgroundColor: '#fff5f5',
            };
          case 'feature':
            return {
              subject: `Thank you for your feature suggestion${userName ? `, ${userName}` : ''}`,
              title: 'Thank You for Your Feature Request!',
              mainText:
                'Thank you for sharing your feature suggestion! Your request has been received and will be reviewed by our product team.',
              followUpText:
                "We value your input and use it to prioritize new features. We'll consider your suggestion for future updates.",
              borderColor: '#6f42c1',
              backgroundColor: '#f8f5ff',
            };
          case 'ui':
            return {
              subject: `Thank you for your UI feedback${userName ? `, ${userName}` : ''}`,
              title: 'Thank You for Your UI Feedback!',
              mainText:
                'Thank you for helping us improve the user experience! Your UI feedback has been received and will be reviewed by our design team.',
              followUpText:
                'Your insights help us create a better, more intuitive platform for everyone. We appreciate your attention to detail.',
              borderColor: '#fd7e14',
              backgroundColor: '#fff8f0',
            };
          case 'general':
          default:
            return {
              subject: `Thank you for your feedback${userName ? `, ${userName}` : ''}`,
              title: 'Thank You for Your Feedback!',
              mainText:
                'Thank you for your valuable feedback! Your submission has been received and is being reviewed by our team.',
              followUpText:
                "We take all feedback seriously and use it to improve our platform. If your feedback requires a response, we'll get back to you soon.",
              borderColor: '#28a745',
              backgroundColor: '#f8fff9',
            };
        }
      };

      const emailContent = getEmailContent(category || 'general');
      emailSubject = emailContent.subject;

      emailHtml = `Hello${userName ? ` ${userName}` : ''},

${emailContent.mainText}

Your ${category || 'feedback'}:
"${content}"

${emailContent.followUpText}

Best regards,
The SourcecodeAls Team

---
This is an automated response. Please do not reply to this email.`;
    }

    console.log('📬 Sending email via Brevo API...');

    // Send email using Brevo API
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        to: [{ email: to }],
        sender: {
          email: Deno.env.get('NOREPLY_EMAIL') || 'noreply@sourcecodeals.com',
          name: 'SourcecodeAls Team',
        },
        subject: emailSubject,
        textContent: emailHtml,
        tags: ['contact-response', category || 'feedback'],
        // Disable click tracking for consistency
        params: {
          trackClicks: false,
          trackOpens: true,
        },
      }),
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('❌ Brevo API error response:', errorData);
      console.error('❌ Brevo API status:', emailResponse.status, emailResponse.statusText);
      await logEmailDelivery(supabase, {
        email: to,
        emailType: 'contact_response',
        status: 'failed',
        correlationId: crypto.randomUUID(),
        errorMessage: `${emailResponse.statusText} - ${errorData}`,
      });
      throw new Error(`Failed to send email via Brevo: ${emailResponse.statusText} - ${errorData}`);
    }

    const result = await emailResponse.json();
    console.log('✅ Email sent successfully via Brevo:', result);

    await logEmailDelivery(supabase, {
      email: to,
      emailType: 'contact_response',
      status: 'sent',
      correlationId: crypto.randomUUID(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId,
        feedbackId,
        emailSent: true,
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
    console.error('💥 Critical error in send-contact-response function:', error);
    console.error('🔍 Error stack:', error.stack);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error) || 'Unknown error occurred',
        success: false,
        details: error.stack || 'No stack trace available',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  }
});
