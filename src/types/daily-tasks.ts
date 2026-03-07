// ─── Daily Standup Tasks Types ───

export type TaskType =
  | 'contact_owner'
  | 'build_buyer_universe'
  | 'follow_up_with_buyer'
  | 'send_materials'
  | 'update_pipeline'
  | 'schedule_call'
  | 'nda_execution'
  | 'ioi_loi_process'
  | 'due_diligence'
  | 'buyer_qualification'
  | 'seller_relationship'
  | 'buyer_ic_followup'
  | 'other'
  | 'call'
  | 'email'
  | 'find_buyers'
  | 'contact_buyers';

export type TaskStatus =
  | 'pending_approval'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'snoozed'
  | 'cancelled'
  | 'listing_closed';

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export type TaskEntityType = 'listing' | 'deal' | 'buyer' | 'contact';

export type TaskSource = 'manual' | 'ai' | 'chatbot' | 'system' | 'template';

export type TaskPriority = 'high' | 'medium' | 'low';

export type AIConfidence = 'high' | 'medium';

export type AISpeakerRole = 'advisor' | 'seller' | 'buyer' | 'unknown';

export interface StandupMeeting {
  id: string;
  fireflies_transcript_id: string;
  meeting_title: string | null;
  meeting_date: string;
  meeting_duration_minutes: number | null;
  transcript_url: string | null;
  tasks_extracted: number;
  tasks_unassigned: number;
  extraction_confidence_avg: number | null;
  processed_at: string;
  created_at: string;
}

export interface DailyStandupTask {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  task_type: TaskType;
  status: TaskStatus;
  due_date: string;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  source_meeting_id: string | null;
  source_timestamp: string | null;
  deal_reference: string | null;
  deal_id: string | null;
  priority_score: number;
  priority_rank: number | null;
  is_pinned: boolean;
  pinned_rank: number | null;
  pinned_by: string | null;
  pinned_at: string | null;
  pin_reason: string | null;
  extraction_confidence: ExtractionConfidence;
  needs_review: boolean;
  is_manual: boolean;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;

  // v3.1 — Entity linking
  entity_type: TaskEntityType;
  entity_id: string | null;
  secondary_entity_type: TaskEntityType | null;
  secondary_entity_id: string | null;

  // v3.1 — Source & priority
  source: TaskSource;
  priority: TaskPriority;
  created_by: string | null;

  // v3.1 — AI fields
  ai_evidence_quote: string | null;
  ai_relevance_score: number | null;
  ai_confidence: AIConfidence | null;
  ai_speaker_assigned_to: AISpeakerRole | null;
  transcript_id: string | null;
  confirmed_at: string | null;
  dismissed_at: string | null;
  expires_at: string | null;

  // v3.1 — Completion & team
  completion_notes: string | null;
  completion_transcript_id: string | null;
  deal_team_visible: boolean;
  depends_on: string | null;
  snoozed_until: string | null;
  buyer_deal_score: number | null;

  // v3.2 — Free-form tags
  tags: string[];

  // v3.3 — Recurring task dedup & categories
  task_category: 'deal_task' | 'platform_task' | 'operations_task';
  carried_over: boolean;
  carry_count: number;
  source_timestamp_seconds: number | null;
}

export interface DailyStandupTaskWithRelations extends DailyStandupTask {
  assignee?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  deal?: {
    id: string;
    listing_id: string;
    listings: {
      title: string | null;
      internal_company_name: string | null;
      ebitda: number | null;
    } | null;
    deal_stages: {
      name: string;
    } | null;
  } | null;
  source_meeting?: StandupMeeting | null;
}

export interface TeamMemberAlias {
  id: string;
  profile_id: string;
  alias: string;
  created_at: string;
  created_by: string | null;
}

export interface TaskPinLog {
  id: string;
  task_id: string;
  action: 'pinned' | 'unpinned';
  pinned_rank: number | null;
  reason: string | null;
  performed_by: string;
  performed_at: string;
}

