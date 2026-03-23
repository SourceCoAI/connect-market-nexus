import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const {
      buyerId: _buyerId,
      buyerName,
      peFirmName,
      fitReasoning,
      compositeScore,
      deal,
      contactName,
    } = await req.json();

    console.log(`Generating intro email for buyer: ${buyerName}, deal: ${deal?.title}`);

    if (!OPENAI_API_KEY) {
      // Fallback template if no API key
      console.log('No OpenAI API key configured, using template');
      return new Response(
        JSON.stringify({
          subject: `Introduction: ${deal?.title || 'Acquisition Opportunity'}`,
          body: generateFallbackEmail(buyerName, peFirmName, deal, contactName, fitReasoning),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Generate personalized email with OpenAI
    const prompt = `You are an M&A advisor writing a professional introduction email to a potential buyer.

BUYER INFORMATION:
- Company: ${buyerName}
${peFirmName ? `- PE Firm: ${peFirmName}` : ''}
${contactName ? `- Contact: ${contactName}` : ''}
- Match Score: ${compositeScore}/100
- Why they match: ${fitReasoning || 'Strong fit based on acquisition criteria'}

DEAL INFORMATION:
- Business: ${deal?.title || 'Confidential Opportunity'}
${deal?.location ? `- Location: ${deal.location}` : ''}
${deal?.revenue ? `- Revenue: $${(deal.revenue / 1000000).toFixed(1)}M` : ''}
${deal?.ebitda ? `- EBITDA: $${(deal.ebitda / 1000000).toFixed(1)}M` : ''}
${deal?.category ? `- Industry: ${deal.category}` : ''}
${deal?.description ? `- Overview: ${deal.description}` : ''}

INSTRUCTIONS:
1. Write a concise, professional introduction email (150-200 words)
2. Reference why this opportunity aligns with their acquisition strategy
3. Include a clear call-to-action for a brief call
4. Be direct and respectful of their time
5. Do not include placeholder text like [Your Name] - just end with "Best regards"
6. Focus on value proposition, not generic sales language

Respond with JSON in this exact format:
{
  "subject": "Brief subject line",
  "body": "Full email body text"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert M&A advisor. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const completion = await response.json();
    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    // Parse the JSON response
    let emailData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        emailData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      // Use fallback
      emailData = {
        subject: `Introduction: ${deal?.title || 'Acquisition Opportunity'}`,
        body: generateFallbackEmail(buyerName, peFirmName, deal, contactName, fitReasoning),
      };
    }

    console.log(`Successfully generated email for ${buyerName}`);

    return new Response(JSON.stringify(emailData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating buyer intro email:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        error: message,
        subject: 'Introduction: Acquisition Opportunity',
        body: 'An error occurred generating the email. Please try again.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

function generateFallbackEmail(
  buyerName: string,
  peFirmName: string | undefined,
  deal: Record<string, unknown> | undefined,
  contactName: string | undefined,
  fitReasoning: string | undefined,
): string {
  const greeting = contactName ? `Dear ${contactName},` : `Dear ${buyerName} Team,`;
  const dealTitle = (deal?.title as string) || 'a compelling acquisition opportunity';
  const location = deal?.location ? ` based in ${deal.location}` : '';
  const revenueVal = deal?.revenue as number | undefined;
  const revenue = revenueVal ? `$${(revenueVal / 1000000).toFixed(1)}M in revenue` : '';

  return `${greeting}

I hope this message finds you well. I wanted to reach out regarding ${dealTitle}${location} that I believe aligns closely with your investment criteria.

${revenue ? `The business generates ${revenue} and ` : 'The business '}represents a strong platform opportunity in the ${(deal?.category as string) || 'industry'}.

${fitReasoning ? `Based on our analysis, this opportunity stands out because: ${fitReasoning}` : 'We believe this would be an excellent addition to your portfolio.'}

Would you have 15-20 minutes this week or next for a brief call to discuss? I'd be happy to provide additional details and answer any initial questions.

Best regards`;
}
