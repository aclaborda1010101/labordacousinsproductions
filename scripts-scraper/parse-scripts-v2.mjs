/**
 * Script Parser V3 - CORREGIDO
 * Ahora SÍ captura el texto de los diálogos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Regex patterns
const SLUGLINE_PATTERN = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+.+/i;
const CHARACTER_CUE_PATTERN = /^([A-Z][A-Z\s\.']{1,25})(\s*\(.*?\))?\s*$/;

// Falsos positivos - NO son personajes
const FALSE_CHARACTERS = new Set([
  'INT', 'EXT', 'INTERIOR', 'EXTERIOR', 'CUT TO', 'FADE IN', 'FADE OUT',
  'CONTINUED', 'CONT', 'THE END', 'ANGLE', 'CLOSE', 'CLOSE ON', 'WIDE',
  'POV', 'INSERT', 'FLASHBACK', 'MONTAGE', 'LATER', 'CONTINUOUS',
  'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAY', 'DAWN', 'DUSK',
  'SAME TIME', 'MOMENTS LATER', 'SUPER', 'TITLE', 'CARD', 'BACK TO',
  'SERIES OF SHOTS', 'THE FOLLOWING', 'END OF', 'INTERCUT', 'MATCH CUT',
  'SMASH CUT', 'TIME CUT', 'DISSOLVE TO', 'PRELAP', 'PRE-LAP',
  // Metadatos de guión
  'ACU', 'FINAL', 'SHOOTING', 'SCRIPT', 'DRAFT', 'PRODUCTION',
  'REVISED', 'BLUE', 'PINK', 'YELLOW', 'GREEN', 'WHITE', 'GOLD',
  'FIRST DRAFT', 'SECOND DRAFT', 'FINAL DRAFT', 'SHOOTING SCRIPT',
  'PRODUCTION DRAFT', 'AS BROADCAST', 'WRITERS DRAFT',
  'PINK SHOOTING SCRIPT', 'BLUE SHOOTING SCRIPT', 'WHITE SHOOTING SCRIPT',
  'YELLOW SHOOTING SCRIPT', 'GREEN SHOOTING SCRIPT', 'GOLD SHOOTING SCRIPT',
  'PINK REVISED', 'BLUE REVISED', 'WHITE REVISED', 'CHERRY REVISED',
  // Combinaciones comunes de revisiones
  'FULL BLUE', 'FULL PINK', 'FULL WHITE', 'FULL YELLOW'
]);

function isValidCharacter(name) {
  if (!name || name.length < 2 || name.length > 30) return false;
  const upper = name.toUpperCase().trim();
  if (FALSE_CHARACTERS.has(upper)) return false;
  if (/^\d+$/.test(upper)) return false;
  if (!/[AEIOU]/.test(upper)) return false;
  
  // Descartar cualquier nombre que contenga palabras de metadatos
  const metaWords = ['SCRIPT', 'DRAFT', 'SHOOTING', 'REVISED', 'PRODUCTION', 'BROADCAST'];
  for (const word of metaWords) {
    if (upper.includes(word)) return false;
  }
  
  return true;
}

// Parse a single PDF
async function parsePDF(pdfPath) {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await getDocument({ data }).promise;
    
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join('\n');
      fullText += text + '\n\n';
    }
    
    return fullText;
  } catch (err) {
    throw new Error(`PDF parse failed: ${err.message}`);
  }
}

// Extract scenes WITH DIALOGUES
function extractScenes(text) {
  const lines = text.split(/\n/).map(l => l.trim());
  const scenes = [];
  let currentScene = null;
  let currentDialogue = null;
  let inDialogue = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      // Línea vacía puede terminar un diálogo
      if (currentDialogue && currentDialogue.text.length > 0) {
        if (currentScene) {
          currentScene.dialogues.push({ ...currentDialogue });
        }
        currentDialogue = null;
        inDialogue = false;
      }
      continue;
    }
    
    // ¿Es un slugline (nueva escena)?
    if (SLUGLINE_PATTERN.test(line)) {
      // Guardar diálogo pendiente
      if (currentDialogue && currentDialogue.text.length > 0 && currentScene) {
        currentScene.dialogues.push({ ...currentDialogue });
      }
      // Guardar escena anterior
      if (currentScene) scenes.push(currentScene);
      
      currentScene = {
        number: scenes.length + 1,
        heading: line,
        action: [],
        dialogues: [],
        characters: new Set()
      };
      currentDialogue = null;
      inDialogue = false;
      continue;
    }
    
    if (!currentScene) continue;
    
    // ¿Es un nombre de personaje (cue de diálogo)?
    const charMatch = line.match(CHARACTER_CUE_PATTERN);
    if (charMatch && isValidCharacter(charMatch[1])) {
      // Guardar diálogo anterior si existe
      if (currentDialogue && currentDialogue.text.length > 0) {
        currentScene.dialogues.push({ ...currentDialogue });
      }
      
      const charName = charMatch[1].trim();
      const parenthetical = charMatch[2] ? charMatch[2].trim() : '';
      
      currentScene.characters.add(charName);
      currentDialogue = {
        character: charName,
        parenthetical: parenthetical,
        text: ''
      };
      inDialogue = true;
      continue;
    }
    
    // ¿Es una línea de diálogo?
    if (inDialogue && currentDialogue) {
      // Los diálogos suelen estar indentados o en minúsculas
      // Si la línea empieza con minúscula o tiene formato de diálogo, es parte del diálogo
      if (line.length > 0) {
        // Verificar si parece acción (todo mayúsculas al inicio con descripción)
        const looksLikeAction = /^[A-Z][a-z]/.test(line) || 
                               /^(He|She|They|It|The|A|An)\s/.test(line) ||
                               line.length > 100;
        
        if (!looksLikeAction || currentDialogue.text.length === 0) {
          currentDialogue.text += (currentDialogue.text ? ' ' : '') + line;
        } else {
          // Terminar diálogo y añadir como acción
          if (currentDialogue.text.length > 0) {
            currentScene.dialogues.push({ ...currentDialogue });
          }
          currentDialogue = null;
          inDialogue = false;
          currentScene.action.push(line);
        }
      }
    } else {
      // Es acción
      currentScene.action.push(line);
    }
  }
  
  // Guardar últimos elementos
  if (currentDialogue && currentDialogue.text.length > 0 && currentScene) {
    currentScene.dialogues.push({ ...currentDialogue });
  }
  if (currentScene) scenes.push(currentScene);
  
  // Formatear salida
  return scenes.map(scene => ({
    scene_number: scene.number,
    heading: scene.heading,
    characters: Array.from(scene.characters),
    action_text: scene.action.join(' ').substring(0, 2000),
    dialogues: scene.dialogues.map(d => ({
      character: d.character,
      parenthetical: d.parenthetical || '',
      text: d.text.substring(0, 500) // Limitar longitud
    })),
    dialogue_count: scene.dialogues.length,
    word_count: scene.action.join(' ').split(/\s+/).length + 
                scene.dialogues.reduce((s, d) => s + d.text.split(/\s+/).length, 0)
  }));
}

// Test con un archivo
async function testParse() {
  const pdfDir = path.join(__dirname, 'pdfs');
  const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  
  if (files.length === 0) {
    console.log('No hay PDFs para testear');
    return;
  }
  
  const testFile = files.find(f => f.toLowerCase().includes('joker')) || files[0];
  console.log(`\n🎬 Testeando con: ${testFile}\n`);
  
  const text = await parsePDF(path.join(pdfDir, testFile));
  const scenes = extractScenes(text);
  
  console.log(`Total escenas: ${scenes.length}`);
  console.log(`Total diálogos: ${scenes.reduce((s, sc) => s + sc.dialogue_count, 0)}`);
  
  // Mostrar primeras 3 escenas con diálogos
  const withDialogues = scenes.filter(s => s.dialogue_count > 0).slice(0, 3);
  
  for (const scene of withDialogues) {
    console.log(`\n═══ Escena ${scene.scene_number}: ${scene.heading} ═══`);
    console.log(`Personajes: ${scene.characters.join(', ')}`);
    console.log(`Diálogos: ${scene.dialogue_count}`);
    
    for (const d of scene.dialogues.slice(0, 3)) {
      console.log(`  ${d.character}${d.parenthetical}: "${d.text.substring(0, 80)}..."`);
    }
  }
}

// CLI
if (process.argv[2] === '--test') {
  testParse();
} else {
  console.log('Uso: node parse-scripts-v2.mjs --test');
}

export { parsePDF, extractScenes };
