/**
 * IMSDB Scraper - Descarga todos los guiones de imsdb.com
 * 
 * Uso: node scrape-imsdb.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'imsdb-raw');
const PARSED_DIR = path.join(__dirname, 'parsed');
const PROGRESS_FILE = path.join(__dirname, 'imsdb-progress.json');

// Crear directorios
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(PARSED_DIR)) fs.mkdirSync(PARSED_DIR, { recursive: true });

const DELAY_MS = 800;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      console.log(`  Retry ${i + 1}/${retries}: ${error.message}`);
      await sleep(2000);
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

// Obtener lista de scripts desde all-scripts.html
async function getAllScriptLinks() {
  console.log('Fetching all scripts list from IMSDB...');
  const response = await fetchWithRetry('https://imsdb.com/all-scripts.html');
  const html = await response.text();
  
  // Extraer links: href="/Movie Scripts/Title Script.html"
  const scripts = [];
  const regex = /href="\/Movie Scripts\/([^"]+) Script\.html"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const title = decodeURIComponent(match[1]);
    scripts.push({
      title,
      url: `https://imsdb.com/scripts/${title.replace(/ /g, '-')}.html`,
      rawUrl: `https://imsdb.com/Movie%20Scripts/${encodeURIComponent(match[1])}%20Script.html`
    });
  }
  
  return scripts;
}

// Crear slug desde título
function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Obtener scripts ya parseados
function getExistingScripts() {
  const existing = new Set();
  const files = fs.readdirSync(PARSED_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      existing.add(file.replace('.json', ''));
    }
  }
  return existing;
}

// Parsear el texto del script a escenas
function parseScript(rawText, title) {
  const lines = rawText.split('\n');
  const scenes = [];
  let currentScene = null;
  let characters = new Set();
  let totalWords = 0;
  let totalDialogue = 0;
  
  // Regex para detectar sluglines (INT./EXT.)
  const sluglineRegex = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.).+/i;
  // Regex para detectar nombres de personajes (TODO EN MAYÚSCULAS seguido de diálogo)
  const characterRegex = /^([A-Z][A-Z\s\.']+)(\s*\([^)]+\))?\s*$/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Detectar nueva escena
    if (sluglineRegex.test(trimmed)) {
      if (currentScene) {
        scenes.push(currentScene);
      }
      currentScene = {
        scene_number: scenes.length + 1,
        slugline: trimmed,
        characters: [],
        action_text: '',
        dialogue_count: 0,
        word_count: 0
      };
      continue;
    }
    
    // Si no hay escena actual, crear una genérica
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
    const charMatch = trimmed.match(characterRegex);
    if (charMatch && trimmed.length < 40 && !trimmed.includes('CUT TO') && !trimmed.includes('FADE')) {
      const charName = charMatch[1].trim();
      if (charName.length > 1 && charName.length < 30) {
        characters.add(charName);
        if (!currentScene.characters.includes(charName)) {
          currentScene.characters.push(charName);
        }
        totalDialogue++;
        currentScene.dialogue_count++;
      }
    }
    
    // Contar palabras
    const words = trimmed.split(/\s+/).length;
    totalWords += words;
    currentScene.word_count += words;
    currentScene.action_text += trimmed + ' ';
  }
  
  // Añadir última escena
  if (currentScene) {
    scenes.push(currentScene);
  }
  
  // Limpiar action_text (mantener solo primeros 500 chars)
  for (const scene of scenes) {
    scene.action_text = scene.action_text.substring(0, 500).trim();
  }
  
  const slug = createSlug(title);
  
  return {
    slug,
    title,
    genre: 'unknown',
    format: 'film',
    source: 'imsdb',
    scenes_count: scenes.length,
    characters_count: characters.size,
    characters: Array.from(characters).slice(0, 50), // Top 50 personajes
    total_words: totalWords,
    total_dialogue: totalDialogue,
    scenes: scenes.slice(0, 100) // Máximo 100 escenas para no hacer el JSON enorme
  };
}

// Descargar y parsear un script
async function downloadAndParseScript(scriptInfo) {
  const { title, url } = scriptInfo;
  const slug = createSlug(title);
  const outputPath = path.join(PARSED_DIR, `${slug}.json`);
  
  // Verificar si ya existe
  if (fs.existsSync(outputPath)) {
    return { success: true, skipped: true, slug };
  }
  
  try {
    console.log(`  Downloading: ${title}`);
    const response = await fetchWithRetry(url);
    const html = await response.text();
    
    // Extraer el texto del script (viene después del título)
    // El contenido está entre <pre> o simplemente como texto
    let scriptText = html;
    
    // Intentar extraer solo el contenido del script
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
      scriptText = preMatch[1];
    } else {
      // Limpiar HTML
      scriptText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
    
    // Si el texto es muy corto, probablemente no es un script válido
    if (scriptText.length < 5000) {
      console.log(`    -> Script too short (${scriptText.length} chars), skipping`);
      return { success: false, error: 'Script too short', slug };
    }
    
    // Parsear
    const parsed = parseScript(scriptText, title);
    
    // Guardar JSON
    fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
    console.log(`    -> Saved: ${slug}.json (${parsed.scenes_count} scenes, ${parsed.characters_count} characters)`);
    
    return { success: true, skipped: false, slug };
  } catch (error) {
    console.log(`    -> Error: ${error.message}`);
    return { success: false, error: error.message, slug };
  }
}

// Cargar/guardar progreso
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completed: [], failed: [], lastIndex: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Main
async function main() {
  console.log('=== IMSDB Scraper ===\n');
  
  // Obtener lista de scripts
  const scripts = await getAllScriptLinks();
  console.log(`Found ${scripts.length} scripts on IMSDB\n`);
  
  // Verificar existentes
  const existing = getExistingScripts();
  console.log(`Already have ${existing.size} parsed scripts\n`);
  
  // Filtrar scripts que no tenemos
  const toDownload = scripts.filter(s => {
    const slug = createSlug(s.title);
    return !existing.has(slug);
  });
  
  console.log(`Scripts to download: ${toDownload.length}\n`);
  
  if (toDownload.length === 0) {
    console.log('All scripts already downloaded!');
    return;
  }
  
  // Descargar
  let downloaded = 0;
  let failed = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < toDownload.length; i++) {
    const script = toDownload[i];
    console.log(`[${i + 1}/${toDownload.length}] ${script.title}`);
    
    const result = await downloadAndParseScript(script);
    
    if (result.success && !result.skipped) {
      downloaded++;
    } else if (!result.success) {
      failed++;
    }
    
    // Progress update cada 50 scripts
    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000 / 60;
      console.log(`\n--- Progress: ${i + 1}/${toDownload.length} (${downloaded} new, ${failed} failed) - ${elapsed.toFixed(1)} min ---\n`);
    }
    
    await sleep(DELAY_MS);
  }
  
  const totalTime = (Date.now() - startTime) / 1000 / 60;
  console.log(`\n=== Complete ===`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Time: ${totalTime.toFixed(1)} minutes`);
  
  // Contar total
  const finalCount = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith('.json')).length;
  console.log(`Total scripts in parsed/: ${finalCount}`);
}

main().catch(console.error);
