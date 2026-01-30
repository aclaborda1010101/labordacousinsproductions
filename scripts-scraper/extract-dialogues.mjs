#!/usr/bin/env node
/**
 * Extrae diálogos completos del parsed/
 * Para enriquecer el RAG del guionista
 */

import { promises as fs } from 'fs';
import path from 'path';

// Patrón para detectar diálogos: NOMBRE EN MAYÚSCULAS seguido de texto
const DIALOGUE_PATTERN = /^([A-Z][A-Z\s]+?)(?:\s*\(.*?\))?\s*\n\s*(.+?)(?=\n[A-Z]{2,}|\n\n|$)/gms;

// Personajes falsos a ignorar
const FALSE_CHARS = new Set([
  'INT', 'EXT', 'INTERIOR', 'EXTERIOR', 'CUT TO', 'FADE IN', 'FADE OUT',
  'CONTINUED', 'CONT', 'THE END', 'ANGLE', 'CLOSE', 'WIDE', 'POV',
  'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY'
]);

function extractDialogues(sceneText) {
  const dialogues = [];
  
  // Patrón: NOMBRE EN MAYÚSCULAS seguido de espacios y texto
  // Formato: "JOKER  If you're happy..." o "JOKER (V.O.)  texto"
  const pattern = /\b([A-Z][A-Z]+(?:\s+[A-Z]+)?)\s*(?:\([^)]*\))?\s{2,}([^A-Z\n][^\n]*?)(?=\s+[A-Z]{2,}\s{2,}|$)/g;
  
  let match;
  while ((match = pattern.exec(sceneText)) !== null) {
    const charName = match[1].trim();
    const text = match[2].trim();
    
    // Filtrar falsos positivos
    if (FALSE_CHARS.has(charName)) continue;
    if (charName.length < 2) continue;
    if (text.length < 3) continue;
    
    dialogues.push({
      character: charName,
      text: text
    });
  }
  
  return dialogues;
}

async function processFile(parsedPath) {
  const parsed = JSON.parse(await fs.readFile(parsedPath, 'utf8'));
  
  const allDialogues = [];
  const sceneData = [];
  
  for (const scene of (parsed.scenes || [])) {
    const text = scene.slugline || scene.action_text || '';
    const dialogues = extractDialogues(text);
    
    // Extraer encabezado de escena
    const headingMatch = text.match(/^(INT\.|EXT\.)([^0-9\n]+)/);
    
    sceneData.push({
      number: scene.scene_number,
      heading: headingMatch ? headingMatch[0].trim() : '',
      dialogueCount: dialogues.length,
      wordCount: scene.word_count,
      dialogues: dialogues.slice(0, 10) // Limitar para no explotar el JSON
    });
    
    allDialogues.push(...dialogues);
  }
  
  // Estadísticas de diálogo
  const charDialogues = {};
  for (const d of allDialogues) {
    if (!charDialogues[d.character]) {
      charDialogues[d.character] = { count: 0, totalWords: 0, samples: [] };
    }
    charDialogues[d.character].count++;
    charDialogues[d.character].totalWords += d.text.split(/\s+/).length;
    if (charDialogues[d.character].samples.length < 3) {
      charDialogues[d.character].samples.push(d.text.substring(0, 100));
    }
  }
  
  return {
    title: parsed.title,
    totalDialogues: allDialogues.length,
    avgWordsPerDialogue: allDialogues.length > 0 
      ? Math.round(allDialogues.reduce((s, d) => s + d.text.split(/\s+/).length, 0) / allDialogues.length)
      : 0,
    characterStats: charDialogues,
    scenes: sceneData
  };
}

// Test con un archivo
async function test() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  
  const result = await processFile(path.join(scriptDir, 'parsed/joker-2019.json'));
  
  console.log('\n📊 EXTRACCIÓN DE DIÁLOGOS - JOKER\n');
  console.log(`Total diálogos: ${result.totalDialogues}`);
  console.log(`Palabras promedio por diálogo: ${result.avgWordsPerDialogue}`);
  console.log('\nPersonajes con más diálogos:');
  
  const sorted = Object.entries(result.characterStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  
  for (const [char, stats] of sorted) {
    console.log(`  ${char}: ${stats.count} diálogos, ${stats.totalWords} palabras`);
    console.log(`    Muestra: "${stats.samples[0]?.substring(0, 60)}..."`);
  }
  
  console.log('\nEscenas con diálogos:');
  for (const scene of result.scenes.slice(0, 3)) {
    console.log(`  Escena ${scene.number}: ${scene.heading}`);
    console.log(`    Diálogos: ${scene.dialogueCount}`);
    if (scene.dialogues[0]) {
      console.log(`    Primer diálogo: ${scene.dialogues[0].character}: "${scene.dialogues[0].text.substring(0, 50)}..."`);
    }
  }
}

test();
