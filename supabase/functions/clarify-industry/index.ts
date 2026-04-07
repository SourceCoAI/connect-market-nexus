import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  callGeminiWithTool,
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
} from '../_shared/ai-providers.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface ClarifyQuestion {
  id: string;
  question: string;
  type: 'select' | 'multiSelect' | 'text';
  options?: string[];
  placeholder?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { industry_name, industry_description, generate_description } = await req.json();

    if (!industry_name) {
      return new Response(JSON.stringify({ error: 'industry_name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GEMINI_API_KEY = getGeminiApiKey();
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Handle description generation mode
    if (generate_description) {
      const descTool = {
        type: 'function',
        function: {
          name: 'generate_description',
          description: 'Generate a buyer universe description',
          parameters: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'A 2-3 sentence buyer universe description for M&A professionals',
              },
            },
            required: ['description'],
          },
        },
      };

      const descResult = await callGeminiWithTool(
        `You are an M&A industry expert. Generate a concise 2-3 sentence description for a buyer universe focused on the given industry. The description should explain what types of buyers are included (PE firms, strategic acquirers, family offices, etc.) and what makes this space attractive for acquisitions. Be specific to the industry.`,
        `Generate a buyer universe description for: "${industry_name}"`,
        descTool,
        GEMINI_API_KEY,
        DEFAULT_GEMINI_MODEL,
        15000,
        1024,
      );

      if (descResult.data?.description) {
        return new Response(JSON.stringify({ description: descResult.data.description }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fallback
      return new Response(
        JSON.stringify({
          description: `Buyer universe targeting companies in the ${industry_name} industry. Includes PE firms, strategic acquirers, and family offices actively seeking acquisitions in this space.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const descriptionContext = industry_description
      ? `\n\nUser provided description: "${industry_description}"`
      : '';

    const systemPrompt = `You are an M&A industry expert helping clarify the scope of an industry research guide.

Given an industry name, generate 3-4 targeted clarifying questions to ensure the guide covers exactly the right segment and scope.

Questions should:
1. Disambiguate sub-segments if the industry has multiple (e.g., "residential vs commercial", "water damage vs mold") - ALWAYS use type "multiSelect" for this question since buyers often focus on multiple segments
2. Ask for 1-2 example companies or websites to calibrate the scope (text input)
3. Confirm primary geographic focus - use type "multiSelect" since buyers may target multiple regions
4. Ask an open-ended question: "Is there anything else about this industry that would be helpful for our research?" (text input)

IMPORTANT: For questions about segments/types and geography, ALWAYS use type "multiSelect" (not "select") since users typically target multiple options.

DO NOT ask about revenue ranges or company sizes - we cover all sizes.
DO NOT ask about regulatory or licensing considerations - keep it general.

Return questions as JSON matching this schema exactly.`;

    const tool = {
      type: 'function',
      function: {
        name: 'generate_questions',
        description: 'Generate clarifying questions for industry research',
        parameters: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description:
                      "Unique identifier like 'segment', 'examples', 'geography', 'size'",
                  },
                  question: { type: 'string', description: 'The question text to display' },
                  type: {
                    type: 'string',
                    enum: ['select', 'multiSelect', 'text'],
                    description:
                      'select for single choice, multiSelect for multiple, text for free-form',
                  },
                  options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Options for select/multiSelect types',
                  },
                  placeholder: { type: 'string', description: 'Placeholder text for text inputs' },
                },
                required: ['id', 'question', 'type'],
              },
            },
          },
          required: ['questions'],
        },
      },
    };

    const result = await callGeminiWithTool(
      systemPrompt,
      `Generate clarifying questions for the industry: "${industry_name}"${descriptionContext}`,
      tool,
      GEMINI_API_KEY,
      DEFAULT_GEMINI_MODEL,
      30000,
      4096,
    );

    if (result.error) {
      if (result.error.code === 'rate_limited') {
        return new Response(
          JSON.stringify({ error: 'AI service busy. Please wait 30 seconds and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(result.error.message);
    }

    let questions: ClarifyQuestion[] = (result.data?.questions as ClarifyQuestion[]) || [];

    if (questions.length === 0) {
      questions = getDefaultQuestions(industry_name);
    }

    if (!questions.find((q) => q.id === 'examples')) {
      questions.push({
        id: 'examples',
        question: `Name 1-2 example companies in the ${industry_name} space you would consider "good targets"`,
        type: 'text',
        placeholder: 'e.g., ServiceMaster, Belfor Holdings',
      });
    }

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Clarify industry error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function getDefaultQuestions(industryName: string): ClarifyQuestion[] {
  return [
    {
      id: 'segment',
      question: `Which segment of ${industryName} are you targeting?`,
      type: 'multiSelect',
      options: [
        'Full-service (all segments)',
        'Residential focused',
        'Commercial focused',
        'Specialty/niche services',
      ],
    },
    {
      id: 'examples',
      question: `Name 1-2 example companies you would consider "good targets"`,
      type: 'text',
      placeholder: 'e.g., Company A, Company B, or website URLs',
    },
    {
      id: 'geography',
      question: 'What is the primary geographic focus?',
      type: 'multiSelect',
      options: [
        'National (all US)',
        'Regional - Northeast',
        'Regional - Southeast',
        'Regional - Midwest',
        'Regional - Southwest',
        'Regional - West Coast',
        'Specific states only',
      ],
    },
    {
      id: 'additional_context',
      question:
        'Is there anything else about this industry that would be helpful for our research?',
      type: 'text',
      placeholder: 'e.g., key trends, important distinctions, specific focus areas...',
    },
  ];
}
