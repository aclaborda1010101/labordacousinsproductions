/**
 * Script Parser PRO v3.0
 * Extracción profesional de guiones
 * 
 * Mejoras:
 * - Clasificación de personajes (protagonista, secundario, figurante)
 * - Detección de género mejorada
 * - Extracción de localizaciones
 * - Conteo de diálogos por personaje
 * - Detección de objetos/props
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// PATRONES REGEX
// ============================================

// Sluglines más flexibles
const SLUGLINE_PATTERNS = [
  /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INTERIOR|EXTERIOR)\s+(.+?)(?:\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|LATER|CONTINUOUS|SAME|MOMENTS? LATER|NOON|AFTERNOON|SUNSET|SUNRISE))?$/i,
  /^(INT\.|EXT\.)\s+(.+)$/i  // Fallback más simple
];

// Personaje hablando (nombre en MAYÚSCULAS seguido de diálogo)
const CHARACTER_CUE = /^([A-Z][A-Z\s\.\-']{1,25})(?:\s*\([^)]+\))?$/;

// Excluir falsos positivos de personajes
const CHARACTER_BLACKLIST = new Set([
  'INT', 'EXT', 'CUT TO', 'FADE IN', 'FADE OUT', 'DISSOLVE TO',
  'THE END', 'CONTINUED', 'CONT', 'MORE', 'FLASHBACK',
  'SUPER', 'TITLE', 'CARD', 'LATER', 'CONTINUOUS', 'SAME',
  'DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK',
  'V.O', 'O.S', 'O.C', 'VOICE OVER', 'ON SCREEN', 'PRE-LAP'
]);

// Palabras clave para géneros (con pesos)
const GENRE_KEYWORDS = {
  thriller: {
    high: ['murder', 'killer', 'suspect', 'detective', 'victim', 'crime scene', 'investigate'],
    medium: ['blood', 'dead body', 'witness', 'alibi', 'evidence', 'clue'],
    low: ['dark', 'shadow', 'fear', 'tension']
  },
  horror: {
    high: ['demon', 'possessed', 'supernatural', 'haunted', 'monster', 'creature'],
    medium: ['scream', 'terror', 'nightmare', 'ghost', 'evil', 'curse'],
    low: ['fear', 'dark', 'blood', 'death']
  },
  comedy: {
    high: ['hilarious', 'punchline', 'sitcom', 'gag', 'slapstick'],
    medium: ['joke', 'funny', 'comedic', 'wacky', 'zany'],
    low: ['smile', 'chuckle', 'amused']
  },
  drama: {
    high: ['emotional', 'heartbreak', 'tragedy', 'struggle', 'overcome'],
    medium: ['family', 'relationship', 'conflict', 'tears', 'hope'],
    low: ['feeling', 'moment', 'realize']
  },
  action: {
    high: ['explosion', 'gunfire', 'combat', 'chase scene', 'fight choreography'],
    medium: ['gun', 'shoot', 'punch', 'kick', 'chase', 'battle'],
    low: ['run', 'escape', 'attack']
  },
  'sci-fi': {
    high: ['spaceship', 'alien', 'robot', 'android', 'futuristic', 'teleport'],
    medium: ['space', 'planet', 'laser', 'technology', 'hologram'],
    low: ['future', 'advanced', 'digital']
  },
  romance: {
    high: ['passionate kiss', 'fall in love', 'romantic', 'wedding', 'proposal'],
    medium: ['kiss', 'love', 'heart', 'embrace', 'attraction'],
    low: ['beautiful', 'charming', 'sweet']
  },
  crime: {
    high: ['heist', 'robbery', 'mob', 'mafia', 'drug deal', 'cartel'],
    medium: ['police', 'arrest', 'prison', 'gang', 'criminal'],
    low: ['steal', 'illegal', 'corrupt']
  }
};

// Objetos/props comunes en guiones
const PROP_PATTERNS = [
  /\b(gun|pistol|rifle|shotgun|weapon|knife|sword)\b/gi,
  /\b(car|truck|vehicle|motorcycle|bike|taxi|limo|bus)\b/gi,
  /\b(phone|cellphone|smartphone|laptop|computer|tablet)\b/gi,
  /\b(money|cash|briefcase|suitcase|bag|backpack)\b/gi,
  /\b(letter|note|document|file|folder|envelope)\b/gi,
  /\b(key|keys|lock|door|window|gate)\b/gi,
  /\b(blood|wound|scar|bandage|medicine|pills|drugs)\b/gi
];

// ============================================
// FUNCIONES DE PARSING
// ============================================

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
    
    return { text: fullText, pageCount: doc.numPages };
  } catch (err) {
    throw new Error(`PDF parse failed: ${err.message}`);
  }
}

function isValidCharacterName(name) {
  if (!name || name.length < 2 || name.length > 30) return false;
  if (CHARACTER_BLACKLIST.has(name.toUpperCase().trim())) return false;
  if (/^\d+$/.test(name)) return false; // Solo números
  if (/^(INT|EXT|CUT|FADE|DISSOLVE)/i.test(name)) return false;
  return true;
}

function extractScenes(text) {
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
  const scenes = [];
  let currentScene = null;
  let lastCharacter = null;
  
  for (const line of lines) {
    // Check for slugline
    let sluglineMatch = null;
    for (const pattern of SLUGLINE_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        sluglineMatch = match;
        break;
      }
    }
    
    if (sluglineMatch) {
      if (currentScene && currentScene.content.length > 0) {
        scenes.push(finalizeScene(currentScene));
      }
      
      const intExt = sluglineMatch[1].toUpperCase();
      const location = sluglineMatch[2] ? sluglineMatch[2].trim() : 'UNKNOWN';
      const timeOfDay = sluglineMatch[3] ? sluglineMatch[3].toUpperCase() : 'UNSPECIFIED';
      
      currentScene = {
        scene_number: scenes.length + 1,
        slugline: line,
        int_ext: intExt.includes('INT') ? 'INT' : 'EXT',
        location: location,
        time_of_day: timeOfDay,
        content: [],
        characters: {},
        props: new Set()
      };
      lastCharacter = null;
      continue;
    }
    
    if (!currentScene) continue;
    
    currentScene.content.push(line);
    
    // Check for character cue
    const charMatch = line.match(CHARACTER_CUE);
    if (charMatch) {
      const charName = charMatch[1].trim().replace(/\s+/g, ' ');
      if (isValidCharacterName(charName)) {
        lastCharacter = charName;
        if (!currentScene.characters[charName]) {
          currentScene.characters[charName] = { dialogue_lines: 0, words: 0 };
        }
      }
    } else if (lastCharacter && currentScene.characters[lastCharacter]) {
      // This is dialogue
      const wordCount = line.split(/\s+/).length;
      currentScene.characters[lastCharacter].dialogue_lines++;
      currentScene.characters[lastCharacter].words += wordCount;
    }
    
    // Extract props
    for (const pattern of PROP_PATTERNS) {
      const matches = line.match(pattern);
      if (matches) {
        matches.forEach(m => currentScene.props.add(m.toLowerCase()));
      }
    }
  }
  
  if (currentScene && currentScene.content.length > 0) {
    scenes.push(finalizeScene(currentScene));
  }
  
  return scenes;
}

function finalizeScene(scene) {
  const contentText = scene.content.join(' ');
  return {
    scene_number: scene.scene_number,
    slugline: scene.slugline,
    int_ext: scene.int_ext,
    location: scene.location,
    time_of_day: scene.time_of_day,
    characters: Object.entries(scene.characters).map(([name, data]) => ({
      name,
      dialogue_lines: data.dialogue_lines,
      words: data.words
    })),
    props: Array.from(scene.props),
    word_count: contentText.split(/\s+/).length,
    action_text: contentText.slice(0, 1500)
  };
}

function detectGenre(text, title) {
  const lowerText = text.toLowerCase();
  const scores = {};
  
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    let score = 0;
    
    // High weight keywords (5 points each)
    for (const kw of keywords.high) {
      const matches = (lowerText.match(new RegExp(kw, 'gi')) || []).length;
      score += matches * 5;
    }
    
    // Medium weight keywords (2 points each)
    for (const kw of keywords.medium) {
      const matches = (lowerText.match(new RegExp(kw, 'gi')) || []).length;
      score += matches * 2;
    }
    
    // Low weight keywords (1 point each, max 10)
    for (const kw of keywords.low) {
      const matches = Math.min((lowerText.match(new RegExp(kw, 'gi')) || []).length, 10);
      score += matches;
    }
    
    scores[genre] = score;
  }
  
  // Sort by score
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  
  // Return top genre if score > threshold, else drama
  if (sorted[0][1] > 15) {
    return { primary: sorted[0][0], secondary: sorted[1]?.[0] || null, scores };
  }
  
  return { primary: 'drama', secondary: null, scores };
}

function classifyCharacters(scenes) {
  // Aggregate character stats across all scenes
  const charStats = {};
  
  for (const scene of scenes) {
    for (const char of scene.characters) {
      if (!charStats[char.name]) {
        charStats[char.name] = {
          name: char.name,
          scenes_appeared: 0,
          total_dialogue_lines: 0,
          total_words: 0
        };
      }
      charStats[char.name].scenes_appeared++;
      charStats[char.name].total_dialogue_lines += char.dialogue_lines;
      charStats[char.name].total_words += char.words;
    }
  }
  
  // Convert to array and sort by dialogue
  const characters = Object.values(charStats).sort((a, b) => b.total_words - a.total_words);
  
  // Classify based on dialogue amount
  const totalScenes = scenes.length;
  
  return characters.map((char, index) => {
    let role = 'extra';
    const sceneRatio = char.scenes_appeared / totalScenes;
    
    if (index < 3 && char.total_words > 500) {
      role = 'protagonist';
    } else if (index < 8 && char.total_words > 200) {
      role = 'secondary';
    } else if (char.total_words > 50 || sceneRatio > 0.1) {
      role = 'supporting';
    }
    
    return { ...char, role };
  });
}

function extractLocations(scenes) {
  const locations = {};
  
  for (const scene of scenes) {
    const loc = scene.location;
    if (!locations[loc]) {
      locations[loc] = {
        name: loc,
        int_ext: scene.int_ext,
        scene_count: 0,
        times_of_day: new Set()
      };
    }
    locations[loc].scene_count++;
    locations[loc].times_of_day.add(scene.time_of_day);
  }
  
  return Object.values(locations)
    .map(l => ({ ...l, times_of_day: Array.from(l.times_of_day) }))
    .sort((a, b) => b.scene_count - a.scene_count);
}

function extractProps(scenes) {
  const props = {};
  
  for (const scene of scenes) {
    for (const prop of scene.props) {
      props[prop] = (props[prop] || 0) + 1;
    }
  }
  
  return Object.entries(props)
    .map(([name, count]) => ({ name, mentions: count }))
    .sort((a, b) => b.mentions - a.mentions);
}

// ============================================
// PROCESO PRINCIPAL
// ============================================

async function processScript(pdfPath, format = 'film') {
  const slug = path.basename(pdfPath, '.pdf');
  
  try {
    const { text, pageCount } = await parsePDF(pdfPath);
    const scenes = extractScenes(text);
    
    if (scenes.length < 5) {
      throw new Error(`Too few scenes detected: ${scenes.length}`);
    }
    
    const genre = detectGenre(text, slug);
    const characters = classifyCharacters(scenes);
    const locations = extractLocations(scenes);
    const props = extractProps(scenes);
    
    // Stats
    const protagonists = characters.filter(c => c.role === 'protagonist');
    const secondary = characters.filter(c => c.role === 'secondary');
    const supporting = characters.filter(c => c.role === 'supporting');
    const extras = characters.filter(c => c.role === 'extra');
    
    return {
      slug,
      title: slug.replace(/-\d{4}$/, '').replace(/-/g, ' '),
      year: slug.match(/-(\d{4})$/)?.[1] || null,
      format,
      page_count: pageCount,
      
      // Genre
      genre: genre.primary,
      genre_secondary: genre.secondary,
      genre_scores: genre.scores,
      
      // Scenes
      scenes_count: scenes.length,
      scenes_int: scenes.filter(s => s.int_ext === 'INT').length,
      scenes_ext: scenes.filter(s => s.int_ext === 'EXT').length,
      
      // Characters
      characters_total: characters.length,
      protagonists_count: protagonists.length,
      secondary_count: secondary.length,
      supporting_count: supporting.length,
      extras_count: extras.length,
      
      protagonists: protagonists.map(c => c.name),
      secondary_characters: secondary.map(c => c.name),
      
      characters: characters.slice(0, 30), // Top 30 with full data
      
      // Locations
      locations_count: locations.length,
      locations: locations.slice(0, 20),
      
      // Props
      props: props.slice(0, 20),
      
      // Words
      total_words: scenes.reduce((sum, s) => sum + s.word_count, 0),
      total_dialogue_lines: characters.reduce((sum, c) => sum + c.total_dialogue_lines, 0),
      
      // Scenes detail (for deep analysis)
      scenes: scenes.map(s => ({
        scene_number: s.scene_number,
        slugline: s.slugline,
        int_ext: s.int_ext,
        location: s.location,
        time_of_day: s.time_of_day,
        characters: s.characters.map(c => c.name),
        character_dialogue: s.characters,
        props: s.props,
        word_count: s.word_count
      }))
    };
  } catch (err) {
    console.error(`❌ ${slug}: ${err.message}`);
    return null;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  // Single file mode
  if (args[0] && args[0].endsWith('.pdf')) {
    console.log(`\n🎬 Parsing: ${args[0]}\n`);
    const result = await processScript(args[0]);
    if (result) {
      console.log(JSON.stringify(result, null, 2));
      
      // Save to parsed folder
      const outputPath = path.join(__dirname, 'parsed', `${result.slug}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved to: ${outputPath}`);
    }
    return;
  }
  
  // Batch mode
  const PDFS_DIR = path.join(__dirname, 'pdfs');
  const OUTPUT_DIR = path.join(__dirname, 'parsed');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  
  const pdfs = fs.readdirSync(PDFS_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`\n📂 Found ${pdfs.length} PDFs in ${PDFS_DIR}\n`);
  
  const results = [];
  const errors = [];
  
  for (let i = 0; i < pdfs.length; i++) {
    const pdfFile = pdfs[i];
    const pdfPath = path.join(PDFS_DIR, pdfFile);
    
    process.stdout.write(`[${i + 1}/${pdfs.length}] ${pdfFile}... `);
    
    const result = await processScript(pdfPath);
    if (result) {
      results.push(result);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${result.slug}.json`), JSON.stringify(result, null, 2));
      console.log(`✅ ${result.scenes_count} scenes, ${result.characters_total} chars`);
    } else {
      errors.push(pdfFile);
      console.log('❌');
    }
  }
  
  // Save index
  const index = results.map(r => ({
    slug: r.slug,
    title: r.title,
    year: r.year,
    genre: r.genre,
    scenes: r.scenes_count,
    characters: r.characters_total,
    protagonists: r.protagonists,
    locations: r.locations_count
  }));
  
  fs.writeFileSync(path.join(OUTPUT_DIR, '_index.json'), JSON.stringify(index, null, 2));
  
  // Summary stats
  const summary = {
    total_processed: results.length,
    total_errors: errors.length,
    by_genre: {},
    avg_scenes: Math.round(results.reduce((s, r) => s + r.scenes_count, 0) / results.length),
    avg_characters: Math.round(results.reduce((s, r) => s + r.characters_total, 0) / results.length),
    avg_locations: Math.round(results.reduce((s, r) => s + r.locations_count, 0) / results.length),
    avg_protagonists: (results.reduce((s, r) => s + r.protagonists_count, 0) / results.length).toFixed(1),
    processed_at: new Date().toISOString()
  };
  
  for (const r of results) {
    summary.by_genre[r.genre] = (summary.by_genre[r.genre] || 0) + 1;
  }
  
  fs.writeFileSync(path.join(OUTPUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 PARSING COMPLETE');
  console.log('='.repeat(60));
  console.log(`✅ Processed: ${results.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log(`📈 Avg scenes: ${summary.avg_scenes}`);
  console.log(`👥 Avg characters: ${summary.avg_characters}`);
  console.log(`🏠 Avg locations: ${summary.avg_locations}`);
  console.log(`⭐ Avg protagonists: ${summary.avg_protagonists}`);
  console.log('\nBy Genre:', summary.by_genre);
  console.log('='.repeat(60));
}

main().catch(console.error);
