/**
 * SECURITY MODULE - Critical security utilities for edge functions
 *
 * This module provides:
 * 1. Rate limiting for AI API calls (prevent cost overruns)
 * 2. SSRF protection (prevent internal network access)
 * 3. Input validation utilities
 */

import {
  createClient as _createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';

// ============= RATE LIMITING =============

interface RateLimitConfig {
  limit: number;
  windowMinutes: number;
}

// Rate limit configurations for AI operations
// Production limits: 500/hour to prevent runaway loops and abuse
export const AI_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Per-user limits
  ai_enrichment: { limit: 500, windowMinutes: 60 },
  ai_scoring: { limit: 500, windowMinutes: 60 },
  ai_transcript: { limit: 500, windowMinutes: 60 },
  ai_document_parse: { limit: 500, windowMinutes: 60 },
  ai_query: { limit: 500, windowMinutes: 60 },

  // Admin limits
  admin_ai_enrichment: { limit: 500, windowMinutes: 60 },
  admin_ai_scoring: { limit: 500, windowMinutes: 60 },
  admin_ai_transcript: { limit: 500, windowMinutes: 60 },
  admin_ai_document_parse: { limit: 500, windowMinutes: 60 },
  admin_ai_query: { limit: 500, windowMinutes: 60 },

  // Global budget limits
  global_ai_calls: { limit: 500, windowMinutes: 60 },
};

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: string;
  currentCount: number;
  limit: number;
}

/**
 * Check rate limit for an action
 * Returns { allowed: true } if within limits, { allowed: false } if exceeded
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  action: string,
  isAdmin: boolean = false,
): Promise<RateLimitResult> {
  // Get config for this action
  const actionKey = isAdmin ? `admin_${action}` : action;
  const config = AI_RATE_LIMITS[actionKey] ||
    AI_RATE_LIMITS[action] || { limit: 10, windowMinutes: 60 };

  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000).toISOString();
  const resetTime = new Date(Date.now() + config.windowMinutes * 60 * 1000).toISOString();

  try {
    // Count recent attempts
    const { data: attempts, error } = await supabase
      .from('user_activity')
      .select('id')
      .eq('activity_type', `rate_limit_${action}`)
      .eq('user_id', identifier)
      .gte('created_at', windowStart);

    if (error) {
      console.error('Rate limit check error:', error);
      // N12 FIX: Fail CLOSED on database errors to prevent unlimited AI cost exposure.
      // Under DB pressure, fail-open would remove all rate limiting protection.
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        currentCount: config.limit,
        limit: config.limit,
      };
    }

    const currentCount = attempts?.length || 0;
    const allowed = currentCount < config.limit;

    if (allowed) {
      // Record this attempt
      await supabase.from('user_activity').insert({
        user_id: identifier,
        activity_type: `rate_limit_${action}`,
        metadata: {
          action,
          window_minutes: config.windowMinutes,
          limit: config.limit,
          attempt_count: currentCount + 1,
          timestamp: new Date().toISOString(),
        },
      });
    } else {
      // Log the violation
      console.warn(
        `Rate limit exceeded: ${identifier} - ${action} (${currentCount}/${config.limit})`,
      );
      await supabase.from('user_activity').insert({
        user_id: identifier,
        activity_type: 'rate_limit_violation',
        metadata: {
          action,
          current_count: currentCount,
          limit: config.limit,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return {
      allowed,
      remaining: Math.max(0, config.limit - currentCount - (allowed ? 1 : 0)),
      resetTime,
      currentCount: currentCount + (allowed ? 1 : 0),
      limit: config.limit,
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // N12 FIX: Fail CLOSED on all errors to prevent unlimited AI cost exposure
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      currentCount: config.limit,
      limit: config.limit,
    };
  }
}

/**
 * Check global rate limit (all users combined)
 */
export async function checkGlobalRateLimit(
  supabase: SupabaseClient,
  action: string = 'global_ai_calls',
): Promise<RateLimitResult> {
  const config = AI_RATE_LIMITS[action] || { limit: 1000, windowMinutes: 60 };
  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000).toISOString();
  const resetTime = new Date(Date.now() + config.windowMinutes * 60 * 1000).toISOString();

  try {
    const { count, error } = await supabase
      .from('user_activity')
      .select('*', { count: 'exact', head: true })
      .like('activity_type', 'rate_limit_ai_%')
      .gte('created_at', windowStart);

    if (error) {
      console.error('Global rate limit check error:', error);
      // N12 FIX: Fail CLOSED on DB errors to prevent unlimited AI cost exposure
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        currentCount: config.limit,
        limit: config.limit,
      };
    }

    const currentCount = count || 0;
    const allowed = currentCount < config.limit;

    if (!allowed) {
      console.error(
        `GLOBAL RATE LIMIT EXCEEDED: ${currentCount}/${config.limit} AI calls in the last hour`,
      );
    }

    return {
      allowed,
      remaining: Math.max(0, config.limit - currentCount),
      resetTime,
      currentCount,
      limit: config.limit,
    };
  } catch (error) {
    console.error('Global rate limit error:', error);
    // N12 FIX: Fail CLOSED on all errors
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      currentCount: config.limit,
      limit: config.limit,
    };
  }
}

