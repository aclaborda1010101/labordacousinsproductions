-- SEED DEMO DATA para ManIAS Lab
-- 2026-01-31 - Restauración completa del stack

-- Insertar usuario demo en auth.users (necesario para RLS)
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  'demo-user-uuid-12345',
  'authenticated',
  'authenticated',
  'demo@manias.lab',
  crypt('demo123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"email":"demo@manias.lab","name":"Demo User"}',
  false,
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Crear perfil demo
INSERT INTO profiles (
  id,
  user_id,
  display_name,
  avatar_url,
  created_at,
  updated_at,
  developer_mode_enabled,
  developer_mode_enabled_at
) VALUES (
  gen_random_uuid(),
  'demo-user-uuid-12345',
  'Demo User - ManIAS Lab',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
  NOW(),
  NOW(),
  true,
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- Crear proyecto demo "Bosco Adventures"
INSERT INTO projects (
  id,
  owner_id,
  title,
  format,
  episodes_count,
  target_duration_min,
  master_language,
  target_languages,
  budget_cap_project_eur,
  bible_completeness_score,
  created_at,
  updated_at,
  preferred_engine,
  engine_test_completed,
  creative_mode,
  format_profile,
  animation_type,
  visual_style,
  user_level,
  autopilot_enabled,
  logline,
  genre,
  tone,
  narrative_framework,
  style_pack
) VALUES (
  'demo-project-bosco-uuid',
  'demo-user-uuid-12345',
  'Las Aventuras de Bosco',
  'film',
  1,
  1,
  'es',
  ARRAY['es'],
  100.0,
  75,
  NOW(),
  NOW(),
  'gemini-3-pro-image',
  true,
  'ASSISTED',
  'short',
  '3D',
  'pixar',
  'explorer',
  true,
  'Un niño de 4 años vive una aventura familiar memorable con su perrita Yorkshire',
  'familiar',
  'alegre',
  'estructura_clasica',
  'family_friendly'
) ON CONFLICT (id) DO NOTHING;

-- Crear personajes principales
INSERT INTO characters (
  id,
  project_id,
  name,
  role,
  bio,
  arc,
  voice_card,
  canon_rules,
  expressions,
  created_at,
  updated_at,
  character_role,
  pack_completeness_score,
  profile_json,
  pack_status,
  is_ready_for_video,
  canon_level,
  source,
  confidence,
  entity_subtype,
  identity_lock_score
) VALUES 
(
  'demo-char-bosco-uuid',
  'demo-project-bosco-uuid',
  'Bosco',
  'protagonist',
  'Niño de 4 años, protagonista principal. Curioso, aventurero y lleno de energía.',
  'Descubre la importancia de la familia a través de una aventura inesperada',
  '{"tono": "infantil", "energia": "alta", "personalidad": "curioso"}',
  '{"altura": "90cm", "cabello": "rubio", "ojos": "azules"}',
  '{"feliz": "sonrisa amplia", "sorprendido": "ojos grandes", "preocupado": "ceño fruncido"}',
  NOW(),
  NOW(),
  'protagonist',
  80,
  '{"age": 4, "height": "90cm", "hair": "rubio", "eyes": "azul", "personality": "curioso_aventurero"}',
  'hero_ready',
  true,
  'P1',
  'guion_predefinido',
  0.95,
  'human',
  85
),
(
  'demo-char-agustin-uuid',
  'demo-project-bosco-uuid',
  'Agustín',
  'secondary',
  'Padre de 40 años, cariñoso y protector.',
  'Aprende a balancear protección con libertad para sus hijos',
  '{"tono": "paternal", "energia": "media", "personalidad": "protector"}',
  '{"altura": "180cm", "cabello": "castaño", "ojos": "marrones"}',
  '{"sonriente": "expresión cálida", "preocupado": "ceño fruncido", "orgulloso": "sonrisa amplia"}',
  NOW(),
  NOW(),
  'secondary',
  70,
  '{"age": 40, "height": "180cm", "hair": "castaño", "eyes": "marron", "personality": "paternal_protector"}',
  'in_progress',
  false,
  'P1',
  'guion_predefinido',
  0.90,
  'human',
  75
),
(
  'demo-char-sasa-uuid',
  'demo-project-bosco-uuid',
  'Sasa',
  'supporting',
  'Yorkshire Terrier de 1.5kg, muy juguetona y adorable.',
  'Catalizador de la aventura familiar',
  '{"tipo": "perro", "energia": "muy_alta", "personalidad": "juguetona"}',
  '{"raza": "Yorkshire Terrier", "peso": "1.5kg", "color": "marron_dorado"}',
  '{"contenta": "cola moviendo", "traviesa": "orejas alerta", "cansada": "lengua fuera"}',
  NOW(),
  NOW(),
  'supporting',
  60,
  '{"species": "dog", "breed": "Yorkshire Terrier", "weight": "1.5kg", "personality": "playful_energetic"}',
  'concept_ready',
  false,
  'P1',
  'guion_predefinido',
  0.85,
  'animal',
  70
) ON CONFLICT (id) DO NOTHING;

-- Crear ubicación demo
INSERT INTO locations (
  id,
  project_id,
  name,
  description,
  variants,
  props,
  sound_profile,
  reference_urls,
  created_at,
  updated_at,
  status,
  canon_level,
  source,
  confidence,
  reference_status,
  narrative_role
) VALUES (
  'demo-location-casa-uuid',
  'demo-project-bosco-uuid',
  'Casa Familiar',
  'Hogar acogedor donde vive la familia. Sala de estar cálida con cocina abierta.',
  '{"salon": "espacioso_luminoso", "cocina": "abierta_moderna", "jardin": "pequeño_seguro"}',
  '{"sofa": "comodo_familiar", "mesa_cocina": "madera_natural", "juguetes": "esparcidos_suelo"}',
  '{"ambiente": "hogareño", "sonidos": ["televisor_fondo", "cocina_actividad", "risa_familia"]}',
  '{"referencias": ["hogar_moderno", "casa_familiar_acogedora"]}',
  NOW(),
  NOW(),
  'approved',
  'P1',
  'guion_predefinido',
  0.90,
  'none',
  'setting_principal'
) ON CONFLICT (id) DO NOTHING;

-- Crear script demo básico
INSERT INTO scripts (
  id,
  project_id,
  raw_text,
  version,
  created_at,
  status,
  script_type,
  episode_number,
  meta,
  updated_at
) VALUES (
  'demo-script-bosco-uuid',
  'demo-project-bosco-uuid',
  'BOSCO ADVENTURES - VIDEO SCRIPT
Duration: 58 seconds
Resolution: HD 1080p

SCENE 1 (0:00-0:15) - FAMILY INTRODUCTION
FADE IN: Interior casa familiar, sala de estar cálida
- Bosco (niño 4 años) jugando en el suelo con Sasa
- Agustín leyendo en sofá, sonríe viendo a Bosco

DIÁLOGO:
BOSCO: "¡Mira Sasa, vamos a jugar a las aventuras!"
AGUSTÍN: "Cuidado campeón, no hagas mucho ruido"',
  1,
  NOW(),
  'approved',
  'film',
  1,
  '{"guion_predefinido": true, "categoria": "familiar", "duracion_segundos": 58}',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Crear presupuesto demo usuario
INSERT INTO user_budgets (
  id,
  user_id,
  daily_limit_usd,
  monthly_limit_usd,
  alert_threshold_percent,
  pause_on_exceed,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'demo-user-uuid-12345',
  50.0,
  500.0,
  80,
  false,
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO NOTHING;