#!/usr/bin/env node
/**
 * V6b - Genre Tiebreaker Rules
 * 
 * Problema: V4 clasifica mal (Joker = comedy)
 * Solución: Usar genreScores + reglas de desempate globales
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// FALSOS POSITIVOS (heredado)
// ============================================================================

const FALSE_POSITIVES = new Set([
  'FINAL', 'SHOOTING SCRIPT', 'DRAFT', 'REVISED', 'CONTINUED',
  'CONT', 'MORE', 'THE END', 'FADE IN', 'FADE OUT', 'CUT TO',
  'ON', 'INTO', 'AT', 'FROM', 'TO', 'THE', 'A', 'AN', 'IN', 'OF',
  'ANGLE', 'CLOSE', 'WIDE', 'POV', 'INSERT', 'INTERCUT',
  'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY',
  'SAME TIME', 'CONTINUOUS', 'MOMENTS LATER',
  'SUPER', 'TITLE', 'CARD', 'FLASHBACK', 'MONTAGE', 'SERIES',
  'V.O', 'O.S', 'O.C', 'PRELAP', 'PRE-LAP',
  'BACK TO', 'RESUME', 'END', 'BEGIN', 'OPENING'
]);

const FALSE_PATTERNS = [/^[A-Z]{1,3}$/, /^\d+$/, /CONTINUED/, /^\(.*\)$/];

function isValidCharacter(name) {
  if (!name) return false;
  const n = name.trim().toUpperCase();
  if (FALSE_POSITIVES.has(n)) return false;
  for (const p of FALSE_PATTERNS) if (p.test(n)) return false;
  if (n.length < 2 || !/[AEIOU]/.test(n)) return false;
  return true;
}

// ============================================================================
// V6b: REGLAS DE DESEMPATE DE GÉNERO (GLOBAL)
// ============================================================================

function classifyGenreV6b(screenplay) {
  const scores = screenplay.genreScores || {};
  const metrics = screenplay.metrics || {};
  
  // Extraer scores
  const comedy = scores.comedy || 0;
  const drama = scores.drama || 0;
  const thriller = scores.thriller || 0;
  const horror = scores.horror || 0;
  const action = scores.action || 0;
  const romance = scores.romance || 0;
  const scifi = scores.scifi || 0;
  
  // Métricas útiles
  const intRatio = metrics.intRatio || 0.5;
  const nightRatio = metrics.nightRatio || 0.5;
  const dialogueRatio = metrics.dialogueRatio || 0.5;
  
  let finalGenre = screenplay.genre || 'drama';
  let reason = 'original';
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 1: Si thriller tiene score >50, NO es comedy (ABSOLUTO)
  // ═══════════════════════════════════════════════════════════════════
  if (finalGenre === 'comedy' && thriller > 50) {
    finalGenre = 'thriller';
    reason = 'R1: thriller >50 descalifica comedy';
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 1b: Si thriller tiene score significativo vs comedy
  // ═══════════════════════════════════════════════════════════════════
  if (finalGenre === 'comedy' && thriller > 30) {
    if (thriller > comedy * 0.3) {
      finalGenre = 'thriller';
      reason = 'R1b: thriller score significativo';
    } else if (drama > comedy * 0.5) {
      finalGenre = 'drama';
      reason = 'R1b: drama score significativo vs comedy';
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 1c: Action alto mal clasificado como comedy/action → drama
  // ═══════════════════════════════════════════════════════════════════
  if (finalGenre === 'action' && drama > 10 && action < 100) {
    // Si action no es dominante, verificar si debería ser drama
    if (drama > action * 0.3) {
      finalGenre = 'drama';
      reason = 'R1c: action no dominante, drama significativo';
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 2: Comedy y drama empatados → drama gana
  // ═══════════════════════════════════════════════════════════════════
  if (finalGenre === 'comedy') {
    const diff = Math.abs(comedy - drama);
    const tolerance = Math.max(comedy, drama) * 0.3; // 30% de tolerancia
    
    if (diff <= tolerance && drama > 10) {
      finalGenre = 'drama';
      reason = 'R2: comedy/drama empatados, drama gana';
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 3: Muchos interiores (>70%) + poco diálogo → thriller/drama
  // ═══════════════════════════════════════════════════════════════════
  if (finalGenre === 'comedy' && intRatio > 0.7 && dialogueRatio < 0.5) {
    finalGenre = thriller > drama ? 'thriller' : 'drama';
    reason = 'R3: claustrofóbico (int alto, diálogo bajo)';
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 4: Si horror tiene score y comedy, verificar balance
  // ═══════════════════════════════════════════════════════════════════
  if (finalGenre === 'comedy' && horror > 5) {
    if (horror > comedy * 0.3) {
      finalGenre = 'horror';
      reason = 'R4: horror score significativo';
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 5: Romance alto + comedy → romance
  // ═══════════════════════════════════════════════════════════════════
  if (finalGenre === 'comedy' && romance > comedy * 0.5) {
    finalGenre = 'romance';
    reason = 'R5: romance score alto';
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 6: SciFi alto → scifi (no importa comedy)
  // ═══════════════════════════════════════════════════════════════════
  if (scifi > 20 && scifi > comedy * 0.3) {
    finalGenre = 'scifi';
    reason = 'R6: scifi score significativo';
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // REGLA 7: Action muy alto → mantener action
  // ═══════════════════════════════════════════════════════════════════
  if (action > 50 && action > Math.max(drama, thriller, comedy)) {
    finalGenre = 'action';
    reason = 'R7: action dominante';
  }
  
  return {
    genre: finalGenre,
    original: screenplay.genre,
    wasChanged: finalGenre !== screenplay.genre,
    reason,
    scores: { comedy, drama, thriller, horror, action, romance, scifi }
  };
}

// ============================================================================
// PROTAGONISTA MEJORADO (V6b) - PENSANDO COMO GUIONISTA
// ============================================================================

function identifyProtagonist(characters, metrics, screenplay) {
  const valid = characters.filter(c => isValidCharacter(c.name));
  if (valid.length === 0) return null;
  
  const totalScenes = metrics?.totalScenes || 1;
  const totalDialogues = metrics?.totalDialogues || 1;
  const structure = screenplay?.structure || {};
  
  // Extraer personajes de escenas clave si están disponibles
  const scenes = screenplay?.scenes || [];
  const firstSceneChars = extractCharsFromScene(scenes[0]);
  const lastSceneChars = extractCharsFromScene(scenes[scenes.length - 1]);
  
  // Escenas de turning points
  const act1EndScene = scenes[structure.act1End - 1];
  const midpointScene = scenes[structure.midpoint - 1];
  const act2EndScene = scenes[structure.act2End - 1];
  
  const turningPointChars = new Set([
    ...extractCharsFromScene(act1EndScene),
    ...extractCharsFromScene(midpointScene),
    ...extractCharsFromScene(act2EndScene)
  ]);
  
  const scored = valid.map(char => {
    const name = char.name.toUpperCase();
    
    // Factor 1: Diálogos (25%)
    const dialogueScore = (char.dialogueLines || 0) / totalDialogues;
    
    // Factor 2: Presencia en escenas (25%)
    const presenceScore = (char.scenesPresent || 0) / totalScenes;
    
    // Factor 3: Palabras totales (10%)
    const wordsScore = Math.min((char.totalWords || 0) / 1000, 1);
    
    // ═══ HEURÍSTICAS DE GUIONISTA ═══
    
    // Factor 4: ¿Aparece en primera escena? (15%)
    // El protagonista suele introducirse primero
    const firstSceneBonus = firstSceneChars.has(name) ? 1 : 0;
    
    // Factor 5: ¿Aparece en última escena? (10%)
    // El protagonista suele cerrar la historia
    const lastSceneBonus = lastSceneChars.has(name) ? 1 : 0;
    
    // Factor 6: ¿Aparece en turning points? (15%)
    // El protagonista está en los momentos clave
    const turningPointBonus = turningPointChars.has(name) ? 1 : 0;
    
    // Calcular score total con pesos de guionista
    const total = 
      dialogueScore * 0.25 + 
      presenceScore * 0.25 + 
      wordsScore * 0.10 +
      firstSceneBonus * 0.15 +
      lastSceneBonus * 0.10 +
      turningPointBonus * 0.15;
    
    return { 
      ...char, 
      score: Math.round(total * 100) / 100,
      bonuses: {
        firstScene: firstSceneBonus > 0,
        lastScene: lastSceneBonus > 0,
        turningPoints: turningPointBonus > 0
      }
    };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  const winner = scored[0];
  const second = scored[1];
  
  // Confianza basada en gap + bonuses
  let confidence = 0.6;
  if (second) {
    const gap = winner.score - second.score;
    confidence = Math.min(0.5 + gap * 4, 1);
  }
  
  // Boost de confianza si tiene bonuses de guionista
  const bonusCount = [winner.bonuses.firstScene, winner.bonuses.lastScene, winner.bonuses.turningPoints].filter(Boolean).length;
  confidence = Math.min(confidence + bonusCount * 0.1, 1);
  
  return {
    name: winner.name,
    dialogueLines: winner.dialogueLines,
    scenesPresent: winner.scenesPresent,
    score: winner.score,
    confidence: Math.round(confidence * 100) / 100,
    screenwriterSignals: winner.bonuses,
    runnerUp: second ? { name: second.name, score: second.score, bonuses: second.bonuses } : null
  };
}

// Extrae personajes mencionados en una escena
function extractCharsFromScene(scene) {
  if (!scene) return new Set();
  
  const chars = new Set();
  
  // De los diálogos de la escena
  if (scene.dialogues) {
    for (const d of scene.dialogues) {
      if (d.character) chars.add(d.character.toUpperCase());
    }
  }
  
  // Del texto de la escena (buscar nombres en MAYÚSCULAS)
  const text = scene.text || scene.action || scene.description || '';
  const matches = text.match(/\b[A-Z]{2,}(?:\s+[A-Z]+)?\b/g) || [];
  for (const m of matches) {
    if (isValidCharacter(m)) chars.add(m);
  }
  
  return chars;
}

// ============================================================================
// ESTRUCTURA (heredado)
// ============================================================================

function analyzeStructure(screenplay) {
  const total = screenplay.metrics?.totalScenes || 1;
  const s = screenplay.structure || {};
  
  const r1 = s.act1End ? s.act1End / total : 0.25;
  const r2 = s.midpoint ? s.midpoint / total : 0.50;
  const r3 = s.act2End ? s.act2End / total : 0.75;
  
  let type = 'classic-three-act';
  if (r1 < 0.15) type = 'in-medias-res';
  else if (r2 < 0.40) type = 'front-loaded';
  else if (r2 > 0.60) type = 'slow-burn';
  else if (r3 > 0.85) type = 'fast-climax';
  
  return {
    act1End: { scene: s.act1End, ratio: Math.round(r1 * 100) / 100 },
    midpoint: { scene: s.midpoint, ratio: Math.round(r2 * 100) / 100 },
    act2End: { scene: s.act2End, ratio: Math.round(r3 * 100) / 100 },
    type
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function enrichV6b(data) {
  const cleanChars = (data.characters || []).filter(c => isValidCharacter(c.name));
  const genreResult = classifyGenreV6b(data);
  const protagonist = identifyProtagonist(cleanChars, data.metrics, data);
  const structure = analyzeStructure(data);
  
  return {
    ...data,
    genre: genreResult.genre,
    characters: cleanChars,
    v6Analysis: {
      version: '6b',
      analyzedAt: new Date().toISOString(),
      protagonist,
      charactersCleaned: {
        original: data.characters?.length || 0,
        valid: cleanChars.length,
        removed: (data.characters?.length || 0) - cleanChars.length
      },
      genreAnalysis: genreResult,
      structureAnalysis: structure
    }
  };
}

async function processAll(inputDir, outputDir) {
  console.log(`\n🚀 V6b - Genre Tiebreaker Rules\n`);
  
  await fs.mkdir(outputDir, { recursive: true });
  
  const files = (await fs.readdir(inputDir)).filter(f => f.endsWith('.json'));
  
  const stats = { ok: 0, err: 0, changed: 0, changes: [] };
  
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(inputDir, file), 'utf8');
      const data = JSON.parse(raw);
      const enriched = await enrichV6b(data);
      await fs.writeFile(path.join(outputDir, file), JSON.stringify(enriched, null, 2));
      
      stats.ok++;
      if (enriched.v6Analysis.genreAnalysis.wasChanged) {
        stats.changed++;
        stats.changes.push({
          title: data.title,
          from: data.genre,
          to: enriched.genre,
          reason: enriched.v6Analysis.genreAnalysis.reason
        });
      }
      
      if (stats.ok % 100 === 0) console.log(`   ✓ ${stats.ok}/${files.length}`);
    } catch (e) {
      stats.err++;
      console.error(`❌ ${file}: ${e.message}`);
    }
  }
  
  console.log(`\n📊 V6b SUMMARY:`);
  console.log(`   ✅ Processed: ${stats.ok}`);
  console.log(`   ❌ Errors: ${stats.err}`);
  console.log(`   🎭 Genres changed: ${stats.changed}`);
  
  if (stats.changes.length > 0) {
    console.log(`\n   Changes:`);
    for (const c of stats.changes) {
      console.log(`   - ${c.title}: ${c.from} → ${c.to} (${c.reason})`);
    }
  }
  
  await fs.writeFile(
    path.join(outputDir, '../analysis-summary-v6b.json'),
    JSON.stringify(stats, null, 2)
  );
}

// CLI
const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const inputDir = path.join(scriptDir, 'enriched-v4');
const outputDir = path.join(scriptDir, 'enriched-v6b');

processAll(inputDir, outputDir);