// ─── Task Type Metadata ───

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  contact_owner: 'Contact Owner',
  build_buyer_universe: 'Build Buyer Universe',
  follow_up_with_buyer: 'Follow Up with Buyer',
  send_materials: 'Send Materials',
  update_pipeline: 'Update Pipeline',
  schedule_call: 'Schedule Call',
  nda_execution: 'NDA Execution',
  ioi_loi_process: 'IOI/LOI Process',
  due_diligence: 'Due Diligence',
  buyer_qualification: 'Buyer Qualification',
  seller_relationship: 'Seller Relationship',
  buyer_ic_followup: 'Buyer IC Follow-up',
  other: 'Other',
  call: 'Call',
  email: 'Email',
  find_buyers: 'Find Buyers',
  contact_buyers: 'Contact Buyers',
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  contact_owner: 'bg-red-100 text-red-800 border-red-200',
  build_buyer_universe: 'bg-blue-100 text-blue-800 border-blue-200',
  follow_up_with_buyer: 'bg-amber-100 text-amber-800 border-amber-200',
  send_materials: 'bg-purple-100 text-purple-800 border-purple-200',
  update_pipeline: 'bg-gray-100 text-gray-800 border-gray-200',
  schedule_call: 'bg-green-100 text-green-800 border-green-200',
  nda_execution: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  ioi_loi_process: 'bg-teal-100 text-teal-800 border-teal-200',
  due_diligence: 'bg-orange-100 text-orange-800 border-orange-200',
  buyer_qualification: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  seller_relationship: 'bg-rose-100 text-rose-800 border-rose-200',
  buyer_ic_followup: 'bg-violet-100 text-violet-800 border-violet-200',
  other: 'bg-slate-100 text-slate-800 border-slate-200',
  call: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  email: 'bg-sky-100 text-sky-800 border-sky-200',
  find_buyers: 'bg-lime-100 text-lime-800 border-lime-200',
  contact_buyers: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
};

export const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'contact_owner', label: 'Contact Owner' },
  { value: 'build_buyer_universe', label: 'Build Buyer Universe' },
  { value: 'follow_up_with_buyer', label: 'Follow Up with Buyer' },
  { value: 'send_materials', label: 'Send Materials' },
  { value: 'update_pipeline', label: 'Update Pipeline' },
  { value: 'schedule_call', label: 'Schedule Call' },
  { value: 'nda_execution', label: 'NDA Execution' },
  { value: 'ioi_loi_process', label: 'IOI/LOI Process' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'buyer_qualification', label: 'Buyer Qualification' },
  { value: 'seller_relationship', label: 'Seller Relationship' },
  { value: 'buyer_ic_followup', label: 'Buyer IC Follow-up' },
  { value: 'other', label: 'Other' },
];

export const DEAL_TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'find_buyers', label: 'Find Buyers' },
  { value: 'contact_buyers', label: 'Contact Buyers' },
];

export const ENTITY_TYPE_LABELS: Record<TaskEntityType, string> = {
  listing: 'Listing',
  deal: 'Deal',
  buyer: 'Buyer',
  contact: 'Contact',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending_approval: 'Awaiting Approval',
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  overdue: 'Overdue',
  snoozed: 'Snoozed',
  cancelled: 'Cancelled',
  listing_closed: 'Listing Closed',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200',
};

export type TaskCategory = 'deal_task' | 'platform_task' | 'operations_task';

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  deal_task: 'Deal',
  platform_task: 'Platform',
  operations_task: 'Operations',
};

export const TASK_CATEGORY_COLORS: Record<TaskCategory, string> = {
  deal_task: 'bg-blue-50 text-blue-700 border-blue-200',
  platform_task: 'bg-violet-50 text-violet-700 border-violet-200',
  operations_task: 'bg-orange-50 text-orange-700 border-orange-200',
};

// ─── Priority Scoring Constants ───

export const DEAL_STAGE_SCORES: Record<string, number> = {
  Sourced: 20,
  Qualified: 30,
  'NDA Sent': 40,
  'NDA Signed': 50,
  'Fee Agreement Sent': 55,
  'Fee Agreement Signed': 60,
  'Due Diligence': 70,
  'LOI Submitted': 90,
  'Under Contract': 80,
  'Closed Won': 100,
  'Closed Lost': 0,
};

export const TASK_TYPE_SCORES: Record<TaskType, number> = {
  contact_owner: 90,
  schedule_call: 80,
  follow_up_with_buyer: 75,
  send_materials: 70,
  nda_execution: 65,
  ioi_loi_process: 60,
  due_diligence: 55,
  buyer_qualification: 50,
  build_buyer_universe: 50,
  seller_relationship: 45,
  buyer_ic_followup: 40,
  update_pipeline: 30,
  other: 40,
  call: 80,
  email: 70,
  find_buyers: 50,
  contact_buyers: 75,
};

