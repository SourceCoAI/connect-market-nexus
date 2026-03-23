export type StepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'warn' | 'skip';

export interface TestStep {
  label: string;
  status: StepStatus;
  detail?: string;
  durationMs?: number;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  requiresBuyer: boolean;
  steps: TestStep[];
  running: boolean;
}

export interface BuyerOption {
  id: string;
  company_name: string;
  buyer_type: string | null;
  pe_firm_name: string | null;
}

// ── Title filter specs (must match edge function exactly) ──

export const PE_TITLE_FILTER = ['bd', 'vp', 'senior associate', 'principal', 'partner', 'analyst'];
export const COMPANY_TITLE_FILTER = [
  'bd',
  'cfo',
  'chief financial officer',
  'vp finance',
  'director of finance',
  'head of finance',
  'finance director',
  'ceo',
];

// The alias expansion table from find-contacts edge function
export const TITLE_ALIASES: Record<string, string[]> = {
  associate: ['associate', 'sr associate', 'senior associate', 'investment associate'],
  principal: ['principal', 'sr principal', 'senior principal', 'investment principal'],
  vp: ['vp', 'vice president', 'vice-president', 'svp', 'senior vice president', 'evp'],
  director: [
    'director',
    'managing director',
    'sr director',
    'senior director',
    'associate director',
  ],
  partner: ['partner', 'managing partner', 'general partner', 'senior partner'],
  analyst: ['analyst', 'sr analyst', 'senior analyst', 'investment analyst'],
  ceo: ['ceo', 'chief executive officer', 'president', 'owner', 'founder', 'co-founder'],
  bd: [
    'business development',
    'corp dev',
    'corporate development',
    'head of acquisitions',
    'vp acquisitions',
    'vp m&a',
    'head of m&a',
  ],
};

// Banned terms: these should NOT appear as standalone filter entries because they are
// covered by alias expansion of a key (e.g. 'owner' is in the 'ceo' alias).
export const BANNED_STANDALONE = [
  'owner',
  'founder',
  'co-founder',
  'corporate development',
  'corp dev',
  'vice president',
  'business development',
];

// Roles that should be reachable via either direct match or alias expansion
export const PE_EXPECTED_ROLES = [
  'business development',
  'vice president',
  'senior associate',
  'principal',
  'partner',
  'analyst',
];

export const COMPANY_EXPECTED_ROLES = [
  'corporate development',
  'cfo',
  'chief financial officer',
  'vp finance',
  'ceo',
  'owner',
  'founder',
  'president',
];
