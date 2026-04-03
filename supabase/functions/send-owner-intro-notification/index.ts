import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';
interface OwnerIntroRequest {
  dealId: string;
  listingId: string;
  buyerName: string;
  buyerEmail: string;
  buyerCompany?: string;
  dealValue?: number;
  dealTitle: string;
  dealOwnerName?: string;
  dealOwnerEmail?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const {
      dealId,
      listingId,
      buyerName,
      buyerEmail,
      buyerCompany,
      dealValue,
      dealTitle: _dealTitle,
      dealOwnerName,
      dealOwnerEmail,
    }: OwnerIntroRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for recent notifications (last 5 minutes) to prevent duplicates
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentNotif } = await supabase
      .from('owner_intro_notifications')
      .select('id, created_at')
      .eq('deal_id', dealId)
      .gte('created_at', fiveMinutesAgo)
      .maybeSingle();

    if (recentNotif) {
      console.log('Notification already sent recently, skipping duplicate');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Notification already sent recently',
          duplicate: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch deal with listing and both owners in ONE efficient query
    const { data: deal, error: dealError } = await supabase
      .from('deal_pipeline')
      .select(
        `
        id,
        title,
        listing:listings!deals_listing_id_fkey (
          id,
          title,
          internal_company_name,
          primary_owner_id,
          primary_owner:profiles!listings_primary_owner_id_fkey (
            id,
            email,
            first_name,
            last_name
          )
        ),
        deal_owner:profiles!deals_assigned_to_fkey (
          id,
          email,
          first_name,
          last_name
        )
      `,
      )
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      console.error('Error fetching deal:', dealError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Deal not found or error fetching deal data',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const listing = Array.isArray(deal.listing) ? deal.listing[0] : deal.listing;

    if (!listing) {
      console.error('Deal is not linked to a listing');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This deal is not linked to a listing',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validate primary owner exists on listing
    if (!listing.primary_owner_id || !listing.primary_owner) {
      console.log('No primary owner assigned to listing, cannot send notification');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No primary owner configured for this listing',
          message: 'The listing needs a primary owner to receive introduction emails',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Handle primary_owner which could be an array or single object from the join
    const primaryOwnerData = Array.isArray(listing.primary_owner)
      ? listing.primary_owner[0]
      : listing.primary_owner;
    const ownerName = `${primaryOwnerData.first_name} ${primaryOwnerData.last_name}`.trim();
    const companyName = listing.internal_company_name || listing.title;

    // Format deal value
    const dealValueText = dealValue
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(dealValue)
      : 'Not specified';

    const subject = `🤝 Owner Intro Requested: ${buyerName} → ${companyName}`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; border-radius: 8px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: #94a3b8; margin: 0 0 8px 0; text-transform: uppercase;">SOURCECO PIPELINE</div>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; line-height: 1.3;">Owner Introduction Requested</h1>
          <p style="color: #cbd5e1; font-size: 14px; margin: 8px 0 0 0;">A qualified buyer is ready to speak with the owner</p>
        </div>
        
        <!-- Alert Box -->
        <div style="background: #fffbeb; border-left: 4px solid #d7b65c; padding: 20px 24px; border-radius: 4px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px 0; color: #78350f; font-weight: 600; font-size: 15px;">
            Hi ${ownerName},
          </p>
          <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
            ${dealOwnerName || 'Your deal owner'} has coordinated an introduction with <strong>${buyerName}</strong> from ${buyerCompany || 'a qualified firm'}. The buyer is ready to speak with the owner of <strong>${companyName}</strong>.
          </p>
        </div>

        <!-- Buyer Information -->
        <div style="background: #f8fafc; padding: 24px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Buyer Information</h2>
          
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Name</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${buyerName}</td>
            </tr>
          </table>

          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Email</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${buyerEmail}</td>
            </tr>
          </table>

          ${
            buyerCompany
              ? `
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Company</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${buyerCompany}</td>
            </tr>
          </table>
          `
              : ''
          }

          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Deal Value</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${dealValueText}</td>
            </tr>
          </table>
        </div>

        <!-- Company Information -->
        <div style="background: #f8fafc; padding: 24px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Company Details</h2>
          
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Listing Title</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${listing.title}</td>
            </tr>
          </table>

          ${
            companyName !== listing.title
              ? `
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Real Company Name</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${companyName}</td>
            </tr>
          </table>
          `
              : ''
          }

          ${
            dealOwnerName
              ? `
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Deal Owner</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">
                ${dealOwnerName}
                ${dealOwnerEmail ? `<span style="color: #64748b; font-weight: 400;"> • ${dealOwnerEmail}</span>` : ''}
              </td>
            </tr>
          </table>
          `
              : ''
          }
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}" 
             style="background-color: #d7b65c; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; text-align: center; display: inline-block; padding: 14px 40px; border-radius: 6px; box-shadow: 0 2px 8px rgba(215, 182, 92, 0.25);">
            View Deal in Pipeline
          </a>
        </div>

        <!-- Next Steps -->
        <div style="background: #fffbeb; padding: 24px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #fde68a;">
          <h3 style="margin: 0 0 12px 0; color: #78350f; font-size: 15px; font-weight: 700;">📋 Next Steps</h3>
          <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.7;">
            <li style="margin-bottom: 8px;">
              <strong>${dealOwnerName || 'Your deal owner'}</strong> will coordinate the introduction timing and logistics
            </li>
            <li style="margin-bottom: 8px;">
              Review the buyer's qualifications and background in the pipeline
            </li>
            <li style="margin-bottom: 8px;">
              Prepare any key materials or talking points for the owner conversation
            </li>
            <li style="margin-bottom: 0;">
              Reach out to ${dealOwnerName || 'your deal owner'} if you have questions or need more context
            </li>
          </ul>
        </div>

        <!-- Additional Context -->
        <div style="background: #f8fafc; padding: 20px 24px; border-radius: 6px; margin-bottom: 24px; border-left: 3px solid #cbd5e1;">
          <p style="margin: 0 0 8px 0; color: #0f172a; font-size: 13px; font-weight: 600;">💡 Context</p>
          <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
            This buyer has been qualified by our team and has expressed strong interest in ${companyName}. 
            They've signed all necessary agreements and are ready for substantive discussions.
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding: 24px 0; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 12px;">
            SourceCo Deals • M&A Advisory Platform
          </p>
          <p style="margin: 0; color: #cbd5e1; font-size: 11px;">
            This is an automated notification from your SourceCo pipeline
          </p>
        </div>
      </div>
    `;

    console.log('Sending owner intro notification to:', primaryOwnerData.email);

    const correlationId = crypto.randomUUID();

    const result = await sendViaBervo({
      to: primaryOwnerData.email,
      toName: ownerName,
      subject,
      htmlContent,
      senderName: 'SourceCo Notifications',
    });

    if (!result.success) {
      await logEmailDelivery(supabase, {
        email: primaryOwnerData.email,
        emailType: 'owner_intro',
        status: 'failed',
        correlationId,
        errorMessage: result.error,
      });
      throw new Error(`Failed to send email: ${result.error}`);
    }

    console.log('Email sent successfully:', result.messageId);

    await logEmailDelivery(supabase, {
      email: primaryOwnerData.email,
      emailType: 'owner_intro',
      status: 'sent',
      correlationId,
    });

    // Log to database
    await supabase.from('owner_intro_notifications').insert({
      deal_id: dealId,
      listing_id: listingId,
      primary_owner_id: listing.primary_owner_id,
      email_status: 'sent',
      metadata: {
        message_id: result.messageId,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        email_subject: subject,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Owner intro notification sent successfully',
        primary_owner_name: ownerName,
        message_id: result.messageId,
        recipient: primaryOwnerData.email,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-owner-intro-notification:', error);

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
