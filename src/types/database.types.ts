// =============================================================================
// Escrito y mantenido a mano. `supabase gen types typescript --db-url` exige
// Docker en esta version de la CLI incluso apuntando a una base remota
// (LegacyContainerRuntimeNotFoundError), y no hay SUPABASE_ACCESS_TOKEN para
// usar la variante --project-id. Docker se instalara de todas formas en la
// Fase 2 para Supabase local; ahi se regenera este archivo y se elimina esta
// nota. Ver docs/KNOWN_ISSUES.md.
//
// Verificado manualmente contra el esquema real aplicado (consultas a
// information_schema/pg_catalog): tablas, columnas, tipos, RLS, funciones,
// triggers, indices y el enum app_role coinciden exactamente con
// supabase/migrations/0001_core_identity.sql.
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          default_ticket_price: number
          currency: string
          timezone: string
          raffle_counter: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          default_ticket_price?: number
          currency?: string
          timezone?: string
          raffle_counter?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          alias: string | null
          phone: string
          email: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          alias?: string | null
          phone: string
          email: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      memberships: {
        Row: {
          id: string
          organization_id: string
          profile_id: string
          role: Database['public']['Enums']['app_role']
          is_active: boolean
          invited_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          profile_id: string
          role: Database['public']['Enums']['app_role']
          is_active?: boolean
          invited_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'memberships_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      current_profile_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      current_org_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      has_org_role: {
        Args: { p_org: string; p_roles: Database['public']['Enums']['app_role'][] }
        Returns: boolean
      }
      is_org_staff: {
        Args: { p_org: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: 'owner' | 'admin' | 'seller'
    }
    CompositeTypes: Record<string, never>
  }
}
