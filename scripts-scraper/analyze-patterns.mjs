#!/usr/bin/env node
/**
 * Análisis de Patrones por Género
 * 
 * Extrae patrones de diálogo útiles para el RAG del guionista:
 * - Longitud promedio de diálogos
 * - Ratio diálogo/acción
 * - Número de personajes
 * - Estructura de escenas
 */

import { promises as fs } from 'fs';
import path from 'path';

async function analyzePatterns() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const inputDir = path.join(scriptDir, 'enriched-v6c');
  
  const files = (await fs.readdir(inputDir)).filter(f => f.endsWith('.json'));
  
  const genreStats = {};
  
  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(inputDir, file), 'utf8'));
      const genre = data.genre || 'unknown';
      const metrics = data.metrics || {};
      const structure = data.structure || {};
      const v6 = data.v6Analysis || {};
      
      if (!genreStats[genre]) {
        genreStats[genre] = {
          count: 0,
          // Métricas de diálogo
          totalDialogueRatio: 0,
          totalWordsPerDialogue: 0,
          totalDialoguesPerScene: 0,
          // Métricas de escenas
          totalScenes: 0,
          totalIntRatio: 0,
          totalNightRatio: 0,
          // Métricas de personajes
          totalCharacters: 0,
          totalEnsemble: 0,
          // Métricas de estructura
          totalAct1Ratio: 0,
          totalMidpointRatio: 0,
          // Para calcular promedios después
          films: []
        };
      }
      
      const g = genreStats[genre];
      g.count++;
      
      // Diálogo
      g.totalDialogueRatio += metrics.dialogueRatio || 0;
      const wordsPerDialogue = metrics.totalDialogues > 0 
        ? (metrics.dialogueWords || 0) / metrics.totalDialogues 
        : 0;
      g.totalWordsPerDialogue += wordsPerDialogue;
      const dialoguesPerScene = metrics.totalScenes > 0
        ? (metrics.totalDialogues || 0) / metrics.totalScenes
        : 0;
      g.totalDialoguesPerScene += dialoguesPerScene;
      
      // Escenas
      g.totalScenes += metrics.totalScenes || 0;
      g.totalIntRatio += metrics.intRatio || 0.5;
      g.totalNightRatio += metrics.nightRatio || 0.5;
      
      // Personajes
      g.totalCharacters += data.characters?.length || 0;
      if (v6.protagonist?.isEnsemble) g.totalEnsemble++;
      
      // Estructura
      const act1Ratio = structure.act1End && metrics.totalScenes 
        ? structure.act1End / metrics.totalScenes : 0.25;
      const midRatio = structure.midpoint && metrics.totalScenes
        ? structure.midpoint / metrics.totalScenes : 0.5;
      g.totalAct1Ratio += act1Ratio;
      g.totalMidpointRatio += midRatio;
      
      g.films.push({
        title: data.title,
        year: data.year,
        dialogueRatio: metrics.dialogueRatio,
        wordsPerDialogue,
        scenes: metrics.totalScenes
      });
      
    } catch (e) {
      // Skip errores
    }
  }
  
  // Calcular promedios y mostrar resultados
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('📊 PATRONES POR GÉNERO - 525 GUIONES');
  console.log('════════════════════════════════════════════════════════════\n');
  
  const summary = {};
  
  for (const [genre, stats] of Object.entries(genreStats)) {
    if (stats.count < 5) continue; // Ignorar géneros con pocos ejemplos
    
    const n = stats.count;
    const patterns = {
      genre,
      count: n,
      dialogueRatio: Math.round(stats.totalDialogueRatio / n * 100),
      wordsPerDialogue: Math.round(stats.totalWordsPerDialogue / n),
      dialoguesPerScene: Math.round(stats.totalDialoguesPerScene / n * 10) / 10,
      avgScenes: Math.round(stats.totalScenes / n),
      intRatio: Math.round(stats.totalIntRatio / n * 100),
      nightRatio: Math.round(stats.totalNightRatio / n * 100),
      avgCharacters: Math.round(stats.totalCharacters / n),
      ensembleRate: Math.round(stats.totalEnsemble / n * 100),
      act1EndAt: Math.round(stats.totalAct1Ratio / n * 100),
      midpointAt: Math.round(stats.totalMidpointRatio / n * 100)
    };
    
    summary[genre] = patterns;
    
    console.log(`═══ ${genre.toUpperCase()} (${n} guiones) ═══`);
    console.log(`  📝 Diálogo: ${patterns.dialogueRatio}% del guión`);
    console.log(`  💬 Palabras/diálogo: ${patterns.wordsPerDialogue}`);
    console.log(`  🎬 Diálogos/escena: ${patterns.dialoguesPerScene}`);
    console.log(`  🎭 Escenas promedio: ${patterns.avgScenes}`);
    console.log(`  🏠 Interiores: ${patterns.intRatio}%`);
    console.log(`  🌙 Noche: ${patterns.nightRatio}%`);
    console.log(`  👥 Personajes: ${patterns.avgCharacters}`);
    console.log(`  👨‍👩‍👧‍👦 Ensembles: ${patterns.ensembleRate}%`);
    console.log(`  📐 Act 1 termina: ${patterns.act1EndAt}%`);
    console.log(`  📐 Midpoint: ${patterns.midpointAt}%`);
    console.log('');
  }
  
  // Guardar resumen
  await fs.writeFile(
    path.join(scriptDir, 'genre-patterns.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('✅ Patrones guardados en genre-patterns.json');
  
  return summary;
}

analyzePatterns();
