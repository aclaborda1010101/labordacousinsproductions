/**
 * BUILD KNOWLEDGE PACKS
 * 
 * Analiza los guiones parseados y genera Knowledge Packs por género.
 * Esto es el "cerebro" destilado que reemplaza RAG en tiempo real.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = path.join(__dirname, 'parsed');
const PACKS_DIR = path.join(__dirname, 'knowledge-packs');

// Asegurar directorio de output
if (!fs.existsSync(PACKS_DIR)) fs.mkdirSync(PACKS_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════════
// ANÁLISIS ESTADÍSTICO
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeScripts(scripts) {
  const stats = {
    total: scripts.length,
    avg_scenes: 0,
    avg_words: 0,
    avg_characters: 0,
    avg_dialogue_per_scene: 0,
    scene_durations: [],
    dialogue_densities: []
  };
  
  let totalScenes = 0;
  let totalWords = 0;
  let totalCharacters = 0;
  let totalDialogue = 0;
  
  for (const script of scripts) {
    totalScenes += script.scenes_count || 0;
    totalWords += script.total_words || 0;
    totalCharacters += script.characters_count || 0;
    totalDialogue += script.total_dialogue || 0;
    
    // Calcular duración promedio de escena (asumiendo ~1 página = 1 minuto)
    if (script.scenes_count > 0 && script.total_words > 0) {
      const avgWordsPerScene = script.total_words / script.scenes_count;
      const estimatedDuration = avgWordsPerScene / 150 * 60; // 150 palabras/min
      stats.scene_durations.push(estimatedDuration);
    }
    
    // Densidad de diálogo
    if (script.total_words > 0 && script.total_dialogue > 0) {
      stats.dialogue_densities.push(script.total_dialogue / script.scenes_count);
    }
  }
  
  if (scripts.length > 0) {
    stats.avg_scenes = Math.round(totalScenes / scripts.length);
    stats.avg_words = Math.round(totalWords / scripts.length);
    stats.avg_characters = Math.round(totalCharacters / scripts.length);
    stats.avg_dialogue_per_scene = totalDialogue > 0 
      ? Math.round(totalDialogue / totalScenes * 10) / 10 
      : 0;
  }
  
  // Calcular medianas
  stats.median_scene_duration = median(stats.scene_durations);
  stats.median_dialogue_density = median(stats.dialogue_densities);
  
  return stats;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE PATRONES DE DIÁLOGO
// ═══════════════════════════════════════════════════════════════════════════════

function extractDialoguePatterns(scripts) {
  const patterns = {
    by_character_type: {},
    common_parentheticals: {},
    avg_lines_per_exchange: 0
  };
  
  const allParentheticals = [];
  let totalExchanges = 0;
  let totalLines = 0;
  
  for (const script of scripts) {
    if (!script.scenes) continue;
    
    for (const scene of script.scenes) {
      if (!scene.dialogue) continue;
      
      for (const d of scene.dialogue) {
        totalExchanges++;
        totalLines += d.lines?.length || 1;
        
        if (d.parenthetical) {
          const p = d.parenthetical.toLowerCase();
          allParentheticals.push(p);
        }
      }
    }
  }
  
  // Contar parentheticals más comunes
  const pCounts = {};
  for (const p of allParentheticals) {
    pCounts[p] = (pCounts[p] || 0) + 1;
  }
  patterns.common_parentheticals = Object.entries(pCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([p, count]) => ({ parenthetical: p, frequency: count }));
  
  patterns.avg_lines_per_exchange = totalExchanges > 0 
    ? Math.round(totalLines / totalExchanges * 10) / 10 
    : 0;
  
  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN DE PLANTILLAS DE ESCENA
// ═══════════════════════════════════════════════════════════════════════════════

function extractSceneTemplates(scripts, maxTemplates = 10) {
  const templates = [];
  const sluglinePatterns = {};
  
  for (const script of scripts) {
    if (!script.scenes) continue;
    
    for (const scene of script.scenes) {
      if (!scene.slugline) continue;
      
      // Normalizar slugline para encontrar patrones
      const normalized = normalizeSlugline(scene.slugline);
      
      if (!sluglinePatterns[normalized]) {
        sluglinePatterns[normalized] = {
          pattern: normalized,
          examples: [],
          total: 0,
          avg_word_count: 0,
          avg_dialogue: 0
        };
      }
      
      const p = sluglinePatterns[normalized];
      p.total++;
      p.examples.push({
        original: scene.slugline,
        script: script.title,
        word_count: scene.word_count
      });
      p.avg_word_count += scene.word_count || 0;
      p.avg_dialogue += scene.dialogue?.length || 0;
    }
  }
  
  // Calcular promedios y ordenar por frecuencia
  const sorted = Object.values(sluglinePatterns)
    .map(p => ({
      ...p,
      avg_word_count: p.total > 0 ? Math.round(p.avg_word_count / p.total) : 0,
      avg_dialogue: p.total > 0 ? Math.round(p.avg_dialogue / p.total * 10) / 10 : 0,
      examples: p.examples.slice(0, 3) // Solo 3 ejemplos
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, maxTemplates);
  
  return sorted;
}

function normalizeSlugline(slugline) {
  // INT. CASA DE JUAN - NOCHE -> INT. [LUGAR] - [TIEMPO]
  return slugline
    .replace(/INT\./i, 'INT.')
    .replace(/EXT\./i, 'EXT.')
    .replace(/INT\/EXT\./i, 'INT/EXT.')
    .replace(/(INT\.|EXT\.|INT\/EXT\.)\s+[^-]+/, '$1 [LUGAR]')
    .replace(/- .+$/, '- [TIEMPO]')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECCIÓN DE ANTI-PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const KNOWN_ANTI_PATTERNS = [
  { pattern: /todo cambia/gi, name: 'generic_change' },
  { pattern: /se da cuenta/gi, name: 'exposition_realize' },
  { pattern: /la tensión aumenta/gi, name: 'telling_tension' },
  { pattern: /nada volverá a ser igual/gi, name: 'cliche_nothing_same' },
  { pattern: /de alguna manera/gi, name: 'vague_somehow' },
  { pattern: /hay algo en su mirada/gi, name: 'unfilmable_eyes' },
  { pattern: /siente que/gi, name: 'internal_feeling' },
  { pattern: /piensa que/gi, name: 'internal_thinking' }
];

function detectAntiPatterns(scripts) {
  const detected = {};
  
  for (const ap of KNOWN_ANTI_PATTERNS) {
    detected[ap.name] = { count: 0, examples: [] };
  }
  
  for (const script of scripts) {
    if (!script.scenes) continue;
    
    for (const scene of script.scenes) {
      const text = scene.action_text || '';
      
      for (const ap of KNOWN_ANTI_PATTERNS) {
        const matches = text.match(ap.pattern);
        if (matches) {
          detected[ap.name].count += matches.length;
          if (detected[ap.name].examples.length < 3) {
            detected[ap.name].examples.push({
              script: script.title,
              scene: scene.scene_number,
              match: matches[0]
            });
          }
        }
      }
    }
  }
  
  // Filtrar los que se encontraron
  return Object.entries(detected)
    .filter(([_, v]) => v.count > 0)
    .map(([name, v]) => ({
      pattern: name,
      frequency: v.count,
      examples: v.examples
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELECCIÓN DE MEJORES EJEMPLOS
// ═══════════════════════════════════════════════════════════════════════════════

function selectBestExamples(scripts, count = 5) {
  // Ordenar por "calidad" estimada (más escenas, más personajes, más diálogo)
  const scored = scripts.map(s => ({
    ...s,
    quality_score: (s.scenes_count || 0) * 0.4 + 
                   (s.characters_count || 0) * 0.3 + 
                   (s.total_dialogue || 0) * 0.001
  })).sort((a, b) => b.quality_score - a.quality_score);
  
  // Tomar los mejores
  return scored.slice(0, count).map(s => ({
    slug: s.slug,
    title: s.title,
    scenes_count: s.scenes_count,
    characters_count: s.characters_count,
    quality_score: Math.round(s.quality_score * 100) / 100
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DEL KNOWLEDGE PACK
// ═══════════════════════════════════════════════════════════════════════════════

function buildKnowledgePack(genre, scripts, format = 'film') {
  console.log(`\n📦 Building pack: ${genre}_${format} (${scripts.length} scripts)`);
  
  const stats = analyzeScripts(scripts);
  const dialoguePatterns = extractDialoguePatterns(scripts);
  const sceneTemplates = extractSceneTemplates(scripts);
  const antiPatterns = detectAntiPatterns(scripts);
  const bestExamples = selectBestExamples(scripts);
  
  const pack = {
    pack_id: `${genre}_${format}`,
    genre,
    format,
    created_at: new Date().toISOString(),
    source_scripts_count: scripts.length,
    
    // Stats destiladas
    structure_stats: {
      avg_scene_count: stats.avg_scenes,
      avg_words_total: stats.avg_words,
      avg_characters: stats.avg_characters,
      median_scene_duration_sec: Math.round(stats.median_scene_duration || 90),
      dialogue_per_scene: stats.avg_dialogue_per_scene,
      dialogue_density: stats.median_dialogue_density
        ? Math.round(stats.median_dialogue_density * 100) / 100
        : 0.4
    },
    
    // Reglas de formato (comunes a todos)
    format_rules: {
      slugline_pattern: "INT./EXT. LUGAR - MOMENTO",
      action_max_lines: 4,
      dialogue_max_lines: 3,
      parentheticals: dialoguePatterns.common_parentheticals.slice(0, 5),
      avg_lines_per_exchange: dialoguePatterns.avg_lines_per_exchange
    },
    
    // Plantillas de escena
    scene_templates: sceneTemplates,
    
    // Anti-patterns detectados (para evitar)
    anti_patterns: antiPatterns,
    
    // Mejores ejemplos para referencia
    reference_scripts: bestExamples,
    
    // Checklist de calidad (por defecto, se puede customizar)
    quality_checklist: getGenreChecklist(genre)
  };
  
  return pack;
}

function getGenreChecklist(genre) {
  const checklists = {
    thriller: [
      "¿Hay misterio/tensión desde escena 1?",
      "¿El protagonista tiene fallo explotable?",
      "¿Hay stakes claros y escalada?",
      "¿El antagonista tiene motivación creíble?",
      "¿Los giros están plantados (fair play)?"
    ],
    drama: [
      "¿El conflicto es interno Y externo?",
      "¿El protagonista cambia de verdad?",
      "¿Las relaciones tienen textura?",
      "¿Hay momentos de silencio significativo?",
      "¿El final es earned, no forzado?"
    ],
    comedy: [
      "¿Hay un gag/risa en los primeros 5 minutos?",
      "¿El humor viene del personaje, no de chistes?",
      "¿Hay setup-payoff consistente?",
      "¿La comedia tiene corazón (stakes emocionales)?",
      "¿El timing está en la acción, no solo diálogo?"
    ],
    horror: [
      "¿El miedo está en lo no visto tanto como lo visto?",
      "¿Hay reglas claras del mal/monstruo?",
      "¿Los personajes toman decisiones lógicas (para ellos)?",
      "¿Hay momentos de alivio antes del terror?",
      "¿El final tiene impacto duradero?"
    ],
    action: [
      "¿Las secuencias de acción tienen objetivo claro?",
      "¿Hay variedad en las set-pieces?",
      "¿El héroe tiene vulnerabilidad?",
      "¿Los stakes escalan progresivamente?",
      "¿La acción revela personaje?"
    ],
    default: [
      "¿El protagonista tiene objetivo claro?",
      "¿Hay conflicto en cada escena?",
      "¿Los personajes suenan distintos?",
      "¿El ritmo mantiene engagement?",
      "¿El final paga el setup?"
    ]
  };
  
  return checklists[genre] || checklists.default;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🧠 Building Knowledge Packs from parsed scripts...\n');
  
  // Cargar índice de scripts parseados
  const indexPath = path.join(PARSED_DIR, '_index.json');
  if (!fs.existsSync(indexPath)) {
    console.log('❌ No parsed scripts found. Run parse-scripts.mjs first.');
    return;
  }
  
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  console.log(`📂 Found ${index.length} parsed scripts`);
  
  // Cargar datos completos de cada script
  const scripts = [];
  for (const entry of index) {
    const scriptPath = path.join(PARSED_DIR, `${entry.slug}.json`);
    if (fs.existsSync(scriptPath)) {
      const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
      scripts.push(script);
    }
  }
  
  console.log(`📄 Loaded ${scripts.length} full scripts`);
  
  // Agrupar por género y formato
  const byGenreFormat = {};
  for (const script of scripts) {
    const key = `${script.genre || 'drama'}_${script.format || 'film'}`;
    if (!byGenreFormat[key]) {
      byGenreFormat[key] = [];
    }
    byGenreFormat[key].push(script);
  }
  
  console.log('\n📊 Distribution:');
  for (const [key, arr] of Object.entries(byGenreFormat)) {
    console.log(`  ${key}: ${arr.length}`);
  }
  
  // Construir packs
  const packs = [];
  for (const [key, genreScripts] of Object.entries(byGenreFormat)) {
    const [genre, format] = key.split('_');
    
    // Solo crear pack si hay suficientes scripts (mínimo 5)
    if (genreScripts.length >= 5) {
      const pack = buildKnowledgePack(genre, genreScripts, format);
      packs.push(pack);
      
      // Guardar pack individual
      const packPath = path.join(PACKS_DIR, `${pack.pack_id}.json`);
      fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));
      console.log(`  ✅ Saved: ${pack.pack_id}`);
    } else {
      console.log(`  ⚠️ Skipped ${key}: only ${genreScripts.length} scripts (need 5+)`);
    }
  }
  
  // Crear pack "general" con todos
  console.log('\n📦 Building general pack...');
  const generalPack = buildKnowledgePack('general', scripts, 'mixed');
  fs.writeFileSync(path.join(PACKS_DIR, 'general_mixed.json'), JSON.stringify(generalPack, null, 2));
  packs.push(generalPack);
  
  // Guardar índice de packs
  const packIndex = packs.map(p => ({
    pack_id: p.pack_id,
    genre: p.genre,
    format: p.format,
    source_count: p.source_scripts_count
  }));
  fs.writeFileSync(path.join(PACKS_DIR, '_index.json'), JSON.stringify(packIndex, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ KNOWLEDGE PACKS BUILT:');
  console.log(`  📦 Total packs: ${packs.length}`);
  console.log(`  📁 Location: ${PACKS_DIR}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