// ─── Analytics Types ───

export interface TaskAnalyticsSummary {
  total_assigned: number;
  total_completed: number;
  total_overdue: number;
  completion_rate: number;
  avg_time_to_complete_hours: number | null;
  by_task_type: Record<TaskType, { assigned: number; completed: number; overdue: number }>;
}

export interface TeamMemberScorecard extends TaskAnalyticsSummary {
  member_id: string;
  member_name: string;
  priority_discipline_score: number;
  completion_trend: { date: string; rate: number }[];
}

export interface MeetingQualityMetrics {
  meeting_id: string;
  meeting_date: string;
  extraction_confidence_rate: number;
  needs_review_rate: number;
  tasks_per_meeting: number;
  assignee_match_rate: number;
  meeting_duration_minutes: number | null;
}

// ─── v3.1 — New Entity Types ───

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

export type TaskActivityAction =
  | 'created'
  | 'edited'
  | 'reassigned'
  | 'completed'
  | 'reopened'
  | 'snoozed'
  | 'cancelled'
  | 'confirmed'
  | 'dismissed'
  | 'commented'
  | 'priority_changed'
  | 'status_changed'
  | 'dependency_added';

export interface TaskActivityLogEntry {
  id: string;
  task_id: string;
  user_id: string;
  action: TaskActivityAction;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export type DealTeamRole = 'lead' | 'analyst' | 'support';

export interface DealTeamMember {
  id: string;
  listing_id: string;
  user_id: string;
  role: DealTeamRole;
  created_at: string;
  user?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

export type SignalType = 'positive' | 'warning' | 'critical' | 'neutral';

export interface DealSignal {
  id: string;
  listing_id: string | null;
  deal_id: string | null;
  buyer_id: string | null;
  transcript_id: string;
  signal_type: SignalType;
  signal_category: string;
  summary: string;
  verbatim_quote: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface BuyerDealCadence {
  id: string;
  buyer_id: string;
  deal_id: string;
  deal_stage_name: string;
  expected_contact_days: number;
  last_contacted_at: string | null;
  last_contact_source: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── v3.1 — Task Templates ───

export interface TaskTemplateItem {
  title: string;
  task_type: TaskType;
  due_offset_days: number;
  depends_on_index?: number; // index into the same array
  description?: string;
}

export interface TaskTemplateStage {
  name: string;
  description: string;
  tasks: TaskTemplateItem[];
}

export const DEAL_PROCESS_TEMPLATES: TaskTemplateStage[] = [
  {
    name: 'Intake & Qualification',
    description: 'Initial seller engagement and deal qualification',
    tasks: [
      { title: 'Conduct intake call with owner', task_type: 'contact_owner', due_offset_days: 7 },
      {
        title: 'Collect 3 years P&Ls from owner',
        task_type: 'send_materials',
        due_offset_days: 14,
      },
      {
        title: 'Collect EBITDA bridge documentation',
        task_type: 'send_materials',
        due_offset_days: 14,
      },
      {
        title: 'Qualify deal for full engagement',
        task_type: 'seller_relationship',
        due_offset_days: 21,
      },
    ],
  },
  {
    name: 'Build Buyer Universe',
    description: 'Research and compile potential buyers',
    tasks: [
      {
        title: 'Build initial buyer universe (50+ buyers)',
        task_type: 'build_buyer_universe',
        due_offset_days: 14,
      },
      {
        title: 'Score all buyers against deal criteria',
        task_type: 'buyer_qualification',
        due_offset_days: 21,
      },
      {
        title: 'Get seller approval on buyer list',
        task_type: 'seller_relationship',
        due_offset_days: 28,
      },
    ],
  },
  {
    name: 'NDA Phase',
    description: 'Send and track NDAs with qualified buyers',
    tasks: [
      {
        title: 'Send NDA to top 15 qualified buyers',
        task_type: 'nda_execution',
        due_offset_days: 3,
      },
      { title: 'Track NDA returns and follow up', task_type: 'nda_execution', due_offset_days: 10 },
      {
        title: 'Follow up on unsigned NDAs at 7 days',
        task_type: 'follow_up_with_buyer',
        due_offset_days: 10,
      },
    ],
  },
  {
    name: 'Deal Memo Phase',
    description: 'Share deal memo and manage buyer engagement',
    tasks: [
      {
        title: 'Share deal memo with all NDA-signed buyers',
        task_type: 'send_materials',
        due_offset_days: 1,
        depends_on_index: 0,
      },
      {
        title: 'Follow up on deal memo review and interest',
        task_type: 'follow_up_with_buyer',
        due_offset_days: 5,
      },
      { title: 'Set first round IOI deadline', task_type: 'ioi_loi_process', due_offset_days: 30 },
    ],
  },
  {
    name: 'IOI & Presentations',
    description: 'Review offers and schedule management presentations',
    tasks: [
      { title: 'Review all IOIs received', task_type: 'ioi_loi_process', due_offset_days: 3 },
      {
        title: 'Select buyers for management presentations',
        task_type: 'buyer_qualification',
        due_offset_days: 5,
      },
      {
        title: 'Schedule management presentations',
        task_type: 'schedule_call',
        due_offset_days: 10,
      },
      {
        title: 'Collect final IOIs post-presentation',
        task_type: 'ioi_loi_process',
        due_offset_days: 21,
      },
    ],
  },
  {
    name: 'LOI & Diligence',
    description: 'LOI execution and due diligence coordination',
    tasks: [
      { title: 'Send LOI to seller for review', task_type: 'ioi_loi_process', due_offset_days: 3 },
      {
        title: 'Collect seller feedback on LOI terms',
        task_type: 'seller_relationship',
        due_offset_days: 7,
      },
      { title: 'Open data room for winning buyer', task_type: 'due_diligence', due_offset_days: 3 },
      { title: 'Assign due diligence coordinator', task_type: 'due_diligence', due_offset_days: 1 },
    ],
  },
];

// ─── Buyer Engagement Templates ───

export const BUYER_ENGAGEMENT_TEMPLATES: TaskTemplateStage[] = [
  {
    name: 'Initial Outreach',
    description: 'First contact and introduction with buyer',
    tasks: [
      { title: 'Send teaser to buyer', task_type: 'send_materials', due_offset_days: 1 },
      { title: 'Follow up on teaser review', task_type: 'follow_up_with_buyer', due_offset_days: 5 },
      { title: 'Schedule intro call with buyer', task_type: 'schedule_call', due_offset_days: 7 },
    ],
  },
  {
    name: 'NDA & CIM Phase',
    description: 'NDA execution and CIM delivery to buyer',
    tasks: [
      { title: 'Send NDA to buyer', task_type: 'nda_execution', due_offset_days: 1 },
      { title: 'Follow up on unsigned NDA', task_type: 'nda_execution', due_offset_days: 7 },
      {
        title: 'Send CIM after NDA signed',
        task_type: 'send_materials',
        due_offset_days: 1,
        depends_on_index: 0,
      },
      { title: 'Follow up on CIM review', task_type: 'follow_up_with_buyer', due_offset_days: 7 },
    ],
  },
  {
    name: 'Management Presentation',
    description: 'Schedule and conduct management presentation with buyer',
    tasks: [
      { title: 'Schedule management presentation', task_type: 'schedule_call', due_offset_days: 7 },
      {
        title: 'Send prep materials for presentation',
        task_type: 'send_materials',
        due_offset_days: 3,
      },
      {
        title: 'Follow up post-presentation for feedback',
        task_type: 'follow_up_with_buyer',
        due_offset_days: 3,
      },
      { title: 'Collect IOI from buyer', task_type: 'ioi_loi_process', due_offset_days: 14 },
    ],
  },
  {
    name: 'Buyer IC Follow-up',
    description: 'Track buyer investment committee process',
    tasks: [
      {
        title: 'Follow up on IC meeting date',
        task_type: 'buyer_ic_followup',
        due_offset_days: 3,
      },
      {
        title: 'Send additional data requested by IC',
        task_type: 'send_materials',
        due_offset_days: 5,
      },
      {
        title: 'Follow up on IC decision',
        task_type: 'buyer_ic_followup',
        due_offset_days: 10,
      },
    ],
  },
];

// ─── v3.1 — Snooze Presets ───

export const SNOOZE_PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
] as const;
