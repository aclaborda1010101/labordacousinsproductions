/**
 * SCREENPLAY ENRICHMENT SCRIPT v3.0 - PROFESSIONAL PARSER
 * LC Studio - RAG del Guionista Profesional
 * 
 * Basado en:
 * - The Hollywood Standard (Christopher Riley)
 * - Save the Cat Beat Sheet (Blake Snyder)
 * - ACL Papers on Screenplay Parsing
 * - Final Draft Formatting Guide
 * 
 * Objetivo: >95% precisión en extracción
 * 
 * Fecha: 2026-01-29
 */

import fs from 'fs';
import path from 'path';

const PARSED_DIR = './parsed';
const OUTPUT_DIR = './enriched-v3';
const ANALYSIS_FILE = './analysis-summary-v3.json';

// ============================================================================
// PROFESSIONAL SCREENPLAY CONSTANTS
// ============================================================================

// Standard screenplay metrics
const LINES_PER_PAGE = 55;
const WORDS_PER_PAGE = 250;
const EXPECTED_SCENES_PER_PAGE = 0.5; // ~2 pages per scene average

// Line type tags (from ACL paper)
const LINE_TYPES = {
  SCENE_HEADING: 'H',
  ACTION: 'A',
  CHARACTER_CUE: 'C',
  DIALOGUE: 'D',
  PARENTHETICAL: 'P',
  TRANSITION: 'T',
  METADATA: 'M',
  BLANK: 'B'
};

// Character cue extensions (voice/delivery modifiers)
const CHARACTER_EXTENSIONS = [
  'V.O.', 'VO', 'V/O',           // Voice Over
  'O.S.', 'OS', 'O/S',           // Off Screen
  'O.C.', 'OC', 'O/C',           // Off Camera
  'CONT\'D', 'CONT', 'CONTD',    // Continued
  'CONTINUING',
  'PRE-LAP', 'PRELAP',           // Audio before visual
  'INTO PHONE', 'ON PHONE', 'OVER PHONE', 'PHONE',
  'INTO RADIO', 'ON RADIO', 'OVER RADIO',
  'ON TV', 'ON TELEVISION', 'ON MONITOR', 'ON SCREEN',
  'FILTERED', 'DISTORTED', 'ECHOING',
  'WHISPERING', 'SHOUTING', 'SCREAMING', 'YELLING',
  'SUBTITLE', 'SUBTITLED'
];

// Words that look like character names but aren't
const FALSE_POSITIVE_CHARACTERS = new Set([
  // Scene heading words
  'INT', 'EXT', 'INTERIOR', 'EXTERIOR', 'DAY', 'NIGHT', 'MORNING', 'EVENING',
  'AFTERNOON', 'DAWN', 'DUSK', 'LATER', 'CONTINUOUS', 'SAME', 'MOMENTS',
  
  // Transitions
  'CUT', 'FADE', 'DISSOLVE', 'SMASH', 'MATCH', 'JUMP', 'TIME', 'FLASH',
  'FLASHBACK', 'BACK', 'END', 'BEGIN', 'TITLE', 'SUPER', 'SUPERIMPOSE',
  
  // Camera directions
  'ANGLE', 'CLOSE', 'WIDE', 'MEDIUM', 'TIGHT', 'POV', 'INSERT', 'SHOT',
  'TRACKING', 'MOVING', 'PUSHING', 'PULLING', 'PAN', 'TILT', 'ZOOM',
  'AERIAL', 'CRANE', 'DOLLY', 'STEADICAM', 'HANDHELD',
  
  // Common action starters
  'THE', 'AND', 'BUT', 'SUDDENLY', 'FINALLY', 'MEANWHILE', 'ELSEWHERE',
  'WE', 'SEE', 'HEAR', 'REVEAL', 'BEAT', 'PAUSE', 'SILENCE',
  
  // Screenplay terms
  'CONTINUED', 'MORE', 'SCENE', 'SERIES', 'MONTAGE', 'INTERCUT',
  'OMITTED', 'REVISED', 'DRAFT', 'PAGE', 'NOTE', 'AUTHOR',
  
  // Location words
  'HOUSE', 'APARTMENT', 'OFFICE', 'ROOM', 'STREET', 'CAR', 'BUILDING',
  'KITCHEN', 'BEDROOM', 'BATHROOM', 'LIVING', 'DINING', 'HALLWAY',
  'LOBBY', 'ELEVATOR', 'STAIRS', 'ROOF', 'BASEMENT', 'GARAGE'
]);

