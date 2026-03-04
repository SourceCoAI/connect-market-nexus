import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ValidationRequest {
  action: 'validate_profile' | 'validate_listing' | 'validate_connection_request';
  data: Record<string, unknown>;
  user_id?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized_data?: Record<string, unknown>;
  risk_score?: number;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { action, data, user_id }: ValidationRequest = await req.json();

    console.log(`Security validation request: ${action} for user: ${user_id}`);

    let result: ValidationResult;

    switch (action) {
      case 'validate_profile':
        result = await validateProfile(data, user_id);
        break;
      case 'validate_listing':
        result = await validateListing(data, user_id);
        break;
      case 'validate_connection_request':
        result = await validateConnectionRequest(data, user_id);
        break;
      default:
        throw new Error('Invalid validation action');
    }

    // Log validation results for suspicious activity detection
    if (result.risk_score && result.risk_score > 7) {
      await logSuspiciousActivity(user_id, action, result.risk_score, data);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('Error in security-validation function:', error);
    return new Response(
      JSON.stringify({
        valid: false,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        risk_score: 10,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

async function validateProfile(
  data: Record<string, unknown>,
  _userId?: string,
): Promise<ValidationResult> {
  const errors: string[] = [];
  let riskScore = 0;

  // Sanitize and validate profile data
  const sanitized = {
    first_name: sanitizeText(data.first_name as string, 50),
    last_name: sanitizeText(data.last_name as string, 50),
    company: sanitizeText(data.company as string, 100),
    website: sanitizeUrl(data.website as string),
    phone_number: sanitizePhoneNumber(data.phone_number as string),
    bio: sanitizeText(data.bio as string, 500),
    buyer_type: validateEnum(data.buyer_type as string, [
      'corporate',
      'private_equity',
      'individual',
    ]),
    fund_size: sanitizeText(data.fund_size as string, 50),
    investment_size: sanitizeText(data.investment_size as string, 50),
    estimated_revenue: sanitizeText(data.estimated_revenue as string, 50),
  };

  // Validation rules
  if (!sanitized.first_name || sanitized.first_name.length < 2) {
    errors.push('First name must be at least 2 characters long');
    riskScore += 1;
  }

  if (!sanitized.last_name || sanitized.last_name.length < 2) {
    errors.push('Last name must be at least 2 characters long');
    riskScore += 1;
  }

  if (sanitized.website && !isValidUrl(sanitized.website)) {
    errors.push('Invalid website URL format');
    riskScore += 2;
  }

  if (sanitized.phone_number && !isValidPhoneNumber(sanitized.phone_number)) {
    errors.push('Invalid phone number format');
    riskScore += 1;
  }

  // Suspicious content detection
  if (containsSuspiciousContent(sanitized.bio || '')) {
    errors.push('Profile contains potentially inappropriate content');
    riskScore += 5;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized_data: sanitized,
    risk_score: riskScore,
  };
}

async function validateListing(
  data: Record<string, unknown>,
  _userId?: string,
): Promise<ValidationResult> {
  const errors: string[] = [];
  let riskScore = 0;

  // Sanitize and validate listing data
  const sanitized = {
    title: sanitizeText(data.title as string, 200),
    description: sanitizeText(data.description as string, 2000),
    category: sanitizeText(data.category as string, 50),
    location: sanitizeText(data.location as string, 100),
    revenue: sanitizeNumber(data.revenue),
    ebitda: sanitizeNumber(data.ebitda),
    owner_notes: sanitizeText(data.owner_notes as string, 1000),
    tags: Array.isArray(data.tags)
      ? data.tags.map((tag: string) => sanitizeText(tag, 30)).filter(Boolean)
      : [],
  };

  // Validation rules
  if (!sanitized.title || sanitized.title.length < 10) {
    errors.push('Title must be at least 10 characters long');
    riskScore += 2;
  }

  if (!sanitized.description || sanitized.description.length < 50) {
    errors.push('Description must be at least 50 characters long');
    riskScore += 2;
  }

  if (!sanitized.revenue || sanitized.revenue <= 0) {
    errors.push('Revenue must be a positive number');
    riskScore += 1;
  }

  if (sanitized.ebitda !== undefined && sanitized.revenue && sanitized.ebitda > sanitized.revenue) {
    errors.push('EBITDA cannot be greater than revenue');
    riskScore += 3;
  }

  // Suspicious content detection
  if (containsSuspiciousContent(sanitized.description + ' ' + sanitized.title)) {
    errors.push('Listing contains potentially inappropriate content');
    riskScore += 8;
  }

  // Financial anomaly detection
  if (sanitized.revenue && sanitized.revenue > 1000000000) {
    // > $1B
    riskScore += 3;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized_data: sanitized,
    risk_score: riskScore,
  };
}

async function validateConnectionRequest(
  data: Record<string, unknown>,
  userId?: string,
): Promise<ValidationResult> {
  const errors: string[] = [];
  let riskScore = 0;

  // Sanitize and validate connection request data
  const sanitized = {
    listing_id: sanitizeText(data.listing_id as string, 36),
    user_message: sanitizeText(data.user_message as string, 1000),
  };

  // Validation rules
  if (!sanitized.listing_id) {
    errors.push('Listing ID is required');
    riskScore += 5;
  }

  if (sanitized.user_message && sanitized.user_message.length > 1000) {
    errors.push('Message is too long');
    riskScore += 2;
  }

  // Suspicious content detection
  if (containsSuspiciousContent(sanitized.user_message || '')) {
    errors.push('Message contains potentially inappropriate content');
    riskScore += 6;
  }

  // Rate limiting check - user should not make too many requests
  if (userId) {
    const recentRequests = await checkRecentConnectionRequests(userId);
    if (recentRequests > 10) {
      // More than 10 requests in last hour
      errors.push('Too many connection requests in a short period');
      riskScore += 8;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized_data: sanitized,
    risk_score: riskScore,
  };
}

// Helper functions for validation and sanitization
function sanitizeText(text: string, maxLength: number): string {
  if (!text) return '';
  // Remove HTML tags, normalize whitespace, trim
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

function sanitizeUrl(url: string): string {
  if (!url) return '';
  // Basic URL sanitization
  const sanitized = url.trim().toLowerCase();
  if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
    return 'https://' + sanitized;
  }
  return sanitized;
}

function sanitizePhoneNumber(phone: string): string {
  if (!phone) return '';
  // Keep only digits, spaces, dashes, parentheses, and plus sign
  return phone.replace(/[^\d\s\-()+]/g, '').trim();
}

function sanitizeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = parseFloat(String(value));
  return isNaN(num) ? undefined : Math.abs(num);
}

function validateEnum(value: string, allowedValues: string[]): string {
  return allowedValues.includes(value) ? value : allowedValues[0];
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidPhoneNumber(phone: string): boolean {
  // Basic phone number validation (international format)
  const phoneRegex = /^\+?[\d\s\-()]{10,15}$/;
  return phoneRegex.test(phone);
}

function containsSuspiciousContent(text: string): boolean {
  const suspiciousPatterns = [
    /\b(?:scam|fraud|money\s*laundering|illegal|drugs|weapons)\b/i,
    /\b(?:click\s*here|free\s*money|guaranteed\s*profit)\b/i,
    /\b(?:urgent|act\s*now|limited\s*time)\b/i,
    /<script|javascript:|on\w+\s*=/i, // Basic XSS detection
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card patterns
    /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/, // SSN patterns
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(text));
}

async function checkRecentConnectionRequests(userId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('connection_requests')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('Error checking recent requests:', error);
    return 0;
  }

  return data?.length || 0;
}

async function logSuspiciousActivity(
  userId?: string,
  action?: string,
  riskScore?: number,
  data?: Record<string, unknown>,
) {
  try {
    await supabase.from('user_activity').insert({
      user_id: userId,
      activity_type: 'suspicious_validation',
      metadata: {
        action,
        risk_score: riskScore,
        timestamp: new Date().toISOString(),
        data_summary: data ? Object.keys(data) : [],
      },
    });
  } catch (error) {
    console.error('Error logging suspicious activity:', error);
  }
}

serve(handler);
