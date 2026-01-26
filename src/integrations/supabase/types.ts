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
      audio_layers: {
        Row: {
          ambience_layers: Json
          created_at: string | null
          foley_layers: Json
          id: string
          location_id: string | null
          mix_notes: Json
          project_id: string
          room_tone: Json
          scene_id: string | null
          shot_id: string | null
          updated_at: string | null
          validated: boolean | null
          validation_errors: Json | null
        }
        Insert: {
          ambience_layers?: Json
          created_at?: string | null
          foley_layers?: Json
          id?: string
          location_id?: string | null
          mix_notes?: Json
          project_id: string
          room_tone?: Json
          scene_id?: string | null
          shot_id?: string | null
          updated_at?: string | null
          validated?: boolean | null
          validation_errors?: Json | null
        }
        Update: {
          ambience_layers?: Json
          created_at?: string | null
          foley_layers?: Json
          id?: string
          location_id?: string | null
          mix_notes?: Json
          project_id?: string
          room_tone?: Json
          scene_id?: string | null
          shot_id?: string | null
          updated_at?: string | null
          validated?: boolean | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audio_layers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_layers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_layers_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_layers_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_presets: {
        Row: {
          category: string
          created_at: string | null
          description: string
          id: string
          name: string
          preset_data: Json
          subcategory: string | null
          tags: string[] | null
          usage_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          id?: string
          name: string
          preset_data: Json
          subcategory?: string | null
          tags?: string[] | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          name?: string
          preset_data?: Json
          subcategory?: string | null
          tags?: string[] | null
          usage_count?: number | null
        }
        Relationships: []
      }
      background_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_name: string | null
          error: string | null
          id: string
          metadata: Json | null
          progress: number
          project_id: string | null
          result: Json | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_name?: string | null
          error?: string | null
          id: string
          metadata?: Json | null
          progress?: number
          project_id?: string | null
          result?: Json | null
          status?: string
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_name?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          progress?: number
          project_id?: string | null
          result?: Json | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      canon_assets: {
        Row: {
          asset_type: string
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          name: string
          notes: string | null
          project_id: string
          run_id: string | null
        }
        Insert: {
          asset_type: string
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          name: string
          notes?: string | null
          project_id: string
          run_id?: string | null
        }
        Update: {
          asset_type?: string
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          project_id?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canon_assets_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_packs: {
        Row: {
          act_number: number | null
          active_cast: Json | null
          active_props_locs: Json | null
          canon_hash: string | null
          continuity_locks: Json | null
          created_at: string | null
          episode_number: number | null
          id: string
          invariants_by_character: Json | null
          locked_fields: Json | null
          pack_type: string
          project_id: string
          timeline_state: Json | null
          token_estimate: number | null
          updated_at: string | null
          version: number | null
          voice_tone_rules: Json | null
        }
        Insert: {
          act_number?: number | null
          active_cast?: Json | null
          active_props_locs?: Json | null
          canon_hash?: string | null
          continuity_locks?: Json | null
          created_at?: string | null
          episode_number?: number | null
          id?: string
          invariants_by_character?: Json | null
          locked_fields?: Json | null
          pack_type: string
          project_id: string
          timeline_state?: Json | null
          token_estimate?: number | null
          updated_at?: string | null
          version?: number | null
          voice_tone_rules?: Json | null
        }
        Update: {
          act_number?: number | null
          active_cast?: Json | null
          active_props_locs?: Json | null
          canon_hash?: string | null
          continuity_locks?: Json | null
          created_at?: string | null
          episode_number?: number | null
          id?: string
          invariants_by_character?: Json | null
          locked_fields?: Json | null
          pack_type?: string
          project_id?: string
          timeline_state?: Json | null
          token_estimate?: number | null
          updated_at?: string | null
          version?: number | null
          voice_tone_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "canon_packs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_pack_slots: {
        Row: {
          accepted_run_id: string | null
          character_id: string
          created_at: string
          current_run_id: string | null
          expression_name: string | null
          fix_notes: string | null
          generation_metadata: Json | null
          id: string
          identity_score: number | null
          image_url: string | null
          ip_adapter_enabled: boolean | null
          outfit_id: string | null
          prompt_text: string | null
          qc_issues: Json | null
          qc_score: number | null
          reference_anchor_id: string | null
          reference_weight: number | null
          required: boolean
          run_id: string | null
          seed: number | null
          slot_index: number
          slot_type: string
          status: string
          updated_at: string
          view_angle: string | null
        }
        Insert: {
          accepted_run_id?: string | null
          character_id: string
          created_at?: string
          current_run_id?: string | null
          expression_name?: string | null
          fix_notes?: string | null
          generation_metadata?: Json | null
          id?: string
          identity_score?: number | null
          image_url?: string | null
          ip_adapter_enabled?: boolean | null
          outfit_id?: string | null
          prompt_text?: string | null
          qc_issues?: Json | null
          qc_score?: number | null
          reference_anchor_id?: string | null
          reference_weight?: number | null
          required?: boolean
          run_id?: string | null
          seed?: number | null
          slot_index?: number
          slot_type: string
          status?: string
          updated_at?: string
          view_angle?: string | null
        }
        Update: {
          accepted_run_id?: string | null
          character_id?: string
          created_at?: string
          current_run_id?: string | null
          expression_name?: string | null
          fix_notes?: string | null
          generation_metadata?: Json | null
          id?: string
          identity_score?: number | null
          image_url?: string | null
          ip_adapter_enabled?: boolean | null
          outfit_id?: string | null
          prompt_text?: string | null
          qc_issues?: Json | null
          qc_score?: number | null
          reference_anchor_id?: string | null
          reference_weight?: number | null
          required?: boolean
          run_id?: string | null
          seed?: number | null
          slot_index?: number
          slot_type?: string
          status?: string
          updated_at?: string
          view_angle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "character_pack_slots_accepted_run_id_fkey"
            columns: ["accepted_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_pack_slots_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_pack_slots_current_run_id_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_pack_slots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_character_pack_slots_reference_anchor"
            columns: ["reference_anchor_id"]
            isOneToOne: false
            referencedRelation: "reference_anchors"
            referencedColumns: ["id"]
          },
        ]
      }
      character_visual_dna: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          character_id: string
          continuity_lock: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          version: number
          version_name: string | null
          visual_dna: Json
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          character_id: string
          continuity_lock?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          version?: number
          version_name?: string | null
          visual_dna?: Json
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          character_id?: string
          continuity_lock?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          version?: number
          version_name?: string | null
          visual_dna?: Json
        }
        Relationships: [
          {
            foreignKeyName: "character_visual_dna_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "character_visual_dna_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          accepted_run_id: string | null
          active_visual_dna_id: string | null
          approved_for_production: boolean | null
          arc: string | null
          bio: string | null
          canon_asset_id: string | null
          canon_level: string | null
          canon_rules: Json | null
          character_role: Database["public"]["Enums"]["character_role"] | null
          confidence: number | null
          created_at: string
          current_run_id: string | null
          entity_subtype: string | null
          expressions: Json | null
          id: string
          identity_lock_score: number | null
          is_ready_for_video: boolean | null
          lora_trained_at: string | null
          lora_training_id: string | null
          lora_training_status: string | null
          lora_trigger_word: string | null
          lora_url: string | null
          name: string
          pack_completeness_score: number | null
          pack_status: string | null
          production_ready_slots: number | null
          profile_json: Json | null
          project_id: string
          role: string | null
          slot_config: Json | null
          source: string | null
          token: string | null
          turnaround_urls: Json | null
          updated_at: string
          visual_dna: Json | null
          voice_card: Json | null
          wardrobe_lock_json: Json | null
        }
        Insert: {
          accepted_run_id?: string | null
          active_visual_dna_id?: string | null
          approved_for_production?: boolean | null
          arc?: string | null
          bio?: string | null
          canon_asset_id?: string | null
          canon_level?: string | null
          canon_rules?: Json | null
          character_role?: Database["public"]["Enums"]["character_role"] | null
          confidence?: number | null
          created_at?: string
          current_run_id?: string | null
          entity_subtype?: string | null
          expressions?: Json | null
          id?: string
          identity_lock_score?: number | null
          is_ready_for_video?: boolean | null
          lora_trained_at?: string | null
          lora_training_id?: string | null
          lora_training_status?: string | null
          lora_trigger_word?: string | null
          lora_url?: string | null
          name: string
          pack_completeness_score?: number | null
          pack_status?: string | null
          production_ready_slots?: number | null
          profile_json?: Json | null
          project_id: string
          role?: string | null
          slot_config?: Json | null
          source?: string | null
          token?: string | null
          turnaround_urls?: Json | null
          updated_at?: string
          visual_dna?: Json | null
          voice_card?: Json | null
          wardrobe_lock_json?: Json | null
        }
        Update: {
          accepted_run_id?: string | null
          active_visual_dna_id?: string | null
          approved_for_production?: boolean | null
          arc?: string | null
          bio?: string | null
          canon_asset_id?: string | null
          canon_level?: string | null
          canon_rules?: Json | null
          character_role?: Database["public"]["Enums"]["character_role"] | null
          confidence?: number | null
          created_at?: string
          current_run_id?: string | null
          entity_subtype?: string | null
          expressions?: Json | null
          id?: string
          identity_lock_score?: number | null
          is_ready_for_video?: boolean | null
          lora_trained_at?: string | null
          lora_training_id?: string | null
          lora_training_status?: string | null
          lora_trigger_word?: string | null
          lora_url?: string | null
          name?: string
          pack_completeness_score?: number | null
          pack_status?: string | null
          production_ready_slots?: number | null
          profile_json?: Json | null
          project_id?: string
          role?: string | null
          slot_config?: Json | null
          source?: string | null
          token?: string | null
          turnaround_urls?: Json | null
          updated_at?: string
          visual_dna?: Json | null
          voice_card?: Json | null
          wardrobe_lock_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_accepted_run_id_fkey"
            columns: ["accepted_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_active_visual_dna_id_fkey"
            columns: ["active_visual_dna_id"]
            isOneToOne: false
            referencedRelation: "character_visual_dna"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_canon_asset_id_fkey"
            columns: ["canon_asset_id"]
            isOneToOne: false
            referencedRelation: "canon_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_current_run_id_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
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
      continuity_locks: {
        Row: {
          allowed_variants: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          must_avoid: Json | null
          never_change: Json | null
          project_id: string
          scene_invariants: Json | null
          updated_at: string
        }
        Insert: {
          allowed_variants?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          must_avoid?: Json | null
          never_change?: Json | null
          project_id: string
          scene_invariants?: Json | null
          updated_at?: string
        }
        Update: {
          allowed_variants?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          must_avoid?: Json | null
          never_change?: Json | null
          project_id?: string
          scene_invariants?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "continuity_locks_project_id_fkey"
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
      editorial_rules_config: {
        Row: {
          action_on_fail: Database["public"]["Enums"]["editorial_action_on_fail"]
          action_on_fail_production:
            | Database["public"]["Enums"]["editorial_action_on_fail"]
            | null
          active_default: boolean
          applies_in_exploration: boolean
          applies_in_production: boolean
          applies_to: string[] | null
          created_at: string
          description: string
          disable_reasons: string[] | null
          id: string
          must_avoid: string[] | null
          must_include: string[] | null
          name: string
          negative_prompt_snippets: string[] | null
          rule_code: string
          rule_type: Database["public"]["Enums"]["editorial_rule_type"]
          scope: string[] | null
          severity: Database["public"]["Enums"]["editorial_rule_severity"]
          toggleable: boolean
          user_message_template: string
          validation_method: Database["public"]["Enums"]["editorial_validation_method"]
        }
        Insert: {
          action_on_fail?: Database["public"]["Enums"]["editorial_action_on_fail"]
          action_on_fail_production?:
            | Database["public"]["Enums"]["editorial_action_on_fail"]
            | null
          active_default?: boolean
          applies_in_exploration?: boolean
          applies_in_production?: boolean
          applies_to?: string[] | null
          created_at?: string
          description: string
          disable_reasons?: string[] | null
          id?: string
          must_avoid?: string[] | null
          must_include?: string[] | null
          name: string
          negative_prompt_snippets?: string[] | null
          rule_code: string
          rule_type: Database["public"]["Enums"]["editorial_rule_type"]
          scope?: string[] | null
          severity?: Database["public"]["Enums"]["editorial_rule_severity"]
          toggleable?: boolean
          user_message_template: string
          validation_method?: Database["public"]["Enums"]["editorial_validation_method"]
        }
        Update: {
          action_on_fail?: Database["public"]["Enums"]["editorial_action_on_fail"]
          action_on_fail_production?:
            | Database["public"]["Enums"]["editorial_action_on_fail"]
            | null
          active_default?: boolean
          applies_in_exploration?: boolean
          applies_in_production?: boolean
          applies_to?: string[] | null
          created_at?: string
          description?: string
          disable_reasons?: string[] | null
          id?: string
          must_avoid?: string[] | null
          must_include?: string[] | null
          name?: string
          negative_prompt_snippets?: string[] | null
          rule_code?: string
          rule_type?: Database["public"]["Enums"]["editorial_rule_type"]
          scope?: string[] | null
          severity?: Database["public"]["Enums"]["editorial_rule_severity"]
          toggleable?: boolean
          user_message_template?: string
          validation_method?: Database["public"]["Enums"]["editorial_validation_method"]
        }
        Relationships: []
      }
      ekb_animation_styles: {
        Row: {
          animation_type: string
          created_at: string | null
          id: string
          lighting: string | null
          name: string
          narrative_traits: Json
          preset_bias: Json
          restrictions: string[]
          typical_composition: string | null
          visual_traits: Json
        }
        Insert: {
          animation_type?: string
          created_at?: string | null
          id: string
          lighting?: string | null
          name: string
          narrative_traits?: Json
          preset_bias?: Json
          restrictions?: string[]
          typical_composition?: string | null
          visual_traits?: Json
        }
        Update: {
          animation_type?: string
          created_at?: string | null
          id?: string
          lighting?: string | null
          name?: string
          narrative_traits?: Json
          preset_bias?: Json
          restrictions?: string[]
          typical_composition?: string | null
          visual_traits?: Json
        }
        Relationships: []
      }
      ekb_format_profiles: {
        Row: {
          activated_rules: string[]
          avg_shot_duration_sec: number
          created_at: string | null
          id: string
          name: string
          recommended_presets: string[]
          rhythm: string
          visual_complexity: string
        }
        Insert: {
          activated_rules?: string[]
          avg_shot_duration_sec?: number
          created_at?: string | null
          id: string
          name: string
          recommended_presets?: string[]
          rhythm?: string
          visual_complexity?: string
        }
        Update: {
          activated_rules?: string[]
          avg_shot_duration_sec?: number
          created_at?: string | null
          id?: string
          name?: string
          recommended_presets?: string[]
          rhythm?: string
          visual_complexity?: string
        }
        Relationships: []
      }
      ekb_industry_rules: {
        Row: {
          applies_to: string[]
          created_at: string | null
          description: string
          effect: Json
          id: string
          impact: string
          is_active: boolean
          name: string
        }
        Insert: {
          applies_to?: string[]
          created_at?: string | null
          description: string
          effect?: Json
          id?: string
          impact?: string
          is_active?: boolean
          name: string
        }
        Update: {
          applies_to?: string[]
          created_at?: string | null
          description?: string
          effect?: Json
          id?: string
          impact?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
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
      episodes: {
        Row: {
          created_at: string
          duration_target_min: number | null
          episode_index: number
          id: string
          project_id: string
          script_id: string | null
          status: string | null
          summary: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_target_min?: number | null
          episode_index?: number
          id?: string
          project_id: string
          script_id?: string | null
          status?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_target_min?: number | null
          episode_index?: number
          id?: string
          project_id?: string
          script_id?: string | null
          status?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_blocks: {
        Row: {
          block_index: number
          block_type: string
          canon_pack_id: string | null
          completed_at: string | null
          continuity_summary: Json | null
          created_at: string | null
          drift_flags: Json | null
          drift_warnings: number | null
          episode_number: number | null
          error_code: string | null
          error_message: string | null
          id: string
          input_context: Json | null
          latency_ms: number | null
          model_reason: string | null
          model_used: string | null
          output_data: Json | null
          output_tokens_est: number | null
          project_id: string
          qa_flags: Json | null
          retry_count: number | null
          scene_range: string | null
          script_id: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          block_index: number
          block_type: string
          canon_pack_id?: string | null
          completed_at?: string | null
          continuity_summary?: Json | null
          created_at?: string | null
          drift_flags?: Json | null
          drift_warnings?: number | null
          episode_number?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_context?: Json | null
          latency_ms?: number | null
          model_reason?: string | null
          model_used?: string | null
          output_data?: Json | null
          output_tokens_est?: number | null
          project_id: string
          qa_flags?: Json | null
          retry_count?: number | null
          scene_range?: string | null
          script_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          block_index?: number
          block_type?: string
          canon_pack_id?: string | null
          completed_at?: string | null
          continuity_summary?: Json | null
          created_at?: string | null
          drift_flags?: Json | null
          drift_warnings?: number | null
          episode_number?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_context?: Json | null
          latency_ms?: number | null
          model_reason?: string | null
          model_used?: string | null
          output_data?: Json | null
          output_tokens_est?: number | null
          project_id?: string
          qa_flags?: Json | null
          retry_count?: number | null
          scene_range?: string | null
          script_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_blocks_canon_pack_id_fkey"
            columns: ["canon_pack_id"]
            isOneToOne: false
            referencedRelation: "canon_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_blocks_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_logs: {
        Row: {
          category: string | null
          character_id: string | null
          cost_usd: number | null
          created_at: string | null
          duration_ms: number | null
          engine: string | null
          episode_id: string | null
          error_message: string | null
          from_cache: boolean | null
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string | null
          output_tokens: number | null
          project_id: string | null
          prompt_hash: string | null
          qc_score: number | null
          scene_id: string | null
          slot_id: string | null
          slot_type: string | null
          success: boolean | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          character_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          engine?: string | null
          episode_id?: string | null
          error_message?: string | null
          from_cache?: boolean | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          project_id?: string | null
          prompt_hash?: string | null
          qc_score?: number | null
          scene_id?: string | null
          slot_id?: string | null
          slot_type?: string | null
          success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          character_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          engine?: string | null
          episode_id?: string | null
          error_message?: string | null
          from_cache?: boolean | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          project_id?: string | null
          prompt_hash?: string | null
          qc_score?: number | null
          scene_id?: string | null
          slot_id?: string | null
          slot_type?: string | null
          success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_logs_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_logs_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_logs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_rate_limits: {
        Row: {
          created_at: string
          function_name: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: []
      }
      generation_run_logs: {
        Row: {
          cost_estimate_usd: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          function_name: string
          id: string
          metadata: Json | null
          model: string | null
          project_id: string | null
          provider: string | null
          raw_snippet_hash: string | null
          status: string
          tokens_actual: number | null
          tokens_estimated: number | null
          user_id: string
        }
        Insert: {
          cost_estimate_usd?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          function_name: string
          id?: string
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          provider?: string | null
          raw_snippet_hash?: string | null
          status?: string
          tokens_actual?: number | null
          tokens_estimated?: number | null
          user_id: string
        }
        Update: {
          cost_estimate_usd?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          function_name?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          project_id?: string | null
          provider?: string | null
          raw_snippet_hash?: string | null
          status?: string
          tokens_actual?: number | null
          tokens_estimated?: number | null
          user_id?: string
        }
        Relationships: []
      }
      generation_runs: {
        Row: {
          accepted_at: string | null
          auto_retry_count: number | null
          autopilot_confidence: number | null
          autopilot_used: boolean | null
          composed_prompt: string
          context: string | null
          created_at: string
          engine: string
          engine_reason: string | null
          engine_selected_by: string | null
          error: string | null
          generation_time_ms: number | null
          id: string
          input_intent: string
          is_canon: boolean | null
          last_error: string | null
          model: string | null
          negative_prompt: string | null
          output_text: string | null
          output_type: string | null
          output_url: string | null
          parent_run_id: string | null
          payload: Json | null
          phase: string | null
          preset_id: string | null
          project_id: string
          prompt: string | null
          rule_plan: Json | null
          run_type: string | null
          status: string | null
          suggestions: Json | null
          template_step_key: string | null
          triggered_rules: string[] | null
          used_asset_ids: string[] | null
          user_override: boolean | null
          verdict: Database["public"]["Enums"]["generation_verdict"]
          warnings: Json | null
        }
        Insert: {
          accepted_at?: string | null
          auto_retry_count?: number | null
          autopilot_confidence?: number | null
          autopilot_used?: boolean | null
          composed_prompt: string
          context?: string | null
          created_at?: string
          engine: string
          engine_reason?: string | null
          engine_selected_by?: string | null
          error?: string | null
          generation_time_ms?: number | null
          id?: string
          input_intent: string
          is_canon?: boolean | null
          last_error?: string | null
          model?: string | null
          negative_prompt?: string | null
          output_text?: string | null
          output_type?: string | null
          output_url?: string | null
          parent_run_id?: string | null
          payload?: Json | null
          phase?: string | null
          preset_id?: string | null
          project_id: string
          prompt?: string | null
          rule_plan?: Json | null
          run_type?: string | null
          status?: string | null
          suggestions?: Json | null
          template_step_key?: string | null
          triggered_rules?: string[] | null
          used_asset_ids?: string[] | null
          user_override?: boolean | null
          verdict?: Database["public"]["Enums"]["generation_verdict"]
          warnings?: Json | null
        }
        Update: {
          accepted_at?: string | null
          auto_retry_count?: number | null
          autopilot_confidence?: number | null
          autopilot_used?: boolean | null
          composed_prompt?: string
          context?: string | null
          created_at?: string
          engine?: string
          engine_reason?: string | null
          engine_selected_by?: string | null
          error?: string | null
          generation_time_ms?: number | null
          id?: string
          input_intent?: string
          is_canon?: boolean | null
          last_error?: string | null
          model?: string | null
          negative_prompt?: string | null
          output_text?: string | null
          output_type?: string | null
          output_url?: string | null
          parent_run_id?: string | null
          payload?: Json | null
          phase?: string | null
          preset_id?: string | null
          project_id?: string
          prompt?: string | null
          rule_plan?: Json | null
          run_type?: string | null
          status?: string | null
          suggestions?: Json | null
          template_step_key?: string | null
          triggered_rules?: string[] | null
          used_asset_ids?: string[] | null
          user_override?: boolean | null
          verdict?: Database["public"]["Enums"]["generation_verdict"]
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_runs_parent_run_id_fkey"
            columns: ["parent_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
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
          chain_role: string | null
          constraint_qc: Json | null
          created_at: string
          determinism: Json | null
          frame_geometry: Json | null
          frame_type: string | null
          id: string
          identity_anchors: Json | null
          identity_fix_attempts: number | null
          identity_fix_engine_model: string | null
          identity_fix_latency_ms: number | null
          identity_score: number | null
          identity_status: string | null
          image_url: string | null
          locks: Json | null
          micro_shot_id: string | null
          negative_constraints: Json | null
          pose_data: Json | null
          prompt_text: string | null
          qc_status: string | null
          run_id: string | null
          seed: number | null
          shot_id: string
          staging_image_url: string | null
          staging_snapshot: Json | null
          timestamp_sec: number | null
          version: number | null
        }
        Insert: {
          approved?: boolean | null
          chain_role?: string | null
          constraint_qc?: Json | null
          created_at?: string
          determinism?: Json | null
          frame_geometry?: Json | null
          frame_type?: string | null
          id?: string
          identity_anchors?: Json | null
          identity_fix_attempts?: number | null
          identity_fix_engine_model?: string | null
          identity_fix_latency_ms?: number | null
          identity_score?: number | null
          identity_status?: string | null
          image_url?: string | null
          locks?: Json | null
          micro_shot_id?: string | null
          negative_constraints?: Json | null
          pose_data?: Json | null
          prompt_text?: string | null
          qc_status?: string | null
          run_id?: string | null
          seed?: number | null
          shot_id: string
          staging_image_url?: string | null
          staging_snapshot?: Json | null
          timestamp_sec?: number | null
          version?: number | null
        }
        Update: {
          approved?: boolean | null
          chain_role?: string | null
          constraint_qc?: Json | null
          created_at?: string
          determinism?: Json | null
          frame_geometry?: Json | null
          frame_type?: string | null
          id?: string
          identity_anchors?: Json | null
          identity_fix_attempts?: number | null
          identity_fix_engine_model?: string | null
          identity_fix_latency_ms?: number | null
          identity_score?: number | null
          identity_status?: string | null
          image_url?: string | null
          locks?: Json | null
          micro_shot_id?: string | null
          negative_constraints?: Json | null
          pose_data?: Json | null
          prompt_text?: string | null
          qc_status?: string | null
          run_id?: string | null
          seed?: number | null
          shot_id?: string
          staging_image_url?: string | null
          staging_snapshot?: Json | null
          timestamp_sec?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keyframes_micro_shot_id_fkey"
            columns: ["micro_shot_id"]
            isOneToOne: false
            referencedRelation: "micro_shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyframes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyframes_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pack_slots: {
        Row: {
          created_at: string
          fix_notes: string | null
          generated_image_url: string | null
          id: string
          image_url: string | null
          location_id: string
          prompt_text: string | null
          qc_issues: Json | null
          qc_score: number | null
          reference_image_url: string | null
          reference_status: string
          required: boolean
          seed: number | null
          slot_index: number
          slot_type: string
          status: string
          time_of_day: string | null
          updated_at: string
          view_angle: string | null
          weather: string | null
        }
        Insert: {
          created_at?: string
          fix_notes?: string | null
          generated_image_url?: string | null
          id?: string
          image_url?: string | null
          location_id: string
          prompt_text?: string | null
          qc_issues?: Json | null
          qc_score?: number | null
          reference_image_url?: string | null
          reference_status?: string
          required?: boolean
          seed?: number | null
          slot_index?: number
          slot_type: string
          status?: string
          time_of_day?: string | null
          updated_at?: string
          view_angle?: string | null
          weather?: string | null
        }
        Update: {
          created_at?: string
          fix_notes?: string | null
          generated_image_url?: string | null
          id?: string
          image_url?: string | null
          location_id?: string
          prompt_text?: string | null
          qc_issues?: Json | null
          qc_score?: number | null
          reference_image_url?: string | null
          reference_status?: string
          required?: boolean
          seed?: number | null
          slot_index?: number
          slot_type?: string
          status?: string
          time_of_day?: string | null
          updated_at?: string
          view_angle?: string | null
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_pack_slots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_spatial_refs: {
        Row: {
          angle: string
          created_at: string
          id: string
          image_url: string | null
          location_id: string
          slot_type: string
          status: string
          updated_at: string
        }
        Insert: {
          angle: string
          created_at?: string
          id?: string
          image_url?: string | null
          location_id: string
          slot_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          angle?: string
          created_at?: string
          id?: string
          image_url?: string | null
          location_id?: string
          slot_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_spatial_refs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          accepted_run_id: string | null
          canon_asset_id: string | null
          canon_level: string | null
          confidence: number | null
          created_at: string
          current_run_id: string | null
          description: string | null
          id: string
          name: string
          narrative_role: string | null
          primary_reference_url: string | null
          profile_json: Json | null
          project_id: string
          props: Json | null
          reference_status: string
          reference_urls: Json | null
          sound_profile: Json | null
          source: string | null
          status: string | null
          token: string | null
          updated_at: string
          variants: Json | null
          visual_dna: Json | null
        }
        Insert: {
          accepted_run_id?: string | null
          canon_asset_id?: string | null
          canon_level?: string | null
          confidence?: number | null
          created_at?: string
          current_run_id?: string | null
          description?: string | null
          id?: string
          name: string
          narrative_role?: string | null
          primary_reference_url?: string | null
          profile_json?: Json | null
          project_id: string
          props?: Json | null
          reference_status?: string
          reference_urls?: Json | null
          sound_profile?: Json | null
          source?: string | null
          status?: string | null
          token?: string | null
          updated_at?: string
          variants?: Json | null
          visual_dna?: Json | null
        }
        Update: {
          accepted_run_id?: string | null
          canon_asset_id?: string | null
          canon_level?: string | null
          confidence?: number | null
          created_at?: string
          current_run_id?: string | null
          description?: string | null
          id?: string
          name?: string
          narrative_role?: string | null
          primary_reference_url?: string | null
          profile_json?: Json | null
          project_id?: string
          props?: Json | null
          reference_status?: string
          reference_urls?: Json | null
          sound_profile?: Json | null
          source?: string | null
          status?: string | null
          token?: string | null
          updated_at?: string
          variants?: Json | null
          visual_dna?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_accepted_run_id_fkey"
            columns: ["accepted_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_canon_asset_id_fkey"
            columns: ["canon_asset_id"]
            isOneToOne: false
            referencedRelation: "canon_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_current_run_id_fkey"
            columns: ["current_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lora_training_logs: {
        Row: {
          character_id: string | null
          completed_at: string | null
          cost_usd: number | null
          created_at: string | null
          error_message: string | null
          id: string
          images_used: number | null
          progress_percentage: number | null
          replicate_training_id: string | null
          replicate_version: string | null
          started_at: string | null
          status: string | null
          training_images_urls: string[] | null
          training_steps: number | null
          updated_at: string | null
        }
        Insert: {
          character_id?: string | null
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          images_used?: number | null
          progress_percentage?: number | null
          replicate_training_id?: string | null
          replicate_version?: string | null
          started_at?: string | null
          status?: string | null
          training_images_urls?: string[] | null
          training_steps?: number | null
          updated_at?: string | null
        }
        Update: {
          character_id?: string | null
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          images_used?: number | null
          progress_percentage?: number | null
          replicate_training_id?: string | null
          replicate_version?: string | null
          started_at?: string | null
          status?: string | null
          training_images_urls?: string[] | null
          training_steps?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lora_training_logs_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      micro_shots: {
        Row: {
          action_beat: string | null
          camera_beat: string | null
          created_at: string
          duration_sec: number | null
          end_frame_image_url: string | null
          end_sec: number
          generation_run_id: string | null
          id: string
          keyframe_final_id: string | null
          keyframe_initial_id: string | null
          keyframe_pipeline_status: string | null
          motion_notes: string | null
          negative_prompt: string | null
          project_id: string
          prompt_text: string | null
          qc_issues: Json | null
          quality_score: number | null
          seed: number | null
          sequence_no: number
          shot_id: string
          start_sec: number
          updated_at: string
          video_engine: string | null
          video_status: string | null
          video_url: string | null
        }
        Insert: {
          action_beat?: string | null
          camera_beat?: string | null
          created_at?: string
          duration_sec?: number | null
          end_frame_image_url?: string | null
          end_sec: number
          generation_run_id?: string | null
          id?: string
          keyframe_final_id?: string | null
          keyframe_initial_id?: string | null
          keyframe_pipeline_status?: string | null
          motion_notes?: string | null
          negative_prompt?: string | null
          project_id: string
          prompt_text?: string | null
          qc_issues?: Json | null
          quality_score?: number | null
          seed?: number | null
          sequence_no: number
          shot_id: string
          start_sec?: number
          updated_at?: string
          video_engine?: string | null
          video_status?: string | null
          video_url?: string | null
        }
        Update: {
          action_beat?: string | null
          camera_beat?: string | null
          created_at?: string
          duration_sec?: number | null
          end_frame_image_url?: string | null
          end_sec?: number
          generation_run_id?: string | null
          id?: string
          keyframe_final_id?: string | null
          keyframe_initial_id?: string | null
          keyframe_pipeline_status?: string | null
          motion_notes?: string | null
          negative_prompt?: string | null
          project_id?: string
          prompt_text?: string | null
          qc_issues?: Json | null
          quality_score?: number | null
          seed?: number | null
          sequence_no?: number
          shot_id?: string
          start_sec?: number
          updated_at?: string
          video_engine?: string | null
          video_status?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "micro_shots_generation_run_id_fkey"
            columns: ["generation_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_shots_keyframe_final_id_fkey"
            columns: ["keyframe_final_id"]
            isOneToOne: false
            referencedRelation: "keyframes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_shots_keyframe_initial_id_fkey"
            columns: ["keyframe_initial_id"]
            isOneToOne: false
            referencedRelation: "keyframes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_shots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_shots_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_state: {
        Row: {
          active_threads: Json | null
          canon_facts: Json | null
          character_arcs: Json | null
          created_at: string | null
          current_phase: string
          emotional_delta: string | null
          forbidden_actions: Json | null
          format: string
          id: string
          last_unit_summary: string | null
          locked_facts: Json | null
          narrative_goal: string | null
          open_threads: Json | null
          pacing_meter: number | null
          project_id: string
          resolved_threads: Json | null
          scenes_generated: number | null
          unit_ref: string
          unit_type: string
          unresolved_questions: Json | null
          updated_at: string | null
        }
        Insert: {
          active_threads?: Json | null
          canon_facts?: Json | null
          character_arcs?: Json | null
          created_at?: string | null
          current_phase?: string
          emotional_delta?: string | null
          forbidden_actions?: Json | null
          format: string
          id?: string
          last_unit_summary?: string | null
          locked_facts?: Json | null
          narrative_goal?: string | null
          open_threads?: Json | null
          pacing_meter?: number | null
          project_id: string
          resolved_threads?: Json | null
          scenes_generated?: number | null
          unit_ref?: string
          unit_type?: string
          unresolved_questions?: Json | null
          updated_at?: string | null
        }
        Update: {
          active_threads?: Json | null
          canon_facts?: Json | null
          character_arcs?: Json | null
          created_at?: string | null
          current_phase?: string
          emotional_delta?: string | null
          forbidden_actions?: Json | null
          format?: string
          id?: string
          last_unit_summary?: string | null
          locked_facts?: Json | null
          narrative_goal?: string | null
          open_threads?: Json | null
          pacing_meter?: number | null
          project_id?: string
          resolved_threads?: Json | null
          scenes_generated?: number | null
          unit_ref?: string
          unit_type?: string
          unresolved_questions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "narrative_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          developer_mode_enabled: boolean
          developer_mode_enabled_at: string | null
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          developer_mode_enabled?: boolean
          developer_mode_enabled_at?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          developer_mode_enabled?: boolean
          developer_mode_enabled_at?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_autopilot_settings: {
        Row: {
          autopilot_confidence_threshold: number | null
          autopilot_image_enabled: boolean | null
          autopilot_max_regens: number | null
          autopilot_min_runs: number | null
          created_at: string | null
          id: string
          project_id: string
          updated_at: string | null
        }
        Insert: {
          autopilot_confidence_threshold?: number | null
          autopilot_image_enabled?: boolean | null
          autopilot_max_regens?: number | null
          autopilot_min_runs?: number | null
          created_at?: string | null
          id?: string
          project_id: string
          updated_at?: string | null
        }
        Update: {
          autopilot_confidence_threshold?: number | null
          autopilot_image_enabled?: boolean | null
          autopilot_max_regens?: number | null
          autopilot_min_runs?: number | null
          created_at?: string | null
          id?: string
          project_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_bibles: {
        Row: {
          created_at: string
          facts: Json | null
          id: string
          period: string | null
          project_id: string
          rating: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          facts?: Json | null
          id?: string
          period?: string | null
          project_id: string
          rating?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          facts?: Json | null
          id?: string
          period?: string | null
          project_id?: string
          rating?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_locks: {
        Row: {
          created_at: string | null
          expires_at: string
          lock_reason: string | null
          locked_by: string
          project_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          lock_reason?: string | null
          locked_by: string
          project_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          lock_reason?: string | null
          locked_by?: string
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_locks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      project_outlines: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          density_targets: Json | null
          episode_count: number | null
          error_code: string | null
          error_detail: string | null
          format: string | null
          genre: string | null
          heartbeat_at: string | null
          id: string
          idea: string | null
          input_chars: number | null
          narrative_mode: string | null
          outline_json: Json
          outline_parts: Json | null
          progress: number | null
          project_id: string
          qc_issues: Json | null
          quality: string | null
          quality_tier: string | null
          stage: string | null
          status: string | null
          substage: string | null
          summary_text: string | null
          target_duration: number | null
          tone: string | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          density_targets?: Json | null
          episode_count?: number | null
          error_code?: string | null
          error_detail?: string | null
          format?: string | null
          genre?: string | null
          heartbeat_at?: string | null
          id?: string
          idea?: string | null
          input_chars?: number | null
          narrative_mode?: string | null
          outline_json: Json
          outline_parts?: Json | null
          progress?: number | null
          project_id: string
          qc_issues?: Json | null
          quality?: string | null
          quality_tier?: string | null
          stage?: string | null
          status?: string | null
          substage?: string | null
          summary_text?: string | null
          target_duration?: number | null
          tone?: string | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          density_targets?: Json | null
          episode_count?: number | null
          error_code?: string | null
          error_detail?: string | null
          format?: string | null
          genre?: string | null
          heartbeat_at?: string | null
          id?: string
          idea?: string | null
          input_chars?: number | null
          narrative_mode?: string | null
          outline_json?: Json
          outline_parts?: Json | null
          progress?: number | null
          project_id?: string
          qc_issues?: Json | null
          quality?: string | null
          quality_tier?: string | null
          stage?: string | null
          status?: string | null
          substage?: string | null
          summary_text?: string | null
          target_duration?: number | null
          tone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_outlines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_rule_overrides: {
        Row: {
          created_at: string
          disable_reason: string | null
          id: string
          is_active: boolean
          project_id: string
          rule_id: string
        }
        Insert: {
          created_at?: string
          disable_reason?: string | null
          id?: string
          is_active: boolean
          project_id: string
          rule_id: string
        }
        Update: {
          created_at?: string
          disable_reason?: string | null
          id?: string
          is_active?: boolean
          project_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_rule_overrides_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "editorial_rules_config"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_template_id: string | null
          active_template_step_index: number | null
          animation_type: string | null
          autopilot_enabled: boolean | null
          autopilot_max_runs_per_character: number | null
          bible_completeness_score: number | null
          budget_cap_episode_eur: number | null
          budget_cap_project_eur: number | null
          budget_cap_scene_eur: number | null
          created_at: string
          creative_mode: string | null
          engine_test_completed: boolean | null
          episodes_count: number
          format: Database["public"]["Enums"]["project_format"]
          format_profile: string | null
          genre: string | null
          global_visual_dna: Json | null
          id: string
          logline: string | null
          master_language: string
          narrative_framework: string | null
          owner_id: string
          preferred_engine: string | null
          style_pack: string | null
          target_duration_min: number
          target_languages: string[] | null
          title: string
          tone: string | null
          updated_at: string
          user_level: string | null
          visual_style: string | null
        }
        Insert: {
          active_template_id?: string | null
          active_template_step_index?: number | null
          animation_type?: string | null
          autopilot_enabled?: boolean | null
          autopilot_max_runs_per_character?: number | null
          bible_completeness_score?: number | null
          budget_cap_episode_eur?: number | null
          budget_cap_project_eur?: number | null
          budget_cap_scene_eur?: number | null
          created_at?: string
          creative_mode?: string | null
          engine_test_completed?: boolean | null
          episodes_count?: number
          format?: Database["public"]["Enums"]["project_format"]
          format_profile?: string | null
          genre?: string | null
          global_visual_dna?: Json | null
          id?: string
          logline?: string | null
          master_language?: string
          narrative_framework?: string | null
          owner_id: string
          preferred_engine?: string | null
          style_pack?: string | null
          target_duration_min?: number
          target_languages?: string[] | null
          title: string
          tone?: string | null
          updated_at?: string
          user_level?: string | null
          visual_style?: string | null
        }
        Update: {
          active_template_id?: string | null
          active_template_step_index?: number | null
          animation_type?: string | null
          autopilot_enabled?: boolean | null
          autopilot_max_runs_per_character?: number | null
          bible_completeness_score?: number | null
          budget_cap_episode_eur?: number | null
          budget_cap_project_eur?: number | null
          budget_cap_scene_eur?: number | null
          created_at?: string
          creative_mode?: string | null
          engine_test_completed?: boolean | null
          episodes_count?: number
          format?: Database["public"]["Enums"]["project_format"]
          format_profile?: string | null
          genre?: string | null
          global_visual_dna?: Json | null
          id?: string
          logline?: string | null
          master_language?: string
          narrative_framework?: string | null
          owner_id?: string
          preferred_engine?: string | null
          style_pack?: string | null
          target_duration_min?: number
          target_languages?: string[] | null
          title?: string
          tone?: string | null
          updated_at?: string
          user_level?: string | null
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_active_template_id_fkey"
            columns: ["active_template_id"]
            isOneToOne: false
            referencedRelation: "short_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_cache: {
        Row: {
          anchor_id: string | null
          cached_result_url: string
          created_at: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          prompt_hash: string
          quality_score: number | null
          slot_type: string
          usage_count: number | null
          visual_dna_hash: string | null
        }
        Insert: {
          anchor_id?: string | null
          cached_result_url: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          prompt_hash: string
          quality_score?: number | null
          slot_type: string
          usage_count?: number | null
          visual_dna_hash?: string | null
        }
        Update: {
          anchor_id?: string | null
          cached_result_url?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          prompt_hash?: string
          quality_score?: number | null
          slot_type?: string
          usage_count?: number | null
          visual_dna_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_cache_anchor_id_fkey"
            columns: ["anchor_id"]
            isOneToOne: false
            referencedRelation: "reference_anchors"
            referencedColumns: ["id"]
          },
        ]
      }
      props: {
        Row: {
          color_finish: string | null
          condition: string | null
          continuity_notes: string | null
          created_at: string
          description: string | null
          dimensions: string | null
          id: string
          interaction_rules: string | null
          materials: Json | null
          name: string
          placement_rules: string | null
          profile_json: Json | null
          project_id: string
          prop_type: string | null
          reference_urls: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          color_finish?: string | null
          condition?: string | null
          continuity_notes?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          interaction_rules?: string | null
          materials?: Json | null
          name: string
          placement_rules?: string | null
          profile_json?: Json | null
          project_id: string
          prop_type?: string | null
          reference_urls?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          color_finish?: string | null
          condition?: string | null
          continuity_notes?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          interaction_rules?: string | null
          materials?: Json | null
          name?: string
          placement_rules?: string | null
          profile_json?: Json | null
          project_id?: string
          prop_type?: string | null
          reference_urls?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "props_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      reference_anchors: {
        Row: {
          anchor_type: string
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          character_id: string
          created_at: string | null
          id: string
          image_url: string
          is_active: boolean | null
          last_used_at: string | null
          metadata: Json | null
          priority: number | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          anchor_type: string
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          character_id: string
          created_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          priority?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          anchor_type?: string
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          character_id?: string
          created_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          priority?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_anchors_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reference_anchors_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_scripts: {
        Row: {
          content: string
          created_at: string
          genre: string | null
          id: string
          is_global: boolean | null
          language: string | null
          notes: string | null
          project_id: string | null
          source_type: string
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          genre?: string | null
          id?: string
          is_global?: boolean | null
          language?: string | null
          notes?: string | null
          project_id?: string | null
          source_type?: string
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          genre?: string | null
          id?: string
          is_global?: boolean | null
          language?: string | null
          notes?: string | null
          project_id?: string | null
          source_type?: string
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      scene_camera_plan: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          blocking_diagrams: Json
          constraints: Json
          created_at: string
          generated_from_storyboard: boolean | null
          id: string
          plan_header: Json
          project_id: string
          scene_id: string
          shots_list: Json
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          blocking_diagrams?: Json
          constraints?: Json
          created_at?: string
          generated_from_storyboard?: boolean | null
          id?: string
          plan_header?: Json
          project_id: string
          scene_id: string
          shots_list?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          blocking_diagrams?: Json
          constraints?: Json
          created_at?: string
          generated_from_storyboard?: boolean | null
          id?: string
          plan_header?: Json
          project_id?: string
          scene_id?: string
          shots_list?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scene_camera_plan_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_camera_plan_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_intent: {
        Row: {
          allowed_camera_language: Json | null
          characters_involved: Json | null
          constraints: Json | null
          continuity_constraints: Json | null
          created_at: string | null
          emotional_turn: string | null
          episode_number: number | null
          forbidden_repetitions: Json | null
          id: string
          information_hidden: Json | null
          information_revealed: Json | null
          intent_summary: string
          job_id: string | null
          narrative_state_id: string | null
          project_id: string
          scene_id: string | null
          scene_number: number
          showrunner_decision_id: string | null
          showrunner_notes: string | null
          showrunner_validated: boolean | null
          status: string | null
          thread_to_advance: string | null
          updated_at: string | null
          visual_energy: string | null
        }
        Insert: {
          allowed_camera_language?: Json | null
          characters_involved?: Json | null
          constraints?: Json | null
          continuity_constraints?: Json | null
          created_at?: string | null
          emotional_turn?: string | null
          episode_number?: number | null
          forbidden_repetitions?: Json | null
          id?: string
          information_hidden?: Json | null
          information_revealed?: Json | null
          intent_summary: string
          job_id?: string | null
          narrative_state_id?: string | null
          project_id: string
          scene_id?: string | null
          scene_number: number
          showrunner_decision_id?: string | null
          showrunner_notes?: string | null
          showrunner_validated?: boolean | null
          status?: string | null
          thread_to_advance?: string | null
          updated_at?: string | null
          visual_energy?: string | null
        }
        Update: {
          allowed_camera_language?: Json | null
          characters_involved?: Json | null
          constraints?: Json | null
          continuity_constraints?: Json | null
          created_at?: string | null
          emotional_turn?: string | null
          episode_number?: number | null
          forbidden_repetitions?: Json | null
          id?: string
          information_hidden?: Json | null
          information_revealed?: Json | null
          intent_summary?: string
          job_id?: string | null
          narrative_state_id?: string | null
          project_id?: string
          scene_id?: string | null
          scene_number?: number
          showrunner_decision_id?: string | null
          showrunner_notes?: string | null
          showrunner_validated?: boolean | null
          status?: string | null
          thread_to_advance?: string | null
          updated_at?: string | null
          visual_energy?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_intent_narrative_state_id_fkey"
            columns: ["narrative_state_id"]
            isOneToOne: false
            referencedRelation: "narrative_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_intent_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_intent_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_intent_showrunner_decision_id_fkey"
            columns: ["showrunner_decision_id"]
            isOneToOne: false
            referencedRelation: "showrunner_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_repairs: {
        Row: {
          attempts: number | null
          created_at: string | null
          episode_number: number | null
          failed_checks: Json | null
          id: string
          issues: Json
          max_attempts: number | null
          project_id: string
          repair_log: Json | null
          repaired_scene_id: string | null
          scene_id: string | null
          scene_intent_id: string | null
          scene_number: number | null
          status: string | null
          strategy: string | null
          updated_at: string | null
          validation_score: number | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          episode_number?: number | null
          failed_checks?: Json | null
          id?: string
          issues?: Json
          max_attempts?: number | null
          project_id: string
          repair_log?: Json | null
          repaired_scene_id?: string | null
          scene_id?: string | null
          scene_intent_id?: string | null
          scene_number?: number | null
          status?: string | null
          strategy?: string | null
          updated_at?: string | null
          validation_score?: number | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          episode_number?: number | null
          failed_checks?: Json | null
          id?: string
          issues?: Json
          max_attempts?: number | null
          project_id?: string
          repair_log?: Json | null
          repaired_scene_id?: string | null
          scene_id?: string | null
          scene_intent_id?: string | null
          scene_number?: number | null
          status?: string | null
          strategy?: string | null
          updated_at?: string | null
          validation_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_repairs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_repairs_repaired_scene_id_fkey"
            columns: ["repaired_scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_repairs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_repairs_scene_intent_id_fkey"
            columns: ["scene_intent_id"]
            isOneToOne: false
            referencedRelation: "scene_intent"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_technical_docs: {
        Row: {
          cameras: Json | null
          continuity_lock: Json | null
          created_at: string | null
          edit_plan: Json | null
          id: string
          project_id: string
          scene_id: string
          status: string | null
          updated_at: string | null
          version: number | null
          visual_style: Json | null
        }
        Insert: {
          cameras?: Json | null
          continuity_lock?: Json | null
          created_at?: string | null
          edit_plan?: Json | null
          id?: string
          project_id: string
          scene_id: string
          status?: string | null
          updated_at?: string | null
          version?: number | null
          visual_style?: Json | null
        }
        Update: {
          cameras?: Json | null
          continuity_lock?: Json | null
          created_at?: string | null
          edit_plan?: Json | null
          id?: string
          project_id?: string
          scene_id?: string
          status?: string | null
          updated_at?: string | null
          version?: number | null
          visual_style?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_technical_docs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_technical_docs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: true
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          approved: boolean | null
          assigned_role: Database["public"]["Enums"]["app_role"] | null
          audio_cues: string[] | null
          beats: Json | null
          character_ids: string[] | null
          characters_present: string[] | null
          confidence_score: number | null
          created_at: string
          episode_no: number
          estimated_cost: Json | null
          forensic_metadata: Json | null
          id: string
          location_id: string | null
          max_attempts_override: number | null
          metadata: Json | null
          micro_shot_duration: number | null
          mood: Json | null
          objective: string | null
          override_mode: string | null
          padding_override: number | null
          parse_confidence: number | null
          parsed_json: Json | null
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string
          quality_mode: Database["public"]["Enums"]["quality_mode"]
          retry_override: number | null
          scene_no: number
          scene_number: number | null
          script_id: string | null
          slugline: string
          standardized_location: string | null
          standardized_time: string | null
          style_profile: string | null
          summary: string | null
          technical_metadata: Json | null
          technical_notes: string | null
          time_of_day: string | null
          updated_at: string
          validation_score: number | null
          validation_status: string | null
          visual_fx_cues: string[] | null
          visual_style: string | null
          visual_style_source: string | null
        }
        Insert: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          audio_cues?: string[] | null
          beats?: Json | null
          character_ids?: string[] | null
          characters_present?: string[] | null
          confidence_score?: number | null
          created_at?: string
          episode_no?: number
          estimated_cost?: Json | null
          forensic_metadata?: Json | null
          id?: string
          location_id?: string | null
          max_attempts_override?: number | null
          metadata?: Json | null
          micro_shot_duration?: number | null
          mood?: Json | null
          objective?: string | null
          override_mode?: string | null
          padding_override?: number | null
          parse_confidence?: number | null
          parsed_json?: Json | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id: string
          quality_mode?: Database["public"]["Enums"]["quality_mode"]
          retry_override?: number | null
          scene_no: number
          scene_number?: number | null
          script_id?: string | null
          slugline: string
          standardized_location?: string | null
          standardized_time?: string | null
          style_profile?: string | null
          summary?: string | null
          technical_metadata?: Json | null
          technical_notes?: string | null
          time_of_day?: string | null
          updated_at?: string
          validation_score?: number | null
          validation_status?: string | null
          visual_fx_cues?: string[] | null
          visual_style?: string | null
          visual_style_source?: string | null
        }
        Update: {
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          audio_cues?: string[] | null
          beats?: Json | null
          character_ids?: string[] | null
          characters_present?: string[] | null
          confidence_score?: number | null
          created_at?: string
          episode_no?: number
          estimated_cost?: Json | null
          forensic_metadata?: Json | null
          id?: string
          location_id?: string | null
          max_attempts_override?: number | null
          metadata?: Json | null
          micro_shot_duration?: number | null
          mood?: Json | null
          objective?: string | null
          override_mode?: string | null
          padding_override?: number | null
          parse_confidence?: number | null
          parsed_json?: Json | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string
          quality_mode?: Database["public"]["Enums"]["quality_mode"]
          retry_override?: number | null
          scene_no?: number
          scene_number?: number | null
          script_id?: string | null
          slugline?: string
          standardized_location?: string | null
          standardized_time?: string | null
          style_profile?: string | null
          summary?: string | null
          technical_metadata?: Json | null
          technical_notes?: string | null
          time_of_day?: string | null
          updated_at?: string
          validation_score?: number | null
          validation_status?: string | null
          visual_fx_cues?: string[] | null
          visual_style?: string | null
          visual_style_source?: string | null
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
      script_breakdowns: {
        Row: {
          breakdown_data: Json | null
          continuity_risks: Json | null
          created_at: string
          entities_detected: Json | null
          id: string
          project_id: string
          scenes_detected: Json | null
          script_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          breakdown_data?: Json | null
          continuity_risks?: Json | null
          created_at?: string
          entities_detected?: Json | null
          id?: string
          project_id: string
          scenes_detected?: Json | null
          script_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          breakdown_data?: Json | null
          continuity_risks?: Json | null
          created_at?: string
          entities_detected?: Json | null
          id?: string
          project_id?: string
          scenes_detected?: Json | null
          script_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_breakdowns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_breakdowns_script_id_fkey"
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
          episode_number: number | null
          file_url: string | null
          id: string
          meta: Json | null
          parsed_json: Json | null
          project_id: string
          raw_text: string | null
          script_run_id: string | null
          script_type: string | null
          status: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string
          episode_number?: number | null
          file_url?: string | null
          id?: string
          meta?: Json | null
          parsed_json?: Json | null
          project_id: string
          raw_text?: string | null
          script_run_id?: string | null
          script_type?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string
          episode_number?: number | null
          file_url?: string | null
          id?: string
          meta?: Json | null
          parsed_json?: Json | null
          project_id?: string
          raw_text?: string | null
          script_run_id?: string | null
          script_type?: string | null
          status?: string | null
          updated_at?: string | null
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
      series_bibles: {
        Row: {
          antagonism: Json | null
          artifact_rules: Json | null
          character_arcs: Json | null
          created_at: string | null
          created_by: string | null
          episode_template: Json | null
          generation_model: string | null
          id: string
          logline: string | null
          premise: string | null
          project_id: string
          season_structure: Json | null
          source_script_id: string | null
          status: string | null
          tone_guidelines: Json | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          antagonism?: Json | null
          artifact_rules?: Json | null
          character_arcs?: Json | null
          created_at?: string | null
          created_by?: string | null
          episode_template?: Json | null
          generation_model?: string | null
          id?: string
          logline?: string | null
          premise?: string | null
          project_id: string
          season_structure?: Json | null
          source_script_id?: string | null
          status?: string | null
          tone_guidelines?: Json | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          antagonism?: Json | null
          artifact_rules?: Json | null
          character_arcs?: Json | null
          created_at?: string | null
          created_by?: string | null
          episode_template?: Json | null
          generation_model?: string | null
          id?: string
          logline?: string | null
          premise?: string | null
          project_id?: string
          season_structure?: Json | null
          source_script_id?: string | null
          status?: string | null
          tone_guidelines?: Json | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "series_bibles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_bibles_source_script_id_fkey"
            columns: ["source_script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      short_templates: {
        Row: {
          created_at: string | null
          description: string | null
          duration_range: string | null
          id: string
          name: string
          pacing: string | null
          recommended_shots: Json | null
          steps: Json
          style_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_range?: string | null
          id?: string
          name: string
          pacing?: string | null
          recommended_shots?: Json | null
          steps?: Json
          style_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_range?: string | null
          id?: string
          name?: string
          pacing?: string | null
          recommended_shots?: Json | null
          steps?: Json
          style_id?: string
        }
        Relationships: []
      }
      shots: {
        Row: {
          ai_risk: Json | null
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          approved: boolean | null
          assigned_role: Database["public"]["Enums"]["app_role"] | null
          audio_layer_id: string | null
          blocking: Json | null
          blocking_timestamps: Json | null
          camera: Json | null
          camera_path: Json | null
          camera_position: Json | null
          camera_rotation: Json | null
          constraints: Json | null
          continuity_anchor_image_url: string | null
          continuity_lock: Json | null
          continuity_notes: string | null
          coverage_type: string | null
          created_at: string
          dialogue_text: string | null
          duration_target: number | null
          edit_intent: Json | null
          effective_mode: Database["public"]["Enums"]["quality_mode"]
          engine: string | null
          estimated_cost: Json | null
          fields_json: Json | null
          focus_config: Json | null
          frame_config: Json | null
          hero: boolean | null
          id: string
          inherit_technical: boolean | null
          keyframe_hints: Json | null
          lighting: Json | null
          name: string | null
          output_video_url: string | null
          prompt_json: Json | null
          provider_preference: string | null
          render_status: string | null
          scene_id: string
          shot_no: number
          shot_type: string
          sound_plan: Json | null
          story_purpose: string | null
          storyboard_panel_id: string | null
          style_lock: Json | null
          technical_overrides: Json | null
          technical_shot_idx: number | null
          timing_config: Json | null
          transition_in: string | null
          transition_out: string | null
          updated_at: string
          validation_status: string | null
        }
        Insert: {
          ai_risk?: Json | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          audio_layer_id?: string | null
          blocking?: Json | null
          blocking_timestamps?: Json | null
          camera?: Json | null
          camera_path?: Json | null
          camera_position?: Json | null
          camera_rotation?: Json | null
          constraints?: Json | null
          continuity_anchor_image_url?: string | null
          continuity_lock?: Json | null
          continuity_notes?: string | null
          coverage_type?: string | null
          created_at?: string
          dialogue_text?: string | null
          duration_target?: number | null
          edit_intent?: Json | null
          effective_mode?: Database["public"]["Enums"]["quality_mode"]
          engine?: string | null
          estimated_cost?: Json | null
          fields_json?: Json | null
          focus_config?: Json | null
          frame_config?: Json | null
          hero?: boolean | null
          id?: string
          inherit_technical?: boolean | null
          keyframe_hints?: Json | null
          lighting?: Json | null
          name?: string | null
          output_video_url?: string | null
          prompt_json?: Json | null
          provider_preference?: string | null
          render_status?: string | null
          scene_id: string
          shot_no: number
          shot_type?: string
          sound_plan?: Json | null
          story_purpose?: string | null
          storyboard_panel_id?: string | null
          style_lock?: Json | null
          technical_overrides?: Json | null
          technical_shot_idx?: number | null
          timing_config?: Json | null
          transition_in?: string | null
          transition_out?: string | null
          updated_at?: string
          validation_status?: string | null
        }
        Update: {
          ai_risk?: Json | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved?: boolean | null
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          audio_layer_id?: string | null
          blocking?: Json | null
          blocking_timestamps?: Json | null
          camera?: Json | null
          camera_path?: Json | null
          camera_position?: Json | null
          camera_rotation?: Json | null
          constraints?: Json | null
          continuity_anchor_image_url?: string | null
          continuity_lock?: Json | null
          continuity_notes?: string | null
          coverage_type?: string | null
          created_at?: string
          dialogue_text?: string | null
          duration_target?: number | null
          edit_intent?: Json | null
          effective_mode?: Database["public"]["Enums"]["quality_mode"]
          engine?: string | null
          estimated_cost?: Json | null
          fields_json?: Json | null
          focus_config?: Json | null
          frame_config?: Json | null
          hero?: boolean | null
          id?: string
          inherit_technical?: boolean | null
          keyframe_hints?: Json | null
          lighting?: Json | null
          name?: string | null
          output_video_url?: string | null
          prompt_json?: Json | null
          provider_preference?: string | null
          render_status?: string | null
          scene_id?: string
          shot_no?: number
          shot_type?: string
          sound_plan?: Json | null
          story_purpose?: string | null
          storyboard_panel_id?: string | null
          style_lock?: Json | null
          technical_overrides?: Json | null
          technical_shot_idx?: number | null
          timing_config?: Json | null
          transition_in?: string | null
          transition_out?: string | null
          updated_at?: string
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_audio_layer_id_fkey"
            columns: ["audio_layer_id"]
            isOneToOne: false
            referencedRelation: "audio_layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_storyboard_panel_id_fkey"
            columns: ["storyboard_panel_id"]
            isOneToOne: false
            referencedRelation: "storyboard_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      showrunner_decisions: {
        Row: {
          camera_language_allowed: Json | null
          confidence_score: number | null
          created_at: string | null
          id: string
          lens_range_allowed: string[] | null
          mode: string | null
          model_used: string | null
          movement_allowed: string[] | null
          pacing_guidance: string | null
          project_id: string
          reasoning: string | null
          scene_id: string
          shot_types_allowed: string[] | null
          updated_at: string | null
          validated: boolean | null
          validated_at: string | null
          validated_by: string | null
          visual_energy: string | null
          visual_strategy: string | null
          what_cannot_repeat: string | null
          what_must_change: string | null
          where_we_came_from: string | null
        }
        Insert: {
          camera_language_allowed?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          lens_range_allowed?: string[] | null
          mode?: string | null
          model_used?: string | null
          movement_allowed?: string[] | null
          pacing_guidance?: string | null
          project_id: string
          reasoning?: string | null
          scene_id: string
          shot_types_allowed?: string[] | null
          updated_at?: string | null
          validated?: boolean | null
          validated_at?: string | null
          validated_by?: string | null
          visual_energy?: string | null
          visual_strategy?: string | null
          what_cannot_repeat?: string | null
          what_must_change?: string | null
          where_we_came_from?: string | null
        }
        Update: {
          camera_language_allowed?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          lens_range_allowed?: string[] | null
          mode?: string | null
          model_used?: string | null
          movement_allowed?: string[] | null
          pacing_guidance?: string | null
          project_id?: string
          reasoning?: string | null
          scene_id?: string
          shot_types_allowed?: string[] | null
          updated_at?: string | null
          validated?: boolean | null
          validated_at?: string | null
          validated_by?: string | null
          visual_energy?: string | null
          visual_strategy?: string | null
          what_cannot_repeat?: string | null
          what_must_change?: string | null
          where_we_came_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "showrunner_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showrunner_decisions_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: true
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showrunner_decisions_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sound_music: {
        Row: {
          bpm: number | null
          category: string | null
          character_id: string | null
          created_at: string
          description: string | null
          id: string
          key_signature: string | null
          layers: Json | null
          location_id: string | null
          mix_notes: string | null
          mood: string | null
          name: string
          project_id: string
          reference_urls: Json | null
          sound_type: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          bpm?: number | null
          category?: string | null
          character_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key_signature?: string | null
          layers?: Json | null
          location_id?: string | null
          mix_notes?: string | null
          mood?: string | null
          name: string
          project_id: string
          reference_urls?: Json | null
          sound_type?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          bpm?: number | null
          category?: string | null
          character_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key_signature?: string | null
          layers?: Json | null
          location_id?: string | null
          mix_notes?: string | null
          mood?: string | null
          name?: string
          project_id?: string
          reference_urls?: Json | null
          sound_type?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sound_music_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sound_music_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sound_music_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_panels: {
        Row: {
          action_beat_ref: string | null
          approved: boolean | null
          characters_present: string[] | null
          continuity: Json | null
          created_at: string | null
          dialogue_snippet: string | null
          failure_reason: string | null
          generation_mode: string | null
          generation_started_at: string | null
          generation_timeout_seconds: number | null
          id: string
          identity_fix_attempts: number | null
          identity_fix_status: string | null
          identity_qc: Json | null
          image_error: string | null
          image_prompt: string | null
          image_status: string | null
          image_url: string | null
          last_character_refs: Json | null
          last_prompt: string | null
          last_style_preset_id: string | null
          location_id: string | null
          notes: string | null
          panel_code: string | null
          panel_intent: string | null
          panel_no: number
          pipeline_phase: string | null
          project_id: string
          props_present: string[] | null
          recovery_data: Json | null
          regen_count: number | null
          scene_id: string
          shot_hint: string | null
          staging: Json | null
          staging_image_url: string | null
          staging_status: string | null
          style_qc: Json | null
          style_regen_count: number | null
          updated_at: string | null
        }
        Insert: {
          action_beat_ref?: string | null
          approved?: boolean | null
          characters_present?: string[] | null
          continuity?: Json | null
          created_at?: string | null
          dialogue_snippet?: string | null
          failure_reason?: string | null
          generation_mode?: string | null
          generation_started_at?: string | null
          generation_timeout_seconds?: number | null
          id?: string
          identity_fix_attempts?: number | null
          identity_fix_status?: string | null
          identity_qc?: Json | null
          image_error?: string | null
          image_prompt?: string | null
          image_status?: string | null
          image_url?: string | null
          last_character_refs?: Json | null
          last_prompt?: string | null
          last_style_preset_id?: string | null
          location_id?: string | null
          notes?: string | null
          panel_code?: string | null
          panel_intent?: string | null
          panel_no: number
          pipeline_phase?: string | null
          project_id: string
          props_present?: string[] | null
          recovery_data?: Json | null
          regen_count?: number | null
          scene_id: string
          shot_hint?: string | null
          staging?: Json | null
          staging_image_url?: string | null
          staging_status?: string | null
          style_qc?: Json | null
          style_regen_count?: number | null
          updated_at?: string | null
        }
        Update: {
          action_beat_ref?: string | null
          approved?: boolean | null
          characters_present?: string[] | null
          continuity?: Json | null
          created_at?: string | null
          dialogue_snippet?: string | null
          failure_reason?: string | null
          generation_mode?: string | null
          generation_started_at?: string | null
          generation_timeout_seconds?: number | null
          id?: string
          identity_fix_attempts?: number | null
          identity_fix_status?: string | null
          identity_qc?: Json | null
          image_error?: string | null
          image_prompt?: string | null
          image_status?: string | null
          image_url?: string | null
          last_character_refs?: Json | null
          last_prompt?: string | null
          last_style_preset_id?: string | null
          location_id?: string | null
          notes?: string | null
          panel_code?: string | null
          panel_intent?: string | null
          panel_no?: number
          pipeline_phase?: string | null
          project_id?: string
          props_present?: string[] | null
          recovery_data?: Json | null
          regen_count?: number | null
          scene_id?: string
          shot_hint?: string | null
          staging?: Json | null
          staging_image_url?: string | null
          staging_status?: string | null
          style_qc?: Json | null
          style_regen_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_panels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_panels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_panels_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboards: {
        Row: {
          created_at: string
          id: string
          project_id: string
          scene_id: string
          status: string
          style_id: string
          style_preset_id: string | null
          style_preset_lock: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          scene_id: string
          status?: string
          style_id?: string
          style_preset_id?: string | null
          style_preset_lock?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          scene_id?: string
          status?: string
          style_id?: string
          style_preset_id?: string | null
          style_preset_lock?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "storyboards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboards_scene_id_fkey"
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
          camera_system: string | null
          canvas_format: Json | null
          color_palette: Json | null
          created_at: string
          description: string | null
          forbidden_rules: Json | null
          fps: number | null
          grain_level: string | null
          id: string
          lens_style: string | null
          lighting_rules: Json | null
          locked: boolean | null
          project_id: string
          realism_level: string | null
          reference_urls: Json | null
          style_config: Json | null
          token: string | null
          tone: string | null
          updated_at: string
          visual_preset: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          camera_system?: string | null
          canvas_format?: Json | null
          color_palette?: Json | null
          created_at?: string
          description?: string | null
          forbidden_rules?: Json | null
          fps?: number | null
          grain_level?: string | null
          id?: string
          lens_style?: string | null
          lighting_rules?: Json | null
          locked?: boolean | null
          project_id: string
          realism_level?: string | null
          reference_urls?: Json | null
          style_config?: Json | null
          token?: string | null
          tone?: string | null
          updated_at?: string
          visual_preset?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          camera_system?: string | null
          canvas_format?: Json | null
          color_palette?: Json | null
          created_at?: string
          description?: string | null
          forbidden_rules?: Json | null
          fps?: number | null
          grain_level?: string | null
          id?: string
          lens_style?: string | null
          lighting_rules?: Json | null
          locked?: boolean | null
          project_id?: string
          realism_level?: string | null
          reference_urls?: Json | null
          style_config?: Json | null
          token?: string | null
          tone?: string | null
          updated_at?: string
          visual_preset?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "style_packs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      style_presets: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          preset_data: Json
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          preset_data?: Json
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          preset_data?: Json
          usage_count?: number | null
        }
        Relationships: []
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
      telemetry_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["telemetry_event_type"]
          id: string
          payload: Json | null
          project_id: string
          run_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["telemetry_event_type"]
          id?: string
          payload?: Json | null
          project_id: string
          run_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["telemetry_event_type"]
          id?: string
          payload?: Json | null
          project_id?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_budgets: {
        Row: {
          alert_threshold_percent: number | null
          created_at: string | null
          daily_limit_usd: number | null
          id: string
          monthly_limit_usd: number | null
          pause_on_exceed: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_threshold_percent?: number | null
          created_at?: string | null
          daily_limit_usd?: number | null
          id?: string
          monthly_limit_usd?: number | null
          pause_on_exceed?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_threshold_percent?: number | null
          created_at?: string | null
          daily_limit_usd?: number | null
          id?: string
          monthly_limit_usd?: number | null
          pause_on_exceed?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      user_usage: {
        Row: {
          created_at: string | null
          generations_cost_usd: number | null
          generations_count: number | null
          id: string
          month: string
          storage_bytes: number | null
          storage_cost_usd: number | null
          total_cost_usd: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          generations_cost_usd?: number | null
          generations_count?: number | null
          id?: string
          month: string
          storage_bytes?: number | null
          storage_cost_usd?: number | null
          total_cost_usd?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          generations_cost_usd?: number | null
          generations_count?: number | null
          id?: string
          month?: string
          storage_bytes?: number | null
          storage_cost_usd?: number | null
          total_cost_usd?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      visual_context_memory: {
        Row: {
          average_shot_duration_sec: number | null
          camera_height_tendency: string | null
          computed_at: string | null
          coverage_style: string | null
          created_at: string | null
          dominant_lenses: Json | null
          dominant_movements: Json | null
          dominant_shot_types: Json | null
          emotional_delta: string | null
          emotional_end: string | null
          emotional_start: string | null
          episode_number: number
          forbidden_next: Json | null
          id: string
          pacing_level: string | null
          project_id: string
          recommended_next: Json | null
          scene_id: string
          scene_number: number
          shot_count: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          average_shot_duration_sec?: number | null
          camera_height_tendency?: string | null
          computed_at?: string | null
          coverage_style?: string | null
          created_at?: string | null
          dominant_lenses?: Json | null
          dominant_movements?: Json | null
          dominant_shot_types?: Json | null
          emotional_delta?: string | null
          emotional_end?: string | null
          emotional_start?: string | null
          episode_number?: number
          forbidden_next?: Json | null
          id?: string
          pacing_level?: string | null
          project_id: string
          recommended_next?: Json | null
          scene_id: string
          scene_number: number
          shot_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          average_shot_duration_sec?: number | null
          camera_height_tendency?: string | null
          computed_at?: string | null
          coverage_style?: string | null
          created_at?: string | null
          dominant_lenses?: Json | null
          dominant_movements?: Json | null
          dominant_shot_types?: Json | null
          emotional_delta?: string | null
          emotional_end?: string | null
          emotional_start?: string | null
          episode_number?: number
          forbidden_next?: Json | null
          id?: string
          pacing_level?: string | null
          project_id?: string
          recommended_next?: Json | null
          scene_id?: string
          scene_number?: number
          shot_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_context_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_context_memory_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: true
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      wardrobe: {
        Row: {
          accessories: Json | null
          character_id: string | null
          color_palette: Json | null
          condition: string | null
          continuity_notes: string | null
          created_at: string
          description: string | null
          fabric_materials: Json | null
          id: string
          name: string
          outfit_type: string | null
          project_id: string
          reference_urls: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          accessories?: Json | null
          character_id?: string | null
          color_palette?: Json | null
          condition?: string | null
          continuity_notes?: string | null
          created_at?: string
          description?: string | null
          fabric_materials?: Json | null
          id?: string
          name: string
          outfit_type?: string | null
          project_id: string
          reference_urls?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          accessories?: Json | null
          character_id?: string | null
          color_palette?: Json | null
          condition?: string | null
          continuity_notes?: string | null
          created_at?: string
          description?: string | null
          fabric_materials?: Json | null
          id?: string
          name?: string
          outfit_type?: string | null
          project_id?: string
          reference_urls?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wardrobe_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_project_lock:
        | {
            Args: {
              p_duration_seconds?: number
              p_project_id: string
              p_reason: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_duration_seconds?: number
              p_project_id: string
              p_reason: string
              p_user_id: string
            }
            Returns: boolean
          }
      calculate_pack_completeness: {
        Args: { p_character_id: string }
        Returns: number
      }
      can_shot_render: {
        Args: { shot_uuid: string }
        Returns: {
          blockers: Json
          can_render: boolean
        }[]
      }
      can_user_generate: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          limit_today: number
          reason: string
          usage_today: number
        }[]
      }
      chain_microshot_keyframes: {
        Args: { p_shot_id: string }
        Returns: undefined
      }
      check_rate_limit: {
        Args: {
          p_function_name: string
          p_max_per_minute?: number
          p_project_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      clean_expired_cache: { Args: never; Returns: number }
      cleanup_expired_locks: { Args: never; Returns: number }
      cleanup_old_background_tasks: { Args: never; Returns: undefined }
      cleanup_rate_limits: { Args: never; Returns: number }
      create_visual_dna_version: {
        Args: { char_id: string; modifications: Json; new_version_name: string }
        Returns: string
      }
      get_active_anchors: {
        Args: { anchor_types?: string[]; char_id: string }
        Returns: {
          anchor_id: string
          anchor_type: string
          image_url: string
          priority: number
          usage_count: number
        }[]
      }
      get_active_visual_dna: { Args: { char_id: string }; Returns: Json }
      get_cached_generation: {
        Args: {
          p_anchor_id?: string
          p_prompt_hash: string
          p_visual_dna_hash?: string
        }
        Returns: {
          cached_url: string
          quality: number
        }[]
      }
      get_canon_pack: {
        Args: { p_episode_number?: number; p_project_id: string }
        Returns: Json
      }
      get_last_continuity_summary: {
        Args: { p_episode_number?: number; p_project_id: string }
        Returns: Json
      }
      get_primary_identity_anchor: {
        Args: { char_id: string }
        Returns: {
          anchor_id: string
          anchor_type: string
          image_url: string
          priority: number
        }[]
      }
      get_resumable_outline: {
        Args: { p_project_id: string }
        Returns: {
          attempts: number
          id: string
          input_chars: number
          progress: number
          stage: string
          summary_text: string
        }[]
      }
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
      increment_drift_warning: { Args: { p_block_id: string }; Returns: number }
      increment_user_usage: {
        Args: { p_cost: number; p_month: string; p_user_id: string }
        Returns: undefined
      }
      mark_stuck_outlines_timeout: {
        Args: { p_minutes?: number }
        Returns: number
      }
      recalc_character_pack: {
        Args: { p_character_id: string }
        Returns: undefined
      }
      record_anchor_usage: { Args: { p_anchor_id: string }; Returns: undefined }
      release_project_lock:
        | { Args: { p_project_id: string }; Returns: undefined }
        | {
            Args: { p_project_id: string; p_user_id: string }
            Returns: undefined
          }
      reset_failed_blocks: {
        Args: { p_block_type?: string; p_project_id: string }
        Returns: number
      }
      save_to_cache: {
        Args: {
          p_anchor_id: string
          p_prompt_hash: string
          p_quality_score: number
          p_result_url: string
          p_slot_type: string
          p_visual_dna_hash: string
        }
        Returns: undefined
      }
      subdivide_shot_into_microshots: {
        Args: { p_micro_duration?: number; p_shot_id: string }
        Returns: {
          action_beat: string | null
          camera_beat: string | null
          created_at: string
          duration_sec: number | null
          end_frame_image_url: string | null
          end_sec: number
          generation_run_id: string | null
          id: string
          keyframe_final_id: string | null
          keyframe_initial_id: string | null
          keyframe_pipeline_status: string | null
          motion_notes: string | null
          negative_prompt: string | null
          project_id: string
          prompt_text: string | null
          qc_issues: Json | null
          quality_score: number | null
          seed: number | null
          sequence_no: number
          shot_id: string
          start_sec: number
          updated_at: string
          video_engine: string | null
          video_status: string | null
          video_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "micro_shots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      validate_audio_layers: { Args: { layer_id: string }; Returns: boolean }
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
      character_role: "protagonist" | "recurring" | "episodic" | "extra"
      dailies_decision: "SELECT" | "FIX" | "REJECT" | "NONE"
      editorial_action_on_fail:
        | "reject_regenerate"
        | "reject_explain"
        | "warn"
        | "suggest"
      editorial_project_phase: "exploracion" | "produccion"
      editorial_rule_severity: "1" | "2" | "3" | "4" | "5"
      editorial_rule_type: "A" | "B" | "D"
      editorial_validation_method:
        | "prompt_check"
        | "output_text_check"
        | "output_vision_check"
        | "bible_contradiction_check"
        | "none"
      generation_verdict: "approved" | "warn" | "regenerate"
      job_status: "queued" | "running" | "succeeded" | "failed" | "blocked"
      priority_level: "P0" | "P1" | "P2"
      project_format: "series" | "mini" | "film"
      quality_mode: "CINE" | "ULTRA"
      telemetry_event_type: "accept" | "reject" | "regenerate" | "edit"
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
      character_role: ["protagonist", "recurring", "episodic", "extra"],
      dailies_decision: ["SELECT", "FIX", "REJECT", "NONE"],
      editorial_action_on_fail: [
        "reject_regenerate",
        "reject_explain",
        "warn",
        "suggest",
      ],
      editorial_project_phase: ["exploracion", "produccion"],
      editorial_rule_severity: ["1", "2", "3", "4", "5"],
      editorial_rule_type: ["A", "B", "D"],
      editorial_validation_method: [
        "prompt_check",
        "output_text_check",
        "output_vision_check",
        "bible_contradiction_check",
        "none",
      ],
      generation_verdict: ["approved", "warn", "regenerate"],
      job_status: ["queued", "running", "succeeded", "failed", "blocked"],
      priority_level: ["P0", "P1", "P2"],
      project_format: ["series", "mini", "film"],
      quality_mode: ["CINE", "ULTRA"],
      telemetry_event_type: ["accept", "reject", "regenerate", "edit"],
    },
  },
} as const
