export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  list_type: 'buyer' | 'seller' | 'mixed';
  created_by: string | null;
  updated_by: string | null;
  contact_count: number;
  last_pushed_at: string | null;
  last_pushed_by: string | null;
  tags: string[];
  filter_snapshot: ContactListFilterSnapshot | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields (not in table, populated by queries)
  created_by_name?: string;
  members?: ContactListMember[];
}

export interface ContactListMember {
  id: string;
  list_id: string;
  contact_id: string | null;
  contact_email: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_company: string | null;
  contact_role: string | null;
  entity_type: string;
  entity_id: string;
  added_at: string;
  removed_at: string | null;
  // Joined from contacts table via contact_id FK (fresh data)
  contact?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    company_name: string | null;
    linkedin_url: string | null;
    mobile_phone_1: string | null;
    mobile_phone_2: string | null;
    mobile_phone_3: string | null;
    office_phone: string | null;
  } | null;
  // Joined deal owner fields
  deal_owner_name?: string | null;
  deal_owner_id?: string | null;
  // Joined call tracking fields
  last_call_date?: string | null;
  total_calls?: number;
  last_disposition?: string | null;
}

export interface ContactListFilterSnapshot {
  page: string;
  searchQuery?: string;
  sourceFilter?: string;
  agreementFilter?: string;
  firmFilter?: string;
  [key: string]: unknown;
}

export interface CreateContactListInput {
  name: string;
  description?: string;
  list_type: 'buyer' | 'seller' | 'mixed';
  tags?: string[];
  filter_snapshot?: ContactListFilterSnapshot;
  members: CreateContactListMemberInput[];
}

export interface CreateContactListMemberInput {
  contact_email: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_company: string | null;
  contact_role: string | null;
  entity_type: string;
  entity_id: string;
}
