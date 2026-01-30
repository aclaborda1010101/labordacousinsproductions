#!/usr/bin/env node
/**
 * Enrich directamente desde parsed/ (sin necesitar V4)
 * Crea V4 + V6c en un solo paso
 */

import { promises as fs } from 'fs';
import path from 'path';

const FALSE_POSITIVES = new Set([
  'FINAL', 'SHOOTING', 'SCRIPT', 'DRAFT', 'PRODUCTION', 'REVISED',
  'CONTINUED', 'CONT', 'THE END', 'FADE IN', 'FADE OUT', 'CUT TO',
  'ON', 'INTO', 'AT', 'FROM', 'TO', 'THE', 'A', 'AN', 'IN', 'OF',
  'ANGLE', 'CLOSE', 'WIDE', 'POV', 'INSERT', 'INTERCUT',
  'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY',
  'INT', 'EXT', 'INTERIOR', 'EXTERIOR', 'CONTINUOUS',
  'CASTLE', 'HOUSE', 'ROOM', 'OFFICE', 'STREET', 'CAR', 'APARTMENT',
  'UKN', 'UNKNOWN', 'VOICE', 'MAN', 'WOMAN', 'CROWD', 'GROUP'
]);

function isValidChar(name) {
  if (!name || name.length < 2 || name.length > 30) return false;
  const n = name.toUpperCase().trim();
  if (FALSE_POSITIVES.has(n)) return false;
  if (!/[AEIOU]/.test(n)) return false;
  if (/SCRIPT|DRAFT|SHOOTING|REVISED|PRODUCTION/.test(n)) return false;
  return true;
}