// Genre detection with weighted keywords
const GENRE_WEIGHTS = {
  thriller: {
    high: ['murder', 'killer', 'death', 'dead body', 'blood', 'gun', 'shoot', 'stab', 'strangle'],
    medium: ['police', 'detective', 'fbi', 'cia', 'investigate', 'suspect', 'evidence', 'crime'],
    low: ['tension', 'fear', 'danger', 'threat', 'chase', 'escape', 'hide', 'secret'],
    structural: { nightRatio: 0.4, dialogueRatio: [0.3, 0.5] }
  },
  horror: {
    high: ['scream', 'monster', 'demon', 'ghost', 'haunted', 'possessed', 'evil', 'terror'],
    medium: ['dark', 'shadow', 'creature', 'supernatural', 'curse', 'blood', 'nightmare'],
    low: ['afraid', 'scared', 'creepy', 'disturbing', 'dread', 'horror'],
    structural: { nightRatio: 0.6, dialogueRatio: [0.2, 0.4] }
  },
  comedy: {
    high: ['laugh', 'funny', 'hilarious', 'joke', 'punchline', 'comedic'],
    medium: ['awkward', 'embarrass', 'silly', 'ridiculous', 'absurd', 'wacky'],
    low: ['smile', 'grin', 'chuckle', 'amused', 'playful', 'witty', 'sarcastic'],
    structural: { dialogueRatio: [0.55, 0.75] }
  },
  drama: {
    high: ['emotional', 'tears', 'cry', 'heartbreak', 'devastating'],
    medium: ['family', 'relationship', 'love', 'struggle', 'conflict', 'betrayal'],
    low: ['understand', 'connect', 'bond', 'grow', 'change', 'forgive', 'accept'],
    structural: { intRatio: 0.6, dialogueRatio: [0.45, 0.65] }
  },
  action: {
    high: ['explosion', 'fight', 'battle', 'combat', 'destroy', 'attack'],
    medium: ['chase', 'crash', 'smash', 'punch', 'kick', 'shoot', 'gun'],
    low: ['fast', 'speed', 'rush', 'run', 'jump', 'fall', 'hit'],
    structural: { extRatio: 0.45, dialogueRatio: [0.2, 0.4] }
  },
  romance: {
    high: ['love', 'kiss', 'romance', 'romantic', 'wedding', 'marry', 'proposal'],
    medium: ['heart', 'passion', 'desire', 'chemistry', 'attraction'],
    low: ['date', 'relationship', 'together', 'couple', 'feeling', 'connect'],
    structural: { dialogueRatio: [0.5, 0.7] }
  },
  scifi: {
    high: ['space', 'alien', 'robot', 'android', 'spaceship', 'galaxy', 'planet'],
    medium: ['future', 'technology', 'computer', 'machine', 'artificial', 'virtual'],
    low: ['science', 'experiment', 'lab', 'research', 'discover', 'invention'],
    structural: {}
  }
};

// Save the Cat beat sheet structure (pages for 110-page screenplay)
const BEAT_SHEET = {
  openingImage: { start: 0, end: 1, percent: [0, 1] },
  themeStated: { start: 5, end: 5, percent: [4, 6] },
  setup: { start: 1, end: 10, percent: [1, 9] },
  catalyst: { start: 12, end: 12, percent: [10, 13] },
  debate: { start: 12, end: 25, percent: [11, 23] },
  breakIntoTwo: { start: 25, end: 25, percent: [22, 27] },
  bStory: { start: 30, end: 30, percent: [27, 32] },
  funAndGames: { start: 30, end: 55, percent: [27, 50] },
  midpoint: { start: 55, end: 55, percent: [48, 52] },
  badGuysCloseIn: { start: 55, end: 75, percent: [50, 68] },
  allIsLost: { start: 75, end: 75, percent: [66, 72] },
  darkNightOfSoul: { start: 75, end: 85, percent: [68, 77] },
  breakIntoThree: { start: 85, end: 85, percent: [75, 80] },
  finale: { start: 85, end: 110, percent: [77, 100] },
  finalImage: { start: 110, end: 110, percent: [98, 100] }
};

