-- =====================================================
-- FASE 1: LIMPIEZA DE TABLAS NO UTILIZADAS (CORREGIDA)
-- Optimización de base de datos - Eliminar tablas vacías/abandonadas
-- =====================================================

-- Limpiar funciones huérfanas primero (sin dependencia de tablas)
DROP FUNCTION IF EXISTS update_shot_transitions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS ensure_single_default_outfit() CASCADE;

-- Sistema Forge (chat IA abandonado - 0 registros)
DROP TABLE IF EXISTS forge_actions CASCADE;
DROP TABLE IF EXISTS forge_messages CASCADE;
DROP TABLE IF EXISTS forge_conversations CASCADE;
DROP TABLE IF EXISTS forge_user_preferences CASCADE;

-- Sistema CPE (obsoleto - reemplazado por scenes/shots)
DROP TABLE IF EXISTS cpe_scenes CASCADE;
DROP TABLE IF EXISTS cpe_canon_elements CASCADE;
DROP TABLE IF EXISTS cpe_feed_blocks CASCADE;

-- Sistema Editorial paralelo (no integrado con core)
DROP TABLE IF EXISTS asset_characters CASCADE;
DROP TABLE IF EXISTS asset_locations CASCADE;
DROP TABLE IF EXISTS editorial_projects CASCADE;
DROP TABLE IF EXISTS editorial_events CASCADE;
DROP TABLE IF EXISTS editorial_decisions_log CASCADE;
DROP TABLE IF EXISTS editorial_source_central CASCADE;
DROP TABLE IF EXISTS editorial_source_engines CASCADE;

-- Tablas de continuity duplicadas/vacías
DROP TABLE IF EXISTS continuity_anchors_enhanced CASCADE;
DROP TABLE IF EXISTS continuity_anchors CASCADE;
DROP TABLE IF EXISTS continuity_events CASCADE;
DROP TABLE IF EXISTS continuity_violations CASCADE;

-- Tablas de personajes vacías/no usadas
DROP TABLE IF EXISTS character_reference_anchors CASCADE;
DROP TABLE IF EXISTS character_narrative CASCADE;
DROP TABLE IF EXISTS character_outfits CASCADE;

-- Sistema de entidades genérico abandonado
DROP TABLE IF EXISTS entity_refs CASCADE;
DROP TABLE IF EXISTS entity_versions CASCADE;

-- Sistema de dailies no implementado
DROP TABLE IF EXISTS frame_notes CASCADE;
DROP TABLE IF EXISTS dailies_items CASCADE;
DROP TABLE IF EXISTS dailies_sessions CASCADE;

-- Testing y batches obsoletos
DROP TABLE IF EXISTS engine_tests CASCADE;
DROP TABLE IF EXISTS batch_runs CASCADE;
DROP TABLE IF EXISTS batch_run_items CASCADE;

-- Historial y jobs duplicados
DROP TABLE IF EXISTS generation_history CASCADE;
DROP TABLE IF EXISTS generation_jobs CASCADE;

-- Features no implementadas
DROP TABLE IF EXISTS likeness_comparisons CASCADE;
DROP TABLE IF EXISTS llm_failures CASCADE;
DROP TABLE IF EXISTS pre_render_validations CASCADE;
DROP TABLE IF EXISTS set_pieces CASCADE;
DROP TABLE IF EXISTS shot_transitions CASCADE;
DROP TABLE IF EXISTS vfx_sfx CASCADE;

-- Perfiles de usuario duplicados/obsoletos
DROP TABLE IF EXISTS user_experience_profiles CASCADE;
DROP TABLE IF EXISTS user_telemetry_signals CASCADE;
DROP TABLE IF EXISTS project_editorial_config CASCADE;
DROP TABLE IF EXISTS project_user_profiles CASCADE;