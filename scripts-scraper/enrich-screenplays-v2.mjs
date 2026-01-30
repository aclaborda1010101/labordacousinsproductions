/**
 * SCREENPLAY ENRICHMENT SCRIPT v2.0
 * LC Studio - RAG del Guionista Profesional
 * 
 * MEJORAS V2:
 * - Detección agresiva de personajes (regex + heurística)
 * - Separación de diálogos por contexto
 * - Clasificación de género multi-criterio
 * - Re-parseo de escenas desde texto completo
 * - Detección de turning points narrativos
 * 
 * Objetivo: >90% precisión en todas las métricas
 * 
 * Fecha: 2026-01-29
 */

import fs from 'fs';
import path from 'path';

const PARSED_DIR = './parsed';
const OUTPUT_DIR = './enriched-v2';
const ANALYSIS_FILE = './analysis-summary-v2.json';

// ============================================================================
// IMPROVED PATTERNS V2
// ============================================================================

// Words to exclude from character detection (common screenplay terms)
const EXCLUDE_WORDS = new Set([
  'INT', 'EXT', 'CUT', 'FADE', 'THE', 'AND', 'BUT', 'CLOSE', 'ANGLE', 'CONT',
  'CONTINUED', 'DISSOLVE', 'LATER', 'DAY', 'NIGHT', 'MORNING', 'EVENING',
  'CONTINUOUS', 'SAME', 'MOMENTS', 'FLASHBACK', 'FLASH', 'BACK', 'END',
  'SUPER', 'TITLE', 'SUBTITLE', 'INTERCUT', 'PRELAP', 'BEGIN', 'RESUME',
  'SERIES', 'SHOTS', 'MONTAGE', 'OMITTED', 'REVISED', 'DRAFT', 'SCENE',
  'PAGE', 'SHOT', 'WIDE', 'MEDIUM', 'TIGHT', 'POV', 'INSERT', 'ESTABLISHING',
  'TRACKING', 'MOVING', 'PUSHING', 'PULLING', 'PAN', 'TILT', 'ZOOM',
  'OVER', 'UNDER', 'THROUGH', 'INTO', 'FROM', 'TOWARD', 'AWAY', 'ACROSS',
  'BEHIND', 'FRONT', 'SIDE', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT', 'CENTER',
  'QUICK', 'SLOW', 'FAST', 'BEAT', 'PAUSE', 'SILENCE', 'THEN', 'NOW',
  'SUDDENLY', 'FINALLY', 'MEANWHILE', 'ELSEWHERE', 'NEARBY', 'OUTSIDE',
  'INSIDE', 'ABOVE', 'BELOW', 'AROUND', 'BETWEEN', 'NEAR', 'FAR',
  'TIME', 'PLACE', 'LOCATION', 'AREA', 'ROOM', 'SPACE', 'HOUSE', 'BUILDING',
  'STREET', 'ROAD', 'CAR', 'VEHICLE', 'OFFICE', 'APARTMENT', 'KITCHEN',
  'BEDROOM', 'BATHROOM', 'LIVING', 'DINING', 'HALLWAY', 'LOBBY', 'ELEVATOR',
  'STAIRS', 'ROOF', 'BASEMENT', 'GARAGE', 'YARD', 'GARDEN', 'PARK',
  'MOS', 'SFX', 'VFX', 'CGI', 'STOCK', 'ARCHIVE', 'NEWS', 'TELEVISION',
  'RADIO', 'PHONE', 'COMPUTER', 'SCREEN', 'MONITOR', 'CAMERA', 'VIDEO',
  'MUSIC', 'SONG', 'SOUND', 'VOICE', 'NOISE', 'SILENCE', 'QUIET', 'LOUD',
  'BLACK', 'WHITE', 'FADE', 'TITLE', 'CARD', 'TEXT', 'GRAPHIC', 'IMAGE',
  'PHOTOS', 'PICTURES', 'IMAGES', 'FOOTAGE', 'CLIP', 'SEQUENCE', 'SECTION',
  'PART', 'CHAPTER', 'ACT', 'SCENE', 'BEAT', 'MOMENT', 'INSTANT',
  'RESUME', 'RETURN', 'BACK', 'AGAIN', 'STILL', 'YET', 'ALREADY', 'JUST',
  'ONLY', 'EVEN', 'ALSO', 'TOO', 'VERY', 'MUCH', 'MORE', 'LESS', 'MOST',
  'LEAST', 'EVERY', 'EACH', 'ALL', 'BOTH', 'EITHER', 'NEITHER', 'ANY',
  'SOME', 'MANY', 'FEW', 'SEVERAL', 'OTHER', 'ANOTHER', 'SUCH', 'SAME',
  'DIFFERENT', 'VARIOUS', 'CERTAIN', 'SPECIFIC', 'PARTICULAR', 'GENERAL',
  'MAIN', 'MAJOR', 'MINOR', 'PRIMARY', 'SECONDARY', 'FIRST', 'SECOND',
  'THIRD', 'LAST', 'NEXT', 'PREVIOUS', 'FOLLOWING', 'PRECEDING', 'FINAL',
  'INITIAL', 'OPENING', 'CLOSING', 'BEGINNING', 'ENDING', 'MIDDLE', 'CENTER',
  'HOLD', 'PUSH', 'PULL', 'TRACK', 'DOLLY', 'CRANE', 'STEADY', 'HAND',
  'HANDHELD', 'AERIAL', 'DRONE', 'UNDERWATER', 'SLOW', 'MOTION', 'FREEZE',
  'FRAME', 'SPLIT', 'SCREEN', 'WIPE', 'MATCH', 'JUMP', 'CROSS', 'PARALLEL'
]);