// ============================================================================
// PROFESSIONAL LINE CLASSIFICATION
// ============================================================================

/**
 * Classify a single line of screenplay text
 */
function classifyLine(line, context) {
  const trimmed = line.trim();
  const originalIndent = line.length - line.trimStart().length;
  
  // Blank line
  if (trimmed.length === 0) {
    return { type: LINE_TYPES.BLANK, content: '' };
  }
  
  // Scene Heading (Slugline)
  const sluglineMatch = trimmed.match(/^(INT\.|EXT\.|INT\.?\/?EXT\.?|I\/E\.?)\s+(.+?)(?:\s*[-–—]\s*(.+?))?$/i);
  if (sluglineMatch) {
    return {
      type: LINE_TYPES.SCENE_HEADING,
      content: trimmed,
      intExt: sluglineMatch[1].toUpperCase().includes('INT') ? 'INT' : 'EXT',
      location: sluglineMatch[2]?.trim(),
      time: extractTimeOfDay(sluglineMatch[3] || sluglineMatch[2])
    };
  }
  
  // Transition
  if (/^(CUT TO:|FADE (IN|OUT|TO)\.?|DISSOLVE TO:|SMASH CUT( TO)?:|MATCH CUT( TO)?:|JUMP CUT( TO)?:|TIME CUT:|FADE TO BLACK\.?|THE END\.?|END\.?)$/i.test(trimmed)) {
    return { type: LINE_TYPES.TRANSITION, content: trimmed };
  }
  
  // Parenthetical
  if (/^\([^)]{1,60}\)$/.test(trimmed)) {
    return { type: LINE_TYPES.PARENTHETICAL, content: trimmed.slice(1, -1) };
  }
  
  // Character Cue
  if (isCharacterCue(trimmed)) {
    const { name, extension } = parseCharacterCue(trimmed);
    return {
      type: LINE_TYPES.CHARACTER_CUE,
      content: trimmed,
      characterName: name,
      extension: extension
    };
  }
  
  // Dialogue (follows character cue or parenthetical)
  if (context.previousType === LINE_TYPES.CHARACTER_CUE || 
      context.previousType === LINE_TYPES.PARENTHETICAL ||
      context.previousType === LINE_TYPES.DIALOGUE) {
    // Check if this looks like dialogue (not a new element)
    if (!isSceneHeading(trimmed) && !isTransition(trimmed) && !isCharacterCue(trimmed)) {
      return { type: LINE_TYPES.DIALOGUE, content: trimmed };
    }
  }
  
  // Default: Action
  return { type: LINE_TYPES.ACTION, content: trimmed };
}

function isSceneHeading(text) {
  return /^(INT\.|EXT\.|INT\.?\/?EXT\.?|I\/E\.?)\s+/i.test(text);
}

function isTransition(text) {
  return /^(CUT TO:|FADE|DISSOLVE|SMASH CUT|MATCH CUT|JUMP CUT|TIME CUT)/i.test(text);
}

function isCharacterCue(text) {
  // Must be mostly uppercase
  const upperCount = (text.match(/[A-Z]/g) || []).length;
  const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (letterCount === 0 || upperCount / letterCount < 0.8) return false;
  
  // Length check (character cues are typically short)
  if (text.length > 50 || text.length < 2) return false;
  
  // Remove extensions for checking
  const cleanName = text.replace(/\s*\([^)]*\)\s*/g, '').trim();
  
  // Check against false positives
  const firstWord = cleanName.split(/\s+/)[0];
  if (FALSE_POSITIVE_CHARACTERS.has(firstWord)) return false;
  
  // Should look like a name (letters, spaces, hyphens, apostrophes)
  if (!/^[A-Z][A-Z\s\.\-'#0-9]+$/.test(cleanName)) return false;
  
  // Shouldn't be all numbers
  if (/^\d+$/.test(cleanName)) return false;
  
  return true;
}

function parseCharacterCue(text) {
  // Extract extension if present
  const extMatch = text.match(/\(([^)]+)\)/g);
  let extension = null;
  let name = text;
  
  if (extMatch) {
    extension = extMatch.map(e => e.slice(1, -1)).join(', ');
    name = text.replace(/\s*\([^)]*\)\s*/g, '').trim();
  }
  
  return { name, extension };
}

