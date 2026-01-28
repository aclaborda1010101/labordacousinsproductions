/**
 * Script Parser V2 - Usando pdfjs-dist
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Regex patterns
const SLUGLINE_PATTERN = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+.+\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|LATER|CONTINUOUS|SAME)/i;
const CHARACTER_CUE_PATTERN = /^([A-Z][A-Z\s\.']+)(\s*\(.*?\))?\s*$/;

// Parse a single PDF using pdfjs-dist
async function parsePDF(pdfPath) {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await getDocument({ data }).promise;
    
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ');
      fullText += text + '\n';
    }
    
    return fullText;
  } catch (err) {
    throw new Error(`PDF parse failed: ${err.message}`);
  }
}

// Extract scenes
function extractScenes(text, scriptSlug) {
  const lines = text.split(/\n|\r/).map(l => l.trim()).filter(l => l);
  const scenes = [];
  let currentScene = null;
  
  for (const line of lines) {
    if (SLUGLINE_PATTERN.test(line)) {
      if (currentScene) scenes.push(currentScene);
      currentScene = {
        scene_number: scenes.length + 1,
        slugline: line,
        action: [],
        dialogue: [],
        characters: new Set(),
        raw_text: line + '\n'
      };
    } else if (currentScene) {
      currentScene.raw_text += line + '\n';
      
      // Detect character cue
      if (CHARACTER_CUE_PATTERN.test(line)) {
        const match = line.match(CHARACTER_CUE_PATTERN);
        if (match) {
          const charName = match[1].trim();
          if (charName.length < 30 && !charName.includes('INT') && !charName.includes('EXT')) {
            currentScene.characters.add(charName);
            currentScene.dialogue.push({ character: charName, lines: [] });
          }
        }
      } else {
        currentScene.action.push(line);
      }
    }
  }
  
  if (currentScene) scenes.push(currentScene);
  
  return scenes.map(scene => ({
    ...scene,
    characters: Array.from(scene.characters),
    action_text: scene.action.join(' ').slice(0, 2000),
    dialogue_count: scene.dialogue.length,
    word_count: scene.raw_text.split(/\s+/).length
  }));
}

// Detect genre
function detectGenre(text, title) {
  const lowerText = text.toLowerCase();
  
  const genreScores = {
    thriller: (lowerText.match(/kill|murder|blood|dead|death|suspect|crime/gi) || []).length,
    horror: (lowerText.match(/scream|terror|monster|fear|haunt|demon/gi) || []).length,
    comedy: (lowerText.match(/laugh|funny|joke|hilarious/gi) || []).length,
    action: (lowerText.match(/gun|shoot|explosion|fight|chase/gi) || []).length,
    drama: (lowerText.match(/family|love|heart|tears|hope/gi) || []).length,
    'sci-fi': (lowerText.match(/space|alien|robot|future|ship/gi) || []).length,
    romance: (lowerText.match(/love|kiss|romantic|passion/gi) || []).length
  };
  
  const top = Object.entries(genreScores).sort((a, b) => b[1] - a[1])[0];
  return top[1] > 3 ? top[0] : 'drama';
}

// Process single script
async function processScript(pdfPath, format) {
  const slug = path.basename(pdfPath, '.pdf');
  
  try {
    const text = await parsePDF(pdfPath);
    const scenes = extractScenes(text, slug);
    
    if (scenes.length < 2) {
      throw new Error('Too few scenes detected');
    }
    
    const genre = detectGenre(text, slug);
    const characters = [...new Set(scenes.flatMap(s => s.characters))];
    
    return {
      slug,
      title: slug.replace(/-\d{4}$/, '').replace(/-/g, ' '),
      genre,
      format,
      scenes_count: scenes.length,
      characters_count: characters.length,
      characters: characters.slice(0, 20),
      total_words: scenes.reduce((sum, s) => sum + s.word_count, 0),
      total_dialogue: scenes.reduce((sum, s) => sum + s.dialogue_count, 0),
      scenes: scenes.map(s => ({
        scene_number: s.scene_number,
        slugline: s.slugline,
        characters: s.characters,
        action_text: s.action_text,
        dialogue_count: s.dialogue_count,
        word_count: s.word_count
      }))
    };
  } catch (err) {
    return null;
  }
}

// Main
async function main() {
  const FILMS_DIR = 'C:/Users/aclab/clawd/guiones/peliculas';
  const SERIES_DIR = 'C:/Users/aclab/clawd/guiones/series';
  const OUTPUT_DIR = path.join(__dirname, 'parsed');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  
  const filmPdfs = fs.existsSync(FILMS_DIR)
    ? fs.readdirSync(FILMS_DIR).filter(f => f.endsWith('.pdf')).map(f => ({ path: path.join(FILMS_DIR, f), format: 'film' }))
    : [];
  const seriesPdfs = fs.existsSync(SERIES_DIR)
    ? fs.readdirSync(SERIES_DIR).filter(f => f.endsWith('.pdf')).map(f => ({ path: path.join(SERIES_DIR, f), format: 'series' }))
    : [];
  
  const allPdfs = [...filmPdfs, ...seriesPdfs];
  console.log(`📂 Found ${allPdfs.length} PDFs\n`);
  
  const results = [];
  let errors = 0;
  
  for (let i = 0; i < allPdfs.length; i++) {
    const { path: pdfPath, format } = allPdfs[i];
    const slug = path.basename(pdfPath, '.pdf');
    
    if ((i + 1) % 100 === 0) {
      console.log(`📊 Progress: ${i + 1}/${allPdfs.length} (${results.length} ok, ${errors} err)`);
    }
    
    const result = await processScript(pdfPath, format);
    if (result) {
      results.push(result);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${result.slug}.json`), JSON.stringify(result, null, 2));
    } else {
      errors++;
    }
  }
  
  // Save index
  fs.writeFileSync(path.join(OUTPUT_DIR, '_index.json'), JSON.stringify(
    results.map(r => ({ slug: r.slug, title: r.title, genre: r.genre, format: r.format, scenes: r.scenes_count })),
    null, 2
  ));
  
  // Summary
  const byGenre = {};
  for (const r of results) {
    byGenre[r.genre] = (byGenre[r.genre] || 0) + 1;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ PARSING COMPLETE:');
  console.log(`  📄 Scripts: ${results.length}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log('\nBy Genre:', byGenre);
  console.log('='.repeat(50));
}

main().catch(console.error);
