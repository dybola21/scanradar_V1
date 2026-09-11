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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      automation_events: {
        Row: {
          created_at: string
          detail: Json
          event_type: string
          id: string
          lead_key: string
          run_id: string
          search_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          lead_key?: string
          run_id: string
          search_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          lead_key?: string
          run_id?: string
          search_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          mode: "production" | "test"
          cancel_detail: Json | null
          cancel_evidence: string | null
          cancel_requested_at: string | null
          cancel_requested_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          connection_key: string
          created_at: string
          eligible_lead_keys: string[]
          finished_at: string | null
          id: string
          idempotency_key: string
          issues: Json
          last_activity_at: string
          n8n_execution_id: string | null
          n8n_workflow_id: string | null
          offer_description: string | null
          search_id: string | null
          sheet_id: number | null
          sheet_name: string | null
          sheet_spreadsheet_id: string | null
          sheet_url: string | null
          started_at: string
          state: string
          summary: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          mode?: "production" | "test"
          cancel_detail?: Json | null
          cancel_evidence?: string | null
          cancel_requested_at?: string | null
          cancel_requested_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          connection_key: string
          created_at?: string
          eligible_lead_keys?: string[]
          finished_at?: string | null
          id?: string
          idempotency_key: string
          issues?: Json
          last_activity_at?: string
          n8n_execution_id?: string | null
          n8n_workflow_id?: string | null
          offer_description?: string | null
          search_id: string | null
          sheet_id?: number | null
          sheet_name?: string | null
          sheet_spreadsheet_id?: string | null
          sheet_url?: string | null
          started_at?: string
          state?: string
          summary?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          mode?: "production" | "test"
          cancel_detail?: Json | null
          cancel_evidence?: string | null
          cancel_requested_at?: string | null
          cancel_requested_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          connection_key?: string
          created_at?: string
          eligible_lead_keys?: string[]
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          issues?: Json
          last_activity_at?: string
          n8n_execution_id?: string | null
          n8n_workflow_id?: string | null
          offer_description?: string | null
          search_id?: string | null
          sheet_id?: number | null
          sheet_name?: string | null
          sheet_spreadsheet_id?: string | null
          sheet_url?: string | null
          started_at?: string
          state?: string
          summary?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_reservations: {
        Row: {
          attempt_key: string | null
          connection_key: string
          created_at: string
          id: string
          lead_id: string | null
          lead_key: string | null
          message_id: string | null
          message_text: string | null
          phone_normalized: string
          run_id: string | null
          search_id: string | null
          send_started_at: string | null
          sent_at: string | null
          state: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempt_key?: string | null
          connection_key: string
          created_at?: string
          id?: string
          lead_id?: string | null
          lead_key?: string | null
          message_id?: string | null
          message_text?: string | null
          phone_normalized: string
          run_id?: string | null
          search_id?: string | null
          send_started_at?: string | null
          sent_at?: string | null
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempt_key?: string | null
          connection_key?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          lead_key?: string | null
          message_id?: string | null
          message_text?: string | null
          phone_normalized?: string
          run_id?: string | null
          search_id?: string | null
          send_started_at?: string | null
          sent_at?: string | null
          state?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_reservations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_reservations_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          bairro: string | null
          cidade: string | null
          contacted: boolean
          created_at: string
          data_envio: string | null
          email: string | null
          email2: string | null
          endereco: string | null
          id: string
          lead_key: string | null
          mensagem_enviada: boolean
          nome: string | null
          place_id: string | null
          search_id: string
          status: string
          telefone: string | null
          uf: string | null
          website: string | null
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          contacted?: boolean
          created_at?: string
          data_envio?: string | null
          email?: string | null
          email2?: string | null
          endereco?: string | null
          id?: string
          lead_key?: string | null
          mensagem_enviada?: boolean
          nome?: string | null
          place_id?: string | null
          search_id: string
          status?: string
          telefone?: string | null
          uf?: string | null
          website?: string | null
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          contacted?: boolean
          created_at?: string
          data_envio?: string | null
          email?: string | null
          email2?: string | null
          endereco?: string | null
          id?: string
          lead_key?: string | null
          mensagem_enviada?: boolean
          nome?: string | null
          place_id?: string | null
          search_id?: string
          status?: string
          telefone?: string | null
          uf?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_settings: {
        Row: {
          callback_secret_hash: string | null
          created_at: string
          evolution_connection_key: string | null
          id: string
          integration_name: string | null
          is_connected: boolean | null
          last_test_error: string | null
          last_tested_at: string | null
          offer_description: string | null
          prospection_header_name: string | null
          prospection_webhook_url: string | null
          updated_at: string
          user_id: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          callback_secret_hash?: string | null
          created_at?: string
          evolution_connection_key?: string | null
          id?: string
          integration_name?: string | null
          is_connected?: boolean | null
          last_test_error?: string | null
          last_tested_at?: string | null
          offer_description?: string | null
          prospection_header_name?: string | null
          prospection_webhook_url?: string | null
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          callback_secret_hash?: string | null
          created_at?: string
          evolution_connection_key?: string | null
          id?: string
          integration_name?: string | null
          is_connected?: boolean | null
          last_test_error?: string | null
          last_tested_at?: string | null
          offer_description?: string | null
          prospection_header_name?: string | null
          prospection_webhook_url?: string | null
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      scan_logs: {
        Row: {
          user_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_status: string
          event_type: string
          http_status: number | null
          id: string
          message: string | null
          payload: Json | null
          search_id: string | null
        }
        Insert: {
          user_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_status: string
          event_type: string
          http_status?: number | null
          id?: string
          message?: string | null
          payload?: Json | null
          search_id?: string | null
        }
        Update: {
          user_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_status?: string
          event_type?: string
          http_status?: number | null
          id?: string
          message?: string | null
          payload?: Json | null
          search_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_logs_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      search_prospection: {
        Row: {
          created_at: string
          eligible_count: number
          eligible_lead_keys: string[]
          id: string
          integration_errors: Json
          ready: boolean
          schema_version: number
          search_id: string
          sheet_id: number | null
          sheet_name: string | null
          sheet_url: string | null
          spreadsheet_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          eligible_count?: number
          eligible_lead_keys?: string[]
          id?: string
          integration_errors?: Json
          ready?: boolean
          schema_version?: number
          search_id: string
          sheet_id?: number | null
          sheet_name?: string | null
          sheet_url?: string | null
          spreadsheet_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          eligible_count?: number
          eligible_lead_keys?: string[]
          id?: string
          integration_errors?: Json
          ready?: boolean
          schema_version?: number
          search_id?: string
          sheet_id?: number | null
          sheet_name?: string | null
          sheet_url?: string | null
          spreadsheet_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_prospection_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: true
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      searches: {
        Row: {
          cidade: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          request_id: string
          sheet_name: string | null
          sheet_url: string | null
          status: string | null
          termo: string
          total_leads: number | null
          uf: string
          user_id: string
        }
        Insert: {
          cidade: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          request_id: string
          sheet_name?: string | null
          sheet_url?: string | null
          status?: string | null
          termo: string
          total_leads?: number | null
          uf: string
          user_id: string
        }
        Update: {
          cidade?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          request_id?: string
          sheet_name?: string | null
          sheet_url?: string | null
          status?: string | null
          termo?: string
          total_leads?: number | null
          uf?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_whatsapp_status: {
        Args: {
          p_attempt_key?: string
          p_data_envio: string
          p_execution_id: string
          p_lead_key: string
          p_mensagem_enviada: boolean
          p_message_id: string
          p_message_text: string
          p_phone: string
          p_run_id: string
          p_search_id: string
          p_status: string
        }
        Returns: Json
      }
      begin_send: {
        Args: {
          p_attempt_key: string
          p_execution_id: string
          p_lead_key: string
          p_phone: string
          p_run_id: string
          p_search_id: string
        }
        Returns: Json
      }
      check_automation_run: {
        Args: { p_execution_id: string; p_run_id: string; p_search_id: string }
        Returns: Json
      }
      claim_automation_run: {
        Args: { p_execution_id: string; p_run_id: string; p_search_id: string }
        Returns: Json
      }
      complete_search_with_leads: {
        Args: {
          p_error_message?: string
          p_leads: Json
          p_search_id: string
          p_sheet_name?: string
          p_sheet_url?: string
          p_status: string
          p_total_leads: number
        }
        Returns: undefined
      }
      complete_search_with_prospection: {
        Args: {
          p_errors: Json
          p_leads: Json
          p_message: string
          p_prospection: Json
          p_search_id: string
          p_sheet_name: string
          p_sheet_url: string
          p_status: string
          p_user_id: string
        }
        Returns: Json
      }
      finalize_automation_cancel: {
        Args: {
          p_actor_id: string
          p_detail: Json
          p_run_id: string
          p_search_id: string
          p_stopped: boolean
        }
        Returns: Json
      }
      finish_automation_run: {
        Args: {
          p_execution_id: string
          p_issues: Json
          p_run_id: string
          p_search_id: string
          p_status: string
          p_summary: Json
        }
        Returns: Json
      }
      get_automation_cancel_context: {
        Args: { p_search_id: string; p_user_id: string }
        Returns: Json
      }
      get_automation_status: {
        Args: { p_search_id: string; p_user_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_automation_dispatch_unknown: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: undefined
      }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      prospection_active_states: { Args: never; Returns: string[] }
      prospection_candidates: {
        Args: { p_keys: string[]; p_search_id: string }
        Returns: {
          lead_key: string
          phone: string
        }[]
      }
      prospection_connection_key: { Args: never; Returns: string }
      reconcile_automation_send: {
        Args: {
          p_actor_id: string
          p_evidence: Json
          p_lead_key: string
          p_message_id: string
          p_run_id: string
          p_search_id: string
          p_sent_at: string
          p_status: string
        }
        Returns: Json
      }
      request_automation_cancel: {
        Args: {
          p_actor_id: string
          p_reason: string
          p_run_id: string
          p_search_id: string
        }
        Returns: Json
      }
      reserve_contact: {
        Args: {
          p_execution_id: string
          p_lead_key: string
          p_phone: string
          p_run_id: string
          p_search_id: string
        }
        Returns: Json
      }
      set_automation_execution_metadata: {
        Args: { p_actor_id: string; p_run_id: string; p_workflow_id: string }
        Returns: undefined
      }
      start_automation_run: {
        Args: {
          p_connection_key: string
          p_idempotency_key: string
          p_search_id: string
          p_user_id: string
        }
        Returns: Json
      }
      upsert_search_prospection: {
        Args: {
          p_eligible_count: number
          p_eligible_lead_keys: string[]
          p_integration_errors: Json
          p_ready: boolean
          p_search_id: string
          p_sheet_id: number
          p_sheet_name: string
          p_sheet_url: string
          p_spreadsheet_id: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