// ============= SSRF PROTECTION =============

// Private IP ranges (RFC 1918) and special addresses to block
const BLOCKED_IP_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^192\.168\./, // 192.168.0.0/16
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^127\./, // Loopback
  /^0\./, // "This" network
  /^169\.254\./, // Link-local / AWS metadata
  /^224\./, // Multicast
  /^255\./, // Broadcast
  /^fc00:/i, // IPv6 private
  /^fd00:/i, // IPv6 private
  /^fe80:/i, // IPv6 link-local
  /^::1$/i, // IPv6 loopback
  /^localhost$/i, // Localhost hostname
  /^.*\.local$/i, // Local domains
  /^.*\.internal$/i, // Internal domains
  /^.*\.corp$/i, // Corporate domains
  /^.*\.lan$/i, // LAN domains
];

// Blocked hostnames (cloud metadata endpoints, etc.)
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.google.com',
  'metadata',
  '169.254.169.254', // AWS/GCP metadata
  '169.254.170.2', // AWS ECS metadata
  'fd00:ec2::254', // AWS EC2 IPv6 metadata
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
];

/**
 * Validate a URL is safe to fetch (SSRF protection)
 * Returns { valid: true } if safe, { valid: false, reason: string } if unsafe
 */
export function validateUrl(url: string): {
  valid: boolean;
  reason?: string;
  normalizedUrl?: string;
} {
  try {
    // Clean and normalize the URL
    let normalizedUrl = url.trim();

    // Add protocol if missing
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const parsed = new URL(normalizedUrl);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        valid: false,
        reason: `Invalid protocol: ${parsed.protocol}. Only HTTP(S) allowed.`,
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check against blocked hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { valid: false, reason: `Blocked hostname: ${hostname}` };
    }

    // Check against blocked IP patterns
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { valid: false, reason: `Private/internal address not allowed: ${hostname}` };
      }
    }

    // Block URLs with authentication (user:pass@host)
    if (parsed.username || parsed.password) {
      return { valid: false, reason: 'URLs with embedded credentials not allowed' };
    }

    // Block URLs with non-standard ports that might be internal services
    const port = parsed.port ? parseInt(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    const allowedPorts = [80, 443, 8080, 8443];
    if (!allowedPorts.includes(port)) {
      return { valid: false, reason: `Non-standard port not allowed: ${port}` };
    }

    // Ensure hostname has a valid TLD (basic check)
    const parts = hostname.split('.');
    if (parts.length < 2 || parts[parts.length - 1].length < 2) {
      return { valid: false, reason: `Invalid hostname: ${hostname}` };
    }

    return { valid: true, normalizedUrl };
  } catch (error) {
    return {
      valid: false,
      reason: `Invalid URL format: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

/**
 * Validate multiple URLs, return only valid ones
 */
export function validateUrls(urls: string[]): {
  valid: string[];
  invalid: Array<{ url: string; reason: string }>;
} {
  const valid: string[] = [];
  const invalid: Array<{ url: string; reason: string }> = [];

  for (const url of urls) {
    const result = validateUrl(url);
    if (result.valid && result.normalizedUrl) {
      valid.push(result.normalizedUrl);
    } else {
      invalid.push({ url, reason: result.reason || 'Unknown error' });
    }
  }

  return { valid, invalid };
}

// ============= INPUT VALIDATION =============

/**
 * Validate UUID format
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Sanitize string input (remove control characters, limit length)
 */
export function sanitizeString(value: string, maxLength: number = 10000): string {
  if (!value || typeof value !== 'string') return '';
  // Remove control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex
  const sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitized.substring(0, maxLength);
}

/**
 * Validate and sanitize an array of strings
 */
export function sanitizeStringArray(
  arr: unknown,
  maxItems: number = 100,
  maxItemLength: number = 1000,
): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is string => typeof item === 'string')
    .slice(0, maxItems)
    .map((item) => sanitizeString(item, maxItemLength));
}

// ============= TIMING-SAFE COMPARISON =============

/**
 * Timing-safe string comparison to prevent timing attacks on secret verification.
 * Always compares all characters regardless of where a mismatch occurs.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ============= HTML ESCAPING =============

/**
 * Escape HTML special characters to prevent XSS in rendered templates.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============= RESPONSE HELPERS =============

/**
 * Create a rate limit exceeded response
 */
export function rateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      remaining: result.remaining,
      resetTime: result.resetTime,
      limit: result.limit,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime,
        'Retry-After': '60',
      },
    },
  );
}

/**
 * Create an SSRF validation error response
 */
export function ssrfErrorResponse(reason: string, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: 'Invalid URL',
      code: 'SSRF_BLOCKED',
      reason,
    }),
    {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  );
}