// Common first names that might appear in caps (to validate characters)
const COMMON_NAMES = new Set([
  'JOHN', 'JAMES', 'MICHAEL', 'DAVID', 'ROBERT', 'WILLIAM', 'RICHARD', 'THOMAS',
  'MARY', 'PATRICIA', 'JENNIFER', 'LINDA', 'ELIZABETH', 'BARBARA', 'SUSAN',
  'ARTHUR', 'BRUCE', 'CLARK', 'PETER', 'TONY', 'STEVE', 'JACK', 'ALEX',
  'SAM', 'MAX', 'BEN', 'LUKE', 'MARK', 'PAUL', 'CHRIS', 'MATT', 'NICK',
  'TOM', 'JOE', 'BOB', 'BILL', 'DAN', 'MIKE', 'DAVE', 'STEVE', 'FRANK',
  'GEORGE', 'HENRY', 'EDWARD', 'CHARLES', 'JOSEPH', 'DANIEL', 'MATTHEW',
  'ANNA', 'EMMA', 'SARAH', 'LISA', 'NANCY', 'KAREN', 'BETTY', 'HELEN',
  'SANDRA', 'DONNA', 'CAROL', 'RUTH', 'SHARON', 'MICHELLE', 'LAURA',
  'SOPHIE', 'RACHEL', 'AMY', 'EMILY', 'JESSICA', 'ASHLEY', 'NICOLE',
  'MOM', 'DAD', 'MOTHER', 'FATHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER',
  'GRANDMA', 'GRANDPA', 'UNCLE', 'AUNT', 'COUSIN', 'FRIEND', 'NEIGHBOR',
  'DOCTOR', 'NURSE', 'LAWYER', 'JUDGE', 'OFFICER', 'DETECTIVE', 'AGENT',
  'CAPTAIN', 'SERGEANT', 'LIEUTENANT', 'COLONEL', 'GENERAL', 'PRIVATE',
  'PRESIDENT', 'SENATOR', 'MAYOR', 'GOVERNOR', 'MINISTER', 'PRIEST',
  'TEACHER', 'PROFESSOR', 'STUDENT', 'PRINCIPAL', 'DEAN', 'COACH',
  'WAITER', 'WAITRESS', 'BARTENDER', 'DRIVER', 'PILOT', 'GUARD', 'SOLDIER',
  'REPORTER', 'ANCHOR', 'HOST', 'ANNOUNCER', 'NARRATOR', 'VOICE',
  'MAN', 'WOMAN', 'BOY', 'GIRL', 'KID', 'CHILD', 'BABY', 'TEEN', 'TEENAGER',
  'OLD', 'YOUNG', 'GUY', 'DUDE', 'LADY', 'GENTLEMAN', 'STRANGER', 'VISITOR',
  'CUSTOMER', 'CLIENT', 'PATIENT', 'VICTIM', 'SUSPECT', 'WITNESS',
  'BOSS', 'MANAGER', 'ASSISTANT', 'SECRETARY', 'RECEPTIONIST', 'CLERK',
  'WORKER', 'EMPLOYEE', 'COLLEAGUE', 'PARTNER', 'ASSOCIATE', 'EXECUTIVE',
  'JOKER', 'BATMAN', 'SUPERMAN', 'SPIDER', 'IRON', 'CAPTAIN', 'HULK'
]);

