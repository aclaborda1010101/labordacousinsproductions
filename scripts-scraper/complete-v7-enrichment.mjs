#!/usr/bin/env node
/**
 * Completar enriquecimiento V7 de archivos faltantes
 * Procesa parsed/ → enriched-v7/ usando la misma lógica V7
 */

import { promises as fs } from 'fs';
import path from 'path';

const FALSE_POSITIVES = new Set([
  'FINAL', 'SHOOTING', 'SCRIPT', 'DRAFT', 'PRODUCTION', 'REVISED',
  'CONTINUED', 'CONT', 'CUT TO', 'FADE IN', 'FADE OUT', 'THE END',
  'INT', 'EXT', 'INTERIOR', 'EXTERIOR', 'CONTINUOUS',
  'CASTLE', 'HOUSE', 'ROOM', 'OFFICE', 'STREET', 'CAR', 'APARTMENT',
  'CASA', 'SANTA MARTA', 'SISTINE', 'CHAPEL', 'VATICAN', 'PAPAL',
  'SISTINE CHAPEL', 'APARTMENT BLOCK', 'CONCLAVE', 'BASILICA',
  'VOICE', 'MAN', 'WOMAN', 'CROWD', 'GROUP', 'PEOPLE', 'UNKNOWN',
  'UKN', 'ANGLE', 'CLOSE', 'WIDE', 'POV', 'INSERT', 'INTERCUT',
  'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY',
  'ON', 'INTO', 'AT', 'FROM', 'TO', 'THE', 'A', 'AN', 'IN', 'OF'
]);

function isValidCharacter(name) {
  if (!name || name.length < 2 || name.length > 30) return false;
  const n = name.toUpperCase().trim();
  if (FALSE_POSITIVES.has(n)) return false;
  if (!/[AEIOU]/.test(n)) return false; // Debe tener al menos una vocal
  if (/SCRIPT|DRAFT|SHOOTING|REVISED|PRODUCTION|BLOCK|CHAPEL|MARTA/.test(n)) return false;
  return true;
}

