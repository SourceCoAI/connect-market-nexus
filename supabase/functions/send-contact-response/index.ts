import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

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

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const requestBody = await req.json();
    const { to, subject, content, feedbackId, userName, category }: ContactResponseData =
      requestBody;

    if (!to || !subject || !content) {
      throw new Error('Missing required fields: to, subject, or content');
    }

    // Create email content based on category
    let emailText = '';
    let emailSubject = subject;

    if (category === 'contact') {
      emailSubject = `Thank you for your message${userName ? `, ${userName}` : ''}`;
      emailText = `Hello${userName ? ` ${userName}` : ''},\n\nThank you for reaching out to us! We have received your message and our team will get back to you within 24 hours.\n\nYour message:\n"${content}"\n\nIn the meantime, feel free to explore our marketplace and discover great business opportunities.\n\nBest regards,\nThe SourceCo Team`;
    } else {
      const getEmailContent = (cat: string) => {
        switch (cat) {
          case 'bug':
            return { subject: `Thank you for reporting a bug${userName ? `, ${userName}` : ''}`, mainText: 'Thank you for helping us improve our platform by reporting this bug!' };
          case 'feature':
            return { subject: `Thank you for your feature suggestion${userName ? `, ${userName}` : ''}`, mainText: 'Thank you for sharing your feature suggestion!' };
          case 'ui':
            return { subject: `Thank you for your UI feedback${userName ? `, ${userName}` : ''}`, mainText: 'Thank you for helping us improve the user experience!' };
          default:
            return { subject: `Thank you for your feedback${userName ? `, ${userName}` : ''}`, mainText: 'Thank you for your valuable feedback!' };
        }
      };

      const emailContent = getEmailContent(category || 'general');
      emailSubject = emailContent.subject;
      emailText = `Hello${userName ? ` ${userName}` : ''},\n\n${emailContent.mainText}\n\nYour ${category || 'feedback'}:\n"${content}"\n\nBest regards,\nThe SourceCo Team`;
    }

    const result = await sendViaBervo({
      to,
      subject: emailSubject,
      htmlContent: `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${emailText}</div>`,
      textContent: emailText,
      senderName: 'SourceCo Team',
      isTransactional: true,
    });

    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId,
        feedbackId,
        emailSent: true,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-contact-response function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        success: false,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
});