// Genre classification with weighted keywords and structural patterns
const GENRE_CRITERIA = {
  thriller: {
    keywords: {
      high: ['murder', 'killer', 'death', 'dead', 'blood', 'gun', 'shoot', 'knife', 'stab', 'victim'],
      medium: ['police', 'detective', 'investigate', 'suspect', 'evidence', 'crime', 'criminal'],
      low: ['tension', 'fear', 'danger', 'threat', 'chase', 'escape', 'hide', 'secret', 'reveal']
    },
    nightRatioMin: 0.3,
    dialogueRatioMax: 0.5
  },
  horror: {
    keywords: {
      high: ['scream', 'monster', 'demon', 'ghost', 'haunted', 'possessed', 'evil', 'terror', 'nightmare'],
      medium: ['dark', 'shadow', 'creature', 'supernatural', 'curse', 'ritual', 'sacrifice'],
      low: ['afraid', 'scared', 'creepy', 'weird', 'strange', 'disturbing']
    },
    nightRatioMin: 0.5,
    shortScenes: true
  },
  comedy: {
    keywords: {
      high: ['laugh', 'funny', 'hilarious', 'joke', 'comedy', 'ridiculous', 'absurd'],
      medium: ['awkward', 'embarrass', 'silly', 'crazy', 'wacky', 'goofy'],
      low: ['smile', 'grin', 'chuckle', 'amused', 'playful', 'witty']
    },
    dialogueRatioMin: 0.5
  },
  drama: {
    keywords: {
      high: ['family', 'relationship', 'love', 'heart', 'emotion', 'feel', 'cry', 'tears'],
      medium: ['struggle', 'conflict', 'tension', 'betrayal', 'trust', 'forgive'],
      low: ['understand', 'connect', 'bond', 'grow', 'change', 'learn', 'accept']
    },
    dialogueRatioMin: 0.4,
    intRatioMin: 0.5
  },
  action: {
    keywords: {
      high: ['explosion', 'fight', 'battle', 'war', 'attack', 'combat', 'destroy'],
      medium: ['chase', 'run', 'escape', 'crash', 'smash', 'punch', 'kick', 'shoot'],
      low: ['fast', 'speed', 'rush', 'hurry', 'quick', 'move', 'jump', 'fall']
    },
    extRatioMin: 0.4,
    dialogueRatioMax: 0.4
  },
  romance: {
    keywords: {
      high: ['love', 'kiss', 'romance', 'romantic', 'marry', 'wedding', 'proposal'],
      medium: ['heart', 'passion', 'desire', 'attract', 'chemistry', 'connection'],
      low: ['date', 'relationship', 'together', 'couple', 'partner', 'feeling']
    },
    dialogueRatioMin: 0.5
  },
  scifi: {
    keywords: {
      high: ['space', 'alien', 'robot', 'android', 'cyborg', 'spaceship', 'galaxy', 'planet'],
      medium: ['future', 'technology', 'computer', 'machine', 'artificial', 'virtual'],
      low: ['science', 'experiment', 'lab', 'research', 'discover', 'invent']
    }
  }
};

// Turning point markers for narrative structure
const TURNING_POINT_MARKERS = {
  incitingIncident: [
    'everything changed', 'changes everything', 'life will never be the same',
    'discovers', 'finds out', 'learns that', 'realizes',
    'suddenly', 'out of nowhere', 'unexpected', 'shock',
    'but then', 'until', 'when suddenly', 'that\'s when'
  ],
  midpoint: [
    'realizes the truth', 'finally understands', 'changes strategy',
    'new plan', 'decides to', 'makes a choice', 'commits to',
    'point of no return', 'crosses the line', 'goes too far'
  ],
  allIsLost: [
    'loses everything', 'all is lost', 'hopeless', 'defeated',
    'dead', 'dies', 'killed', 'gone forever', 'too late',
    'failed', 'failure', 'over', 'finished', 'the end'
  ],
  climax: [
    'final confrontation', 'showdown', 'face to face',
    'end this', 'once and for all', 'last chance',
    'now or never', 'do or die', 'moment of truth'
  ]
};

// ============================================================================
// V2 PARSING FUNCTIONS
// ============================================================================

/**
 * Extract characters using multiple strategies
 */