async function enrichScript(parsedPath) {
  const parsed = JSON.parse(await fs.readFile(parsedPath, 'utf8'));
  
  const scenes = parsed.scenes || [];
  const totalScenes = scenes.length || 1;
  
  // Calcular métricas base
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
    if (locMatch) {
      const loc = locMatch[1].trim();
      if (loc && loc.length < 50) locations.add(loc);
    }
    
    // Contar apariciones de personajes
    for (const char of (scene.characters || [])) {
      if (!isValidCharacter(char)) continue;
      if (!charStats[char]) charStats[char] = { lines: 0, scenes: 0, firstScene: scene.scene_number || 0 };
      charStats[char].scenes++;
      charStats[char].lines += scene.dialogue_count || 0;
    }
  }
  
  // Agregar personajes del nivel superior
  for (const char of (parsed.characters || [])) {
    const name = typeof char === 'string' ? char : char.name;
    if (!isValidCharacter(name)) continue;
    if (!charStats[name]) {
      charStats[name] = { lines: 0, scenes: 0, firstScene: 0 };
    }
  }
  
  const characters = Object.entries(charStats)
    .map(([name, stats]) => ({ 
      name, 
      dialogueLines: stats.lines || 1, 
      scenesPresent: stats.scenes || 1,
      firstAppearance: stats.firstScene
    }))
    .sort((a, b) => b.scenesPresent - a.scenesPresent || b.dialogueLines - a.dialogueLines);
  
  // Detectar género con puntuación mejorada
  const text = JSON.stringify(parsed).toLowerCase();
  const genreScores = {
    thriller: (text.match(/\b(kill|murder|dead|death|crime|detective|investigation|suspect)\b/g) || []).length,
    horror: (text.match(/\b(scream|terror|monster|fear|blood|ghost|demon)\b/g) || []).length,
    comedy: (text.match(/\b(laugh|funny|joke|hilarious|comedy)\b/g) || []).length,
    drama: (text.match(/\b(family|emotional|heart|hope|struggle|life)\b/g) || []).length,
    action: (text.match(/\b(gun|shoot|fight|chase|explosion|battle)\b/g) || []).length,
    romance: (text.match(/\b(love|kiss|romantic|relationship|heart)\b/g) || []).length,
    scifi: (text.match(/\b(space|alien|robot|future|technology|ai)\b/g) || []).length
  };
  
  let genre = 'drama';
  let maxScore = 0;
  for (const [g, score] of Object.entries(genreScores)) {
    if (score > maxScore) { 
      maxScore = score; 
      genre = g; 
    }
  }
  
  // Reglas de corrección de género
  if (genre === 'comedy' && genreScores.thriller > 50) genre = 'thriller';
  if (genre === 'comedy' && genreScores.drama > genreScores.comedy * 0.7) genre = 'drama';
  if (genre === 'action' && genreScores.drama > genreScores.action * 0.5) genre = 'drama';
  
  // Identificar protagonista (V7 mejorado)
  const validChars = characters.filter(c => isValidCharacter(c.name));
  let protagonist = null;
  
  if (validChars.length > 0 && scenes.length > 0) {
    // Personajes en primera y última escena (señal del guionista)
    const firstChars = new Set((scenes[0]?.characters || []).map(c => c.toUpperCase()));
    const lastChars = new Set((scenes[scenes.length - 1]?.characters || []).map(c => c.toUpperCase()));
    
    const scored = validChars.map(char => {
      const name = char.name.toUpperCase();
      const presenceScore = char.scenesPresent / totalScenes; // % de escenas
      const dialogueScore = totalDialogues > 0 ? char.dialogueLines / totalDialogues : 0; // % de diálogos
      const firstBonus = firstChars.has(name) ? 0.2 : 0;
      const lastBonus = lastChars.has(name) ? 0.15 : 0;
      
      const total = presenceScore * 0.4 + dialogueScore * 0.3 + firstBonus + lastBonus;
      
      return { 
        ...char, 
        score: total, 
        signals: { 
          inFirst: firstBonus > 0, 
          inLast: lastBonus > 0 
        } 
      };
    });
    
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];
    const second = scored[1];
    
    // Detectar ensemble (3+ personajes con scores similares)
    const isEnsemble = scored.length >= 3 && 
      (scored[0].score - scored[2].score) < scored[0].score * 0.25;
    
    protagonist = {
      name: winner.name,
      dialogueLines: winner.dialogueLines,
      scenesPresent: winner.scenesPresent,
      score: Math.round(winner.score * 100) / 100,
      confidence: isEnsemble 
        ? 0.5 
        : Math.min(0.6 + (second ? (winner.score - second.score) * 2.5 : 0.4), 1),
      isEnsemble,
      screenwriterSignals: winner.signals,
      runnerUp: second ? { 
        name: second.name, 
        score: Math.round(second.score * 100) / 100 
      } : null,
      source: 'parsed-v7'
    };
  }
  
  // Estructura de actos (points de guión clásico)
  const structure = {
    totalScenes,
    act1End: Math.floor(totalScenes * 0.25),    // ~25%
    midpoint: Math.floor(totalScenes * 0.50),   // ~50%
    act2End: Math.floor(totalScenes * 0.75),    // ~75%
    climax: Math.floor(totalScenes * 0.90)      // ~90%
  };
  
  return {
    slug: parsed.slug || path.basename(parsedPath, '.json'),
    title: parsed.title || parsed.slug || 'Unknown',
    year: parsed.year || null,
    format: parsed.format || 'film',
    genre,
    genreScores,
    metrics: {
      totalScenes,
      totalWords,
      intCount,
      extCount,
      intRatio: totalScenes > 0 ? Math.round((intCount / totalScenes) * 100) / 100 : 0.5,
      totalDialogues,
      uniqueLocations: locations.size,
      uniqueCharacters: validChars.length
    },
    structure,
    characters: validChars.slice(0, 40), // Top 40
    v7Analysis: {
      version: '7.0',
      source: 'parsed-direct',
      protagonist,
      genreAnalysis: { 
        original: genre, 
        genre, 
        wasChanged: false 
      },
      totalDialogues,
      scenes: scenes.slice(0, 20).map(s => ({
        number: s.scene_number || 0,
        heading: s.slugline || s.heading || '',
        dialogueCount: s.dialogue_count || 0,
        characters: (s.characters || []).filter(isValidCharacter).slice(0, 5)
      }))
    }
  };
}