function extractTimeOfDay(text) {
  if (!text) return 'UNKNOWN';
  const upper = text.toUpperCase();
  
  if (upper.includes('NIGHT')) return 'NIGHT';
  if (upper.includes('EVENING')) return 'EVENING';
  if (upper.includes('DUSK')) return 'DUSK';
  if (upper.includes('DAWN')) return 'DAWN';
  if (upper.includes('MORNING')) return 'MORNING';
  if (upper.includes('AFTERNOON')) return 'AFTERNOON';
  if (upper.includes('DAY')) return 'DAY';
  if (upper.includes('LATER')) return 'LATER';
  if (upper.includes('CONTINUOUS')) return 'CONTINUOUS';
  if (upper.includes('SAME')) return 'SAME';
  
  return 'UNKNOWN';
}

// ============================================================================
// PROFESSIONAL SCREENPLAY PARSER
// ============================================================================

function parseScreenplayV3(rawText) {
  const lines = rawText.split('\n');
  const parsed = {
    lines: [],
    scenes: [],
    characters: new Map(),
    dialogues: [],
    metadata: {
      totalLines: lines.length,
      totalWords: 0,
      estimatedPages: 0
    }
  };
  
  let context = { previousType: null, currentScene: null, currentCharacter: null };
  let currentDialogue = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const classified = classifyLine(line, context);
    parsed.lines.push(classified);
    
    // Count words
    const wordCount = classified.content.split(/\s+/).filter(w => w.length > 0).length;
    parsed.metadata.totalWords += wordCount;
    
    // Process by type
    switch (classified.type) {
      case LINE_TYPES.SCENE_HEADING:
        // Save previous scene
        if (context.currentScene) {
          parsed.scenes.push(context.currentScene);
        }
        // Start new scene
        context.currentScene = {
          sceneNumber: parsed.scenes.length + 1,
          slugline: classified.content,
          intExt: classified.intExt,
          location: classified.location,
          time: classified.time,
          characters: new Set(),
          dialogueCount: 0,
          actionLines: [],
          wordCount: 0,
          startLine: i
        };
        break;
        
      case LINE_TYPES.CHARACTER_CUE:
        // Track character
        const charName = classified.characterName;
        if (!parsed.characters.has(charName)) {
          parsed.characters.set(charName, {
            name: charName,
            dialogueLines: 0,
            scenesPresent: new Set(),
            firstAppearance: parsed.scenes.length + 1
          });
        }
        context.currentCharacter = charName;
        if (context.currentScene) {
          context.currentScene.characters.add(charName);
        }
        // Start collecting dialogue
        currentDialogue = [];
        break;
        
      case LINE_TYPES.DIALOGUE:
        if (context.currentCharacter) {
          currentDialogue.push(classified.content);
        }
        break;
        
      case LINE_TYPES.PARENTHETICAL:
        // Parenthetical within dialogue, keep context
        break;
        
      case LINE_TYPES.ACTION:
        // Flush any pending dialogue
        if (currentDialogue.length > 0 && context.currentCharacter) {
          const dialogueText = currentDialogue.join(' ');
          parsed.dialogues.push({
            character: context.currentCharacter,
            text: dialogueText,
            scene: parsed.scenes.length + 1
          });
          parsed.characters.get(context.currentCharacter).dialogueLines++;
          parsed.characters.get(context.currentCharacter).scenesPresent.add(parsed.scenes.length + 1);
          if (context.currentScene) {
            context.currentScene.dialogueCount++;
          }
          currentDialogue = [];
        }
        context.currentCharacter = null;
        
        // Add action to current scene
        if (context.currentScene) {
          context.currentScene.actionLines.push(classified.content);
          context.currentScene.wordCount += wordCount;
        }
        
        // Check for character introductions in action (NAME in caps)
        const introductions = classified.content.match(/\b([A-Z][A-Z]+(?:\s+[A-Z]+)?)\s*\([^)]*\d+[^)]*\)/g);
        if (introductions) {
          for (const intro of introductions) {
            const nameMatch = intro.match(/^([A-Z][A-Z\s]+)/);
            if (nameMatch && !FALSE_POSITIVE_CHARACTERS.has(nameMatch[1].trim())) {
              const name = nameMatch[1].trim();
              if (!parsed.characters.has(name)) {
                parsed.characters.set(name, {
                  name,
                  dialogueLines: 0,
                  scenesPresent: new Set(),
                  firstAppearance: parsed.scenes.length + 1,
                  introducedInAction: true
                });
              }
            }
          }
        }
        break;
        
      default:
        break;
    }
    
    context.previousType = classified.type;
  }
  
  // Flush final dialogue
  if (currentDialogue.length > 0 && context.currentCharacter) {
    const dialogueText = currentDialogue.join(' ');
    parsed.dialogues.push({
      character: context.currentCharacter,
      text: dialogueText,
      scene: parsed.scenes.length + 1
    });
    parsed.characters.get(context.currentCharacter).dialogueLines++;
  }
  
  // Save final scene
  if (context.currentScene) {
    parsed.scenes.push(context.currentScene);
  }
  
  // Calculate metadata
  parsed.metadata.estimatedPages = Math.round(parsed.metadata.totalWords / WORDS_PER_PAGE * 10) / 10;
  parsed.metadata.estimatedRuntime = Math.round(parsed.metadata.estimatedPages);
  
  return parsed;
}