function extractCharactersV2(text) {
  if (!text) return { characters: new Map(), dialogues: [] };
  
  const characters = new Map();
  const dialogues = [];
  
  // Strategy 1: Find ALL CAPS words that could be character names
  const capsWords = text.match(/\b[A-Z][A-Z]+(?:'[A-Z]+)?\b/g) || [];
  const wordFrequency = new Map();
  
  for (const word of capsWords) {
    if (word.length < 2 || word.length > 20) continue;
    if (EXCLUDE_WORDS.has(word)) continue;
    
    const count = wordFrequency.get(word) || 0;
    wordFrequency.set(word, count + 1);
  }
  
  // Strategy 2: Look for patterns like "NAME says/said/asks/replied"
  const speechPatterns = text.match(/\b([A-Z][A-Z]+)\s+(?:says?|said|asks?|asked|replies?|replied|shouts?|shouted|whispers?|whispered|screams?|screamed|yells?|yelled|mutters?|muttered|continues?|continued)\b/gi) || [];
  
  for (const match of speechPatterns) {
    const name = match.split(/\s+/)[0].toUpperCase();
    if (!EXCLUDE_WORDS.has(name)) {
      const count = wordFrequency.get(name) || 0;
      wordFrequency.set(name, count + 10); // Boost speech patterns
    }
  }
  
  // Strategy 3: Look for parenthetical patterns "(to NAME)", "(looks at NAME)"
  const parentheticalPatterns = text.match(/\((?:to|at|with|from)\s+([A-Z][A-Z]+)\)/gi) || [];
  
  for (const match of parentheticalPatterns) {
    const nameMatch = match.match(/([A-Z][A-Z]+)/);
    if (nameMatch && !EXCLUDE_WORDS.has(nameMatch[1])) {
      const count = wordFrequency.get(nameMatch[1]) || 0;
      wordFrequency.set(nameMatch[1], count + 5);
    }
  }
  
  // Strategy 4: Look for "NAME\n" followed by dialogue-like text
  const nameDialoguePattern = /\b([A-Z][A-Z]+(?:\s+[A-Z]+)?)\s*(?:\([^)]*\))?\s*\n\s*([A-Z][^A-Z\n]{10,})/g;
  let match;
  while ((match = nameDialoguePattern.exec(text)) !== null) {
    const name = match[1].trim();
    const dialogue = match[2].trim();
    
    if (!EXCLUDE_WORDS.has(name.split(/\s+/)[0])) {
      const count = wordFrequency.get(name) || 0;
      wordFrequency.set(name, count + 15); // Strong signal
      
      dialogues.push({ character: name, text: dialogue });
    }
  }
  
  // Strategy 5: Known names validation
  for (const [word, count] of wordFrequency.entries()) {
    if (COMMON_NAMES.has(word)) {
      wordFrequency.set(word, count + 20); // Boost known names
    }
  }
  
  // Filter: Keep words that appear 3+ times or are known names
  for (const [word, count] of wordFrequency.entries()) {
    if (count >= 3 || COMMON_NAMES.has(word)) {
      characters.set(word, {
        name: word,
        mentions: count,
        dialogueLines: 0,
        firstMention: text.indexOf(word)
      });
    }
  }
  
  // Extract dialogues for identified characters
  for (const [charName] of characters.entries()) {
    // Pattern: CHARACTER NAME followed by dialogue
    const charDialogueRegex = new RegExp(
      `\\b${charName}\\b\\s*(?:\\([^)]*\\))?\\s*([A-Z][^A-Z\\n]{15,}?)(?=[A-Z]{2,}|$|\\n\\n)`,
      'g'
    );
    
    let dialogueMatch;
    while ((dialogueMatch = charDialogueRegex.exec(text)) !== null) {
      const dialogueText = dialogueMatch[1].trim();
      if (dialogueText.length > 10 && dialogueText.length < 500) {
        dialogues.push({ character: charName, text: dialogueText });
        characters.get(charName).dialogueLines++;
      }
    }
  }
  
  return { characters, dialogues };
}

/**
 * Detect scenes from text with multiple strategies
 */
function detectScenesV2(text) {
  if (!text) return [];
  
  const scenes = [];
  const lines = text.split('\n');
  
  let currentScene = null;
  let sceneNumber = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Strategy 1: Standard slugline
    const sluglineMatch = line.match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.?)\s*(.+?)(?:\s*[-–—]\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|LATER|CONTINUOUS|DAWN|DUSK))?/i);
    
    // Strategy 2: Numbered scene
    const numberedMatch = line.match(/^\s*(\d+)\s*(INT\.|EXT\.|INT\/EXT)/i);
    
    // Strategy 3: Scene transition
    const transitionMatch = line.match(/^(CUT TO:|DISSOLVE TO:|FADE TO:|SMASH CUT:|MATCH CUT:)/i);
    
    if (sluglineMatch || numberedMatch) {
      // Save previous scene
      if (currentScene) {
        scenes.push(currentScene);
      }
      
      sceneNumber++;
      const match = sluglineMatch || numberedMatch;
      const intExt = (match[1] || match[2]).replace(/[.\s]/g, '').replace('/', '_').toUpperCase();
      const locationTime = sluglineMatch ? match[2] : lines[i].substring(match[0].length);
      
      // Parse location and time
      let location = locationTime;
      let time = sluglineMatch ? match[3] : null;
      
      if (!time) {
        const timeMatch = locationTime.match(/[-–—]\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|LATER|CONTINUOUS|DAWN|DUSK)\s*$/i);
        if (timeMatch) {
          time = timeMatch[1].toUpperCase();
          location = locationTime.replace(timeMatch[0], '').trim();
        }
      }
      
      currentScene = {
        sceneNumber,
        slugline: line,
        intExt: intExt.includes('INT') ? 'INT' : 'EXT',
        location: location?.trim() || 'UNKNOWN',
        time: time?.toUpperCase() || 'UNKNOWN',
        content: [],
        wordCount: 0
      };
    } else if (currentScene && line.length > 0) {
      currentScene.content.push(line);
      currentScene.wordCount += line.split(/\s+/).length;
    }
  }
  
  // Don't forget last scene
  if (currentScene) {
    scenes.push(currentScene);
  }
  
  return scenes;
}

