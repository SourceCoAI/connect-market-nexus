import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import React from 'react';
import { renderAsync } from '@react-email/components';
import { DealOwnerChangeEmail } from './_templates/deal-owner-change-email.tsx';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface DealOwnerChangeRequest {
  dealId: string;
  dealTitle: string;
  previousOwnerId: string;
  previousOwnerName: string;
  modifyingAdminId: string;
  modifyingAdminName: string;
  oldStageName: string;
  newStageName: string;
  listingTitle?: string;
  companyName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const {
      dealId,
      dealTitle,
      previousOwnerId,
      previousOwnerName,
      modifyingAdminId,
      modifyingAdminName,
      oldStageName,
      newStageName,
      listingTitle,
      companyName,
    }: DealOwnerChangeRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get previous owner's email
    const { data: previousOwner, error: ownerError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', previousOwnerId)
      .single();

    if (ownerError || !previousOwner) {
      console.error('Previous owner not found:', previousOwnerId);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Previous owner not found',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Use companyName passed from frontend, fallback to listingTitle
    const displayCompanyName = companyName || listingTitle || null;

    // Get modifying admin's email
    const { data: modifyingAdmin } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', modifyingAdminId)
      .single();

    const subject = `Deal Modified: ${displayCompanyName || dealTitle}`;

    // Render React Email template
    const htmlContent = await renderAsync(
      React.createElement(DealOwnerChangeEmail, {
        previousOwnerName,
        modifyingAdminName,
        modifyingAdminEmail: modifyingAdmin?.email,
        dealTitle,
        companyName: displayCompanyName || undefined,
        listingTitle,
        oldStageName,
        newStageName,
        dealId,
      }),
    );

    // Send email via shared Brevo sender
    console.log('Sending deal owner change notification to:', previousOwner.email);

    const emailResult = await sendViaBervo({
      to: previousOwner.email,
      toName: previousOwnerName,
      subject,
      htmlContent,
    });

    if (!emailResult.success) {
      throw new Error(emailResult.error || 'Failed to send email');
    }

    console.log('Deal owner notification sent successfully:', emailResult.messageId);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: emailResult.messageId,
        recipient: previousOwner.email,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    console.error('Error in notify-deal-owner-change:', error);

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