// ============================================================================
// GENRE CLASSIFICATION V3
// ============================================================================

function classifyGenreV3(fullText, metrics) {
  const textLower = fullText.toLowerCase();
  const scores = {};
  
  for (const [genre, config] of Object.entries(GENRE_WEIGHTS)) {
    let score = 0;
    
    // Keyword scoring
    for (const keyword of config.high || []) {
      score += (textLower.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length * 5;
    }
    for (const keyword of config.medium || []) {
      score += (textLower.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length * 3;
    }
    for (const keyword of config.low || []) {
      score += (textLower.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length * 1;
    }
    
    // Structural scoring
    const struct = config.structural || {};
    if (struct.nightRatio && metrics.nightRatio >= struct.nightRatio) score += 30;
    if (struct.intRatio && metrics.intRatio >= struct.intRatio) score += 20;
    if (struct.extRatio && metrics.extRatio >= struct.extRatio) score += 20;
    if (struct.dialogueRatio) {
      const [min, max] = struct.dialogueRatio;
      if (metrics.dialogueRatio >= min && metrics.dialogueRatio <= max) score += 25;
    }
    
    scores[genre] = score;
  }
  
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    primary: sorted[0][0],
    secondary: sorted[1] && sorted[1][1] > sorted[0][1] * 0.6 ? sorted[1][0] : null,
    confidence: sorted[0][1] > 50 ? 'high' : sorted[0][1] > 25 ? 'medium' : 'low',
    scores
  };
}

// ============================================================================
// BEAT DETECTION
// ============================================================================

function detectBeatsV3(scenes, fullText) {
  const totalScenes = scenes.length;
  const beats = {};
  
  // Map beats to scene numbers based on position
  for (const [beatName, config] of Object.entries(BEAT_SHEET)) {
    const [minPct, maxPct] = config.percent;
    const startScene = Math.max(1, Math.floor(totalScenes * minPct / 100));
    const endScene = Math.min(totalScenes, Math.ceil(totalScenes * maxPct / 100));
    
    beats[beatName] = {
      estimatedSceneRange: [startScene, endScene],
      percentRange: config.percent,
      detected: false
    };
  }
  
  return beats;
}

// ============================================================================
// MAIN ENRICHMENT V3
// ============================================================================

function enrichScreenplayV3(originalData) {
  // Combine all text
  const fullText = originalData.scenes
    ?.map(s => [s.slugline, s.action_text].filter(Boolean).join('\n'))
    .join('\n\n') || '';
  
  // Parse with V3 professional parser
  const parsed = parseScreenplayV3(fullText);
  
  // Calculate comprehensive metrics
  let intCount = 0, extCount = 0, dayCount = 0, nightCount = 0;
  const locations = new Map();
  
  for (const scene of parsed.scenes) {
    if (scene.intExt === 'INT') intCount++;
    else if (scene.intExt === 'EXT') extCount++;
    
    const time = scene.time?.toUpperCase() || '';
    if (['DAY', 'MORNING', 'AFTERNOON'].includes(time)) dayCount++;
    else if (['NIGHT', 'EVENING', 'DUSK', 'DAWN'].includes(time)) nightCount++;
    
    if (scene.location) {
      const loc = scene.location.toUpperCase();
      locations.set(loc, (locations.get(loc) || 0) + 1);
    }
  }
  
  const totalTimeScenes = dayCount + nightCount;
  const dialogueWords = parsed.dialogues.reduce((sum, d) => sum + d.text.split(/\s+/).length, 0);
  const actionWords = parsed.metadata.totalWords - dialogueWords;
  
  const metrics = {
    totalScenes: parsed.scenes.length,
    totalWords: parsed.metadata.totalWords,
    estimatedPages: parsed.metadata.estimatedPages,
    estimatedRuntime: parsed.metadata.estimatedRuntime,
    
    intCount,
    extCount,
    intRatio: parsed.scenes.length > 0 ? Math.round(intCount / parsed.scenes.length * 100) / 100 : 0,
    extRatio: parsed.scenes.length > 0 ? Math.round(extCount / parsed.scenes.length * 100) / 100 : 0,
    
    dayCount,
    nightCount,
    dayRatio: totalTimeScenes > 0 ? Math.round(dayCount / totalTimeScenes * 100) / 100 : 0.5,
    nightRatio: totalTimeScenes > 0 ? Math.round(nightCount / totalTimeScenes * 100) / 100 : 0.5,
    
    uniqueCharacters: parsed.characters.size,
    totalDialogues: parsed.dialogues.length,
    uniqueLocations: locations.size,
    
    dialogueWords,
    actionWords,
    dialogueRatio: parsed.metadata.totalWords > 0 ? Math.round(dialogueWords / parsed.metadata.totalWords * 100) / 100 : 0,
    
    avgSceneLength: parsed.scenes.length > 0 ? Math.round(parsed.metadata.totalWords / parsed.scenes.length) : 0,
    avgDialoguesPerScene: parsed.scenes.length > 0 ? Math.round(parsed.dialogues.length / parsed.scenes.length * 10) / 10 : 0
  };
  
  // Genre classification
  const genreResult = classifyGenreV3(fullText, metrics);
  
  // Beat detection
  const beats = detectBeatsV3(parsed.scenes, fullText);
  
  // Build enriched output
  return {
    // Metadata
    slug: originalData.slug,
    title: originalData.title?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || originalData.slug,
    year: extractYear(originalData.slug),
    format: originalData.format || 'film',
    
    // Genre
    genre: genreResult.primary,
    genreSecondary: genreResult.secondary,
    genreConfidence: genreResult.confidence,
    genreScores: genreResult.scores,
    
    // Metrics
    metrics,
    
    // Structure
    structure: {
      totalScenes: parsed.scenes.length,
      act1End: Math.round(parsed.scenes.length * 0.25),
      midpoint: Math.round(parsed.scenes.length * 0.50),
      act2End: Math.round(parsed.scenes.length * 0.75),
      beats
    },
    
    // Characters (sorted by dialogue lines)
    characters: Array.from(parsed.characters.values())
      .map(c => ({
        name: c.name,
        dialogueLines: c.dialogueLines,
        scenesPresent: c.scenesPresent.size,
        firstAppearance: c.firstAppearance,
        introducedInAction: c.introducedInAction || false
      }))
      .sort((a, b) => b.dialogueLines - a.dialogueLines)
      .slice(0, 30),
    
    // Locations
    locations: Array.from(locations.entries())
      .map(([name, count]) => ({ name, frequency: count }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20),
    
    // Sample dialogues
    dialoguesSample: parsed.dialogues.slice(0, 100).map(d => ({
      character: d.character,
      text: d.text.substring(0, 200),
      scene: d.scene
    })),
    
    // Scenes summary
    scenes: parsed.scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      slugline: s.slugline,
      intExt: s.intExt,
      location: s.location,
      time: s.time,
      characters: Array.from(s.characters),
      dialogueCount: s.dialogueCount,
      wordCount: s.wordCount,
      pageEstimate: Math.round(s.wordCount / WORDS_PER_PAGE * 10) / 10
    })),
    
    // Quality flags
    quality: {
      hasCharacters: parsed.characters.size > 0,
      hasDialogue: parsed.dialogues.length > 0,
      hasMultipleScenes: parsed.scenes.length > 5,
      estimatedComplete: parsed.metadata.estimatedPages > 70,
      parseConfidence: calculateParseConfidence(parsed, metrics)
    }
  };
}

