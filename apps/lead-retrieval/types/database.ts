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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      campaign_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          campaign_id: string
          created_at: string
          id: string
          provider: string | null
          provider_message_id: string | null
          recipient_id: string
          send_error: string | null
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          campaign_id: string
          created_at?: string
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_id: string
          send_error?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          campaign_id?: string
          created_at?: string
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string
          send_error?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          draft_body_html: string | null
          draft_body_text: string | null
          draft_subject: string | null
          draft_updated_at: string | null
          id: string
          mode: string
          name: string
          scheduled_at: string | null
          selected_signals: Json
          status: string
          subject_line: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          draft_body_html?: string | null
          draft_body_text?: string | null
          draft_subject?: string | null
          draft_updated_at?: string | null
          id?: string
          mode: string
          name: string
          scheduled_at?: string | null
          selected_signals?: Json
          status?: string
          subject_line?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          draft_body_html?: string | null
          draft_body_text?: string | null
          draft_subject?: string | null
          draft_updated_at?: string | null
          id?: string
          mode?: string
          name?: string
          scheduled_at?: string | null
          selected_signals?: Json
          status?: string
          subject_line?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          default_enrichment_provider: string | null
          id: string
          name: string
          organizer_id: string
        }
        Insert: {
          created_at?: string
          default_enrichment_provider?: string | null
          id?: string
          name: string
          organizer_id: string
        }
        Update: {
          created_at?: string
          default_enrichment_provider?: string | null
          id?: string
          name?: string
          organizer_id?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          campaign_message_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          campaign_message_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          campaign_message_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_message_id_fkey"
            columns: ["campaign_message_id"]
            isOneToOne: false
            referencedRelation: "campaign_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      event_users: {
        Row: {
          created_at: string
          event_id: string
          exhibitor_company_id: string | null
          id: string
          permissions: Json
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          exhibitor_company_id?: string | null
          id?: string
          permissions?: Json
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          exhibitor_company_id?: string | null
          id?: string
          permissions?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_users_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_users_exhibitor_company_id_fkey"
            columns: ["exhibitor_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          briefing_strategy: Json | null
          city: string | null
          company_id: string
          container_kind: string
          created_at: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          location: string | null
          name: string
          start_date: string | null
          state: string | null
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          briefing_strategy?: Json | null
          city?: string | null
          company_id: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name: string
          start_date?: string | null
          state?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          briefing_strategy?: Json | null
          city?: string | null
          company_id?: string
          container_kind?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name?: string
          start_date?: string | null
          state?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exhibitors: {
        Row: {
          company_id: string
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exhibitors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exhibitors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_state_nonces: {
        Row: {
          code_verifier_digest: string
          company_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          jti_digest: string
          return_to: string
          user_id: string
        }
        Insert: {
          code_verifier_digest: string
          company_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          jti_digest: string
          return_to?: string
          user_id: string
        }
        Update: {
          code_verifier_digest?: string
          company_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          jti_digest?: string
          return_to?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_state_nonces_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_oauth_state_nonces_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_provider_preferences: {
        Row: {
          capability: string
          company_id: string
          created_at: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capability: string
          company_id: string
          created_at?: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capability?: string
          company_id?: string
          created_at?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_provider_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_provider_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_meeting_provider_claims: {
        Row: {
          acting_user_id: string
          company_id: string
          created_at: string
          idempotency_key: string
          lead_id: string
          provider: string
        }
        Insert: {
          acting_user_id: string
          company_id: string
          created_at?: string
          idempotency_key: string
          lead_id: string
          provider: string
        }
        Update: {
          acting_user_id?: string
          company_id?: string
          created_at?: string
          idempotency_key?: string
          lead_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_meeting_provider_claims_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_meeting_provider_claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_meeting_provider_claims_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_calendar_meeting_activities: {
        Row: {
          acting_user_id: string | null
          attendee_email: string
          cancelled_at: string | null
          company_id: string
          connection_id: string | null
          created_at: string
          ends_at: string
          event_id: string | null
          id: string
          idempotency_key: string
          join_url: string | null
          last_operation: string
          last_operation_key: string
          last_operation_status: string
          lead_id: string
          provider_event_id: string | null
          safe_error_category: string | null
          starts_at: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          acting_user_id?: string | null
          attendee_email: string
          cancelled_at?: string | null
          company_id: string
          connection_id?: string | null
          created_at?: string
          ends_at: string
          event_id?: string | null
          id?: string
          idempotency_key: string
          join_url?: string | null
          last_operation?: string
          last_operation_key: string
          last_operation_status?: string
          lead_id: string
          provider_event_id?: string | null
          safe_error_category?: string | null
          starts_at: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          acting_user_id?: string | null
          attendee_email?: string
          cancelled_at?: string | null
          company_id?: string
          connection_id?: string | null
          created_at?: string
          ends_at?: string
          event_id?: string | null
          id?: string
          idempotency_key?: string
          join_url?: string | null
          last_operation?: string
          last_operation_key?: string
          last_operation_status?: string
          lead_id?: string
          provider_event_id?: string | null
          safe_error_category?: string | null
          starts_at?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_calendar_meeting_activities_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microsoft_calendar_meeting_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microsoft_calendar_meeting_activities_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "microsoft_365_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microsoft_calendar_meeting_activities_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microsoft_calendar_meeting_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_365_connections: {
        Row: {
          company_id: string
          connected_at: string
          created_at: string
          granted_scopes: string[]
          id: string
          last_error_at: string | null
          last_error_code: string | null
          last_refresh_at: string | null
          last_refresh_attempt_at: string | null
          microsoft_display_name: string | null
          microsoft_email: string
          microsoft_subject: string
          refresh_lease_token: string | null
          refresh_lease_until: string | null
          status: string
          token_expires_at: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          connected_at?: string
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_refresh_at?: string | null
          last_refresh_attempt_at?: string | null
          microsoft_display_name?: string | null
          microsoft_email: string
          microsoft_subject: string
          refresh_lease_token?: string | null
          refresh_lease_until?: string | null
          status?: string
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          connected_at?: string
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_refresh_at?: string | null
          last_refresh_attempt_at?: string | null
          microsoft_display_name?: string | null
          microsoft_email?: string
          microsoft_subject?: string
          refresh_lease_token?: string | null
          refresh_lease_until?: string | null
          status?: string
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_365_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microsoft_365_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_365_connection_secrets: {
        Row: {
          access_token_encrypted: string
          connection_id: string
          created_at: string
          encryption_key_version: string
          refresh_token_encrypted: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          connection_id: string
          created_at?: string
          encryption_key_version: string
          refresh_token_encrypted: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          connection_id?: string
          created_at?: string
          encryption_key_version?: string
          refresh_token_encrypted?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_365_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "microsoft_365_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_oauth_state_nonces: {
        Row: {
          code_verifier_digest: string
          company_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          jti_digest: string
          return_to: string
          user_id: string
        }
        Insert: {
          code_verifier_digest: string
          company_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          jti_digest: string
          return_to?: string
          user_id: string
        }
        Update: {
          code_verifier_digest?: string
          company_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          jti_digest?: string
          return_to?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_oauth_state_nonces_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "microsoft_oauth_state_nonces_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_oauth_launch_tickets: {
        Row: {
          company_id: string
          consumed_at: string | null
          correlation: string
          created_at: string
          expires_at: string
          force_reconnect: boolean
          provider: string
          ticket_digest: string
          user_id: string
        }
        Insert: {
          company_id: string
          consumed_at?: string | null
          correlation: string
          created_at?: string
          expires_at: string
          force_reconnect?: boolean
          provider: string
          ticket_digest: string
          user_id: string
        }
        Update: {
          company_id?: string
          consumed_at?: string | null
          correlation?: string
          created_at?: string
          expires_at?: string
          force_reconnect?: boolean
          provider?: string
          ticket_digest?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_oauth_launch_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_oauth_launch_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_activities: {
        Row: {
          acting_user_id: string | null
          attempt_started_at: string
          company_id: string
          created_at: string
          document_id: string | null
          event_id: string | null
          failed_at: string | null
          google_connection_id: string | null
          id: string
          idempotency_key: string
          lead_id: string
          microsoft_connection_id: string | null
          provider: string
          provider_http_status: number | null
          provider_message_id: string | null
          provider_thread_id: string | null
          recipient_email: string
          retry_after_seconds: number | null
          safe_error_category: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acting_user_id?: string | null
          attempt_started_at?: string
          company_id: string
          created_at?: string
          document_id?: string | null
          event_id?: string | null
          failed_at?: string | null
          google_connection_id?: string | null
          id?: string
          idempotency_key: string
          lead_id: string
          microsoft_connection_id?: string | null
          provider?: string
          provider_http_status?: number | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          recipient_email: string
          retry_after_seconds?: number | null
          safe_error_category?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acting_user_id?: string | null
          attempt_started_at?: string
          company_id?: string
          created_at?: string
          document_id?: string | null
          event_id?: string | null
          failed_at?: string | null
          google_connection_id?: string | null
          id?: string
          idempotency_key?: string
          lead_id?: string
          microsoft_connection_id?: string | null
          provider?: string
          provider_http_status?: number | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          recipient_email?: string
          retry_after_seconds?: number | null
          safe_error_category?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_email_activities_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_email_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_email_activities_connection_id_fkey"
            columns: ["google_connection_id"]
            isOneToOne: false
            referencedRelation: "google_workspace_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_activities_microsoft_connection_id_fkey"
            columns: ["microsoft_connection_id"]
            isOneToOne: false
            referencedRelation: "microsoft_365_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_email_activities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_email_activities_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_email_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_meeting_activities: {
        Row: {
          acting_user_id: string | null
          attendee_email: string
          cancelled_at: string | null
          company_id: string
          conference_request_id: string | null
          connection_id: string | null
          created_at: string
          ends_at: string
          event_id: string | null
          google_event_id: string
          google_meet_uri: string | null
          id: string
          idempotency_key: string
          last_operation: string
          last_operation_key: string
          last_operation_status: string
          lead_id: string
          provider_calendar_id: string
          safe_error_category: string | null
          starts_at: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          acting_user_id?: string | null
          attendee_email: string
          cancelled_at?: string | null
          company_id: string
          conference_request_id?: string | null
          connection_id?: string | null
          created_at?: string
          ends_at: string
          event_id?: string | null
          google_event_id: string
          google_meet_uri?: string | null
          id?: string
          idempotency_key: string
          last_operation?: string
          last_operation_key: string
          last_operation_status?: string
          lead_id: string
          provider_calendar_id?: string
          safe_error_category?: string | null
          starts_at: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          acting_user_id?: string | null
          attendee_email?: string
          cancelled_at?: string | null
          company_id?: string
          conference_request_id?: string | null
          connection_id?: string | null
          created_at?: string
          ends_at?: string
          event_id?: string | null
          google_event_id?: string
          google_meet_uri?: string | null
          id?: string
          idempotency_key?: string
          last_operation?: string
          last_operation_key?: string
          last_operation_status?: string
          lead_id?: string
          provider_calendar_id?: string
          safe_error_category?: string | null
          starts_at?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_meeting_activities_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_meeting_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_meeting_activities_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "google_workspace_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_meeting_activities_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_meeting_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      google_workspace_connection_secrets: {
        Row: {
          access_token_encrypted: string
          connection_id: string
          created_at: string
          encryption_key_version: string
          refresh_token_encrypted: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          connection_id: string
          created_at?: string
          encryption_key_version: string
          refresh_token_encrypted: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          connection_id?: string
          created_at?: string
          encryption_key_version?: string
          refresh_token_encrypted?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_workspace_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "google_workspace_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      google_workspace_connections: {
        Row: {
          company_id: string
          connected_at: string
          created_at: string
          google_display_name: string | null
          google_email: string
          google_subject: string
          granted_scopes: string[]
          id: string
          last_error_at: string | null
          last_error_code: string | null
          last_refresh_at: string | null
          last_refresh_attempt_at: string | null
          refresh_lease_token: string | null
          refresh_lease_until: string | null
          status: string
          token_expires_at: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          connected_at?: string
          created_at?: string
          google_display_name?: string | null
          google_email: string
          google_subject: string
          granted_scopes?: string[]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_refresh_at?: string | null
          last_refresh_attempt_at?: string | null
          refresh_lease_token?: string | null
          refresh_lease_until?: string | null
          status?: string
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          connected_at?: string
          created_at?: string
          google_display_name?: string | null
          google_email?: string
          google_subject?: string
          granted_scopes?: string[]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_refresh_at?: string | null
          last_refresh_attempt_at?: string | null
          refresh_lease_token?: string | null
          refresh_lease_until?: string | null
          status?: string
          token_expires_at?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_workspace_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_workspace_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch_field_mapping_state: {
        Row: {
          batch_id: string
          csv_headers: string[]
          custom_field_definitions: Json
          preview_rows: Json
          selections: Json
          updated_at: string
        }
        Insert: {
          batch_id: string
          csv_headers?: string[]
          custom_field_definitions?: Json
          preview_rows?: Json
          selections?: Json
          updated_at?: string
        }
        Update: {
          batch_id?: string
          csv_headers?: string[]
          custom_field_definitions?: Json
          preview_rows?: Json
          selections?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_field_mapping_state_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch_row_briefings: {
        Row: {
          approval_status: string
          batch_id: string
          batch_row_id: string
          content: Json
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          batch_id: string
          batch_row_id: string
          content?: Json
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          batch_id?: string
          batch_row_id?: string
          content?: Json
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_row_briefings_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_row_briefings_batch_row_id_fkey"
            columns: ["batch_row_id"]
            isOneToOne: true
            referencedRelation: "import_batch_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batch_row_briefings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch_rows: {
        Row: {
          batch_id: string
          cells: Json
          created_at: string
          id: string
          row_index: number
          wizard_enrichment_normalized: Json | null
        }
        Insert: {
          batch_id: string
          cells: Json
          created_at?: string
          id?: string
          row_index: number
          wizard_enrichment_normalized?: Json | null
        }
        Update: {
          batch_id?: string
          cells?: Json
          created_at?: string
          id?: string
          row_index?: number
          wizard_enrichment_normalized?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          company_id: string
          created_at: string
          data_revision: number
          discarded_at: string | null
          id: string
          published_at: string | null
          source_last_filename: string | null
          source_kind: string
          source_selected_lead_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          data_revision?: number
          discarded_at?: string | null
          id?: string
          published_at?: string | null
          source_last_filename?: string | null
          source_kind?: string
          source_selected_lead_ids?: string[]
          status: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data_revision?: number
          discarded_at?: string | null
          id?: string
          published_at?: string | null
          source_last_filename?: string | null
          source_kind?: string
          source_selected_lead_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_event_knowledge_items: {
        Row: {
          byte_size: number | null
          company_id: string
          content_group: string
          created_at: string
          created_by: string | null
          event_id: string
          file_name: string | null
          id: string
          kind: string
          mime_type: string | null
          notes_body: string | null
          notes_title: string | null
          storage_path: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          byte_size?: number | null
          company_id: string
          content_group: string
          created_at?: string
          created_by?: string | null
          event_id: string
          file_name?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          notes_body?: string | null
          notes_title?: string | null
          storage_path?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          byte_size?: number | null
          company_id?: string
          content_group?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          file_name?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          notes_body?: string | null
          notes_title?: string | null
          storage_path?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefing_event_knowledge_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefing_event_knowledge_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefing_event_knowledge_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_enrichments: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          provider: string
          raw_response: Json
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          provider: string
          raw_response: Json
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          provider?: string
          raw_response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_enrichments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_briefings: {
        Row: {
          approval_status: string
          company_id: string
          content: Json
          created_at: string
          id: string
          lead_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          company_id: string
          content?: Json
          created_at?: string
          id?: string
          lead_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          company_id?: string
          content?: Json
          created_at?: string
          id?: string
          lead_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_briefings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_briefings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_briefings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_domain: string | null
          company_id: string
          company_size: string | null
          company_text: string | null
          created_at: string
          email: string | null
          enriched_company_domain: string | null
          enriched_company_size: string | null
          enriched_industry: string | null
          enriched_job_title: string | null
          enriched_linkedin_url: string | null
          enriched_score: number | null
          enriched_seniority: string | null
          event_id: string | null
          follow_up_at: string | null
          follow_up_calendar_event_id: string | null
          follow_up_calendar_owner_user_id: string | null
          follow_up_calendar_provider: string | null
          follow_up_completed_at: string | null
          follow_up_date: string | null
          follow_up_last_operation_fingerprint: string | null
          follow_up_last_operation_key: string | null
          follow_up_last_operation_result: Json | null
          follow_up_note: string | null
          full_name: string
          id: string
          industry: string | null
          intent_signals: Json
          is_hot: boolean
          job_title: string | null
          linkedin_url: string | null
          metadata: Json
          owner_user_id: string | null
          phone: string | null
          priority_score: number
          rating: number
          seniority: string | null
          status: string
          temperature: string | null
          updated_at: string
        }
        Insert: {
          company_domain?: string | null
          company_id: string
          company_size?: string | null
          company_text?: string | null
          created_at?: string
          email?: string | null
          enriched_company_domain?: string | null
          enriched_company_size?: string | null
          enriched_industry?: string | null
          enriched_job_title?: string | null
          enriched_linkedin_url?: string | null
          enriched_score?: number | null
          enriched_seniority?: string | null
          event_id?: string | null
          follow_up_at?: string | null
          follow_up_calendar_event_id?: string | null
          follow_up_calendar_owner_user_id?: string | null
          follow_up_calendar_provider?: string | null
          follow_up_completed_at?: string | null
          follow_up_date?: string | null
          follow_up_last_operation_fingerprint?: string | null
          follow_up_last_operation_key?: string | null
          follow_up_last_operation_result?: Json | null
          follow_up_note?: string | null
          full_name: string
          id?: string
          industry?: string | null
          intent_signals?: Json
          is_hot?: boolean
          job_title?: string | null
          linkedin_url?: string | null
          metadata?: Json
          owner_user_id?: string | null
          phone?: string | null
          priority_score?: number
          rating?: number
          seniority?: string | null
          status?: string
          temperature?: string | null
          updated_at?: string
        }
        Update: {
          company_domain?: string | null
          company_id?: string
          company_size?: string | null
          company_text?: string | null
          created_at?: string
          email?: string | null
          enriched_company_domain?: string | null
          enriched_company_size?: string | null
          enriched_industry?: string | null
          enriched_job_title?: string | null
          enriched_linkedin_url?: string | null
          enriched_score?: number | null
          enriched_seniority?: string | null
          event_id?: string | null
          follow_up_at?: string | null
          follow_up_calendar_event_id?: string | null
          follow_up_calendar_owner_user_id?: string | null
          follow_up_calendar_provider?: string | null
          follow_up_completed_at?: string | null
          follow_up_date?: string | null
          follow_up_last_operation_fingerprint?: string | null
          follow_up_last_operation_key?: string | null
          follow_up_last_operation_result?: Json | null
          follow_up_note?: string | null
          full_name?: string
          id?: string
          industry?: string | null
          intent_signals?: Json
          is_hot?: boolean
          job_title?: string | null
          linkedin_url?: string | null
          metadata?: Json
          owner_user_id?: string | null
          phone?: string | null
          priority_score?: number
          rating?: number
          seniority?: string | null
          status?: string
          temperature?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_follow_up_calendar_owner_user_id_fkey"
            columns: ["follow_up_calendar_owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      license_plans: {
        Row: {
          code: string
          created_at: string
          default_term_months: number
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          default_term_months?: number
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          default_term_months?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          billing: string
          billing_source: string
          can_create_events: boolean
          company_id: string
          created_at: string
          currency: string
          event_id: string | null
          exhibitor_company_id: string | null
          expires_at: string
          id: string
          license_key: string
          license_plan_id: string | null
          max_events: number | null
          price_cents: number | null
          scope: string
          seats_total: number
          seats_used: number
          starts_at: string | null
          status: string
          term_months: number | null
        }
        Insert: {
          billing?: string
          billing_source?: string
          can_create_events?: boolean
          company_id: string
          created_at?: string
          currency?: string
          event_id?: string | null
          exhibitor_company_id?: string | null
          expires_at: string
          id?: string
          license_key: string
          license_plan_id?: string | null
          max_events?: number | null
          price_cents?: number | null
          scope?: string
          seats_total: number
          seats_used?: number
          starts_at?: string | null
          status?: string
          term_months?: number | null
        }
        Update: {
          billing?: string
          billing_source?: string
          can_create_events?: boolean
          company_id?: string
          created_at?: string
          currency?: string
          event_id?: string | null
          exhibitor_company_id?: string | null
          expires_at?: string
          id?: string
          license_key?: string
          license_plan_id?: string | null
          max_events?: number | null
          price_cents?: number | null
          scope?: string
          seats_total?: number
          seats_used?: number
          starts_at?: string | null
          status?: string
          term_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_exhibitor_company_id_fkey"
            columns: ["exhibitor_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_license_plan_id_fkey"
            columns: ["license_plan_id"]
            isOneToOne: false
            referencedRelation: "license_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          admin_override_prompt: string | null
          available_in_pattern_mode: boolean
          category: string
          company_id: string | null
          created_at: string
          created_by: string | null
          default_prompt: string
          event_id: string | null
          id: string
          is_active: boolean
          name: string
          owner_user_id: string | null
          role_scope: string | null
          signal_scope: string
          source_signal_id: string | null
          template_scope: string | null
          tones: string[]
          updated_at: string
          visibility: string
        }
        Insert: {
          admin_override_prompt?: string | null
          available_in_pattern_mode?: boolean
          category: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_prompt: string
          event_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_user_id?: string | null
          role_scope?: string | null
          signal_scope?: string
          source_signal_id?: string | null
          template_scope?: string | null
          tones?: string[]
          updated_at?: string
          visibility?: string
        }
        Update: {
          admin_override_prompt?: string | null
          available_in_pattern_mode?: boolean
          category?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_prompt?: string
          event_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string | null
          role_scope?: string | null
          signal_scope?: string
          source_signal_id?: string | null
          template_scope?: string | null
          tones?: string[]
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_source_signal_id_fkey"
            columns: ["source_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      zoominfo_company_connections: {
        Row: {
          company_id: string
          connected_by_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          provider: string
          status: string
          updated_at: string
          zoominfo_bearer_token: string | null
          zoominfo_connection_label: string | null
        }
        Insert: {
          company_id: string
          connected_by_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          provider?: string
          status?: string
          updated_at?: string
          zoominfo_bearer_token?: string | null
          zoominfo_connection_label?: string | null
        }
        Update: {
          company_id?: string
          connected_by_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          provider?: string
          status?: string
          updated_at?: string
          zoominfo_bearer_token?: string | null
          zoominfo_connection_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoominfo_company_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoominfo_company_connections_connected_by_user_id_fkey"
            columns: ["connected_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          event_access_mode: string
          full_name: string | null
          id: string
          license_id: string | null
          role: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          event_access_mode?: string
          full_name?: string | null
          id: string
          license_id?: string | null
          role: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          event_access_mode?: string
          full_name?: string | null
          id?: string
          license_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adopt_voice_note_from_upload: {
        Args: {
          p_audio_url: string
          p_client_local_note_id: string | null
          p_conversation_id: string | null
          p_created_by_user_id: string | null
          p_duration_ms?: number | null
          p_lead_id: string
          p_source?: string | null
        }
        Returns: string
      }
      current_company_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      dashboard_event_lead_metrics: {
        Args: {
          p_company_id: string
          p_event_ids: string[]
          p_now?: string
        }
        Returns: {
          event_id: string
          total_leads: number
          leads_today: number | null
          hot_leads: number
          warm_leads: number
          cold_leads: number
          hot_awaiting_follow_up: number | null
          hot_no_follow_up: number
          open_follow_ups: number
          due_today: number | null
          overdue: number | null
          scheduled_future: number | null
          still_new: number
        }[]
      }
      is_valid_iana_timezone: {
        Args: { value: string }
        Returns: boolean
      }
      match_leads_by_company_normalized_email: {
        Args: { p_company_id: string; p_email: string }
        Returns: {
          id: string
          email: string | null
          enriched_job_title: string | null
          enriched_company_size: string | null
          enriched_industry: string | null
          enriched_linkedin_url: string | null
          enriched_company_domain: string | null
          enriched_seniority: string | null
        }[]
      }
      sync_voice_notes_from_conversation: {
        Args: {
          p_conversation_id: string
          p_note_summary?: string | null
          p_transcript: string
          p_transcription_status?: string | null
        }
        Returns: number
      }
      uid: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
