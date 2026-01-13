/**
 * SCREENPLAY PARSER V3.1 - Industrial Deterministic Parser
 * 
 * Segments screenplay text into SceneBlocks with rich stats, confidence,
 * and QC flags. This is the SOURCE OF TRUTH - AI enrichment never overwrites.
 * 
 * Features:
 * - Completeness score (0-100) with PASS/WARN/BLOCK verdicts
 * - Per-scene stats (char_cues, dialogue_blocks, action_lines)
 * - Anti-report detection (Cast Principal, Plan de Rodaje, etc.)
 * - Scene-aware chunking for LLM enrichment
 */

// =============================================================================
// REGEX PATTERNS (English + Spanish + Common Variants)
// =============================================================================

export const SLUGLINE_RE = /^(?:\d+\s*[.\):\-–—]?\s*)?(?<prefix>INT\.\/EXT\.|INT\.\/EXT|INT\/EXT|I\/E\.|I\/E|INT\.|EXT\.|INTERIOR|EXTERIOR|INTERNO|EXTERNO)\s*[.:\-–—]?\s*(?<rest>.+?)(?:\s*[-–—]\s*(?<tod>DAY|NIGHT|MORNING|AFTERNOON|EVENING|DUSK|DAWN|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS LATER|SAME TIME|SAME|DÍA|NOCHE|AMANECER|ATARDECER|CONTINUA|MÁS TARDE|MISMO|B&W|COLOR))?$/i;

export const TRANSITION_RE = /^(CUT TO:|SMASH CUT TO:|DISSOLVE TO:|FADE IN:|FADE OUT\.|FADE TO BLACK\.|MATCH CUT TO:|WIPE TO:|IRIS IN:|IRIS OUT:|CORTE A:|FUNDIDO A:?|ENCADENADO:?)$/i;

export const CHARACTER_CUE_RE = /^(?<name>[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 .'\-()]{1,40})(?<cont>\s*\(CONT'?D?\))?(?<paren>\s*\((?:O\.S\.|O\.C\.|V\.O\.|V\.O|OS|OC|VO|PRELAP|LAP|FILTERED|ON RADIO|ON PHONE|WHISPER|SHOUT|YELL|FUERA DE CUADRO|VOZ EN OFF)\))?$/;

export const PARENTHETICAL_RE = /^\(([^)]{1,60})\)$/;

export const SHOT_RE = /^(ANGLE ON|CLOSE ON|CLOSEUP|CLOSE-UP|ECU|WIDE SHOT|POV|INSERT|ESTABLISHING|TRACKING|PAN|TILT|CRANE|AERIAL|OVERHEAD|UNDERWATER|SLOW MOTION|TIME CUT|FLASHBACK|FLASH FORWARD|PLANO|ÁNGULO|PRIMER PLANO)[: ]?/i;

export const SECTION_RE = /^(MONTAGE|INTERCUT|SERIES OF SHOTS|BEGIN MONTAGE|END MONTAGE|BEGIN INTERCUT|END INTERCUT|END OF INTERCUT|MONTAJE|INTERCALADO)[: ]?/i;