async function processAllMissing() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const parsedDir = path.join(scriptDir, 'parsed');
  const enrichedDir = path.join(scriptDir, 'enriched-v7');
  
  // Asegurar que existe el directorio de salida
  await fs.mkdir(enrichedDir, { recursive: true });
  
  // Listar archivos
  const parsedFiles = (await fs.readdir(parsedDir)).filter(f => f.endsWith('.json'));
  const enrichedFiles = new Set((await fs.readdir(enrichedDir)).filter(f => f.endsWith('.json')));
  
  // Identificar faltantes
  const missing = parsedFiles.filter(f => !enrichedFiles.has(f));
  
  console.log(`\n🚀 COMPLETANDO ENRIQUECIMIENTO V7\n`);
  console.log(`   Total parsed:     ${parsedFiles.length}`);
  console.log(`   Ya enriquecidos:  ${enrichedFiles.size}`);
  console.log(`   Faltantes:        ${missing.length}\n`);
  
  if (missing.length === 0) {
    console.log('✅ Todos los guiones ya están enriquecidos!\n');
    return;
  }
  
  let processed = 0;
  let errors = 0;
  const errorLog = [];
  
  for (const file of missing) {
    try {
      const enriched = await enrichScript(path.join(parsedDir, file));
      await fs.writeFile(
        path.join(enrichedDir, file), 
        JSON.stringify(enriched, null, 2)
      );
      processed++;
      
      // Reportar cada 50
      if (processed % 50 === 0) {
        console.log(`   ✓ Procesados: ${processed}/${missing.length}`);
      }
    } catch (error) {
      errors++;
      errorLog.push({ file, error: error.message });
      console.error(`   ❌ Error en ${file}: ${error.message}`);
    }
  }
  
  console.log(`\n📊 RESUMEN FINAL:`);
  console.log(`   ✅ Procesados:  ${processed}`);
  console.log(`   ❌ Errores:     ${errors}`);
  console.log(`   📁 Total V7:    ${enrichedFiles.size + processed}\n`);
  
  if (errorLog.length > 0) {
    await fs.writeFile(
      path.join(scriptDir, 'enrichment-errors.json'),
      JSON.stringify(errorLog, null, 2)
    );
    console.log(`   ⚠️  Log de errores guardado en enrichment-errors.json\n`);
  }
  
  // Actualizar índices
  console.log('📝 Actualizando índices...');
  await updateIndices(enrichedDir);
  console.log('✅ Índices actualizados!\n');
}

async function updateIndices(enrichedDir) {
  const files = (await fs.readdir(enrichedDir)).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  
  const index = [];
  const summary = {
    total: files.length,
    byGenre: {},
    byFormat: {},
    totalScenes: 0,
    totalWords: 0,
    totalCharacters: 0
  };
  
  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(enrichedDir, file), 'utf8'));
      
      index.push({
        slug: data.slug,
        title: data.title,
        year: data.year,
        genre: data.genre,
        format: data.format,
        protagonist: data.v7Analysis?.protagonist?.name || null
      });
      
      // Acumular stats
      summary.byGenre[data.genre] = (summary.byGenre[data.genre] || 0) + 1;
      summary.byFormat[data.format] = (summary.byFormat[data.format] || 0) + 1;
      summary.totalScenes += data.metrics?.totalScenes || 0;
      summary.totalWords += data.metrics?.totalWords || 0;
      summary.totalCharacters += data.characters?.length || 0;
    } catch (e) {
      console.error(`Error procesando ${file} para índice: ${e.message}`);
    }
  }
  
  // Guardar índices
  await fs.writeFile(
    path.join(enrichedDir, '_index.json'),
    JSON.stringify(index, null, 2)
  );
  
  await fs.writeFile(
    path.join(enrichedDir, '_summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

// Ejecutar
processAllMissing().catch(console.error);
