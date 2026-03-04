export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      admin_connection_requests_views: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
          last_viewed_at: string
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_deal_sourcing_views: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
          last_viewed_at: string
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_deal_sourcing_views_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          action_url: string | null
          admin_id: string
          created_at: string | null
          deal_id: string | null
          feedback_id: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          read_at: string | null
          task_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          admin_id: string
          created_at?: string | null
          deal_id?: string | null
          feedback_id?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          read_at?: string | null
          task_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          admin_id?: string
          created_at?: string | null
          deal_id?: string | null
          feedback_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          task_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "deal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_owner_leads_views: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
          last_viewed_at: string
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_signature_preferences: {
        Row: {
          admin_id: string
          calendly_url: string | null
          created_at: string
          id: string
          phone_number: string | null
          signature_html: string
          signature_text: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          calendly_url?: string | null
          created_at?: string
          id?: string
          phone_number?: string | null
          signature_html: string
          signature_text: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          calendly_url?: string | null
          created_at?: string
          id?: string
          phone_number?: string | null
          signature_html?: string
          signature_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_users_views: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
          last_viewed_at: string
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_view_state: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
          last_viewed_at: string
          updated_at: string | null
          view_type: string
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
          view_type: string
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
          last_viewed_at?: string
          updated_at?: string | null
          view_type?: string
        }
        Relationships: []
      }
      agreement_audit_log: {
        Row: {
          agreement_type: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string | null
          document_url: string | null
          firm_id: string
          id: string
          metadata: Json | null
          new_status: string
          notes: string | null
          old_status: string | null
        }
        Insert: {
          agreement_type: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string | null
          document_url?: string | null
          firm_id: string
          id?: string
          metadata?: Json | null
          new_status: string
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          agreement_type?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string | null
          document_url?: string | null
          firm_id?: string
          id?: string
          metadata?: Json | null
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_audit_log_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_command_center_usage: {
        Row: {
          category: string
          conversation_id: string | null
          created_at: string
          duration_ms: number
          estimated_cost: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          query: string
          router_bypassed: boolean
          tool_calls: number
          user_id: string
        }
        Insert: {
          category: string
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number
          estimated_cost?: number
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          query: string
          router_bypassed?: boolean
          tool_calls?: number
          user_id: string
        }
        Update: {
          category?: string
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number
          estimated_cost?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          query?: string
          router_bypassed?: boolean
          tool_calls?: number
          user_id?: string
        }
        Relationships: []
      }
      alert_delivery_logs: {
        Row: {
          alert_id: string
          created_at: string
          delivery_status: string
          error_message: string | null
          id: string
          listing_id: string
          sent_at: string | null
          user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          listing_id: string
          sent_at?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          listing_id?: string
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_delivery_logs_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "deal_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_delivery_logs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "alert_delivery_logs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_delivery_logs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          admin_id: string | null
          id: string
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          operation: string
          table_name: string
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          table_name: string
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          table_name?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      buyer_approve_decisions: {
        Row: {
          approval_reason: string | null
          buyer_id: string
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          approval_reason?: string | null
          buyer_id: string
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          approval_reason?: string | null
          buyer_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_approve_decisions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_approve_decisions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_approve_decisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "buyer_approve_decisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_approve_decisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_criteria_extractions: {
        Row: {
          completed_at: string | null
          confidence_scores: Json | null
          current_phase: string | null
          error: string | null
          extracted_criteria: Json | null
          id: string
          phases_completed: number
          source_id: string | null
          started_at: string
          status: string
          total_phases: number
          universe_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          confidence_scores?: Json | null
          current_phase?: string | null
          error?: string | null
          extracted_criteria?: Json | null
          id?: string
          phases_completed?: number
          source_id?: string | null
          started_at?: string
          status?: string
          total_phases?: number
          universe_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          confidence_scores?: Json | null
          current_phase?: string | null
          error?: string | null
          extracted_criteria?: Json | null
          id?: string
          phases_completed?: number
          source_id?: string | null
          started_at?: string
          status?: string
          total_phases?: number
          universe_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_criteria_extractions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "criteria_extraction_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_criteria_extractions_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_criteria_extractions_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_enrichment_queue: {
        Row: {
          attempts: number
          buyer_id: string
          completed_at: string | null
          created_at: string
          force: boolean | null
          id: string
          last_error: string | null
          queued_at: string
          rate_limit_reset_at: string | null
          started_at: string | null
          status: string
          universe_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          buyer_id: string
          completed_at?: string | null
          created_at?: string
          force?: boolean | null
          id?: string
          last_error?: string | null
          queued_at?: string
          rate_limit_reset_at?: string | null
          started_at?: string | null
          status?: string
          universe_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          buyer_id?: string
          completed_at?: string | null
          created_at?: string
          force?: boolean | null
          id?: string
          last_error?: string | null
          queued_at?: string
          rate_limit_reset_at?: string | null
          started_at?: string | null
          status?: string
          universe_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_enrichment_queue_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: true
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_enrichment_queue_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: true
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_enrichment_queue_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_enrichment_queue_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_introductions: {
        Row: {
          archived_at: string | null
          buyer_email: string | null
          buyer_feedback: string | null
          buyer_firm_name: string
          buyer_linkedin_url: string | null
          buyer_name: string
          buyer_phone: string | null
          company_id: string | null
          company_name: string
          contact_id: string | null
          created_at: string
          created_by: string
          expected_deal_size_high: number | null
          expected_deal_size_low: number | null
          expected_next_step_date: string | null
          id: string
          internal_champion: string | null
          internal_champion_email: string | null
          introduced_by: string | null
          introduced_by_email: string | null
          introduction_date: string | null
          introduction_method: string | null
          introduction_notes: string | null
          introduction_scheduled_date: string | null
          introduction_status: string
          listing_id: string | null
          next_step: string | null
          passed_date: string | null
          passed_notes: string | null
          passed_reason: string | null
          remarketing_buyer_id: string | null
          score_snapshot: Json | null
          targeting_reason: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          buyer_email?: string | null
          buyer_feedback?: string | null
          buyer_firm_name: string
          buyer_linkedin_url?: string | null
          buyer_name: string
          buyer_phone?: string | null
          company_id?: string | null
          company_name: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          expected_deal_size_high?: number | null
          expected_deal_size_low?: number | null
          expected_next_step_date?: string | null
          id?: string
          internal_champion?: string | null
          internal_champion_email?: string | null
          introduced_by?: string | null
          introduced_by_email?: string | null
          introduction_date?: string | null
          introduction_method?: string | null
          introduction_notes?: string | null
          introduction_scheduled_date?: string | null
          introduction_status?: string
          listing_id?: string | null
          next_step?: string | null
          passed_date?: string | null
          passed_notes?: string | null
          passed_reason?: string | null
          remarketing_buyer_id?: string | null
          score_snapshot?: Json | null
          targeting_reason?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          buyer_email?: string | null
          buyer_feedback?: string | null
          buyer_firm_name?: string
          buyer_linkedin_url?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          company_id?: string | null
          company_name?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          expected_deal_size_high?: number | null
          expected_deal_size_low?: number | null
          expected_next_step_date?: string | null
          id?: string
          internal_champion?: string | null
          internal_champion_email?: string | null
          introduced_by?: string | null
          introduced_by_email?: string | null
          introduction_date?: string | null
          introduction_method?: string | null
          introduction_notes?: string | null
          introduction_scheduled_date?: string | null
          introduction_status?: string
          listing_id?: string | null
          next_step?: string | null
          passed_date?: string | null
          passed_notes?: string | null
          passed_reason?: string | null
          remarketing_buyer_id?: string | null
          score_snapshot?: Json | null
          targeting_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_introductions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_learning_history: {
        Row: {
          action: string
          action_by: string | null
          buyer_id: string
          composite_score: number | null
          created_at: string | null
          geography_score: number | null
          id: string
          listing_id: string
          owner_goals_score: number | null
          pass_category: string | null
          pass_reason: string | null
          score_at_decision: number | null
          score_id: string | null
          service_score: number | null
          size_score: number | null
          universe_id: string | null
        }
        Insert: {
          action: string
          action_by?: string | null
          buyer_id: string
          composite_score?: number | null
          created_at?: string | null
          geography_score?: number | null
          id?: string
          listing_id: string
          owner_goals_score?: number | null
          pass_category?: string | null
          pass_reason?: string | null
          score_at_decision?: number | null
          score_id?: string | null
          service_score?: number | null
          size_score?: number | null
          universe_id?: string | null
        }
        Update: {
          action?: string
          action_by?: string | null
          buyer_id?: string
          composite_score?: number | null
          created_at?: string | null
          geography_score?: number | null
          id?: string
          listing_id?: string
          owner_goals_score?: number | null
          pass_category?: string | null
          pass_reason?: string | null
          score_at_decision?: number | null
          score_id?: string | null
          service_score?: number | null
          size_score?: number | null
          universe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_learning_history_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_learning_history_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_learning_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "buyer_learning_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_learning_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_learning_history_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "remarketing_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_learning_history_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_learning_history_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_pass_decisions: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          listing_id: string
          pass_category: string | null
          pass_reason: string | null
          user_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          listing_id: string
          pass_category?: string | null
          pass_reason?: string | null
          user_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          pass_category?: string | null
          pass_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_pass_decisions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_pass_decisions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_pass_decisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "buyer_pass_decisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_pass_decisions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_recommendation_cache: {
        Row: {
          buyer_count: number | null
          expires_at: string | null
          id: string
          listing_id: string
          results: Json
          score_version: string | null
          scored_at: string | null
        }
        Insert: {
          buyer_count?: number | null
          expires_at?: string | null
          id?: string
          listing_id: string
          results?: Json
          score_version?: string | null
          scored_at?: string | null
        }
        Update: {
          buyer_count?: number | null
          expires_at?: string | null
          id?: string
          listing_id?: string
          results?: Json
          score_version?: string | null
          scored_at?: string | null
        }
        Relationships: []
      }
      buyer_seed_cache: {
        Row: {
          buyer_ids: string[] | null
          cache_key: string
          expires_at: string | null
          seeded_at: string | null
        }
        Insert: {
          buyer_ids?: string[] | null
          cache_key: string
          expires_at?: string | null
          seeded_at?: string | null
        }
        Update: {
          buyer_ids?: string[] | null
          cache_key?: string
          expires_at?: string | null
          seeded_at?: string | null
        }
        Relationships: []
      }
      buyer_seed_log: {
        Row: {
          action: string | null
          category_cache_key: string | null
          id: string
          known_acquisitions: string[] | null
          remarketing_buyer_id: string
          seed_model: string | null
          seeded_at: string | null
          source_deal_id: string | null
          was_new_record: boolean | null
          why_relevant: string | null
        }
        Insert: {
          action?: string | null
          category_cache_key?: string | null
          id?: string
          known_acquisitions?: string[] | null
          remarketing_buyer_id: string
          seed_model?: string | null
          seeded_at?: string | null
          source_deal_id?: string | null
          was_new_record?: boolean | null
          why_relevant?: string | null
        }
        Update: {
          action?: string | null
          category_cache_key?: string | null
          id?: string
          known_acquisitions?: string[] | null
          remarketing_buyer_id?: string
          seed_model?: string | null
          seeded_at?: string | null
          source_deal_id?: string | null
          was_new_record?: boolean | null
          why_relevant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_seed_log_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_seed_log_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_transcripts: {
        Row: {
          action_items: string[] | null
          buyer_id: string
          call_date: string | null
          created_at: string | null
          duration_minutes: number | null
          embedding: string | null
          extracted_insights: Json | null
          extraction_status: string | null
          file_url: string | null
          fireflies_transcript_id: string | null
          id: string
          key_points: string[] | null
          linked_at: string | null
          linked_by: string | null
          notes: string | null
          participants: Json | null
          source: string | null
          summary: string | null
          title: string | null
          transcript_text: string | null
          transcript_url: string | null
          updated_at: string | null
        }
        Insert: {
          action_items?: string[] | null
          buyer_id: string
          call_date?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          embedding?: string | null
          extracted_insights?: Json | null
          extraction_status?: string | null
          file_url?: string | null
          fireflies_transcript_id?: string | null
          id?: string
          key_points?: string[] | null
          linked_at?: string | null
          linked_by?: string | null
          notes?: string | null
          participants?: Json | null
          source?: string | null
          summary?: string | null
          title?: string | null
          transcript_text?: string | null
          transcript_url?: string | null
          updated_at?: string | null
        }
        Update: {
          action_items?: string[] | null
          buyer_id?: string
          call_date?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          embedding?: string | null
          extracted_insights?: Json | null
          extraction_status?: string | null
          file_url?: string | null
          fireflies_transcript_id?: string | null
          id?: string
          key_points?: string[] | null
          linked_at?: string | null
          linked_by?: string | null
          notes?: string | null
          participants?: Json | null
          source?: string | null
          summary?: string | null
          title?: string | null
          transcript_text?: string | null
          transcript_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_transcripts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_transcripts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_universes: {
        Row: {
          archived: boolean
          buyer_types_criteria: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          documents: Json | null
          documents_analyzed_at: string | null
          fee_agreement_required: boolean | null
          fit_criteria: string | null
          fit_criteria_buyer_types: string | null
          fit_criteria_geography: string | null
          fit_criteria_service: string | null
          fit_criteria_size: string | null
          geography_criteria: Json | null
          geography_weight: number
          id: string
          industry_template: string | null
          kpi_scoring_config: Json | null
          ma_guide_content: string | null
          ma_guide_generated_at: string | null
          ma_guide_qa_context: Json | null
          name: string
          owner_goals_weight: number
          scoring_behavior: Json | null
          service_criteria: Json | null
          service_weight: number
          size_criteria: Json | null
          size_weight: number
          target_buyer_types: Json | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          buyer_types_criteria?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          documents?: Json | null
          documents_analyzed_at?: string | null
          fee_agreement_required?: boolean | null
          fit_criteria?: string | null
          fit_criteria_buyer_types?: string | null
          fit_criteria_geography?: string | null
          fit_criteria_service?: string | null
          fit_criteria_size?: string | null
          geography_criteria?: Json | null
          geography_weight?: number
          id?: string
          industry_template?: string | null
          kpi_scoring_config?: Json | null
          ma_guide_content?: string | null
          ma_guide_generated_at?: string | null
          ma_guide_qa_context?: Json | null
          name: string
          owner_goals_weight?: number
          scoring_behavior?: Json | null
          service_criteria?: Json | null
          service_weight?: number
          size_criteria?: Json | null
          size_weight?: number
          target_buyer_types?: Json | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          buyer_types_criteria?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          documents?: Json | null
          documents_analyzed_at?: string | null
          fee_agreement_required?: boolean | null
          fit_criteria?: string | null
          fit_criteria_buyer_types?: string | null
          fit_criteria_geography?: string | null
          fit_criteria_service?: string | null
          fit_criteria_size?: string | null
          geography_criteria?: Json | null
          geography_weight?: number
          id?: string
          industry_template?: string | null
          kpi_scoring_config?: Json | null
          ma_guide_content?: string | null
          ma_guide_generated_at?: string | null
          ma_guide_qa_context?: Json | null
          name?: string
          owner_goals_weight?: number
          scoring_behavior?: Json | null
          service_criteria?: Json | null
          service_weight?: number
          size_criteria?: Json | null
          size_weight?: number
          target_buyer_types?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      buyers: {
        Row: {
          acquisition_appetite: string | null
          acquisition_frequency: string | null
          acquisition_timeline: string | null
          admin_override_note: string | null
          admin_tier_override: number | null
          ai_seeded: boolean | null
          ai_seeded_at: string | null
          ai_seeded_from_deal_id: string | null
          alignment_checked_at: string | null
          alignment_reasoning: string | null
          alignment_score: number | null
          archived: boolean
          backfill_status: string | null
          business_summary: string | null
          business_type: string | null
          buyer_linkedin: string | null
          buyer_quality_score: number | null
          buyer_quality_score_last_calculated: string | null
          buyer_tier: number | null
          buyer_type: string | null
          buyer_type_ai_recommendation: string | null
          buyer_type_classified_at: string | null
          buyer_type_confidence: number | null
          buyer_type_needs_review: boolean | null
          buyer_type_reasoning: string | null
          buyer_type_source: string | null
          company_name: string
          company_website: string | null
          created_at: string
          customer_geographic_reach: string | null
          customer_industries: string[] | null
          data_last_updated: string | null
          email_domain: string | null
          extraction_sources: Json | null
          fee_agreement_source: string | null
          fee_agreement_status: string | null
          founded_year: number | null
          geographic_footprint: string[] | null
          has_fee_agreement: boolean | null
          hq_city: string | null
          hq_country: string | null
          hq_region: string | null
          hq_state: string | null
          id: string
          industry_tracker_id: string | null
          industry_vertical: string | null
          investment_date: string | null
          is_marketplace_member: boolean | null
          is_pe_backed: boolean | null
          is_publicly_traded: boolean | null
          marketplace_firm_id: string | null
          marketplace_joined_at: string | null
          notes: string | null
          notes_analyzed_at: string | null
          num_employees: number | null
          num_platforms: number | null
          number_of_locations: number | null
          operating_locations: string[] | null
          parent_pe_firm_id: string | null
          parent_pe_firm_name: string | null
          pe_firm_acquisitions: Json | null
          pe_firm_id: string | null
          pe_firm_linkedin: string | null
          pe_firm_name: string | null
          pe_firm_website: string | null
          platform_acquisitions: Json | null
          platform_signal_detected: boolean | null
          platform_signal_source: string | null
          platform_website: string | null
          portfolio_companies: Json | null
          primary_customer_size: string | null
          recent_acquisitions: Json | null
          revenue_model: string | null
          service_regions: string[] | null
          services_offered: string | null
          target_customer_profile: string | null
          target_ebitda_max: number | null
          target_ebitda_min: number | null
          target_geographies: string[] | null
          target_industries: string[] | null
          target_revenue_max: number | null
          target_revenue_min: number | null
          target_services: string[] | null
          thesis_summary: string | null
          total_acquisitions: number | null
          universe_id: string | null
          updated_at: string
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          acquisition_appetite?: string | null
          acquisition_frequency?: string | null
          acquisition_timeline?: string | null
          admin_override_note?: string | null
          admin_tier_override?: number | null
          ai_seeded?: boolean | null
          ai_seeded_at?: string | null
          ai_seeded_from_deal_id?: string | null
          alignment_checked_at?: string | null
          alignment_reasoning?: string | null
          alignment_score?: number | null
          archived?: boolean
          backfill_status?: string | null
          business_summary?: string | null
          business_type?: string | null
          buyer_linkedin?: string | null
          buyer_quality_score?: number | null
          buyer_quality_score_last_calculated?: string | null
          buyer_tier?: number | null
          buyer_type?: string | null
          buyer_type_ai_recommendation?: string | null
          buyer_type_classified_at?: string | null
          buyer_type_confidence?: number | null
          buyer_type_needs_review?: boolean | null
          buyer_type_reasoning?: string | null
          buyer_type_source?: string | null
          company_name: string
          company_website?: string | null
          created_at?: string
          customer_geographic_reach?: string | null
          customer_industries?: string[] | null
          data_last_updated?: string | null
          email_domain?: string | null
          extraction_sources?: Json | null
          fee_agreement_source?: string | null
          fee_agreement_status?: string | null
          founded_year?: number | null
          geographic_footprint?: string[] | null
          has_fee_agreement?: boolean | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: string | null
          hq_state?: string | null
          id?: string
          industry_tracker_id?: string | null
          industry_vertical?: string | null
          investment_date?: string | null
          is_marketplace_member?: boolean | null
          is_pe_backed?: boolean | null
          is_publicly_traded?: boolean | null
          marketplace_firm_id?: string | null
          marketplace_joined_at?: string | null
          notes?: string | null
          notes_analyzed_at?: string | null
          num_employees?: number | null
          num_platforms?: number | null
          number_of_locations?: number | null
          operating_locations?: string[] | null
          parent_pe_firm_id?: string | null
          parent_pe_firm_name?: string | null
          pe_firm_acquisitions?: Json | null
          pe_firm_id?: string | null
          pe_firm_linkedin?: string | null
          pe_firm_name?: string | null
          pe_firm_website?: string | null
          platform_acquisitions?: Json | null
          platform_signal_detected?: boolean | null
          platform_signal_source?: string | null
          platform_website?: string | null
          portfolio_companies?: Json | null
          primary_customer_size?: string | null
          recent_acquisitions?: Json | null
          revenue_model?: string | null
          service_regions?: string[] | null
          services_offered?: string | null
          target_customer_profile?: string | null
          target_ebitda_max?: number | null
          target_ebitda_min?: number | null
          target_geographies?: string[] | null
          target_industries?: string[] | null
          target_revenue_max?: number | null
          target_revenue_min?: number | null
          target_services?: string[] | null
          thesis_summary?: string | null
          total_acquisitions?: number | null
          universe_id?: string | null
          updated_at?: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          acquisition_appetite?: string | null
          acquisition_frequency?: string | null
          acquisition_timeline?: string | null
          admin_override_note?: string | null
          admin_tier_override?: number | null
          ai_seeded?: boolean | null
          ai_seeded_at?: string | null
          ai_seeded_from_deal_id?: string | null
          alignment_checked_at?: string | null
          alignment_reasoning?: string | null
          alignment_score?: number | null
          archived?: boolean
          backfill_status?: string | null
          business_summary?: string | null
          business_type?: string | null
          buyer_linkedin?: string | null
          buyer_quality_score?: number | null
          buyer_quality_score_last_calculated?: string | null
          buyer_tier?: number | null
          buyer_type?: string | null
          buyer_type_ai_recommendation?: string | null
          buyer_type_classified_at?: string | null
          buyer_type_confidence?: number | null
          buyer_type_needs_review?: boolean | null
          buyer_type_reasoning?: string | null
          buyer_type_source?: string | null
          company_name?: string
          company_website?: string | null
          created_at?: string
          customer_geographic_reach?: string | null
          customer_industries?: string[] | null
          data_last_updated?: string | null
          email_domain?: string | null
          extraction_sources?: Json | null
          fee_agreement_source?: string | null
          fee_agreement_status?: string | null
          founded_year?: number | null
          geographic_footprint?: string[] | null
          has_fee_agreement?: boolean | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: string | null
          hq_state?: string | null
          id?: string
          industry_tracker_id?: string | null
          industry_vertical?: string | null
          investment_date?: string | null
          is_marketplace_member?: boolean | null
          is_pe_backed?: boolean | null
          is_publicly_traded?: boolean | null
          marketplace_firm_id?: string | null
          marketplace_joined_at?: string | null
          notes?: string | null
          notes_analyzed_at?: string | null
          num_employees?: number | null
          num_platforms?: number | null
          number_of_locations?: number | null
          operating_locations?: string[] | null
          parent_pe_firm_id?: string | null
          parent_pe_firm_name?: string | null
          pe_firm_acquisitions?: Json | null
          pe_firm_id?: string | null
          pe_firm_linkedin?: string | null
          pe_firm_name?: string | null
          pe_firm_website?: string | null
          platform_acquisitions?: Json | null
          platform_signal_detected?: boolean | null
          platform_signal_source?: string | null
          platform_website?: string | null
          portfolio_companies?: Json | null
          primary_customer_size?: string | null
          recent_acquisitions?: Json | null
          revenue_model?: string | null
          service_regions?: string[] | null
          services_offered?: string | null
          target_customer_profile?: string | null
          target_ebitda_max?: number | null
          target_ebitda_min?: number | null
          target_geographies?: string[] | null
          target_industries?: string[] | null
          target_revenue_max?: number | null
          target_revenue_min?: number | null
          target_services?: string[] | null
          thesis_summary?: string | null
          total_acquisitions?: number | null
          universe_id?: string | null
          updated_at?: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyers_parent_pe_firm_id_fkey"
            columns: ["parent_pe_firm_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyers_parent_pe_firm_id_fkey"
            columns: ["parent_pe_firm_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_industry_tracker_id_fkey"
            columns: ["industry_tracker_id"]
            isOneToOne: false
            referencedRelation: "industry_trackers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_marketplace_firm_id_fkey"
            columns: ["marketplace_firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_pe_firm_id_fkey"
            columns: ["pe_firm_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_pe_firm_id_fkey"
            columns: ["pe_firm_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      call_intelligence: {
        Row: {
          buyer_id: string | null
          call_date: string | null
          call_summary: string | null
          call_type: string
          created_at: string | null
          deal_id: string | null
          extracted_data: Json | null
          extraction_version: string | null
          follow_up_questions: string[] | null
          id: string
          key_takeaways: string[] | null
          processed_at: string | null
          transcript_url: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_id?: string | null
          call_date?: string | null
          call_summary?: string | null
          call_type?: string
          created_at?: string | null
          deal_id?: string | null
          extracted_data?: Json | null
          extraction_version?: string | null
          follow_up_questions?: string[] | null
          id?: string
          key_takeaways?: string[] | null
          processed_at?: string | null
          transcript_url?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string | null
          call_date?: string | null
          call_summary?: string | null
          call_type?: string
          created_at?: string | null
          deal_id?: string | null
          extracted_data?: Json | null
          extraction_version?: string | null
          follow_up_questions?: string[] | null
          id?: string
          key_takeaways?: string[] | null
          processed_at?: string | null
          transcript_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      captarget_sync_exclusions: {
        Row: {
          captarget_row_hash: string | null
          company_name: string | null
          contact_title: string | null
          description_snippet: string | null
          excluded_at: string | null
          exclusion_category: string
          exclusion_reason: string
          id: string
          raw_row_data: Json | null
          source: string | null
        }
        Insert: {
          captarget_row_hash?: string | null
          company_name?: string | null
          contact_title?: string | null
          description_snippet?: string | null
          excluded_at?: string | null
          exclusion_category: string
          exclusion_reason: string
          id?: string
          raw_row_data?: Json | null
          source?: string | null
        }
        Update: {
          captarget_row_hash?: string | null
          company_name?: string | null
          contact_title?: string | null
          description_snippet?: string | null
          excluded_at?: string | null
          exclusion_category?: string
          exclusion_reason?: string
          id?: string
          raw_row_data?: Json | null
          source?: string | null
        }
        Relationships: []
      }
      captarget_sync_log: {
        Row: {
          duration_ms: number | null
          errors: Json | null
          id: string
          rows_excluded: number | null
          rows_inserted: number | null
          rows_read: number | null
          rows_skipped: number | null
          rows_updated: number | null
          status: string | null
          synced_at: string | null
        }
        Insert: {
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          rows_excluded?: number | null
          rows_inserted?: number | null
          rows_read?: number | null
          rows_skipped?: number | null
          rows_updated?: number | null
          status?: string | null
          synced_at?: string | null
        }
        Update: {
          duration_ms?: number | null
          errors?: Json | null
          id?: string
          rows_excluded?: number | null
          rows_inserted?: number | null
          rows_read?: number | null
          rows_skipped?: number | null
          rows_updated?: number | null
          status?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_analytics: {
        Row: {
          context_type: string | null
          conversation_id: string | null
          created_at: string
          deal_id: string | null
          feedback_provided: boolean | null
          id: string
          mentioned_buyer_ids: string[] | null
          mentioned_deal_ids: string[] | null
          model_used: string | null
          query_complexity: string | null
          query_intent: string | null
          query_text: string
          response_text: string | null
          response_time_ms: number | null
          session_id: string | null
          tokens_input: number | null
          tokens_output: number | null
          tokens_total: number | null
          tool_execution_time_ms: number | null
          tools_called: Json | null
          universe_id: string | null
          user_continued: boolean | null
          user_id: string | null
          user_rating: number | null
        }
        Insert: {
          context_type?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          feedback_provided?: boolean | null
          id?: string
          mentioned_buyer_ids?: string[] | null
          mentioned_deal_ids?: string[] | null
          model_used?: string | null
          query_complexity?: string | null
          query_intent?: string | null
          query_text: string
          response_text?: string | null
          response_time_ms?: number | null
          session_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          tool_execution_time_ms?: number | null
          tools_called?: Json | null
          universe_id?: string | null
          user_continued?: boolean | null
          user_id?: string | null
          user_rating?: number | null
        }
        Update: {
          context_type?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          feedback_provided?: boolean | null
          id?: string
          mentioned_buyer_ids?: string[] | null
          mentioned_deal_ids?: string[] | null
          model_used?: string | null
          query_complexity?: string | null
          query_intent?: string | null
          query_text?: string
          response_text?: string | null
          response_time_ms?: number | null
          session_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
          tool_execution_time_ms?: number | null
          tools_called?: Json | null
          universe_id?: string | null
          user_continued?: boolean | null
          user_id?: string | null
          user_rating?: number | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          archived: boolean | null
          context_type: string | null
          conversation_type: string
          created_at: string
          deal_id: string | null
          id: string
          last_message_at: string | null
          listing_id: string | null
          message_count: number | null
          messages: Json
          title: string | null
          tracker_id: string | null
          universe_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean | null
          context_type?: string | null
          conversation_type?: string
          created_at?: string
          deal_id?: string | null
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          message_count?: number | null
          messages?: Json
          title?: string | null
          tracker_id?: string | null
          universe_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean | null
          context_type?: string | null
          conversation_type?: string
          created_at?: string
          deal_id?: string | null
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          message_count?: number | null
          messages?: Json
          title?: string | null
          tracker_id?: string | null
          universe_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "chat_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "industry_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_feedback: {
        Row: {
          conversation_id: string
          created_at: string
          feedback_text: string | null
          id: string
          issue_type: string | null
          message_index: number
          rating: number
          resolved: boolean | null
          user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          feedback_text?: string | null
          id?: string
          issue_type?: string | null
          message_index: number
          rating: number
          resolved?: boolean | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          feedback_text?: string | null
          id?: string
          issue_type?: string | null
          message_index?: number
          rating?: number
          resolved?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      clay_enrichment_requests: {
        Row: {
          company_name: string | null
          completed_at: string | null
          created_at: string
          domain: string | null
          expires_at: string
          first_name: string | null
          id: string
          last_name: string | null
          linkedin_url: string | null
          raw_callback_payload: Json | null
          request_id: string
          request_type: string
          result_data: Json | null
          result_email: string | null
          result_phone: string | null
          source_entity_id: string | null
          source_function: string
          status: string
          title: string | null
          workspace_id: string
        }
        Insert: {
          company_name?: string | null
          completed_at?: string | null
          created_at?: string
          domain?: string | null
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          raw_callback_payload?: Json | null
          request_id: string
          request_type: string
          result_data?: Json | null
          result_email?: string | null
          result_phone?: string | null
          source_entity_id?: string | null
          source_function: string
          status?: string
          title?: string | null
          workspace_id: string
        }
        Update: {
          company_name?: string | null
          completed_at?: string | null
          created_at?: string
          domain?: string | null
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          raw_callback_payload?: Json | null
          request_id?: string
          request_type?: string
          result_data?: Json | null
          result_email?: string | null
          result_phone?: string | null
          source_entity_id?: string | null
          source_function?: string
          status?: string
          title?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          added_at: string
          collection_id: string
          id: string
          listing_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          id?: string
          listing_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "collection_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_messages: {
        Row: {
          body: string
          connection_request_id: string
          created_at: string
          id: string
          is_read_by_admin: boolean
          is_read_by_buyer: boolean
          message_type: string
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          body: string
          connection_request_id: string
          created_at?: string
          id?: string
          is_read_by_admin?: boolean
          is_read_by_buyer?: boolean
          message_type?: string
          sender_id?: string | null
          sender_role: string
        }
        Update: {
          body?: string
          connection_request_id?: string
          created_at?: string
          id?: string
          is_read_by_admin?: boolean
          is_read_by_buyer?: boolean
          message_type?: string
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_messages_connection_request_id_fkey"
            columns: ["connection_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_request_contacts: {
        Row: {
          created_at: string
          id: string
          primary_request_id: string
          related_request_id: string
          relationship_metadata: Json
          relationship_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          primary_request_id: string
          related_request_id: string
          relationship_metadata?: Json
          relationship_type: string
        }
        Update: {
          created_at?: string
          id?: string
          primary_request_id?: string
          related_request_id?: string
          relationship_metadata?: Json
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_request_contacts_primary_request_id_fkey"
            columns: ["primary_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_request_contacts_related_request_id_fkey"
            columns: ["related_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_requests: {
        Row: {
          admin_comment: string | null
          approved_at: string | null
          approved_by: string | null
          buyer_priority_score: number | null
          claimed_at: string | null
          claimed_by: string | null
          conversation_state: string | null
          converted_at: string | null
          converted_by: string | null
          created_at: string
          deal_specific_buyer_score: number | null
          deal_specific_platform_keywords: string[] | null
          deal_specific_platform_signal: boolean | null
          decision_at: string | null
          decision_notes: string | null
          firm_id: string | null
          flagged_for_review: boolean | null
          flagged_for_review_assigned_to: string | null
          flagged_for_review_at: string | null
          flagged_for_review_by: string | null
          followed_up: boolean | null
          followed_up_at: string | null
          followed_up_by: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_message_sender_role: string | null
          lead_company: string | null
          lead_email: string | null
          lead_fee_agreement_email_sent: boolean | null
          lead_fee_agreement_email_sent_at: string | null
          lead_fee_agreement_email_sent_by: string | null
          lead_fee_agreement_signed: boolean | null
          lead_fee_agreement_signed_at: string | null
          lead_fee_agreement_signed_by: string | null
          lead_name: string | null
          lead_nda_email_sent: boolean | null
          lead_nda_email_sent_at: string | null
          lead_nda_email_sent_by: string | null
          lead_nda_signed: boolean | null
          lead_nda_signed_at: string | null
          lead_nda_signed_by: string | null
          lead_phone: string | null
          lead_role: string | null
          listing_id: string
          negative_followed_up: boolean | null
          negative_followed_up_at: string | null
          negative_followed_up_by: string | null
          on_hold_at: string | null
          on_hold_by: string | null
          pipeline_stage_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          source: string | null
          source_lead_id: string | null
          source_metadata: Json | null
          stage_entered_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          user_message: string | null
        }
        Insert: {
          admin_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          buyer_priority_score?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          conversation_state?: string | null
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          deal_specific_buyer_score?: number | null
          deal_specific_platform_keywords?: string[] | null
          deal_specific_platform_signal?: boolean | null
          decision_at?: string | null
          decision_notes?: string | null
          firm_id?: string | null
          flagged_for_review?: boolean | null
          flagged_for_review_assigned_to?: string | null
          flagged_for_review_at?: string | null
          flagged_for_review_by?: string | null
          followed_up?: boolean | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_role?: string | null
          lead_company?: string | null
          lead_email?: string | null
          lead_fee_agreement_email_sent?: boolean | null
          lead_fee_agreement_email_sent_at?: string | null
          lead_fee_agreement_email_sent_by?: string | null
          lead_fee_agreement_signed?: boolean | null
          lead_fee_agreement_signed_at?: string | null
          lead_fee_agreement_signed_by?: string | null
          lead_name?: string | null
          lead_nda_email_sent?: boolean | null
          lead_nda_email_sent_at?: string | null
          lead_nda_email_sent_by?: string | null
          lead_nda_signed?: boolean | null
          lead_nda_signed_at?: string | null
          lead_nda_signed_by?: string | null
          lead_phone?: string | null
          lead_role?: string | null
          listing_id: string
          negative_followed_up?: boolean | null
          negative_followed_up_at?: string | null
          negative_followed_up_by?: string | null
          on_hold_at?: string | null
          on_hold_by?: string | null
          pipeline_stage_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          source?: string | null
          source_lead_id?: string | null
          source_metadata?: Json | null
          stage_entered_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          user_message?: string | null
        }
        Update: {
          admin_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          buyer_priority_score?: number | null
          claimed_at?: string | null
          claimed_by?: string | null
          conversation_state?: string | null
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          deal_specific_buyer_score?: number | null
          deal_specific_platform_keywords?: string[] | null
          deal_specific_platform_signal?: boolean | null
          decision_at?: string | null
          decision_notes?: string | null
          firm_id?: string | null
          flagged_for_review?: boolean | null
          flagged_for_review_assigned_to?: string | null
          flagged_for_review_at?: string | null
          flagged_for_review_by?: string | null
          followed_up?: boolean | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_role?: string | null
          lead_company?: string | null
          lead_email?: string | null
          lead_fee_agreement_email_sent?: boolean | null
          lead_fee_agreement_email_sent_at?: string | null
          lead_fee_agreement_email_sent_by?: string | null
          lead_fee_agreement_signed?: boolean | null
          lead_fee_agreement_signed_at?: string | null
          lead_fee_agreement_signed_by?: string | null
          lead_name?: string | null
          lead_nda_email_sent?: boolean | null
          lead_nda_email_sent_at?: string | null
          lead_nda_email_sent_by?: string | null
          lead_nda_signed?: boolean | null
          lead_nda_signed_at?: string | null
          lead_nda_signed_by?: string | null
          lead_phone?: string | null
          lead_role?: string | null
          listing_id?: string
          negative_followed_up?: boolean | null
          negative_followed_up_at?: string | null
          negative_followed_up_by?: string | null
          on_hold_at?: string | null
          on_hold_by?: string | null
          pipeline_stage_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          source?: string | null
          source_lead_id?: string | null
          source_metadata?: Json | null
          stage_entered_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          user_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_requests_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_flagged_for_review_assigned_to_fkey"
            columns: ["flagged_for_review_assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_flagged_for_review_by_fkey"
            columns: ["flagged_for_review_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "connection_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "inbound_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_activities: {
        Row: {
          activity_type: string
          answered_by: string | null
          call_connected: boolean | null
          call_connected_at: string | null
          call_direction: string | null
          call_duration_seconds: number | null
          call_ended_at: string | null
          call_outcome: string | null
          call_started_at: string | null
          call_transcript: string | null
          callback_completed_at: string | null
          callback_outcome: string | null
          callback_scheduled_date: string | null
          contact_email: string | null
          contact_id: string | null
          contact_notes: string | null
          created_at: string
          disposition_code: string | null
          disposition_label: string | null
          disposition_notes: string | null
          disposition_set_at: string | null
          id: string
          listing_id: string | null
          phoneburner_call_id: string | null
          phoneburner_contact_id: string | null
          phoneburner_event_id: string | null
          phoneburner_lead_id: string | null
          phoneburner_session_id: string | null
          phoneburner_status: string | null
          recording_duration_seconds: number | null
          recording_url: string | null
          recording_url_public: string | null
          remarketing_buyer_id: string | null
          source_system: string
          talk_time_seconds: number | null
          updated_at: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          activity_type: string
          answered_by?: string | null
          call_connected?: boolean | null
          call_connected_at?: string | null
          call_direction?: string | null
          call_duration_seconds?: number | null
          call_ended_at?: string | null
          call_outcome?: string | null
          call_started_at?: string | null
          call_transcript?: string | null
          callback_completed_at?: string | null
          callback_outcome?: string | null
          callback_scheduled_date?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_notes?: string | null
          created_at?: string
          disposition_code?: string | null
          disposition_label?: string | null
          disposition_notes?: string | null
          disposition_set_at?: string | null
          id?: string
          listing_id?: string | null
          phoneburner_call_id?: string | null
          phoneburner_contact_id?: string | null
          phoneburner_event_id?: string | null
          phoneburner_lead_id?: string | null
          phoneburner_session_id?: string | null
          phoneburner_status?: string | null
          recording_duration_seconds?: number | null
          recording_url?: string | null
          recording_url_public?: string | null
          remarketing_buyer_id?: string | null
          source_system?: string
          talk_time_seconds?: number | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          activity_type?: string
          answered_by?: string | null
          call_connected?: boolean | null
          call_connected_at?: string | null
          call_direction?: string | null
          call_duration_seconds?: number | null
          call_ended_at?: string | null
          call_outcome?: string | null
          call_started_at?: string | null
          call_transcript?: string | null
          callback_completed_at?: string | null
          callback_outcome?: string | null
          callback_scheduled_date?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_notes?: string | null
          created_at?: string
          disposition_code?: string | null
          disposition_label?: string | null
          disposition_notes?: string | null
          disposition_set_at?: string | null
          id?: string
          listing_id?: string | null
          phoneburner_call_id?: string | null
          phoneburner_contact_id?: string | null
          phoneburner_event_id?: string | null
          phoneburner_lead_id?: string | null
          phoneburner_session_id?: string | null
          phoneburner_status?: string | null
          recording_duration_seconds?: number | null
          recording_url?: string | null
          recording_url_public?: string | null
          remarketing_buyer_id?: string | null
          source_system?: string
          talk_time_seconds?: number | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_phoneburner_session_id_fkey"
            columns: ["phoneburner_session_id"]
            isOneToOne: false
            referencedRelation: "phoneburner_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_members: {
        Row: {
          added_at: string
          contact_company: string | null
          contact_email: string
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          entity_id: string
          entity_type: string
          id: string
          list_id: string
          removed_at: string | null
        }
        Insert: {
          added_at?: string
          contact_company?: string | null
          contact_email: string
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          entity_id: string
          entity_type: string
          id?: string
          list_id: string
          removed_at?: string | null
        }
        Update: {
          added_at?: string
          contact_company?: string | null
          contact_email?: string
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          list_id?: string
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          contact_count: number
          created_at: string
          created_by: string | null
          description: string | null
          filter_snapshot: Json | null
          id: string
          is_archived: boolean
          last_pushed_at: string | null
          last_pushed_by: string | null
          list_type: string
          name: string
          tags: string[] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter_snapshot?: Json | null
          id?: string
          is_archived?: boolean
          last_pushed_at?: string | null
          last_pushed_by?: string | null
          list_type?: string
          name: string
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter_snapshot?: Json | null
          id?: string
          is_archived?: boolean
          last_pushed_at?: string | null
          last_pushed_by?: string | null
          list_type?: string
          name?: string
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      contact_search_cache: {
        Row: {
          cache_key: string
          company_name: string
          created_at: string
          id: string
          results: Json
        }
        Insert: {
          cache_key: string
          company_name: string
          created_at?: string
          id?: string
          results?: Json
        }
        Update: {
          cache_key?: string
          company_name?: string
          created_at?: string
          id?: string
          results?: Json
        }
        Relationships: []
      }
      contact_search_log: {
        Row: {
          company_name: string
          created_at: string
          duration_ms: number | null
          from_cache: boolean
          id: string
          results_count: number
          title_filter: string[] | null
          user_id: string
        }
        Insert: {
          company_name: string
          created_at?: string
          duration_ms?: number | null
          from_cache?: boolean
          id?: string
          results_count?: number
          title_filter?: string[] | null
          user_id: string
        }
        Update: {
          company_name?: string
          created_at?: string
          duration_ms?: number | null
          from_cache?: boolean
          id?: string
          results_count?: number
          title_filter?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          archived: boolean | null
          company_name: string | null
          contact_type: string
          created_at: string | null
          created_by: string | null
          do_not_call: boolean | null
          do_not_call_reason: string | null
          email: string | null
          fee_agreement_signed: boolean | null
          fee_agreement_signed_at: string | null
          firm_id: string | null
          first_name: string
          id: string
          is_primary_at_firm: boolean | null
          is_primary_seller_contact: boolean | null
          last_call_attempt_at: string | null
          last_call_connected_at: string | null
          last_disposition_code: string | null
          last_disposition_date: string | null
          last_disposition_label: string | null
          last_name: string
          linkedin_url: string | null
          listing_id: string | null
          nda_signed: boolean | null
          nda_signed_at: string | null
          next_action_date: string | null
          next_action_notes: string | null
          next_action_type: string | null
          notes: string | null
          phone: string | null
          phone_number_invalid: boolean | null
          phoneburner_contact_id: string | null
          phoneburner_last_sync_at: string | null
          profile_id: string | null
          remarketing_buyer_id: string | null
          source: string | null
          title: string | null
          total_call_attempts: number | null
          total_call_duration_seconds: number | null
          total_calls_connected: number | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          created_by?: string | null
          do_not_call?: boolean | null
          do_not_call_reason?: string | null
          email?: string | null
          fee_agreement_signed?: boolean | null
          fee_agreement_signed_at?: string | null
          firm_id?: string | null
          first_name: string
          id?: string
          is_primary_at_firm?: boolean | null
          is_primary_seller_contact?: boolean | null
          last_call_attempt_at?: string | null
          last_call_connected_at?: string | null
          last_disposition_code?: string | null
          last_disposition_date?: string | null
          last_disposition_label?: string | null
          last_name?: string
          linkedin_url?: string | null
          listing_id?: string | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          next_action_date?: string | null
          next_action_notes?: string | null
          next_action_type?: string | null
          notes?: string | null
          phone?: string | null
          phone_number_invalid?: boolean | null
          phoneburner_contact_id?: string | null
          phoneburner_last_sync_at?: string | null
          profile_id?: string | null
          remarketing_buyer_id?: string | null
          source?: string | null
          title?: string | null
          total_call_attempts?: number | null
          total_call_duration_seconds?: number | null
          total_calls_connected?: number | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          company_name?: string | null
          contact_type?: string
          created_at?: string | null
          created_by?: string | null
          do_not_call?: boolean | null
          do_not_call_reason?: string | null
          email?: string | null
          fee_agreement_signed?: boolean | null
          fee_agreement_signed_at?: string | null
          firm_id?: string | null
          first_name?: string
          id?: string
          is_primary_at_firm?: boolean | null
          is_primary_seller_contact?: boolean | null
          last_call_attempt_at?: string | null
          last_call_connected_at?: string | null
          last_disposition_code?: string | null
          last_disposition_date?: string | null
          last_disposition_label?: string | null
          last_name?: string
          linkedin_url?: string | null
          listing_id?: string | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          next_action_date?: string | null
          next_action_notes?: string | null
          next_action_type?: string | null
          notes?: string | null
          phone?: string | null
          phone_number_invalid?: boolean | null
          phoneburner_contact_id?: string | null
          phoneburner_last_sync_at?: string | null
          profile_id?: string | null
          remarketing_buyer_id?: string | null
          source?: string | null
          title?: string | null
          total_call_attempts?: number | null
          total_call_duration_seconds?: number | null
          total_calls_connected?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "contacts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria_extraction_sources: {
        Row: {
          confidence_scores: Json | null
          created_at: string | null
          extracted_data: Json | null
          extraction_completed_at: string | null
          extraction_error: string | null
          extraction_started_at: string | null
          extraction_status: string
          id: string
          source_metadata: Json | null
          source_name: string | null
          source_type: string
          source_url: string | null
          universe_id: string
          updated_at: string | null
        }
        Insert: {
          confidence_scores?: Json | null
          created_at?: string | null
          extracted_data?: Json | null
          extraction_completed_at?: string | null
          extraction_error?: string | null
          extraction_started_at?: string | null
          extraction_status?: string
          id?: string
          source_metadata?: Json | null
          source_name?: string | null
          source_type?: string
          source_url?: string | null
          universe_id: string
          updated_at?: string | null
        }
        Update: {
          confidence_scores?: Json | null
          created_at?: string | null
          extracted_data?: Json | null
          extraction_completed_at?: string | null
          extraction_error?: string | null
          extraction_started_at?: string | null
          extraction_status?: string
          id?: string
          source_metadata?: Json | null
          source_name?: string | null
          source_type?: string
          source_url?: string | null
          universe_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "criteria_extraction_sources_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "criteria_extraction_sources_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job_logs: {
        Row: {
          created_at: string | null
          id: string
          job_name: string
          result: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_name: string
          result?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_name?: string
          result?: Json | null
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          active_users: number | null
          avg_session_duration: number | null
          bounce_rate: number | null
          connection_requests: number | null
          conversion_rate: number | null
          created_at: string | null
          date: string
          id: string
          listing_views: number | null
          new_listings: number | null
          new_signups: number | null
          page_views: number | null
          returning_users: number | null
          searches_performed: number | null
          successful_connections: number | null
          total_sessions: number | null
          total_users: number | null
          unique_page_views: number | null
          unique_visitors: number | null
          updated_at: string | null
        }
        Insert: {
          active_users?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          connection_requests?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          date: string
          id?: string
          listing_views?: number | null
          new_listings?: number | null
          new_signups?: number | null
          page_views?: number | null
          returning_users?: number | null
          searches_performed?: number | null
          successful_connections?: number | null
          total_sessions?: number | null
          total_users?: number | null
          unique_page_views?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Update: {
          active_users?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          connection_requests?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          date?: string
          id?: string
          listing_views?: number | null
          new_listings?: number | null
          new_signups?: number | null
          page_views?: number | null
          returning_users?: number | null
          searches_performed?: number | null
          successful_connections?: number | null
          total_sessions?: number | null
          total_users?: number | null
          unique_page_views?: number | null
          unique_visitors?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_standup_tasks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assignee_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          deal_reference: string | null
          description: string | null
          due_date: string
          entity_id: string | null
          entity_type: string | null
          extraction_confidence: string | null
          id: string
          is_manual: boolean | null
          is_pinned: boolean | null
          needs_review: boolean | null
          pin_reason: string | null
          pinned_at: string | null
          pinned_by: string | null
          pinned_rank: number | null
          priority: string | null
          priority_rank: number | null
          priority_score: number | null
          secondary_entity_id: string | null
          secondary_entity_type: string | null
          snoozed_until: string | null
          source: string | null
          source_meeting_id: string | null
          source_timestamp: string | null
          status: string
          tags: string[] | null
          task_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          deal_reference?: string | null
          description?: string | null
          due_date?: string
          entity_id?: string | null
          entity_type?: string | null
          extraction_confidence?: string | null
          id?: string
          is_manual?: boolean | null
          is_pinned?: boolean | null
          needs_review?: boolean | null
          pin_reason?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          pinned_rank?: number | null
          priority?: string | null
          priority_rank?: number | null
          priority_score?: number | null
          secondary_entity_id?: string | null
          secondary_entity_type?: string | null
          snoozed_until?: string | null
          source?: string | null
          source_meeting_id?: string | null
          source_timestamp?: string | null
          status?: string
          tags?: string[] | null
          task_type?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          deal_reference?: string | null
          description?: string | null
          due_date?: string
          entity_id?: string | null
          entity_type?: string | null
          extraction_confidence?: string | null
          id?: string
          is_manual?: boolean | null
          is_pinned?: boolean | null
          needs_review?: boolean | null
          pin_reason?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          pinned_rank?: number | null
          priority?: string | null
          priority_rank?: number | null
          priority_score?: number | null
          secondary_entity_id?: string | null
          secondary_entity_type?: string | null
          snoozed_until?: string | null
          source?: string | null
          source_meeting_id?: string | null
          source_timestamp?: string | null
          status?: string
          tags?: string[] | null
          task_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_standup_tasks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_standup_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_standup_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_standup_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_standup_tasks_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_standup_tasks_source_meeting_id_fkey"
            columns: ["source_meeting_id"]
            isOneToOne: false
            referencedRelation: "standup_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dst_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_access: {
        Row: {
          access_token: string | null
          can_view_data_room: boolean | null
          can_view_full_memo: boolean | null
          can_view_teaser: boolean | null
          contact_id: string | null
          deal_id: string
          expires_at: string | null
          fee_agreement_override: boolean | null
          fee_agreement_override_by: string | null
          fee_agreement_override_reason: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          last_access_at: string | null
          last_modified_at: string | null
          last_modified_by: string | null
          link_sent_at: string | null
          link_sent_to_email: string | null
          link_sent_via: string | null
          marketplace_user_id: string | null
          remarketing_buyer_id: string | null
          revoked_at: string | null
        }
        Insert: {
          access_token?: string | null
          can_view_data_room?: boolean | null
          can_view_full_memo?: boolean | null
          can_view_teaser?: boolean | null
          contact_id?: string | null
          deal_id: string
          expires_at?: string | null
          fee_agreement_override?: boolean | null
          fee_agreement_override_by?: string | null
          fee_agreement_override_reason?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          last_access_at?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          link_sent_at?: string | null
          link_sent_to_email?: string | null
          link_sent_via?: string | null
          marketplace_user_id?: string | null
          remarketing_buyer_id?: string | null
          revoked_at?: string | null
        }
        Update: {
          access_token?: string | null
          can_view_data_room?: boolean | null
          can_view_full_memo?: boolean | null
          can_view_teaser?: boolean | null
          contact_id?: string | null
          deal_id?: string
          expires_at?: string | null
          fee_agreement_override?: boolean | null
          fee_agreement_override_by?: string | null
          fee_agreement_override_reason?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          last_access_at?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          link_sent_at?: string | null
          link_sent_to_email?: string | null
          link_sent_via?: string | null
          marketplace_user_id?: string | null
          remarketing_buyer_id?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_room_access_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_access_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "data_room_access_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_access_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_access_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_access_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_audit_log: {
        Row: {
          action: string
          created_at: string | null
          deal_id: string
          document_id: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          deal_id: string
          document_id?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          deal_id?: string
          document_id?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      data_room_documents: {
        Row: {
          allow_download: boolean | null
          created_at: string | null
          deal_id: string
          document_category: string
          file_name: string
          file_size_bytes: number | null
          file_type: string | null
          folder_name: string
          id: string
          is_generated: boolean | null
          status: string | null
          storage_path: string
          updated_at: string | null
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          allow_download?: boolean | null
          created_at?: string | null
          deal_id: string
          document_category: string
          file_name: string
          file_size_bytes?: number | null
          file_type?: string | null
          folder_name?: string
          id?: string
          is_generated?: boolean | null
          status?: string | null
          storage_path: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          allow_download?: boolean | null
          created_at?: string | null
          deal_id?: string
          document_category?: string
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string | null
          folder_name?: string
          id?: string
          is_generated?: boolean | null
          status?: string | null
          storage_path?: string
          updated_at?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "data_room_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "data_room_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activities: {
        Row: {
          activity_type: string
          admin_id: string | null
          created_at: string | null
          deal_id: string
          description: string | null
          id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          activity_type: string
          admin_id?: string | null
          created_at?: string | null
          deal_id: string
          description?: string | null
          id?: string
          metadata?: Json | null
          title: string
        }
        Update: {
          activity_type?: string
          admin_id?: string | null
          created_at?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_alerts: {
        Row: {
          created_at: string
          criteria: Json
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deal_comments: {
        Row: {
          admin_id: string
          comment_text: string
          created_at: string
          deal_id: string
          id: string
          mentioned_admins: string[]
          updated_at: string
        }
        Insert: {
          admin_id: string
          comment_text: string
          created_at?: string
          deal_id: string
          id?: string
          mentioned_admins?: string[]
          updated_at?: string
        }
        Update: {
          admin_id?: string
          comment_text?: string
          created_at?: string
          deal_id?: string
          id?: string
          mentioned_admins?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_comments_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_data_room_access: {
        Row: {
          access_token: string
          buyer_email: string
          buyer_firm: string | null
          buyer_id: string | null
          buyer_name: string
          deal_id: string
          fee_agreement_signed_at: string | null
          granted_at: string | null
          granted_by: string
          granted_document_ids: string[] | null
          id: string
          is_active: boolean | null
          last_accessed_at: string | null
          nda_signed_at: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          access_token?: string
          buyer_email: string
          buyer_firm?: string | null
          buyer_id?: string | null
          buyer_name: string
          deal_id: string
          fee_agreement_signed_at?: string | null
          granted_at?: string | null
          granted_by: string
          granted_document_ids?: string[] | null
          id?: string
          is_active?: boolean | null
          last_accessed_at?: string | null
          nda_signed_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          access_token?: string
          buyer_email?: string
          buyer_firm?: string | null
          buyer_id?: string | null
          buyer_name?: string
          deal_id?: string
          fee_agreement_signed_at?: string | null
          granted_at?: string | null
          granted_by?: string
          granted_document_ids?: string[] | null
          id?: string
          is_active?: boolean | null
          last_accessed_at?: string | null
          nda_signed_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_data_room_access_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_data_room_access_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_data_room_access_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "deal_data_room_access_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_data_room_access_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_data_room_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_data_room_access_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_documents: {
        Row: {
          created_at: string | null
          created_by: string | null
          deal_id: string
          description: string | null
          document_type: string
          file_path: string | null
          file_size_bytes: number | null
          id: string
          is_current: boolean | null
          mime_type: string | null
          status: string | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          description?: string | null
          document_type: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          is_current?: boolean | null
          mime_type?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          description?: string | null
          document_type?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          is_current?: boolean | null
          mime_type?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_pipeline: {
        Row: {
          assigned_to: string | null
          buyer_contact_id: string | null
          buyer_priority_score: number | null
          connection_request_id: string | null
          contact_company: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          deal_score: number | null
          deleted_at: string | null
          description: string | null
          expected_close_date: string | null
          fee_agreement_status: string | null
          followed_up: boolean | null
          followed_up_at: string | null
          followed_up_by: string | null
          id: string
          inbound_lead_id: string | null
          last_enriched_at: string | null
          listing_id: string | null
          meeting_scheduled: boolean
          nda_status: string | null
          negative_followed_up: boolean | null
          negative_followed_up_at: string | null
          negative_followed_up_by: string | null
          owner_assigned_at: string | null
          owner_assigned_by: string | null
          priority: string | null
          probability: number | null
          remarketing_buyer_id: string | null
          remarketing_score_id: string | null
          seller_contact_id: string | null
          source: string | null
          stage_entered_at: string | null
          stage_id: string
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          buyer_contact_id?: string | null
          buyer_priority_score?: number | null
          connection_request_id?: string | null
          contact_company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deal_score?: number | null
          deleted_at?: string | null
          description?: string | null
          expected_close_date?: string | null
          fee_agreement_status?: string | null
          followed_up?: boolean | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          inbound_lead_id?: string | null
          last_enriched_at?: string | null
          listing_id?: string | null
          meeting_scheduled?: boolean
          nda_status?: string | null
          negative_followed_up?: boolean | null
          negative_followed_up_at?: string | null
          negative_followed_up_by?: string | null
          owner_assigned_at?: string | null
          owner_assigned_by?: string | null
          priority?: string | null
          probability?: number | null
          remarketing_buyer_id?: string | null
          remarketing_score_id?: string | null
          seller_contact_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id: string
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          buyer_contact_id?: string | null
          buyer_priority_score?: number | null
          connection_request_id?: string | null
          contact_company?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deal_score?: number | null
          deleted_at?: string | null
          description?: string | null
          expected_close_date?: string | null
          fee_agreement_status?: string | null
          followed_up?: boolean | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          inbound_lead_id?: string | null
          last_enriched_at?: string | null
          listing_id?: string | null
          meeting_scheduled?: boolean
          nda_status?: string | null
          negative_followed_up?: boolean | null
          negative_followed_up_at?: string | null
          negative_followed_up_by?: string | null
          owner_assigned_at?: string | null
          owner_assigned_by?: string | null
          priority?: string | null
          probability?: number | null
          remarketing_buyer_id?: string | null
          remarketing_score_id?: string | null
          seller_contact_id?: string | null
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_pipeline_buyer_contact_id_fkey"
            columns: ["buyer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_buyer_contact_id_fkey"
            columns: ["buyer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_connection_request_id_fkey"
            columns: ["connection_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_followed_up_by_fkey"
            columns: ["followed_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_inbound_lead_id_fkey"
            columns: ["inbound_lead_id"]
            isOneToOne: false
            referencedRelation: "inbound_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_assigned_by_fkey"
            columns: ["owner_assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_remarketing_score_id_fkey"
            columns: ["remarketing_score_id"]
            isOneToOne: false
            referencedRelation: "remarketing_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_seller_contact_id_fkey"
            columns: ["seller_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_ranking_history: {
        Row: {
          change_reason: string | null
          changed_by_user_id: string | null
          created_at: string | null
          id: string
          listing_id: string
          new_rank: number | null
          new_score: number | null
          old_rank: number | null
          old_score: number | null
        }
        Insert: {
          change_reason?: string | null
          changed_by_user_id?: string | null
          created_at?: string | null
          id?: string
          listing_id: string
          new_rank?: number | null
          new_score?: number | null
          old_rank?: number | null
          old_score?: number | null
        }
        Update: {
          change_reason?: string | null
          changed_by_user_id?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string
          new_rank?: number | null
          new_score?: number | null
          old_rank?: number | null
          old_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_ranking_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_ranking_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "deal_ranking_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_ranking_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_referrals: {
        Row: {
          cc_sender: boolean | null
          converted: boolean
          converted_at: string | null
          created_at: string
          delivery_status: string | null
          id: string
          listing_id: string
          opened: boolean
          opened_at: string | null
          personal_message: string | null
          recipient_email: string
          recipient_name: string | null
          referrer_user_id: string | null
          sent_at: string | null
        }
        Insert: {
          cc_sender?: boolean | null
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          delivery_status?: string | null
          id?: string
          listing_id: string
          opened?: boolean
          opened_at?: string | null
          personal_message?: string | null
          recipient_email: string
          recipient_name?: string | null
          referrer_user_id?: string | null
          sent_at?: string | null
        }
        Update: {
          cc_sender?: boolean | null
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          delivery_status?: string | null
          id?: string
          listing_id?: string
          opened?: boolean
          opened_at?: string | null
          personal_message?: string | null
          recipient_email?: string
          recipient_name?: string | null
          referrer_user_id?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_referrals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "deal_referrals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_referrals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_scoring_adjustments: {
        Row: {
          adjustment_type: string
          adjustment_value: number
          approved_count: number | null
          created_at: string | null
          created_by: string | null
          custom_instructions: string | null
          deal_id: string | null
          geography_weight_mult: number | null
          id: string
          last_calculated_at: string | null
          listing_id: string
          parsed_instructions: Json | null
          passed_geography: number | null
          passed_services: number | null
          passed_size: number | null
          reason: string | null
          rejected_count: number | null
          services_weight_mult: number | null
          size_weight_mult: number | null
          updated_at: string | null
        }
        Insert: {
          adjustment_type: string
          adjustment_value?: number
          approved_count?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_instructions?: string | null
          deal_id?: string | null
          geography_weight_mult?: number | null
          id?: string
          last_calculated_at?: string | null
          listing_id: string
          parsed_instructions?: Json | null
          passed_geography?: number | null
          passed_services?: number | null
          passed_size?: number | null
          reason?: string | null
          rejected_count?: number | null
          services_weight_mult?: number | null
          size_weight_mult?: number | null
          updated_at?: string | null
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number
          approved_count?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_instructions?: string | null
          deal_id?: string | null
          geography_weight_mult?: number | null
          id?: string
          last_calculated_at?: string | null
          listing_id?: string
          parsed_instructions?: Json | null
          passed_geography?: number | null
          passed_services?: number | null
          passed_size?: number | null
          reason?: string | null
          rejected_count?: number | null
          services_weight_mult?: number | null
          size_weight_mult?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_scoring_adjustments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_scoring_adjustments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "deal_scoring_adjustments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_scoring_adjustments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_sourcing_requests: {
        Row: {
          additional_notes: string | null
          admin_notes: string | null
          assigned_to: string | null
          business_categories: string[] | null
          buyer_type: string | null
          converted_to_deal_id: string | null
          created_at: string | null
          custom_message: string | null
          followed_up_at: string | null
          id: string
          investment_thesis: string | null
          revenue_max: string | null
          revenue_min: string | null
          status: string | null
          target_locations: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_notes?: string | null
          admin_notes?: string | null
          assigned_to?: string | null
          business_categories?: string[] | null
          buyer_type?: string | null
          converted_to_deal_id?: string | null
          created_at?: string | null
          custom_message?: string | null
          followed_up_at?: string | null
          id?: string
          investment_thesis?: string | null
          revenue_max?: string | null
          revenue_min?: string | null
          status?: string | null
          target_locations?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_notes?: string | null
          admin_notes?: string | null
          assigned_to?: string | null
          business_categories?: string[] | null
          buyer_type?: string | null
          converted_to_deal_id?: string | null
          created_at?: string | null
          custom_message?: string | null
          followed_up_at?: string | null
          id?: string
          investment_thesis?: string | null
          revenue_max?: string | null
          revenue_min?: string | null
          status?: string | null
          target_locations?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_sourcing_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_sourcing_requests_converted_to_deal_id_fkey"
            columns: ["converted_to_deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_sourcing_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stages: {
        Row: {
          color: string | null
          created_at: string | null
          default_probability: number | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          is_system_stage: boolean | null
          name: string
          position: number
          stage_type: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          default_probability?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_system_stage?: boolean | null
          name: string
          position: number
          stage_type?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          default_probability?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_system_stage?: boolean | null
          name?: string
          position?: number
          stage_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      deal_task_reviewers: {
        Row: {
          added_at: string | null
          added_by: string | null
          admin_id: string
          id: string
          task_id: string
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          admin_id: string
          id?: string
          task_id: string
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          admin_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_task_reviewers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "deal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          deal_id: string
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deal_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          deal_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_transcripts: {
        Row: {
          applied_at: string | null
          applied_to_deal: boolean | null
          auto_linked: boolean | null
          call_date: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          embedding: string | null
          external_participants: Json | null
          extracted_data: Json | null
          extraction_status: string | null
          fireflies_meeting_id: string | null
          fireflies_transcript_id: string | null
          has_content: boolean | null
          id: string
          listing_id: string
          match_type: string | null
          meeting_attendees: string[] | null
          participants: Json | null
          processed_at: string | null
          source: string | null
          title: string | null
          transcript_text: string
          transcript_url: string | null
          updated_at: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_to_deal?: boolean | null
          auto_linked?: boolean | null
          call_date?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          embedding?: string | null
          external_participants?: Json | null
          extracted_data?: Json | null
          extraction_status?: string | null
          fireflies_meeting_id?: string | null
          fireflies_transcript_id?: string | null
          has_content?: boolean | null
          id?: string
          listing_id: string
          match_type?: string | null
          meeting_attendees?: string[] | null
          participants?: Json | null
          processed_at?: string | null
          source?: string | null
          title?: string | null
          transcript_text: string
          transcript_url?: string | null
          updated_at?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_to_deal?: boolean | null
          auto_linked?: boolean | null
          call_date?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          embedding?: string | null
          external_participants?: Json | null
          extracted_data?: Json | null
          extraction_status?: string | null
          fireflies_meeting_id?: string | null
          fireflies_transcript_id?: string | null
          has_content?: boolean | null
          id?: string
          listing_id?: string
          match_type?: string | null
          meeting_attendees?: string[] | null
          participants?: Json | null
          processed_at?: string | null
          source?: string | null
          title?: string | null
          transcript_text?: string
          transcript_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_transcripts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "deal_transcripts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_transcripts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      disposition_mappings: {
        Row: {
          create_task: boolean | null
          created_at: string
          engagement_score_delta: number | null
          id: string
          is_active: boolean | null
          mark_do_not_call: boolean | null
          mark_phone_invalid: boolean | null
          next_action_offset_days: number | null
          next_action_type: string | null
          notes: string | null
          phoneburner_disposition_code: string
          phoneburner_disposition_label: string | null
          sourceco_contact_stage: string | null
          sourceco_contact_status: string | null
          suppress_contact: boolean | null
          suppress_duration_days: number | null
          task_due_offset_days: number | null
          task_priority: string | null
          task_type: string | null
          trigger_workflow: boolean | null
          updated_at: string
          workflow_config: Json | null
          workflow_name: string | null
        }
        Insert: {
          create_task?: boolean | null
          created_at?: string
          engagement_score_delta?: number | null
          id?: string
          is_active?: boolean | null
          mark_do_not_call?: boolean | null
          mark_phone_invalid?: boolean | null
          next_action_offset_days?: number | null
          next_action_type?: string | null
          notes?: string | null
          phoneburner_disposition_code: string
          phoneburner_disposition_label?: string | null
          sourceco_contact_stage?: string | null
          sourceco_contact_status?: string | null
          suppress_contact?: boolean | null
          suppress_duration_days?: number | null
          task_due_offset_days?: number | null
          task_priority?: string | null
          task_type?: string | null
          trigger_workflow?: boolean | null
          updated_at?: string
          workflow_config?: Json | null
          workflow_name?: string | null
        }
        Update: {
          create_task?: boolean | null
          created_at?: string
          engagement_score_delta?: number | null
          id?: string
          is_active?: boolean | null
          mark_do_not_call?: boolean | null
          mark_phone_invalid?: boolean | null
          next_action_offset_days?: number | null
          next_action_type?: string | null
          notes?: string | null
          phoneburner_disposition_code?: string
          phoneburner_disposition_label?: string | null
          sourceco_contact_stage?: string | null
          sourceco_contact_status?: string | null
          suppress_contact?: boolean | null
          suppress_duration_days?: number | null
          task_due_offset_days?: number | null
          task_priority?: string | null
          task_type?: string | null
          trigger_workflow?: boolean | null
          updated_at?: string
          workflow_config?: Json | null
          workflow_name?: string | null
        }
        Relationships: []
      }
      document_release_log: {
        Row: {
          buyer_email: string | null
          buyer_firm: string | null
          buyer_id: string | null
          buyer_name: string
          contact_id: string | null
          deal_id: string
          document_id: string | null
          fee_agreement_status_at_release: string | null
          first_opened_at: string | null
          id: string
          last_opened_at: string | null
          nda_status_at_release: string | null
          open_count: number | null
          release_method: string
          release_notes: string | null
          released_at: string | null
          released_by: string | null
          tracked_link_id: string | null
        }
        Insert: {
          buyer_email?: string | null
          buyer_firm?: string | null
          buyer_id?: string | null
          buyer_name: string
          contact_id?: string | null
          deal_id: string
          document_id?: string | null
          fee_agreement_status_at_release?: string | null
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          nda_status_at_release?: string | null
          open_count?: number | null
          release_method: string
          release_notes?: string | null
          released_at?: string | null
          released_by?: string | null
          tracked_link_id?: string | null
        }
        Update: {
          buyer_email?: string | null
          buyer_firm?: string | null
          buyer_id?: string | null
          buyer_name?: string
          contact_id?: string | null
          deal_id?: string
          document_id?: string | null
          fee_agreement_status_at_release?: string | null
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          nda_status_at_release?: string | null
          open_count?: number | null
          release_method?: string
          release_notes?: string | null
          released_at?: string | null
          released_by?: string | null
          tracked_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_release_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_release_log_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_release_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_release_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "document_release_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_release_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_release_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "deal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_release_log_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_release_log_tracked_link_id_fkey"
            columns: ["tracked_link_id"]
            isOneToOne: false
            referencedRelation: "document_tracked_links"
            referencedColumns: ["id"]
          },
        ]
      }
      document_tracked_links: {
        Row: {
          buyer_email: string
          buyer_firm: string | null
          buyer_id: string | null
          buyer_name: string
          contact_id: string | null
          created_at: string | null
          created_by: string
          deal_id: string
          document_id: string
          expires_at: string | null
          first_opened_at: string | null
          id: string
          is_active: boolean | null
          last_opened_at: string | null
          link_token: string
          open_count: number | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          buyer_email: string
          buyer_firm?: string | null
          buyer_id?: string | null
          buyer_name: string
          contact_id?: string | null
          created_at?: string | null
          created_by: string
          deal_id: string
          document_id: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          is_active?: boolean | null
          last_opened_at?: string | null
          link_token?: string
          open_count?: number | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          buyer_email?: string
          buyer_firm?: string | null
          buyer_id?: string | null
          buyer_name?: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string
          deal_id?: string
          document_id?: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          is_active?: boolean | null
          last_opened_at?: string | null
          link_token?: string
          open_count?: number | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_tracked_links_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tracked_links_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tracked_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tracked_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tracked_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "document_tracked_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tracked_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tracked_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "deal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tracked_links_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      docuseal_webhook_log: {
        Row: {
          contact_id: string | null
          created_at: string | null
          document_type: string | null
          event_type: string
          external_id: string | null
          id: string
          processed_at: string | null
          raw_payload: Json
          submission_id: string
          submitter_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          document_type?: string | null
          event_type: string
          external_id?: string | null
          id?: string
          processed_at?: string | null
          raw_payload: Json
          submission_id: string
          submitter_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          document_type?: string | null
          event_type?: string
          external_id?: string | null
          id?: string
          processed_at?: string | null
          raw_payload?: Json
          submission_id?: string
          submitter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docuseal_webhook_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_logs: {
        Row: {
          correlation_id: string
          created_at: string
          email: string
          email_type: string
          error_message: string | null
          id: string
          max_retries: number
          retry_count: number
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          correlation_id: string
          created_at?: string
          email: string
          email_type: string
          error_message?: string | null
          id?: string
          max_retries?: number
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          email?: string
          email_type?: string
          error_message?: string | null
          id?: string
          max_retries?: number
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      engagement_scores: {
        Row: {
          activity_streak: number | null
          avg_session_duration: number | null
          bounce_rate: number | null
          churn_risk_score: number | null
          connections_requested: number
          conversion_events: number | null
          created_at: string
          days_since_signup: number | null
          id: string
          last_active: string | null
          last_login: string | null
          listings_saved: number
          listings_viewed: number
          page_views: number | null
          score: number
          search_count: number | null
          session_count: number | null
          total_session_time: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activity_streak?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          churn_risk_score?: number | null
          connections_requested?: number
          conversion_events?: number | null
          created_at?: string
          days_since_signup?: number | null
          id?: string
          last_active?: string | null
          last_login?: string | null
          listings_saved?: number
          listings_viewed?: number
          page_views?: number | null
          score?: number
          search_count?: number | null
          session_count?: number | null
          total_session_time?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activity_streak?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          churn_risk_score?: number | null
          connections_requested?: number
          conversion_events?: number | null
          created_at?: string
          days_since_signup?: number | null
          id?: string
          last_active?: string | null
          last_login?: string | null
          listings_saved?: number
          listings_viewed?: number
          page_views?: number | null
          score?: number
          search_count?: number | null
          session_count?: number | null
          total_session_time?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enriched_contacts: {
        Row: {
          buyer_id: string | null
          company_name: string
          confidence: string
          created_at: string
          email: string | null
          enriched_at: string
          first_name: string
          full_name: string
          id: string
          last_name: string
          linkedin_url: string
          phone: string | null
          search_query: string | null
          source: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          buyer_id?: string | null
          company_name: string
          confidence?: string
          created_at?: string
          email?: string | null
          enriched_at?: string
          first_name?: string
          full_name: string
          id?: string
          last_name?: string
          linkedin_url?: string
          phone?: string | null
          search_query?: string | null
          source?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          buyer_id?: string | null
          company_name?: string
          confidence?: string
          created_at?: string
          email?: string | null
          enriched_at?: string
          first_name?: string
          full_name?: string
          id?: string
          last_name?: string
          linkedin_url?: string
          phone?: string | null
          search_query?: string | null
          source?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enriched_contacts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enriched_contacts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_cost_log: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          estimated_cost_usd: number | null
          function_name: string
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string
          output_tokens: number | null
          provider: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          estimated_cost_usd?: number | null
          function_name: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model: string
          output_tokens?: number | null
          provider: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          estimated_cost_usd?: number | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string
          output_tokens?: number | null
          provider?: string
        }
        Relationships: []
      }
      enrichment_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          entity_id: string
          entity_type: string
          error_message: string | null
          fields_updated: number | null
          function_name: string
          id: string
          job_id: string | null
          provider: string
          status: string
          step_name: string | null
          tokens_used: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          entity_id: string
          entity_type: string
          error_message?: string | null
          fields_updated?: number | null
          function_name: string
          id?: string
          job_id?: string | null
          provider: string
          status: string
          step_name?: string | null
          tokens_used?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          fields_updated?: number | null
          function_name?: string
          id?: string
          job_id?: string | null
          provider?: string
          status?: string
          step_name?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "enrichment_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_jobs: {
        Row: {
          circuit_breaker_tripped: boolean
          completed_at: string | null
          created_at: string
          error_count: number
          error_summary: string | null
          id: string
          job_type: string
          last_processed_id: string | null
          last_rate_limited_at: string | null
          rate_limit_count: number
          records_failed: number
          records_processed: number
          records_skipped: number
          records_succeeded: number
          source: string | null
          started_at: string | null
          status: string
          total_records: number
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          circuit_breaker_tripped?: boolean
          completed_at?: string | null
          created_at?: string
          error_count?: number
          error_summary?: string | null
          id?: string
          job_type: string
          last_processed_id?: string | null
          last_rate_limited_at?: string | null
          rate_limit_count?: number
          records_failed?: number
          records_processed?: number
          records_skipped?: number
          records_succeeded?: number
          source?: string | null
          started_at?: string | null
          status?: string
          total_records?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          circuit_breaker_tripped?: boolean
          completed_at?: string | null
          created_at?: string
          error_count?: number
          error_summary?: string | null
          id?: string
          job_type?: string
          last_processed_id?: string | null
          last_rate_limited_at?: string | null
          rate_limit_count?: number
          records_failed?: number
          records_processed?: number
          records_skipped?: number
          records_succeeded?: number
          source?: string | null
          started_at?: string | null
          status?: string
          total_records?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      enrichment_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          force: boolean | null
          id: string
          last_error: string | null
          listing_id: string
          queued_at: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          force?: boolean | null
          id?: string
          last_error?: string | null
          listing_id: string
          queued_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          force?: boolean | null
          id?: string
          last_error?: string | null
          listing_id?: string
          queued_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_queue_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "enrichment_queue_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_queue_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_rate_limits: {
        Row: {
          backoff_until: string | null
          concurrent_requests: number | null
          last_429_at: string | null
          provider: string
          updated_at: string | null
        }
        Insert: {
          backoff_until?: string | null
          concurrent_requests?: number | null
          last_429_at?: string | null
          provider: string
          updated_at?: string | null
        }
        Update: {
          backoff_until?: string | null
          concurrent_requests?: number | null
          last_429_at?: string | null
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      enrichment_test_results: {
        Row: {
          company_name: string | null
          confidence: string | null
          contact_id: string | null
          contact_name: string
          contact_type: string | null
          created_at: string
          email_found: string | null
          enrichment_ms: number | null
          enrichment_source: string | null
          error: string | null
          had_email_before: boolean
          had_linkedin_before: boolean
          had_phone_before: boolean
          id: string
          linkedin_found: string | null
          phone_found: string | null
          saved_to_contacts: boolean
          saved_to_enriched: boolean
          test_run_id: string
        }
        Insert: {
          company_name?: string | null
          confidence?: string | null
          contact_id?: string | null
          contact_name: string
          contact_type?: string | null
          created_at?: string
          email_found?: string | null
          enrichment_ms?: number | null
          enrichment_source?: string | null
          error?: string | null
          had_email_before?: boolean
          had_linkedin_before?: boolean
          had_phone_before?: boolean
          id?: string
          linkedin_found?: string | null
          phone_found?: string | null
          saved_to_contacts?: boolean
          saved_to_enriched?: boolean
          test_run_id: string
        }
        Update: {
          company_name?: string | null
          confidence?: string | null
          contact_id?: string | null
          contact_name?: string
          contact_type?: string | null
          created_at?: string
          email_found?: string | null
          enrichment_ms?: number | null
          enrichment_source?: string | null
          error?: string | null
          had_email_before?: boolean
          had_linkedin_before?: boolean
          had_phone_before?: boolean
          id?: string
          linkedin_found?: string | null
          phone_found?: string | null
          saved_to_contacts?: boolean
          saved_to_enriched?: boolean
          test_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_test_results_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "enrichment_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_test_runs: {
        Row: {
          avg_enrichment_ms: number | null
          completed_at: string | null
          contacts_enriched: number
          created_at: string
          emails_found: number
          errors: Json | null
          id: string
          linkedin_resolved: number
          phones_found: number
          started_at: string
          status: string
          success_rate: number | null
          total_contacts: number
          triggered_by: string | null
        }
        Insert: {
          avg_enrichment_ms?: number | null
          completed_at?: string | null
          contacts_enriched?: number
          created_at?: string
          emails_found?: number
          errors?: Json | null
          id?: string
          linkedin_resolved?: number
          phones_found?: number
          started_at?: string
          status?: string
          success_rate?: number | null
          total_contacts?: number
          triggered_by?: string | null
        }
        Update: {
          avg_enrichment_ms?: number | null
          completed_at?: string | null
          contacts_enriched?: number
          created_at?: string
          emails_found?: number
          errors?: Json | null
          id?: string
          linkedin_resolved?: number
          phones_found?: number
          started_at?: string
          status?: string
          success_rate?: number | null
          total_contacts?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      fee_agreement_logs: {
        Row: {
          action_type: string
          admin_email: string | null
          admin_id: string | null
          admin_name: string | null
          created_at: string
          email_sent_to: string | null
          firm_id: string | null
          id: string
          metadata: Json | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          admin_email?: string | null
          admin_id?: string | null
          admin_name?: string | null
          created_at?: string
          email_sent_to?: string | null
          firm_id?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          admin_email?: string | null
          admin_id?: string | null
          admin_name?: string | null
          created_at?: string
          email_sent_to?: string | null
          firm_id?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_agreement_logs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_messages: {
        Row: {
          admin_id: string | null
          admin_response: string | null
          category: string | null
          created_at: string
          id: string
          message: string
          page_url: string | null
          priority: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          admin_response?: string | null
          category?: string | null
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          priority?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          admin_response?: string | null
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          priority?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      filter_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      firm_agreements: {
        Row: {
          company_name_variations: Json | null
          created_at: string
          email_domain: string | null
          fee_agreement_custom_terms: string | null
          fee_agreement_deal_id: string | null
          fee_agreement_document_url: string | null
          fee_agreement_email_sent: boolean | null
          fee_agreement_email_sent_at: string | null
          fee_agreement_email_sent_by: string | null
          fee_agreement_expires_at: string | null
          fee_agreement_redline_document_url: string | null
          fee_agreement_redline_notes: string | null
          fee_agreement_scope: string | null
          fee_agreement_sent_at: string | null
          fee_agreement_signed: boolean | null
          fee_agreement_signed_at: string | null
          fee_agreement_signed_by: string | null
          fee_agreement_signed_by_name: string | null
          fee_agreement_source: string | null
          fee_agreement_status: string | null
          fee_docuseal_status: string | null
          fee_docuseal_submission_id: string | null
          fee_inherited_from_firm_id: string | null
          fee_signed_document_url: string | null
          id: string
          member_count: number | null
          metadata: Json | null
          nda_custom_terms: string | null
          nda_document_url: string | null
          nda_docuseal_status: string | null
          nda_docuseal_submission_id: string | null
          nda_email_sent: boolean | null
          nda_email_sent_at: string | null
          nda_email_sent_by: string | null
          nda_expires_at: string | null
          nda_inherited_from_firm_id: string | null
          nda_redline_document_url: string | null
          nda_redline_notes: string | null
          nda_sent_at: string | null
          nda_signed: boolean | null
          nda_signed_at: string | null
          nda_signed_by: string | null
          nda_signed_by_name: string | null
          nda_signed_document_url: string | null
          nda_source: string | null
          nda_status: string | null
          normalized_company_name: string
          primary_company_name: string
          updated_at: string
          website_domain: string | null
        }
        Insert: {
          company_name_variations?: Json | null
          created_at?: string
          email_domain?: string | null
          fee_agreement_custom_terms?: string | null
          fee_agreement_deal_id?: string | null
          fee_agreement_document_url?: string | null
          fee_agreement_email_sent?: boolean | null
          fee_agreement_email_sent_at?: string | null
          fee_agreement_email_sent_by?: string | null
          fee_agreement_expires_at?: string | null
          fee_agreement_redline_document_url?: string | null
          fee_agreement_redline_notes?: string | null
          fee_agreement_scope?: string | null
          fee_agreement_sent_at?: string | null
          fee_agreement_signed?: boolean | null
          fee_agreement_signed_at?: string | null
          fee_agreement_signed_by?: string | null
          fee_agreement_signed_by_name?: string | null
          fee_agreement_source?: string | null
          fee_agreement_status?: string | null
          fee_docuseal_status?: string | null
          fee_docuseal_submission_id?: string | null
          fee_inherited_from_firm_id?: string | null
          fee_signed_document_url?: string | null
          id?: string
          member_count?: number | null
          metadata?: Json | null
          nda_custom_terms?: string | null
          nda_document_url?: string | null
          nda_docuseal_status?: string | null
          nda_docuseal_submission_id?: string | null
          nda_email_sent?: boolean | null
          nda_email_sent_at?: string | null
          nda_email_sent_by?: string | null
          nda_expires_at?: string | null
          nda_inherited_from_firm_id?: string | null
          nda_redline_document_url?: string | null
          nda_redline_notes?: string | null
          nda_sent_at?: string | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          nda_signed_by?: string | null
          nda_signed_by_name?: string | null
          nda_signed_document_url?: string | null
          nda_source?: string | null
          nda_status?: string | null
          normalized_company_name: string
          primary_company_name: string
          updated_at?: string
          website_domain?: string | null
        }
        Update: {
          company_name_variations?: Json | null
          created_at?: string
          email_domain?: string | null
          fee_agreement_custom_terms?: string | null
          fee_agreement_deal_id?: string | null
          fee_agreement_document_url?: string | null
          fee_agreement_email_sent?: boolean | null
          fee_agreement_email_sent_at?: string | null
          fee_agreement_email_sent_by?: string | null
          fee_agreement_expires_at?: string | null
          fee_agreement_redline_document_url?: string | null
          fee_agreement_redline_notes?: string | null
          fee_agreement_scope?: string | null
          fee_agreement_sent_at?: string | null
          fee_agreement_signed?: boolean | null
          fee_agreement_signed_at?: string | null
          fee_agreement_signed_by?: string | null
          fee_agreement_signed_by_name?: string | null
          fee_agreement_source?: string | null
          fee_agreement_status?: string | null
          fee_docuseal_status?: string | null
          fee_docuseal_submission_id?: string | null
          fee_inherited_from_firm_id?: string | null
          fee_signed_document_url?: string | null
          id?: string
          member_count?: number | null
          metadata?: Json | null
          nda_custom_terms?: string | null
          nda_document_url?: string | null
          nda_docuseal_status?: string | null
          nda_docuseal_submission_id?: string | null
          nda_email_sent?: boolean | null
          nda_email_sent_at?: string | null
          nda_email_sent_by?: string | null
          nda_expires_at?: string | null
          nda_inherited_from_firm_id?: string | null
          nda_redline_document_url?: string | null
          nda_redline_notes?: string | null
          nda_sent_at?: string | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          nda_signed_by?: string | null
          nda_signed_by_name?: string | null
          nda_signed_document_url?: string | null
          nda_source?: string | null
          nda_status?: string | null
          normalized_company_name?: string
          primary_company_name?: string
          updated_at?: string
          website_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_agreements_fee_agreement_deal_id_fkey"
            columns: ["fee_agreement_deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "firm_agreements_fee_agreement_deal_id_fkey"
            columns: ["fee_agreement_deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_agreements_fee_agreement_deal_id_fkey"
            columns: ["fee_agreement_deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_agreements_fee_inherited_from_firm_id_fkey"
            columns: ["fee_inherited_from_firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_agreements_nda_inherited_from_firm_id_fkey"
            columns: ["nda_inherited_from_firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_domain_aliases: {
        Row: {
          created_at: string | null
          created_by: string | null
          domain: string
          firm_id: string
          id: string
          is_primary: boolean | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          domain: string
          firm_id: string
          id?: string
          is_primary?: boolean | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          domain?: string
          firm_id?: string
          id?: string
          is_primary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_domain_aliases_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_members: {
        Row: {
          added_at: string
          added_by: string | null
          connection_request_id: string | null
          firm_id: string
          id: string
          inbound_lead_id: string | null
          is_primary_contact: boolean | null
          lead_company: string | null
          lead_email: string | null
          lead_name: string | null
          member_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          connection_request_id?: string | null
          firm_id: string
          id?: string
          inbound_lead_id?: string | null
          is_primary_contact?: boolean | null
          lead_company?: string | null
          lead_email?: string | null
          lead_name?: string | null
          member_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          connection_request_id?: string | null
          firm_id?: string
          id?: string
          inbound_lead_id?: string | null
          is_primary_contact?: boolean | null
          lead_company?: string | null
          lead_email?: string | null
          lead_name?: string | null
          member_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_members_connection_request_id_fkey"
            columns: ["connection_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_members_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_members_inbound_lead_id_fkey"
            columns: ["inbound_lead_id"]
            isOneToOne: false
            referencedRelation: "inbound_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      global_activity_queue: {
        Row: {
          actor_id: string | null
          classification: string
          completed_at: string | null
          completed_items: number
          context_json: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          error_log: Json | null
          error_message: string | null
          event_type: string
          failed_items: number
          id: string
          operation_type: string
          processed_at: string | null
          processor: string | null
          queued_at: string
          started_at: string | null
          status: string
          total_items: number
        }
        Insert: {
          actor_id?: string | null
          classification?: string
          completed_at?: string | null
          completed_items?: number
          context_json?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_log?: Json | null
          error_message?: string | null
          event_type?: string
          failed_items?: number
          id?: string
          operation_type: string
          processed_at?: string | null
          processor?: string | null
          queued_at?: string
          started_at?: string | null
          status?: string
          total_items?: number
        }
        Update: {
          actor_id?: string | null
          classification?: string
          completed_at?: string | null
          completed_items?: number
          context_json?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_log?: Json | null
          error_message?: string | null
          event_type?: string
          failed_items?: number
          id?: string
          operation_type?: string
          processed_at?: string | null
          processor?: string | null
          queued_at?: string
          started_at?: string | null
          status?: string
          total_items?: number
        }
        Relationships: []
      }
      heyreach_campaign_leads: {
        Row: {
          buyer_contact_id: string | null
          campaign_id: string
          company_name: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          heyreach_lead_id: string | null
          id: string
          last_activity_at: string | null
          last_name: string | null
          lead_category: string | null
          lead_status: string | null
          linkedin_url: string
          metadata: Json | null
          remarketing_buyer_id: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_contact_id?: string | null
          campaign_id: string
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          heyreach_lead_id?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          lead_category?: string | null
          lead_status?: string | null
          linkedin_url: string
          metadata?: Json | null
          remarketing_buyer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_contact_id?: string | null
          campaign_id?: string
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          heyreach_lead_id?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          lead_category?: string | null
          lead_status?: string | null
          linkedin_url?: string
          metadata?: Json | null
          remarketing_buyer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heyreach_campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "heyreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      heyreach_campaign_stats: {
        Row: {
          campaign_id: string
          connected: number | null
          connection_rate: number | null
          contacted: number | null
          id: string
          interested: number | null
          not_interested: number | null
          replied: number | null
          response_rate: number | null
          snapshot_at: string | null
          total_leads: number | null
        }
        Insert: {
          campaign_id: string
          connected?: number | null
          connection_rate?: number | null
          contacted?: number | null
          id?: string
          interested?: number | null
          not_interested?: number | null
          replied?: number | null
          response_rate?: number | null
          snapshot_at?: string | null
          total_leads?: number | null
        }
        Update: {
          campaign_id?: string
          connected?: number | null
          connection_rate?: number | null
          contacted?: number | null
          id?: string
          interested?: number | null
          not_interested?: number | null
          replied?: number | null
          response_rate?: number | null
          snapshot_at?: string | null
          total_leads?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "heyreach_campaign_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "heyreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      heyreach_campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          heyreach_campaign_id: number
          id: string
          last_synced_at: string | null
          lead_count: number | null
          name: string
          settings: Json | null
          status: string | null
          universe_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          heyreach_campaign_id: number
          id?: string
          last_synced_at?: string | null
          lead_count?: number | null
          name: string
          settings?: Json | null
          status?: string | null
          universe_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          heyreach_campaign_id?: number
          id?: string
          last_synced_at?: string | null
          lead_count?: number | null
          name?: string
          settings?: Json | null
          status?: string | null
          universe_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heyreach_campaigns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "heyreach_campaigns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heyreach_campaigns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heyreach_campaigns_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heyreach_campaigns_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      heyreach_webhook_events: {
        Row: {
          created_at: string | null
          event_type: string
          heyreach_campaign_id: number | null
          id: string
          lead_email: string | null
          lead_linkedin_url: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          heyreach_campaign_id?: number | null
          id?: string
          lead_email?: string | null
          lead_linkedin_url?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          heyreach_campaign_id?: number | null
          id?: string
          lead_email?: string | null
          lead_linkedin_url?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Relationships: []
      }
      inbound_leads: {
        Row: {
          admin_notes: string | null
          business_website: string | null
          company_name: string | null
          contacted_owner: boolean | null
          converted_at: string | null
          converted_by: string | null
          converted_to_request_id: string | null
          created_at: string
          duplicate_info: string | null
          email: string
          estimated_revenue_range: string | null
          firm_id: string | null
          id: string
          is_duplicate: boolean | null
          lead_type: string | null
          mapped_at: string | null
          mapped_by: string | null
          mapped_to_listing_id: string | null
          mapped_to_listing_title: string | null
          message: string | null
          name: string
          phone_number: string | null
          priority_score: number
          role: string | null
          sale_timeline: string | null
          source: string
          source_form_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          business_website?: string | null
          company_name?: string | null
          contacted_owner?: boolean | null
          converted_at?: string | null
          converted_by?: string | null
          converted_to_request_id?: string | null
          created_at?: string
          duplicate_info?: string | null
          email: string
          estimated_revenue_range?: string | null
          firm_id?: string | null
          id?: string
          is_duplicate?: boolean | null
          lead_type?: string | null
          mapped_at?: string | null
          mapped_by?: string | null
          mapped_to_listing_id?: string | null
          mapped_to_listing_title?: string | null
          message?: string | null
          name: string
          phone_number?: string | null
          priority_score?: number
          role?: string | null
          sale_timeline?: string | null
          source?: string
          source_form_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          business_website?: string | null
          company_name?: string | null
          contacted_owner?: boolean | null
          converted_at?: string | null
          converted_by?: string | null
          converted_to_request_id?: string | null
          created_at?: string
          duplicate_info?: string | null
          email?: string
          estimated_revenue_range?: string | null
          firm_id?: string | null
          id?: string
          is_duplicate?: boolean | null
          lead_type?: string | null
          mapped_at?: string | null
          mapped_by?: string | null
          mapped_to_listing_id?: string | null
          mapped_to_listing_title?: string | null
          message?: string | null
          name?: string
          phone_number?: string | null
          priority_score?: number
          role?: string | null
          sale_timeline?: string | null
          source?: string
          source_form_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_leads_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_leads_converted_to_request_id_fkey"
            columns: ["converted_to_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_leads_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_leads_mapped_by_fkey"
            columns: ["mapped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_leads_mapped_to_listing_id_fkey"
            columns: ["mapped_to_listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "inbound_leads_mapped_to_listing_id_fkey"
            columns: ["mapped_to_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_leads_mapped_to_listing_id_fkey"
            columns: ["mapped_to_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_leads: {
        Row: {
          calculator_inputs: Json
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          email: string
          external_lead_id: string | null
          full_name: string
          id: string
          ip_address: string | null
          lead_source: string | null
          received_at: string | null
          region: string | null
          valuation_result: Json
          website: string
        }
        Insert: {
          calculator_inputs: Json
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          email: string
          external_lead_id?: string | null
          full_name: string
          id?: string
          ip_address?: string | null
          lead_source?: string | null
          received_at?: string | null
          region?: string | null
          valuation_result: Json
          website: string
        }
        Update: {
          calculator_inputs?: Json
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          email?: string
          external_lead_id?: string | null
          full_name?: string
          id?: string
          ip_address?: string | null
          lead_source?: string | null
          received_at?: string | null
          region?: string | null
          valuation_result?: Json
          website?: string
        }
        Relationships: []
      }
      industry_trackers: {
        Row: {
          archived: boolean | null
          buyer_count: number | null
          buyer_types_criteria: Json | null
          color: string | null
          created_at: string | null
          deal_count: number | null
          description: string | null
          geography_criteria: Json | null
          geography_mode: string | null
          geography_weight: number | null
          id: string
          is_active: boolean | null
          kpi_scoring_config: Json | null
          name: string
          owner_goals_weight: number | null
          service_adjacency_map: Json | null
          service_criteria: Json | null
          service_mix_weight: number | null
          size_criteria: Json | null
          size_weight: number | null
          universe_id: string | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          buyer_count?: number | null
          buyer_types_criteria?: Json | null
          color?: string | null
          created_at?: string | null
          deal_count?: number | null
          description?: string | null
          geography_criteria?: Json | null
          geography_mode?: string | null
          geography_weight?: number | null
          id?: string
          is_active?: boolean | null
          kpi_scoring_config?: Json | null
          name: string
          owner_goals_weight?: number | null
          service_adjacency_map?: Json | null
          service_criteria?: Json | null
          service_mix_weight?: number | null
          size_criteria?: Json | null
          size_weight?: number | null
          universe_id?: string | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          buyer_count?: number | null
          buyer_types_criteria?: Json | null
          color?: string | null
          created_at?: string | null
          deal_count?: number | null
          description?: string | null
          geography_criteria?: Json | null
          geography_mode?: string | null
          geography_weight?: number | null
          id?: string
          is_active?: boolean | null
          kpi_scoring_config?: Json | null
          name?: string
          owner_goals_weight?: number | null
          service_adjacency_map?: Json | null
          service_criteria?: Json | null
          service_mix_weight?: number | null
          size_criteria?: Json | null
          size_weight?: number | null
          universe_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_trackers_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_trackers_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      introduction_activity: {
        Row: {
          activity_date: string
          activity_type: string
          actor: string | null
          buyer_introduction_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          activity_date?: string
          activity_type: string
          actor?: string | null
          buyer_introduction_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          activity_date?: string
          activity_type?: string
          actor?: string | null
          buyer_introduction_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "introduction_activity_buyer_introduction_id_fkey"
            columns: ["buyer_introduction_id"]
            isOneToOne: false
            referencedRelation: "buyer_introductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_activity_buyer_introduction_id_fkey"
            columns: ["buyer_introduction_id"]
            isOneToOne: false
            referencedRelation: "introduced_and_passed_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_activity_buyer_introduction_id_fkey"
            columns: ["buyer_introduction_id"]
            isOneToOne: false
            referencedRelation: "not_yet_introduced_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      introduction_status_log: {
        Row: {
          buyer_introduction_id: string
          changed_at: string
          changed_by: string
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
        }
        Insert: {
          buyer_introduction_id: string
          changed_at?: string
          changed_by: string
          id?: string
          new_status: string
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          buyer_introduction_id?: string
          changed_at?: string
          changed_by?: string
          id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "introduction_status_log_buyer_introduction_id_fkey"
            columns: ["buyer_introduction_id"]
            isOneToOne: false
            referencedRelation: "buyer_introductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_status_log_buyer_introduction_id_fkey"
            columns: ["buyer_introduction_id"]
            isOneToOne: false
            referencedRelation: "introduced_and_passed_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_status_log_buyer_introduction_id_fkey"
            columns: ["buyer_introduction_id"]
            isOneToOne: false
            referencedRelation: "not_yet_introduced_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_memo_versions: {
        Row: {
          content: Json
          created_at: string | null
          edited_by: string | null
          html_content: string | null
          id: string
          memo_id: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string | null
          edited_by?: string | null
          html_content?: string | null
          id?: string
          memo_id: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string | null
          edited_by?: string | null
          html_content?: string | null
          id?: string
          memo_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_memo_versions_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "lead_memos"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_memos: {
        Row: {
          branding: string | null
          content: Json
          created_at: string | null
          created_by: string | null
          deal_id: string
          generated_from: Json | null
          html_content: string | null
          id: string
          memo_type: string
          pdf_storage_path: string | null
          published_at: string | null
          published_by: string | null
          status: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          branding?: string | null
          content?: Json
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          generated_from?: Json | null
          html_content?: string | null
          id?: string
          memo_type: string
          pdf_storage_path?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          branding?: string | null
          content?: Json
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          generated_from?: Json | null
          html_content?: string | null
          id?: string
          memo_type?: string
          pdf_storage_path?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_memos_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "lead_memos_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_memos_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_analytics: {
        Row: {
          action_type: string
          clicked_elements: Json | null
          created_at: string | null
          id: string
          listing_id: string | null
          referrer_page: string | null
          scroll_depth: number | null
          search_query: string | null
          session_id: string | null
          time_spent: number | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          action_type: string
          clicked_elements?: Json | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          referrer_page?: string | null
          scroll_depth?: number | null
          search_query?: string | null
          session_id?: string | null
          time_spent?: number | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          action_type?: string
          clicked_elements?: Json | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          referrer_page?: string | null
          scroll_depth?: number | null
          search_query?: string | null
          session_id?: string | null
          time_spent?: number | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_analytics_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listing_analytics_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_analytics_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_conversations: {
        Row: {
          admin_id: string | null
          connection_request_id: string
          created_at: string
          id: string
          listing_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          connection_request_id: string
          created_at?: string
          id?: string
          listing_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          connection_request_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_conversations_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_conversations_connection_request_id_fkey"
            columns: ["connection_request_id"]
            isOneToOne: true
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listing_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          acquisition_type: string | null
          address: string | null
          address_city: string | null
          address_country: string | null
          address_state: string | null
          address_zip: string | null
          business_model: string | null
          buyer_universe_description: string | null
          buyer_universe_generated_at: string | null
          buyer_universe_label: string | null
          captarget_call_notes: string | null
          captarget_client_name: string | null
          captarget_contact_date: string | null
          captarget_interest_type: string | null
          captarget_outreach_channel: string | null
          captarget_row_hash: string | null
          captarget_sheet_tab: string | null
          captarget_source_url: string | null
          captarget_status: string | null
          categories: string[] | null
          category: string | null
          competitive_position: string | null
          created_at: string
          custom_metric_label: string | null
          custom_metric_subtitle: string | null
          custom_metric_value: string | null
          custom_sections: Json | null
          customer_concentration: number | null
          customer_geography: string | null
          customer_types: string | null
          deal_identifier: string | null
          deal_owner_id: string | null
          deal_size_score: number | null
          deal_source: string | null
          deal_total_score: number | null
          deleted_at: string | null
          description: string | null
          description_html: string | null
          description_json: Json | null
          ebitda: number | null
          ebitda_is_inferred: boolean | null
          ebitda_margin: number | null
          ebitda_metric_subtitle: string | null
          ebitda_score: number | null
          ebitda_source_quote: string | null
          end_market_description: string | null
          enriched_at: string | null
          enrichment_status: string | null
          executive_summary: string | null
          external_id: string | null
          external_source: string | null
          extraction_sources: Json | null
          files: string[] | null
          financial_followup_questions: string[] | null
          fireflies_url: string | null
          founded_year: number | null
          fts: unknown
          full_time_employees: number | null
          general_notes: string | null
          geographic_states: string[] | null
          google_maps_url: string | null
          google_place_id: string | null
          google_rating: number | null
          google_review_count: number | null
          growth_drivers: Json | null
          growth_trajectory: string | null
          hero_description: string | null
          id: string
          image_url: string | null
          industry: string | null
          industry_tier: number | null
          industry_tier_name: string | null
          internal_company_name: string | null
          internal_contact_info: string | null
          internal_deal_memo_link: string | null
          internal_notes: string | null
          internal_primary_owner: string | null
          internal_salesforce_link: string | null
          investment_thesis: string | null
          is_internal_deal: boolean
          is_priority_target: boolean | null
          is_publicly_traded: boolean | null
          key_quotes: string[] | null
          key_risks: Json | null
          linkedin_boost: number | null
          linkedin_employee_count: number | null
          linkedin_employee_range: string | null
          linkedin_match_confidence: string | null
          linkedin_match_signals: Json | null
          linkedin_url: string | null
          linkedin_verified_at: string | null
          location: string | null
          location_radius_requirement: string | null
          main_contact_email: string | null
          main_contact_first_name: string | null
          main_contact_last_name: string | null
          main_contact_linkedin: string | null
          main_contact_name: string | null
          main_contact_phone: string | null
          main_contact_title: string | null
          management_depth: string | null
          manual_rank_override: number | null
          metric_3_custom_label: string | null
          metric_3_custom_subtitle: string | null
          metric_3_custom_value: string | null
          metric_3_type: string | null
          metric_4_custom_label: string | null
          metric_4_custom_subtitle: string | null
          metric_4_custom_value: string | null
          metric_4_type: string | null
          needs_buyer_search: boolean | null
          needs_buyer_search_at: string | null
          needs_buyer_search_by: string | null
          needs_owner_contact: boolean | null
          needs_owner_contact_at: string | null
          needs_owner_contact_by: string | null
          notes: string | null
          notes_analyzed_at: string | null
          number_of_locations: number | null
          owner_goals: string | null
          owner_notes: string | null
          owner_response: string | null
          ownership_structure: string | null
          part_time_employees: number | null
          presented_by_admin_id: string | null
          primary_owner_id: string | null
          project_name: string | null
          published_at: string | null
          published_by_admin_id: string | null
          pushed_to_all_deals: boolean | null
          pushed_to_all_deals_at: string | null
          pushed_to_marketplace: boolean | null
          pushed_to_marketplace_at: string | null
          pushed_to_marketplace_by: string | null
          quality_calculation_version: string | null
          real_estate_info: string | null
          referral_partner_id: string | null
          remarketing_status: string | null
          revenue: number | null
          revenue_is_inferred: boolean | null
          revenue_metric_subtitle: string | null
          revenue_model: string | null
          revenue_score: number | null
          revenue_source_quote: string | null
          salesforce_account_id: string | null
          scoring_notes: string | null
          seller_interest_score: number | null
          seller_involvement_preference: string | null
          seller_motivation: string | null
          service_mix: string | null
          services: string[] | null
          sf_created_date: string | null
          sf_historic_note_summary: string | null
          sf_interest_in_selling: string | null
          sf_last_modified_date: string | null
          sf_marketplace_sub_stage: string | null
          sf_note_summary: string | null
          sf_owner_id: string | null
          sf_previous_search_opportunity_id: string | null
          sf_primary_client_account_id: string | null
          sf_primary_opportunity_id: string | null
          sf_record_type_id: string | null
          sf_remarketing: boolean | null
          sf_remarketing_cb_create_date: string | null
          sf_remarketing_reason: string | null
          sf_remarketing_target_stages: string | null
          sf_remarks_internal: string | null
          sf_target_stage: string | null
          sf_target_sub_stage: string | null
          sf_tier: string | null
          source_deal_id: string | null
          special_requirements: string | null
          status: string
          status_tag: string | null
          street_address: string | null
          tags: string[] | null
          team_page_employee_count: number | null
          technology_systems: string | null
          timeline_notes: string | null
          timeline_preference: string | null
          title: string
          transition_preferences: string | null
          universe_build_flagged: boolean | null
          universe_build_flagged_at: string | null
          universe_build_flagged_by: string | null
          updated_at: string
          visible_to_buyer_types: string[] | null
          website: string
        }
        Insert: {
          acquisition_type?: string | null
          address?: string | null
          address_city?: string | null
          address_country?: string | null
          address_state?: string | null
          address_zip?: string | null
          business_model?: string | null
          buyer_universe_description?: string | null
          buyer_universe_generated_at?: string | null
          buyer_universe_label?: string | null
          captarget_call_notes?: string | null
          captarget_client_name?: string | null
          captarget_contact_date?: string | null
          captarget_interest_type?: string | null
          captarget_outreach_channel?: string | null
          captarget_row_hash?: string | null
          captarget_sheet_tab?: string | null
          captarget_source_url?: string | null
          captarget_status?: string | null
          categories?: string[] | null
          category?: string | null
          competitive_position?: string | null
          created_at?: string
          custom_metric_label?: string | null
          custom_metric_subtitle?: string | null
          custom_metric_value?: string | null
          custom_sections?: Json | null
          customer_concentration?: number | null
          customer_geography?: string | null
          customer_types?: string | null
          deal_identifier?: string | null
          deal_owner_id?: string | null
          deal_size_score?: number | null
          deal_source?: string | null
          deal_total_score?: number | null
          deleted_at?: string | null
          description?: string | null
          description_html?: string | null
          description_json?: Json | null
          ebitda?: number | null
          ebitda_is_inferred?: boolean | null
          ebitda_margin?: number | null
          ebitda_metric_subtitle?: string | null
          ebitda_score?: number | null
          ebitda_source_quote?: string | null
          end_market_description?: string | null
          enriched_at?: string | null
          enrichment_status?: string | null
          executive_summary?: string | null
          external_id?: string | null
          external_source?: string | null
          extraction_sources?: Json | null
          files?: string[] | null
          financial_followup_questions?: string[] | null
          fireflies_url?: string | null
          founded_year?: number | null
          fts?: unknown
          full_time_employees?: number | null
          general_notes?: string | null
          geographic_states?: string[] | null
          google_maps_url?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          growth_drivers?: Json | null
          growth_trajectory?: string | null
          hero_description?: string | null
          id?: string
          image_url?: string | null
          industry?: string | null
          industry_tier?: number | null
          industry_tier_name?: string | null
          internal_company_name?: string | null
          internal_contact_info?: string | null
          internal_deal_memo_link?: string | null
          internal_notes?: string | null
          internal_primary_owner?: string | null
          internal_salesforce_link?: string | null
          investment_thesis?: string | null
          is_internal_deal?: boolean
          is_priority_target?: boolean | null
          is_publicly_traded?: boolean | null
          key_quotes?: string[] | null
          key_risks?: Json | null
          linkedin_boost?: number | null
          linkedin_employee_count?: number | null
          linkedin_employee_range?: string | null
          linkedin_match_confidence?: string | null
          linkedin_match_signals?: Json | null
          linkedin_url?: string | null
          linkedin_verified_at?: string | null
          location?: string | null
          location_radius_requirement?: string | null
          main_contact_email?: string | null
          main_contact_first_name?: string | null
          main_contact_last_name?: string | null
          main_contact_linkedin?: string | null
          main_contact_name?: string | null
          main_contact_phone?: string | null
          main_contact_title?: string | null
          management_depth?: string | null
          manual_rank_override?: number | null
          metric_3_custom_label?: string | null
          metric_3_custom_subtitle?: string | null
          metric_3_custom_value?: string | null
          metric_3_type?: string | null
          metric_4_custom_label?: string | null
          metric_4_custom_subtitle?: string | null
          metric_4_custom_value?: string | null
          metric_4_type?: string | null
          needs_buyer_search?: boolean | null
          needs_buyer_search_at?: string | null
          needs_buyer_search_by?: string | null
          needs_owner_contact?: boolean | null
          needs_owner_contact_at?: string | null
          needs_owner_contact_by?: string | null
          notes?: string | null
          notes_analyzed_at?: string | null
          number_of_locations?: number | null
          owner_goals?: string | null
          owner_notes?: string | null
          owner_response?: string | null
          ownership_structure?: string | null
          part_time_employees?: number | null
          presented_by_admin_id?: string | null
          primary_owner_id?: string | null
          project_name?: string | null
          published_at?: string | null
          published_by_admin_id?: string | null
          pushed_to_all_deals?: boolean | null
          pushed_to_all_deals_at?: string | null
          pushed_to_marketplace?: boolean | null
          pushed_to_marketplace_at?: string | null
          pushed_to_marketplace_by?: string | null
          quality_calculation_version?: string | null
          real_estate_info?: string | null
          referral_partner_id?: string | null
          remarketing_status?: string | null
          revenue?: number | null
          revenue_is_inferred?: boolean | null
          revenue_metric_subtitle?: string | null
          revenue_model?: string | null
          revenue_score?: number | null
          revenue_source_quote?: string | null
          salesforce_account_id?: string | null
          scoring_notes?: string | null
          seller_interest_score?: number | null
          seller_involvement_preference?: string | null
          seller_motivation?: string | null
          service_mix?: string | null
          services?: string[] | null
          sf_created_date?: string | null
          sf_historic_note_summary?: string | null
          sf_interest_in_selling?: string | null
          sf_last_modified_date?: string | null
          sf_marketplace_sub_stage?: string | null
          sf_note_summary?: string | null
          sf_owner_id?: string | null
          sf_previous_search_opportunity_id?: string | null
          sf_primary_client_account_id?: string | null
          sf_primary_opportunity_id?: string | null
          sf_record_type_id?: string | null
          sf_remarketing?: boolean | null
          sf_remarketing_cb_create_date?: string | null
          sf_remarketing_reason?: string | null
          sf_remarketing_target_stages?: string | null
          sf_remarks_internal?: string | null
          sf_target_stage?: string | null
          sf_target_sub_stage?: string | null
          sf_tier?: string | null
          source_deal_id?: string | null
          special_requirements?: string | null
          status?: string
          status_tag?: string | null
          street_address?: string | null
          tags?: string[] | null
          team_page_employee_count?: number | null
          technology_systems?: string | null
          timeline_notes?: string | null
          timeline_preference?: string | null
          title: string
          transition_preferences?: string | null
          universe_build_flagged?: boolean | null
          universe_build_flagged_at?: string | null
          universe_build_flagged_by?: string | null
          updated_at?: string
          visible_to_buyer_types?: string[] | null
          website: string
        }
        Update: {
          acquisition_type?: string | null
          address?: string | null
          address_city?: string | null
          address_country?: string | null
          address_state?: string | null
          address_zip?: string | null
          business_model?: string | null
          buyer_universe_description?: string | null
          buyer_universe_generated_at?: string | null
          buyer_universe_label?: string | null
          captarget_call_notes?: string | null
          captarget_client_name?: string | null
          captarget_contact_date?: string | null
          captarget_interest_type?: string | null
          captarget_outreach_channel?: string | null
          captarget_row_hash?: string | null
          captarget_sheet_tab?: string | null
          captarget_source_url?: string | null
          captarget_status?: string | null
          categories?: string[] | null
          category?: string | null
          competitive_position?: string | null
          created_at?: string
          custom_metric_label?: string | null
          custom_metric_subtitle?: string | null
          custom_metric_value?: string | null
          custom_sections?: Json | null
          customer_concentration?: number | null
          customer_geography?: string | null
          customer_types?: string | null
          deal_identifier?: string | null
          deal_owner_id?: string | null
          deal_size_score?: number | null
          deal_source?: string | null
          deal_total_score?: number | null
          deleted_at?: string | null
          description?: string | null
          description_html?: string | null
          description_json?: Json | null
          ebitda?: number | null
          ebitda_is_inferred?: boolean | null
          ebitda_margin?: number | null
          ebitda_metric_subtitle?: string | null
          ebitda_score?: number | null
          ebitda_source_quote?: string | null
          end_market_description?: string | null
          enriched_at?: string | null
          enrichment_status?: string | null
          executive_summary?: string | null
          external_id?: string | null
          external_source?: string | null
          extraction_sources?: Json | null
          files?: string[] | null
          financial_followup_questions?: string[] | null
          fireflies_url?: string | null
          founded_year?: number | null
          fts?: unknown
          full_time_employees?: number | null
          general_notes?: string | null
          geographic_states?: string[] | null
          google_maps_url?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          growth_drivers?: Json | null
          growth_trajectory?: string | null
          hero_description?: string | null
          id?: string
          image_url?: string | null
          industry?: string | null
          industry_tier?: number | null
          industry_tier_name?: string | null
          internal_company_name?: string | null
          internal_contact_info?: string | null
          internal_deal_memo_link?: string | null
          internal_notes?: string | null
          internal_primary_owner?: string | null
          internal_salesforce_link?: string | null
          investment_thesis?: string | null
          is_internal_deal?: boolean
          is_priority_target?: boolean | null
          is_publicly_traded?: boolean | null
          key_quotes?: string[] | null
          key_risks?: Json | null
          linkedin_boost?: number | null
          linkedin_employee_count?: number | null
          linkedin_employee_range?: string | null
          linkedin_match_confidence?: string | null
          linkedin_match_signals?: Json | null
          linkedin_url?: string | null
          linkedin_verified_at?: string | null
          location?: string | null
          location_radius_requirement?: string | null
          main_contact_email?: string | null
          main_contact_first_name?: string | null
          main_contact_last_name?: string | null
          main_contact_linkedin?: string | null
          main_contact_name?: string | null
          main_contact_phone?: string | null
          main_contact_title?: string | null
          management_depth?: string | null
          manual_rank_override?: number | null
          metric_3_custom_label?: string | null
          metric_3_custom_subtitle?: string | null
          metric_3_custom_value?: string | null
          metric_3_type?: string | null
          metric_4_custom_label?: string | null
          metric_4_custom_subtitle?: string | null
          metric_4_custom_value?: string | null
          metric_4_type?: string | null
          needs_buyer_search?: boolean | null
          needs_buyer_search_at?: string | null
          needs_buyer_search_by?: string | null
          needs_owner_contact?: boolean | null
          needs_owner_contact_at?: string | null
          needs_owner_contact_by?: string | null
          notes?: string | null
          notes_analyzed_at?: string | null
          number_of_locations?: number | null
          owner_goals?: string | null
          owner_notes?: string | null
          owner_response?: string | null
          ownership_structure?: string | null
          part_time_employees?: number | null
          presented_by_admin_id?: string | null
          primary_owner_id?: string | null
          project_name?: string | null
          published_at?: string | null
          published_by_admin_id?: string | null
          pushed_to_all_deals?: boolean | null
          pushed_to_all_deals_at?: string | null
          pushed_to_marketplace?: boolean | null
          pushed_to_marketplace_at?: string | null
          pushed_to_marketplace_by?: string | null
          quality_calculation_version?: string | null
          real_estate_info?: string | null
          referral_partner_id?: string | null
          remarketing_status?: string | null
          revenue?: number | null
          revenue_is_inferred?: boolean | null
          revenue_metric_subtitle?: string | null
          revenue_model?: string | null
          revenue_score?: number | null
          revenue_source_quote?: string | null
          salesforce_account_id?: string | null
          scoring_notes?: string | null
          seller_interest_score?: number | null
          seller_involvement_preference?: string | null
          seller_motivation?: string | null
          service_mix?: string | null
          services?: string[] | null
          sf_created_date?: string | null
          sf_historic_note_summary?: string | null
          sf_interest_in_selling?: string | null
          sf_last_modified_date?: string | null
          sf_marketplace_sub_stage?: string | null
          sf_note_summary?: string | null
          sf_owner_id?: string | null
          sf_previous_search_opportunity_id?: string | null
          sf_primary_client_account_id?: string | null
          sf_primary_opportunity_id?: string | null
          sf_record_type_id?: string | null
          sf_remarketing?: boolean | null
          sf_remarketing_cb_create_date?: string | null
          sf_remarketing_reason?: string | null
          sf_remarketing_target_stages?: string | null
          sf_remarks_internal?: string | null
          sf_target_stage?: string | null
          sf_target_sub_stage?: string | null
          sf_tier?: string | null
          source_deal_id?: string | null
          special_requirements?: string | null
          status?: string
          status_tag?: string | null
          street_address?: string | null
          tags?: string[] | null
          team_page_employee_count?: number | null
          technology_systems?: string | null
          timeline_notes?: string | null
          timeline_preference?: string | null
          title?: string
          transition_preferences?: string | null
          universe_build_flagged?: boolean | null
          universe_build_flagged_at?: string | null
          universe_build_flagged_by?: string | null
          updated_at?: string
          visible_to_buyer_types?: string[] | null
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_deal_owner_id_fkey"
            columns: ["deal_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_presented_by_admin_id_fkey"
            columns: ["presented_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_primary_owner_id_fkey"
            columns: ["primary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_published_by_admin_id_fkey"
            columns: ["published_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_referral_partner_id_fkey"
            columns: ["referral_partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_source_deal_id_fkey"
            columns: ["source_deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listings_source_deal_id_fkey"
            columns: ["source_deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_source_deal_id_fkey"
            columns: ["source_deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      ma_guide_generations: {
        Row: {
          completed_at: string | null
          created_at: string
          current_phase: string | null
          error: string | null
          generated_content: Json | null
          id: string
          phases_completed: number
          started_at: string
          status: string
          total_phases: number
          universe_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          error?: string | null
          generated_content?: Json | null
          id?: string
          phases_completed?: number
          started_at?: string
          status?: string
          total_phases?: number
          universe_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          error?: string | null
          generated_content?: Json | null
          id?: string
          phases_completed?: number
          started_at?: string
          status?: string
          total_phases?: number
          universe_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ma_guide_generations_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ma_guide_generations_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_approval_queue: {
        Row: {
          buyer_email: string
          buyer_firm: string | null
          buyer_message: string | null
          buyer_name: string
          buyer_role: string | null
          connection_request_id: string
          created_at: string | null
          deal_id: string
          decline_category: string | null
          decline_email_sent: boolean | null
          decline_reason: string | null
          id: string
          match_confidence: string | null
          matched_buyer_id: string | null
          release_log_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_email: string
          buyer_firm?: string | null
          buyer_message?: string | null
          buyer_name: string
          buyer_role?: string | null
          connection_request_id: string
          created_at?: string | null
          deal_id: string
          decline_category?: string | null
          decline_email_sent?: boolean | null
          decline_reason?: string | null
          id?: string
          match_confidence?: string | null
          matched_buyer_id?: string | null
          release_log_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_email?: string
          buyer_firm?: string | null
          buyer_message?: string | null
          buyer_name?: string
          buyer_role?: string | null
          connection_request_id?: string
          created_at?: string | null
          deal_id?: string
          decline_category?: string | null
          decline_email_sent?: boolean | null
          decline_reason?: string | null
          id?: string
          match_confidence?: string | null
          matched_buyer_id?: string | null
          release_log_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_approval_queue_connection_request_id_fkey"
            columns: ["connection_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_approval_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "marketplace_approval_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_approval_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_approval_queue_matched_buyer_id_fkey"
            columns: ["matched_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_approval_queue_matched_buyer_id_fkey"
            columns: ["matched_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_approval_queue_release_log_id_fkey"
            columns: ["release_log_id"]
            isOneToOne: false
            referencedRelation: "document_release_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_approval_queue_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_distribution_log: {
        Row: {
          channel: string
          deal_id: string
          email_address: string | null
          email_subject: string | null
          id: string
          marketplace_user_id: string | null
          memo_id: string | null
          memo_type: string
          notes: string | null
          remarketing_buyer_id: string | null
          sent_at: string | null
          sent_by: string | null
        }
        Insert: {
          channel: string
          deal_id: string
          email_address?: string | null
          email_subject?: string | null
          id?: string
          marketplace_user_id?: string | null
          memo_id?: string | null
          memo_type: string
          notes?: string | null
          remarketing_buyer_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
        }
        Update: {
          channel?: string
          deal_id?: string
          email_address?: string | null
          email_subject?: string | null
          id?: string
          marketplace_user_id?: string | null
          memo_id?: string | null
          memo_type?: string
          notes?: string | null
          remarketing_buyer_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memo_distribution_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "memo_distribution_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_distribution_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_distribution_log_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "lead_memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_distribution_log_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memo_distribution_log_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      nda_logs: {
        Row: {
          action_type: string
          admin_email: string | null
          admin_id: string | null
          admin_name: string | null
          created_at: string
          email_sent_to: string | null
          firm_id: string | null
          id: string
          metadata: Json | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          admin_email?: string | null
          admin_id?: string | null
          admin_name?: string | null
          created_at?: string
          email_sent_to?: string | null
          firm_id?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          admin_email?: string | null
          admin_id?: string | null
          admin_name?: string | null
          created_at?: string
          email_sent_to?: string | null
          firm_id?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nda_logs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_rate_limits: {
        Row: {
          created_at: string
          email: string
          id: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      outreach_records: {
        Row: {
          buyer_id: string
          cim_sent_at: string | null
          cim_sent_by: string | null
          contacted_at: string | null
          contacted_by: string | null
          created_at: string
          created_by: string | null
          id: string
          last_contact_date: string | null
          listing_id: string
          meeting_notes: string | null
          meeting_scheduled_at: string | null
          nda_sent_at: string | null
          nda_sent_by: string | null
          nda_signed_at: string | null
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          outcome: string | null
          outcome_at: string | null
          outcome_notes: string | null
          priority: string | null
          score_id: string | null
          universe_id: string | null
          updated_at: string
        }
        Insert: {
          buyer_id: string
          cim_sent_at?: string | null
          cim_sent_by?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_contact_date?: string | null
          listing_id: string
          meeting_notes?: string | null
          meeting_scheduled_at?: string | null
          nda_sent_at?: string | null
          nda_sent_by?: string | null
          nda_signed_at?: string | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_notes?: string | null
          priority?: string | null
          score_id?: string | null
          universe_id?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          cim_sent_at?: string | null
          cim_sent_by?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_contact_date?: string | null
          listing_id?: string
          meeting_notes?: string | null
          meeting_scheduled_at?: string | null
          nda_sent_at?: string | null
          nda_sent_by?: string | null
          nda_signed_at?: string | null
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_notes?: string | null
          priority?: string | null
          score_id?: string | null
          universe_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_records_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_records_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_records_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "outreach_records_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_records_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_records_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "remarketing_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_records_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_records_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_intro_notifications: {
        Row: {
          created_at: string | null
          deal_id: string
          email_error: string | null
          email_status: string | null
          id: string
          listing_id: string
          metadata: Json | null
          primary_owner_id: string
          sent_at: string | null
          sent_by: string | null
        }
        Insert: {
          created_at?: string | null
          deal_id: string
          email_error?: string | null
          email_status?: string | null
          id?: string
          listing_id: string
          metadata?: Json | null
          primary_owner_id: string
          sent_at?: string | null
          sent_by?: string | null
        }
        Update: {
          created_at?: string | null
          deal_id?: string
          email_error?: string | null
          email_status?: string | null
          id?: string
          listing_id?: string
          metadata?: Json | null
          primary_owner_id?: string
          sent_at?: string | null
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_intro_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_intro_notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "owner_intro_notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_intro_notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_intro_notifications_primary_owner_id_fkey"
            columns: ["primary_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_intro_notifications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          created_at: string | null
          exit_page: boolean | null
          id: string
          page_path: string
          page_title: string | null
          referrer: string | null
          scroll_depth: number | null
          session_id: string | null
          time_on_page: number | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string | null
          exit_page?: boolean | null
          id?: string
          page_path: string
          page_title?: string | null
          referrer?: string | null
          scroll_depth?: number | null
          session_id?: string | null
          time_on_page?: number | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string | null
          exit_page?: boolean | null
          id?: string
          page_path?: string
          page_title?: string | null
          referrer?: string | null
          scroll_depth?: number | null
          session_id?: string | null
          time_on_page?: number | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          token: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          token: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          token?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      pe_backfill_log: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          matched_pe_firm_id: string | null
          matched_pe_firm_name: string | null
          method_used: string | null
          outcome: string | null
          pe_firm_name_cleaned: string | null
          pe_firm_name_raw: string | null
          platform_buyer_id: string | null
          platform_name: string | null
          reasoning: string | null
          run_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          matched_pe_firm_id?: string | null
          matched_pe_firm_name?: string | null
          method_used?: string | null
          outcome?: string | null
          pe_firm_name_cleaned?: string | null
          pe_firm_name_raw?: string | null
          platform_buyer_id?: string | null
          platform_name?: string | null
          reasoning?: string | null
          run_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          matched_pe_firm_id?: string | null
          matched_pe_firm_name?: string | null
          method_used?: string | null
          outcome?: string | null
          pe_firm_name_cleaned?: string | null
          pe_firm_name_raw?: string | null
          platform_buyer_id?: string | null
          platform_name?: string | null
          reasoning?: string | null
          run_id?: string | null
        }
        Relationships: []
      }
      pe_backfill_review_queue: {
        Row: {
          ai_reasoning: string | null
          candidate_matches: Json | null
          chosen_pe_firm_id: string | null
          confidence_score: number | null
          created_at: string
          id: string
          pe_firm_name_cleaned: string
          pe_firm_name_raw: string
          platform_buyer_id: string
          platform_name: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          ai_reasoning?: string | null
          candidate_matches?: Json | null
          chosen_pe_firm_id?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          pe_firm_name_cleaned: string
          pe_firm_name_raw: string
          platform_buyer_id: string
          platform_name: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          ai_reasoning?: string | null
          candidate_matches?: Json | null
          chosen_pe_firm_id?: string | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          pe_firm_name_cleaned?: string
          pe_firm_name_raw?: string
          platform_buyer_id?: string
          platform_name?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_backfill_review_queue_chosen_pe_firm_id_fkey"
            columns: ["chosen_pe_firm_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_backfill_review_queue_chosen_pe_firm_id_fkey"
            columns: ["chosen_pe_firm_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_backfill_review_queue_platform_buyer_id_fkey"
            columns: ["platform_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_backfill_review_queue_platform_buyer_id_fkey"
            columns: ["platform_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_backfill_review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pe_link_queue: {
        Row: {
          buyer_id: string
          id: string
          pe_firm_name_raw: string | null
          queued_at: string
          status: string
        }
        Insert: {
          buyer_id: string
          id?: string
          pe_firm_name_raw?: string | null
          queued_at?: string
          status?: string
        }
        Update: {
          buyer_id?: string
          id?: string
          pe_firm_name_raw?: string | null
          queued_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_link_queue_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: true
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_link_queue_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: true
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      phoneburner_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          display_name: string | null
          expires_at: string
          id: string
          is_manual_token: boolean
          phoneburner_user_email: string | null
          phoneburner_user_id: string | null
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          display_name?: string | null
          expires_at: string
          id?: string
          is_manual_token?: boolean
          phoneburner_user_email?: string | null
          phoneburner_user_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          display_name?: string | null
          expires_at?: string
          id?: string
          is_manual_token?: boolean
          phoneburner_user_email?: string | null
          phoneburner_user_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      phoneburner_sessions: {
        Row: {
          completed_at: string | null
          connection_rate_percentage: number | null
          contact_type: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          last_activity_at: string | null
          list_id: string | null
          phoneburner_session_id: string | null
          qualification_rate_percentage: number | null
          session_description: string | null
          session_name: string
          session_status: string | null
          session_type: string | null
          started_at: string | null
          target_geography: string | null
          target_industry: string | null
          total_call_time_seconds: number | null
          total_callbacks_scheduled: number | null
          total_connections: number | null
          total_contacts_active: number | null
          total_contacts_added: number | null
          total_contacts_completed: number | null
          total_decision_maker_conversations: number | null
          total_dials: number | null
          total_disqualified: number | null
          total_meetings_scheduled: number | null
          total_no_answers: number | null
          total_qualified_leads: number | null
          total_talk_time_seconds: number | null
          total_voicemails_left: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          connection_rate_percentage?: number | null
          contact_type?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_activity_at?: string | null
          list_id?: string | null
          phoneburner_session_id?: string | null
          qualification_rate_percentage?: number | null
          session_description?: string | null
          session_name: string
          session_status?: string | null
          session_type?: string | null
          started_at?: string | null
          target_geography?: string | null
          target_industry?: string | null
          total_call_time_seconds?: number | null
          total_callbacks_scheduled?: number | null
          total_connections?: number | null
          total_contacts_active?: number | null
          total_contacts_added?: number | null
          total_contacts_completed?: number | null
          total_decision_maker_conversations?: number | null
          total_dials?: number | null
          total_disqualified?: number | null
          total_meetings_scheduled?: number | null
          total_no_answers?: number | null
          total_qualified_leads?: number | null
          total_talk_time_seconds?: number | null
          total_voicemails_left?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          connection_rate_percentage?: number | null
          contact_type?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          last_activity_at?: string | null
          list_id?: string | null
          phoneburner_session_id?: string | null
          qualification_rate_percentage?: number | null
          session_description?: string | null
          session_name?: string
          session_status?: string | null
          session_type?: string | null
          started_at?: string | null
          target_geography?: string | null
          target_industry?: string | null
          total_call_time_seconds?: number | null
          total_callbacks_scheduled?: number | null
          total_connections?: number | null
          total_contacts_active?: number | null
          total_contacts_added?: number | null
          total_contacts_completed?: number | null
          total_decision_maker_conversations?: number | null
          total_dials?: number | null
          total_disqualified?: number | null
          total_meetings_scheduled?: number | null
          total_no_answers?: number | null
          total_qualified_leads?: number | null
          total_talk_time_seconds?: number | null
          total_voicemails_left?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phoneburner_sessions_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      phoneburner_webhooks_log: {
        Row: {
          contact_activity_id: string | null
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          ip_address: unknown
          max_retries: number | null
          next_retry_at: string | null
          payload: Json
          phoneburner_call_id: string | null
          phoneburner_contact_id: string | null
          phoneburner_session_id: string | null
          phoneburner_user_id: string | null
          processing_completed_at: string | null
          processing_duration_ms: number | null
          processing_error: string | null
          processing_started_at: string | null
          processing_status: string
          received_at: string
          retry_count: number | null
          signature_valid: boolean | null
          sourceco_contact_id: string | null
          updated_at: string
        }
        Insert: {
          contact_activity_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          max_retries?: number | null
          next_retry_at?: string | null
          payload: Json
          phoneburner_call_id?: string | null
          phoneburner_contact_id?: string | null
          phoneburner_session_id?: string | null
          phoneburner_user_id?: string | null
          processing_completed_at?: string | null
          processing_duration_ms?: number | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string
          received_at?: string
          retry_count?: number | null
          signature_valid?: boolean | null
          sourceco_contact_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_activity_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          max_retries?: number | null
          next_retry_at?: string | null
          payload?: Json
          phoneburner_call_id?: string | null
          phoneburner_contact_id?: string | null
          phoneburner_session_id?: string | null
          phoneburner_user_id?: string | null
          processing_completed_at?: string | null
          processing_duration_ms?: number | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string
          received_at?: string
          retry_count?: number | null
          signature_valid?: boolean | null
          sourceco_contact_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phoneburner_webhooks_log_contact_activity_id_fkey"
            columns: ["contact_activity_id"]
            isOneToOne: false
            referencedRelation: "contact_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_views: {
        Row: {
          created_at: string
          description: string | null
          filter_config: Json | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          stage_config: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          filter_config?: Json | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          stage_config?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          filter_config?: Json | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          stage_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          acq_equity_band: string | null
          admin_override_note: string | null
          admin_tier_override: number | null
          anchor_investors_summary: string | null
          approval_status: string
          aum: string | null
          backers_summary: string | null
          bio: string | null
          business_categories: Json | null
          buyer_org_url: string | null
          buyer_quality_score: number | null
          buyer_quality_score_last_calculated: string | null
          buyer_role: string | null
          buyer_tier: number | null
          buyer_type: string | null
          committed_equity_band: string | null
          company: string | null
          company_name: string | null
          corpdev_intent: string | null
          created_at: string
          deal_intent: string | null
          deal_size_band: string | null
          deal_sourcing_methods: Json | null
          deal_structure_preference: string | null
          deleted_at: string | null
          deploying_capital_now: string | null
          deployment_timing: string | null
          discretion_type: string | null
          email: string
          email_verified: boolean
          equity_source: Json | null
          estimated_revenue: string | null
          exclusions: Json | null
          fee_agreement_email_sent: boolean | null
          fee_agreement_email_sent_at: string | null
          fee_agreement_signed: boolean | null
          fee_agreement_signed_at: string | null
          financing_plan: Json | null
          first_blog_landing: string | null
          first_external_referrer: string | null
          first_name: string
          first_seen_at: string | null
          first_utm_source: string | null
          flex_sub2m_ebitda: boolean | null
          flex_subxm_ebitda: boolean | null
          fund_size: string | null
          funded_by: string | null
          funding_source: string | null
          geographic_focus: Json | null
          id: string
          ideal_target: string | null
          ideal_target_description: string | null
          include_keywords: Json | null
          industry_expertise: Json | null
          integration_plan: Json | null
          investment_size: Json | null
          is_admin: boolean | null
          is_funded: string | null
          job_title: string | null
          last_name: string
          linkedin_profile: string
          mandate_blurb: string | null
          max_equity_today_band: string | null
          nda_email_sent: boolean | null
          nda_email_sent_at: string | null
          nda_signed: boolean | null
          nda_signed_at: string | null
          needs_loan: string | null
          on_behalf_of_buyer: string | null
          onboarding_completed: boolean | null
          operating_company_targets: Json | null
          owner_intent: string | null
          owner_timeline: string | null
          owning_business_unit: string | null
          permanent_capital: boolean | null
          phone_number: string | null
          platform_signal_detected: boolean | null
          platform_signal_source: string | null
          portfolio_company_addon: string | null
          referral_source: string | null
          referral_source_detail: string | null
          remarketing_buyer_id: string | null
          revenue_range_max: string | null
          revenue_range_min: string | null
          role: string | null
          search_stage: string | null
          search_type: string | null
          specific_business_search: string | null
          target_acquisition_volume: string | null
          target_company_size: string | null
          target_deal_size_max: number | null
          target_deal_size_min: number | null
          target_locations: Json | null
          updated_at: string
          uses_bank_finance: string | null
          website: string
        }
        Insert: {
          acq_equity_band?: string | null
          admin_override_note?: string | null
          admin_tier_override?: number | null
          anchor_investors_summary?: string | null
          approval_status?: string
          aum?: string | null
          backers_summary?: string | null
          bio?: string | null
          business_categories?: Json | null
          buyer_org_url?: string | null
          buyer_quality_score?: number | null
          buyer_quality_score_last_calculated?: string | null
          buyer_role?: string | null
          buyer_tier?: number | null
          buyer_type?: string | null
          committed_equity_band?: string | null
          company?: string | null
          company_name?: string | null
          corpdev_intent?: string | null
          created_at?: string
          deal_intent?: string | null
          deal_size_band?: string | null
          deal_sourcing_methods?: Json | null
          deal_structure_preference?: string | null
          deleted_at?: string | null
          deploying_capital_now?: string | null
          deployment_timing?: string | null
          discretion_type?: string | null
          email: string
          email_verified?: boolean
          equity_source?: Json | null
          estimated_revenue?: string | null
          exclusions?: Json | null
          fee_agreement_email_sent?: boolean | null
          fee_agreement_email_sent_at?: string | null
          fee_agreement_signed?: boolean | null
          fee_agreement_signed_at?: string | null
          financing_plan?: Json | null
          first_blog_landing?: string | null
          first_external_referrer?: string | null
          first_name?: string
          first_seen_at?: string | null
          first_utm_source?: string | null
          flex_sub2m_ebitda?: boolean | null
          flex_subxm_ebitda?: boolean | null
          fund_size?: string | null
          funded_by?: string | null
          funding_source?: string | null
          geographic_focus?: Json | null
          id: string
          ideal_target?: string | null
          ideal_target_description?: string | null
          include_keywords?: Json | null
          industry_expertise?: Json | null
          integration_plan?: Json | null
          investment_size?: Json | null
          is_admin?: boolean | null
          is_funded?: string | null
          job_title?: string | null
          last_name?: string
          linkedin_profile?: string
          mandate_blurb?: string | null
          max_equity_today_band?: string | null
          nda_email_sent?: boolean | null
          nda_email_sent_at?: string | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          needs_loan?: string | null
          on_behalf_of_buyer?: string | null
          onboarding_completed?: boolean | null
          operating_company_targets?: Json | null
          owner_intent?: string | null
          owner_timeline?: string | null
          owning_business_unit?: string | null
          permanent_capital?: boolean | null
          phone_number?: string | null
          platform_signal_detected?: boolean | null
          platform_signal_source?: string | null
          portfolio_company_addon?: string | null
          referral_source?: string | null
          referral_source_detail?: string | null
          remarketing_buyer_id?: string | null
          revenue_range_max?: string | null
          revenue_range_min?: string | null
          role?: string | null
          search_stage?: string | null
          search_type?: string | null
          specific_business_search?: string | null
          target_acquisition_volume?: string | null
          target_company_size?: string | null
          target_deal_size_max?: number | null
          target_deal_size_min?: number | null
          target_locations?: Json | null
          updated_at?: string
          uses_bank_finance?: string | null
          website?: string
        }
        Update: {
          acq_equity_band?: string | null
          admin_override_note?: string | null
          admin_tier_override?: number | null
          anchor_investors_summary?: string | null
          approval_status?: string
          aum?: string | null
          backers_summary?: string | null
          bio?: string | null
          business_categories?: Json | null
          buyer_org_url?: string | null
          buyer_quality_score?: number | null
          buyer_quality_score_last_calculated?: string | null
          buyer_role?: string | null
          buyer_tier?: number | null
          buyer_type?: string | null
          committed_equity_band?: string | null
          company?: string | null
          company_name?: string | null
          corpdev_intent?: string | null
          created_at?: string
          deal_intent?: string | null
          deal_size_band?: string | null
          deal_sourcing_methods?: Json | null
          deal_structure_preference?: string | null
          deleted_at?: string | null
          deploying_capital_now?: string | null
          deployment_timing?: string | null
          discretion_type?: string | null
          email?: string
          email_verified?: boolean
          equity_source?: Json | null
          estimated_revenue?: string | null
          exclusions?: Json | null
          fee_agreement_email_sent?: boolean | null
          fee_agreement_email_sent_at?: string | null
          fee_agreement_signed?: boolean | null
          fee_agreement_signed_at?: string | null
          financing_plan?: Json | null
          first_blog_landing?: string | null
          first_external_referrer?: string | null
          first_name?: string
          first_seen_at?: string | null
          first_utm_source?: string | null
          flex_sub2m_ebitda?: boolean | null
          flex_subxm_ebitda?: boolean | null
          fund_size?: string | null
          funded_by?: string | null
          funding_source?: string | null
          geographic_focus?: Json | null
          id?: string
          ideal_target?: string | null
          ideal_target_description?: string | null
          include_keywords?: Json | null
          industry_expertise?: Json | null
          integration_plan?: Json | null
          investment_size?: Json | null
          is_admin?: boolean | null
          is_funded?: string | null
          job_title?: string | null
          last_name?: string
          linkedin_profile?: string
          mandate_blurb?: string | null
          max_equity_today_band?: string | null
          nda_email_sent?: boolean | null
          nda_email_sent_at?: string | null
          nda_signed?: boolean | null
          nda_signed_at?: string | null
          needs_loan?: string | null
          on_behalf_of_buyer?: string | null
          onboarding_completed?: boolean | null
          operating_company_targets?: Json | null
          owner_intent?: string | null
          owner_timeline?: string | null
          owning_business_unit?: string | null
          permanent_capital?: boolean | null
          phone_number?: string | null
          platform_signal_detected?: boolean | null
          platform_signal_source?: string | null
          portfolio_company_addon?: string | null
          referral_source?: string | null
          referral_source_detail?: string | null
          remarketing_buyer_id?: string | null
          revenue_range_max?: string | null
          revenue_range_min?: string | null
          role?: string | null
          search_stage?: string | null
          search_type?: string | null
          specific_business_search?: string | null
          target_acquisition_volume?: string | null
          target_company_size?: string | null
          target_deal_size_max?: number | null
          target_deal_size_min?: number | null
          target_locations?: Json | null
          updated_at?: string
          uses_bank_finance?: string | null
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_remarketing_buyer_id_fkey"
            columns: ["remarketing_buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_partners: {
        Row: {
          company: string | null
          created_at: string | null
          deal_count: number | null
          email: string | null
          id: string
          is_active: boolean | null
          last_viewed_at: string | null
          name: string
          notes: string | null
          phone: string | null
          share_password_hash: string | null
          share_password_plaintext: string | null
          share_token: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          deal_count?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_viewed_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          share_password_hash?: string | null
          share_password_plaintext?: string | null
          share_token?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          deal_count?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_viewed_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          share_password_hash?: string | null
          share_password_plaintext?: string | null
          share_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      referral_submissions: {
        Row: {
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          ebitda: number | null
          id: string
          industry: string | null
          listing_id: string | null
          location: string | null
          notes: string | null
          referral_partner_id: string
          revenue: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          website: string | null
        }
        Insert: {
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          ebitda?: number | null
          id?: string
          industry?: string | null
          listing_id?: string | null
          location?: string | null
          notes?: string | null
          referral_partner_id: string
          revenue?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          ebitda?: number | null
          id?: string
          industry?: string | null
          listing_id?: string | null
          location?: string | null
          notes?: string | null
          referral_partner_id?: string
          revenue?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "referral_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_submissions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_submissions_referral_partner_id_fkey"
            columns: ["referral_partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_funnel: {
        Row: {
          completed_at: string | null
          created_at: string | null
          drop_off_reason: string | null
          dropped_off: boolean | null
          email: string | null
          form_data: Json | null
          id: string
          session_id: string | null
          step_name: string
          step_order: number
          time_spent: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          drop_off_reason?: string | null
          dropped_off?: boolean | null
          email?: string | null
          form_data?: Json | null
          id?: string
          session_id?: string | null
          step_name: string
          step_order: number
          time_spent?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          drop_off_reason?: string | null
          dropped_off?: boolean | null
          email?: string | null
          form_data?: Json | null
          id?: string
          session_id?: string | null
          step_name?: string
          step_order?: number
          time_spent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_funnel_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_buyer_contacts: {
        Row: {
          buyer_id: string
          company_type: string | null
          created_at: string
          email: string | null
          email_confidence: string | null
          id: string
          is_deal_team: boolean | null
          is_primary: boolean
          is_primary_contact: boolean | null
          linkedin_url: string | null
          name: string
          notes: string | null
          phone: string | null
          priority_level: number | null
          role: string | null
          role_category: string | null
          salesforce_id: string | null
          source: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          buyer_id: string
          company_type?: string | null
          created_at?: string
          email?: string | null
          email_confidence?: string | null
          id?: string
          is_deal_team?: boolean | null
          is_primary?: boolean
          is_primary_contact?: boolean | null
          linkedin_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          priority_level?: number | null
          role?: string | null
          role_category?: string | null
          salesforce_id?: string | null
          source?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          company_type?: string | null
          created_at?: string
          email?: string | null
          email_confidence?: string | null
          id?: string
          is_deal_team?: boolean | null
          is_primary?: boolean
          is_primary_contact?: boolean | null
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          priority_level?: number | null
          role?: string | null
          role_category?: string | null
          salesforce_id?: string | null
          source?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_buyer_contacts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyer_contacts_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_guide_generation_state: {
        Row: {
          created_at: string | null
          current_batch: number | null
          current_phase: number | null
          id: string
          last_error: Json | null
          phase_name: string | null
          saved_content: string | null
          status: string | null
          universe_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_batch?: number | null
          current_phase?: number | null
          id?: string
          last_error?: Json | null
          phase_name?: string | null
          saved_content?: string | null
          status?: string | null
          universe_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_batch?: number | null
          current_phase?: number | null
          id?: string
          last_error?: Json | null
          phase_name?: string | null
          saved_content?: string | null
          status?: string | null
          universe_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_guide_generation_state_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_guide_generation_state_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_outreach: {
        Row: {
          buyer_id: string
          contact_id: string | null
          contact_method: string | null
          contacted_at: string | null
          contacted_by: string | null
          created_at: string | null
          created_by: string | null
          id: string
          listing_id: string
          meeting_at: string | null
          notes: string | null
          response_at: string | null
          score_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          contact_id?: string | null
          contact_method?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          listing_id: string
          meeting_at?: string | null
          notes?: string | null
          response_at?: string | null
          score_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          contact_id?: string | null
          contact_method?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          listing_id?: string
          meeting_at?: string | null
          notes?: string | null
          response_at?: string | null
          score_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_outreach_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_outreach_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_outreach_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_outreach_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "remarketing_outreach_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_outreach_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_outreach_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "remarketing_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_scores: {
        Row: {
          acquisition_score: number | null
          business_model_score: number | null
          buyer_id: string
          composite_score: number
          created_at: string
          custom_bonus: number | null
          data_quality_bonus: number | null
          deal_snapshot: Json | null
          disqualification_reason: string | null
          fit_reasoning: string | null
          geography_mode_factor: number | null
          geography_score: number | null
          hidden_from_deal: boolean | null
          human_override_score: number | null
          id: string
          is_disqualified: boolean | null
          kpi_bonus: number | null
          last_viewed_at: string | null
          learning_penalty: number | null
          listing_id: string
          needs_review: boolean | null
          owner_goals_score: number | null
          pass_category: string | null
          pass_reason: string | null
          portfolio_score: number | null
          rejected_at: string | null
          rejection_category: string | null
          rejection_notes: string | null
          rejection_reason: string | null
          scored_at: string | null
          scored_by: string | null
          service_multiplier: number | null
          service_score: number | null
          size_multiplier: number | null
          size_score: number | null
          status: string
          thesis_alignment_bonus: number | null
          thesis_bonus: number | null
          tier: string | null
          universe_id: string | null
          updated_at: string
        }
        Insert: {
          acquisition_score?: number | null
          business_model_score?: number | null
          buyer_id: string
          composite_score?: number
          created_at?: string
          custom_bonus?: number | null
          data_quality_bonus?: number | null
          deal_snapshot?: Json | null
          disqualification_reason?: string | null
          fit_reasoning?: string | null
          geography_mode_factor?: number | null
          geography_score?: number | null
          hidden_from_deal?: boolean | null
          human_override_score?: number | null
          id?: string
          is_disqualified?: boolean | null
          kpi_bonus?: number | null
          last_viewed_at?: string | null
          learning_penalty?: number | null
          listing_id: string
          needs_review?: boolean | null
          owner_goals_score?: number | null
          pass_category?: string | null
          pass_reason?: string | null
          portfolio_score?: number | null
          rejected_at?: string | null
          rejection_category?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          scored_at?: string | null
          scored_by?: string | null
          service_multiplier?: number | null
          service_score?: number | null
          size_multiplier?: number | null
          size_score?: number | null
          status?: string
          thesis_alignment_bonus?: number | null
          thesis_bonus?: number | null
          tier?: string | null
          universe_id?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_score?: number | null
          business_model_score?: number | null
          buyer_id?: string
          composite_score?: number
          created_at?: string
          custom_bonus?: number | null
          data_quality_bonus?: number | null
          deal_snapshot?: Json | null
          disqualification_reason?: string | null
          fit_reasoning?: string | null
          geography_mode_factor?: number | null
          geography_score?: number | null
          hidden_from_deal?: boolean | null
          human_override_score?: number | null
          id?: string
          is_disqualified?: boolean | null
          kpi_bonus?: number | null
          last_viewed_at?: string | null
          learning_penalty?: number | null
          listing_id?: string
          needs_review?: boolean | null
          owner_goals_score?: number | null
          pass_category?: string | null
          pass_reason?: string | null
          portfolio_score?: number | null
          rejected_at?: string | null
          rejection_category?: string | null
          rejection_notes?: string | null
          rejection_reason?: string | null
          scored_at?: string | null
          scored_by?: string | null
          service_multiplier?: number | null
          service_score?: number | null
          size_multiplier?: number | null
          size_score?: number | null
          status?: string
          thesis_alignment_bonus?: number | null
          thesis_bonus?: number | null
          tier?: string | null
          universe_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_scores_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scores_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scores_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "remarketing_scores_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scores_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scores_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scores_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_scoring_queue: {
        Row: {
          attempts: number
          buyer_id: string | null
          created_at: string
          id: string
          last_error: string | null
          listing_id: string | null
          processed_at: string | null
          score_type: string
          started_at: string | null
          status: string
          universe_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          buyer_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          listing_id?: string | null
          processed_at?: string | null
          score_type: string
          started_at?: string | null
          status?: string
          universe_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          buyer_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          listing_id?: string | null
          processed_at?: string | null
          score_type?: string
          started_at?: string | null
          status?: string
          universe_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_scoring_queue_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scoring_queue_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scoring_queue_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "remarketing_scoring_queue_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scoring_queue_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scoring_queue_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_scoring_queue_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_universe_deals: {
        Row: {
          added_at: string | null
          added_by: string | null
          id: string
          listing_id: string
          notes: string | null
          status: string | null
          universe_id: string
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          listing_id: string
          notes?: string | null
          status?: string | null
          universe_id: string
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          listing_id?: string
          notes?: string | null
          status?: string | null
          universe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_universe_deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "remarketing_universe_deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_universe_deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_universe_deals_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_universe_deals_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_listings: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      score_snapshots: {
        Row: {
          bonuses_applied: Json | null
          buyer_id: string
          composite_score: number | null
          deal_quality_score: number | null
          engagement_score: number | null
          geography_score: number | null
          id: string
          listing_id: string
          multipliers_applied: Json | null
          owner_goals_score: number | null
          scored_at: string
          scoring_version: string | null
          service_score: number | null
          size_score: number | null
          tier: string | null
          trigger_type: string
          universe_id: string | null
          weights_used: Json | null
        }
        Insert: {
          bonuses_applied?: Json | null
          buyer_id: string
          composite_score?: number | null
          deal_quality_score?: number | null
          engagement_score?: number | null
          geography_score?: number | null
          id?: string
          listing_id: string
          multipliers_applied?: Json | null
          owner_goals_score?: number | null
          scored_at?: string
          scoring_version?: string | null
          service_score?: number | null
          size_score?: number | null
          tier?: string | null
          trigger_type?: string
          universe_id?: string | null
          weights_used?: Json | null
        }
        Update: {
          bonuses_applied?: Json | null
          buyer_id?: string
          composite_score?: number | null
          deal_quality_score?: number | null
          engagement_score?: number | null
          geography_score?: number | null
          id?: string
          listing_id?: string
          multipliers_applied?: Json | null
          owner_goals_score?: number | null
          scored_at?: string
          scoring_version?: string | null
          service_score?: number | null
          size_score?: number | null
          tier?: string | null
          trigger_type?: string
          universe_id?: string | null
          weights_used?: Json | null
        }
        Relationships: []
      }
      search_analytics: {
        Row: {
          created_at: string | null
          filters_applied: Json | null
          id: string
          no_results: boolean | null
          position_clicked: number | null
          refined_search: boolean | null
          results_clicked: number | null
          results_count: number | null
          search_query: string
          search_session_id: string | null
          session_id: string | null
          time_to_click: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          filters_applied?: Json | null
          id?: string
          no_results?: boolean | null
          position_clicked?: number | null
          refined_search?: boolean | null
          results_clicked?: number | null
          results_count?: number | null
          search_query: string
          search_session_id?: string | null
          session_id?: string | null
          time_to_click?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          filters_applied?: Json | null
          id?: string
          no_results?: boolean | null
          position_clicked?: number | null
          refined_search?: boolean | null
          results_clicked?: number | null
          results_count?: number | null
          search_query?: string
          search_session_id?: string | null
          session_id?: string | null
          time_to_click?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      similar_deal_alerts: {
        Row: {
          active: boolean
          categories: string[]
          created_at: string
          id: string
          locations: string[]
          revenue_max: number | null
          revenue_min: number | null
          source_listing_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          categories?: string[]
          created_at?: string
          id?: string
          locations?: string[]
          revenue_max?: number | null
          revenue_min?: number | null
          source_listing_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          categories?: string[]
          created_at?: string
          id?: string
          locations?: string[]
          revenue_max?: number | null
          revenue_min?: number | null
          source_listing_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "similar_deal_alerts_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "similar_deal_alerts_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "similar_deal_alerts_source_listing_id_fkey"
            columns: ["source_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "similar_deal_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      smartlead_campaign_leads: {
        Row: {
          buyer_contact_id: string | null
          campaign_id: string
          company_name: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_activity_at: string | null
          last_name: string | null
          lead_category: string | null
          lead_status: string | null
          metadata: Json | null
          remarketing_buyer_id: string | null
          smartlead_lead_id: number | null
          updated_at: string | null
        }
        Insert: {
          buyer_contact_id?: string | null
          campaign_id: string
          company_name?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          lead_category?: string | null
          lead_status?: string | null
          metadata?: Json | null
          remarketing_buyer_id?: string | null
          smartlead_lead_id?: number | null
          updated_at?: string | null
        }
        Update: {
          buyer_contact_id?: string | null
          campaign_id?: string
          company_name?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          lead_category?: string | null
          lead_status?: string | null
          metadata?: Json | null
          remarketing_buyer_id?: string | null
          smartlead_lead_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smartlead_campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "smartlead_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      smartlead_campaign_stats: {
        Row: {
          bounced: number | null
          campaign_id: string
          clicked: number | null
          id: string
          interested: number | null
          not_interested: number | null
          opened: number | null
          replied: number | null
          sent: number | null
          snapshot_at: string | null
          total_leads: number | null
          unsubscribed: number | null
        }
        Insert: {
          bounced?: number | null
          campaign_id: string
          clicked?: number | null
          id?: string
          interested?: number | null
          not_interested?: number | null
          opened?: number | null
          replied?: number | null
          sent?: number | null
          snapshot_at?: string | null
          total_leads?: number | null
          unsubscribed?: number | null
        }
        Update: {
          bounced?: number | null
          campaign_id?: string
          clicked?: number | null
          id?: string
          interested?: number | null
          not_interested?: number | null
          opened?: number | null
          replied?: number | null
          sent?: number | null
          snapshot_at?: string | null
          total_leads?: number | null
          unsubscribed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "smartlead_campaign_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "smartlead_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      smartlead_campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          id: string
          last_synced_at: string | null
          lead_count: number | null
          name: string
          settings: Json | null
          smartlead_campaign_id: number
          status: string | null
          universe_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          id?: string
          last_synced_at?: string | null
          lead_count?: number | null
          name: string
          settings?: Json | null
          smartlead_campaign_id: number
          status?: string | null
          universe_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          id?: string
          last_synced_at?: string | null
          lead_count?: number | null
          name?: string
          settings?: Json | null
          smartlead_campaign_id?: number
          status?: string | null
          universe_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smartlead_campaigns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "smartlead_campaigns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartlead_campaigns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartlead_campaigns_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartlead_campaigns_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      smartlead_webhook_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          lead_email: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          smartlead_campaign_id: number | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          lead_email?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          smartlead_campaign_id?: number | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          lead_email?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          smartlead_campaign_id?: number | null
        }
        Relationships: []
      }
      standup_meetings: {
        Row: {
          created_at: string | null
          extraction_confidence_avg: number | null
          fireflies_transcript_id: string
          id: string
          meeting_date: string
          meeting_duration_minutes: number | null
          meeting_title: string | null
          processed_at: string | null
          tasks_extracted: number | null
          tasks_unassigned: number | null
          transcript_url: string | null
        }
        Insert: {
          created_at?: string | null
          extraction_confidence_avg?: number | null
          fireflies_transcript_id: string
          id?: string
          meeting_date?: string
          meeting_duration_minutes?: number | null
          meeting_title?: string | null
          processed_at?: string | null
          tasks_extracted?: number | null
          tasks_unassigned?: number | null
          transcript_url?: string | null
        }
        Update: {
          created_at?: string | null
          extraction_confidence_avg?: number | null
          fireflies_transcript_id?: string
          id?: string
          meeting_date?: string
          meeting_duration_minutes?: number | null
          meeting_title?: string | null
          processed_at?: string | null
          tasks_extracted?: number | null
          tasks_unassigned?: number | null
          transcript_url?: string | null
        }
        Relationships: []
      }
      team_member_aliases: {
        Row: {
          alias: string
          created_at: string | null
          created_by: string | null
          id: string
          profile_id: string
        }
        Insert: {
          alias: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          profile_id: string
        }
        Update: {
          alias?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_aliases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_run_results: {
        Row: {
          category: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          run_id: string
          status: string
          suite: string
          test_id: string
          test_name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          run_id: string
          status?: string
          suite: string
          test_id: string
          test_name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          run_id?: string
          status?: string
          suite?: string
          test_id?: string
          test_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_run_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "test_run_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      test_run_tracking: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_summary: Json | null
          failed: number
          id: string
          passed: number
          run_type: string
          skipped: number
          started_at: string
          status: string
          suites_completed: number | null
          suites_total: number | null
          total_tests: number
          triggered_by: string | null
          warnings: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_summary?: Json | null
          failed?: number
          id?: string
          passed?: number
          run_type?: string
          skipped?: number
          started_at?: string
          status?: string
          suites_completed?: number | null
          suites_total?: number | null
          total_tests?: number
          triggered_by?: string | null
          warnings?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_summary?: Json | null
          failed?: number
          id?: string
          passed?: number
          run_type?: string
          skipped?: number
          started_at?: string
          status?: string
          suites_completed?: number | null
          suites_total?: number | null
          total_tests?: number
          triggered_by?: string | null
          warnings?: number
        }
        Relationships: []
      }
      trigger_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          metadata: Json | null
          status: string
          success: boolean | null
          trigger_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          success?: boolean | null
          trigger_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          success?: boolean | null
          trigger_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          activity_type: string
          created_at: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_events: {
        Row: {
          created_at: string | null
          element_class: string | null
          element_id: string | null
          event_action: string
          event_category: string
          event_label: string | null
          event_type: string
          event_value: number | null
          id: string
          metadata: Json | null
          page_path: string | null
          session_id: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string | null
          element_class?: string | null
          element_id?: string | null
          event_action: string
          event_category: string
          event_label?: string | null
          event_type: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string | null
          element_class?: string | null
          element_id?: string | null
          event_action?: string
          event_category?: string
          event_label?: string | null
          event_type?: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      user_initial_session: {
        Row: {
          browser: string | null
          browser_type: string | null
          city: string | null
          country: string | null
          created_at: string | null
          device_type: string | null
          first_seen_at: string | null
          full_referrer: string | null
          ga4_client_id: string | null
          id: string
          landing_page: string | null
          landing_page_query: string | null
          location: Json | null
          marketing_channel: string | null
          platform: string | null
          referrer: string | null
          region: string | null
          session_id: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          browser?: string | null
          browser_type?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          first_seen_at?: string | null
          full_referrer?: string | null
          ga4_client_id?: string | null
          id?: string
          landing_page?: string | null
          landing_page_query?: string | null
          location?: Json | null
          marketing_channel?: string | null
          platform?: string | null
          referrer?: string | null
          region?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          browser?: string | null
          browser_type?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_type?: string | null
          first_seen_at?: string | null
          full_referrer?: string | null
          ga4_client_id?: string | null
          id?: string
          landing_page?: string | null
          landing_page_query?: string | null
          location?: Json | null
          marketing_channel?: string | null
          platform?: string | null
          referrer?: string | null
          region?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      user_journeys: {
        Row: {
          created_at: string | null
          first_blog_landing: string | null
          first_browser: string | null
          first_city: string | null
          first_country: string | null
          first_device_type: string | null
          first_external_referrer: string | null
          first_landing_page: string | null
          first_os: string | null
          first_referrer: string | null
          first_seen_at: string | null
          first_utm_campaign: string | null
          first_utm_content: string | null
          first_utm_medium: string | null
          first_utm_source: string | null
          first_utm_term: string | null
          ga4_client_id: string | null
          id: string
          is_bot: boolean | null
          is_production: boolean | null
          journey_stage: string | null
          last_page_path: string | null
          last_seen_at: string | null
          last_session_id: string | null
          milestones: Json | null
          total_page_views: number | null
          total_sessions: number | null
          total_time_seconds: number | null
          updated_at: string | null
          user_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string | null
          first_blog_landing?: string | null
          first_browser?: string | null
          first_city?: string | null
          first_country?: string | null
          first_device_type?: string | null
          first_external_referrer?: string | null
          first_landing_page?: string | null
          first_os?: string | null
          first_referrer?: string | null
          first_seen_at?: string | null
          first_utm_campaign?: string | null
          first_utm_content?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          first_utm_term?: string | null
          ga4_client_id?: string | null
          id?: string
          is_bot?: boolean | null
          is_production?: boolean | null
          journey_stage?: string | null
          last_page_path?: string | null
          last_seen_at?: string | null
          last_session_id?: string | null
          milestones?: Json | null
          total_page_views?: number | null
          total_sessions?: number | null
          total_time_seconds?: number | null
          updated_at?: string | null
          user_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string | null
          first_blog_landing?: string | null
          first_browser?: string | null
          first_city?: string | null
          first_country?: string | null
          first_device_type?: string | null
          first_external_referrer?: string | null
          first_landing_page?: string | null
          first_os?: string | null
          first_referrer?: string | null
          first_seen_at?: string | null
          first_utm_campaign?: string | null
          first_utm_content?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          first_utm_term?: string | null
          ga4_client_id?: string | null
          id?: string
          is_bot?: boolean | null
          is_production?: boolean | null
          journey_stage?: string | null
          last_page_path?: string | null
          last_seen_at?: string | null
          last_session_id?: string | null
          milestones?: Json | null
          total_page_views?: number | null
          total_sessions?: number | null
          total_time_seconds?: number | null
          updated_at?: string | null
          user_id?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_journeys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notes: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          note_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          note_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          note_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          connection_request_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          connection_request_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          connection_request_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_connection_request_id_fkey"
            columns: ["connection_request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          reason: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          blog_landing_page: string | null
          browser: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string | null
          device_type: string | null
          ended_at: string | null
          first_touch_campaign: string | null
          first_touch_landing_page: string | null
          first_touch_medium: string | null
          first_touch_referrer: string | null
          first_touch_source: string | null
          ga4_client_id: string | null
          id: string
          ip_address: unknown
          is_active: boolean | null
          is_bot: boolean | null
          is_production: boolean | null
          last_active_at: string | null
          lat: number | null
          lon: number | null
          original_external_referrer: string | null
          original_keyword: string | null
          original_source: string | null
          os: string | null
          referrer: string | null
          region: string | null
          session_duration_seconds: number | null
          session_id: string
          started_at: string | null
          timezone: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          blog_landing_page?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          device_type?: string | null
          ended_at?: string | null
          first_touch_campaign?: string | null
          first_touch_landing_page?: string | null
          first_touch_medium?: string | null
          first_touch_referrer?: string | null
          first_touch_source?: string | null
          ga4_client_id?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          is_bot?: boolean | null
          is_production?: boolean | null
          last_active_at?: string | null
          lat?: number | null
          lon?: number | null
          original_external_referrer?: string | null
          original_keyword?: string | null
          original_source?: string | null
          os?: string | null
          referrer?: string | null
          region?: string | null
          session_duration_seconds?: number | null
          session_id: string
          started_at?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          blog_landing_page?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          device_type?: string | null
          ended_at?: string | null
          first_touch_campaign?: string | null
          first_touch_landing_page?: string | null
          first_touch_medium?: string | null
          first_touch_referrer?: string | null
          first_touch_source?: string | null
          ga4_client_id?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          is_bot?: boolean | null
          is_production?: boolean | null
          last_active_at?: string | null
          lat?: number | null
          lon?: number | null
          original_external_referrer?: string | null
          original_keyword?: string | null
          original_source?: string | null
          os?: string | null
          referrer?: string | null
          region?: string | null
          session_duration_seconds?: number | null
          session_id?: string
          started_at?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      valuation_leads: {
        Row: {
          business_name: string | null
          buyer_lane: string | null
          calculator_specific_data: Json | null
          calculator_type: string
          created_at: string | null
          cta_clicked: boolean | null
          deal_owner_id: string | null
          display_name: string | null
          ebitda: number | null
          email: string | null
          excluded: boolean | null
          exclusion_reason: string | null
          exit_timing: string | null
          full_name: string | null
          growth_trend: string | null
          id: string
          industry: string | null
          initial_unlock_at: string | null
          is_archived: boolean
          is_priority_target: boolean | null
          lead_score: number | null
          lead_source: string | null
          linkedin_url: string | null
          location: string | null
          locations_count: number | null
          need_to_contact_owner: boolean | null
          needs_buyer_search: boolean | null
          needs_buyer_universe: boolean | null
          needs_owner_contact: boolean | null
          not_a_fit: boolean | null
          open_to_intros: boolean | null
          owner_dependency: string | null
          phone: string | null
          pushed_listing_id: string | null
          pushed_to_all_deals: boolean | null
          pushed_to_all_deals_at: string | null
          quality_label: string | null
          quality_tier: string | null
          raw_calculator_inputs: Json | null
          raw_valuation_results: Json | null
          readiness_score: number | null
          region: string | null
          revenue: number | null
          revenue_model: string | null
          scoring_notes: string | null
          source_submission_id: string | null
          status: string | null
          submission_count: number
          synced_at: string | null
          updated_at: string | null
          valuation_high: number | null
          valuation_low: number | null
          valuation_mid: number | null
          website: string | null
        }
        Insert: {
          business_name?: string | null
          buyer_lane?: string | null
          calculator_specific_data?: Json | null
          calculator_type?: string
          created_at?: string | null
          cta_clicked?: boolean | null
          deal_owner_id?: string | null
          display_name?: string | null
          ebitda?: number | null
          email?: string | null
          excluded?: boolean | null
          exclusion_reason?: string | null
          exit_timing?: string | null
          full_name?: string | null
          growth_trend?: string | null
          id?: string
          industry?: string | null
          initial_unlock_at?: string | null
          is_archived?: boolean
          is_priority_target?: boolean | null
          lead_score?: number | null
          lead_source?: string | null
          linkedin_url?: string | null
          location?: string | null
          locations_count?: number | null
          need_to_contact_owner?: boolean | null
          needs_buyer_search?: boolean | null
          needs_buyer_universe?: boolean | null
          needs_owner_contact?: boolean | null
          not_a_fit?: boolean | null
          open_to_intros?: boolean | null
          owner_dependency?: string | null
          phone?: string | null
          pushed_listing_id?: string | null
          pushed_to_all_deals?: boolean | null
          pushed_to_all_deals_at?: string | null
          quality_label?: string | null
          quality_tier?: string | null
          raw_calculator_inputs?: Json | null
          raw_valuation_results?: Json | null
          readiness_score?: number | null
          region?: string | null
          revenue?: number | null
          revenue_model?: string | null
          scoring_notes?: string | null
          source_submission_id?: string | null
          status?: string | null
          submission_count?: number
          synced_at?: string | null
          updated_at?: string | null
          valuation_high?: number | null
          valuation_low?: number | null
          valuation_mid?: number | null
          website?: string | null
        }
        Update: {
          business_name?: string | null
          buyer_lane?: string | null
          calculator_specific_data?: Json | null
          calculator_type?: string
          created_at?: string | null
          cta_clicked?: boolean | null
          deal_owner_id?: string | null
          display_name?: string | null
          ebitda?: number | null
          email?: string | null
          excluded?: boolean | null
          exclusion_reason?: string | null
          exit_timing?: string | null
          full_name?: string | null
          growth_trend?: string | null
          id?: string
          industry?: string | null
          initial_unlock_at?: string | null
          is_archived?: boolean
          is_priority_target?: boolean | null
          lead_score?: number | null
          lead_source?: string | null
          linkedin_url?: string | null
          location?: string | null
          locations_count?: number | null
          need_to_contact_owner?: boolean | null
          needs_buyer_search?: boolean | null
          needs_buyer_universe?: boolean | null
          needs_owner_contact?: boolean | null
          not_a_fit?: boolean | null
          open_to_intros?: boolean | null
          owner_dependency?: string | null
          phone?: string | null
          pushed_listing_id?: string | null
          pushed_to_all_deals?: boolean | null
          pushed_to_all_deals_at?: string | null
          quality_label?: string | null
          quality_tier?: string | null
          raw_calculator_inputs?: Json | null
          raw_valuation_results?: Json | null
          readiness_score?: number | null
          region?: string | null
          revenue?: number | null
          revenue_model?: string | null
          scoring_notes?: string | null
          source_submission_id?: string | null
          status?: string | null
          submission_count?: number
          synced_at?: string | null
          updated_at?: string | null
          valuation_high?: number | null
          valuation_low?: number | null
          valuation_mid?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "valuation_leads_deal_owner_id_fkey"
            columns: ["deal_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_leads_pushed_listing_id_fkey"
            columns: ["pushed_listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "valuation_leads_pushed_listing_id_fkey"
            columns: ["pushed_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_leads_pushed_listing_id_fkey"
            columns: ["pushed_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_connection_requests_views_v2: {
        Row: {
          admin_id: string | null
          created_at: string | null
          id: string | null
          last_viewed_at: string | null
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_deal_sourcing_views_v2: {
        Row: {
          admin_id: string | null
          created_at: string | null
          id: string | null
          last_viewed_at: string | null
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_owner_leads_views_v2: {
        Row: {
          admin_id: string | null
          created_at: string | null
          id: string | null
          last_viewed_at: string | null
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_users_views_v2: {
        Row: {
          admin_id: string | null
          created_at: string | null
          id: string | null
          last_viewed_at: string | null
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          id?: string | null
          last_viewed_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      buyer_introduction_summary: {
        Row: {
          company_name: string | null
          fit_and_interested_buyers: number | null
          listing_id: string | null
          meetings_scheduled: number | null
          need_to_show_deal: number | null
          not_a_fit_buyers: number | null
          pending_introductions: number | null
          total_tracked_buyers: number | null
        }
        Relationships: []
      }
      introduced_and_passed_buyers: {
        Row: {
          buyer_feedback: string | null
          buyer_firm_name: string | null
          buyer_name: string | null
          company_name: string | null
          days_since_introduction: number | null
          expected_next_step_date: string | null
          id: string | null
          introduced_by: string | null
          introduction_date: string | null
          listing_id: string | null
          next_step: string | null
          passed_date: string | null
          passed_reason: string | null
          stage: string | null
        }
        Insert: {
          buyer_feedback?: string | null
          buyer_firm_name?: string | null
          buyer_name?: string | null
          company_name?: string | null
          days_since_introduction?: never
          expected_next_step_date?: string | null
          id?: string | null
          introduced_by?: string | null
          introduction_date?: string | null
          listing_id?: string | null
          next_step?: string | null
          passed_date?: string | null
          passed_reason?: string | null
          stage?: never
        }
        Update: {
          buyer_feedback?: string | null
          buyer_firm_name?: string | null
          buyer_name?: string | null
          company_name?: string | null
          days_since_introduction?: never
          expected_next_step_date?: string | null
          id?: string | null
          introduced_by?: string | null
          introduction_date?: string | null
          listing_id?: string | null
          next_step?: string | null
          passed_date?: string | null
          passed_reason?: string | null
          stage?: never
        }
        Relationships: [
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          acquisition_type: string | null
          categories: string[] | null
          category: string | null
          created_at: string | null
          custom_metric_label: string | null
          custom_metric_subtitle: string | null
          custom_metric_value: string | null
          custom_sections: Json | null
          deleted_at: string | null
          description: string | null
          description_html: string | null
          description_json: Json | null
          ebitda: number | null
          ebitda_metric_subtitle: string | null
          full_time_employees: number | null
          hero_description: string | null
          id: string | null
          image_url: string | null
          is_internal_deal: boolean | null
          location: string | null
          metric_3_custom_label: string | null
          metric_3_custom_subtitle: string | null
          metric_3_custom_value: string | null
          metric_3_type: string | null
          metric_4_custom_label: string | null
          metric_4_custom_subtitle: string | null
          metric_4_custom_value: string | null
          metric_4_type: string | null
          part_time_employees: number | null
          published_at: string | null
          revenue: number | null
          revenue_metric_subtitle: string | null
          source_deal_id: string | null
          status: string | null
          status_tag: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          visible_to_buyer_types: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_source_deal_id_fkey"
            columns: ["source_deal_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "listings_source_deal_id_fkey"
            columns: ["source_deal_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_source_deal_id_fkey"
            columns: ["source_deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      not_yet_introduced_buyers: {
        Row: {
          activity_count: number | null
          buyer_email: string | null
          buyer_firm_name: string | null
          buyer_linkedin_url: string | null
          buyer_name: string | null
          buyer_phone: string | null
          company_name: string | null
          created_at: string | null
          expected_deal_size_high: number | null
          expected_deal_size_low: number | null
          id: string | null
          internal_champion: string | null
          last_activity: string | null
          listing_id: string | null
          targeting_reason: string | null
        }
        Insert: {
          activity_count?: never
          buyer_email?: string | null
          buyer_firm_name?: string | null
          buyer_linkedin_url?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          company_name?: string | null
          created_at?: string | null
          expected_deal_size_high?: number | null
          expected_deal_size_low?: number | null
          id?: string | null
          internal_champion?: string | null
          last_activity?: never
          listing_id?: string | null
          targeting_reason?: string | null
        }
        Update: {
          activity_count?: never
          buyer_email?: string | null
          buyer_firm_name?: string | null
          buyer_linkedin_url?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          company_name?: string | null
          created_at?: string | null
          expected_deal_size_high?: number | null
          expected_deal_size_low?: number | null
          id?: string | null
          internal_champion?: string | null
          last_activity?: never
          listing_id?: string | null
          targeting_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "buyer_introduction_summary"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_introductions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      remarketing_buyer_universes: {
        Row: {
          archived: boolean | null
          buyer_types_criteria: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          documents: Json | null
          documents_analyzed_at: string | null
          fee_agreement_required: boolean | null
          fit_criteria: string | null
          fit_criteria_buyer_types: string | null
          fit_criteria_geography: string | null
          fit_criteria_service: string | null
          fit_criteria_size: string | null
          geography_criteria: Json | null
          geography_weight: number | null
          id: string | null
          industry_template: string | null
          kpi_scoring_config: Json | null
          ma_guide_content: string | null
          ma_guide_generated_at: string | null
          ma_guide_qa_context: Json | null
          name: string | null
          owner_goals_weight: number | null
          scoring_behavior: Json | null
          service_criteria: Json | null
          service_weight: number | null
          size_criteria: Json | null
          size_weight: number | null
          target_buyer_types: Json | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          buyer_types_criteria?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documents?: Json | null
          documents_analyzed_at?: string | null
          fee_agreement_required?: boolean | null
          fit_criteria?: string | null
          fit_criteria_buyer_types?: string | null
          fit_criteria_geography?: string | null
          fit_criteria_service?: string | null
          fit_criteria_size?: string | null
          geography_criteria?: Json | null
          geography_weight?: number | null
          id?: string | null
          industry_template?: string | null
          kpi_scoring_config?: Json | null
          ma_guide_content?: string | null
          ma_guide_generated_at?: string | null
          ma_guide_qa_context?: Json | null
          name?: string | null
          owner_goals_weight?: number | null
          scoring_behavior?: Json | null
          service_criteria?: Json | null
          service_weight?: number | null
          size_criteria?: Json | null
          size_weight?: number | null
          target_buyer_types?: Json | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          buyer_types_criteria?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documents?: Json | null
          documents_analyzed_at?: string | null
          fee_agreement_required?: boolean | null
          fit_criteria?: string | null
          fit_criteria_buyer_types?: string | null
          fit_criteria_geography?: string | null
          fit_criteria_service?: string | null
          fit_criteria_size?: string | null
          geography_criteria?: Json | null
          geography_weight?: number | null
          id?: string | null
          industry_template?: string | null
          kpi_scoring_config?: Json | null
          ma_guide_content?: string | null
          ma_guide_generated_at?: string | null
          ma_guide_qa_context?: Json | null
          name?: string | null
          owner_goals_weight?: number | null
          scoring_behavior?: Json | null
          service_criteria?: Json | null
          service_weight?: number | null
          size_criteria?: Json | null
          size_weight?: number | null
          target_buyer_types?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      remarketing_buyers: {
        Row: {
          acquisition_appetite: string | null
          acquisition_frequency: string | null
          acquisition_timeline: string | null
          admin_override_note: string | null
          admin_tier_override: number | null
          ai_seeded: boolean | null
          ai_seeded_at: string | null
          ai_seeded_from_deal_id: string | null
          alignment_checked_at: string | null
          alignment_reasoning: string | null
          alignment_score: number | null
          archived: boolean | null
          business_summary: string | null
          business_type: string | null
          buyer_linkedin: string | null
          buyer_quality_score: number | null
          buyer_quality_score_last_calculated: string | null
          buyer_tier: number | null
          buyer_type: string | null
          buyer_type_ai_recommendation: string | null
          buyer_type_classified_at: string | null
          buyer_type_confidence: number | null
          buyer_type_needs_review: boolean | null
          buyer_type_reasoning: string | null
          buyer_type_source: string | null
          company_name: string | null
          company_website: string | null
          created_at: string | null
          customer_geographic_reach: string | null
          customer_industries: string[] | null
          data_last_updated: string | null
          email_domain: string | null
          extraction_sources: Json | null
          fee_agreement_source: string | null
          fee_agreement_status: string | null
          founded_year: number | null
          geographic_footprint: string[] | null
          has_fee_agreement: boolean | null
          hq_city: string | null
          hq_country: string | null
          hq_region: string | null
          hq_state: string | null
          id: string | null
          industry_tracker_id: string | null
          industry_vertical: string | null
          investment_date: string | null
          is_pe_backed: boolean | null
          is_publicly_traded: boolean | null
          marketplace_firm_id: string | null
          notes: string | null
          notes_analyzed_at: string | null
          num_employees: number | null
          num_platforms: number | null
          number_of_locations: number | null
          operating_locations: string[] | null
          pe_firm_acquisitions: Json | null
          pe_firm_id: string | null
          pe_firm_linkedin: string | null
          pe_firm_name: string | null
          pe_firm_website: string | null
          platform_acquisitions: Json | null
          platform_signal_detected: boolean | null
          platform_signal_source: string | null
          platform_website: string | null
          portfolio_companies: Json | null
          primary_customer_size: string | null
          recent_acquisitions: Json | null
          revenue_model: string | null
          service_regions: string[] | null
          services_offered: string | null
          target_customer_profile: string | null
          target_ebitda_max: number | null
          target_ebitda_min: number | null
          target_geographies: string[] | null
          target_industries: string[] | null
          target_revenue_max: number | null
          target_revenue_min: number | null
          target_services: string[] | null
          thesis_summary: string | null
          total_acquisitions: number | null
          universe_id: string | null
          updated_at: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          acquisition_appetite?: string | null
          acquisition_frequency?: string | null
          acquisition_timeline?: string | null
          admin_override_note?: string | null
          admin_tier_override?: number | null
          ai_seeded?: boolean | null
          ai_seeded_at?: string | null
          ai_seeded_from_deal_id?: string | null
          alignment_checked_at?: string | null
          alignment_reasoning?: string | null
          alignment_score?: number | null
          archived?: boolean | null
          business_summary?: string | null
          business_type?: string | null
          buyer_linkedin?: string | null
          buyer_quality_score?: number | null
          buyer_quality_score_last_calculated?: string | null
          buyer_tier?: number | null
          buyer_type?: string | null
          buyer_type_ai_recommendation?: string | null
          buyer_type_classified_at?: string | null
          buyer_type_confidence?: number | null
          buyer_type_needs_review?: boolean | null
          buyer_type_reasoning?: string | null
          buyer_type_source?: string | null
          company_name?: string | null
          company_website?: string | null
          created_at?: string | null
          customer_geographic_reach?: string | null
          customer_industries?: string[] | null
          data_last_updated?: string | null
          email_domain?: string | null
          extraction_sources?: Json | null
          fee_agreement_source?: string | null
          fee_agreement_status?: string | null
          founded_year?: number | null
          geographic_footprint?: string[] | null
          has_fee_agreement?: boolean | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: string | null
          hq_state?: string | null
          id?: string | null
          industry_tracker_id?: string | null
          industry_vertical?: string | null
          investment_date?: string | null
          is_pe_backed?: boolean | null
          is_publicly_traded?: boolean | null
          marketplace_firm_id?: string | null
          notes?: string | null
          notes_analyzed_at?: string | null
          num_employees?: number | null
          num_platforms?: number | null
          number_of_locations?: number | null
          operating_locations?: string[] | null
          pe_firm_acquisitions?: Json | null
          pe_firm_id?: string | null
          pe_firm_linkedin?: string | null
          pe_firm_name?: string | null
          pe_firm_website?: string | null
          platform_acquisitions?: Json | null
          platform_signal_detected?: boolean | null
          platform_signal_source?: string | null
          platform_website?: string | null
          portfolio_companies?: Json | null
          primary_customer_size?: string | null
          recent_acquisitions?: Json | null
          revenue_model?: string | null
          service_regions?: string[] | null
          services_offered?: string | null
          target_customer_profile?: string | null
          target_ebitda_max?: number | null
          target_ebitda_min?: number | null
          target_geographies?: string[] | null
          target_industries?: string[] | null
          target_revenue_max?: number | null
          target_revenue_min?: number | null
          target_services?: string[] | null
          thesis_summary?: string | null
          total_acquisitions?: number | null
          universe_id?: string | null
          updated_at?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          acquisition_appetite?: string | null
          acquisition_frequency?: string | null
          acquisition_timeline?: string | null
          admin_override_note?: string | null
          admin_tier_override?: number | null
          ai_seeded?: boolean | null
          ai_seeded_at?: string | null
          ai_seeded_from_deal_id?: string | null
          alignment_checked_at?: string | null
          alignment_reasoning?: string | null
          alignment_score?: number | null
          archived?: boolean | null
          business_summary?: string | null
          business_type?: string | null
          buyer_linkedin?: string | null
          buyer_quality_score?: number | null
          buyer_quality_score_last_calculated?: string | null
          buyer_tier?: number | null
          buyer_type?: string | null
          buyer_type_ai_recommendation?: string | null
          buyer_type_classified_at?: string | null
          buyer_type_confidence?: number | null
          buyer_type_needs_review?: boolean | null
          buyer_type_reasoning?: string | null
          buyer_type_source?: string | null
          company_name?: string | null
          company_website?: string | null
          created_at?: string | null
          customer_geographic_reach?: string | null
          customer_industries?: string[] | null
          data_last_updated?: string | null
          email_domain?: string | null
          extraction_sources?: Json | null
          fee_agreement_source?: string | null
          fee_agreement_status?: string | null
          founded_year?: number | null
          geographic_footprint?: string[] | null
          has_fee_agreement?: boolean | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: string | null
          hq_state?: string | null
          id?: string | null
          industry_tracker_id?: string | null
          industry_vertical?: string | null
          investment_date?: string | null
          is_pe_backed?: boolean | null
          is_publicly_traded?: boolean | null
          marketplace_firm_id?: string | null
          notes?: string | null
          notes_analyzed_at?: string | null
          num_employees?: number | null
          num_platforms?: number | null
          number_of_locations?: number | null
          operating_locations?: string[] | null
          pe_firm_acquisitions?: Json | null
          pe_firm_id?: string | null
          pe_firm_linkedin?: string | null
          pe_firm_name?: string | null
          pe_firm_website?: string | null
          platform_acquisitions?: Json | null
          platform_signal_detected?: boolean | null
          platform_signal_source?: string | null
          platform_website?: string | null
          portfolio_companies?: Json | null
          primary_customer_size?: string | null
          recent_acquisitions?: Json | null
          revenue_model?: string | null
          service_regions?: string[] | null
          services_offered?: string | null
          target_customer_profile?: string | null
          target_ebitda_max?: number | null
          target_ebitda_min?: number | null
          target_geographies?: string[] | null
          target_industries?: string[] | null
          target_revenue_max?: number | null
          target_revenue_min?: number | null
          target_services?: string[] | null
          thesis_summary?: string | null
          total_acquisitions?: number | null
          universe_id?: string | null
          updated_at?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remarketing_buyers_industry_tracker_id_fkey"
            columns: ["industry_tracker_id"]
            isOneToOne: false
            referencedRelation: "industry_trackers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_marketplace_firm_id_fkey"
            columns: ["marketplace_firm_id"]
            isOneToOne: false
            referencedRelation: "firm_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_pe_firm_id_fkey"
            columns: ["pe_firm_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_pe_firm_id_fkey"
            columns: ["pe_firm_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "buyer_universes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remarketing_buyers_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "remarketing_buyer_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_duplicate_buyers: {
        Row: {
          buyer_ids: string[] | null
          company_names: string[] | null
          created_ats: string[] | null
          domain: string | null
          duplicate_count: number | null
          first_created_at: string | null
          websites: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_connection_request_decider: {
        Args: {
          p_admin_id: string
          p_decision: string
          p_decision_at?: string
          p_request_id: string
        }
        Returns: boolean
      }
      assign_role_for_invite: {
        Args: {
          _granted_by: string
          _reason?: string
          _role: string
          _user_id: string
        }
        Returns: undefined
      }
      calculate_buyer_priority_score:
        | { Args: { buyer_type_param: string }; Returns: number }
        | {
            Args: {
              p_acquisition_timeline: string
              p_annual_revenue: string
              p_business_categories: string[]
              p_buyer_type: string
              p_capital_available: string
              p_company_name: string
              p_is_registered_user?: boolean
              p_target_locations: string[]
            }
            Returns: number
          }
      calculate_deal_buyer_priority: {
        Args: { deal_row: Database["public"]["Tables"]["deal_pipeline"]["Row"] }
        Returns: number
      }
      calculate_engagement_score: {
        Args: {
          p_connections_requested: number
          p_listings_saved: number
          p_listings_viewed: number
          p_total_session_time: number
        }
        Returns: number
      }
      change_user_role:
        | {
            Args: {
              _new_role: string
              _reason?: string
              _target_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              change_reason?: string
              new_role: Database["public"]["Enums"]["app_role"]
              target_user_id: string
            }
            Returns: boolean
          }
      check_agreement_coverage: {
        Args: { p_agreement_type?: string; p_email: string }
        Returns: {
          agreement_status: string
          coverage_source: string
          expires_at: string
          firm_id: string
          firm_name: string
          is_covered: boolean
          parent_firm_name: string
          signed_at: string
          signed_by_name: string
        }[]
      }
      check_data_room_access: {
        Args: { p_category: string; p_deal_id: string; p_user_id: string }
        Returns: boolean
      }
      check_orphaned_auth_users: {
        Args: never
        Returns: {
          created_at: string
          user_email: string
          user_id: string
        }[]
      }
      check_scores_freshness: {
        Args: { p_listing_id: string; p_max_age_hours?: number }
        Returns: {
          has_scores: boolean
          is_fresh: boolean
          oldest_score_age_hours: number
          score_count: number
        }[]
      }
      claim_events: {
        Args: {
          p_batch_size?: number
          p_event_type: string
          p_processor: string
        }
        Returns: {
          actor_id: string | null
          classification: string
          completed_at: string | null
          completed_items: number
          context_json: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          error_log: Json | null
          error_message: string | null
          event_type: string
          failed_items: number
          id: string
          operation_type: string
          processed_at: string | null
          processor: string | null
          queued_at: string
          started_at: string | null
          status: string
          total_items: number
        }[]
        SetofOptions: {
          from: "*"
          to: "global_activity_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      cleanup_zombie_extractions: { Args: never; Returns: number }
      complete_enrichment_job: {
        Args: { p_job_id: string; p_status?: string }
        Returns: undefined
      }
      convert_inbound_lead_to_request: {
        Args: { p_lead_id: string; p_listing_id: string }
        Returns: string
      }
      create_pipeline_deal: {
        Args: { p_connection_request_id: string }
        Returns: string
      }
      decrement_provider_concurrent: {
        Args: { p_provider: string }
        Returns: undefined
      }
      delete_listing_cascade: {
        Args: { p_listing_id: string }
        Returns: undefined
      }
      delete_user_completely: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      demote_admin_user: { Args: { target_user_id: string }; Returns: boolean }
      emit_event: {
        Args: {
          p_actor_id?: string
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_metadata?: Json
        }
        Returns: string
      }
      enhanced_merge_or_create_connection_request: {
        Args: {
          p_lead_company?: string
          p_lead_email?: string
          p_lead_name?: string
          p_lead_phone?: string
          p_lead_role?: string
          p_listing_id: string
          p_user_message: string
        }
        Returns: Json
      }
      expire_stale_scoring_runs: { Args: never; Returns: number }
      extract_domain: { Args: { url: string }; Returns: string }
      find_listing_by_normalized_domain: {
        Args: { target_domain: string }
        Returns: {
          acquisition_type: string | null
          address: string | null
          address_city: string | null
          address_country: string | null
          address_state: string | null
          address_zip: string | null
          business_model: string | null
          buyer_universe_description: string | null
          buyer_universe_generated_at: string | null
          buyer_universe_label: string | null
          captarget_call_notes: string | null
          captarget_client_name: string | null
          captarget_contact_date: string | null
          captarget_interest_type: string | null
          captarget_outreach_channel: string | null
          captarget_row_hash: string | null
          captarget_sheet_tab: string | null
          captarget_source_url: string | null
          captarget_status: string | null
          categories: string[] | null
          category: string | null
          competitive_position: string | null
          created_at: string
          custom_metric_label: string | null
          custom_metric_subtitle: string | null
          custom_metric_value: string | null
          custom_sections: Json | null
          customer_concentration: number | null
          customer_geography: string | null
          customer_types: string | null
          deal_identifier: string | null
          deal_owner_id: string | null
          deal_size_score: number | null
          deal_source: string | null
          deal_total_score: number | null
          deleted_at: string | null
          description: string | null
          description_html: string | null
          description_json: Json | null
          ebitda: number | null
          ebitda_is_inferred: boolean | null
          ebitda_margin: number | null
          ebitda_metric_subtitle: string | null
          ebitda_score: number | null
          ebitda_source_quote: string | null
          end_market_description: string | null
          enriched_at: string | null
          enrichment_status: string | null
          executive_summary: string | null
          external_id: string | null
          external_source: string | null
          extraction_sources: Json | null
          files: string[] | null
          financial_followup_questions: string[] | null
          fireflies_url: string | null
          founded_year: number | null
          fts: unknown
          full_time_employees: number | null
          general_notes: string | null
          geographic_states: string[] | null
          google_maps_url: string | null
          google_place_id: string | null
          google_rating: number | null
          google_review_count: number | null
          growth_drivers: Json | null
          growth_trajectory: string | null
          hero_description: string | null
          id: string
          image_url: string | null
          industry: string | null
          industry_tier: number | null
          industry_tier_name: string | null
          internal_company_name: string | null
          internal_contact_info: string | null
          internal_deal_memo_link: string | null
          internal_notes: string | null
          internal_primary_owner: string | null
          internal_salesforce_link: string | null
          investment_thesis: string | null
          is_internal_deal: boolean
          is_priority_target: boolean | null
          is_publicly_traded: boolean | null
          key_quotes: string[] | null
          key_risks: Json | null
          linkedin_boost: number | null
          linkedin_employee_count: number | null
          linkedin_employee_range: string | null
          linkedin_match_confidence: string | null
          linkedin_match_signals: Json | null
          linkedin_url: string | null
          linkedin_verified_at: string | null
          location: string | null
          location_radius_requirement: string | null
          main_contact_email: string | null
          main_contact_first_name: string | null
          main_contact_last_name: string | null
          main_contact_linkedin: string | null
          main_contact_name: string | null
          main_contact_phone: string | null
          main_contact_title: string | null
          management_depth: string | null
          manual_rank_override: number | null
          metric_3_custom_label: string | null
          metric_3_custom_subtitle: string | null
          metric_3_custom_value: string | null
          metric_3_type: string | null
          metric_4_custom_label: string | null
          metric_4_custom_subtitle: string | null
          metric_4_custom_value: string | null
          metric_4_type: string | null
          needs_buyer_search: boolean | null
          needs_buyer_search_at: string | null
          needs_buyer_search_by: string | null
          needs_owner_contact: boolean | null
          needs_owner_contact_at: string | null
          needs_owner_contact_by: string | null
          notes: string | null
          notes_analyzed_at: string | null
          number_of_locations: number | null
          owner_goals: string | null
          owner_notes: string | null
          owner_response: string | null
          ownership_structure: string | null
          part_time_employees: number | null
          presented_by_admin_id: string | null
          primary_owner_id: string | null
          project_name: string | null
          published_at: string | null
          published_by_admin_id: string | null
          pushed_to_all_deals: boolean | null
          pushed_to_all_deals_at: string | null
          pushed_to_marketplace: boolean | null
          pushed_to_marketplace_at: string | null
          pushed_to_marketplace_by: string | null
          quality_calculation_version: string | null
          real_estate_info: string | null
          referral_partner_id: string | null
          remarketing_status: string | null
          revenue: number | null
          revenue_is_inferred: boolean | null
          revenue_metric_subtitle: string | null
          revenue_model: string | null
          revenue_score: number | null
          revenue_source_quote: string | null
          salesforce_account_id: string | null
          scoring_notes: string | null
          seller_interest_score: number | null
          seller_involvement_preference: string | null
          seller_motivation: string | null
          service_mix: string | null
          services: string[] | null
          sf_created_date: string | null
          sf_historic_note_summary: string | null
          sf_interest_in_selling: string | null
          sf_last_modified_date: string | null
          sf_marketplace_sub_stage: string | null
          sf_note_summary: string | null
          sf_owner_id: string | null
          sf_previous_search_opportunity_id: string | null
          sf_primary_client_account_id: string | null
          sf_primary_opportunity_id: string | null
          sf_record_type_id: string | null
          sf_remarketing: boolean | null
          sf_remarketing_cb_create_date: string | null
          sf_remarketing_reason: string | null
          sf_remarketing_target_stages: string | null
          sf_remarks_internal: string | null
          sf_target_stage: string | null
          sf_target_sub_stage: string | null
          sf_tier: string | null
          source_deal_id: string | null
          special_requirements: string | null
          status: string
          status_tag: string | null
          street_address: string | null
          tags: string[] | null
          team_page_employee_count: number | null
          technology_systems: string | null
          timeline_notes: string | null
          timeline_preference: string | null
          title: string
          transition_preferences: string | null
          universe_build_flagged: boolean | null
          universe_build_flagged_at: string | null
          universe_build_flagged_by: string | null
          updated_at: string
          visible_to_buyer_types: string[] | null
          website: string
        }[]
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      generate_deal_identifier: { Args: never; Returns: string }
      get_all_user_roles: {
        Args: never
        Returns: {
          granted_at: string
          granted_by: string
          role: Database["public"]["Enums"]["app_role"]
          user_email: string
          user_first_name: string
          user_id: string
          user_last_name: string
        }[]
      }
      get_buyer_deal_history: {
        Args: { p_buyer_id: string }
        Returns: {
          deal_category: string
          deal_id: string
          deal_title: string
          has_data_room_access: boolean
          has_full_memo_access: boolean
          has_teaser_access: boolean
          last_memo_sent_at: string
          memos_sent: number
          pipeline_stage: string
          pipeline_stage_id: string
        }[]
      }
      get_connection_request_analytics: {
        Args: { time_range?: string }
        Returns: {
          approved_requests: number
          conversion_rate: number
          pending_requests: number
          rejected_requests: number
          total_requests: number
        }[]
      }
      get_connection_request_conflicts: {
        Args: never
        Returns: {
          conflict_details: Json
          conflict_type: string
          listing_title: string
          needs_review: boolean
          request_id: string
          user_email: string
        }[]
      }
      get_deal_access_matrix: {
        Args: { p_deal_id: string }
        Returns: {
          access_id: string
          access_token: string
          buyer_company: string
          buyer_name: string
          can_view_data_room: boolean
          can_view_full_memo: boolean
          can_view_teaser: boolean
          contact_id: string
          contact_title: string
          expires_at: string
          fee_agreement_override: boolean
          fee_agreement_override_reason: string
          fee_agreement_signed: boolean
          granted_at: string
          last_access_at: string
          marketplace_user_id: string
          remarketing_buyer_id: string
          revoked_at: string
        }[]
      }
      get_deal_distribution_log: {
        Args: { p_deal_id: string }
        Returns: {
          buyer_company: string
          buyer_name: string
          channel: string
          email_address: string
          log_id: string
          memo_type: string
          notes: string
          sent_at: string
          sent_by_name: string
        }[]
      }
      get_deals_with_buyer_profiles: {
        Args: never
        Returns: {
          admin_email: string
          admin_first_name: string
          admin_id: string
          admin_last_name: string
          buyer_company: string
          buyer_email: string
          buyer_first_name: string
          buyer_last_name: string
          buyer_phone: string
          buyer_quality_score: number
          buyer_tier: number
          buyer_type: string
          buyer_website: string
          connection_request_id: string
          contact_company: string
          contact_email: string
          contact_name: string
          contact_phone: string
          contact_role: string
          deal_created_at: string
          deal_deleted_at: string
          deal_description: string
          deal_expected_close_date: string
          deal_id: string
          deal_priority: string
          deal_probability: number
          deal_source: string
          deal_stage_entered_at: string
          deal_title: string
          deal_updated_at: string
          deal_value: number
          fee_agreement_status: string
          followed_up: boolean
          followed_up_at: string
          listing_category: string
          listing_deal_total_score: number
          listing_ebitda: number
          listing_id: string
          listing_image_url: string
          listing_internal_company_name: string
          listing_is_priority_target: boolean
          listing_location: string
          listing_needs_buyer_search: boolean
          listing_needs_owner_contact: boolean
          listing_revenue: number
          listing_title: string
          meeting_scheduled: boolean
          nda_status: string
          negative_followed_up: boolean
          negative_followed_up_at: string
          stage_color: string
          stage_default_probability: number
          stage_id: string
          stage_is_active: boolean
          stage_is_default: boolean
          stage_is_system_stage: boolean
          stage_name: string
          stage_position: number
          stage_type: string
        }[]
      }
      get_deals_with_details: {
        Args: never
        Returns: {
          activity_count: number
          assigned_admin_email: string
          assigned_admin_name: string
          assigned_to: string
          buyer_contact_email: string
          buyer_contact_id: string
          buyer_contact_name: string
          completed_tasks: number
          contact_company: string
          contact_email: string
          contact_name: string
          contact_phone: string
          contact_role: string
          deal_created_at: string
          deal_description: string
          deal_expected_close_date: string
          deal_id: string
          deal_priority: string
          deal_probability: number
          deal_source: string
          deal_stage_entered_at: string
          deal_title: string
          deal_updated_at: string
          deal_value: number
          fee_agreement_status: string
          followed_up: boolean
          followed_up_at: string
          listing_ebitda: number
          listing_id: string
          listing_location: string
          listing_revenue: number
          listing_title: string
          nda_status: string
          pending_tasks: number
          remarketing_buyer_company: string
          remarketing_buyer_id: string
          seller_contact_id: string
          seller_contact_name: string
          stage_color: string
          stage_id: string
          stage_name: string
          stage_position: number
          total_tasks: number
        }[]
      }
      get_feedback_analytics: {
        Args: { days_back?: number }
        Returns: {
          avg_response_time_hours: number
          category_breakdown: Json
          daily_trends: Json
          priority_breakdown: Json
          satisfaction_avg: number
          top_users: Json
          total_feedback: number
          unread_count: number
        }[]
      }
      get_internal_team_members: {
        Args: never
        Returns: {
          email: string
          first_name: string
          last_name: string
          role: string
          user_id: string
        }[]
      }
      get_my_agreement_status: {
        Args: never
        Returns: {
          fee_coverage_source: string
          fee_covered: boolean
          fee_firm_name: string
          fee_parent_firm_name: string
          fee_status: string
          nda_coverage_source: string
          nda_covered: boolean
          nda_firm_name: string
          nda_parent_firm_name: string
          nda_status: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_or_create_firm: {
        Args: { p_company_name: string; p_email?: string; p_website?: string }
        Returns: string
      }
      get_permission_audit_log: {
        Args: { filter_user_id?: string; limit_count?: number }
        Returns: {
          changed_by: string
          changer_email: string
          changer_name: string
          created_at: string
          id: string
          new_role: Database["public"]["Enums"]["app_role"]
          old_role: Database["public"]["Enums"]["app_role"]
          reason: string
          target_email: string
          target_name: string
          target_user_id: string
        }[]
      }
      get_phoneburner_connected_users: {
        Args: never
        Returns: {
          display_name: string
          expires_at: string
          phoneburner_user_email: string
          profile_email: string
          profile_first_name: string
          profile_last_name: string
          token_id: string
          updated_at: string
          user_id: string
        }[]
      }
      get_remarketing_dashboard_stats: {
        Args: { p_from_date?: string }
        Returns: Json
      }
      get_scoring_progress: {
        Args: { p_listing_id: string }
        Returns: {
          completed_at: string
          failed_count: number
          progress_pct: number
          run_id: string
          scored_count: number
          started_at: string
          status: string
          total_buyers: number
        }[]
      }
      get_simple_marketplace_analytics: {
        Args: { days_back?: number }
        Returns: {
          active_sessions: number
          new_users: number
          pending_connections: number
          session_count: number
          total_listings: number
          total_page_views: number
          total_users: number
        }[]
      }
      get_stage_deal_count: { Args: { stage_uuid: string }; Returns: number }
      get_user_firm_agreement_status: {
        Args: { p_user_id: string }
        Returns: {
          fee_agreement_document_url: string
          fee_agreement_signed: boolean
          fee_agreement_signed_at: string
          fee_agreement_signed_by_name: string
          fee_agreement_status: string
          fee_docuseal_status: string
          fee_signed_document_url: string
          firm_id: string
          firm_name: string
          nda_document_url: string
          nda_docuseal_status: string
          nda_signed: boolean
          nda_signed_at: string
          nda_signed_by_name: string
          nda_signed_document_url: string
          nda_status: string
        }[]
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment: { Args: { x: number }; Returns: number }
      increment_global_queue_progress: {
        Args: {
          p_completed_delta?: number
          p_failed_delta?: number
          p_operation_type: string
        }
        Returns: undefined
      }
      increment_journey_sessions: {
        Args: {
          p_page_path?: string
          p_session_id: string
          p_visitor_id: string
        }
        Returns: undefined
      }
      increment_link_open_count: { Args: { p_link_id: string }; Returns: Json }
      increment_provider_concurrent: {
        Args: { p_provider: string }
        Returns: undefined
      }
      increment_scoring_run_progress: {
        Args: {
          p_failed_delta?: number
          p_listing_id: string
          p_scored_delta?: number
        }
        Returns: undefined
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_valid_company_website: { Args: { website: string }; Returns: boolean }
      link_journey_to_user: {
        Args: { p_user_id: string; p_visitor_id: string }
        Returns: undefined
      }
      log_data_room_event: {
        Args: {
          p_action: string
          p_deal_id: string
          p_document_id?: string
          p_ip_address?: unknown
          p_metadata?: Json
          p_user_agent?: string
          p_user_id: string
        }
        Returns: string
      }
      log_enrichment_event: {
        Args: {
          p_duration_ms?: number
          p_entity_id: string
          p_entity_type: string
          p_error_message?: string
          p_fields_updated?: number
          p_function_name: string
          p_job_id?: string
          p_provider: string
          p_status: string
          p_step_name?: string
          p_tokens_used?: number
        }
        Returns: string
      }
      log_fee_agreement_email: {
        Args: {
          admin_notes?: string
          recipient_email: string
          target_user_id: string
        }
        Returns: boolean
      }
      log_nda_email: {
        Args: {
          admin_notes?: string
          recipient_email: string
          target_user_id: string
        }
        Returns: boolean
      }
      log_security_event: {
        Args: { event_type: string; metadata?: Json; user_id?: string }
        Returns: undefined
      }
      mark_event_failed: {
        Args: { p_error_message: string; p_event_id: string }
        Returns: undefined
      }
      mark_overdue_standup_tasks: { Args: never; Returns: number }
      match_deal_alerts_with_listing: {
        Args: { listing_data: Json }
        Returns: {
          alert_frequency: string
          alert_id: string
          alert_name: string
          user_email: string
          user_id: string
        }[]
      }
      merge_or_create_connection_request: {
        Args: {
          p_lead_company?: string
          p_lead_email?: string
          p_lead_name?: string
          p_lead_phone?: string
          p_lead_role?: string
          p_listing_id: string
          p_user_message: string
        }
        Returns: string
      }
      move_deal_stage: {
        Args: { deal_id: string; new_stage_id: string }
        Returns: boolean
      }
      move_deal_stage_with_ownership: {
        Args: {
          p_current_admin_id: string
          p_deal_id: string
          p_new_stage_id: string
        }
        Returns: Json
      }
      normalize_company_name: { Args: { name: string }; Returns: string }
      normalize_domain: { Args: { url: string }; Returns: string }
      normalize_state_name: { Args: { state_name: string }; Returns: string }
      promote_user_to_admin: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      recover_stale_queue_items: {
        Args: { stale_minutes?: number }
        Returns: Json
      }
      refresh_analytics_views: { Args: never; Returns: undefined }
      refresh_audit_materialized_views: { Args: never; Returns: undefined }
      refresh_materialized_views_safe: { Args: never; Returns: Json }
      reset_all_admin_notifications:
        | { Args: never; Returns: undefined }
        | { Args: { admin_uuid: string }; Returns: undefined }
      reset_failed_enrichments: { Args: never; Returns: number }
      reset_firm_agreement_data: {
        Args: { p_firm_id: string }
        Returns: undefined
      }
      reset_stale_concurrent_counts: { Args: never; Returns: undefined }
      resolve_contact_agreement_status: {
        Args: { p_contact_id: string }
        Returns: Json
      }
      resolve_user_firm_id: { Args: { p_user_id: string }; Returns: string }
      restore_deal: { Args: { deal_id: string }; Returns: boolean }
      restore_soft_deleted: {
        Args: { p_record_id: string; p_table_name: string }
        Returns: boolean
      }
      search_buyers_by_similarity: {
        Args: { min_similarity?: number; search_name: string }
        Returns: {
          company_name: string
          id: string
          score: number
        }[]
      }
      search_listings: {
        Args: {
          filter_category?: string
          filter_ebitda_max?: number
          filter_ebitda_min?: number
          filter_location?: string
          filter_revenue_max?: number
          filter_revenue_min?: number
          filter_status?: string
          page_limit?: number
          page_offset?: number
          search_query: string
        }
        Returns: {
          acquisition_type: string
          categories: string[]
          category: string
          created_at: string
          custom_metric_label: string
          custom_metric_subtitle: string
          custom_metric_value: string
          description: string
          description_html: string
          ebitda: number
          ebitda_metric_subtitle: string
          full_time_employees: number
          hero_description: string
          id: string
          image_url: string
          location: string
          metric_3_custom_label: string
          metric_3_custom_subtitle: string
          metric_3_custom_value: string
          metric_3_type: string
          metric_4_custom_label: string
          metric_4_custom_subtitle: string
          metric_4_custom_value: string
          metric_4_type: string
          owner_notes: string
          part_time_employees: number
          rank: number
          revenue: number
          revenue_metric_subtitle: string
          status: string
          status_tag: string
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          visible_to_buyer_types: string[]
        }[]
      }
      search_pe_firms_by_similarity: {
        Args: { min_similarity?: number; search_name: string }
        Returns: {
          company_name: string
          id: string
          score: number
        }[]
      }
      search_transcripts_semantic: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_buyer_id?: string
          query_embedding: string
        }
        Returns: {
          buyer_id: string
          call_date: string
          created_at: string
          id: string
          similarity: number
          source_type: string
          title: string
          transcript_snippet: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_deal: {
        Args: { deal_id: string; deletion_reason?: string }
        Returns: boolean
      }
      soft_delete_listing: { Args: { listing_id: string }; Returns: boolean }
      try_acquire_queue_processor_lock: {
        Args: { p_queue_name: string }
        Returns: boolean
      }
      update_agreement_status: {
        Args: {
          p_field: string
          p_firm_agreement_id: string
          p_new_status: string
        }
        Returns: undefined
      }
      update_agreement_via_user: {
        Args: {
          p_action: string
          p_admin_notes?: string
          p_agreement_type: string
          p_user_id: string
        }
        Returns: Json
      }
      update_connection_request_followup: {
        Args: {
          admin_notes?: string
          is_followed_up: boolean
          request_id: string
        }
        Returns: boolean
      }
      update_connection_request_negative_followup: {
        Args: {
          admin_notes?: string
          is_followed_up: boolean
          request_id: string
        }
        Returns: boolean
      }
      update_connection_request_notes: {
        Args: { notes: string; request_id: string }
        Returns: boolean
      }
      update_connection_request_status: {
        Args: { admin_notes?: string; new_status: string; request_id: string }
        Returns: boolean
      }
      update_connection_request_status_simple: {
        Args: { new_status: string; request_id: string }
        Returns: boolean
      }
      update_connection_request_status_with_notes: {
        Args: {
          decision_notes?: string
          new_status: string
          request_id: string
        }
        Returns: boolean
      }
      update_daily_metrics:
        | { Args: never; Returns: undefined }
        | { Args: { target_date?: string }; Returns: undefined }
      update_deal_owner: {
        Args: { p_actor_id?: string; p_assigned_to: string; p_deal_id: string }
        Returns: Json
      }
      update_enrichment_job_progress: {
        Args: {
          p_circuit_breaker?: boolean
          p_error_message?: string
          p_failed_delta?: number
          p_job_id: string
          p_last_processed_id?: string
          p_rate_limited?: boolean
          p_skipped_delta?: number
          p_succeeded_delta?: number
        }
        Returns: undefined
      }
      update_fee_agreement_email_status: {
        Args: { admin_notes?: string; is_sent: boolean; target_user_id: string }
        Returns: boolean
      }
      update_fee_agreement_firm_status:
        | {
            Args: {
              p_firm_id: string
              p_is_signed: boolean
              p_signed_at?: string
              p_signed_by_user_id?: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_firm_id: string
              p_is_signed: boolean
              p_signed_by_name?: string
              p_signed_by_user_id?: string
            }
            Returns: undefined
          }
      update_fee_agreement_firm_status_with_notes: {
        Args: {
          p_admin_notes?: string
          p_firm_id: string
          p_is_signed: boolean
          p_signed_by_name?: string
          p_signed_by_user_id?: string
        }
        Returns: boolean
      }
      update_fee_agreement_status: {
        Args: {
          admin_notes?: string
          is_signed: boolean
          target_user_id: string
        }
        Returns: boolean
      }
      update_firm_agreement_status: {
        Args: {
          p_agreement_type: string
          p_custom_terms?: string
          p_deal_id?: string
          p_document_url?: string
          p_expires_at?: string
          p_firm_id: string
          p_new_status: string
          p_notes?: string
          p_redline_document_url?: string
          p_redline_notes?: string
          p_scope?: string
          p_signed_by_name?: string
          p_signed_by_user_id?: string
          p_source?: string
        }
        Returns: undefined
      }
      update_journey_milestone: {
        Args: {
          p_milestone_key: string
          p_milestone_time?: string
          p_visitor_id: string
        }
        Returns: undefined
      }
      update_lead_fee_agreement_email_status:
        | { Args: { p_request_id: string; p_value: boolean }; Returns: boolean }
        | {
            Args: { admin_notes?: string; is_sent: boolean; request_id: string }
            Returns: boolean
          }
      update_lead_fee_agreement_status:
        | {
            Args: { p_request_id: string; p_value: boolean }
            Returns: undefined
          }
        | {
            Args: {
              admin_notes?: string
              is_signed: boolean
              request_id: string
            }
            Returns: boolean
          }
      update_lead_nda_email_status:
        | { Args: { p_request_id: string; p_value: boolean }; Returns: boolean }
        | {
            Args: { admin_notes?: string; is_sent: boolean; request_id: string }
            Returns: boolean
          }
      update_lead_nda_status:
        | {
            Args: { p_request_id: string; p_value: boolean }
            Returns: undefined
          }
        | {
            Args: {
              admin_notes?: string
              is_signed: boolean
              request_id: string
            }
            Returns: boolean
          }
      update_nda_email_status: {
        Args: { admin_notes?: string; is_sent: boolean; target_user_id: string }
        Returns: boolean
      }
      update_nda_firm_status:
        | {
            Args: {
              p_firm_id: string
              p_is_signed: boolean
              p_signed_at?: string
              p_signed_by_user_id?: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_firm_id: string
              p_is_signed: boolean
              p_signed_by_name?: string
              p_signed_by_user_id?: string
            }
            Returns: undefined
          }
      update_nda_firm_status_with_notes: {
        Args: {
          p_admin_notes?: string
          p_firm_id: string
          p_is_signed: boolean
          p_signed_by_name?: string
          p_signed_by_user_id?: string
        }
        Returns: boolean
      }
      update_nda_status: {
        Args: {
          admin_notes?: string
          is_signed: boolean
          target_user_id: string
        }
        Returns: boolean
      }
      upsert_alignment_scoring_queue: {
        Args: {
          p_buyer_id: string
          p_score_type: string
          p_status?: string
          p_universe_id: string
        }
        Returns: undefined
      }
      upsert_deal_scoring_queue: {
        Args: {
          p_listing_id: string
          p_score_type: string
          p_status?: string
          p_universe_id: string
        }
        Returns: undefined
      }
      upsert_enrichment_job: {
        Args: {
          p_job_type: string
          p_source?: string
          p_total_records: number
          p_triggered_by?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "moderator" | "viewer"
      conversation_state:
        | "new"
        | "waiting_on_buyer"
        | "waiting_on_admin"
        | "claimed"
        | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "moderator", "viewer"],
      conversation_state: [
        "new",
        "waiting_on_buyer",
        "waiting_on_admin",
        "claimed",
        "closed",
      ],
    },
  },
} as const
