/**
 * SCREENPLAY ENRICHMENT v4.0 - RESCUE PARSER
 * 
 * Los datos originales están ROTOS:
 * - Múltiples escenas en un solo "slugline"
 * - Diálogos mezclados con acción
 * - Sin separación de character cues
 * 
 * Este parser RESCATA la información del caos.
 */

import fs from 'fs';
import path from 'path';

const PARSED_DIR = './parsed';
const OUTPUT_DIR = './enriched-v4';
const ANALYSIS_FILE = './analysis-summary-v4.json';

// ============================================================================
// RESCUE PATTERNS - Para datos rotos
// ============================================================================

// Detectar sluglines dentro del texto
const SLUGLINE_PATTERN = /(INT\.|EXT\.|INT\.\/EXT\.)\s+([A-Z][A-Z\s,'\-\/\(\)]+?)(?:\s*[-–—]\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DAWN|DUSK|LATER|CONTINUOUS|SAME|MOMENTS LATER))?(?:\s+\d+\s+\d+)?/gi;

// Detectar character cues con diálogo - PATRÓN CRÍTICO
// Busca: NOMBRE (opcional parenthetical) texto que parece diálogo
const CHARACTER_DIALOGUE_PATTERN = /\b([A-Z]{2,}(?:\s+[A-Z]+)?(?:\s+#?\d+)?)\s*(?:\(([^)]+)\))?\s+([A-Z][^A-Z\n]{10,}?)(?=(?:\s+[A-Z]{2,}\s+)|(?:\s*\n)|(?:\s+INT\.|EXT\.)|$)/g;

// Palabras que NO son personajes
const NOT_CHARACTERS = new Set([
  'INT', 'EXT', 'THE', 'AND', 'BUT', 'CLOSE', 'ANGLE', 'CUT', 'FADE', 'DISSOLVE',
  'CONTINUED', 'CONTINUOUS', 'LATER', 'DAY', 'NIGHT', 'MORNING', 'EVENING',
  'FLASHBACK', 'FLASH', 'BACK', 'BEGIN', 'END', 'TITLE', 'SUPER', 'SERIES',
  'MONTAGE', 'INTERCUT', 'SHOT', 'SHOTS', 'POV', 'OMITTED', 'REVISED', 'WE',
  'SEE', 'HEAR', 'BEAT', 'PAUSE', 'QUICK', 'CUTS', 'SMASH', 'MATCH', 'JUMP',
  'TIME', 'BLACK', 'WHITE', 'SCREEN', 'TRACKING', 'MOVING', 'PUSHING', 'PULLING',
  'WIDE', 'MEDIUM', 'TIGHT', 'INSERT', 'ESTABLISHING', 'AERIAL', 'DING', 'CLICK',
  'RING', 'BANG', 'BOOM', 'SLAM', 'THUD', 'CRASH', 'LATER', 'MOS', 'SFX', 'VFX'
]);

// Palabras que SÍ son probablemente personajes
const LIKELY_CHARACTERS = new Set([
  'MOM', 'DAD', 'MOTHER', 'FATHER', 'SON', 'DAUGHTER', 'SISTER', 'BROTHER',
  'GRANDMA', 'GRANDPA', 'DOCTOR', 'NURSE', 'OFFICER', 'DETECTIVE', 'AGENT',
  'REPORTER', 'ANCHOR', 'HOST', 'NARRATOR', 'VOICE', 'MAN', 'WOMAN', 'BOY',
  'GIRL', 'KID', 'BOSS', 'GUARD', 'DRIVER', 'WAITER', 'WAITRESS', 'BARTENDER'
]);

// ============================================================================
// RESCUE FUNCTIONS
// ============================================================================

/**
 * Extraer escenas del texto caótico
 */
function extractScenesFromChaos(text) {
  const scenes = [];
  let lastIndex = 0;
  
  // Resetear el regex
  SLUGLINE_PATTERN.lastIndex = 0;
  
  const matches = [...text.matchAll(SLUGLINE_PATTERN)];
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const nextMatch = matches[i + 1];
    
    const sceneStart = match.index;
    const sceneEnd = nextMatch ? nextMatch.index : text.length;
    const sceneContent = text.substring(sceneStart, sceneEnd);
    
    scenes.push({
      sceneNumber: i + 1,
      slugline: match[0].trim(),
      intExt: match[1].toUpperCase().includes('INT') ? 'INT' : 'EXT',
      location: match[2]?.trim() || 'UNKNOWN',
      time: (match[3] || 'UNKNOWN').toUpperCase(),
      content: sceneContent,
      wordCount: sceneContent.split(/\s+/).length
    });
  }
  
  // Si no encontró escenas, crear una con todo el contenido
  if (scenes.length === 0 && text.trim().length > 0) {
    scenes.push({
      sceneNumber: 1,
      slugline: 'UNKNOWN',
      intExt: 'UNKNOWN',
      location: 'UNKNOWN',
      time: 'UNKNOWN',
      content: text,
      wordCount: text.split(/\s+/).length
    });
  }
  
  return scenes;
}

/**
 * Extraer personajes y diálogos del texto caótico
 */
function extractCharactersAndDialogue(text) {
  const characters = new Map();
  const dialogues = [];
  
  // ESTRATEGIA 1: Buscar patrón NOMBRE texto
  // Pero el texto debe parecer diálogo (no todo mayúsculas, empieza con mayúscula, etc.)
  
  // Dividir por posibles character cues
  const segments = text.split(/(?=\b[A-Z]{2,}(?:\s+[A-Z]+)?\s*(?:\([^)]*\))?\s+[A-Z])/);
  
  for (const segment of segments) {
    // Intentar extraer character + dialogue de este segmento
    const match = segment.match(/^([A-Z]{2,}(?:\s+[A-Z]+)?(?:\s*#\d+)?)\s*(?:\(([^)]*)\))?\s+(.+)/s);
    
    if (match) {
      let charName = match[1].trim();
      const parenthetical = match[2];
      let dialogueText = match[3];
      
      // Validar que es un personaje real
      const firstWord = charName.split(/\s+/)[0];
      if (NOT_CHARACTERS.has(firstWord)) continue;
      if (charName.length < 2 || charName.length > 30) continue;
      
      // Limpiar el nombre
      charName = charName.replace(/\s*#\d+$/, '').trim();
      
      // El diálogo termina cuando encontramos otro personaje o slugline
      const dialogueEndMatch = dialogueText.match(/^(.+?)(?=(?:\s+[A-Z]{2,}\s+[A-Z])|(?:INT\.|EXT\.)|$)/s);
      if (dialogueEndMatch) {
        dialogueText = dialogueEndMatch[1];
      }
      
      // Limpiar diálogo
      dialogueText = dialogueText.trim();
      
      // Debe parecer diálogo (no todo mayúsculas, longitud razonable)
      if (dialogueText.length < 5) continue;
      if (dialogueText === dialogueText.toUpperCase() && dialogueText.length > 20) continue;
      
      // Registrar personaje
      if (!characters.has(charName)) {
        characters.set(charName, {
          name: charName,
          dialogueLines: 0,
          totalWords: 0,
          scenes: new Set()
        });
      }
      
      characters.get(charName).dialogueLines++;
      characters.get(charName).totalWords += dialogueText.split(/\s+/).length;
      
      // Registrar diálogo (solo primeras 200 chars para muestra)
      dialogues.push({
        character: charName,
        parenthetical: parenthetical || null,
        text: dialogueText.substring(0, 200)
      });
    }
  }
  
  // ESTRATEGIA 2: Buscar patrones específicos con regex
  const specificPatterns = [
    // NOMBRE (parenthetical) texto
    /\b([A-Z]{2,})\s*\(([^)]+)\)\s*([A-Z][^A-Z\n]{15,}?)(?=\s+[A-Z]{2,}|$)/g,
    // NOMBRE texto que termina en puntuación
    /\b([A-Z]{2,})\s+([A-Z][^.!?]+[.!?])/g
  ];
  
  for (const pattern of specificPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let charName = match[1].trim();
      let dialogueText = match[match.length - 1].trim();
      
      if (NOT_CHARACTERS.has(charName)) continue;
      if (dialogueText.length < 10) continue;
      
      if (!characters.has(charName)) {
        characters.set(charName, {
          name: charName,
          dialogueLines: 0,
          totalWords: 0,
          scenes: new Set()
        });
      }
      characters.get(charName).dialogueLines++;
    }
  }
  
  // ESTRATEGIA 3: Buscar nombres comunes mencionados múltiples veces
  const nameFrequency = new Map();
  const allCapsWords = text.match(/\b[A-Z]{2,}\b/g) || [];
  
  for (const word of allCapsWords) {
    if (NOT_CHARACTERS.has(word)) continue;
    if (word.length < 2 || word.length > 20) continue;
    nameFrequency.set(word, (nameFrequency.get(word) || 0) + 1);
  }
  
  // Añadir nombres frecuentes como personajes potenciales
  for (const [name, count] of nameFrequency.entries()) {
    if (count >= 3 || LIKELY_CHARACTERS.has(name)) {
      if (!characters.has(name)) {
        characters.set(name, {
          name: name,
          dialogueLines: 0,
          totalWords: 0,
          scenes: new Set(),
          detectedByFrequency: true
        });
      }
    }
  }
  
  return { characters, dialogues };
}

/**
 * Clasificar género
 */
function classifyGenre(text, metrics) {
  const lower = text.toLowerCase();
  const scores = {
    thriller: 0, horror: 0, comedy: 0, drama: 0, action: 0, romance: 0, scifi: 0
  };
  
  // Keywords
  const keywords = {
    thriller: ['murder', 'kill', 'dead', 'blood', 'gun', 'police', 'detective', 'suspect', 'crime'],
    horror: ['scream', 'monster', 'demon', 'ghost', 'haunted', 'evil', 'terror', 'nightmare', 'creature'],
    comedy: ['laugh', 'funny', 'joke', 'hilarious', 'awkward', 'embarrass', 'ridiculous'],
    drama: ['family', 'relationship', 'love', 'emotion', 'struggle', 'betrayal', 'forgive'],
    action: ['explosion', 'fight', 'chase', 'gun', 'shoot', 'punch', 'battle', 'war'],
    romance: ['love', 'kiss', 'heart', 'romance', 'marry', 'wedding', 'passion'],
    scifi: ['space', 'alien', 'robot', 'future', 'technology', 'computer', 'planet']
  };
  
  for (const [genre, words] of Object.entries(keywords)) {
    for (const word of words) {
      const matches = (lower.match(new RegExp(word, 'g')) || []).length;
      scores[genre] += matches;
    }
  }
  
  // Structural adjustments
  if (metrics.nightRatio > 0.5) { scores.thriller += 10; scores.horror += 15; }
  if (metrics.dialogueRatio > 0.5) { scores.comedy += 10; scores.drama += 10; }
  if (metrics.dialogueRatio < 0.3) { scores.action += 15; }
  
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    primary: sorted[0][0],
    secondary: sorted[1][1] > sorted[0][1] * 0.5 ? sorted[1][0] : null,
    scores
  };
}

// ============================================================================
// MAIN ENRICHMENT V4
// ============================================================================

function enrichScreenplayV4(originalData) {
  // Combinar todo el texto
  const fullText = originalData.scenes
    ?.map(s => [s.slugline, s.action_text].filter(Boolean).join('\n'))
    .join('\n\n') || '';
  
  // Extraer escenas del caos
  const scenes = extractScenesFromChaos(fullText);
  
  // Extraer personajes y diálogos
  const { characters, dialogues } = extractCharactersAndDialogue(fullText);
  
  // Asociar personajes a escenas
  for (const scene of scenes) {
    for (const [charName] of characters.entries()) {
      if (scene.content.includes(charName)) {
        characters.get(charName).scenes.add(scene.sceneNumber);
      }
    }
  }
  
  // Calcular métricas
  let intCount = 0, extCount = 0, dayCount = 0, nightCount = 0;
  const locations = new Map();
  
  for (const scene of scenes) {
    if (scene.intExt === 'INT') intCount++;
    else if (scene.intExt === 'EXT') extCount++;
    
    if (['DAY', 'MORNING', 'AFTERNOON'].includes(scene.time)) dayCount++;
    else if (['NIGHT', 'EVENING', 'DUSK', 'DAWN'].includes(scene.time)) nightCount++;
    
    const loc = scene.location?.toUpperCase();
    if (loc && loc !== 'UNKNOWN') {
      locations.set(loc, (locations.get(loc) || 0) + 1);
    }
  }
  
  const totalWords = fullText.split(/\s+/).length;
  const dialogueWords = dialogues.reduce((sum, d) => sum + d.text.split(/\s+/).length, 0);
  const totalTimeScenes = dayCount + nightCount;
  
  const metrics = {
    totalScenes: scenes.length,
    totalWords,
    estimatedPages: Math.round(totalWords / 250 * 10) / 10,
    estimatedRuntime: Math.round(totalWords / 250),
    
    intCount, extCount,
    intRatio: scenes.length > 0 ? Math.round(intCount / scenes.length * 100) / 100 : 0,
    
    dayCount, nightCount,
    nightRatio: totalTimeScenes > 0 ? Math.round(nightCount / totalTimeScenes * 100) / 100 : 0.5,
    
    uniqueCharacters: characters.size,
    totalDialogues: dialogues.length,
    uniqueLocations: locations.size,
    
    dialogueWords,
    dialogueRatio: totalWords > 0 ? Math.round(dialogueWords / totalWords * 100) / 100 : 0
  };
  
  // Clasificar género
  const genreResult = classifyGenre(fullText, metrics);
  
  // Construir resultado
  return {
    slug: originalData.slug,
    title: originalData.title?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || originalData.slug,
    year: extractYear(originalData.slug),
    format: originalData.format || 'film',
    
    genre: genreResult.primary,
    genreSecondary: genreResult.secondary,
    genreScores: genreResult.scores,
    
    metrics,
    
    structure: {
      totalScenes: scenes.length,
      act1End: Math.round(scenes.length * 0.25),
      midpoint: Math.round(scenes.length * 0.50),
      act2End: Math.round(scenes.length * 0.75)
    },
    
    characters: Array.from(characters.values())
      .map(c => ({
        name: c.name,
        dialogueLines: c.dialogueLines,
        totalWords: c.totalWords,
        scenesPresent: c.scenes.size,
        detectedByFrequency: c.detectedByFrequency || false
      }))
      .sort((a, b) => b.dialogueLines - a.dialogueLines)
      .slice(0, 40),
    
    locations: Array.from(locations.entries())
      .map(([name, count]) => ({ name, frequency: count }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 25),
    
    dialoguesSample: dialogues.slice(0, 100),
    
    scenes: scenes.map(s => ({
      sceneNumber: s.sceneNumber,
      slugline: s.slugline.substring(0, 100),
      intExt: s.intExt,
      location: s.location,
      time: s.time,
      wordCount: s.wordCount
    })),
    
    quality: {
      hasCharacters: characters.size > 0,
      hasDialogue: dialogues.length > 0,
      hasMultipleScenes: scenes.length > 5,
      confidence: calculateConfidence(characters.size, dialogues.length, scenes.length)
    }
  };
}

function extractYear(slug) {
  const match = slug?.match(/(\d{4})$/);
  return match ? parseInt(match[1]) : null;
}

function calculateConfidence(chars, dialogues, scenes) {
  let score = 0;
  if (chars > 0) score += 25;
  if (chars > 5) score += 15;
  if (chars > 10) score += 10;
  if (dialogues > 0) score += 25;
  if (dialogues > 20) score += 15;
  if (scenes > 10) score += 10;
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

// ============================================================================
// SUMMARY
// ============================================================================

function generateSummary(enriched) {
  const n = enriched.length;
  const summary = {
    version: '4.0-rescue',
    total: n,
    processedAt: new Date().toISOString(),
    
    quality: {
      withCharacters: enriched.filter(e => e.quality?.hasCharacters).length,
      withDialogue: enriched.filter(e => e.quality?.hasDialogue).length,
      withScenes: enriched.filter(e => e.quality?.hasMultipleScenes).length,
      highConfidence: enriched.filter(e => e.quality?.confidence === 'high').length,
      mediumConfidence: enriched.filter(e => e.quality?.confidence === 'medium').length
    },
    
    avgMetrics: {
      avgScenes: Math.round(enriched.reduce((s, e) => s + (e.metrics?.totalScenes || 0), 0) / n),
      avgRuntime: Math.round(enriched.reduce((s, e) => s + (e.metrics?.estimatedRuntime || 0), 0) / n),
      avgCharacters: Math.round(enriched.reduce((s, e) => s + (e.characters?.length || 0), 0) / n * 10) / 10,
      avgDialogues: Math.round(enriched.reduce((s, e) => s + (e.metrics?.totalDialogues || 0), 0) / n * 10) / 10,
      avgDialogueRatio: Math.round(enriched.reduce((s, e) => s + (e.metrics?.dialogueRatio || 0), 0) / n * 100) / 100
    },
    
    genres: {},
    
    topExamples: enriched
      .filter(e => e.quality?.confidence !== 'low' && e.characters?.length > 5)
      .sort((a, b) => (b.characters?.length || 0) - (a.characters?.length || 0))
      .slice(0, 20)
      .map(e => ({
        title: e.title,
        characters: e.characters?.length,
        dialogues: e.metrics?.totalDialogues,
        scenes: e.metrics?.totalScenes,
        genre: e.genre,
        topChars: e.characters?.slice(0, 5).map(c => c.name)
      }))
  };
  
  for (const e of enriched) {
    summary.genres[e.genre] = (summary.genres[e.genre] || 0) + 1;
  }
  
  // Percentages
  summary.quality.withCharactersPercent = Math.round(summary.quality.withCharacters / n * 100);
  summary.quality.withDialoguePercent = Math.round(summary.quality.withDialogue / n * 100);
  summary.quality.withScenesPercent = Math.round(summary.quality.withScenes / n * 100);
  summary.quality.highConfidencePercent = Math.round(summary.quality.highConfidence / n * 100);
  
  return summary;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🎬 SCREENPLAY ENRICHMENT v4.0 - RESCUE PARSER');
  console.log('==============================================');
  console.log('Diseñado para RESCATAR datos de formato roto\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const files = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  console.log(`📁 ${files.length} archivos\n`);
  
  const enriched = [];
  
  for (let i = 0; i < files.length; i++) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(PARSED_DIR, files[i]), 'utf-8'));
      const result = enrichScreenplayV4(raw);
      enriched.push(result);
      fs.writeFileSync(path.join(OUTPUT_DIR, files[i]), JSON.stringify(result, null, 2));
      
      if ((i + 1) % 50 === 0 || i === files.length - 1) {
        console.log(`✅ ${i + 1}/${files.length} - ${result.title} [${result.characters?.length || 0} chars, ${result.metrics?.totalDialogues || 0} dialogues, ${result.quality?.confidence}]`);
      }
    } catch (e) {
      console.error(`❌ ${files[i]}: ${e.message}`);
    }
  }
  
  const summary = generateSummary(enriched);
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(summary, null, 2));
  
  console.log('\n==============================================');
  console.log('📈 RESULTADOS V4 RESCUE');
  console.log('==============================================\n');
  console.log(`🎯 CALIDAD:`);
  console.log(`   Con personajes: ${summary.quality.withCharactersPercent}%`);
  console.log(`   Con diálogos: ${summary.quality.withDialoguePercent}%`);
  console.log(`   Con escenas (>5): ${summary.quality.withScenesPercent}%`);
  console.log(`   Alta confianza: ${summary.quality.highConfidencePercent}%`);
  
  console.log(`\n📊 PROMEDIOS:`);
  console.log(`   Escenas: ${summary.avgMetrics.avgScenes}`);
  console.log(`   Runtime: ${summary.avgMetrics.avgRuntime} min`);
  console.log(`   Personajes: ${summary.avgMetrics.avgCharacters}`);
  console.log(`   Diálogos: ${summary.avgMetrics.avgDialogues}`);
  console.log(`   Ratio diálogo: ${summary.avgMetrics.avgDialogueRatio}`);
  
  console.log(`\n🏆 TOP EJEMPLOS:`);
  for (const ex of summary.topExamples.slice(0, 5)) {
    console.log(`   ${ex.title}: ${ex.characters} chars, ${ex.dialogues} dialogues`);
    console.log(`      → ${ex.topChars?.join(', ')}`);
  }
}

main().catch(console.error);
