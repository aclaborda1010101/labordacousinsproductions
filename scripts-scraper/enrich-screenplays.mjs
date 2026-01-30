/**
 * SCREENPLAY ENRICHMENT SCRIPT v1.0
 * LC Studio - RAG del Guionista Profesional
 * 
 * Procesa los 668 guiones parseados y extrae:
 * - Separación diálogo/acción
 * - Personajes y sus líneas
 * - Métricas cuantitativas
 * - Estructura de actos (estimada)
 * - Clasificación de género
 * 
 * Fecha: 2026-01-29
 */

import fs from 'fs';
import path from 'path';

const PARSED_DIR = './parsed';
const OUTPUT_DIR = './enriched';
const ANALYSIS_FILE = './analysis-summary.json';

// ============================================================================
// REGEX PATTERNS FOR SCREENPLAY PARSING
// ============================================================================

const PATTERNS = {
  // Character cue: ALL CAPS name, possibly with (V.O.), (O.S.), (CONT'D)
  characterCue: /^([A-Z][A-Z\s\.\-']+?)(?:\s*\((?:V\.O\.|O\.S\.|CONT'D|CONT|O\.C\.|INTO PHONE|ON PHONE|ON TV|ON RADIO|OVER PHONE|ON MACHINE|FILTERED|PRE-?LAP)\))?$/,
  
  // Slugline: INT. or EXT. or INT/EXT or I/E
  slugline: /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.?)\s*(.+?)\s*[-–—]\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|LATER|CONTINUOUS|SAME|MOMENTS LATER|DAWN|DUSK|SUNSET|SUNRISE)?/i,
  
  // Parenthetical: (text in parentheses)
  parenthetical: /^\s*\(([^)]+)\)\s*$/,
  
  // Transition: CUT TO, FADE OUT, etc.
  transition: /^(CUT TO:|FADE OUT\.|FADE IN:|DISSOLVE TO:|SMASH CUT:|MATCH CUT:|JUMP CUT:|TIME CUT:|FADE TO BLACK\.|END\.|THE END)/i,
  
  // Scene number in slugline
  sceneNumber: /(\d+)\s*$/,
};

// Genre keywords for classification
const GENRE_KEYWORDS = {
  thriller: ['murder', 'kill', 'dead', 'blood', 'gun', 'police', 'detective', 'crime', 'suspense', 'chase'],
  horror: ['scream', 'terror', 'monster', 'ghost', 'haunted', 'demon', 'evil', 'nightmare', 'blood', 'death'],
  comedy: ['laugh', 'funny', 'joke', 'hilarious', 'awkward', 'embarrass'],
  drama: ['family', 'relationship', 'love', 'heart', 'emotion', 'struggle', 'dream'],
  action: ['explosion', 'fight', 'chase', 'gun', 'shoot', 'punch', 'kick', 'battle', 'war'],
  romance: ['love', 'kiss', 'heart', 'romance', 'dating', 'relationship', 'marry', 'wedding'],
  scifi: ['space', 'alien', 'robot', 'future', 'technology', 'computer', 'machine', 'planet'],
};

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse raw text and separate dialogue from action
 */
function parseSceneText(rawText) {
  if (!rawText) return { dialogues: [], actionLines: [], characters: new Set() };
  
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const dialogues = [];
  const actionLines = [];
  const characters = new Set();
  
  let currentCharacter = null;
  let currentDialogue = [];
  let inDialogue = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if it's a character cue
    const charMatch = line.match(PATTERNS.characterCue);
    if (charMatch && line.length < 40 && line === line.toUpperCase()) {
      // Save previous dialogue if exists
      if (currentCharacter && currentDialogue.length > 0) {
        dialogues.push({
          character: currentCharacter,
          text: currentDialogue.join(' ').trim()
        });
      }
      
      currentCharacter = charMatch[1].trim();
      characters.add(currentCharacter);
      currentDialogue = [];
      inDialogue = true;
      continue;
    }
    
    // Check if it's a parenthetical
    if (PATTERNS.parenthetical.test(line)) {
      // Keep it with dialogue but mark it
      if (inDialogue) {
        currentDialogue.push(line);
      }
      continue;
    }
    
    // Check if it's a transition
    if (PATTERNS.transition.test(line)) {
      inDialogue = false;
      if (currentCharacter && currentDialogue.length > 0) {
        dialogues.push({
          character: currentCharacter,
          text: currentDialogue.join(' ').trim()
        });
        currentCharacter = null;
        currentDialogue = [];
      }
      continue;
    }
    
    // Check if it looks like action (not indented dialogue)
    // Action usually starts with uppercase and describes visual
    if (inDialogue && !line.startsWith('(')) {
      // Could be dialogue continuation or action
      // If line is short and doesn't end with period, likely dialogue
      if (line.length < 100) {
        currentDialogue.push(line);
      } else {
        // Long line, probably action
        inDialogue = false;
        if (currentCharacter && currentDialogue.length > 0) {
          dialogues.push({
            character: currentCharacter,
            text: currentDialogue.join(' ').trim()
          });
          currentCharacter = null;
          currentDialogue = [];
        }
        actionLines.push(line);
      }
    } else {
      // Not in dialogue mode - this is action
      actionLines.push(line);
    }
  }
  
  // Don't forget last dialogue
  if (currentCharacter && currentDialogue.length > 0) {
    dialogues.push({
      character: currentCharacter,
      text: currentDialogue.join(' ').trim()
    });
  }
  
  return { dialogues, actionLines, characters };
}

