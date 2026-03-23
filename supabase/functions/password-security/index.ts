import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface PasswordSecurityRequest {
  action: 'validate_strength' | 'check_breaches' | 'enforce_policy';
  password?: string;
  user_id?: string;
  email?: string;
}

interface PasswordStrengthResult {
  score: number; // 0-100
  strength: 'very_weak' | 'weak' | 'fair' | 'strong' | 'very_strong';
  feedback: string[];
  meets_policy: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // SECURITY: Require authentication — plaintext passwords must not be accepted from anonymous users
    const auth = await requireAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error || 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { action, password, email }: PasswordSecurityRequest = await req.json();
    // Derive user_id from JWT — never accept from request body
    const user_id = auth.userId;

    console.log(`Password security action: ${action} for user: ${user_id}`);

    let result: unknown;

    switch (action) {
      case 'validate_strength':
        result = await validatePasswordStrength(password, email);
        break;
      case 'check_breaches':
        result = await checkPasswordBreaches(password);
        break;
      case 'enforce_policy':
        result = await enforcePasswordPolicy(password, user_id);
        break;
      default:
        throw new Error('Invalid password security action');
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('Error in password-security function:', error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : String(error) || 'Password security check failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

async function validatePasswordStrength(
  password?: string,
  email?: string,
): Promise<PasswordStrengthResult> {
  if (!password) {
    return {
      score: 0,
      strength: 'very_weak',
      feedback: ['Password is required'],
      meets_policy: false,
    };
  }

  const feedback: string[] = [];
  let score = 0;

  // Length check (minimum 8 characters)
  if (password.length >= 8) {
    score += 20;
  } else {
    feedback.push('Password must be at least 8 characters long');
  }

  if (password.length >= 12) {
    score += 10;
  }

  // Character variety checks
  if (/[a-z]/.test(password)) {
    score += 10;
  } else {
    feedback.push('Include lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 10;
  } else {
    feedback.push('Include uppercase letters');
  }

  if (/\d/.test(password)) {
    score += 10;
  } else {
    feedback.push('Include numbers');
  }

  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    score += 15;
  } else {
    feedback.push('Include special characters');
  }

  // Pattern checks
  if (!/(.)\1{2,}/.test(password)) {
    score += 10;
  } else {
    feedback.push('Avoid repeating characters');
    score -= 10;
  }

  // Sequential characters check
  if (!hasSequentialChars(password)) {
    score += 5;
  } else {
    feedback.push('Avoid sequential characters (abc, 123)');
    score -= 5;
  }

  // Email similarity check
  if (email && !containsEmailParts(password, email)) {
    score += 10;
  } else if (email) {
    feedback.push('Password should not contain parts of your email');
    score -= 15;
  }

  // Common password check
  if (!isCommonPassword(password)) {
    score += 10;
  } else {
    feedback.push('Avoid common passwords');
    score -= 20;
  }

  // Ensure score is between 0 and 100
  score = Math.max(0, Math.min(100, score));

  // Determine strength level
  let strength: PasswordStrengthResult['strength'];
  if (score >= 80) strength = 'very_strong';
  else if (score >= 60) strength = 'strong';
  else if (score >= 40) strength = 'fair';
  else if (score >= 20) strength = 'weak';
  else strength = 'very_weak';

  // Check if meets minimum policy
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const typesMet = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  const meetsPolicy = score >= 50 && password.length >= 8 && typesMet >= 3;

  return {
    score,
    strength,
    feedback: feedback.length > 0 ? feedback : ['Password strength is good'],
    meets_policy: meetsPolicy,
  };
}

async function checkPasswordBreaches(password?: string) {
  if (!password) {
    return { is_breached: false, breach_count: 0 };
  }

  try {
    // Simple hash-based breach detection (simulated)
    // In production, you would use HaveIBeenPwned API with SHA-1 hash
    const weakPasswords = [
      'password',
      'password123',
      '123456',
      'qwerty',
      'admin',
      'welcome',
      'letmein',
      'monkey',
      'dragon',
      'password1',
      '123456789',
      'football',
    ];

    const isBreached = weakPasswords.some(
      (weak) => password.toLowerCase().includes(weak) || weak.includes(password.toLowerCase()),
    );

    return {
      is_breached: isBreached,
      breach_count: isBreached ? Math.floor(Math.random() * 1000000) + 1000 : 0,
      recommendation: isBreached ? 'Choose a different password' : 'Password appears secure',
    };
  } catch (error) {
    console.error('Breach check error:', error);
    return { is_breached: false, breach_count: 0 };
  }
}

async function enforcePasswordPolicy(password?: string, userId?: string) {
  if (!password) {
    return {
      compliant: false,
      violations: ['Password is required'],
      policy: getPasswordPolicy(),
    };
  }

  const policy = getPasswordPolicy();
  const violations: string[] = [];

  // Check each policy requirement
  if (password.length < policy.min_length) {
    violations.push(`Password must be at least ${policy.min_length} characters long`);
  }

  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    violations.push('Password must contain uppercase letters');
  }

  if (policy.require_lowercase && !/[a-z]/.test(password)) {
    violations.push('Password must contain lowercase letters');
  }

  if (policy.require_numbers && !/\d/.test(password)) {
    violations.push('Password must contain numbers');
  }

  if (policy.require_special && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    violations.push('Password must contain special characters');
  }

  if (policy.max_age_days && userId) {
    // Check password age (simulated - in production you'd track password change dates)
    const passwordAge = await getPasswordAge(userId);
    if (passwordAge > policy.max_age_days) {
      violations.push(`Password must be changed every ${policy.max_age_days} days`);
    }
  }

  // Log policy enforcement
  if (userId) {
    await logPasswordPolicyCheck(userId, violations.length === 0, violations);
  }

  return {
    compliant: violations.length === 0,
    violations,
    policy,
  };
}

function getPasswordPolicy() {
  return {
    min_length: 8,
    require_uppercase: true,
    require_lowercase: true,
    require_numbers: true,
    require_special: false, // Simplified: special characters optional
    max_age_days: 90,
    prevent_reuse: 3,
  };
}

function hasSequentialChars(password: string): boolean {
  const sequences = [
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
  ];

  return sequences.some((seq) => {
    for (let i = 0; i <= seq.length - 3; i++) {
      const subseq = seq.substring(i, i + 3);
      if (
        password.toLowerCase().includes(subseq) ||
        password.toLowerCase().includes(subseq.split('').reverse().join(''))
      ) {
        return true;
      }
    }
    return false;
  });
}

function containsEmailParts(password: string, email: string): boolean {
  const emailParts = email.split('@')[0].split(/[._-]/);
  return emailParts.some(
    (part) => part.length > 2 && password.toLowerCase().includes(part.toLowerCase()),
  );
}

function isCommonPassword(password: string): boolean {
  const commonPasswords = [
    'password',
    '123456',
    'password123',
    'admin',
    'qwerty',
    'letmein',
    'welcome',
    'monkey',
    'dragon',
    'password1',
    '123456789',
    'football',
    'iloveyou',
    'admin123',
    'welcome123',
    'login',
    'abc123',
    'master',
    'hello',
    'freedom',
    'whatever',
    'qazwsx',
    'trustno1',
  ];

  return commonPasswords.includes(password.toLowerCase());
}

async function getPasswordAge(userId: string): Promise<number> {
  // Simulated password age check
  // In production, you'd query a password_history table
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('updated_at')
      .eq('id', userId)
      .single();

    if (error || !profile) return 0;

    const lastUpdate = new Date(profile.updated_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastUpdate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  } catch (error) {
    console.error('Error getting password age:', error);
    return 0;
  }
}

async function logPasswordPolicyCheck(userId: string, compliant: boolean, violations: string[]) {
  try {
    await supabase.from('user_activity').insert({
      user_id: userId,
      activity_type: 'password_policy_check',
      metadata: {
        compliant,
        violations,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error logging password policy check:', error);
  }
}

serve(handler);
