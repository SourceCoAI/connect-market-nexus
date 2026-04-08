import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  BookOpen,
  ListChecks,
  Mic,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  FileText,
  ChevronDown,
  ChevronRight,
  Layers,
  Target,
  Repeat,
  Mail,
  Phone,
  ArrowDown,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Section data ───

interface GuideSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  content: React.ReactNode;
}

function ProTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3 mt-3">
      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-1">Pro Tip</p>
      <p className="text-sm text-blue-900 dark:text-blue-400">{children}</p>
    </div>
  );
}

function StatusRow({
  status,
  color,
  description,
}: {
  status: string;
  color: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Badge variant="outline" className={cn('shrink-0 text-[11px] h-5 px-2', color)}>
        {status}
      </Badge>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function TaskTypeGrid() {
  const types = [
    { label: 'Contact Owner', color: 'bg-red-100 text-red-800 border-red-200' },
    { label: 'Build Buyer Universe', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { label: 'Follow Up with Buyer', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    { label: 'Send Materials', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { label: 'Schedule Call', color: 'bg-green-100 text-green-800 border-green-200' },
    { label: 'NDA Execution', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    { label: 'IOI/LOI Process', color: 'bg-teal-100 text-teal-800 border-teal-200' },
    { label: 'Due Diligence', color: 'bg-orange-100 text-orange-800 border-orange-200' },
    { label: 'Buyer Qualification', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    { label: 'Seller Relationship', color: 'bg-rose-100 text-rose-800 border-rose-200' },
    { label: 'Buyer IC Follow-up', color: 'bg-violet-100 text-violet-800 border-violet-200' },
    { label: 'Call', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { label: 'Email', color: 'bg-sky-100 text-sky-800 border-sky-200' },
    { label: 'Find Buyers', color: 'bg-lime-100 text-lime-800 border-lime-200' },
    { label: 'Contact Buyers', color: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {types.map((t) => (
        <Badge key={t.label} variant="outline" className={cn('text-[11px] px-2 py-0.5', t.color)}>
          {t.label}
        </Badge>
      ))}
    </div>
  );
}

function buildSections(): GuideSection[] {
  return [
    {
      id: 'quick-start',
      icon: <BookOpen className="h-5 w-5 text-blue-600" />,
      title: 'Quick Start',
      subtitle: 'Overview of the task system',
      content: (
        <div className="space-y-3">
          <p className="text-sm">
            The Daily Tasks page has two tabs: <strong>Tasks</strong> and <strong>Standups</strong>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ListChecks className="h-4 w-4 text-gray-700" />
                <p className="text-sm font-semibold">Tasks Tab</p>
              </div>
              <p className="text-xs text-muted-foreground">
                All action items — manual and auto-generated. Filter by assignee, entity, tags.
                Switch between My Tasks and All Tasks. View as list or calendar.
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Mic className="h-4 w-4 text-purple-700" />
                <p className="text-sm font-semibold">Standups Tab</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Meeting-by-meeting view of extracted tasks from Fireflies transcripts. Shows
                summaries, key points, and tasks grouped by assignee.
              </p>
            </div>
          </div>
          <ProTip>
            Navigate to Daily Tasks from the sidebar under the Deals section, or go to{' '}
            <code className="text-xs bg-muted px-1 rounded">/admin/daily-tasks</code>.
          </ProTip>
        </div>
      ),
    },
    {
      id: 'standup-extraction',
      icon: <Mic className="h-5 w-5 text-purple-600" />,
      title: 'Standup Meeting Extraction',
      subtitle: 'How tasks are auto-extracted from meetings',
      content: (
        <div className="space-y-3">
          <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-4 py-3">
            <p className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-1">
              Tag your meetings with <code className="bg-purple-100 dark:bg-purple-900/50 px-1.5 py-0.5 rounded text-xs">&lt;ds&gt;</code>
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-400">
              Include <code className="bg-purple-100 dark:bg-purple-900/50 px-1 rounded">&lt;ds&gt;</code> anywhere in
              your meeting title (e.g., "Daily Standup &lt;ds&gt;") for automatic task extraction.
              Meetings without this tag are skipped.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How It Works</p>
            <ol className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 h-5 w-5 p-0 justify-center text-[10px]">1</Badge>
                <span>Fireflies records and transcribes your meeting</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 h-5 w-5 p-0 justify-center text-[10px]">2</Badge>
                <span>Webhook fires (or cron polls every 48 hours as backup)</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 h-5 w-5 p-0 justify-center text-[10px]">3</Badge>
                <span>AI (Gemini) analyzes transcript — extracts tasks with assignee, type, due date, deal reference</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 h-5 w-5 p-0 justify-center text-[10px]">4</Badge>
                <span>Tasks land in <strong>Pending Approval</strong> — leadership reviews and approves</span>
              </li>
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Available Task Types</p>
            <TaskTypeGrid />
          </div>
          <ProTip>
            Assignee matching uses the alias registry. If extraction assigns tasks to the wrong
            person, update aliases in Settings &gt; Internal Team.
          </ProTip>
        </div>
      ),
    },
    {
      id: 'task-lifecycle',
      icon: <Clock className="h-5 w-5 text-amber-600" />,
      title: 'Task Lifecycle & Statuses',
      subtitle: 'Every status a task can have',
      content: (
        <div className="space-y-1 divide-y">
          <StatusRow status="Pending Approval" color="bg-amber-100 text-amber-800 border-amber-200" description="AI-extracted tasks awaiting leadership sign-off. Only owners/admins can approve." />
          <StatusRow status="Pending" color="bg-gray-100 text-gray-800 border-gray-200" description="Approved and ready to be worked. This is the default state for manual tasks." />
          <StatusRow status="In Progress" color="bg-blue-100 text-blue-800 border-blue-200" description="Task is actively being worked on." />
          <StatusRow status="Completed" color="bg-green-100 text-green-800 border-green-200" description="Done. Completion notes and timestamp are recorded." />
          <StatusRow status="Overdue" color="bg-red-100 text-red-800 border-red-200" description="Past due date. Automatically set by an hourly cron job. Triggers escalation." />
          <StatusRow status="Snoozed" color="bg-slate-100 text-slate-800 border-slate-200" description="Deferred. Choose 1 day, 3 days, 1 week, 2 weeks, or 1 month. Auto-wakes when the snooze period ends." />
          <StatusRow status="Cancelled" color="bg-gray-100 text-gray-600 border-gray-200" description="Dismissed or no longer relevant." />
          <StatusRow status="Listing Closed" color="bg-gray-100 text-gray-500 border-gray-200" description="Auto-set when the parent deal closes." />
        </div>
      ),
    },
    {
      id: 'priority-scoring',
      icon: <Target className="h-5 w-5 text-red-600" />,
      title: 'Task Priorities & Scoring',
      subtitle: 'How tasks are ranked and scored',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">High</Badge>
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Medium</Badge>
            <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">Low</Badge>
          </div>
          <p className="text-sm">
            Each task has a <strong>priority score</strong> (0-100) computed from two factors:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-semibold mb-1">Deal Stage Weight</p>
              <p className="text-xs text-muted-foreground">
                Higher-stage deals score higher. LOI Submitted = 90, Due Diligence = 70, NDA Signed = 50, Sourced = 20.
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-semibold mb-1">Task Type Weight</p>
              <p className="text-xs text-muted-foreground">
                Contact Owner = 90, IOI/LOI = 88, Due Diligence = 85, Schedule Call = 80, Follow Up = 75.
              </p>
            </div>
          </div>
          <ProTip>
            Pinned tasks always appear at the top regardless of score. Use pinning for urgent items
            that need immediate attention.
          </ProTip>
        </div>
      ),
    },
    {
      id: 'auto-generation',
      icon: <Zap className="h-5 w-5 text-violet-600" />,
      title: 'Auto-Generated Tasks',
      subtitle: '6 automation sources that create tasks for you',
      content: (
        <div className="space-y-3">
          <p className="text-sm">Tasks are automatically created from these sources:</p>
          <div className="grid gap-2">
            {[
              { icon: <Mic className="h-4 w-4" />, label: 'Meeting Extraction', color: 'bg-purple-50 border-purple-200', desc: 'AI extracts action items from Fireflies standup transcripts tagged with <ds>.' },
              { icon: <Layers className="h-4 w-4" />, label: 'Stage Entry', color: 'bg-indigo-50 border-indigo-200', desc: 'When a deal moves to a new pipeline stage, matching template tasks are auto-created.' },
              { icon: <AlertTriangle className="h-4 w-4" />, label: 'Stale Deal', color: 'bg-red-50 border-red-200', desc: 'Deals with no activity for 7+ days get a follow-up task. Checked daily at 9 AM ET.' },
              { icon: <Phone className="h-4 w-4" />, label: 'Call Disposition', color: 'bg-emerald-50 border-emerald-200', desc: 'PhoneBurner call outcomes (voicemail, positive reply, etc.) create follow-up tasks.' },
              { icon: <Mail className="h-4 w-4" />, label: 'Email Reply', color: 'bg-sky-50 border-sky-200', desc: 'Positive SmartLead email replies create buyer engagement tasks.' },
              { icon: <Repeat className="h-4 w-4" />, label: 'Recurrence', color: 'bg-blue-50 border-blue-200', desc: 'Completing a recurring task auto-creates the next instance (daily/weekly/biweekly/monthly).' },
            ].map((source) => (
              <div key={source.label} className={cn('rounded-lg border px-3 py-2.5 flex items-start gap-3', source.color)}>
                <div className="shrink-0 mt-0.5">{source.icon}</div>
                <div>
                  <p className="text-sm font-medium">{source.label}</p>
                  <p className="text-xs text-muted-foreground">{source.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'templates',
      icon: <FileText className="h-5 w-5 text-indigo-600" />,
      title: 'Task Templates',
      subtitle: 'Pre-built workflow checklists for deal stages',
      content: (
        <div className="space-y-3">
          <p className="text-sm">Templates create a set of linked tasks with relative due dates.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Deal Process Templates</p>
              <ul className="space-y-1">
                {['Intake & Qualification', 'Build Buyer Universe', 'NDA Phase', 'Deal Memo Phase', 'IOI & Presentations', 'LOI & Diligence'].map((t) => (
                  <li key={t} className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Buyer Engagement Templates</p>
              <ul className="space-y-1">
                {['Initial Outreach', 'NDA & CIM Phase', 'Management Presentation', 'Buyer IC Follow-up'].map((t) => (
                  <li key={t} className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-blue-500 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs font-semibold mb-1">Custom Templates</p>
            <p className="text-xs text-muted-foreground">
              Custom templates can be stored in the database and triggered on stage entry. Apply templates from any deal detail page via the <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">Start Deal Process</code> button.
            </p>
          </div>
          <ProTip>
            Use the "Start Deal Process" button on a deal detail page to apply the full template suite for that stage. It creates all the tasks at once with proper dependencies and due dates.
          </ProTip>
        </div>
      ),
    },
    {
      id: 'dependencies',
      icon: <ArrowDown className="h-5 w-5 text-orange-600" />,
      title: 'Task Dependencies',
      subtitle: 'Chain tasks so blocked items wait for prerequisites',
      content: (
        <div className="space-y-3">
          <p className="text-sm">
            Tasks can depend on another task via the <code className="text-xs bg-muted px-1 rounded">depends_on</code> field. A task whose prerequisite is incomplete shows as <Badge variant="outline" className="text-[10px] px-1.5 h-4 bg-red-50 text-red-700 border-red-200">Blocked</Badge>.
          </p>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Example:</strong> "Share deal memo" depends on "Send NDA to buyer." The memo task is blocked until the NDA task is completed. View dependencies visually on any deal detail page.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'entity-linking',
      icon: <Layers className="h-5 w-5 text-teal-600" />,
      title: 'Entity Linking',
      subtitle: 'Connect tasks to deals, buyers, contacts, or listings',
      content: (
        <div className="space-y-3">
          <p className="text-sm">Every task is linked to a primary entity:</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Deal</Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Buyer</Badge>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Contact</Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Listing</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Tasks appear on entity detail pages under a "Tasks" tab. Secondary entity linking is supported — for example, a task on a deal that references a specific buyer.
          </p>
        </div>
      ),
    },
    {
      id: 'team-features',
      icon: <Users className="h-5 w-5 text-green-600" />,
      title: 'Team Features',
      subtitle: 'Workload, reassignment, calendar, and tags',
      content: (
        <div className="space-y-3">
          <div className="grid gap-2">
            {[
              { icon: <Users className="h-4 w-4" />, label: 'My Tasks vs All Tasks', desc: 'Toggle between personal and team-wide view. "All Tasks" requires a leadership role to access.' },
              { icon: <Target className="h-4 w-4" />, label: 'Team Workload', desc: 'Visual bar chart showing open tasks per team member, broken down by priority.' },
              { icon: <ArrowDown className="h-4 w-4" />, label: 'Reassignment', desc: 'Reassign tasks to any team member. They receive an in-app notification and email.' },
              { icon: <Calendar className="h-4 w-4" />, label: 'Calendar View', desc: 'Month view with task dots colored by priority (red for high, amber for medium, gray for low). Click any day to see tasks.' },
              { icon: <ListChecks className="h-4 w-4" />, label: 'Tags', desc: 'Free-form tags for custom categorization and filtering across any view.' },
            ].map((feature) => (
              <div key={feature.label} className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                <div className="shrink-0 mt-0.5">{feature.icon}</div>
                <div>
                  <p className="text-sm font-medium">{feature.label}</p>
                  <p className="text-xs text-muted-foreground">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'escalation',
      icon: <Shield className="h-5 w-5 text-red-600" />,
      title: 'Overdue Escalation',
      subtitle: 'Automatic escalation when tasks are past due',
      content: (
        <div className="space-y-3">
          <p className="text-sm">An hourly cron job checks for overdue tasks and escalates through 4 levels:</p>
          <div className="space-y-2">
            {[
              { level: '0', label: 'Task marked overdue', color: 'bg-amber-100 text-amber-800 border-amber-200' },
              { level: '1', label: 'Assignee notified (in-app + email)', color: 'bg-orange-100 text-orange-800 border-orange-200' },
              { level: '2', label: 'Manager notified', color: 'bg-red-100 text-red-800 border-red-200' },
              { level: '3', label: 'Leadership notified', color: 'bg-red-200 text-red-900 border-red-300' },
            ].map((esc) => (
              <div key={esc.level} className="flex items-center gap-3">
                <Badge variant="outline" className={cn('shrink-0 text-[11px] h-5 px-2 w-24 justify-center', esc.color)}>
                  Level {esc.level}
                </Badge>
                <p className="text-sm">{esc.label}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Snoozed tasks auto-wake when their snooze date passes and return to "Pending" status.
          </p>
        </div>
      ),
    },
    {
      id: 'document-tracking',
      icon: <FileText className="h-5 w-5 text-emerald-600" />,
      title: 'Document Tracking',
      subtitle: 'NDA, Fee Agreement, and document request lifecycle',
      content: (
        <div className="space-y-3">
          <p className="text-sm">NDA and Fee Agreement status is tracked per firm through a lifecycle:</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">Not Sent</Badge>
            <span className="text-muted-foreground text-xs">&rarr;</span>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Sent</Badge>
            <span className="text-muted-foreground text-xs">&rarr;</span>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Requested</Badge>
            <span className="text-muted-foreground text-xs">&rarr;</span>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Signed</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Every status change is recorded in an audit log with the admin who made it. Document requests from portal buyers are tracked with email delivery status.
          </p>
        </div>
      ),
    },
    {
      id: 'daily-digest',
      icon: <Mail className="h-5 w-5 text-sky-600" />,
      title: 'Daily Digest',
      subtitle: 'Automated email summary for the team',
      content: (
        <div className="space-y-3">
          <p className="text-sm">
            An automated email is sent daily to each team member summarizing their tasks:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Today's Due", color: 'text-blue-700' },
              { label: 'Completed', color: 'text-green-700' },
              { label: 'Overdue', color: 'text-red-700' },
              { label: 'Upcoming', color: 'text-amber-700' },
            ].map((cat) => (
              <div key={cat.label} className="rounded-lg bg-muted/50 p-2 text-center">
                <p className={cn('text-xs font-semibold', cat.color)}>{cat.label}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Keeps the team aligned without needing to check the dashboard every morning.
          </p>
        </div>
      ),
    },
  ];
}

// ─── Main Page ───

export default function TaskSystemGuidePage() {
  const sections = buildSections();
  const [openSections, setOpenSections] = useState<string[]>(['quick-start']);

  const toggleSection = (id: string) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Task System Guide
        </h1>
        <p className="text-muted-foreground">
          Learn how the task extraction, standup tracking, and automation system works
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => {
          const isOpen = openSections.includes(section.id);
          return (
            <Collapsible key={section.id} open={isOpen} onOpenChange={() => toggleSection(section.id)}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer select-none hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {section.icon}
                        <div>
                          <CardTitle className="text-lg">{section.title}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {section.subtitle}
                          </p>
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>{section.content}</CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
