/**
 * IMSDB Scraper v2 - Descarga todos los guiones de imsdb.com
 * Extrae los links reales desde cada página de película
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = path.join(__dirname, 'parsed');

if (!fs.existsSync(PARSED_DIR)) fs.mkdirSync(PARSED_DIR, { recursive: true });

const DELAY_MS = 600;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      console.log(`  Retry ${i + 1}/${retries}: ${error.message}`);
      await sleep(2000);
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

// Obtener lista de scripts desde la página all-scripts.html
async function getAllScripts() {
  console.log('Fetching all scripts list...');
  const response = await fetchWithRetry('https://imsdb.com/all-scripts.html');
  const html = await response.text();
  
  const scripts = [];
  // Buscar: href="/Movie Scripts/TITLE Script.html"
  const regex = /href="\/Movie Scripts\/([^"]+) Script\.html"/g;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const rawTitle = match[1];
    scripts.push({
      rawTitle,
      pageUrl: `https://imsdb.com/Movie%20Scripts/${encodeURIComponent(rawTitle)}%20Script.html`
    });
  }
  
  return scripts;
}

// Obtener el link al script desde la página de la película
async function getScriptUrl(pageUrl) {
  const response = await fetchWithRetry(pageUrl);
  const html = await response.text();
  
  // Buscar: href="/scripts/TITLE.html"
  const match = html.match(/href="\/scripts\/([^"]+)\.html"/);
  if (match) {
    return `https://imsdb.com/scripts/${match[1]}.html`;
  }
  return null;
}

// Crear slug
function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Obtener scripts existentes
function getExistingScripts() {
  const existing = new Set();
  if (fs.existsSync(PARSED_DIR)) {
    const files = fs.readdirSync(PARSED_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        existing.add(file.replace('.json', ''));
      }
    }
  }
  return existing;
}

// Parsear el script
function parseScript(rawText, title, genres = []) {
  const lines = rawText.split('\n');
  const scenes = [];
  let currentScene = null;
  let characters = new Set();
  let totalWords = 0;
  let totalDialogue = 0;
  
  const sluglineRegex = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.).+/i;
  const characterRegex = /^([A-Z][A-Z\s\.']+)(\s*\([^)]+\))?\s*$/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (sluglineRegex.test(trimmed)) {
      if (currentScene) scenes.push(currentScene);
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
    
    const words = trimmed.split(/\s+/).length;
    totalWords += words;
    currentScene.word_count += words;
    currentScene.action_text += trimmed + ' ';
  }
  
  if (currentScene) scenes.push(currentScene);
  
  for (const scene of scenes) {
    scene.action_text = scene.action_text.substring(0, 500).trim();
  }
  
  return {
    slug: createSlug(title),
    title,
    genre: genres[0] || 'unknown',
    genres,
    format: 'film',
    source: 'imsdb',
    scenes_count: scenes.length,
    characters_count: characters.size,
    characters: Array.from(characters).slice(0, 50),
    total_words: totalWords,
    total_dialogue: totalDialogue,
    scenes: scenes.slice(0, 100)
  };
}

// Extraer géneros de la página
function extractGenres(html) {
  const genres = [];
  const genreRegex = /href="\/genre\/([^"]+)"/g;
  let match;
  while ((match = genreRegex.exec(html)) !== null) {
    if (!genres.includes(match[1])) {
      genres.push(match[1]);
    }
  }
  return genres;
}

// Descargar y parsear un script
async function downloadAndParseScript(scriptInfo) {
  const { rawTitle, pageUrl } = scriptInfo;
  const slug = createSlug(rawTitle);
  const outputPath = path.join(PARSED_DIR, `${slug}.json`);
  
  if (fs.existsSync(outputPath)) {
    return { success: true, skipped: true, slug };
  }
  
  try {
    // Primero obtener página de la película para el link y géneros
    const pageResponse = await fetchWithRetry(pageUrl);
    const pageHtml = await pageResponse.text();
    const genres = extractGenres(pageHtml);
    
    // Buscar link al script
    const scriptMatch = pageHtml.match(/href="(\/scripts\/[^"]+\.html)"/);
    if (!scriptMatch) {
      return { success: false, error: 'No script link found', slug };
    }
    
    const scriptUrl = `https://imsdb.com${scriptMatch[1]}`;
    
    await sleep(300);
    
    // Descargar el script
    const scriptResponse = await fetchWithRetry(scriptUrl);
    const scriptHtml = await scriptResponse.text();
    
    // Extraer texto del script
    let scriptText = scriptHtml;
    const preMatch = scriptHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
      scriptText = preMatch[1];
    } else {
      scriptText = scriptHtml
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
    
    if (scriptText.length < 5000) {
      return { success: false, error: `Script too short (${scriptText.length} chars)`, slug };
    }
    
    const parsed = parseScript(scriptText, rawTitle, genres);
    fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
    
    return { success: true, skipped: false, slug, scenes: parsed.scenes_count };
  } catch (error) {
    return { success: false, error: error.message, slug };
  }
}

// Main
async function main() {
  console.log('=== IMSDB Scraper v2 ===\n');
  
  const scripts = await getAllScripts();
  console.log(`Found ${scripts.length} scripts on IMSDB\n`);
  
  const existing = getExistingScripts();
  console.log(`Already have ${existing.size} parsed scripts\n`);
  
  const toDownload = scripts.filter(s => {
    const slug = createSlug(s.rawTitle);
    return !existing.has(slug);
  });
  
  console.log(`Scripts to download: ${toDownload.length}\n`);
  
  if (toDownload.length === 0) {
    console.log('All scripts already downloaded!');
    return;
  }
  
  let downloaded = 0;
  let failed = 0;
  const startTime = Date.now();
  const failedList = [];
  
  for (let i = 0; i < toDownload.length; i++) {
    const script = toDownload[i];
    const result = await downloadAndParseScript(script);
    
    if (result.success && !result.skipped) {
      downloaded++;
      console.log(`[${i + 1}/${toDownload.length}] ✓ ${script.rawTitle} (${result.scenes} scenes)`);
    } else if (!result.success) {
      failed++;
      failedList.push({ title: script.rawTitle, error: result.error });
      console.log(`[${i + 1}/${toDownload.length}] ✗ ${script.rawTitle}: ${result.error}`);
    }
    
    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000 / 60;
      const total = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith('.json')).length;
      console.log(`\n--- Progress: ${i + 1}/${toDownload.length} | New: ${downloaded} | Failed: ${failed} | Total: ${total} | ${elapsed.toFixed(1)}min ---\n`);
    }
    
    await sleep(DELAY_MS);
  }
  
  const totalTime = (Date.now() - startTime) / 1000 / 60;
  const finalCount = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith('.json')).length;
  
  console.log(`\n=== Complete ===`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Time: ${totalTime.toFixed(1)} minutes`);
  console.log(`Total scripts: ${finalCount}`);
  
  if (failedList.length > 0) {
    fs.writeFileSync(
      path.join(__dirname, 'imsdb-failed.json'),
      JSON.stringify(failedList, null, 2)
    );
  }
}

main().catch(console.error);
