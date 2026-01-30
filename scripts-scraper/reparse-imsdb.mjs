/**
 * Re-parser para scripts de IMSDB
 * Limpia el HTML y mejora la extracción de escenas/personajes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = path.join(__dirname, 'parsed');

// Limpiar HTML del texto
function cleanHtml(text) {
  return text
    // Eliminar etiquetas HTML pero preservar saltos de línea
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<b>/gi, '')
    .replace(/<\/b>/gi, '')
    .replace(/<[^>]+>/g, '')
    // Entidades HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    // Normalizar espacios
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Detectar si es un personaje (línea en mayúsculas antes de diálogo)
function isCharacterLine(line, nextLine) {
  if (!line || line.length > 40) return false;
  
  // Excluir transiciones
  const transitions = ['CUT TO', 'FADE', 'DISSOLVE', 'SMASH', 'MATCH', 'CONTINUED', 'MORE', 'CONT'];
  if (transitions.some(t => line.includes(t))) return false;
  
  // Debe ser mayúsculas (permitiendo paréntesis para acotaciones)
  const clean = line.replace(/\([^)]+\)/g, '').trim();
  if (clean.length < 2) return false;
  if (clean !== clean.toUpperCase()) return false;
  if (/^\d/.test(clean)) return false;
  if (/^(INT|EXT|I\/E)/.test(clean)) return false;
  
  return true;
}

// Parsear script mejorado
function parseScriptImproved(rawText, title) {
  const text = cleanHtml(rawText);
  const lines = text.split('\n');
  
  const scenes = [];
  let currentScene = null;
  const characters = new Set();
  let totalWords = 0;
  let totalDialogue = 0;
  
  const sluglineRegex = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*.+/i;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Nueva escena
    if (sluglineRegex.test(line)) {
      if (currentScene) {
        currentScene.action_text = currentScene.action_text.substring(0, 500).trim();
        scenes.push(currentScene);
      }
      currentScene = {
        scene_number: scenes.length + 1,
        slugline: line,
        characters: [],
        action_text: '',
        dialogue_count: 0,
        word_count: 0
      };
      continue;
    }
    
    // Sin escena actual, crear una
    if (!currentScene) {
      currentScene = {
        scene_number: 1,
        slugline: 'OPENING',
        characters: [],
        action_text: '',
        dialogue_count: 0,
        word_count: 0
      };
    }
    
    // Detectar personajes
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    if (isCharacterLine(line, nextLine)) {
      const charName = line.replace(/\([^)]+\)/g, '').trim();
      characters.add(charName);
      if (!currentScene.characters.includes(charName)) {
        currentScene.characters.push(charName);
      }
      totalDialogue++;
      currentScene.dialogue_count++;
    }
    
    // Contar palabras
    const words = line.split(/\s+/).filter(w => w).length;
    totalWords += words;
    currentScene.word_count += words;
    currentScene.action_text += line + ' ';
  }
  
  // Última escena
  if (currentScene) {
    currentScene.action_text = currentScene.action_text.substring(0, 500).trim();
    scenes.push(currentScene);
  }
  
  return {
    scenes_count: scenes.length,
    characters_count: characters.size,
    characters: Array.from(characters).slice(0, 50),
    total_words: totalWords,
    total_dialogue: totalDialogue,
    scenes: scenes.slice(0, 100)
  };
}

// Main
async function main() {
  console.log('=== Re-parsing IMSDB scripts ===\n');
  
  const files = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} JSON files\n`);
  
  let improved = 0;
  let alreadyGood = 0;
  
  for (const file of files) {
    const filepath = path.join(PARSED_DIR, file);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    
    // Solo re-parsear si viene de IMSDB y tiene pocas escenas
    if (data.source === 'imsdb' && data.scenes_count <= 3) {
      // El action_text contiene el HTML original
      const rawText = data.scenes.map(s => s.action_text).join('\n');
      if (rawText.includes('<b>') || rawText.includes('<')) {
        const parsed = parseScriptImproved(rawText, data.title);
        
        // Actualizar solo si mejoró
        if (parsed.scenes_count > data.scenes_count) {
          data.scenes_count = parsed.scenes_count;
          data.characters_count = parsed.characters_count;
          data.characters = parsed.characters;
          data.total_words = parsed.total_words;
          data.total_dialogue = parsed.total_dialogue;
          data.scenes = parsed.scenes;
          
          fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
          console.log(`  Improved: ${file} (${parsed.scenes_count} scenes, ${parsed.characters_count} chars)`);
          improved++;
        }
      }
    } else {
      alreadyGood++;
    }
  }
  
  console.log(`\n=== Done ===`);
  console.log(`Improved: ${improved}`);
  console.log(`Already good: ${alreadyGood}`);
}

main().catch(console.error);
