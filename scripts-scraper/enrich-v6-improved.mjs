#!/usr/bin/env node
/**
 * V6 - Improved Narrative Intelligence
 * 
 * Mejoras sobre V5:
 * 1. Clasificación de género por CONTENIDO, no por listas
 * 2. Protagonista por presencia + arco, no solo diálogos
 * 3. Correcciones menos agresivas
 * 
 * REGLAS GLOBALES - Funcionan para cualquier guión
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// FILTROS DE FALSOS POSITIVOS (igual que V5)
// ============================================================================

const FALSE_POSITIVE_CHARACTERS = new Set([
  'FINAL', 'SHOOTING SCRIPT', 'DRAFT', 'REVISED', 'CONTINUED',
  'CONT', 'MORE', 'THE END', 'FADE IN', 'FADE OUT', 'CUT TO',
  'ON', 'INTO', 'AT', 'FROM', 'TO', 'THE', 'A', 'AN', 'IN', 'OF',
  'ANGLE', 'CLOSE', 'WIDE', 'POV', 'INSERT', 'INTERCUT',
  'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY',
  'SAME TIME', 'CONTINUOUS', 'MOMENTS LATER',
  'SUPER', 'TITLE', 'CARD', 'FLASHBACK', 'MONTAGE', 'SERIES',
  'V.O', 'O.S', 'O.C', 'PRELAP', 'PRE-LAP',
  'BACK TO', 'RESUME', 'END', 'BEGIN', 'OPENING',
  'HOUSE', 'ROOM', 'OFFICE', 'STREET', 'CAR', 'OUTSIDE', 'INSIDE'
]);

const FALSE_POSITIVE_PATTERNS = [
  /^[A-Z]{1,3}$/,
  /^\d+$/,
  /^SCENE \d+$/,
  /^ACT [IVX]+$/,
  /^INT\.?$/,
  /^EXT\.?$/,
  /CONTINUED/,
  /^\(.*\)$/,
  /^[A-Z]+\s+\d+$/,
];

function isValidCharacter(name) {
  if (!name || typeof name !== 'string') return false;
  const normalized = name.trim().toUpperCase();
  if (FALSE_POSITIVE_CHARACTERS.has(normalized)) return false;
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }
  if (normalized.length < 2) return false;
  if (!/[AEIOU]/.test(normalized)) return false;
  return true;
}

// ============================================================================
// V6: CLASIFICACIÓN DE GÉNERO POR CONTENIDO
// ============================================================================

const GENRE_VOCABULARY = {
  // Palabras que DESCARTAN comedy
  not_comedy: [
    'death', 'dead', 'die', 'dies', 'dying', 'kill', 'killed', 'murder', 'murdered',
    'blood', 'bloody', 'wound', 'shot', 'shoots', 'gun', 'knife', 'stab',
    'torture', 'pain', 'suffer', 'suffering', 'agony', 'scream', 'screams',
    'dark', 'darkness', 'evil', 'demon', 'devil', 'hell', 'nightmare',
    'fear', 'terror', 'horror', 'scared', 'afraid', 'panic',
    'abuse', 'assault', 'rape', 'victim', 'trauma', 'suicide',
    'war', 'battle', 'soldier', 'enemy', 'combat', 'destroy',
    'prison', 'jail', 'arrest', 'criminal', 'crime', 'guilty',
    'slave', 'slavery', 'chains', 'whip', 'master'
  ],
  
  // Palabras que sugieren DRAMA
  drama: [
    'family', 'father', 'mother', 'son', 'daughter', 'brother', 'sister',
    'life', 'death', 'love', 'loss', 'grief', 'pain', 'hope', 'dream',
    'struggle', 'fight', 'survive', 'truth', 'secret', 'past',
    'marriage', 'divorce', 'relationship', 'heart', 'soul',
    'memory', 'remember', 'forget', 'forgive', 'regret',
    'disease', 'illness', 'cancer', 'hospital', 'doctor',
    'court', 'trial', 'justice', 'innocent', 'guilty'
  ],
  
  // Palabras que sugieren THRILLER
  thriller: [
    'murder', 'kill', 'killer', 'detective', 'investigate', 'suspect',
    'kidnap', 'hostage', 'ransom', 'escape', 'chase', 'run', 'hide',
    'conspiracy', 'secret', 'spy', 'agent', 'undercover',
    'threat', 'danger', 'risk', 'trap', 'ambush',
    'psycho', 'crazy', 'insane', 'obsess', 'stalk'
  ],
  
  // Palabras que sugieren HORROR
  horror: [
    'demon', 'devil', 'evil', 'possessed', 'possession', 'exorcist',
    'ghost', 'spirit', 'haunted', 'supernatural', 'paranormal',
    'monster', 'creature', 'beast', 'vampire', 'zombie', 'werewolf',
    'curse', 'cursed', 'witch', 'ritual', 'sacrifice',
    'nightmare', 'terror', 'scream', 'blood', 'gore'
  ],
  
  // Palabras que sugieren ACTION
  action: [
    'gun', 'shoot', 'shot', 'weapon', 'bomb', 'explosion', 'explode',
    'fight', 'punch', 'kick', 'combat', 'battle', 'war',
    'chase', 'escape', 'run', 'crash', 'car', 'helicopter', 'plane',
    'mission', 'agent', 'spy', 'soldier', 'military', 'army',
    'hero', 'save', 'rescue', 'protect', 'defend'
  ],
  
  // Palabras que sugieren ROMANCE
  romance: [
    'love', 'heart', 'kiss', 'kissing', 'romance', 'romantic',
    'marry', 'marriage', 'wedding', 'engaged', 'proposal',
    'boyfriend', 'girlfriend', 'husband', 'wife', 'lover',
    'passion', 'desire', 'attraction', 'chemistry',
    'date', 'dating', 'relationship'
  ],
  
  // Palabras que sugieren SCIFI
  scifi: [
    'space', 'spaceship', 'planet', 'alien', 'mars', 'moon', 'star',
    'robot', 'android', 'ai', 'artificial', 'computer', 'cyber',
    'future', 'dystopia', 'technology', 'machine', 'system',
    'time', 'travel', 'dimension', 'parallel', 'universe'
  ],
  
  // Palabras que sugieren COMEDY (verdadera)
  comedy: [
    'funny', 'laugh', 'joke', 'hilarious', 'comedy', 'comic',
    'party', 'drunk', 'hangover', 'crazy', 'wacky', 'silly',
    'prank', 'fool', 'idiot', 'stupid', 'ridiculous',
    'wedding', 'bachelor', 'bachelorette', 'prom', 'graduation'
  ]
};

function analyzeGenreByContent(screenplay) {
  // Obtener todo el texto disponible
  const allText = extractAllText(screenplay).toLowerCase();
  
  const scores = {
    drama: 0,
    thriller: 0,
    horror: 0,
    action: 0,
    romance: 0,
    scifi: 0,
    comedy: 0
  };
  
  // Contar palabras de cada categoría
  for (const [genre, words] of Object.entries(GENRE_VOCABULARY)) {
    if (genre === 'not_comedy') continue;
    
    for (const word of words) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = allText.match(regex);
      if (matches) {
        scores[genre] += matches.length;
      }
    }
  }
  
  // Verificar si tiene vocabulario que DESCARTA comedy
  let notComedyScore = 0;
  for (const word of GENRE_VOCABULARY.not_comedy) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = allText.match(regex);
    if (matches) {
      notComedyScore += matches.length;
    }
  }
  
  // Si tiene muchas palabras oscuras, NO es comedy
  const isDefinitelyNotComedy = notComedyScore > 10;
  
  // Usar ratios para ajustar
  const nightRatio = screenplay.metrics?.nightRatio || 0.5;
  const intRatio = screenplay.metrics?.intRatio || 0.5;
  
  // Mucha noche = probablemente thriller/horror/drama
  if (nightRatio > 0.6) {
    scores.thriller += 5;
    scores.horror += 5;
  }
  
  // Muchos interiores + noche = claustrofóbico = thriller/horror
  if (intRatio > 0.7 && nightRatio > 0.5) {
    scores.thriller += 3;
    scores.horror += 3;
  }
  
  // Muchos exteriores = action/adventure
  if (intRatio < 0.4) {
    scores.action += 3;
  }
  
  // Encontrar género con mayor score
  let maxGenre = 'drama'; // Default
  let maxScore = 0;
  
  for (const [genre, score] of Object.entries(scores)) {
    // Si definitivamente no es comedy, ignorar comedy score
    if (genre === 'comedy' && isDefinitelyNotComedy) continue;
    
    if (score > maxScore) {
      maxScore = score;
      maxGenre = genre;
    }
  }
  
  // Si no hay score significativo, mantener el original
  if (maxScore < 5) {
    return {
      genre: screenplay.genre || 'drama',
      confidence: 'low',
      method: 'fallback',
      scores,
      isDefinitelyNotComedy
    };
  }
  
  return {
    genre: maxGenre,
    confidence: maxScore > 20 ? 'high' : 'medium',
    method: 'content-analysis',
    scores,
    isDefinitelyNotComedy,
    notComedyScore
  };
}

function extractAllText(screenplay) {
  let text = '';
  
  // Título
  text += (screenplay.title || '') + ' ';
  
  // Diálogos
  if (screenplay.dialogues) {
    for (const d of screenplay.dialogues) {
      text += (d.text || d.dialogue || '') + ' ';
    }
  }
  
  // Escenas
  if (screenplay.scenes) {
    for (const s of screenplay.scenes) {
      text += (s.text || s.action || s.description || '') + ' ';
      text += (s.heading || s.slugline || '') + ' ';
    }
  }
  
  // Raw text si existe
  if (screenplay.rawText) {
    text += screenplay.rawText + ' ';
  }
  
  return text;
}

// ============================================================================
// V6: IDENTIFICACIÓN DE PROTAGONISTA MEJORADA
// ============================================================================

function identifyProtagonistV6(characters, screenplay) {
  if (!characters || characters.length === 0) return null;
  
  const validChars = characters.filter(c => isValidCharacter(c.name));
  if (validChars.length === 0) return null;
  
  const totalScenes = screenplay.metrics?.totalScenes || 1;
  const totalDialogues = screenplay.metrics?.totalDialogues || 1;
  
  const scores = validChars.map(char => {
    // Factor 1: Diálogos (30%)
    const dialogueScore = (char.dialogueLines || 0) / totalDialogues;
    
    // Factor 2: Presencia en escenas (30%)
    const presenceScore = (char.scenesPresent || 0) / totalScenes;
    
    // Factor 3: Palabras totales (20%) - indica profundidad
    const wordsScore = Math.min((char.totalWords || 0) / 1000, 1);
    
    // Factor 4: Consistencia a lo largo del guión (20%)
    // Un protagonista debe aparecer en todas las partes
    const consistencyScore = calculateConsistency(char, screenplay);
    
    const totalScore = 
      dialogueScore * 0.30 + 
      presenceScore * 0.30 + 
      wordsScore * 0.20 + 
      consistencyScore * 0.20;
    
    return {
      ...char,
      scores: {
        dialogue: Math.round(dialogueScore * 100) / 100,
        presence: Math.round(presenceScore * 100) / 100,
        words: Math.round(wordsScore * 100) / 100,
        consistency: Math.round(consistencyScore * 100) / 100
      },
      totalScore: Math.round(totalScore * 100) / 100
    };
  });
  
  // Ordenar por score
  scores.sort((a, b) => b.totalScore - a.totalScore);
  
  const protagonist = scores[0];
  const secondPlace = scores[1];
  
  // Calcular confianza basada en la diferencia
  let confidence = 0.5;
  if (secondPlace) {
    const gap = protagonist.totalScore - secondPlace.totalScore;
    // Si hay mucha diferencia, alta confianza
    confidence = Math.min(0.5 + gap * 3, 1);
  } else {
    confidence = 0.9;
  }
  
  return {
    name: protagonist.name,
    dialogueLines: protagonist.dialogueLines,
    scenesPresent: protagonist.scenesPresent,
    scores: protagonist.scores,
    totalScore: protagonist.totalScore,
    confidence: Math.round(confidence * 100) / 100,
    runnerUp: secondPlace ? {
      name: secondPlace.name,
      totalScore: secondPlace.totalScore
    } : null
  };
}

function calculateConsistency(char, screenplay) {
  // Idealmente verificaríamos si aparece en act1, act2, y act3
  // Como aproximación, usamos presencia relativa al total
  const totalScenes = screenplay.metrics?.totalScenes || 1;
  const presence = char.scenesPresent || 0;
  
  // Un protagonista debe aparecer en al menos 30% de las escenas
  if (presence / totalScenes >= 0.3) return 1;
  if (presence / totalScenes >= 0.2) return 0.7;
  if (presence / totalScenes >= 0.1) return 0.4;
  return 0.2;
}

// ============================================================================
// V6: ANÁLISIS DE ESTRUCTURA (igual que V5)
// ============================================================================

function analyzeStructure(screenplay) {
  const totalScenes = screenplay.metrics?.totalScenes || 1;
  const v4Structure = screenplay.structure || {};
  
  const act1EndRatio = v4Structure.act1End ? v4Structure.act1End / totalScenes : 0.25;
  const midpointRatio = v4Structure.midpoint ? v4Structure.midpoint / totalScenes : 0.50;
  const act2EndRatio = v4Structure.act2End ? v4Structure.act2End / totalScenes : 0.75;
  
  const isReasonable = (ratio, expected, tolerance = 0.15) => {
    return Math.abs(ratio - expected) <= tolerance;
  };
  
  return {
    act1End: {
      scene: v4Structure.act1End,
      ratio: Math.round(act1EndRatio * 100) / 100,
      confidence: isReasonable(act1EndRatio, 0.25) ? 'high' : 'medium'
    },
    midpoint: {
      scene: v4Structure.midpoint,
      ratio: Math.round(midpointRatio * 100) / 100,
      confidence: isReasonable(midpointRatio, 0.50) ? 'high' : 'medium'
    },
    act2End: {
      scene: v4Structure.act2End,
      ratio: Math.round(act2EndRatio * 100) / 100,
      confidence: isReasonable(act2EndRatio, 0.75) ? 'high' : 'medium'
    },
    structureType: classifyStructure(act1EndRatio, midpointRatio, act2EndRatio)
  };
}

function classifyStructure(act1, mid, act2) {
  if (act1 < 0.15) return 'in-medias-res';
  if (mid < 0.40) return 'front-loaded';
  if (mid > 0.60) return 'slow-burn';
  if (act2 > 0.85) return 'fast-climax';
  return 'classic-three-act';
}

// ============================================================================
// FUNCIÓN PRINCIPAL V6
// ============================================================================

async function enrichWithV6(v4Data) {
  console.log(`🎬 V6 analyzing: ${v4Data.title}`);
  
  // 1. Limpiar personajes
  const cleanedCharacters = (v4Data.characters || [])
    .filter(c => isValidCharacter(c.name))
    .sort((a, b) => (b.dialogueLines || 0) - (a.dialogueLines || 0));
  
  // 2. Analizar género por contenido
  const genreAnalysis = analyzeGenreByContent(v4Data);
  
  // 3. Identificar protagonista mejorado
  const protagonist = identifyProtagonistV6(cleanedCharacters, v4Data);
  
  // 4. Analizar estructura
  const structure = analyzeStructure(v4Data);
  
  // 5. Construir resultado
  const enriched = {
    ...v4Data,
    
    // Actualizar género solo si tenemos buena confianza
    genre: genreAnalysis.confidence !== 'low' ? genreAnalysis.genre : v4Data.genre,
    characters: cleanedCharacters,
    
    v6Analysis: {
      version: '6.0',
      analyzedAt: new Date().toISOString(),
      
      protagonist,
      
      charactersCleaned: {
        original: v4Data.characters?.length || 0,
        valid: cleanedCharacters.length,
        removed: (v4Data.characters?.length || 0) - cleanedCharacters.length
      },
      
      genreAnalysis: {
        original: v4Data.genre,
        analyzed: genreAnalysis.genre,
        wasChanged: genreAnalysis.genre !== v4Data.genre,
        confidence: genreAnalysis.confidence,
        method: genreAnalysis.method,
        isDefinitelyNotComedy: genreAnalysis.isDefinitelyNotComedy,
        scores: genreAnalysis.scores
      },
      
      structureAnalysis: structure,
      
      confidence: {
        overall: calculateOverallConfidence(cleanedCharacters, protagonist, genreAnalysis),
        level: 'high'
      }
    }
  };
  
  return enriched;
}

function calculateOverallConfidence(characters, protagonist, genreAnalysis) {
  let score = 0;
  if (characters.length >= 5) score += 0.25;
  if (protagonist?.confidence >= 0.7) score += 0.25;
  if (genreAnalysis.confidence === 'high') score += 0.25;
  if (genreAnalysis.confidence !== 'low') score += 0.25;
  return Math.round(score * 100) / 100;
}

// ============================================================================
// PROCESAMIENTO
// ============================================================================

async function processFile(inputPath, outputPath) {
  try {
    const raw = await fs.readFile(inputPath, 'utf8');
    const v4Data = JSON.parse(raw);
    const enriched = await enrichWithV6(v4Data);
    await fs.writeFile(outputPath, JSON.stringify(enriched, null, 2));
    
    return {
      success: true,
      title: enriched.title,
      genreChanged: enriched.v6Analysis.genreAnalysis.wasChanged,
      newGenre: enriched.genre,
      oldGenre: v4Data.genre,
      protagonist: enriched.v6Analysis.protagonist?.name,
      isNotComedy: enriched.v6Analysis.genreAnalysis.isDefinitelyNotComedy
    };
  } catch (error) {
    console.error(`❌ ${inputPath}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function processDirectory(inputDir, outputDir) {
  console.log(`\n🚀 V6 IMPROVED NARRATIVE INTELLIGENCE`);
  console.log(`   Input: ${inputDir}`);
  console.log(`   Output: ${outputDir}\n`);
  
  await fs.mkdir(outputDir, { recursive: true });
  
  const files = await fs.readdir(inputDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  const results = {
    total: jsonFiles.length,
    success: 0,
    errors: 0,
    genresChanged: 0,
    notComedyDetected: 0,
    changes: []
  };
  
  for (const file of jsonFiles) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    
    const result = await processFile(inputPath, outputPath);
    
    if (result.success) {
      results.success++;
      if (result.genreChanged) {
        results.genresChanged++;
        results.changes.push({
          title: result.title,
          from: result.oldGenre,
          to: result.newGenre
        });
      }
      if (result.isNotComedy) results.notComedyDetected++;
    } else {
      results.errors++;
    }
    
    if (results.success % 100 === 0) {
      console.log(`   ✓ ${results.success}/${jsonFiles.length}`);
    }
  }
  
  console.log(`\n📊 V6 SUMMARY:`);
  console.log(`   ✅ Processed: ${results.success}`);
  console.log(`   ❌ Errors: ${results.errors}`);
  console.log(`   🎭 Genres changed: ${results.genresChanged}`);
  console.log(`   🚫 Not-comedy detected: ${results.notComedyDetected}`);
  
  // Mostrar cambios de género
  if (results.changes.length > 0) {
    console.log(`\n   Genre changes:`);
    for (const c of results.changes.slice(0, 20)) {
      console.log(`   - ${c.title}: ${c.from} → ${c.to}`);
    }
    if (results.changes.length > 20) {
      console.log(`   ... and ${results.changes.length - 20} more`);
    }
  }
  
  await fs.writeFile(
    path.join(outputDir, '../analysis-summary-v6.json'),
    JSON.stringify(results, null, 2)
  );
  
  return results;
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(`
🎬 V6 - Improved Narrative Intelligence

Mejoras sobre V5:
  ✓ Género por CONTENIDO (vocabulario oscuro descarta comedy)
  ✓ Protagonista por CONSISTENCIA (no solo diálogos)
  ✓ Correcciones menos agresivas

Usage:
  node enrich-v6-improved.mjs                     Process v4 → v6
  node enrich-v6-improved.mjs --from-v5           Process v5 → v6  
  node enrich-v6-improved.mjs <input> <output>    Custom dirs
  `);
  process.exit(0);
}

const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');

if (args[0] === '--from-v5') {
  const inputDir = path.join(scriptDir, 'enriched-v5');
  const outputDir = path.join(scriptDir, 'enriched-v6');
  processDirectory(inputDir, outputDir);
} else if (args.length >= 2) {
  processDirectory(args[0], args[1]);
} else {
  const inputDir = path.join(scriptDir, 'enriched-v4');
  const outputDir = path.join(scriptDir, 'enriched-v6');
  processDirectory(inputDir, outputDir);
}

export { enrichWithV6, processFile, processDirectory };
