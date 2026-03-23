export interface ObjectionCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  ai_suggested: boolean;
  approved_by: string | null;
  created_at: string;
  // Computed fields from joins/aggregations
  instance_count?: number;
  overcome_rate?: number;
}

export interface ObjectionInstance {
  id: string;
  call_id: string | null;
  caller_id: string | null;
  extracted_at: string;
  objection_text: string;
  category_id: string;
  caller_response_text: string | null;
  overcame: boolean;
  call_outcome: string | null;
  handling_score: number | null;
  confidence_score: number | null;
  recording_url: string | null;
  recording_timestamp_seconds: number | null;
  status: 'auto_accepted' | 'pending_review' | 'rejected';
  manually_tagged: boolean;
  manager_note: string | null;
  created_at: string;
  // Joined fields
  caller_name?: string;
  caller_email?: string;
  company_name?: string;
  category_name?: string;
}

export interface PlaybookFramework {
  title: string;
  description: string;
  example_phrases: string[];
}

export interface PlaybookMistake {
  pattern: string;
  why_it_fails: string;
}

export interface ObjectionPlaybook {
  id: string;
  category_id: string;
  version: number;
  status: 'draft' | 'pending_review' | 'published' | 'archived';
  frameworks: PlaybookFramework[];
  mistakes_to_avoid: PlaybookMistake[];
  data_basis_count: number;
  ai_confidence: number | null;
  generated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  // Joined fields
  category_name?: string;
  category_icon?: string;
}

export type PlaybookSortOption = 'most_encountered' | 'lowest_overcome' | 'recently_updated';
