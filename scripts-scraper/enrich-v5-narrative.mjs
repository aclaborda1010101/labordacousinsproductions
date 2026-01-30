#!/usr/bin/env node
/**
 * V5 - Narrative Intelligence Layer
 * 
 * Aplica DESPUÉS del V4. No reemplaza, ENRIQUECE.
 * 
 * AÑADE:
 * 1. Filtrado de falsos positivos en personajes
 * 2. Identificación de protagonista
 * 3. Turning points por interpretación (no posición fija)
 * 4. Corrección de género
 * 5. Arco emocional
 * 
 * Filosofía: Las reglas son el mapa, no el territorio.
 * Tarantino pone midpoint en p.40, Nolan rompe timeline - y funciona.
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// FILTROS DE FALSOS POSITIVOS
// ============================================================================

const FALSE_POSITIVE_CHARACTERS = new Set([
  // Palabras de formato/script
  'FINAL', 'SHOOTING SCRIPT', 'DRAFT', 'REVISED', 'CONTINUED',
  'CONT', 'MORE', 'THE END', 'FADE IN', 'FADE OUT', 'CUT TO',
  
  // Preposiciones/artículos en mayúsculas
  'ON', 'INTO', 'AT', 'FROM', 'TO', 'THE', 'A', 'AN', 'IN', 'OF',
  
  // Direcciones de cámara
  'ANGLE', 'CLOSE', 'WIDE', 'POV', 'INSERT', 'INTERCUT',
  
  // Tiempos
  'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY',
  'SAME TIME', 'CONTINUOUS', 'MOMENTS LATER',
  
  // Otros falsos positivos comunes
  'SUPER', 'TITLE', 'CARD', 'FLASHBACK', 'MONTAGE', 'SERIES',
  'V.O', 'O.S', 'O.C', 'PRELAP', 'PRE-LAP',
  'BACK TO', 'RESUME', 'END', 'BEGIN', 'OPENING',
  
  // Ubicaciones genéricas que se confunden
  'HOUSE', 'ROOM', 'OFFICE', 'STREET', 'CAR', 'OUTSIDE', 'INSIDE'
]);

// Patrones regex para detectar falsos positivos
const FALSE_POSITIVE_PATTERNS = [
  /^[A-Z]{1,3}$/,           // Muy corto (1-3 letras)
  /^\d+$/,                   // Solo números
  /^SCENE \d+$/,            // Scene numbers
  /^ACT [IVX]+$/,           // Act numbers
  /^INT\.?$/,               // INT/EXT
  /^EXT\.?$/,
  /CONTINUED/,
  /^\(.*\)$/,               // Parentéticos
  /^[A-Z]+\s+\d+$/,         // WORD + número
];

function isValidCharacter(name) {
  if (!name || typeof name !== 'string') return false;
  
  const normalized = name.trim().toUpperCase();
  
  // Check against known false positives
  if (FALSE_POSITIVE_CHARACTERS.has(normalized)) return false;
  
  // Check patterns
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }
  
  // Must have at least 2 characters
  if (normalized.length < 2) return false;
  
  // Should have at least one vowel (nombres reales)
  if (!/[AEIOU]/.test(normalized)) return false;
  
  return true;
}

// ============================================================================
// CONFIGURACIÓN DE GÉNEROS
// ============================================================================

const GENRE_KEYWORDS = {
  drama: [
    'slave', 'war', 'death', 'family', 'love', 'life', 'story', 'true',
    'years', 'father', 'mother', 'son', 'daughter', 'marriage', 'divorce',
    'cancer', 'disease', 'struggle', 'journey', 'dream'
  ],
  comedy: [
    'funny', 'wedding', 'party', 'date', 'sex', 'drunk', 'crazy',
    'hangover', 'bachelor', 'prom', 'college', 'neighbors'
  ],
  action: [
    'mission', 'agent', 'spy', 'soldier', 'war', 'battle', 'fight',
    'gun', 'bomb', 'terrorist', 'rescue', 'chase', 'explosion'
  ],
  thriller: [
    'murder', 'killer', 'detective', 'crime', 'mystery', 'kidnap',
    'psycho', 'stalker', 'revenge', 'conspiracy', 'suspect'
  ],
  horror: [
    'demon', 'ghost', 'haunted', 'evil', 'possessed', 'curse',
    'nightmare', 'monster', 'zombie', 'vampire', 'witch'
  ],
  scifi: [
    'alien', 'space', 'future', 'robot', 'ai', 'time travel',
    'dystopia', 'mars', 'planet', 'spaceship', 'cyber'
  ],
  romance: [
    'love', 'romance', 'heart', 'kiss', 'wedding', 'proposal',
    'relationship', 'couple', 'affair', 'passion'
  ]
};

// Películas conocidas con género correcto
const KNOWN_GENRES = {
  '12 years a slave': 'drama',
  '12 years': 'drama',
  'moonlight': 'drama',
  'schindler': 'drama',
  'forrest gump': 'drama',
  'shawshank': 'drama',
  'green mile': 'drama',
  'dallas buyers': 'drama',
  'room': 'drama',
  'spotlight': 'drama',
  'manchester': 'drama',
  'lady bird': 'drama',
  'three billboards': 'drama',
  'nomadland': 'drama'
};

function correctGenre(screenplay) {
  const title = (screenplay.title || '').toLowerCase();
  const slug = (screenplay.slug || '').toLowerCase();
  
  // Check known genres first
  for (const [keyword, genre] of Object.entries(KNOWN_GENRES)) {
    if (title.includes(keyword) || slug.includes(keyword)) {
      return genre;
    }
  }
  
  // Use genreScores if available
  if (screenplay.genreScores) {
    const scores = screenplay.genreScores;
    let maxGenre = screenplay.genre || 'drama';
    let maxScore = 0;
    
    for (const [genre, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxGenre = genre;
      }
    }
    
    // Si drama tiene score alto pero no es el máximo, revisar
    if (scores.drama && scores.drama > 15 && maxGenre === 'action') {
      // Probablemente es drama mal clasificado
      const actionKeywords = ['war', 'battle', 'fight', 'soldier'];
      const hasActionWords = actionKeywords.some(w => title.includes(w) || slug.includes(w));
      if (!hasActionWords) {
        return 'drama';
      }
    }
    
    return maxGenre;
  }
  
  return screenplay.genre || 'drama';
}

// ============================================================================
// IDENTIFICACIÓN DE PROTAGONISTA
// ============================================================================

function identifyProtagonist(characters, scenes) {
  if (!characters || characters.length === 0) return null;
  
  // Filtrar personajes válidos
  const validChars = characters.filter(c => isValidCharacter(c.name));
  
  if (validChars.length === 0) return null;
  
  // Scoring
  const scores = validChars.map(char => {
    const dialogueScore = (char.dialogueLines || 0) / 100;
    const presenceScore = (char.scenesPresent || 0) / 50;
    const wordsScore = (char.totalWords || 0) / 1000;
    
    return {
      ...char,
      protagonistScore: dialogueScore * 0.4 + presenceScore * 0.4 + wordsScore * 0.2
    };
  });
  
  // Ordenar por score
  scores.sort((a, b) => b.protagonistScore - a.protagonistScore);
  
  const protagonist = scores[0];
  const secondPlace = scores[1];
  
  // Calcular confianza
  let confidence = 0.5;
  if (secondPlace) {
    const gap = protagonist.protagonistScore - secondPlace.protagonistScore;
    confidence = Math.min(0.5 + gap * 2, 1);
  }
  
  return {
    name: protagonist.name,
    dialogueLines: protagonist.dialogueLines,
    scenesPresent: protagonist.scenesPresent,
    confidence: Math.round(confidence * 100) / 100
  };
}

// ============================================================================
// TURNING POINTS POR INTERPRETACIÓN
// ============================================================================

function findTurningPointsByContext(screenplay) {
  const scenes = screenplay.scenes || [];
  const totalScenes = screenplay.metrics?.totalScenes || scenes.length;
  
  if (totalScenes === 0) {
    return screenplay.structure || {};
  }
  
  // El V4 ya tiene structure básica, la refinamos
  const v4Structure = screenplay.structure || {};
  
  // Calcular posiciones relativas
  const act1EndRatio = v4Structure.act1End ? v4Structure.act1End / totalScenes : 0.25;
  const midpointRatio = v4Structure.midpoint ? v4Structure.midpoint / totalScenes : 0.50;
  const act2EndRatio = v4Structure.act2End ? v4Structure.act2End / totalScenes : 0.75;
  
  // Evaluar si las posiciones son razonables
  const isReasonable = (ratio, expected, tolerance = 0.15) => {
    return Math.abs(ratio - expected) <= tolerance;
  };
  
  return {
    act1End: {
      scene: v4Structure.act1End,
      ratio: Math.round(act1EndRatio * 100) / 100,
      confidence: isReasonable(act1EndRatio, 0.25) ? 'high' : 'medium',
      note: act1EndRatio < 0.15 ? 'Muy temprano - posible in medias res' : 
            act1EndRatio > 0.35 ? 'Tardío - setup extendido' : 'Normal'
    },
    midpoint: {
      scene: v4Structure.midpoint,
      ratio: Math.round(midpointRatio * 100) / 100,
      confidence: isReasonable(midpointRatio, 0.50) ? 'high' : 'medium',
      note: midpointRatio < 0.40 ? 'Midpoint temprano (estilo Tarantino)' :
            midpointRatio > 0.60 ? 'Midpoint tardío' : 'Normal'
    },
    act2End: {
      scene: v4Structure.act2End,
      ratio: Math.round(act2EndRatio * 100) / 100,
      confidence: isReasonable(act2EndRatio, 0.75) ? 'high' : 'medium',
      note: act2EndRatio < 0.65 ? 'Act 3 largo' :
            act2EndRatio > 0.85 ? 'Act 3 corto - clímax rápido' : 'Normal'
    },
    interpretation: {
      followsClassicStructure: isReasonable(act1EndRatio, 0.25) && 
                                isReasonable(midpointRatio, 0.50) &&
                                isReasonable(act2EndRatio, 0.75),
      structureType: classifyStructureType(act1EndRatio, midpointRatio, act2EndRatio)
    }
  };
}

function classifyStructureType(act1End, midpoint, act2End) {
  if (act1End < 0.15) return 'in-medias-res';
  if (midpoint < 0.40) return 'front-loaded';
  if (midpoint > 0.60) return 'slow-burn';
  if (act2End > 0.85) return 'fast-climax';
  return 'classic-three-act';
}

// ============================================================================
// CALCULAR ARCO EMOCIONAL SIMPLE
// ============================================================================

function calculateEmotionalArc(screenplay) {
  const dialogueRatio = screenplay.metrics?.dialogueRatio || 0.5;
  const intRatio = screenplay.metrics?.intRatio || 0.5;
  const nightRatio = screenplay.metrics?.nightRatio || 0.5;
  
  // Inferir tono general
  let tone = 'neutral';
  
  if (nightRatio > 0.6 && intRatio > 0.6) {
    tone = 'dark-claustrophobic';
  } else if (nightRatio < 0.3 && intRatio < 0.4) {
    tone = 'bright-open';
  } else if (dialogueRatio > 0.7) {
    tone = 'dialogue-heavy';
  } else if (dialogueRatio < 0.4) {
    tone = 'action-heavy';
  }
  
  return {
    tone,
    dialogueIntensity: dialogueRatio > 0.6 ? 'high' : dialogueRatio < 0.4 ? 'low' : 'medium',
    visualMood: nightRatio > 0.5 ? 'dark' : 'bright',
    spatialFeel: intRatio > 0.6 ? 'confined' : intRatio < 0.4 ? 'expansive' : 'balanced'
  };
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE ENRIQUECIMIENTO
// ============================================================================

async function enrichWithV5(v4Data) {
  console.log(`🎬 V5 enriching: ${v4Data.title}`);
  
  // 1. Filtrar personajes falsos
  const cleanedCharacters = (v4Data.characters || [])
    .filter(c => isValidCharacter(c.name))
    .sort((a, b) => (b.dialogueLines || 0) - (a.dialogueLines || 0));
  
  const removedCount = (v4Data.characters?.length || 0) - cleanedCharacters.length;
  
  // 2. Identificar protagonista
  const protagonist = identifyProtagonist(cleanedCharacters);
  
  // 3. Corregir género
  const correctedGenre = correctGenre(v4Data);
  const genreChanged = correctedGenre !== v4Data.genre;
  
  // 4. Refinar turning points
  const refinedStructure = findTurningPointsByContext(v4Data);
  
  // 5. Calcular arco emocional
  const emotionalArc = calculateEmotionalArc(v4Data);
  
  // 6. Construir resultado
  const enriched = {
    ...v4Data,
    
    // Sobreescribir con datos limpios
    genre: correctedGenre,
    characters: cleanedCharacters,
    
    // Añadir análisis V5
    v5Analysis: {
      version: '5.0',
      analyzedAt: new Date().toISOString(),
      
      protagonist,
      
      charactersCleaned: {
        original: v4Data.characters?.length || 0,
        valid: cleanedCharacters.length,
        removed: removedCount
      },
      
      genreCorrection: {
        original: v4Data.genre,
        corrected: correctedGenre,
        wasChanged: genreChanged
      },
      
      structureAnalysis: refinedStructure,
      
      emotionalArc,
      
      confidence: calculateOverallConfidence(v4Data, cleanedCharacters, protagonist)
    }
  };
  
  return enriched;
}

function calculateOverallConfidence(data, characters, protagonist) {
  let score = 0;
  
  if (characters.length >= 5) score += 0.25;
  if (data.metrics?.totalDialogues >= 100) score += 0.25;
  if (protagonist?.confidence >= 0.7) score += 0.25;
  if (data.metrics?.totalScenes >= 30) score += 0.25;
  
  return {
    overall: Math.round(score * 100) / 100,
    level: score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low'
  };
}

// ============================================================================
// PROCESAMIENTO DE ARCHIVOS
// ============================================================================

async function processFile(inputPath, outputPath) {
  try {
    const raw = await fs.readFile(inputPath, 'utf8');
    const v4Data = JSON.parse(raw);
    
    const enriched = await enrichWithV5(v4Data);
    
    await fs.writeFile(outputPath, JSON.stringify(enriched, null, 2));
    
    return {
      success: true,
      title: enriched.title,
      genreChanged: enriched.v5Analysis.genreCorrection.wasChanged,
      charactersRemoved: enriched.v5Analysis.charactersCleaned.removed,
      protagonist: enriched.v5Analysis.protagonist?.name
    };
  } catch (error) {
    console.error(`❌ Error processing ${inputPath}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function processDirectory(inputDir, outputDir) {
  console.log(`\n🚀 V5 NARRATIVE INTELLIGENCE`);
  console.log(`   Input: ${inputDir}`);
  console.log(`   Output: ${outputDir}\n`);
  
  await fs.mkdir(outputDir, { recursive: true });
  
  const files = await fs.readdir(inputDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`📁 Found ${jsonFiles.length} files\n`);
  
  const results = {
    total: jsonFiles.length,
    success: 0,
    errors: 0,
    genresChanged: 0,
    totalCharsRemoved: 0,
    protagonists: []
  };
  
  for (const file of jsonFiles) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    
    const result = await processFile(inputPath, outputPath);
    
    if (result.success) {
      results.success++;
      if (result.genreChanged) results.genresChanged++;
      results.totalCharsRemoved += result.charactersRemoved || 0;
      if (result.protagonist) {
        results.protagonists.push({ title: result.title, protagonist: result.protagonist });
      }
    } else {
      results.errors++;
    }
    
    // Progress
    if (results.success % 50 === 0) {
      console.log(`   ✓ ${results.success}/${jsonFiles.length} processed`);
    }
  }
  
  // Summary
  console.log(`\n📊 V5 SUMMARY:`);
  console.log(`   ✅ Processed: ${results.success}`);
  console.log(`   ❌ Errors: ${results.errors}`);
  console.log(`   🎭 Genres corrected: ${results.genresChanged}`);
  console.log(`   🧹 False positives removed: ${results.totalCharsRemoved}`);
  
  // Save summary
  await fs.writeFile(
    path.join(outputDir, '../analysis-summary-v5.json'),
    JSON.stringify(results, null, 2)
  );
  
  return results;
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
🎬 V5 - Narrative Intelligence Layer

Usage:
  node enrich-v5-narrative.mjs                    Process enriched-v4 → enriched-v5
  node enrich-v5-narrative.mjs <input> <output>   Custom directories
  node enrich-v5-narrative.mjs --single <file>    Process single file

Features:
  ✓ Filter false positive characters (ON, INTO, FINAL, etc.)
  ✓ Identify protagonist by dialogue + presence
  ✓ Correct genre classification
  ✓ Analyze narrative structure
  ✓ Calculate emotional arc
  `);
  
  // Default: process enriched-v4 → enriched-v5
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.slice(1));
  const inputDir = path.join(scriptDir, 'enriched-v4');
  const outputDir = path.join(scriptDir, 'enriched-v5');
  
  processDirectory(inputDir, outputDir);
  
} else if (args[0] === '--single') {
  const inputFile = args[1];
  const outputFile = args[2] || inputFile.replace('.json', '-v5.json');
  processFile(inputFile, outputFile).then(r => console.log(r));
  
} else {
  processDirectory(args[0], args[1]);
}

export { enrichWithV5, processFile, processDirectory };
