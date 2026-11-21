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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: number
          ts: string
          user_id: string
        }
        Insert: {
          action: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: never
          ts?: string
          user_id?: string
        }
        Update: {
          action?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: never
          ts?: string
          user_id?: string
        }
        Relationships: []
      }
      backtest_daily: {
        Row: {
          day: string
          id: number
          instrument_id: string | null
          outcome: string
          run_id: string
          user_id: string
        }
        Insert: {
          day: string
          id?: never
          instrument_id?: string | null
          outcome: string
          run_id: string
          user_id?: string
        }
        Update: {
          day?: string
          id?: never
          instrument_id?: string | null
          outcome?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_daily_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_daily_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_runs: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string
          dataset_manifest: Json
          id: string
          metrics: Json | null
          model_version_id: string
          progress: number
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          dataset_manifest?: Json
          id?: string
          metrics?: Json | null
          model_version_id: string
          progress?: number
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          dataset_manifest?: Json
          id?: string
          metrics?: Json | null
          model_version_id?: string
          progress?: number
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_runs_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_trades: {
        Row: {
          dataset_id: string | null
          day: string | null
          entry: number | null
          entry_time: string | null
          exit: number | null
          exit_time: string | null
          half_range: number | null
          id: number
          instrument_id: string | null
          mae: number | null
          mfe: number | null
          pnl: number | null
          pts: number | null
          reason: string | null
          run_id: string
          side: string | null
          tag: string | null
          user_id: string
        }
        Insert: {
          dataset_id?: string | null
          day?: string | null
          entry?: number | null
          entry_time?: string | null
          exit?: number | null
          exit_time?: string | null
          half_range?: number | null
          id?: never
          instrument_id?: string | null
          mae?: number | null
          mfe?: number | null
          pnl?: number | null
          pts?: number | null
          reason?: string | null
          run_id: string
          side?: string | null
          tag?: string | null
          user_id?: string
        }
        Update: {
          dataset_id?: string | null
          day?: string | null
          entry?: number | null
          entry_time?: string | null
          exit?: number | null
          exit_time?: string | null
          half_range?: number | null
          id?: never
          instrument_id?: string | null
          mae?: number | null
          mfe?: number | null
          pnl?: number | null
          pts?: number | null
          reason?: string | null
          run_id?: string
          side?: string | null
          tag?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_trades_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_trades_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_trades_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      data_import_batches: {
        Row: {
          accepted_rows: number
          completed_at: string | null
          created_at: string
          id: string
          processed_files: number
          rejected_rows: number
          status: string
          total_files: number
          upload_mode: string
          user_id: string
        }
        Insert: {
          accepted_rows?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          processed_files?: number
          rejected_rows?: number
          status?: string
          total_files?: number
          upload_mode?: string
          user_id?: string
        }
        Update: {
          accepted_rows?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          processed_files?: number
          rejected_rows?: number
          status?: string
          total_files?: number
          upload_mode?: string
          user_id?: string
        }
        Relationships: []
      }
      data_import_files: {
        Row: {
          accepted_rows: number
          batch_id: string
          completed_at: string | null
          config: Json
          conflict_rows: number
          created_at: string
          dataset_id: string | null
          duplicate_rows: number
          error_message: string | null
          existing_rows: number
          file_sha256: string | null
          filename: string
          id: string
          instrument_id: string | null
          progress: number
          rejected_rows: number
          source_rows: number
          status: string
          storage_path: string | null
          user_id: string
          validation_report: Json
        }
        Insert: {
          accepted_rows?: number
          batch_id: string
          completed_at?: string | null
          config?: Json
          conflict_rows?: number
          created_at?: string
          dataset_id?: string | null
          duplicate_rows?: number
          error_message?: string | null
          existing_rows?: number
          file_sha256?: string | null
          filename: string
          id?: string
          instrument_id?: string | null
          progress?: number
          rejected_rows?: number
          source_rows?: number
          status?: string
          storage_path?: string | null
          user_id?: string
          validation_report?: Json
        }
        Update: {
          accepted_rows?: number
          batch_id?: string
          completed_at?: string | null
          config?: Json
          conflict_rows?: number
          created_at?: string
          dataset_id?: string | null
          duplicate_rows?: number
          error_message?: string | null
          existing_rows?: number
          file_sha256?: string | null
          filename?: string
          id?: string
          instrument_id?: string | null
          progress?: number
          rejected_rows?: number
          source_rows?: number
          status?: string
          storage_path?: string | null
          user_id?: string
          validation_report?: Json
        }
        Relationships: [
          {
            foreignKeyName: "data_import_files_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "data_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_files_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_import_files_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          candle_count: number
          column_mapping: Json
          created_at: string
          detected_interval_s: number | null
          end_time_utc: string | null
          file_sha256: string | null
          gap_report: Json
          id: string
          instrument_id: string
          is_active: boolean
          price_basis: string
          rejected_count: number
          source_filename: string | null
          source_type: string
          spread_unit: string | null
          start_time_utc: string | null
          timeframe: string
          timestamp_format: string | null
          timezone: string
          user_id: string
          validation_status: string
          version: number
          volume_type: string | null
        }
        Insert: {
          candle_count?: number
          column_mapping?: Json
          created_at?: string
          detected_interval_s?: number | null
          end_time_utc?: string | null
          file_sha256?: string | null
          gap_report?: Json
          id?: string
          instrument_id: string
          is_active?: boolean
          price_basis?: string
          rejected_count?: number
          source_filename?: string | null
          source_type?: string
          spread_unit?: string | null
          start_time_utc?: string | null
          timeframe?: string
          timestamp_format?: string | null
          timezone?: string
          user_id?: string
          validation_status?: string
          version: number
          volume_type?: string | null
        }
        Update: {
          candle_count?: number
          column_mapping?: Json
          created_at?: string
          detected_interval_s?: number | null
          end_time_utc?: string | null
          file_sha256?: string | null
          gap_report?: Json
          id?: string
          instrument_id?: string
          is_active?: boolean
          price_basis?: string
          rejected_count?: number
          source_filename?: string | null
          source_type?: string
          spread_unit?: string | null
          start_time_utc?: string | null
          timeframe?: string
          timestamp_format?: string | null
          timezone?: string
          user_id?: string
          validation_status?: string
          version?: number
          volume_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datasets_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_logs: {
        Row: {
          component: string | null
          id: number
          level: string
          message: string
          metadata: Json | null
          timestamp: string
          user_id: string
        }
        Insert: {
          component?: string | null
          id?: never
          level?: string
          message: string
          metadata?: Json | null
          timestamp?: string
          user_id?: string
        }
        Update: {
          component?: string | null
          id?: never
          level?: string
          message?: string
          metadata?: Json | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      import_rejections: {
        Row: {
          created_at: string
          file_id: string
          id: number
          raw_row: string | null
          reason: string
          row_number: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: never
          raw_row?: string | null
          reason: string
          row_number?: number | null
          user_id?: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: never
          raw_row?: string | null
          reason?: string
          row_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rejections_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "data_import_files"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          asset_class: string
          created_at: string
          digits: number
          display_name: string | null
          enabled: boolean
          id: string
          point_size: number
          provider_symbol_code: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          asset_class?: string
          created_at?: string
          digits?: number
          display_name?: string | null
          enabled?: boolean
          id?: string
          point_size?: number
          provider_symbol_code?: string | null
          symbol: string
          user_id?: string
        }
        Update: {
          asset_class?: string
          created_at?: string
          digits?: number
          display_name?: string | null
          enabled?: boolean
          id?: string
          point_size?: number
          provider_symbol_code?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          payload: Json
          progress: number
          result: Json | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          payload?: Json
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
          progress?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      live_deployments: {
        Row: {
          created_at: string
          id: string
          instruments: Json
          model_version_id: string
          prop_profile_id: string | null
          started_at: string | null
          status: string
          stopped_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instruments?: Json
          model_version_id: string
          prop_profile_id?: string | null
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          instruments?: Json
          model_version_id?: string
          prop_profile_id?: string | null
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_deployments_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_deployments_prop_profile_id_fkey"
            columns: ["prop_profile_id"]
            isOneToOne: false
            referencedRelation: "prop_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_equity: {
        Row: {
          deployment_id: string
          drawdown: number
          equity: number
          id: number
          ts: string
          user_id: string
        }
        Insert: {
          deployment_id: string
          drawdown?: number
          equity: number
          id?: never
          ts: string
          user_id?: string
        }
        Update: {
          deployment_id?: string
          drawdown?: number
          equity?: number
          id?: never
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_equity_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "live_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      live_events: {
        Row: {
          deployment_id: string | null
          id: number
          level: string
          message: string | null
          metadata: Json | null
          ts: string
          type: string
          user_id: string
        }
        Insert: {
          deployment_id?: string | null
          id?: never
          level?: string
          message?: string | null
          metadata?: Json | null
          ts?: string
          type: string
          user_id?: string
        }
        Update: {
          deployment_id?: string | null
          id?: never
          level?: string
          message?: string | null
          metadata?: Json | null
          ts?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_events_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "live_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      live_trades: {
        Row: {
          created_at: string
          deployment_id: string
          entry: number | null
          entry_time: string | null
          execution: Json | null
          exit: number | null
          exit_time: string | null
          id: string
          instrument_id: string | null
          mae: number | null
          mfe: number | null
          pnl: number | null
          reason: string | null
          side: string | null
          spread_at_entry: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deployment_id: string
          entry?: number | null
          entry_time?: string | null
          execution?: Json | null
          exit?: number | null
          exit_time?: string | null
          id?: string
          instrument_id?: string | null
          mae?: number | null
          mfe?: number | null
          pnl?: number | null
          reason?: string | null
          side?: string | null
          spread_at_entry?: number | null
          user_id?: string
        }
        Update: {
          created_at?: string
          deployment_id?: string
          entry?: number | null
          entry_time?: string | null
          execution?: Json | null
          exit?: number | null
          exit_time?: string | null
          id?: string
          instrument_id?: string | null
          mae?: number | null
          mfe?: number | null
          pnl?: number | null
          reason?: string | null
          side?: string | null
          spread_at_entry?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_trades_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "live_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_trades_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      market_bars: {
        Row: {
          close: number
          dataset_id: string
          high: number
          instrument_id: string
          low: number
          open: number
          source_metadata: Json | null
          spread: number | null
          spread_unit: string | null
          ts_utc: string
          user_id: string
          volume: number | null
          volume_type: string | null
        }
        Insert: {
          close: number
          dataset_id: string
          high: number
          instrument_id: string
          low: number
          open: number
          source_metadata?: Json | null
          spread?: number | null
          spread_unit?: string | null
          ts_utc: string
          user_id?: string
          volume?: number | null
          volume_type?: string | null
        }
        Update: {
          close?: number
          dataset_id?: string
          high?: number
          instrument_id?: string
          low?: number
          open?: number
          source_metadata?: Json | null
          spread?: number | null
          spread_unit?: string | null
          ts_utc?: string
          user_id?: string
          volume?: number | null
          volume_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_bars_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_bars_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      model_versions: {
        Row: {
          code: string
          code_sha256: string
          contract_status: string
          created_at: string
          id: string
          model_id: string
          params: Json
          user_id: string
          validation_report: Json
          version: number
        }
        Insert: {
          code: string
          code_sha256: string
          contract_status?: string
          created_at?: string
          id?: string
          model_id: string
          params?: Json
          user_id?: string
          validation_report?: Json
          version: number
        }
        Update: {
          code?: string
          code_sha256?: string
          contract_status?: string
          created_at?: string
          id?: string
          model_id?: string
          params?: Json
          user_id?: string
          validation_report?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "model_versions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prop_profiles: {
        Row: {
          created_at: string
          firm_name: string | null
          id: string
          name: string
          rules: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          firm_name?: string | null
          id?: string
          name: string
          rules?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          firm_name?: string | null
          id?: string
          name?: string
          rules?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      symbol_mappings: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          provider: string
          provider_symbol_code: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          provider?: string
          provider_symbol_code: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          provider?: string
          provider_symbol_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "symbol_mappings_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      copy_dataset_bars: {
        Args: {
          _dst: string
          _excl_end?: string
          _excl_start?: string
          _src: string
        }
        Returns: number
      }
      dataset_daily_coverage: {
        Args: { _dataset_ids: string[] }
        Returns: {
          bars: number
          dataset_id: string
          day: string
        }[]
      }
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
    Enums: {},
  },
} as const