function extractYear(slug) {
  const match = slug?.match(/(\d{4})$/);
  return match ? parseInt(match[1]) : null;
}

function calculateParseConfidence(parsed, metrics) {
  let score = 0;
  
  // Characters found
  if (parsed.characters.size > 0) score += 20;
  if (parsed.characters.size > 5) score += 10;
  if (parsed.characters.size > 10) score += 10;
  
  // Dialogues found
  if (parsed.dialogues.length > 0) score += 20;
  if (parsed.dialogues.length > 50) score += 10;
  
  // Scenes found
  if (parsed.scenes.length > 5) score += 15;
  if (parsed.scenes.length > 20) score += 10;
  
  // Reasonable metrics
  if (metrics.dialogueRatio > 0.1 && metrics.dialogueRatio < 0.8) score += 5;
  
  return score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
}

// ============================================================================
// ANALYSIS SUMMARY V3
// ============================================================================

function generateAnalysisSummaryV3(enriched) {
  const summary = {
    version: '3.0',
    totalScreenplays: enriched.length,
    processedAt: new Date().toISOString(),
    
    qualityMetrics: {
      withCharacters: 0,
      withDialogue: 0,
      withMultipleScenes: 0,
      estimatedComplete: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0
    },
    
    avgMetrics: {},
    genreDistribution: {},
    formatDistribution: {},
    
    topExamples: []
  };
  
  if (enriched.length === 0) return summary;
  
  // Aggregate
  let totals = {
    scenes: 0, runtime: 0, characters: 0, dialogues: 0, locations: 0,
    dialogueRatio: 0, intRatio: 0, nightRatio: 0
  };
  
  for (const sp of enriched) {
    // Quality
    if (sp.quality?.hasCharacters) summary.qualityMetrics.withCharacters++;
    if (sp.quality?.hasDialogue) summary.qualityMetrics.withDialogue++;
    if (sp.quality?.hasMultipleScenes) summary.qualityMetrics.withMultipleScenes++;
    if (sp.quality?.estimatedComplete) summary.qualityMetrics.estimatedComplete++;
    if (sp.quality?.parseConfidence === 'high') summary.qualityMetrics.highConfidence++;
    else if (sp.quality?.parseConfidence === 'medium') summary.qualityMetrics.mediumConfidence++;
    else summary.qualityMetrics.lowConfidence++;
    
    // Totals
    totals.scenes += sp.metrics?.totalScenes || 0;
    totals.runtime += sp.metrics?.estimatedRuntime || 0;
    totals.characters += sp.characters?.length || 0;
    totals.dialogues += sp.metrics?.totalDialogues || 0;
    totals.locations += sp.metrics?.uniqueLocations || 0;
    totals.dialogueRatio += sp.metrics?.dialogueRatio || 0;
    totals.intRatio += sp.metrics?.intRatio || 0;
    totals.nightRatio += sp.metrics?.nightRatio || 0;
    
    // Genre
    summary.genreDistribution[sp.genre] = (summary.genreDistribution[sp.genre] || 0) + 1;
    
    // Format
    summary.formatDistribution[sp.format] = (summary.formatDistribution[sp.format] || 0) + 1;
  }
  
  const n = enriched.length;
  summary.avgMetrics = {
    avgScenes: Math.round(totals.scenes / n),
    avgRuntime: Math.round(totals.runtime / n),
    avgCharacters: Math.round(totals.characters / n * 10) / 10,
    avgDialogues: Math.round(totals.dialogues / n * 10) / 10,
    avgLocations: Math.round(totals.locations / n * 10) / 10,
    avgDialogueRatio: Math.round(totals.dialogueRatio / n * 100) / 100,
    avgIntRatio: Math.round(totals.intRatio / n * 100) / 100,
    avgNightRatio: Math.round(totals.nightRatio / n * 100) / 100
  };
  
  // Calculate percentages
  summary.qualityMetrics.withCharactersPercent = Math.round(summary.qualityMetrics.withCharacters / n * 100);
  summary.qualityMetrics.withDialoguePercent = Math.round(summary.qualityMetrics.withDialogue / n * 100);
  summary.qualityMetrics.withMultipleScenesPercent = Math.round(summary.qualityMetrics.withMultipleScenes / n * 100);
  summary.qualityMetrics.highConfidencePercent = Math.round(summary.qualityMetrics.highConfidence / n * 100);
  
  // Top examples
  summary.topExamples = enriched
    .filter(sp => sp.quality?.parseConfidence === 'high' && sp.characters?.length >= 10)
    .sort((a, b) => (b.characters?.length || 0) - (a.characters?.length || 0))
    .slice(0, 20)
    .map(sp => ({
      title: sp.title,
      slug: sp.slug,
      scenes: sp.metrics?.totalScenes,
      runtime: sp.metrics?.estimatedRuntime,
      characters: sp.characters?.length,
      dialogues: sp.metrics?.totalDialogues,
      genre: sp.genre,
      confidence: sp.quality?.parseConfidence,
      topCharacters: sp.characters?.slice(0, 5).map(c => c.name)
    }));
  
  return summary;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🎬 SCREENPLAY ENRICHMENT SCRIPT v3.0 - PROFESSIONAL PARSER');
  console.log('============================================================');
  console.log('Basado en: Hollywood Standard, Save the Cat, ACL Papers');
  console.log('Objetivo: >95% precisión\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const files = fs.readdirSync(PARSED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'));
  
  console.log(`📁 Found ${files.length} screenplay files\n`);
  
  const enriched = [];
  let success = 0, errors = 0;
  const errorList = [];
  
  for (let i = 0; i < files.length; i++) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, files[i]), 'utf-8'));
      const result = enrichScreenplayV3(raw);
      enriched.push(result);
      
      fs.writeFileSync(path.join(OUTPUT_DIR, files[i]), JSON.stringify(result, null, 2));
      success++;
      
      if ((i + 1) % 50 === 0 || i === files.length - 1) {
        const chars = result.characters?.length || 0;
        const scenes = result.metrics?.totalScenes || 0;
        const conf = result.quality?.parseConfidence || '?';
        console.log(`✅ ${i + 1}/${files.length} - ${result.title} [${chars} chars, ${scenes} scenes, ${conf}]`);
      }
    } catch (e) {
      errors++;
      errorList.push({ file: files[i], error: e.message });
    }
  }
  
  console.log('\n📊 Generating V3 summary...');
  const summary = generateAnalysisSummaryV3(enriched);
  summary.errors = errorList;
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(summary, null, 2));
  
  console.log('\n============================================================');
  console.log('📈 V3 ANALYSIS COMPLETE');
  console.log('============================================================\n');
  console.log(`✅ Success: ${success} | ❌ Errors: ${errors}`);
  
  console.log('\n🎯 QUALITY METRICS:');
  console.log(`   With characters: ${summary.qualityMetrics.withCharactersPercent}%`);
  console.log(`   With dialogue: ${summary.qualityMetrics.withDialoguePercent}%`);
  console.log(`   With multiple scenes: ${summary.qualityMetrics.withMultipleScenesPercent}%`);
  console.log(`   High confidence: ${summary.qualityMetrics.highConfidencePercent}%`);
  
  console.log('\n📊 AVERAGES:');
  console.log(`   Scenes: ${summary.avgMetrics.avgScenes}`);
  console.log(`   Runtime: ${summary.avgMetrics.avgRuntime} min`);
  console.log(`   Characters: ${summary.avgMetrics.avgCharacters}`);
  console.log(`   Dialogues: ${summary.avgMetrics.avgDialogues}`);
  console.log(`   Dialogue ratio: ${summary.avgMetrics.avgDialogueRatio}`);
  
  console.log('\n📁 Genre distribution:');
  for (const [g, c] of Object.entries(summary.genreDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${g}: ${c} (${Math.round(c / success * 100)}%)`);
  }
  
  console.log('\n🏆 TOP EXAMPLES:');
  for (const ex of summary.topExamples.slice(0, 5)) {
    console.log(`   ${ex.title}: ${ex.characters} chars, ${ex.scenes} scenes, ${ex.dialogues} dialogues`);
  }
  
  console.log(`\n📄 Output: ${OUTPUT_DIR}/, ${ANALYSIS_FILE}`);
}

main().catch(console.error);
