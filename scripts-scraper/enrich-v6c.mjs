#!/usr/bin/env node
/**
 * V6c - Protagonist Detection with Screenwriter Heuristics
 * 
 * Lee del parsed/ que tiene texto completo de escenas
 * Extrae personajes por escena para aplicar heurísticas:
 * - Primera escena
 * - Última escena  
 * - Turning points
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// FALSOS POSITIVOS
// ============================================================================

const FALSE_POSITIVES = new Set([
  'FINAL', 'SHOOTING', 'SCRIPT', 'DRAFT', 'REVISED', 'CONTINUED',
  'CONT', 'MORE', 'THE END', 'FADE IN', 'FADE OUT', 'CUT TO',
  'ON', 'INTO', 'AT', 'FROM', 'TO', 'THE', 'A', 'AN', 'IN', 'OF',
  'ANGLE', 'CLOSE', 'WIDE', 'POV', 'INSERT', 'INTERCUT',
  'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY',
  'SAME', 'TIME', 'CONTINUOUS', 'MOMENTS', 'SUPER', 'TITLE', 
  'CARD', 'FLASHBACK', 'MONTAGE', 'SERIES', 'BACK', 'RESUME',
  'END', 'BEGIN', 'OPENING', 'INT', 'EXT', 'INTERIOR', 'EXTERIOR',
  'BEAT', 'THEN', 'CUT', 'DISSOLVE', 'SMASH', 'MATCH',
  'PINK', 'BLUE', 'WHITE', 'YELLOW', 'GREEN', 'REV', 'REVISION',
  // Ubicaciones comunes mal parseadas como personajes
  'CASTLE', 'HOUSE', 'ROOM', 'OFFICE', 'STREET', 'CAR', 'APARTMENT',
  'HOSPITAL', 'SCHOOL', 'CHURCH', 'BAR', 'RESTAURANT', 'HOTEL',
  'PRISON', 'COURTHOUSE', 'POLICE', 'STATION', 'AIRPORT', 'BEACH',
  'FOREST', 'PARK', 'CITY', 'TOWN', 'VILLAGE', 'BUILDING', 'HALLWAY',
  // Marcadores genéricos
  'UKN', 'UNKNOWN', 'VOICE', 'VOICES', 'MAN', 'WOMAN', 'GIRL', 'BOY',
  'CROWD', 'GROUP', 'EVERYONE', 'ALL', 'OTHERS', 'PEOPLE',
  'PORTABLE', 'PORTABLE BOY', 'HIGH', 'ELEMENTARY', 'MIDDLE',
  'STUDENT', 'STUDENTS', 'TEACHER', 'TEACHERS', 'KID', 'KIDS',
  // Metadatos de guión
  'PRODUCTION', 'DRAFT', 'PRODUCTION DRAFT', 'SHOOTING DRAFT',
  'FIRST DRAFT', 'SECOND DRAFT', 'FINAL DRAFT', 'REVISED DRAFT',
  'AS BROADCAST', 'BROADCAST', 'NETWORK', 'PILOT', 'EPISODE',
  'ANIMATIC', 'ANIMATIC DRAFT', 'STORYBOARD', 'ROUGH DRAFT',
  'TABLE DRAFT', 'WRITERS DRAFT', 'POLISH', 'REWRITE',
  // Ubicaciones religiosas/institucionales
  'SANTA MARTA', 'VATICAN', 'SISTINE', 'CHAPEL', 'CASA',
  'SISTINE CHAPEL', 'ST PETERS', 'BASILICA', 'CATHEDRAL', 'CHURCH',
  'CONCLAVE', 'CARDINALS', 'PAPAL',
  // Títulos de series (suelen parsearse mal)
  'BREAKING BAD', 'COBRA KAI', 'BLACK MIRROR', 'GAME OF THRONES',
  'BIG LITTLE LIES', 'TRUE DETECTIVE', 'STRANGER THINGS'
]);

function isValidCharacter(name, knownChars) {
  if (!name || name.length < 2) return false;
  const n = name.toUpperCase().trim();
  if (FALSE_POSITIVES.has(n)) return false;
  if (!/[AEIOU]/.test(n)) return false;
  if (/^\d+$/.test(n)) return false;
  if (/^[A-Z]{1,2}$/.test(n)) return false;
  // Si tenemos lista de conocidos, verificar
  if (knownChars && knownChars.size > 0) {
    return knownChars.has(n);
  }
  return true;
}

// ============================================================================
// EXTRAER PERSONAJES DEL TEXTO DE ESCENA
// ============================================================================

function extractCharsFromText(text, knownChars) {
  if (!text) return new Set();
  
  const found = new Set();
  
  // Buscar patrones de diálogo: NOMBRE\n o NOMBRE (cont'd)
  const dialoguePattern = /^([A-Z][A-Z\s]+?)(?:\s*\(.*?\))?\s*$/gm;
  let match;
  while ((match = dialoguePattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidCharacter(name, knownChars)) {
      found.add(name);
    }
  }
  
  // Buscar nombres en mayúsculas en el texto de acción
  const actionPattern = /\b([A-Z]{2,}(?:\s+[A-Z]+)?)\b/g;
  while ((match = actionPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (isValidCharacter(name, knownChars)) {
      found.add(name);
    }
  }
  
  return found;
}

// ============================================================================
// CLASIFICACIÓN DE GÉNERO (de V6b)
// ============================================================================

function classifyGenre(data) {
  const scores = data.genreScores || {};
  const comedy = scores.comedy || 0;
  const drama = scores.drama || 0;
  const thriller = scores.thriller || 0;
  const horror = scores.horror || 0;
  const action = scores.action || 0;
  const romance = scores.romance || 0;
  const scifi = scores.scifi || 0;
  
  let genre = data.genre || 'drama';
  let reason = 'original';
  
  // R1: Thriller >50 descalifica comedy
  if (genre === 'comedy' && thriller > 50) {
    genre = 'thriller';
    reason = 'R1: thriller >50';
  }
  
  // R1b: Thriller significativo vs comedy
  if (genre === 'comedy' && thriller > 30 && thriller > comedy * 0.3) {
    genre = 'thriller';
    reason = 'R1b: thriller significativo';
  }
  
  // R1c: Action no dominante → drama
  if (genre === 'action' && drama > 10 && action < 100 && drama > action * 0.3) {
    genre = 'drama';
    reason = 'R1c: action no dominante';
  }
  
  // R2: Comedy/drama empatados → drama
  if (genre === 'comedy') {
    const diff = Math.abs(comedy - drama);
    const tolerance = Math.max(comedy, drama) * 0.3;
    if (diff <= tolerance && drama > 10) {
      genre = 'drama';
      reason = 'R2: empate → drama';
    }
  }
  
  // R5: Romance alto
  if (genre === 'comedy' && romance > comedy * 0.5) {
    genre = 'romance';
    reason = 'R5: romance alto';
  }
  
  // R6: SciFi significativo
  if (scifi > 20 && scifi > comedy * 0.3) {
    genre = 'scifi';
    reason = 'R6: scifi significativo';
  }
  
  // R7: Action dominante
  if (action > 50 && action > Math.max(drama, thriller, comedy)) {
    genre = 'action';
    reason = 'R7: action dominante';
  }
  
  return { genre, original: data.genre, wasChanged: genre !== data.genre, reason };
}

// ============================================================================
// PROTAGONISTA CON HEURÍSTICAS DE GUIONISTA
// ============================================================================

function identifyProtagonist(parsed, v4Data) {
  // Construir set de personajes conocidos del V4
  const knownChars = new Set();
  for (const c of (v4Data.characters || [])) {
    if (c.name) knownChars.add(c.name.toUpperCase());
  }
  
  const scenes = parsed.scenes || [];
  const totalScenes = scenes.length;
  
  if (totalScenes === 0) return null;
  
  // Extraer personajes de primera y última escena
  const firstSceneText = scenes[0]?.slugline || scenes[0]?.action_text || '';
  const lastSceneText = scenes[totalScenes - 1]?.slugline || scenes[totalScenes - 1]?.action_text || '';
  
  const firstSceneChars = extractCharsFromText(firstSceneText, knownChars);
  const lastSceneChars = extractCharsFromText(lastSceneText, knownChars);
  
  // Extraer personajes de turning points (25%, 50%, 75%)
  const act1EndIdx = Math.floor(totalScenes * 0.25);
  const midpointIdx = Math.floor(totalScenes * 0.50);
  const act2EndIdx = Math.floor(totalScenes * 0.75);
  
  const turningPointChars = new Set();
  for (const idx of [act1EndIdx, midpointIdx, act2EndIdx]) {
    if (scenes[idx]) {
      const text = scenes[idx].slugline || scenes[idx].action_text || '';
      for (const c of extractCharsFromText(text, knownChars)) {
        turningPointChars.add(c);
      }
    }
  }
  
  // Calcular stats por personaje del V4
  const charStats = {};
  for (const c of (v4Data.characters || [])) {
    if (!c.name) continue;
    const name = c.name.toUpperCase();
    if (!isValidCharacter(name, null)) continue;
    
    // Filtrar "ubicaciones disfrazadas": muchas escenas pero casi ningún diálogo
    // Ratio sospechoso: >10 escenas pero <5 líneas de diálogo
    const scenes = c.scenesPresent || 0;
    const lines = c.dialogueLines || 0;
    if (scenes > 10 && lines < 5) {
      continue; // Probablemente es una ubicación, no un personaje
    }
    
    charStats[name] = {
      name: c.name,
      dialogueLines: lines,
      scenesPresent: scenes,
      totalWords: c.totalWords || 0
    };
  }
  
  const totalDialogues = v4Data.metrics?.totalDialogues || 1;
  
  // Calcular score con heurísticas de guionista
  const scored = Object.values(charStats).map(char => {
    const name = char.name.toUpperCase();
    
    // ═══ MÉTRICAS DE PROTAGONISTA ═══
    // Un protagonista HABLA más y sus palabras IMPORTAN más
    
    // Diálogos: peso alto (35%)
    const dialogueScore = char.dialogueLines / totalDialogues;
    
    // Palabras: peso alto (25%) - protagonista tiene diálogos sustanciales
    const maxWords = Math.max(...Object.values(charStats).map(c => c.totalWords || 0));
    const wordsScore = maxWords > 0 ? (char.totalWords || 0) / maxWords : 0;
    
    // Presencia: peso menor (15%) - aparecer no es lo mismo que protagonizar
    const presenceScore = char.scenesPresent / totalScenes;
    
    // Heurísticas de guionista (25%)
    const inFirstScene = firstSceneChars.has(name);
    const inLastScene = lastSceneChars.has(name);
    const inTurningPoints = turningPointChars.has(name);
    
    // Score ponderado: DIÁLOGOS + PALABRAS + SEÑALES + PRESENCIA
    const baseScore = 
      dialogueScore * 0.30 + 
      wordsScore * 0.20 +
      presenceScore * 0.15;
    
    const screenwriterScore = 
      (inFirstScene ? 0.12 : 0) + 
      (inLastScene ? 0.10 : 0) + 
      (inTurningPoints ? 0.08 : 0);
    
    // BONUS: Si tiene TODAS las señales de guionista, es muy probablemente el protagonista
    // Esto resuelve casos como Whiplash donde ANDREW aparece en 1st+last+TP pero habla menos
    const allSignalsBonus = (inFirstScene && inLastScene && inTurningPoints) ? 0.15 : 0;
    
    const total = baseScore + screenwriterScore + allSignalsBonus;
    
    return {
      ...char,
      score: Math.round(total * 100) / 100,
      signals: { firstScene: inFirstScene, lastScene: inLastScene, turningPoints: inTurningPoints }
    };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  if (scored.length === 0) return null;
  
  const winner = scored[0];
  const second = scored[1];
  
  // Confianza
  let confidence = 0.6;
  if (second) {
    const gap = winner.score - second.score;
    confidence = Math.min(0.5 + gap * 3, 1);
  }
  
  // Boost por señales de guionista
  const signalCount = [winner.signals.firstScene, winner.signals.lastScene, winner.signals.turningPoints].filter(Boolean).length;
  confidence = Math.min(confidence + signalCount * 0.1, 1);
  
  // Detectar ensemble: si top 3 tienen scores muy cercanos
  const top3 = scored.slice(0, 3);
  let isEnsemble = false;
  let ensembleCharacters = null;
  
  if (top3.length >= 3) {
    const scoreRange = top3[0].score - top3[2].score;
    // Si la diferencia entre 1º y 3º es menor a 0.15, es ensemble
    if (scoreRange < 0.15) {
      isEnsemble = true;
      ensembleCharacters = top3.map(c => ({
        name: c.name,
        score: c.score,
        signals: c.signals
      }));
      confidence = 0.5; // Baja confianza en protagonista único
    }
  }
  
  return {
    name: winner.name,
    dialogueLines: winner.dialogueLines,
    scenesPresent: winner.scenesPresent,
    score: winner.score,
    confidence: Math.round(confidence * 100) / 100,
    screenwriterSignals: winner.signals,
    isEnsemble,
    ensembleCharacters,
    runnerUp: second ? { 
      name: second.name, 
      score: second.score,
      signals: second.signals
    } : null
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function enrichV6c(parsedPath, v4Path) {
  const parsed = JSON.parse(await fs.readFile(parsedPath, 'utf8'));
  const v4Data = JSON.parse(await fs.readFile(v4Path, 'utf8'));
  
  const genreResult = classifyGenre(v4Data);
  const protagonist = identifyProtagonist(parsed, v4Data);
  
  // Limpiar personajes
  const cleanChars = (v4Data.characters || []).filter(c => 
    c.name && isValidCharacter(c.name.toUpperCase(), null)
  );
  
  return {
    ...v4Data,
    genre: genreResult.genre,
    characters: cleanChars,
    v6Analysis: {
      version: '6c',
      analyzedAt: new Date().toISOString(),
      protagonist,
      genreAnalysis: genreResult,
      charactersCleaned: {
        original: v4Data.characters?.length || 0,
        valid: cleanChars.length
      }
    }
  };
}

async function processAll() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const parsedDir = path.join(scriptDir, 'parsed');
  const v4Dir = path.join(scriptDir, 'enriched-v4');
  const outputDir = path.join(scriptDir, 'enriched-v6c');
  
  console.log(`\n🚀 V6c - Screenwriter Heuristics from Parsed Text\n`);
  
  await fs.mkdir(outputDir, { recursive: true });
  
  const files = (await fs.readdir(parsedDir)).filter(f => f.endsWith('.json'));
  
  const stats = { ok: 0, err: 0, changed: 0 };
  
  for (const file of files) {
    try {
      const parsedPath = path.join(parsedDir, file);
      const v4Path = path.join(v4Dir, file);
      
      // Verificar que existe en V4
      try {
        await fs.access(v4Path);
      } catch {
        continue; // Skip si no existe en V4
      }
      
      const enriched = await enrichV6c(parsedPath, v4Path);
      await fs.writeFile(path.join(outputDir, file), JSON.stringify(enriched, null, 2));
      
      stats.ok++;
      if (enriched.v6Analysis.genreAnalysis.wasChanged) stats.changed++;
      
      if (stats.ok % 100 === 0) console.log(`   ✓ ${stats.ok}`);
    } catch (e) {
      stats.err++;
      console.error(`❌ ${file}: ${e.message}`);
    }
  }
  
  console.log(`\n📊 V6c SUMMARY:`);
  console.log(`   ✅ Processed: ${stats.ok}`);
  console.log(`   ❌ Errors: ${stats.err}`);
  console.log(`   🎭 Genres changed: ${stats.changed}`);
}

// Solo Whiplash para test rápido
async function testWhiplash() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  
  const enriched = await enrichV6c(
    path.join(scriptDir, 'parsed/whiplash-2014.json'),
    path.join(scriptDir, 'enriched-v4/whiplash-2014.json')
  );
  
  console.log('\n🎬 WHIPLASH V6c TEST:\n');
  console.log(`Género: ${enriched.v6Analysis.genreAnalysis.original} → ${enriched.genre}`);
  console.log(`\nProtagonista: ${enriched.v6Analysis.protagonist.name}`);
  console.log(`Score: ${enriched.v6Analysis.protagonist.score}`);
  console.log(`Confianza: ${enriched.v6Analysis.protagonist.confidence}`);
  console.log(`Señales: ${JSON.stringify(enriched.v6Analysis.protagonist.screenwriterSignals)}`);
  
  if (enriched.v6Analysis.protagonist.runnerUp) {
    console.log(`\nRunner-up: ${enriched.v6Analysis.protagonist.runnerUp.name}`);
    console.log(`Score: ${enriched.v6Analysis.protagonist.runnerUp.score}`);
    console.log(`Señales: ${JSON.stringify(enriched.v6Analysis.protagonist.runnerUp.signals)}`);
  }
  
  console.log(`\nDebug - Primera escena: ${enriched.v6Analysis.protagonist.debug.firstSceneChars.join(', ')}`);
  console.log(`Debug - Última escena: ${enriched.v6Analysis.protagonist.debug.lastSceneChars.join(', ')}`);
}

// CLI
const args = process.argv.slice(2);
if (args[0] === '--test') {
  testWhiplash();
} else {
  processAll();
}