async function enrichFromParsed(parsedPath) {
  const parsed = JSON.parse(await fs.readFile(parsedPath, 'utf8'));
  
  const scenes = parsed.scenes || [];
  const totalScenes = scenes.length || 1;
  
  // Calcular métricas
  let totalWords = 0;
  let totalDialogues = 0;
  let intCount = 0;
  let extCount = 0;
  const charStats = {};
  const locations = new Set();
  
  for (const scene of scenes) {
    totalWords += scene.word_count || 0;
    totalDialogues += scene.dialogue_count || 0;
    
    const heading = (scene.slugline || scene.heading || '').toUpperCase();
    if (heading.startsWith('INT')) intCount++;
    if (heading.startsWith('EXT')) extCount++;
    
    // Extraer ubicación
    const locMatch = heading.match(/(?:INT\.|EXT\.)\s*([^-]+)/);
    if (locMatch) locations.add(locMatch[1].trim());
    
    // Contar personajes
    for (const char of (scene.characters || [])) {
      if (!isValidChar(char)) continue;
      if (!charStats[char]) charStats[char] = { lines: 0, scenes: 0 };
      charStats[char].scenes++;
    }
  }
  
  // Calcular personajes desde parsed.characters si existe
  for (const char of (parsed.characters || [])) {
    const name = typeof char === 'string' ? char : char.name;
    if (!isValidChar(name)) continue;
    if (!charStats[name]) charStats[name] = { lines: 0, scenes: 0 };
  }
  
  const characters = Object.entries(charStats)
    .map(([name, s]) => ({ name, dialogueLines: s.lines || 1, scenesPresent: s.scenes || 1 }))
    .sort((a, b) => b.scenesPresent - a.scenesPresent);
  
  // Detectar género simple
  const text = JSON.stringify(parsed).toLowerCase();
  const genreScores = {
    thriller: (text.match(/kill|murder|dead|death|crime/g) || []).length,
    horror: (text.match(/scream|terror|monster|fear/g) || []).length,
    comedy: (text.match(/laugh|funny|joke/g) || []).length,
    drama: (text.match(/family|love|heart|hope/g) || []).length,
    action: (text.match(/gun|shoot|fight|chase/g) || []).length,
    romance: (text.match(/love|kiss|romantic/g) || []).length,
    scifi: (text.match(/space|alien|robot|future/g) || []).length
  };
  
  let genre = 'drama';
  let maxScore = 0;
  for (const [g, s] of Object.entries(genreScores)) {
    if (s > maxScore) { maxScore = s; genre = g; }
  }
  
  // Aplicar reglas de corrección
  if (genre === 'comedy' && genreScores.thriller > 50) genre = 'thriller';
  if (genre === 'comedy' && genreScores.drama > genreScores.comedy * 0.7) genre = 'drama';
  if (genre === 'action' && genreScores.drama > genreScores.action * 0.5) genre = 'drama';
  
  // Identificar protagonista
  const validChars = characters.filter(c => isValidChar(c.name));
  let protagonist = null;
  
  if (validChars.length > 0) {
    // Extraer personajes de primera y última escena
    const firstChars = new Set((scenes[0]?.characters || []).map(c => c.toUpperCase()));
    const lastChars = new Set((scenes[scenes.length-1]?.characters || []).map(c => c.toUpperCase()));
    
    const scored = validChars.map(char => {
      const name = char.name.toUpperCase();
      const presenceScore = char.scenesPresent / totalScenes;
      const firstBonus = firstChars.has(name) ? 0.2 : 0;
      const lastBonus = lastChars.has(name) ? 0.15 : 0;
      const total = presenceScore * 0.5 + firstBonus + lastBonus;
      
      return { ...char, score: total, signals: { first: firstBonus > 0, last: lastBonus > 0 } };
    });
    
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];
    const second = scored[1];
    
    const isEnsemble = scored.length >= 3 && (scored[0].score - scored[2].score) < 0.15;
    
    protagonist = {
      name: winner.name,
      scenesPresent: winner.scenesPresent,
      score: winner.score,
      confidence: isEnsemble ? 0.5 : Math.min(0.6 + (second ? (winner.score - second.score) * 2 : 0.3), 1),
      isEnsemble,
      screenwriterSignals: winner.signals,
      runnerUp: second ? { name: second.name, score: second.score } : null
    };
  }
  
  return {
    slug: parsed.slug || path.basename(parsedPath, '.json'),
    title: parsed.title || parsed.slug,
    year: parsed.year || null,
    format: parsed.format || 'film',
    genre,
    genreScores,
    metrics: {
      totalScenes,
      totalWords,
      intCount,
      extCount,
      intRatio: totalScenes > 0 ? Math.round(intCount / totalScenes * 100) / 100 : 0.5,
      totalDialogues,
      uniqueLocations: locations.size,
      uniqueCharacters: characters.length
    },
    structure: {
      totalScenes,
      act1End: Math.floor(totalScenes * 0.25),
      midpoint: Math.floor(totalScenes * 0.50),
      act2End: Math.floor(totalScenes * 0.75)
    },
    characters: validChars.slice(0, 40),
    v6Analysis: {
      version: '6c-direct',
      protagonist,
      genreAnalysis: { original: genre, genre, wasChanged: false }
    }
  };
}

async function processAll() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const parsedDir = path.join(scriptDir, 'parsed');
  const v4Dir = path.join(scriptDir, 'enriched-v4');
  const outputDir = path.join(scriptDir, 'enriched-v6c');
  
  // Encontrar archivos sin V4
  const parsedFiles = await fs.readdir(parsedDir);
  const v4Files = new Set(await fs.readdir(v4Dir));
  
  const missing = parsedFiles.filter(f => f.endsWith('.json') && !v4Files.has(f));
  
  console.log(`\n🚀 Procesando ${missing.length} guiones sin V4...\n`);
  
  let ok = 0, err = 0;
  
  for (const file of missing) {
    try {
      const enriched = await enrichFromParsed(path.join(parsedDir, file));
      await fs.writeFile(path.join(outputDir, file), JSON.stringify(enriched, null, 2));
      ok++;
      if (ok % 50 === 0) console.log(`   ✓ ${ok}/${missing.length}`);
    } catch (e) {
      err++;
      console.error(`❌ ${file}: ${e.message}`);
    }
  }
  
  console.log(`\n📊 RESUMEN:`);
  console.log(`   ✅ Procesados: ${ok}`);
  console.log(`   ❌ Errores: ${err}`);
}

processAll();