/**
 * Classify genre using multi-criteria analysis
 */
function classifyGenreV2(text, metrics) {
  const textLower = text.toLowerCase();
  const scores = {};
  
  for (const [genre, criteria] of Object.entries(GENRE_CRITERIA)) {
    let score = 0;
    
    // Keyword scoring
    for (const keyword of criteria.keywords.high || []) {
      const matches = (textLower.match(new RegExp(keyword, 'g')) || []).length;
      score += matches * 3;
    }
    for (const keyword of criteria.keywords.medium || []) {
      const matches = (textLower.match(new RegExp(keyword, 'g')) || []).length;
      score += matches * 2;
    }
    for (const keyword of criteria.keywords.low || []) {
      const matches = (textLower.match(new RegExp(keyword, 'g')) || []).length;
      score += matches * 1;
    }
    
    // Structural scoring
    if (criteria.nightRatioMin && metrics.nightRatio >= criteria.nightRatioMin) {
      score += 20;
    }
    if (criteria.dialogueRatioMin && metrics.dialogueRatio >= criteria.dialogueRatioMin) {
      score += 15;
    }
    if (criteria.dialogueRatioMax && metrics.dialogueRatio <= criteria.dialogueRatioMax) {
      score += 15;
    }
    if (criteria.intRatioMin && metrics.intRatio >= criteria.intRatioMin) {
      score += 10;
    }
    if (criteria.extRatioMin && metrics.extRatio >= criteria.extRatioMin) {
      score += 10;
    }
    
    scores[genre] = score;
  }
  
  // Find top genre
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  
  // Return primary and secondary genre
  return {
    primary: sorted[0][0],
    secondary: sorted[1] && sorted[1][1] > sorted[0][1] * 0.5 ? sorted[1][0] : null,
    scores
  };
}

/**
 * Detect narrative turning points
 */
function detectTurningPoints(scenes, fullText) {
  const textLower = fullText.toLowerCase();
  const turningPoints = {
    incitingIncident: null,
    midpoint: null,
    allIsLost: null,
    climax: null
  };
  
  const totalScenes = scenes.length;
  
  // Look for turning point markers in expected positions
  for (let i = 0; i < scenes.length; i++) {
    const sceneText = scenes[i].content?.join(' ').toLowerCase() || '';
    const position = i / totalScenes;
    
    // Inciting incident: 10-20% of the way
    if (!turningPoints.incitingIncident && position >= 0.08 && position <= 0.25) {
      for (const marker of TURNING_POINT_MARKERS.incitingIncident) {
        if (sceneText.includes(marker)) {
          turningPoints.incitingIncident = { scene: i + 1, position: Math.round(position * 100) };
          break;
        }
      }
    }
    
    // Midpoint: 45-55%
    if (!turningPoints.midpoint && position >= 0.40 && position <= 0.60) {
      for (const marker of TURNING_POINT_MARKERS.midpoint) {
        if (sceneText.includes(marker)) {
          turningPoints.midpoint = { scene: i + 1, position: Math.round(position * 100) };
          break;
        }
      }
    }
    
    // All is lost: 65-80%
    if (!turningPoints.allIsLost && position >= 0.60 && position <= 0.85) {
      for (const marker of TURNING_POINT_MARKERS.allIsLost) {
        if (sceneText.includes(marker)) {
          turningPoints.allIsLost = { scene: i + 1, position: Math.round(position * 100) };
          break;
        }
      }
    }
    
    // Climax: 80-95%
    if (!turningPoints.climax && position >= 0.75 && position <= 0.98) {
      for (const marker of TURNING_POINT_MARKERS.climax) {
        if (sceneText.includes(marker)) {
          turningPoints.climax = { scene: i + 1, position: Math.round(position * 100) };
          break;
        }
      }
    }
  }
  
  // Fallback: Estimate by position if not found
  if (!turningPoints.incitingIncident && totalScenes > 5) {
    turningPoints.incitingIncident = { scene: Math.round(totalScenes * 0.12), position: 12, estimated: true };
  }
  if (!turningPoints.midpoint && totalScenes > 10) {
    turningPoints.midpoint = { scene: Math.round(totalScenes * 0.50), position: 50, estimated: true };
  }
  if (!turningPoints.allIsLost && totalScenes > 15) {
    turningPoints.allIsLost = { scene: Math.round(totalScenes * 0.75), position: 75, estimated: true };
  }
  if (!turningPoints.climax && totalScenes > 20) {
    turningPoints.climax = { scene: Math.round(totalScenes * 0.90), position: 90, estimated: true };
  }
  
  return turningPoints;
}