/**
 * Parse slugline to extract location, time, int/ext
 */
function parseSlugline(slugline) {
  if (!slugline) return { intExt: null, location: null, time: null };
  
  const match = slugline.match(PATTERNS.slugline);
  if (match) {
    return {
      intExt: match[1].replace('.', '').replace('/', '_').toUpperCase(),
      location: match[2]?.trim() || null,
      time: match[3]?.toUpperCase() || null
    };
  }
  
  // Fallback: try to detect INT/EXT
  const intExt = slugline.includes('INT') ? 'INT' : slugline.includes('EXT') ? 'EXT' : null;
  return { intExt, location: slugline, time: null };
}

/**
 * Estimate page count from word count (industry standard: ~250 words/page)
 */
function estimatePages(wordCount) {
  return Math.round((wordCount / 250) * 10) / 10;
}

/**
 * Detect genre from text content
 */
function detectGenre(fullText) {
  const textLower = fullText.toLowerCase();
  const genreScores = {};
  
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    genreScores[genre] = keywords.reduce((score, keyword) => {
      const regex = new RegExp(keyword, 'gi');
      const matches = textLower.match(regex);
      return score + (matches ? matches.length : 0);
    }, 0);
  }
  
  // Find top genre
  const sortedGenres = Object.entries(genreScores)
    .sort((a, b) => b[1] - a[1]);
  
  if (sortedGenres[0][1] > 5) {
    return sortedGenres[0][0];
  }
  return 'drama'; // Default
}

/**
 * Estimate act structure based on scene count
 */
function estimateActStructure(totalScenes) {
  // Standard 3-act structure: 25% / 50% / 25%
  const act1End = Math.round(totalScenes * 0.25);
  const midpoint = Math.round(totalScenes * 0.5);
  const act2End = Math.round(totalScenes * 0.75);
  
  return {
    act1EndScene: act1End,
    midpointScene: midpoint,
    act2EndScene: act2End,
    totalScenes
  };
}

// ============================================================================
// MAIN ENRICHMENT FUNCTION
// ============================================================================

