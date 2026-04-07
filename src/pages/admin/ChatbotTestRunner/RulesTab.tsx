import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const CHATBOT_RULES = [
  {
    id: 'never-make-up',
    title: 'ABSOLUTE #1 RULE — Never Make Up Information',
    severity: 'critical' as const,
    rules: [
      'NEVER make up information or say something you are not certain of',
      'It is ALWAYS better to say "I don\'t know" or "I don\'t have that data" than to make something up',
      'In M&A, one wrong number, one fabricated name, one made-up valuation can cost real money and destroy trust',
      'If the data is not in your tool results, you do not have it — period',
      'If you are not 100% certain of a fact, do not state it as fact — say "I\'m not sure" or "I\'d need to verify that"',
      'This applies to everything: deal names, buyer names, revenue, EBITDA, multiples, industry trends, contact info, scores, market conditions, valuations — no exceptions',
      'NEVER present an estimate as a fact — if inferring (e.g. revenue from employee count), explicitly say it is an estimate',
      'When citing general M&A knowledge, ALWAYS label it as general — never let the user think general info came from SourceCo data',
    ],
  },
  {
    id: 'hallucination',
    title: 'Zero Hallucination Policy (Rule 1)',
    severity: 'critical' as const,
    rules: [
      'NEVER generate fake tool calls as text',
      'NEVER fabricate deal names, company names, buyer names, IDs, revenue figures, or ANY data',
      'NEVER invent placeholder IDs like "deal_001" — all real IDs are UUIDs',
      'When a tool returns ZERO results, say "No results found" — do NOT invent data',
      'If uncertain, say "I don\'t have that data" — never speculate',
    ],
  },
  {
    id: 'formatting',
    title: 'Response Formatting (Rule 14)',
    severity: 'critical' as const,
    rules: [
      'NEVER use markdown tables (| col | col | syntax) — they render as unreadable text in the chat widget',
      'NEVER use horizontal rules (---)',
      'NEVER use emoji in section headers or labels',
      'Use at most ONE ## header per response; use **bold text** for subsections',
      'Keep answers under 250 words (simple) or 400 words (complex)',
      'For comparisons: use labeled bullet groups, not tables',
      'For data points: use inline format — "Revenue: $4.2M · EBITDA: $840K · State: TX"',
      'For entity lists: compact bullets — "**Acme Corp** — $4.2M rev, TX, PE firm, score: 87"',
      'Maximum 3 short paragraphs per response',
      'Write like a Slack message to a colleague — direct, concise, scannable',
    ],
  },
  {
    id: 'data-format',
    title: 'Data Format Standards (Rule 3)',
    severity: 'high' as const,
    rules: [
      'State codes: Always 2-letter (TX, CA, VT, FL)',
      'Revenue/EBITDA: "$X.XM" for millions, "$XK" for thousands',
      'Percentages: One decimal place (e.g. "12.5%")',
      'Deal IDs: Always show the real UUID',
      'Dates: "Jan 15, 2025" format by default',
    ],
  },
  {
    id: 'speed',
    title: 'Speed-First Rules',
    severity: 'high' as const,
    rules: [
      'Lead with the answer — never start with "Let me look into that"',
      'Use data from tool results only — never guess',
      'Short answers for simple questions; expand only when needed',
      'Use bullet points for structured data — avoid long paragraphs',
      'When listing entities, include their IDs for reference',
    ],
  },
  {
    id: 'confirmation',
    title: 'Confirmation & Safety (Rule 8)',
    severity: 'critical' as const,
    rules: [
      'update_deal_stage and grant_data_room_access REQUIRE user confirmation before execution',
      'Show before/after state and ask "Should I proceed?"',
      'BULK OPERATIONS: Warn with exact count if affecting 10+ records',
      'DUPLICATE PREVENTION: Check for similar records before creating',
      'INPUT VALIDATION: Verify emails, state codes, numeric values before processing',
    ],
  },
  {
    id: 'data-boundary',
    title: 'Data Boundary Rules (Rule 9)',
    severity: 'high' as const,
    rules: [
      'CAN access: deals, buyers, contacts, transcripts, scores, outreach, engagement, tasks, documents',
      'CANNOT access: real-time market data, competitor intel, stock prices, external news, LinkedIn/Google',
      'Be explicit about boundaries — if a user asks for something outside your data, say so clearly',
      'A buyer UNIVERSE is a subset — if empty, offer to search the full buyers table',
    ],
  },
  {
    id: 'multi-source',
    title: 'Multi-Source Transparency (Rule 10)',
    severity: 'high' as const,
    rules: [
      'When returning data from multiple tables, ALWAYS separate and label each source',
      'Never blend data from different sources into a single count without breakdown',
      'Example: "HVAC deals by source: Active Deals: 7, CapTarget: 5, Valuation Calculator: 3"',
    ],
  },
  {
    id: 'error-handling',
    title: 'Error Handling (Rule 12)',
    severity: 'medium' as const,
    rules: [
      'When a tool call fails, tell the user exactly what went wrong in plain language',
      'Always offer recovery options: retry, different approach, or skip',
      'If partial results returned, say so explicitly',
      'If an external API is unavailable, name which service is down',
    ],
  },
  {
    id: 'contacts',
    title: 'Unified Contacts Model (Rule 7)',
    severity: 'high' as const,
    rules: [
      '"contacts" table is the single source of truth since Feb 28, 2026',
      'All legacy contact tables have been consolidated into "contacts"',
      'Buyer contacts must NEVER have listing_id set; seller contacts must NEVER have remarketing_buyer_id',
      'Every seller contact must have a listing_id',
    ],
  },
];

const ruleSeverityColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
};

export function RulesTab() {
  const [collapsedRules, setCollapsedRules] = useState<Set<string>>(new Set());

  const toggleRule = (id: string) => {
    setCollapsedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {CHATBOT_RULES.length} rule groups ·{' '}
          {CHATBOT_RULES.reduce((sum, r) => sum + r.rules.length, 0)} individual rules · These rules
          are enforced in the AI Command Center system prompt
        </p>
      </div>

      <div className="space-y-2">
        {CHATBOT_RULES.map((group) => {
          const isCollapsed = collapsedRules.has(group.id);

          return (
            <div key={group.id} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleRule(group.id)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{group.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn('text-[10px]', ruleSeverityColor[group.severity])}>
                    {group.severity}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{group.rules.length} rules</span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="px-4 py-3 space-y-2">
                  {group.rules.map((rule, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">
                        {i + 1}.
                      </span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
