/**
 * Scene Extractor - Extrae escenas de PDFs de guiones
 * Para alimentar el scene-retriever de LC Studio
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(__dirname, 'pdfs');
const OUTPUT_FILE = path.join(__dirname, 'extracted-scenes.json');

// Regex para detectar sluglines (INT./EXT.)
const SLUGLINE_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+(.+?)(?:\s+-\s+(.+))?$/gm;

// Géneros por keywords en título
const GENRE_KEYWORDS = {
  comedy: ['comedy', 'funny', 'hangover', 'superbad', 'bridesmaids', 'anchorman', 'stepbrothers'],
  drama: ['drama', 'schindler', 'forrest', 'shawshank', 'godfather', 'beautiful-mind'],
  thriller: ['thriller', 'silence', 'gone-girl', 'se7en', 'zodiac', 'prisoners'],
  horror: ['horror', 'conjuring', 'hereditary', 'midsommar', 'get-out', 'us-2019', 'it-'],
  action: ['action', 'wick', 'mission-impossible', 'fast-furious', 'mad-max', 'terminator'],
  scifi: ['sci-fi', 'blade-runner', 'matrix', 'interstellar', 'arrival', 'dune', 'alien'],
  romance: ['romance', 'notebook', 'titanic', 'before-sunrise', 'la-la-land', 'crazy-rich']
};

function detectGenre(filename) {
  const lower = filename.toLowerCase();
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) {
      return genre;
    }
  }
  return 'drama'; // default
}

function parseScenes(text, filename) {
  const scenes = [];
  const lines = text.split('\n');
  
  let currentScene = null;
  let sceneContent = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if this is a slugline
    const slugMatch = trimmed.match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+(.+)/i);
    
    if (slugMatch) {
      // Save previous scene if exists
      if (currentScene && sceneContent.length > 0) {
        const content = sceneContent.join('\n').trim();
        if (content.length > 100 && content.length < 3000) { // Filter by length
          scenes.push({
            slugline: currentScene,
            content: content,
            wordCount: content.split(/\s+/).length
          });
        }
      }
      
      // Start new scene
      currentScene = trimmed;
      sceneContent = [];
    } else if (currentScene) {
      sceneContent.push(line);
    }
  }
  
  // Don't forget last scene
  if (currentScene && sceneContent.length > 0) {
    const content = sceneContent.join('\n').trim();
    if (content.length > 100 && content.length < 3000) {
      scenes.push({
        slugline: currentScene,
        content: content,
        wordCount: content.split(/\s+/).length
      });
    }
  }
  
  return scenes;
}

function scoreScene(scene) {
  let score = 0;
  const content = scene.content.toLowerCase();
  
  // Has dialogue (character names in caps followed by content)
  if (/^[A-Z]{2,}[\s\n]/m.test(scene.content)) score += 2;
  
  // Has action description
  if (scene.content.includes('(') || /^[a-z]/m.test(scene.content)) score += 1;
  
  // Optimal length (150-500 words)
  if (scene.wordCount >= 150 && scene.wordCount <= 500) score += 2;
  
  // Contains emotion/conflict words
  const conflictWords = ['but', 'however', 'suddenly', 'realize', 'discover', 'confront'];
  if (conflictWords.some(w => content.includes(w))) score += 1;
  
  return score;
}

async function extractFromPdf(filepath) {
  try {
    const buffer = fs.readFileSync(filepath);
    const data = await pdf(buffer);
    return data.text;
  } catch (err) {
    console.error(`Error reading ${filepath}: ${err.message}`);
    return null;
  }
}

async function main() {
  const files = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`Found ${files.length} PDFs`);
  
  const sceneIndex = {
    comedy: [],
    drama: [],
    thriller: [],
    horror: [],
    action: [],
    scifi: [],
    romance: []
  };
  
  let processed = 0;
  const limit = 100; // Process first 100 for now
  
  for (const file of files.slice(0, limit)) {
    const filepath = path.join(PDF_DIR, file);
    const title = file.replace('.pdf', '').replace(/-/g, ' ');
    const genre = detectGenre(file);
    
    console.log(`[${++processed}/${limit}] ${file} -> ${genre}`);
    
    const text = await extractFromPdf(filepath);
    if (!text) continue;
    
    const scenes = parseScenes(text, file);
    
    // Score and pick top scenes
    const scored = scenes.map(s => ({ ...s, score: scoreScene(s), title }));
    const topScenes = scored.sort((a, b) => b.score - a.score).slice(0, 3);
    
    for (const scene of topScenes) {
      sceneIndex[genre].push({
        title: title,
        slugline: scene.slugline,
        content: scene.content.substring(0, 1500), // Limit content size
        wordCount: scene.wordCount,
        score: scene.score
      });
    }
  }
  
  // Keep top 20 per genre
  for (const genre of Object.keys(sceneIndex)) {
    sceneIndex[genre] = sceneIndex[genre]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    console.log(`${genre}: ${sceneIndex[genre].length} scenes`);
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sceneIndex, null, 2));
  console.log(`\n✅ Saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
