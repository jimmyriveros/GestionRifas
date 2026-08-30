export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          organization_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          organization_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          alias: string | null
          archived_at: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string
          search_text: string | null
          seller_id: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          archived_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone: string
          search_text?: string | null
          seller_id: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          archived_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string
          search_text?: string | null
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
        ]
      }
      commission_ledger: {
        Row: {
          amount: number
          created_at: string
          from_seller_id: string | null
          id: string
          movement: Database["public"]["Enums"]["commission_movement"]
          organization_id: string
          raffle_id: string
          rate: number
          seller_id: string
          team_movement: boolean
          ticket_id: string | null
          tickets_paid: number
        }
        Insert: {
          amount: number
          created_at?: string
          from_seller_id?: string | null
          id?: string
          movement: Database["public"]["Enums"]["commission_movement"]
          organization_id: string
          raffle_id: string
          rate: number
          seller_id: string
          team_movement?: boolean
          ticket_id?: string | null
          tickets_paid: number
        }
        Update: {
          amount?: number
          created_at?: string
          from_seller_id?: string | null
          id?: string
          movement?: Database["public"]["Enums"]["commission_movement"]
          organization_id?: string
          raffle_id?: string
          rate?: number
          seller_id?: string
          team_movement?: boolean
          ticket_id?: string | null
          tickets_paid?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "commission_ledger_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_raffle_summary"
            referencedColumns: ["raffle_id", "organization_id"]
          },
        ]
      }
      commission_tiers: {
        Row: {
          created_at: string
          id: string
          min_tickets: number
          organization_id: string
          rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_tickets: number
          organization_id: string
          rate: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_tickets?: number
          organization_id?: string
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lottery_draw_schedules: {
        Row: {
          change_reason:
            | Database["public"]["Enums"]["lottery_schedule_change_reason"]
            | null
          created_at: string
          draw_number: string
          id: string
          lottery_code: Database["public"]["Enums"]["lottery_code"]
          official_scheduled_at: string | null
          original_scheduled_at: string | null
          reference_date: string
          schedule_status: Database["public"]["Enums"]["lottery_schedule_status"]
          schedule_version: number
          source_authority: string | null
          source_content_hash: string | null
          source_document_version: string | null
          source_url: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          change_reason?:
            | Database["public"]["Enums"]["lottery_schedule_change_reason"]
            | null
          created_at?: string
          draw_number: string
          id?: string
          lottery_code: Database["public"]["Enums"]["lottery_code"]
          official_scheduled_at?: string | null
          original_scheduled_at?: string | null
          reference_date: string
          schedule_status?: Database["public"]["Enums"]["lottery_schedule_status"]
          schedule_version?: number
          source_authority?: string | null
          source_content_hash?: string | null
          source_document_version?: string | null
          source_url?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          change_reason?:
            | Database["public"]["Enums"]["lottery_schedule_change_reason"]
            | null
          created_at?: string
          draw_number?: string
          id?: string
          lottery_code?: Database["public"]["Enums"]["lottery_code"]
          official_scheduled_at?: string | null
          original_scheduled_at?: string | null
          reference_date?: string
          schedule_status?: Database["public"]["Enums"]["lottery_schedule_status"]
          schedule_version?: number
          source_authority?: string | null
          source_content_hash?: string | null
          source_document_version?: string | null
          source_url?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      lottery_results: {
        Row: {
          confirmed_at: string | null
          conflicting_winning_number: string | null
          created_at: string
          evidence: Json
          fetched_at: string
          id: string
          published_at: string | null
          schedule_id: string
          series: string | null
          source_content_hash: string | null
          source_kind: string | null
          source_url: string | null
          updated_at: string
          validation_status: Database["public"]["Enums"]["lottery_result_validation_status"]
          winning_number: string | null
        }
        Insert: {
          confirmed_at?: string | null
          conflicting_winning_number?: string | null
          created_at?: string
          evidence?: Json
          fetched_at?: string
          id?: string
          published_at?: string | null
          schedule_id: string
          series?: string | null
          source_content_hash?: string | null
          source_kind?: string | null
          source_url?: string | null
          updated_at?: string
          validation_status?: Database["public"]["Enums"]["lottery_result_validation_status"]
          winning_number?: string | null
        }
        Update: {
          confirmed_at?: string | null
          conflicting_winning_number?: string | null
          created_at?: string
          evidence?: Json
          fetched_at?: string
          id?: string
          published_at?: string | null
          schedule_id?: string
          series?: string | null
          source_content_hash?: string | null
          source_kind?: string | null
          source_url?: string | null
          updated_at?: string
          validation_status?: Database["public"]["Enums"]["lottery_result_validation_status"]
          winning_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lottery_results_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: true
            referencedRelation: "lottery_draw_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      lottery_sync_lock: {
        Row: {
          acquired_at: string | null
          holder: string | null
          id: number
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          holder?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          holder?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      lottery_sync_runs: {
        Row: {
          attempt: number
          correlation_id: string | null
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          kind: Database["public"]["Enums"]["lottery_sync_kind"]
          lottery_code: Database["public"]["Enums"]["lottery_code"] | null
          outcome: Database["public"]["Enums"]["lottery_sync_outcome"]
          records_changed: number
          records_read: number
          records_skipped: number
          started_at: string
        }
        Insert: {
          attempt?: number
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["lottery_sync_kind"]
          lottery_code?: Database["public"]["Enums"]["lottery_code"] | null
          outcome?: Database["public"]["Enums"]["lottery_sync_outcome"]
          records_changed?: number
          records_read?: number
          records_skipped?: number
          started_at?: string
        }
        Update: {
          attempt?: number
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["lottery_sync_kind"]
          lottery_code?: Database["public"]["Enums"]["lottery_code"] | null
          outcome?: Database["public"]["Enums"]["lottery_sync_outcome"]
          records_changed?: number
          records_read?: number
          records_skipped?: number
          started_at?: string
        }
        Relationships: []
      }
      lottery_ticket_matches: {
        Row: {
          assigned_at: string | null
          assignment_status: Database["public"]["Enums"]["lottery_assignment_status"]
          client_id: string | null
          created_at: string
          id: string
          inventory_status_at_draw: Database["public"]["Enums"]["ticket_inventory_status"]
          match_field: Database["public"]["Enums"]["lottery_match_field"]
          matched_number: string
          organization_id: string
          raffle_id: string
          result_id: string
          seller_id: string
          ticket_created_at: string
          ticket_id: string
        }
        Insert: {
          assigned_at?: string | null
          assignment_status: Database["public"]["Enums"]["lottery_assignment_status"]
          client_id?: string | null
          created_at?: string
          id?: string
          inventory_status_at_draw: Database["public"]["Enums"]["ticket_inventory_status"]
          match_field: Database["public"]["Enums"]["lottery_match_field"]
          matched_number: string
          organization_id: string
          raffle_id: string
          result_id: string
          seller_id: string
          ticket_created_at: string
          ticket_id: string
        }
        Update: {
          assigned_at?: string | null
          assignment_status?: Database["public"]["Enums"]["lottery_assignment_status"]
          client_id?: string | null
          created_at?: string
          id?: string
          inventory_status_at_draw?: Database["public"]["Enums"]["ticket_inventory_status"]
          match_field?: Database["public"]["Enums"]["lottery_match_field"]
          matched_number?: string
          organization_id?: string
          raffle_id?: string
          result_id?: string
          seller_id?: string
          ticket_created_at?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lottery_ticket_matches_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "organization_id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_raffle_summary"
            referencedColumns: ["raffle_id", "organization_id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "lottery_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_ticket_org_fk"
            columns: ["ticket_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lottery_ticket_matches_ticket_org_fk"
            columns: ["ticket_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_ticket_balances"
            referencedColumns: ["ticket_id", "organization_id"]
          },
        ]
      }
      memberships: {
        Row: {
          commission_model: Database["public"]["Enums"]["commission_model"]
          created_at: string
          fixed_commission_amount: number | null
          id: string
          invited_by: string | null
          is_active: boolean
          organization_id: string
          parent_seller_id: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          commission_model?: Database["public"]["Enums"]["commission_model"]
          created_at?: string
          fixed_commission_amount?: number | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          organization_id: string
          parent_seller_id?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          commission_model?: Database["public"]["Enums"]["commission_model"]
          created_at?: string
          fixed_commission_amount?: number | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          organization_id?: string
          parent_seller_id?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_parent_seller_fk"
            columns: ["parent_seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          data: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          organization_id: string
          read_at: string | null
          recipient_profile_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          organization_id: string
          read_at?: string | null
          recipient_profile_id: string
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          organization_id?: string
          read_at?: string | null
          recipient_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_org_fk"
            columns: ["recipient_profile_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          currency: string
          default_ticket_price: number
          id: string
          is_active: boolean
          name: string
          raffle_counter: number
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          default_ticket_price?: number
          id?: string
          is_active?: boolean
          name: string
          raffle_counter?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          default_ticket_price?: number
          id?: string
          is_active?: boolean
          name?: string
          raffle_counter?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          organization_id: string
          payment_id: string
          ticket_id: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          organization_id: string
          payment_id: string
          ticket_id: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          payment_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alloc_payment_client_fk"
            columns: ["payment_id", "client_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "alloc_payment_client_fk"
            columns: ["payment_id", "client_id"]
            isOneToOne: false
            referencedRelation: "v_payment_history"
            referencedColumns: ["payment_id", "client_id"]
          },
          {
            foreignKeyName: "alloc_ticket_client_fk"
            columns: ["ticket_id", "client_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "alloc_ticket_client_fk"
            columns: ["ticket_id", "client_id"]
            isOneToOne: false
            referencedRelation: "v_ticket_balances"
            referencedColumns: ["ticket_id", "client_id"]
          },
          {
            foreignKeyName: "payment_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          seller_id: string
          total_amount: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          seller_id: string
          total_amount: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          seller_id?: string
          total_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "organization_id"]
          },
          {
            foreignKeyName: "payments_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "seller_id"]
          },
          {
            foreignKeyName: "payments_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "seller_id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activated_at: string | null
          alias: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          alias?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          phone: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          alias?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      raffles: {
        Row: {
          allow_seller_ticket_creation: boolean
          closed_at: string | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          end_date: string
          id: string
          name: string
          organization_id: string
          short_code: string
          start_date: string
          status: Database["public"]["Enums"]["raffle_status"]
          ticket_counter: number
          ticket_price: number
          updated_at: string
        }
        Insert: {
          allow_seller_ticket_creation?: boolean
          closed_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          organization_id: string
          short_code?: string
          start_date: string
          status?: Database["public"]["Enums"]["raffle_status"]
          ticket_counter?: number
          ticket_price?: number
          updated_at?: string
        }
        Update: {
          allow_seller_ticket_creation?: boolean
          closed_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          organization_id?: string
          short_code?: string
          start_date?: string
          status?: Database["public"]["Enums"]["raffle_status"]
          ticket_counter?: number
          ticket_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_commissions: {
        Row: {
          earned: number
          organization_id: string
          raffle_id: string
          rate: number
          seller_id: string
          team_earned: number
          team_tickets_paid: number
          tickets_paid: number
          updated_at: string
        }
        Insert: {
          earned?: number
          organization_id: string
          raffle_id: string
          rate?: number
          seller_id: string
          team_earned?: number
          team_tickets_paid?: number
          tickets_paid?: number
          updated_at?: string
        }
        Update: {
          earned?: number
          organization_id?: string
          raffle_id?: string
          rate?: number
          seller_id?: string
          team_earned?: number
          team_tickets_paid?: number
          tickets_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_commissions_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "seller_commissions_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_raffle_summary"
            referencedColumns: ["raffle_id", "organization_id"]
          },
          {
            foreignKeyName: "seller_commissions_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
        ]
      }
      tickets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_at: string | null
          base_price: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          client_id: string | null
          created_at: string
          created_by: string
          daily_number: string | null
          id: string
          internal_code: string
          inventory_status: Database["public"]["Enums"]["ticket_inventory_status"]
          organization_id: string
          paid_amount: number
          payment_status:
            | Database["public"]["Enums"]["ticket_payment_status"]
            | null
          raffle_id: string
          sale_date: string | null
          sale_price: number | null
          seller_id: string
          updated_at: string
          weekly_number: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_at?: string | null
          base_price?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by: string
          daily_number?: string | null
          id?: string
          internal_code?: string
          inventory_status?: Database["public"]["Enums"]["ticket_inventory_status"]
          organization_id: string
          paid_amount?: number
          payment_status?:
            | Database["public"]["Enums"]["ticket_payment_status"]
            | null
          raffle_id: string
          sale_date?: string | null
          sale_price?: number | null
          seller_id: string
          updated_at?: string
          weekly_number?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_at?: string | null
          base_price?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          daily_number?: string | null
          id?: string
          internal_code?: string
          inventory_status?: Database["public"]["Enums"]["ticket_inventory_status"]
          organization_id?: string
          paid_amount?: number
          payment_status?:
            | Database["public"]["Enums"]["ticket_payment_status"]
            | null
          raffle_id?: string
          sale_date?: string | null
          sale_price?: number | null
          seller_id?: string
          updated_at?: string
          weekly_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "seller_id"]
          },
          {
            foreignKeyName: "tickets_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "seller_id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_raffle_summary"
            referencedColumns: ["raffle_id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      v_client_balances: {
        Row: {
          alias: string | null
          archived_at: string | null
          client_id: string | null
          email: string | null
          name: string | null
          organization_id: string | null
          pending_amount: number | null
          phone: string | null
          search_text: string | null
          seller_id: string | null
          tickets_count: number | null
          total_paid: number | null
          total_purchased: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
        ]
      }
      v_payment_history: {
        Row: {
          allocations: Json | null
          client_id: string | null
          client_name: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          is_active: boolean | null
          notes: string | null
          organization_id: string | null
          payment_date: string | null
          payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          seller_id: string | null
          seller_name: string | null
          total_amount: number | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "organization_id"]
          },
          {
            foreignKeyName: "payments_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "seller_id"]
          },
          {
            foreignKeyName: "payments_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "seller_id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_raffle_summary: {
        Row: {
          allow_seller_ticket_creation: boolean | null
          end_date: string | null
          name: string | null
          organization_id: string | null
          pending_amount: number | null
          raffle_id: string | null
          short_code: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["raffle_status"] | null
          ticket_price: number | null
          tickets_assigned: number | null
          tickets_available: number | null
          tickets_cancelled: number | null
          tickets_paid: number | null
          tickets_partial: number | null
          tickets_pending_approval: number | null
          tickets_total: number | null
          tickets_unpaid: number | null
          total_collected: number | null
          total_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "raffles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_seller_summary: {
        Row: {
          organization_id: string | null
          pending_amount: number | null
          raffle_id: string | null
          seller_id: string | null
          tickets_assigned: number | null
          tickets_available: number | null
          tickets_cancelled: number | null
          tickets_draft: number | null
          tickets_paid: number | null
          tickets_partial: number | null
          tickets_pending_approval: number | null
          tickets_total: number | null
          tickets_unpaid: number | null
          total_collected: number | null
          total_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_raffle_summary"
            referencedColumns: ["raffle_id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
        ]
      }
      v_ticket_balances: {
        Row: {
          assigned_at: string | null
          client_id: string | null
          created_at: string | null
          daily_number: string | null
          internal_code: string | null
          inventory_status:
            | Database["public"]["Enums"]["ticket_inventory_status"]
            | null
          organization_id: string | null
          paid_amount: number | null
          payment_status:
            | Database["public"]["Enums"]["ticket_payment_status"]
            | null
          pending_amount: number | null
          raffle_id: string | null
          sale_date: string | null
          sale_price: number | null
          seller_id: string | null
          ticket_id: string | null
          weekly_number: string | null
        }
        Insert: {
          assigned_at?: string | null
          client_id?: string | null
          created_at?: string | null
          daily_number?: string | null
          internal_code?: string | null
          inventory_status?:
            | Database["public"]["Enums"]["ticket_inventory_status"]
            | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_status?:
            | Database["public"]["Enums"]["ticket_payment_status"]
            | null
          pending_amount?: never
          raffle_id?: string | null
          sale_date?: string | null
          sale_price?: number | null
          seller_id?: string | null
          ticket_id?: string | null
          weekly_number?: string | null
        }
        Update: {
          assigned_at?: string | null
          client_id?: string | null
          created_at?: string | null
          daily_number?: string | null
          internal_code?: string | null
          inventory_status?:
            | Database["public"]["Enums"]["ticket_inventory_status"]
            | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_status?:
            | Database["public"]["Enums"]["ticket_payment_status"]
            | null
          pending_amount?: never
          raffle_id?: string | null
          sale_date?: string | null
          sale_price?: number | null
          seller_id?: string | null
          ticket_id?: string | null
          weekly_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_client_org_fk"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "seller_id"]
          },
          {
            foreignKeyName: "tickets_client_seller_fk"
            columns: ["client_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "v_client_balances"
            referencedColumns: ["client_id", "seller_id"]
          },
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_raffle_org_fk"
            columns: ["raffle_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "v_raffle_summary"
            referencedColumns: ["raffle_id", "organization_id"]
          },
          {
            foreignKeyName: "tickets_seller_org_fk"
            columns: ["seller_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["profile_id", "organization_id"]
          },
        ]
      }
    }
    Functions: {
      approve_tickets: { Args: { p_ticket_ids: string[] }; Returns: number }
      assign_ticket: {
        Args: { p_client_id: string; p_sale_date?: string; p_ticket_id: string }
        Returns: undefined
      }
      assign_ticket_row: {
        Args: {
          p_client_id: string
          p_sale_date?: string
          p_sale_price?: number
          p_ticket_id: string
        }
        Returns: undefined
      }
      bulk_assign_tickets: {
        Args: {
          p_client_id: string
          p_sale_date?: string
          p_sale_price?: number
          p_ticket_ids: string[]
        }
        Returns: number
      }
      bulk_cancel_tickets: {
        Args: { p_reason: string; p_ticket_ids: string[] }
        Returns: number
      }
      bulk_change_ticket_seller: {
        Args: { p_seller_id: string; p_ticket_ids: string[] }
        Returns: number
      }
      bulk_create_tickets: {
        Args: { p_raffle_id: string; p_rows: Json; p_seller_id: string }
        Returns: Json
      }
      bulk_delete_tickets: {
        Args: { p_reason: string; p_ticket_ids: string[] }
        Returns: number
      }
      cancel_ticket: {
        Args: { p_reason: string; p_ticket_id: string }
        Returns: undefined
      }
      cancel_ticket_row: {
        Args: { p_reason: string; p_ticket_id: string }
        Returns: undefined
      }
      commission_floor_rate: {
        Args: {
          p_organization_id: string
          p_raffle_id: string
          p_seller_id: string
        }
        Returns: number
      }
      commission_rate_for: {
        Args: { p_count: number; p_org: string }
        Returns: number
      }
      commission_rate_for_seller: {
        Args: {
          p_count: number
          p_organization_id: string
          p_raffle_id: string
          p_seller_id: string
        }
        Returns: number
      }
      commission_summary: {
        Args: { p_raffle_id?: string }
        Returns: {
          by_tiers: boolean
          earned: number
          next_min_tickets: number
          next_rate: number
          pay_model: string
          projected_earned: number
          raffle_id: string
          rate: number
          seller_id: string
          team_earned: number
          team_tickets_paid: number
          tickets_paid: number
          tickets_to_next: number
        }[]
      }
      commission_team_earned: {
        Args: {
          p_organization_id: string
          p_parent_id: string
          p_raffle_id: string
        }
        Returns: Record<string, unknown>
      }
      confirm_lottery_result: {
        Args: {
          p_draw_number: string
          p_evidence?: Json
          p_fetched_at?: string
          p_lottery_code: Database["public"]["Enums"]["lottery_code"]
          p_official_date?: string
          p_published_at?: string
          p_series?: string
          p_source_content_hash?: string
          p_source_kind?: string
          p_source_url?: string
          p_winning_number: string
        }
        Returns: Json
      }
      create_payment: {
        Args: {
          p_allocations: Json
          p_client_id: string
          p_notes?: string
          p_payment_date?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_total_amount: number
        }
        Returns: string
      }
      current_org_ids: { Args: never; Returns: string[] }
      current_profile_id: { Args: never; Returns: string }
      current_profile_leads_team: { Args: { p_org: string }; Returns: boolean }
      current_staff_org_ids: { Args: never; Returns: string[] }
      current_team_seller_ids: { Args: never; Returns: string[] }
      format_cop: { Args: { p_amount: number }; Returns: string }
      has_org_role: {
        Args: {
          p_org: string
          p_roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      import_tickets_with_clients: {
        Args: { p_raffle_id: string; p_rows: Json; p_seller_id: string }
        Returns: Json
      }
      is_org_staff: { Args: { p_org: string }; Returns: boolean }
      lock_ticket_batch: { Args: { p_ticket_ids: string[] }; Returns: string[] }
      log_ticket_import: {
        Args: {
          p_inserted: number
          p_raffle_id: string
          p_requested: number
          p_seller_id: string
          p_skipped: number
          p_source: string
        }
        Returns: undefined
      }
      mark_profile_activated: { Args: never; Returns: undefined }
      match_lottery_result: { Args: { p_result_id: string }; Returns: Json }
      match_ticket_import_clients: {
        Args: { p_clients: Json; p_raffle_id: string; p_seller_id: string }
        Returns: {
          archived_at: string
          client_id: string
          client_key: string
          name: string
          phone: string
        }[]
      }
      notify_lottery_schedule_changes: {
        Args: { p_now?: string }
        Returns: Json
      }
      notify_profiles: {
        Args: {
          p_actor?: string
          p_data?: Json
          p_entity_id?: string
          p_entity_type?: string
          p_kind: string
          p_organization_id: string
          p_recipients: string[]
        }
        Returns: undefined
      }
      org_staff_profile_ids: { Args: { p_org: string }; Returns: string[] }
      recalc_seller_commission: {
        Args: {
          p_movement?: Database["public"]["Enums"]["commission_movement"]
          p_organization_id: string
          p_raffle_id: string
          p_seller_id: string
          p_team_source?: string
          p_ticket_id?: string
        }
        Returns: undefined
      }
      recalc_ticket_paid_amount: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      release_lottery_sync_lock: {
        Args: { p_holder: string }
        Returns: boolean
      }
      report_payment_totals: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_seller_id?: string
          p_status?: string
        }
        Returns: {
          active_amount: number
          active_count: number
          payments_count: number
          total_amount: number
          voided_amount: number
          voided_count: number
        }[]
      }
      report_payments_by_day: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_seller_id?: string
          p_status?: string
        }
        Returns: {
          active_amount: number
          payment_date: string
          payments_count: number
          total_amount: number
          voided_amount: number
        }[]
      }
      require_auth: { Args: never; Returns: string }
      search_normalize: { Args: { value: string }; Returns: string }
      search_tickets: {
        Args: {
          p_client_id?: string
          p_inventory_status?: Database["public"]["Enums"]["ticket_inventory_status"]
          p_limit?: number
          p_offset?: number
          p_payment_status?: Database["public"]["Enums"]["ticket_payment_status"]
          p_raffle_id?: string
          p_search: string
          p_seller_id?: string
        }
        Returns: {
          client_id: string
          client_name: string
          created_at: string
          daily_number: string
          id: string
          internal_code: string
          inventory_status: Database["public"]["Enums"]["ticket_inventory_status"]
          paid_amount: number
          payment_status: Database["public"]["Enums"]["ticket_payment_status"]
          raffle_id: string
          raffle_name: string
          raffle_short_code: string
          sale_date: string
          sale_price: number
          seller_id: string
          total_count: number
          weekly_number: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_lottery_schedules: {
        Args: { p_draws: Json; p_source: Json }
        Returns: Json
      }
      taken_ticket_combinations: {
        Args: { p_combos: Json; p_raffle_id: string }
        Returns: {
          daily_number: string
          weekly_number: string
        }[]
      }
      team_confirm_email_change: {
        Args: {
          p_member_id: string
          p_new_email: string
          p_previous_email: string
        }
        Returns: undefined
      }
      team_delete_member: { Args: { p_member_id: string }; Returns: undefined }
      team_max_fixed_commission: {
        Args: { p_organization_id: string }
        Returns: number
      }
      team_member_guard: { Args: { p_member_id: string }; Returns: string }
      team_member_sales: {
        Args: { p_limit?: number; p_member_id: string }
        Returns: {
          assigned_at: string
          daily_number: string
          paid_amount: number
          payment_status: Database["public"]["Enums"]["ticket_payment_status"]
          sale_date: string
          sale_price: number
          ticket_id: string
          weekly_number: string
        }[]
      }
      team_sales_summary: {
        Args: { p_raffle_id?: string }
        Returns: {
          pending_amount: number
          seller_id: string
          tickets_assigned: number
          tickets_paid: number
          tickets_total: number
          total_collected: number
          total_sold: number
        }[]
      }
      team_set_commission_model: {
        Args: {
          p_amount?: number
          p_member_id: string
          p_model: Database["public"]["Enums"]["commission_model"]
        }
        Returns: undefined
      }
      team_update_member: {
        Args: {
          p_alias: string
          p_email?: string
          p_full_name: string
          p_member_id: string
          p_phone: string
        }
        Returns: {
          previous_email: string
          rotate_invitation: boolean
        }[]
      }
      ticket_bulk_eligibility: {
        Args: { p_ticket_ids: string[] }
        Returns: {
          base_price: number
          can_approve: boolean
          can_assign: boolean
          can_cancel: boolean
          can_change_seller: boolean
          can_delete: boolean
          daily_number: string
          has_active_payments: boolean
          has_client: boolean
          has_payments: boolean
          inventory_status: Database["public"]["Enums"]["ticket_inventory_status"]
          min_sale_price: number
          raffle_active: boolean
          raffle_id: string
          seller_id: string
          ticket_id: string
          weekly_number: string
        }[]
      }
      ticket_import_name_key: { Args: { value: string }; Returns: string }
      ticket_import_phone_key: { Args: { value: string }; Returns: string }
      ticket_sale_price_limits: {
        Args: { p_ticket_id: string }
        Returns: {
          base_price: number
          min_sale_price: number
        }[]
      }
      today_bogota: { Args: never; Returns: string }
      try_acquire_lottery_sync_lock: {
        Args: { p_holder: string; p_stale_minutes?: number }
        Returns: boolean
      }
      update_payment_allocation: {
        Args: {
          p_amount: number
          p_expected_amount: number
          p_payment_id: string
          p_ticket_id: string
        }
        Returns: string
      }
      update_ticket_sale_price: {
        Args: {
          p_expected_sale_price: number
          p_sale_price: number
          p_ticket_id: string
        }
        Returns: string
      }
      void_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_new_values?: Json
          p_old_values?: Json
          p_organization_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "seller"
      commission_model: "tiered" | "fixed_per_ticket"
      commission_movement:
        | "sale"
        | "sale_reverted"
        | "tier_adjustment"
        | "seller_change"
        | "initial_balance"
        | "discount"
      lottery_assignment_status: "sold" | "available" | "late_assignment"
      lottery_code:
        | "cundinamarca"
        | "cruz_roja"
        | "meta"
        | "bogota"
        | "medellin"
        | "boyaca"
      lottery_match_field: "daily_number" | "weekly_number"
      lottery_result_validation_status:
        | "pending"
        | "confirmed"
        | "rejected"
        | "conflict"
      lottery_schedule_change_reason:
        | "holiday"
        | "official_change"
        | "force_majeure"
        | "unknown"
      lottery_schedule_status:
        | "scheduled"
        | "rescheduled_later"
        | "rescheduled_earlier"
        | "suspended"
        | "cancelled"
        | "completed"
        | "schedule_unverified"
        | "schedule_conflict"
      lottery_sync_kind: "schedule" | "results"
      lottery_sync_outcome: "success" | "partial" | "failed" | "skipped"
      payment_method: "cash" | "transfer" | "other"
      raffle_status: "draft" | "active" | "closed" | "cancelled"
      ticket_inventory_status:
        | "draft"
        | "pending_approval"
        | "available"
        | "assigned"
        | "cancelled"
      ticket_payment_status: "unpaid" | "partial" | "paid"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["owner", "admin", "seller"],
      commission_model: ["tiered", "fixed_per_ticket"],
      commission_movement: [
        "sale",
        "sale_reverted",
        "tier_adjustment",
        "seller_change",
        "initial_balance",
        "discount",
      ],
      lottery_assignment_status: ["sold", "available", "late_assignment"],
      lottery_code: [
        "cundinamarca",
        "cruz_roja",
        "meta",
        "bogota",
        "medellin",
        "boyaca",
      ],
      lottery_match_field: ["daily_number", "weekly_number"],
      lottery_result_validation_status: [
        "pending",
        "confirmed",
        "rejected",
        "conflict",
      ],
      lottery_schedule_change_reason: [
        "holiday",
        "official_change",
        "force_majeure",
        "unknown",
      ],
      lottery_schedule_status: [
        "scheduled",
        "rescheduled_later",
        "rescheduled_earlier",
        "suspended",
        "cancelled",
        "completed",
        "schedule_unverified",
        "schedule_conflict",
      ],
      lottery_sync_kind: ["schedule", "results"],
      lottery_sync_outcome: ["success", "partial", "failed", "skipped"],
      payment_method: ["cash", "transfer", "other"],
      raffle_status: ["draft", "active", "closed", "cancelled"],
      ticket_inventory_status: [
        "draft",
        "pending_approval",
        "available",
        "assigned",
        "cancelled",
      ],
      ticket_payment_status: ["unpaid", "partial", "paid"],
    },
  },
} as const