function enrichScreenplay(originalData) {
  const enriched = {
    // Basic info
    slug: originalData.slug,
    title: originalData.title?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || originalData.slug,
    year: extractYear(originalData.slug),
    format: originalData.format || 'film',
    
    // Will be calculated
    genre: null,
    runtimeEstimated: 0,
    pagesEstimated: 0,
    
    // Structure
    structure: null,
    
    // Metrics
    metrics: {
      totalScenes: 0,
      intExtRatio: 0,
      dialogueActionRatio: 0,
      avgSceneLength: 0,
      uniqueCharacters: 0,
      uniqueLocations: 0,
      totalDialogueLines: 0,
      totalActionLines: 0,
      totalWords: originalData.total_words || 0
    },
    
    // Extracted entities
    characters: [],
    locations: [],
    
    // Enriched scenes
    scenes: []
  };
  
  // Track characters and locations across all scenes
  const allCharacters = new Map(); // name -> { lines, scenes }
  const allLocations = new Map(); // name -> { type, count }
  let totalDialogueWords = 0;
  let totalActionWords = 0;
  let intCount = 0;
  let extCount = 0;
  let fullText = '';
  
  // Process each scene
  if (originalData.scenes && Array.isArray(originalData.scenes)) {
    for (const scene of originalData.scenes) {
      // Parse slugline
      const parsedSlugline = parseSlugline(scene.slugline);
      
      // Track INT/EXT
      if (parsedSlugline.intExt === 'INT') intCount++;
      else if (parsedSlugline.intExt === 'EXT') extCount++;
      
      // Track location
      if (parsedSlugline.location) {
        const locKey = parsedSlugline.location.toUpperCase();
        if (!allLocations.has(locKey)) {
          allLocations.set(locKey, { type: parsedSlugline.intExt, count: 0 });
        }
        allLocations.get(locKey).count++;
      }
      
      // Parse scene text to separate dialogue and action
      const combinedText = [scene.action_text, scene.slugline].filter(Boolean).join('\n');
      fullText += combinedText + '\n';
      
      const parsed = parseSceneText(combinedText);
      
      // Track characters
      for (const char of parsed.characters) {
        if (!allCharacters.has(char)) {
          allCharacters.set(char, { dialogueLines: 0, scenesPresent: new Set() });
        }
        allCharacters.get(char).scenesPresent.add(scene.scene_number);
      }
      
      for (const dialogue of parsed.dialogues) {
        if (allCharacters.has(dialogue.character)) {
          allCharacters.get(dialogue.character).dialogueLines++;
        }
        totalDialogueWords += dialogue.text.split(/\s+/).length;
      }
      
      totalActionWords += parsed.actionLines.join(' ').split(/\s+/).length;
      
      // Build enriched scene
      enriched.scenes.push({
        sceneNumber: scene.scene_number,
        slugline: scene.slugline,
        location: parsedSlugline.location,
        time: parsedSlugline.time,
        intExt: parsedSlugline.intExt,
        dialogues: parsed.dialogues,
        actionLineCount: parsed.actionLines.length,
        wordCount: scene.word_count || 0,
        pageEstimate: estimatePages(scene.word_count || 0),
        charactersInScene: Array.from(parsed.characters)
      });
    }
  }
  
  // Calculate final metrics
  const totalScenes = enriched.scenes.length;
  enriched.metrics.totalScenes = totalScenes;
  enriched.metrics.intExtRatio = totalScenes > 0 ? Math.round((intCount / (intCount + extCount || 1)) * 100) / 100 : 0;
  enriched.metrics.dialogueActionRatio = totalActionWords > 0 ? Math.round((totalDialogueWords / totalActionWords) * 100) / 100 : 0;
  enriched.metrics.avgSceneLength = totalScenes > 0 ? Math.round(enriched.metrics.totalWords / totalScenes) : 0;
  enriched.metrics.uniqueCharacters = allCharacters.size;
  enriched.metrics.uniqueLocations = allLocations.size;
  enriched.metrics.totalDialogueLines = Array.from(allCharacters.values()).reduce((sum, c) => sum + c.dialogueLines, 0);
  
  // Build characters array
  enriched.characters = Array.from(allCharacters.entries())
    .map(([name, data]) => ({
      name,
      dialogueLines: data.dialogueLines,
      scenesPresent: data.scenesPresent.size,
      firstAppearance: Math.min(...data.scenesPresent)
    }))
    .sort((a, b) => b.dialogueLines - a.dialogueLines)
    .slice(0, 20); // Top 20 characters
  
  // Build locations array
  enriched.locations = Array.from(allLocations.entries())
    .map(([name, data]) => ({
      name,
      type: data.type,
      frequency: data.count
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20); // Top 20 locations
  
  // Estimate structure
  enriched.structure = estimateActStructure(totalScenes);
  
  // Detect genre
  enriched.genre = detectGenre(fullText);
  
  // Estimate runtime
  enriched.pagesEstimated = estimatePages(enriched.metrics.totalWords);
  enriched.runtimeEstimated = Math.round(enriched.pagesEstimated); // 1 page ≈ 1 minute
  
  return enriched;
}

function extractYear(slug) {
  const match = slug.match(/(\d{4})$/);
  return match ? parseInt(match[1]) : null;
}

// ============================================================================
// ANALYSIS SUMMARY
// ============================================================================

function generateAnalysisSummary(enrichedScreenplays) {
  const summary = {
    totalScreenplays: enrichedScreenplays.length,
    processedAt: new Date().toISOString(),
    
    // Aggregate metrics
    avgMetrics: {
      avgScenes: 0,
      avgRuntime: 0,
      avgCharacters: 0,
      avgLocations: 0,
      avgDialogueActionRatio: 0,
      avgIntExtRatio: 0
    },
    
    // Distribution by genre
    genreDistribution: {},
    
    // Distribution by format
    formatDistribution: {},
    
    // Top patterns
    patterns: {
      avgAct1EndPercent: 0,
      avgMidpointPercent: 0,
      avgScenesPerAct: { act1: 0, act2: 0, act3: 0 }
    },
    
    // Character patterns
    characterPatterns: {
      avgProtagonistLines: 0,
      avgSpeakingCharacters: 0
    },
    
    // Sample of best structured screenplays
    wellStructuredExamples: []
  };
  
  if (enrichedScreenplays.length === 0) return summary;
  
  // Calculate averages
  let totalScenes = 0, totalRuntime = 0, totalCharacters = 0, totalLocations = 0;
  let totalDialogueRatio = 0, totalIntExtRatio = 0;
  
  for (const sp of enrichedScreenplays) {
    totalScenes += sp.metrics.totalScenes;
    totalRuntime += sp.runtimeEstimated;
    totalCharacters += sp.metrics.uniqueCharacters;
    totalLocations += sp.metrics.uniqueLocations;
    totalDialogueRatio += sp.metrics.dialogueActionRatio;
    totalIntExtRatio += sp.metrics.intExtRatio;
    
    // Genre distribution
    summary.genreDistribution[sp.genre] = (summary.genreDistribution[sp.genre] || 0) + 1;
    
    // Format distribution
    summary.formatDistribution[sp.format] = (summary.formatDistribution[sp.format] || 0) + 1;
  }
  
  const count = enrichedScreenplays.length;
  summary.avgMetrics = {
    avgScenes: Math.round(totalScenes / count),
    avgRuntime: Math.round(totalRuntime / count),
    avgCharacters: Math.round(totalCharacters / count),
    avgLocations: Math.round(totalLocations / count),
    avgDialogueActionRatio: Math.round((totalDialogueRatio / count) * 100) / 100,
    avgIntExtRatio: Math.round((totalIntExtRatio / count) * 100) / 100
  };
  
  // Find well-structured examples (closest to standard structure)
  summary.wellStructuredExamples = enrichedScreenplays
    .filter(sp => sp.metrics.totalScenes > 20 && sp.runtimeEstimated > 80)
    .slice(0, 10)
    .map(sp => ({
      title: sp.title,
      slug: sp.slug,
      scenes: sp.metrics.totalScenes,
      runtime: sp.runtimeEstimated,
      genre: sp.genre,
      topCharacters: sp.characters.slice(0, 3).map(c => c.name)
    }));
  
  return summary;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🎬 SCREENPLAY ENRICHMENT SCRIPT v1.0');
  console.log('=====================================\n');
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Get all parsed files
  const files = fs.readdirSync(PARSED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'));
  
  console.log(`📁 Found ${files.length} screenplay files to process\n`);
  
  const enrichedScreenplays = [];
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progressPercent = Math.round(((i + 1) / files.length) * 100);
    
    try {
      const filePath = path.join(PARSED_DIR, file);
      const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      const enriched = enrichScreenplay(rawData);
      enrichedScreenplays.push(enriched);
      
      // Save individual enriched file
      const outputPath = path.join(OUTPUT_DIR, file);
      fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2));
      
      successCount++;
      
      // Progress update every 50 files
      if ((i + 1) % 50 === 0 || i === files.length - 1) {
        console.log(`✅ Progress: ${i + 1}/${files.length} (${progressPercent}%) - ${enriched.title}`);
      }
    } catch (error) {
      errorCount++;
      errors.push({ file, error: error.message });
      console.error(`❌ Error processing ${file}: ${error.message}`);
    }
  }
  
  // Generate and save analysis summary
  console.log('\n📊 Generating analysis summary...');
  const summary = generateAnalysisSummary(enrichedScreenplays);
  summary.errors = errors;
  
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(summary, null, 2));
  
  // Print summary
  console.log('\n=====================================');
  console.log('📈 ANALYSIS COMPLETE');
  console.log('=====================================\n');
  console.log(`✅ Successfully processed: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`\n📊 KEY FINDINGS:`);
  console.log(`   Average scenes per screenplay: ${summary.avgMetrics.avgScenes}`);
  console.log(`   Average runtime (estimated): ${summary.avgMetrics.avgRuntime} min`);
  console.log(`   Average unique characters: ${summary.avgMetrics.avgCharacters}`);
  console.log(`   Average unique locations: ${summary.avgMetrics.avgLocations}`);
  console.log(`   Average dialogue/action ratio: ${summary.avgMetrics.avgDialogueActionRatio}`);
  console.log(`   Average INT/EXT ratio: ${summary.avgMetrics.avgIntExtRatio}`);
  console.log(`\n📁 Genre distribution:`);
  for (const [genre, count] of Object.entries(summary.genreDistribution)) {
    console.log(`   ${genre}: ${count} (${Math.round(count/successCount*100)}%)`);
  }
  console.log(`\n📄 Output saved to:`);
  console.log(`   - ${OUTPUT_DIR}/ (individual enriched files)`);
  console.log(`   - ${ANALYSIS_FILE} (summary analysis)`);
}

main().catch(console.error);