// Report/Plan detection patterns (NOT screenplay content)
const REPORT_PATTERNS = [
  /^CAST\s+PRINCIPAL/i,
  /^PERSONAJES\s*\(/i,
  /^LOCALIZACIONES\s*\(/i,
  /^ESCENAS\s+DEL\s+AN[AÁ]LISIS/i,
  /^SINOPSIS(\s|$)/i,
  /^ARGUMENTO(\s|$)/i,
  /^ESTRUCTURA\s+DRAM[AÁ]TICA/i,
  /^PLAN\s+DE\s+RODAJE/i,
  /^FICHA\s+T[EÉ]CNICA/i,
  /^REPARTO(\s|$)/i,
  /^PRODUCCI[OÓ]N(\s|$)/i,
  /^EQUIPO\s+T[EÉ]CNICO/i,
  /^DESCRIPCI[OÓ]N\s+DE\s+PERSONAJES/i,
  /^\d+\.\s+[A-ZÁÉÍÓÚÑ]{2,}\s+-\s+/,  // "1. ESCENA - descripción"
  /^ACTO\s+(I|II|III|IV|V|1|2|3|4|5)$/i,
  /^(PRIMER|SEGUNDO|TERCER)\s+ACTO/i,
  /^ÍNDICE(\s|$)/i,
  /^TABLA\s+DE\s+CONTENIDOS/i,
];

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface SceneBlockStats {
  char_cues: number;
  dialogue_blocks: number;
  dialogue_lines: number;
  dialogue_words: number;
  action_lines: number;
  parentheticals: number;
  total_lines: number;
}

export interface SceneBlockConfidence {
  heading: number;      // 0-1: How well-formed is the slugline?
  boundaries: number;   // 0-1: How clear are the scene boundaries?
  dialogue: number;     // 0-1: How confident in dialogue detection?
}

export interface SceneBlock {
  scene_id: string;
  scene_no: number;
  slugline_raw: string;
  int_ext: 'INT' | 'EXT' | 'INT/EXT';
  place_raw: string;
  place_main: string;
  place_sub: string | null;
  time_of_day: string | null;
  notes: string[];
  lines: string[];
  start_line: number;
  end_line: number;
  // V3.1 additions
  stats: SceneBlockStats;
  confidence: SceneBlockConfidence;
  qc_flags: string[];
  character_cues: CharacterCue[];
}

export interface CharacterCue {
  name: string;
  is_continued: boolean;
  delivery_tag: string | null;
  line_number: number;
  dialogue_lines: number;
  dialogue_words: number;
}

export interface ParseMetadata {
  title_candidate: string | null;
  draft_date: string | null;
  authors: string[];
  total_lines: number;
  blank_lines: number;
  content_lines: number;
}

export interface ParseStats {
  sluglines_found: number;
  character_cues_found: number;
  transitions_found: number;
  sections_found: number;
  dialogue_lines_found: number;
  dialogue_blocks_found: number;
  action_lines_found: number;
  parentheticals_found: number;
  report_headings_found: number;
}

export interface ParseResult {
  metadata: ParseMetadata;
  scene_blocks: SceneBlock[];
  orphan_lines: string[];
  parse_stats: ParseStats;
}

export interface CompletenessScore {
  total: number;           // 0-100
  verdict: 'PASS' | 'WARN' | 'BLOCK';
  breakdown: {
    slugline_density: number;
    char_cue_ratio: number;
    dialogue_ratio: number;
    action_ratio: number;
    report_penalty: number;
    text_density: number;
    scenes_with_dialogue: number;
    total_scenes: number;
  };
  issues: string[];
  suggestions: string[];
}

export interface ParseDiagnostics {
  is_valid_screenplay: boolean;
  confidence: 'high' | 'medium' | 'low';
  issues: string[];
  suggestions: string[];
  structure_type: 'screenplay' | 'treatment' | 'report' | 'unknown';
  completeness: CompletenessScore;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function isReportLikeHeading(heading: string): boolean {
  const trimmed = heading.trim();
  return REPORT_PATTERNS.some(p => p.test(trimmed));
}

function normalizeIntExt(prefix: string): 'INT' | 'EXT' | 'INT/EXT' {
  const p = prefix.toUpperCase();
  if (p.includes('/') || p.includes('I/E')) return 'INT/EXT';
  if (p.startsWith('EXT') || p.startsWith('EXTER')) return 'EXT';
  return 'INT';
}

function parseSluglineRest(rest: string): { place_main: string; place_sub: string | null; notes: string[] } {
  const notes: string[] = [];
  let r = rest;
  
  r = r.replace(/\(([^)]{1,60})\)/g, (_, n) => { notes.push(n.trim()); return ''; });
  r = r.replace(/\s+/g, ' ').trim();
  
  const parts = r.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
  const place_main = parts[0] || r || 'UNKNOWN';
  const place_sub = parts.length > 1 ? parts.slice(1).join(' - ') : null;
  
  return { place_main, place_sub, notes };
}

const TECHNICAL_SUFFIXES = [
  "CONT'D", "CONT'D.", "CONTD", "CONT.", "CONT", "CONTINUED",
  "V.O.", "V.O", "VO", "O.S.", "O.S", "OS", "O.C.", "OC",
  "PRELAP", "LAP", "FILTERED", "ON RADIO", "ON PHONE", "ON SCREEN",
  "WHISPER", "SHOUT", "YELL", "SCREAM", "QUIETLY", "ANGRILY",
  "FUERA DE CUADRO", "VOZ EN OFF"
];

export function canonicalizeName(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  
  let s = raw.trim().toUpperCase();
  
  for (const suffix of TECHNICAL_SUFFIXES) {
    const patterns = [
      new RegExp(`\\s*\\(\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)\\s*`, 'gi'),
      new RegExp(`\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gi'),
    ];
    for (const pat of patterns) {
      s = s.replace(pat, '');
    }
  }
  
  s = s.replace(/\(\s*\)/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[""]/g, '"').replace(/[']/g, "'");
  
  return s;
}

export function likelyAlias(a: string, b: string): boolean {
  const A = a.replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, '').trim();
  const B = b.replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, '').trim();
  
  if (!A || !B) return false;
  if (B.includes(A) && A.length >= 3) return true;
  if (A.includes(B) && B.length >= 3) return true;
  
  const partsB = B.split(' ');
  if (partsB.length >= 2) {
    const last = partsB[partsB.length - 1];
    if (A.endsWith(last) && A.length <= last.length + 4) return true;
  }
  
  return false;
}

// =============================================================================
// SCENE BLOCK STATS CALCULATION
// =============================================================================

function calculateBlockStats(
  lines: string[],
  cues: CharacterCue[]
): SceneBlockStats {
  let actionLines = 0;
  let parentheticals = 0;
  const blankLines = lines.filter(l => !l.trim()).length;
  
  // Track which lines are dialogue vs action
  const dialogueLineNumbers = new Set<number>();
  for (const cue of cues) {
    // Lines after cue are dialogue
    for (let i = cue.line_number; i < cue.line_number + cue.dialogue_lines + 2; i++) {
      dialogueLineNumbers.add(i);
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (PARENTHETICAL_RE.test(line)) {
      parentheticals++;
      continue;
    }
    
    // If not dialogue, cue, or parenthetical, it's action
    if (!dialogueLineNumbers.has(i) && !CHARACTER_CUE_RE.test(line)) {
      if (!TRANSITION_RE.test(line) && !SHOT_RE.test(line) && !SECTION_RE.test(line)) {
        actionLines++;
      }
    }
  }
  
  const totalDialogueLines = cues.reduce((sum, c) => sum + c.dialogue_lines, 0);
  const totalDialogueWords = cues.reduce((sum, c) => sum + c.dialogue_words, 0);
  
  return {
    char_cues: cues.length,
    dialogue_blocks: cues.filter(c => c.dialogue_lines > 0).length,
    dialogue_lines: totalDialogueLines,
    dialogue_words: totalDialogueWords,
    action_lines: actionLines,
    parentheticals,
    total_lines: lines.length - blankLines,
  };
}

function calculateBlockConfidence(
  slugline: string,
  intExt: 'INT' | 'EXT' | 'INT/EXT',
  stats: SceneBlockStats
): SceneBlockConfidence {
  // Heading confidence
  let headingConf = 0.3;
  if (intExt) headingConf += 0.4;
  if (slugline.length > 10) headingConf += 0.2;
  if (/[-–—]\s*(DAY|NIGHT|DÍA|NOCHE)/i.test(slugline)) headingConf += 0.1;
  
  // Dialogue confidence
  const dialogueConf = stats.dialogue_blocks > 0 ? 1.0 : (stats.char_cues > 0 ? 0.5 : 0.0);
  
  // Boundaries confidence
  const boundariesConf = stats.total_lines > 3 ? 0.8 : (stats.total_lines > 0 ? 0.5 : 0.2);
  
  return {
    heading: Math.min(1, headingConf),
    boundaries: boundariesConf,
    dialogue: dialogueConf,
  };
}

function calculateBlockQCFlags(
  slugline: string,
  stats: SceneBlockStats
): string[] {
  const flags: string[] = [];
  
  if (stats.dialogue_blocks === 0 && stats.char_cues === 0) {
    flags.push('NO_DIALOGUE');
  }
  
  if (!/^(INT|EXT)/i.test(slugline)) {
    flags.push('HEADING_WEAK');
  }
  
  if (isReportLikeHeading(slugline)) {
    flags.push('REPORT_LIKE');
  }
  
  if (stats.total_lines < 2) {
    flags.push('TOO_SHORT');
  }
  
  if (stats.action_lines === 0 && stats.dialogue_blocks === 0) {
    flags.push('NO_CONTENT');
  }
  
  return flags;
}

// =============================================================================
// CHARACTER CUE EXTRACTION WITH DIALOGUE COUNTING
// =============================================================================

function extractCharacterCuesFromLines(
  lines: string[],
  blockStartLine: number
): CharacterCue[] {
  const cues: CharacterCue[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = CHARACTER_CUE_RE.exec(line);
    
    if (!match || !match.groups) continue;
    
    // Skip non-character patterns
    if (TRANSITION_RE.test(line)) continue;
    if (SHOT_RE.test(line)) continue;
    if (SECTION_RE.test(line)) continue;
    
    const rawName = match.groups.name || '';
    const canonName = canonicalizeName(rawName);
    
    const skipTerms = ['CONTINUED', 'THE END', 'FADE', 'CUT', 'TITLE', 'SUPER', 'BLACK', 'END'];
    if (skipTerms.some(t => canonName === t || canonName.startsWith(t + ' '))) continue;
    
    if (canonName.length < 2 || canonName.length > 40) continue;
    
    // Count dialogue after this cue
    const { dialogueLines, dialogueWords } = countDialogueAfterCue(lines, i);
    
    cues.push({
      name: canonName,
      is_continued: !!match.groups.cont,
      delivery_tag: match.groups.paren ? match.groups.paren.replace(/[()]/g, '').trim() : null,
      line_number: blockStartLine + i,
      dialogue_lines: dialogueLines,
      dialogue_words: dialogueWords,
    });
  }
  
  return cues;
}

function countDialogueAfterCue(lines: string[], cueIndex: number): { dialogueLines: number; dialogueWords: number } {
  let dialogueLines = 0;
  let dialogueWords = 0;
  let sawContent = false;
  
  for (let j = cueIndex + 1; j < lines.length && j <= cueIndex + 10; j++) {
    const nextLine = lines[j].trim();
    
    // Empty line might end dialogue block
    if (!nextLine) {
      if (sawContent) break;
      continue;
    }
    
    // New cue, slugline, or transition ends this dialogue
    if (CHARACTER_CUE_RE.test(nextLine) || SLUGLINE_RE.test(nextLine) || TRANSITION_RE.test(nextLine)) break;
    
    // Parenthetical is part of dialogue block but doesn't count as dialogue
    if (PARENTHETICAL_RE.test(nextLine)) {
      sawContent = true;
      continue;
    }
    
    // This is dialogue
    dialogueLines++;
    dialogueWords += nextLine.split(/\s+/).filter(w => w.length > 0).length;
    sawContent = true;
  }
  
  return { dialogueLines, dialogueWords };
}

// =============================================================================
// MAIN PARSER
// =============================================================================

export function parseScreenplayText(text: string): ParseResult {
  const rawLines = text.split('\n');
  const scene_blocks: SceneBlock[] = [];
  const orphan_lines: string[] = [];
  let currentBlock: Partial<SceneBlock> | null = null;
  let currentLines: string[] = [];
  let currentStartLine = 0;
  let sceneNumber = 0;
  
  const stats: ParseStats = {
    sluglines_found: 0,
    character_cues_found: 0,
    transitions_found: 0,
    sections_found: 0,
    dialogue_lines_found: 0,
    dialogue_blocks_found: 0,
    action_lines_found: 0,
    parentheticals_found: 0,
    report_headings_found: 0,
  };
  
  // Metadata extraction
  const metadata = extractMetadata(rawLines.slice(0, 50));
  metadata.total_lines = rawLines.length;
  metadata.blank_lines = rawLines.filter(l => !l.trim()).length;
  metadata.content_lines = rawLines.length - metadata.blank_lines;
  
  // Process lines
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    
    // Check for report-like heading (flag but still process)
    if (isReportLikeHeading(trimmed)) {
      stats.report_headings_found++;
    }
    
    // Check for slugline
    const slugMatch = SLUGLINE_RE.exec(trimmed);
    if (slugMatch) {
      // Save previous block
      if (currentBlock && currentLines.length > 0) {
        const cues = extractCharacterCuesFromLines(currentLines, currentStartLine);
        const blockStats = calculateBlockStats(currentLines, cues);
        const blockConf = calculateBlockConfidence(currentBlock.slugline_raw || '', currentBlock.int_ext || 'INT', blockStats);
        const blockFlags = calculateBlockQCFlags(currentBlock.slugline_raw || '', blockStats);
        
        scene_blocks.push({
          ...currentBlock,
          lines: currentLines,
          end_line: i - 1,
          stats: blockStats,
          confidence: blockConf,
          qc_flags: blockFlags,
          character_cues: cues,
        } as SceneBlock);
        
        // Aggregate stats
        stats.character_cues_found += blockStats.char_cues;
        stats.dialogue_blocks_found += blockStats.dialogue_blocks;
        stats.dialogue_lines_found += blockStats.dialogue_lines;
        stats.action_lines_found += blockStats.action_lines;
        stats.parentheticals_found += blockStats.parentheticals;
      }
      
      // Start new block
      sceneNumber++;
      stats.sluglines_found++;
      
      const parsed = parseSluglineRest(slugMatch.groups?.rest || '');
      
      currentBlock = {
        scene_id: `S${String(sceneNumber).padStart(3, '0')}`,
        scene_no: sceneNumber,
        slugline_raw: trimmed,
        int_ext: normalizeIntExt(slugMatch.groups?.prefix || ''),
        place_raw: slugMatch.groups?.rest || '',
        place_main: parsed.place_main,
        place_sub: parsed.place_sub,
        time_of_day: slugMatch.groups?.tod || null,
        notes: parsed.notes,
        start_line: i,
      };
      currentLines = [line];
      currentStartLine = i;
      continue;
    }
    
    // Track transitions
    if (TRANSITION_RE.test(trimmed)) {
      stats.transitions_found++;
    }
    
    // Track sections
    if (SECTION_RE.test(trimmed)) {
      stats.sections_found++;
    }
    
    // Add to current block or orphans
    if (currentBlock) {
      currentLines.push(line);
    } else if (trimmed) {
      orphan_lines.push(line);
    }
  }
  
  // Save last block
  if (currentBlock && currentLines.length > 0) {
    const cues = extractCharacterCuesFromLines(currentLines, currentStartLine);
    const blockStats = calculateBlockStats(currentLines, cues);
    const blockConf = calculateBlockConfidence(currentBlock.slugline_raw || '', currentBlock.int_ext || 'INT', blockStats);
    const blockFlags = calculateBlockQCFlags(currentBlock.slugline_raw || '', blockStats);
    
    scene_blocks.push({
      ...currentBlock,
      lines: currentLines,
      end_line: rawLines.length - 1,
      stats: blockStats,
      confidence: blockConf,
      qc_flags: blockFlags,
      character_cues: cues,
    } as SceneBlock);
    
    stats.character_cues_found += blockStats.char_cues;
    stats.dialogue_blocks_found += blockStats.dialogue_blocks;
    stats.dialogue_lines_found += blockStats.dialogue_lines;
    stats.action_lines_found += blockStats.action_lines;
    stats.parentheticals_found += blockStats.parentheticals;
  }
  
  return {
    metadata,
    scene_blocks,
    orphan_lines,
    parse_stats: stats,
  };
}

function extractMetadata(headerLines: string[]): ParseMetadata {
  let title_candidate: string | null = null;
  let draft_date: string | null = null;
  const authors: string[] = [];
  
  for (const line of headerLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (SLUGLINE_RE.test(trimmed)) continue;
    
    if (!title_candidate && /^["']?[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\-:]+["']?$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 80) {
      title_candidate = trimmed.replace(/["']/g, '').trim();
    }
    
    const dateMatch = trimmed.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\w+\s+\d{1,2},?\s+\d{4})/);
    if (dateMatch && !draft_date) draft_date = dateMatch[0];
    
    const authorMatch = trimmed.match(/(?:written by|screenplay by|by|escrito por|guión de|guionista)\s+(.+)/i);
    if (authorMatch) {
      const authorText = authorMatch[1].trim();
      authors.push(...authorText.split(/\s+(?:and|&|y)\s+/i).map(a => a.trim()).filter(Boolean));
    }
  }
  
  return {
    title_candidate,
    draft_date,
    authors,
    total_lines: 0,
    blank_lines: 0,
    content_lines: 0,
  };
}

// =============================================================================
// COMPLETENESS SCORE CALCULATION
// =============================================================================

export function calculateCompletenessScore(result: ParseResult): CompletenessScore {
  const stats = result.parse_stats;
  const blocks = result.scene_blocks;
  const totalLines = result.metadata.total_lines;
  const contentLines = result.metadata.content_lines;
  
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // 1. Slugline density (20 pts) - ideal 0.3-8%
  const sluglineDensity = (stats.sluglines_found / Math.max(totalLines, 1)) * 100;
  let sluglineScore = 0;
  if (sluglineDensity >= 0.3 && sluglineDensity <= 8) {
    sluglineScore = 20;
  } else if (sluglineDensity > 0 && sluglineDensity < 0.3) {
    sluglineScore = 10;
    issues.push('POCAS_ESCENAS');
  } else if (sluglineDensity > 8) {
    sluglineScore = 10;
    issues.push('DEMASIADOS_HEADERS');
  } else {
    sluglineScore = 0;
    issues.push('SIN_SLUGLINES');
    suggestions.push('No se detectaron encabezados de escena (INT./EXT.). Asegúrate de que el guion tenga formato correcto.');
  }
  
  // 2. Character cue ratio (20 pts) - ideal >= 1 per scene
  const charCueRatio = stats.character_cues_found / Math.max(blocks.length, 1);
  let charCueScore = 0;
  if (charCueRatio >= 1.5) {
    charCueScore = 20;
  } else if (charCueRatio >= 0.5) {
    charCueScore = 15;
  } else if (charCueRatio > 0) {
    charCueScore = 10;
    issues.push('POCOS_PERSONAJES');
  } else {
    charCueScore = 0;
    issues.push('SIN_PERSONAJES');
    suggestions.push('Los nombres de personaje deben estar en MAYÚSCULAS seguidos de su diálogo.');
  }
  
  // 3. Dialogue ratio (25 pts)
  const dialogueRatio = stats.dialogue_blocks_found / Math.max(stats.character_cues_found, 1);
  let dialogueScore = 0;
  if (dialogueRatio >= 1) {
    dialogueScore = 25;
  } else if (dialogueRatio >= 0.3) {
    dialogueScore = 15;
  } else if (stats.dialogue_blocks_found > 0) {
    dialogueScore = 10;
  }
  // Note: 0 dialogue isn't always an error (action sequences, montages)
  
  // 4. Scenes with dialogue coverage (15 pts)
  const scenesWithDialogue = blocks.filter(b => b.stats.dialogue_blocks > 0).length;
  const dialogueCoverage = (scenesWithDialogue / Math.max(blocks.length, 1)) * 15;
  
  // 5. Text density (10 pts)
  const textDensity = contentLines / Math.max(totalLines, 1);
  let densityScore = 0;
  if (textDensity >= 0.4 && textDensity <= 0.85) {
    densityScore = 10;
  } else if (textDensity > 0.2) {
    densityScore = 5;
  } else {
    densityScore = 0;
    issues.push('DENSIDAD_BAJA');
  }
  
  // 6. Action lines (10 pts)
  const actionRatio = stats.action_lines_found / Math.max(contentLines, 1);
  let actionScore = 0;
  if (actionRatio >= 0.1 && actionRatio <= 0.6) {
    actionScore = 10;
  } else if (actionRatio > 0) {
    actionScore = 5;
  }
  
  // 7. Report penalty (-30 max)
  let reportPenalty = 0;
  if (stats.report_headings_found > 0) {
    reportPenalty = Math.min(stats.report_headings_found * 10, 30);
    issues.push(`REPORT_HEADERS:${stats.report_headings_found}`);
    suggestions.push('Detecté cabeceras tipo "Cast Principal / Localizaciones". Esto parece un reporte o plan, no el guion.');
  }
  
  // Check for scenes flagged as REPORT_LIKE
  const reportLikeScenes = blocks.filter(b => b.qc_flags.includes('REPORT_LIKE')).length;
  if (reportLikeScenes > blocks.length * 0.3) {
    reportPenalty += 15;
    issues.push('ESTRUCTURA_REPORTE');
  }
  
  // Calculate total
  let total = sluglineScore + charCueScore + dialogueScore + dialogueCoverage + densityScore + actionScore - reportPenalty;
  total = Math.max(0, Math.min(100, Math.round(total)));
  
  // Determine verdict
  let verdict: 'PASS' | 'WARN' | 'BLOCK' = 'PASS';
  if (total < 40) {
    verdict = 'BLOCK';
    if (stats.report_headings_found > 2 || reportLikeScenes > blocks.length * 0.3) {
      suggestions.push('📋 Este PDF parece un plan de rodaje o reporte, no un guion. Sube el PDF del guion completo.');
    } else if (blocks.length === 0) {
      suggestions.push('🎬 No se encontraron escenas. Revisa que el PDF tenga formato de guion con INT./EXT.');
    } else if (stats.dialogue_blocks_found === 0 && stats.character_cues_found === 0) {
      suggestions.push('📝 No se detectaron personajes ni diálogos. El formato del PDF puede estar corrupto.');
    } else {
      suggestions.push('⚠️ El formato no permite extraer suficiente información. Intenta copiar y pegar el texto directamente.');
    }
  } else if (total < 60) {
    verdict = 'WARN';
    if (stats.dialogue_blocks_found === 0) {
      suggestions.push('Este guion parece ser un treatment o tiene pocas líneas de diálogo. Continuaremos pero algunos datos pueden faltar.');
    }
  }
  
  return {
    total,
    verdict,
    breakdown: {
      slugline_density: Math.round(sluglineDensity * 100) / 100,
      char_cue_ratio: Math.round(charCueRatio * 100) / 100,
      dialogue_ratio: Math.round(dialogueRatio * 100) / 100,
      action_ratio: Math.round(actionRatio * 100) / 100,
      report_penalty: reportPenalty,
      text_density: Math.round(textDensity * 100),
      scenes_with_dialogue: scenesWithDialogue,
      total_scenes: blocks.length,
    },
    issues,
    suggestions,
  };
}

// =============================================================================
// DIAGNOSTICS
// =============================================================================

export function diagnoseParseResult(result: ParseResult): ParseDiagnostics {
  const stats = result.parse_stats;
  const blocks = result.scene_blocks;
  const completeness = calculateCompletenessScore(result);
  
  const issues: string[] = [...completeness.issues];
  const suggestions: string[] = [...completeness.suggestions];
  
  // Determine structure type
  let structureType: 'screenplay' | 'treatment' | 'report' | 'unknown' = 'unknown';
  if (completeness.verdict === 'PASS') {
    structureType = 'screenplay';
  } else if (stats.report_headings_found > 2) {
    structureType = 'report';
  } else if (stats.sluglines_found > 0 && stats.dialogue_blocks_found === 0) {
    structureType = 'treatment';
  }
  
  // Confidence level
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (completeness.total >= 70) confidence = 'high';
  else if (completeness.total >= 50) confidence = 'medium';
  
  // Valid for production?
  const hasDialogues = stats.dialogue_lines_found > 0 || stats.dialogue_blocks_found > 0;
  const is_valid_screenplay = blocks.length >= 3 && 
    stats.character_cues_found >= 2 &&
    (hasDialogues || blocks.length === 0);
  
  return {
    is_valid_screenplay,
    confidence,
    issues,
    suggestions,
    structure_type: structureType,
    completeness,
  };
}

// =============================================================================
// CHUNKING (Scene-Aware)
// =============================================================================

export interface Chunk {
  chunk_id: string;
  scene_blocks: SceneBlock[];
  scene_ids: string[];
  scene_range: { from: number; to: number };
  text: string;
  char_count: number;
  overlap_prev: SceneBlock | null;
  overlap_next: SceneBlock | null;
}

export function chunkBySceneBlocks(
  sceneBlocks: SceneBlock[],
  targetScenes: number = 12,
  maxChars: number = 12000,
  overlapScenes: number = 1
): Chunk[] {
  if (sceneBlocks.length === 0) return [];
  
  const chunks: Chunk[] = [];
  let currentScenes: SceneBlock[] = [];
  let currentChars = 0;
  let chunkIndex = 0;
  
  for (let i = 0; i < sceneBlocks.length; i++) {
    const block = sceneBlocks[i];
    const blockChars = block.lines.join('\n').length;
    
    // Check if we should finalize current chunk
    const wouldExceedScenes = currentScenes.length >= targetScenes;
    const wouldExceedChars = currentChars + blockChars > maxChars && currentScenes.length > 0;
    
    if (wouldExceedScenes || wouldExceedChars) {
      // Finalize chunk
      const text = currentScenes.map(b => b.lines.join('\n')).join('\n\n');
      chunks.push({
        chunk_id: `C${String(chunkIndex + 1).padStart(2, '0')}`,
        scene_blocks: currentScenes,
        scene_ids: currentScenes.map(b => b.scene_id),
        scene_range: {
          from: currentScenes[0]?.scene_no || 0,
          to: currentScenes[currentScenes.length - 1]?.scene_no || 0,
        },
        text,
        char_count: text.length,
        overlap_prev: chunkIndex > 0 && chunks[chunkIndex - 1] ? 
          chunks[chunkIndex - 1].scene_blocks[chunks[chunkIndex - 1].scene_blocks.length - 1] : null,
        overlap_next: block,
      });
      
      chunkIndex++;
      
      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentScenes.length - overlapScenes);
      currentScenes = currentScenes.slice(overlapStart);
      currentChars = currentScenes.reduce((sum, b) => sum + b.lines.join('\n').length, 0);
    }
    
    currentScenes.push(block);
    currentChars += blockChars;
  }
  
  // Finalize last chunk
  if (currentScenes.length > 0) {
    const text = currentScenes.map(b => b.lines.join('\n')).join('\n\n');
    chunks.push({
      chunk_id: `C${String(chunkIndex + 1).padStart(2, '0')}`,
      scene_blocks: currentScenes,
      scene_ids: currentScenes.map(b => b.scene_id),
      scene_range: {
        from: currentScenes[0]?.scene_no || 0,
        to: currentScenes[currentScenes.length - 1]?.scene_no || 0,
      },
      text,
      char_count: text.length,
      overlap_prev: chunkIndex > 0 && chunks[chunkIndex - 1] ? 
        chunks[chunkIndex - 1].scene_blocks[chunks[chunkIndex - 1].scene_blocks.length - 1] : null,
      overlap_next: null,
    });
  }
  
  return chunks;
}

// =============================================================================
// UTILITIES FOR EXTERNAL USE
// =============================================================================

export function extractAllCharacters(result: ParseResult): Array<{
  name: string;
  aliases: string[];
  appearances: number;
  dialogue_lines: number;
  dialogue_words: number;
  scenes: string[];
}> {
  const charMap = new Map<string, {
    aliases: Set<string>;
    appearances: number;
    lines: number;
    words: number;
    scenes: Set<string>;
  }>();
  
  for (const block of result.scene_blocks) {
    for (const cue of block.character_cues) {
      const canonical = canonicalizeName(cue.name);
      
      if (!charMap.has(canonical)) {
        charMap.set(canonical, { aliases: new Set(), appearances: 0, lines: 0, words: 0, scenes: new Set() });
      }
      
      const entry = charMap.get(canonical)!;
      entry.aliases.add(cue.name);
      entry.appearances++;
      entry.lines += cue.dialogue_lines;
      entry.words += cue.dialogue_words;
      entry.scenes.add(block.scene_id);
    }
  }
  
  return Array.from(charMap.entries())
    .map(([name, data]) => ({
      name,
      aliases: Array.from(data.aliases).filter(a => a !== name),
      appearances: data.appearances,
      dialogue_lines: data.lines,
      dialogue_words: data.words,
      scenes: Array.from(data.scenes),
    }))
    .sort((a, b) => b.dialogue_words - a.dialogue_words);
}

export function extractAllLocations(result: ParseResult): Array<{
  name: string;
  int_ext: 'INT' | 'EXT' | 'INT/EXT' | null;
  appearances: number;
  scenes: string[];
}> {
  const locMap = new Map<string, { intExt: Set<string>; count: number; scenes: Set<string> }>();
  
  for (const block of result.scene_blocks) {
    const loc = block.place_main.toUpperCase();
    if (!loc || loc === 'UNKNOWN') continue;
    
    if (!locMap.has(loc)) {
      locMap.set(loc, { intExt: new Set(), count: 0, scenes: new Set() });
    }
    
    const entry = locMap.get(loc)!;
    entry.intExt.add(block.int_ext);
    entry.count++;
    entry.scenes.add(block.scene_id);
  }
  
  return Array.from(locMap.entries())
    .map(([name, data]) => ({
      name,
      int_ext: data.intExt.size === 1 ? Array.from(data.intExt)[0] as 'INT' | 'EXT' | 'INT/EXT' : null,
      appearances: data.count,
      scenes: Array.from(data.scenes),
    }))
    .sort((a, b) => b.appearances - a.appearances);
}

// Legacy export for backwards compatibility
export function extractCharactersFromBlock(block: SceneBlock): CharacterCue[] {
  return block.character_cues;
}
