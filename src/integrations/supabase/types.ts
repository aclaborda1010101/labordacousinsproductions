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
      character_outfits: {
        Row: {
          character_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          reference_urls: Json | null
        }
        Insert: {
          character_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          reference_urls?: Json | null
        }
        Update: {
          character_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          reference_urls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "character_outfits_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          arc: string | null
          bio: string | null
          canon_rules: Json | null
          created_at: string
          expressions: Json | null
          id: string
          name: string
          project_id: string
          role: string | null
          token: string | null
          turnaround_urls: Json | null
          updated_at: string
          voice_card: Json | null
        }
        Insert: {
          arc?: string | null
          bio?: string | null
          canon_rules?: Json | null
          created_at?: string
          expressions?: Json | null
          id?: string
          name: string
          project_id: string
          role?: string | null
          token?: string | null
          turnaround_urls?: Json | null
          updated_at?: string
          voice_card?: Json | null
        }
        Update: {
          arc?: string | null
          bio?: string | null
          canon_rules?: Json | null
          created_at?: string
          expressions?: Json | null
          id?: string
          name?: string
          project_id?: string
          role?: string | null
          token?: string | null
          turnaround_urls?: Json | null
          updated_at?: string
          voice_card?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          project_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          project_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_assumptions: {
        Row: {
          currency: string | null
          id: string
          max_attempts_cine: number | null
          max_attempts_hero: number | null
          max_attempts_ultra: number | null
          padding_expected: number | null
          padding_high: number | null
          padding_low: number | null
          price_per_sec: number | null
          project_id: string
          retry_cine_expected: number | null
          retry_cine_high: number | null
          retry_cine_low: number | null
          retry_hero_expected: number | null
          retry_hero_high: number | null
          retry_hero_low: number | null
          retry_ultra_expected: number | null
          retry_ultra_high: number | null
          retry_ultra_low: number | null
          updated_at: string
        }
        Insert: {
          currency?: string | null
          id?: string
          max_attempts_cine?: number | null
          max_attempts_hero?: number | null
          max_attempts_ultra?: number | null
          padding_expected?: number | null
          padding_high?: number | null
          padding_low?: number | null
          price_per_sec?: number | null
          project_id: string
          retry_cine_expected?: number | null
          retry_cine_high?: number | null
          retry_cine_low?: number | null
          retry_hero_expected?: number | null
          retry_hero_high?: number | null
          retry_hero_low?: number | null
          retry_ultra_expected?: number | null
          retry_ultra_high?: number | null
          retry_ultra_low?: number | null
          updated_at?: string
        }
        Update: {
          currency?: string | null
          id?: string
          max_attempts_cine?: number | null
          max_attempts_hero?: number | null
          max_attempts_ultra?: number | null
          padding_expected?: number | null
          padding_high?: number | null
          padding_low?: number | null
          price_per_sec?: number | null
          project_id?: string
          retry_cine_expected?: number | null
          retry_cine_high?: number | null
          retry_cine_low?: number | null
          retry_hero_expected?: number | null
          retry_hero_high?: number | null
          retry_hero_low?: number | null
          retry_ultra_expected?: number | null
          retry_ultra_high?: number | null
          retry_ultra_low?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_assumptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dailies_items: {
        Row: {
          assigned_to: string | null
          decision: Database["public"]["Enums"]["dailies_decision"] | null
          id: string
          notes: string | null
          render_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          decision?: Database["public"]["Enums"]["dailies_decision"] | null
          id?: string
          notes?: string | null
          render_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          decision?: Database["public"]["Enums"]["dailies_decision"] | null
          id?: string
          notes?: string | null
          render_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dailies_items_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dailies_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dailies_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dailies_sessions: {
        Row: {
          created_at: string
          deadline: string | null
          id: string
          project_id: string
          status: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          id?: string
          project_id: string
          status?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          deadline?: string | null
          id?: string
          project_id?: string
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dailies_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions_log: {
        Row: {
          action: string
          created_at: string
          data: Json | null
          entity_id: string
          entity_type: string
          id: string
          project_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          data?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          project_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          data?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_tests: {
        Row: {
          character_id: string | null
          created_at: string
          duration_sec: number | null
          id: string
          kling_result: Json | null
          location_id: string | null
          project_id: string
          qc_results: Json | null
          scene_description: string
          veo_result: Json | null
          winner: string | null
        }
        Insert: {
          character_id?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          kling_result?: Json | null
          location_id?: string | null
          project_id: string
          qc_results?: Json | null
          scene_description: string
          veo_result?: Json | null
          winner?: string | null
        }
        Update: {
          character_id?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          kling_result?: Json | null
          location_id?: string | null
          project_id?: string
          qc_results?: Json | null
          scene_description?: string
          veo_result?: Json | null
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engine_tests_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_tests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          data: Json
          entity_id: string
          entity_type: string
          id: string
          project_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          entity_id: string
          entity_type: string
          id?: string
          project_id: string
          version_number?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          project_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "entity_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_qc: {
        Row: {
          created_at: string
          episode_no: number
          id: string
          project_id: string
          score: number | null
          summary: Json | null
          waivers: Json | null
        }
        Insert: {
          created_at?: string
          episode_no: number
          id?: string
          project_id: string
          score?: number | null
          summary?: Json | null
          waivers?: Json | null
        }
        Update: {
          created_at?: string
          episode_no?: number
          id?: string
          project_id?: string
          score?: number | null
          summary?: Json | null
          waivers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_qc_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      frame_notes: {
        Row: {
          author_id: string
          created_at: string
          id: string
          note: string
          render_id: string
          timestamp_sec: number
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          note: string
          render_id: string
          timestamp_sec: number
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          note?: string
          render_id?: string
          timestamp_sec?: number
        }
        Relationships: [
          {
            foreignKeyName: "frame_notes_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number | null
          backoff_sec: number | null
          created_at: string
          error: string | null
          id: string
          max_attempts: number | null
          payload: Json | null
          project_id: string
          status: Database["public"]["Enums"]["job_status"] | null
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number | null
          backoff_sec?: number | null
          created_at?: string
          error?: string | null
          id?: string
          max_attempts?: number | null
          payload?: Json | null
          project_id: string
          status?: Database["public"]["Enums"]["job_status"] | null
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number | null
          backoff_sec?: number | null
          created_at?: string
          error?: string | null
          id?: string
          max_attempts?: number | null
          payload?: Json | null
          project_id?: string
          status?: Database["public"]["Enums"]["job_status"] | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      keyframes: {
        Row: {
          approved: boolean | null
          created_at: string
          id: string
          image_url: string | null
          locks: Json | null
          prompt_text: string | null
          seed: number | null
          shot_id: string
          version: number | null
        }
        Insert: {
          approved?: boolean | null
          created_at?: string
          id?: string
          image_url?: string | null
          locks?: Json | null
          prompt_text?: string | null
          seed?: number | null
          shot_id: string
          version?: number | null
        }
        Update: {
          approved?: boolean | null
          created_at?: string
          id?: string
          image_url?: string | null
          locks?: Json | null
          prompt_text?: string | null
          seed?: number | null
          shot_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keyframes_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          props: Json | null
          reference_urls: Json | null
          sound_profile: Json | null
          token: string | null
          updated_at: string
          variants: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          props?: Json | null
          reference_urls?: Json | null
          sound_profile?: Json | null
          token?: string | null
          updated_at?: string
          variants?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          props?: Json | null
          reference_urls?: Json | null
          sound_profile?: Json | null
          token?: string | null
          updated_at?: string
          variants?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          bible_completeness_score: number | null
          budget_cap_episode_eur: number | null
          budget_cap_project_eur: number | null
          budget_cap_scene_eur: number | null
          created_at: string
          engine_test_completed: boolean | null
          episodes_count: number
          format: Database["public"]["Enums"]["project_format"]
          id: string
          master_language: string
          owner_id: string
          preferred_engine: string | null
          target_duration_min: number
          target_languages: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          bible_completeness_score?: number | null
          budget_cap_episode_eur?: number | null
          budget_cap_project_eur?: number | null
          budget_cap_scene_eur?: number | null
          created_at?: string
          engine_test_completed?: boolean | null
          episodes_count?: number
          format?: Database["public"]["Enums"]["project_format"]
          id?: string
          master_language?: string
          owner_id: string
          preferred_engine?: string | null
          target_duration_min?: number
          target_languages?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          bible_completeness_score?: number | null
          budget_cap_episode_eur?: number | null
          budget_cap_project_eur?: number | null
          budget_cap_scene_eur?: number | null
          created_at?: string
          engine_test_completed?: boolean | null
          episodes_count?: number
          format?: Database["public"]["Enums"]["project_format"]
          id?: string
          master_language?: string
          owner_id?: string
          preferred_engine?: string | null
          target_duration_min?: number
          target_languages?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      qc_reports: {
        Row: {
          created_at: string
          fix_notes: Json | null
          id: string
          issues: Json | null
          module: string
          project_id: string
          scene_id: string | null
          score: number | null
          shot_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          fix_notes?: Json | null
          id?: string
          issues?: Json | null
          module: string
          project_id: string
          scene_id?: string | null
          score?: number | null
          shot_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          fix_notes?: Json | null
          id?: string
          issues?: Json | null
          module?: string
          project_id?: string
          scene_id?: string | null
          score?: number | null
          shot_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_reports_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_reports_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      renders: {
        Row: {
          audio_url: string | null
          cost_estimate: number | null
          created_at: string
          engine: string | null
          id: string
          locked: boolean | null
          params: Json | null
          prompt_text: string | null
          rating: Json | null
          refs: Json | null
          shot_id: string
          status: Database["public"]["Enums"]["job_status"] | null
          take_label: string | null
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          cost_estimate?: number | null
          created_at?: string
          engine?: string | null
          id?: string
          locked?: boolean | null
          params?: Json | null
          prompt_text?: string | null
          rating?: Json | null
          refs?: Json | null
          shot_id: string
          status?: Database["public"]["Enums"]["job_status"] | null
          take_label?: string | null
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          cost_estimate?: number | null
          created_at?: string
          engine?: string | null
          id?: string
          locked?: boolean | null
          params?: Json | null
          prompt_text?: string | null
          rating?: Json | null
          refs?: Json | null
          shot_id?: string
          status?: Database["public"]["Enums"]["job_status"] | null
          take_label?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renders_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          approved: boolean | null
          assigned_role: Database["public"]["Enums"]["app_role"] | null
          beats: Json | null
          character_ids: string[] | null
          created_at: string
          episode_no: number
          estimated_cost: Json | null
          id: string
          location_id: string | null
          max_attempts_override: number | null
          mood: Json | null
          padding_override: number | null
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string
          quality_mode: Database["public"]["Enums"]["quality_mode"]
          retry_override: number | null
          scene_no: number
          script_id: string | null
          slugline: string
          summary: string | null
          time_of_day: string | null
          updated_at: string
        }
        Insert: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          beats?: Json | null
          character_ids?: string[] | null
          created_at?: string
          episode_no?: number
          estimated_cost?: Json | null
          id?: string
          location_id?: string | null
          max_attempts_override?: number | null
          mood?: Json | null
          padding_override?: number | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id: string
          quality_mode?: Database["public"]["Enums"]["quality_mode"]
          retry_override?: number | null
          scene_no: number
          script_id?: string | null
          slugline: string
          summary?: string | null
          time_of_day?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          beats?: Json | null
          character_ids?: string[] | null
          created_at?: string
          episode_no?: number
          estimated_cost?: Json | null
          id?: string
          location_id?: string | null
          max_attempts_override?: number | null
          mood?: Json | null
          padding_override?: number | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string
          quality_mode?: Database["public"]["Enums"]["quality_mode"]
          retry_override?: number | null
          scene_no?: number
          script_id?: string | null
          slugline?: string
          summary?: string | null
          time_of_day?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          project_id: string
          raw_text: string | null
          version: number | null
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          project_id: string
          raw_text?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          project_id?: string
          raw_text?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          approved: boolean | null
          assigned_role: Database["public"]["Enums"]["app_role"] | null
          blocking: Json | null
          camera: Json | null
          created_at: string
          dialogue_text: string | null
          duration_target: number | null
          effective_mode: Database["public"]["Enums"]["quality_mode"]
          estimated_cost: Json | null
          hero: boolean | null
          id: string
          scene_id: string
          shot_no: number
          shot_type: string
          sound_plan: Json | null
          updated_at: string
        }
        Insert: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          blocking?: Json | null
          camera?: Json | null
          created_at?: string
          dialogue_text?: string | null
          duration_target?: number | null
          effective_mode?: Database["public"]["Enums"]["quality_mode"]
          estimated_cost?: Json | null
          hero?: boolean | null
          id?: string
          scene_id: string
          shot_no: number
          shot_type?: string
          sound_plan?: Json | null
          updated_at?: string
        }
        Update: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          blocking?: Json | null
          camera?: Json | null
          created_at?: string
          dialogue_text?: string | null
          duration_target?: number | null
          effective_mode?: Database["public"]["Enums"]["quality_mode"]
          estimated_cost?: Json | null
          hero?: boolean | null
          id?: string
          scene_id?: string
          shot_no?: number
          shot_type?: string
          sound_plan?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      style_packs: {
        Row: {
          aspect_ratio: string | null
          color_palette: Json | null
          created_at: string
          forbidden_rules: Json | null
          fps: number | null
          grain_level: string | null
          id: string
          lens_style: string | null
          lighting_rules: Json | null
          project_id: string
          reference_urls: Json | null
          token: string | null
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string | null
          color_palette?: Json | null
          created_at?: string
          forbidden_rules?: Json | null
          fps?: number | null
          grain_level?: string | null
          id?: string
          lens_style?: string | null
          lighting_rules?: Json | null
          project_id: string
          reference_urls?: Json | null
          token?: string | null
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string | null
          color_palette?: Json | null
          created_at?: string
          forbidden_rules?: Json | null
          fps?: number | null
          grain_level?: string | null
          id?: string
          lens_style?: string | null
          lighting_rules?: Json | null
          project_id?: string
          reference_urls?: Json | null
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "style_packs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          description: string | null
          episode_no: number | null
          id: string
          linked_entity_id: string | null
          linked_entity_type: string | null
          owner_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          project_id: string
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          episode_no?: number | null
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          project_id: string
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          episode_no?: number | null
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          project_id?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "producer"
        | "director"
        | "writer"
        | "dp"
        | "sound"
        | "reviewer"
      approval_status: "pending" | "approved" | "rejected"
      dailies_decision: "SELECT" | "FIX" | "REJECT" | "NONE"
      job_status: "queued" | "running" | "succeeded" | "failed" | "blocked"
      priority_level: "P0" | "P1" | "P2"
      project_format: "series" | "mini" | "film"
      quality_mode: "CINE" | "ULTRA"
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
      app_role: [
        "owner",
        "producer",
        "director",
        "writer",
        "dp",
        "sound",
        "reviewer",
      ],
      approval_status: ["pending", "approved", "rejected"],
      dailies_decision: ["SELECT", "FIX", "REJECT", "NONE"],
      job_status: ["queued", "running", "succeeded", "failed", "blocked"],
      priority_level: ["P0", "P1", "P2"],
      project_format: ["series", "mini", "film"],
      quality_mode: ["CINE", "ULTRA"],
    },
  },
} as const