/**
 * Calculate comprehensive metrics
 */
function calculateMetricsV2(scenes, characters, dialogues, fullText) {
  const totalScenes = scenes.length;
  const totalWords = fullText.split(/\s+/).length;
  
  let intCount = 0, extCount = 0;
  let dayCount = 0, nightCount = 0;
  const locations = new Map();
  
  for (const scene of scenes) {
    if (scene.intExt === 'INT') intCount++;
    else extCount++;
    
    if (['DAY', 'MORNING', 'AFTERNOON'].includes(scene.time)) dayCount++;
    else if (['NIGHT', 'EVENING', 'DUSK', 'DAWN'].includes(scene.time)) nightCount++;
    
    const locKey = scene.location?.toUpperCase() || 'UNKNOWN';
    locations.set(locKey, (locations.get(locKey) || 0) + 1);
  }
  
  // Calculate dialogue words
  let dialogueWords = 0;
  for (const d of dialogues) {
    dialogueWords += d.text.split(/\s+/).length;
  }
  
  const actionWords = totalWords - dialogueWords;
  
  return {
    totalScenes,
    totalWords,
    totalPages: Math.round(totalWords / 250 * 10) / 10,
    runtimeEstimate: Math.round(totalWords / 250),
    
    intCount,
    extCount,
    intRatio: totalScenes > 0 ? Math.round(intCount / totalScenes * 100) / 100 : 0,
    extRatio: totalScenes > 0 ? Math.round(extCount / totalScenes * 100) / 100 : 0,
    
    dayCount,
    nightCount,
    dayRatio: (dayCount + nightCount) > 0 ? Math.round(dayCount / (dayCount + nightCount) * 100) / 100 : 0.5,
    nightRatio: (dayCount + nightCount) > 0 ? Math.round(nightCount / (dayCount + nightCount) * 100) / 100 : 0.5,
    
    uniqueLocations: locations.size,
    topLocations: Array.from(locations.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    
    uniqueCharacters: characters.size,
    totalDialogueLines: dialogues.length,
    dialogueWords,
    actionWords,
    dialogueRatio: totalWords > 0 ? Math.round(dialogueWords / totalWords * 100) / 100 : 0,
    
    avgSceneLength: totalScenes > 0 ? Math.round(totalWords / totalScenes) : 0
  };
}

// ============================================================================
// MAIN V2 ENRICHMENT
// ============================================================================

function enrichScreenplayV2(originalData) {
  // Combine all text
  const fullText = originalData.scenes
    ?.map(s => [s.slugline, s.action_text].filter(Boolean).join('\n'))
    .join('\n\n') || '';
  
  // Extract characters and dialogues with V2 algorithm
  const { characters, dialogues } = extractCharactersV2(fullText);
  
  // Detect scenes with V2 algorithm
  const scenes = detectScenesV2(fullText);
  
  // If V2 scene detection failed, fall back to original
  const finalScenes = scenes.length > 0 ? scenes : (originalData.scenes || []).map((s, i) => ({
    sceneNumber: i + 1,
    slugline: s.slugline,
    intExt: s.slugline?.includes('INT') ? 'INT' : 'EXT',
    location: s.slugline?.replace(/^(INT\.|EXT\.|INT\/EXT\.)\s*/i, '').split(/\s*[-–—]\s*/)[0] || 'UNKNOWN',
    time: 'UNKNOWN',
    content: [s.action_text],
    wordCount: s.word_count || 0
  }));
  
  // Calculate metrics
  const metrics = calculateMetricsV2(finalScenes, characters, dialogues, fullText);
  
  // Classify genre with V2 multi-criteria
  const genreResult = classifyGenreV2(fullText, metrics);
  
  // Detect turning points
  const turningPoints = detectTurningPoints(finalScenes, fullText);
  
  // Build enriched output
  return {
    // Basic info
    slug: originalData.slug,
    title: originalData.title?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || originalData.slug,
    year: extractYear(originalData.slug),
    format: originalData.format || 'film',
    
    // V2 genre
    genre: genreResult.primary,
    genreSecondary: genreResult.secondary,
    genreScores: genreResult.scores,
    
    // Metrics
    metrics,
    
    // Structure
    structure: {
      totalScenes: finalScenes.length,
      act1End: Math.round(finalScenes.length * 0.25),
      midpoint: Math.round(finalScenes.length * 0.50),
      act2End: Math.round(finalScenes.length * 0.75),
      turningPoints
    },
    
    // Characters (sorted by dialogue lines)
    characters: Array.from(characters.values())
      .sort((a, b) => b.dialogueLines - a.dialogueLines)
      .slice(0, 25)
      .map(c => ({
        name: c.name,
        dialogueLines: c.dialogueLines,
        mentions: c.mentions
      })),
    
    // Dialogues sample (first 50)
    dialoguesSample: dialogues.slice(0, 50),
    
    // Scenes
    scenes: finalScenes.map(s => ({
      sceneNumber: s.sceneNumber,
      slugline: s.slugline,
      intExt: s.intExt,
      location: s.location,
      time: s.time,
      wordCount: s.wordCount,
      pageEstimate: Math.round(s.wordCount / 250 * 10) / 10
    }))
  };
}

function extractYear(slug) {
  const match = slug?.match(/(\d{4})$/);
  return match ? parseInt(match[1]) : null;
}

// ============================================================================
// V2 ANALYSIS SUMMARY
// ============================================================================

function generateAnalysisSummaryV2(enrichedScreenplays) {
  const summary = {
    version: '2.0',
    totalScreenplays: enrichedScreenplays.length,
    processedAt: new Date().toISOString(),
    
    // Quality metrics
    qualityMetrics: {
      screenplaysWithCharacters: 0,
      screenplaysWithDialogue: 0,
      screenplaysWithScenes: 0,
      avgCharactersPerScreenplay: 0,
      avgDialoguesPerScreenplay: 0,
      avgScenesPerScreenplay: 0
    },
    
    // Aggregate metrics
    avgMetrics: {
      avgScenes: 0,
      avgRuntime: 0,
      avgCharacters: 0,
      avgLocations: 0,
      avgDialogueRatio: 0,
      avgIntRatio: 0,
      avgNightRatio: 0
    },
    
    // Genre distribution
    genreDistribution: {},
    
    // Format distribution
    formatDistribution: {},
    
    // Best examples
    wellStructuredExamples: []
  };
  
  if (enrichedScreenplays.length === 0) return summary;
  
  let totalScenes = 0, totalRuntime = 0, totalCharacters = 0, totalLocations = 0;
  let totalDialogueRatio = 0, totalIntRatio = 0, totalNightRatio = 0;
  let withCharacters = 0, withDialogue = 0, withScenes = 0;
  let totalDialogueLines = 0;
  
  for (const sp of enrichedScreenplays) {
    totalScenes += sp.metrics?.totalScenes || 0;
    totalRuntime += sp.metrics?.runtimeEstimate || 0;
    totalCharacters += sp.characters?.length || 0;
    totalLocations += sp.metrics?.uniqueLocations || 0;
    totalDialogueRatio += sp.metrics?.dialogueRatio || 0;
    totalIntRatio += sp.metrics?.intRatio || 0;
    totalNightRatio += sp.metrics?.nightRatio || 0;
    totalDialogueLines += sp.metrics?.totalDialogueLines || 0;
    
    if (sp.characters?.length > 0) withCharacters++;
    if (sp.metrics?.totalDialogueLines > 0) withDialogue++;
    if (sp.metrics?.totalScenes > 5) withScenes++;
    
    // Genre distribution
    summary.genreDistribution[sp.genre] = (summary.genreDistribution[sp.genre] || 0) + 1;
    
    // Format distribution
    summary.formatDistribution[sp.format] = (summary.formatDistribution[sp.format] || 0) + 1;
  }
  
  const count = enrichedScreenplays.length;
  
  summary.qualityMetrics = {
    screenplaysWithCharacters: withCharacters,
    screenplaysWithCharactersPercent: Math.round(withCharacters / count * 100),
    screenplaysWithDialogue: withDialogue,
    screenplaysWithDialoguePercent: Math.round(withDialogue / count * 100),
    screenplaysWithScenes: withScenes,
    screenplaysWithScenesPercent: Math.round(withScenes / count * 100),
    avgCharactersPerScreenplay: Math.round(totalCharacters / count * 10) / 10,
    avgDialoguesPerScreenplay: Math.round(totalDialogueLines / count * 10) / 10
  };
  
  summary.avgMetrics = {
    avgScenes: Math.round(totalScenes / count),
    avgRuntime: Math.round(totalRuntime / count),
    avgCharacters: Math.round(totalCharacters / count * 10) / 10,
    avgLocations: Math.round(totalLocations / count * 10) / 10,
    avgDialogueRatio: Math.round(totalDialogueRatio / count * 100) / 100,
    avgIntRatio: Math.round(totalIntRatio / count * 100) / 100,
    avgNightRatio: Math.round(totalNightRatio / count * 100) / 100
  };
  
  // Find well-structured examples
  summary.wellStructuredExamples = enrichedScreenplays
    .filter(sp => sp.characters?.length >= 5 && sp.metrics?.totalScenes >= 20)
    .sort((a, b) => b.characters.length - a.characters.length)
    .slice(0, 15)
    .map(sp => ({
      title: sp.title,
      slug: sp.slug,
      scenes: sp.metrics.totalScenes,
      runtime: sp.metrics.runtimeEstimate,
      characters: sp.characters.length,
      dialogueLines: sp.metrics.totalDialogueLines,
      genre: sp.genre,
      topCharacters: sp.characters.slice(0, 5).map(c => c.name)
    }));
  
  return summary;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🎬 SCREENPLAY ENRICHMENT SCRIPT v2.0');
  console.log('=====================================');
  console.log('Objetivo: >90% precisión en todas las métricas\n');
  
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
      
      const enriched = enrichScreenplayV2(rawData);
      enrichedScreenplays.push(enriched);
      
      // Save individual enriched file
      const outputPath = path.join(OUTPUT_DIR, file);
      fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2));
      
      successCount++;
      
      // Progress update every 50 files
      if ((i + 1) % 50 === 0 || i === files.length - 1) {
        const chars = enriched.characters?.length || 0;
        console.log(`✅ ${i + 1}/${files.length} (${progressPercent}%) - ${enriched.title} [${chars} chars, ${enriched.metrics?.totalScenes || 0} scenes]`);
      }
    } catch (error) {
      errorCount++;
      errors.push({ file, error: error.message });
      console.error(`❌ Error: ${file} - ${error.message}`);
    }
  }
  
  // Generate and save analysis summary
  console.log('\n📊 Generating V2 analysis summary...');
  const summary = generateAnalysisSummaryV2(enrichedScreenplays);
  summary.errors = errors;
  
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(summary, null, 2));
  
  // Print summary
  console.log('\n=====================================');
  console.log('📈 V2 ANALYSIS COMPLETE');
  console.log('=====================================\n');
  console.log(`✅ Successfully processed: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  
  console.log('\n🎯 QUALITY METRICS (Objetivo: >90%):');
  console.log(`   Screenplays with characters: ${summary.qualityMetrics.screenplaysWithCharactersPercent}%`);
  console.log(`   Screenplays with dialogue: ${summary.qualityMetrics.screenplaysWithDialoguePercent}%`);
  console.log(`   Screenplays with scenes (>5): ${summary.qualityMetrics.screenplaysWithScenesPercent}%`);
  console.log(`   Avg characters per screenplay: ${summary.qualityMetrics.avgCharactersPerScreenplay}`);
  console.log(`   Avg dialogues per screenplay: ${summary.qualityMetrics.avgDialoguesPerScreenplay}`);
  
  console.log('\n📊 AGGREGATE METRICS:');
  console.log(`   Average scenes: ${summary.avgMetrics.avgScenes}`);
  console.log(`   Average runtime: ${summary.avgMetrics.avgRuntime} min`);
  console.log(`   Average characters: ${summary.avgMetrics.avgCharacters}`);
  console.log(`   Average locations: ${summary.avgMetrics.avgLocations}`);
  console.log(`   Average dialogue ratio: ${summary.avgMetrics.avgDialogueRatio}`);
  console.log(`   Average INT ratio: ${summary.avgMetrics.avgIntRatio}`);
  console.log(`   Average NIGHT ratio: ${summary.avgMetrics.avgNightRatio}`);
  
  console.log('\n📁 Genre distribution:');
  for (const [genre, count] of Object.entries(summary.genreDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${genre}: ${count} (${Math.round(count/successCount*100)}%)`);
  }
  
  console.log('\n🏆 WELL-STRUCTURED EXAMPLES:');
  for (const ex of summary.wellStructuredExamples.slice(0, 5)) {
    console.log(`   ${ex.title}: ${ex.characters} chars, ${ex.scenes} scenes, ${ex.dialogueLines} dialogues`);
    console.log(`      Top: ${ex.topCharacters.join(', ')}`);
  }
  
  console.log(`\n📄 Output saved to:`);
  console.log(`   - ${OUTPUT_DIR}/ (individual enriched files)`);
  console.log(`   - ${ANALYSIS_FILE} (summary analysis)`);
}

main().catch(console.error);
