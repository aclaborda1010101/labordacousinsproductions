/**
 * SCREENPLAY PARSER V1 - Segmentador determinista por escenas
 * SIN LLM - Solo regex y heurísticas industriales
 */

// =============================================================================
// REGEX EXACTAS (soporta inglés + español + variantes comunes)
// =============================================================================

// Slugline: INT./EXT. + variantes + DAY/NIGHT/CONTINUOUS/LATER
export const SLUGLINE_RE = /^(?:\d+\s*[.\):\-–—]?\s*)?(?<prefix>INT\.\/EXT\.|INT\.\/EXT|INT\/EXT|I\/E\.|I\/E|INT\.|EXT\.|INTERIOR|EXTERIOR|INTERNO|EXTERNO)\s*[.:\-–—]?\s*(?<rest>.+?)(?:\s*[-–—]\s*(?<tod>DAY|NIGHT|MORNING|AFTERNOON|EVENING|DUSK|DAWN|SUNSET|SUNRISE|CONTINUOUS|LATER|MOMENTS LATER|SAME TIME|SAME|DÍA|NOCHE|AMANECER|ATARDECER|CONTINUA|MÁS TARDE|MISMO|B&W|COLOR))?$/i;

// Transiciones
export const TRANSITION_RE = /^(CUT TO:|SMASH CUT TO:|DISSOLVE TO:|FADE IN:|FADE OUT\.|FADE TO BLACK\.|MATCH CUT TO:|WIPE TO:|IRIS IN:|IRIS OUT:|CORTE A:|FUNDIDO A:?|ENCADENADO:?)$/i;

// Character cue (antes de diálogo) - soporta acentos españoles
export const CHARACTER_CUE_RE = /^(?<name>[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 .'\-()]{1,40})(?<cont>\s*\(CONT'?D?\))?(?<paren>\s*\((?:O\.S\.|O\.C\.|V\.O\.|V\.O|OS|OC|VO|PRELAP|LAP|FILTERED|ON RADIO|ON PHONE|WHISPER|SHOUT|YELL|FUERA DE CUADRO|VOZ EN OFF)\))?$/;

// Parentheticals (wrylies)
export const PARENTHETICAL_RE = /^\(([^)]{1,60})\)$/;

// Shot lines
export const SHOT_RE = /^(ANGLE ON|CLOSE ON|CLOSEUP|CLOSE-UP|ECU|WIDE SHOT|POV|INSERT|ESTABLISHING|TRACKING|PAN|TILT|CRANE|AERIAL|OVERHEAD|UNDERWATER|SLOW MOTION|TIME CUT|FLASHBACK|FLASH FORWARD|PLANO|ÁNGULO|PRIMER PLANO)[: ]?/i;

// Secciones especiales
export const SECTION_RE = /^(MONTAGE|INTERCUT|SERIES OF SHOTS|BEGIN MONTAGE|END MONTAGE|BEGIN INTERCUT|END INTERCUT|END OF INTERCUT|MONTAJE|INTERCALADO)[: ]?/i;

// =============================================================================
// TIPOS
// =============================================================================

export interface SceneBlock {
  scene_id: string;
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
}

export interface CharacterCue {
  name: string;
  is_continued: boolean;
  delivery_tag: string | null;
  line_number: number;
}

export interface ParseMetadata {
  title_candidate: string | null;
  draft_date: string | null;
  authors: string[];
  total_lines: number;
}

export interface ParseStats {
  sluglines_found: number;
  character_cues_found: number;
  transitions_found: number;
  sections_found: number;
  dialogue_lines_found: number;
  dialogue_blocks_found: number; // Character + dialogue pairs
}

export interface ParseResult {
  metadata: ParseMetadata;
  scene_blocks: SceneBlock[];
  orphan_lines: string[];
  parse_stats: ParseStats;
}

// =============================================================================
// PARSER PRINCIPAL
// =============================================================================

export function parseScreenplayText(text: string): ParseResult {
  const rawLines = text.split('\n');
  const scene_blocks: SceneBlock[] = [];
  const orphan_lines: string[] = [];
  let currentBlock: SceneBlock | null = null;
  let sceneNumber = 0;
  
  const stats: ParseStats = {
    sluglines_found: 0,
    character_cues_found: 0,
    transitions_found: 0,
    sections_found: 0,
    dialogue_lines_found: 0,
    dialogue_blocks_found: 0,
  };
  
  // Metadata extraction (primeras ~50 líneas)
  const metadata = extractMetadata(rawLines.slice(0, 50));
  metadata.total_lines = rawLines.length;
  
  // =========================================================================
  // INDUSTRIAL DIALOGUE DETECTION: Track context to detect dialogue after
  // character cues, even in PDFs with broken indentation
  // =========================================================================
  let lastWasCharacterCue = false;
  let pendingCharacterCue = false;
  let linesAfterCharacterCue = 0;
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    
    // Check for slugline
    const slugMatch = SLUGLINE_RE.exec(trimmed);
    if (slugMatch) {
      // Save current block
      if (currentBlock) {
        currentBlock.end_line = i - 1;
        scene_blocks.push(currentBlock);
      }
      
      sceneNumber++;
      stats.sluglines_found++;
      
      const parsed = parseSluglineRest(slugMatch.groups?.rest || '');
      
      currentBlock = {
        scene_id: `S${String(sceneNumber).padStart(3, '0')}`,
        slugline_raw: trimmed,
        int_ext: normalizeIntExt(slugMatch.groups?.prefix || ''),
        place_raw: slugMatch.groups?.rest || '',
        place_main: parsed.place_main,
        place_sub: parsed.place_sub,
        time_of_day: slugMatch.groups?.tod || null,
        notes: parsed.notes,
        lines: [line],
        start_line: i,
        end_line: i,
      };
      
      // Reset dialogue detection state on new scene
      lastWasCharacterCue = false;
      pendingCharacterCue = false;
      linesAfterCharacterCue = 0;
    } else if (currentBlock) {
      currentBlock.lines.push(line);
      
      // Track transitions
      if (TRANSITION_RE.test(trimmed)) {
        stats.transitions_found++;
        lastWasCharacterCue = false;
        pendingCharacterCue = false;
        continue;
      }
      
      // Track sections
      if (SECTION_RE.test(trimmed)) {
        stats.sections_found++;
        lastWasCharacterCue = false;
        pendingCharacterCue = false;
        continue;
      }
      
      // =====================================================================
      // DIALOGUE DETECTION LOGIC (Context-Aware)
      // =====================================================================
      
      // Check for character cue
      const isCharacterCue = CHARACTER_CUE_RE.test(trimmed) && 
        !TRANSITION_RE.test(trimmed) && 
        !SHOT_RE.test(trimmed) &&
        !SECTION_RE.test(trimmed);
      
      if (isCharacterCue) {
        stats.character_cues_found++;
        lastWasCharacterCue = true;
        pendingCharacterCue = true;
        linesAfterCharacterCue = 0;
        continue;
      }
      
      // Check for parenthetical (doesn't break dialogue sequence)
      const isParenthetical = PARENTHETICAL_RE.test(trimmed);
      if (isParenthetical && pendingCharacterCue) {
        // Parenthetical after character cue - dialogue still expected
        linesAfterCharacterCue++;
        continue;
      }
      
      // =====================================================================
      // DIALOGUE LINE DETECTION
      // Method 1: Traditional indentation check (for well-formatted PDFs)
      // Method 2: Context-based (line after character cue)
      // =====================================================================
      
      if (trimmed.length > 0) {
        // Skip empty lines
        const isIndented = /^\s{3,}/.test(line);
        const isAllCaps = /^[A-Z\s\d.,!?'"()\-:;]+$/.test(trimmed);
        const isLikelyAction = trimmed.length > 100; // Long lines are usually action
        
        // Method 1: Traditional indentation-based detection
        const isDialogueByIndent = isIndented && !isAllCaps && trimmed.length > 0;
        
        // Method 2: Context-based detection (line after character cue)
        // Valid for up to 3 lines after character cue (char, paren, dialogue, maybe continuation)
        const isDialogueByContext = pendingCharacterCue && 
          linesAfterCharacterCue < 5 && 
          !isAllCaps && 
          !isLikelyAction &&
          !SLUGLINE_RE.test(trimmed);
        
        if (isDialogueByIndent || isDialogueByContext) {
          stats.dialogue_lines_found++;
          
          // Count dialogue block only on first dialogue line after character cue
          if (pendingCharacterCue && linesAfterCharacterCue === 0) {
            stats.dialogue_blocks_found++;
          }
        }
        
        // Track lines after character cue
        if (pendingCharacterCue) {
          linesAfterCharacterCue++;
          // Reset after 5 lines or on action-like line
          if (linesAfterCharacterCue >= 5 || isLikelyAction || isAllCaps) {
            pendingCharacterCue = false;
          }
        }
        
        // A new character cue or slugline resets the state (handled above)
      }
    } else {
      orphan_lines.push(line);
    }
  }
  
  // Save last block
  if (currentBlock) {
    currentBlock.end_line = rawLines.length - 1;
    scene_blocks.push(currentBlock);
  }
  
  return {
    metadata,
    scene_blocks,
    orphan_lines,
    parse_stats: stats,
  };
}

// =============================================================================
// CHUNKING BY SCENE BLOCKS
// =============================================================================

export interface Chunk {
  chunk_id: string;
  scene_blocks: SceneBlock[];
  scene_ids: string[];
  text: string;
  char_count: number;
}

export function chunkBySceneBlocks(
  sceneBlocks: SceneBlock[],
  maxChunks: number = 10,
  targetCharsPerChunk: number = 10000,
  overlapScenes: number = 1
): Chunk[] {
  if (sceneBlocks.length === 0) return [];
  
  const chunks: Chunk[] = [];
  let currentChunk: SceneBlock[] = [];
  let currentChars = 0;
  let chunkNumber = 0;
  
  for (let i = 0; i < sceneBlocks.length; i++) {
    const block = sceneBlocks[i];
    const blockText = block.lines.join('\n');
    const blockChars = blockText.length;
    
    // Check if we need to start a new chunk
    if (currentChars + blockChars > targetCharsPerChunk && currentChunk.length > 0) {
      // Finalize current chunk
      chunkNumber++;
      chunks.push(buildChunk(currentChunk, chunkNumber));
      
      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentChunk.length - overlapScenes);
      currentChunk = currentChunk.slice(overlapStart);
      currentChars = currentChunk.reduce((sum, b) => sum + b.lines.join('\n').length, 0);
    }
    
    currentChunk.push(block);
    currentChars += blockChars;
    
    // Limit total chunks
    if (chunks.length >= maxChunks - 1) {
      // Merge remaining into last chunk
      currentChunk.push(...sceneBlocks.slice(i + 1));
      break;
    }
  }
  
  // Finalize last chunk
  if (currentChunk.length > 0) {
    chunkNumber++;
    chunks.push(buildChunk(currentChunk, chunkNumber));
  }
  
  return chunks;
}

function buildChunk(blocks: SceneBlock[], chunkNum: number): Chunk {
  const text = blocks.map(b => b.lines.join('\n')).join('\n\n');
  return {
    chunk_id: `C${String(chunkNum).padStart(2, '0')}`,
    scene_blocks: blocks,
    scene_ids: blocks.map(b => b.scene_id),
    text,
    char_count: text.length,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function extractMetadata(headerLines: string[]): ParseMetadata {
  let title_candidate: string | null = null;
  let draft_date: string | null = null;
  const authors: string[] = [];
  
  for (const line of headerLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip if it looks like a slugline
    if (SLUGLINE_RE.test(trimmed)) continue;
    
    // Title: usually first non-empty line in caps or quoted
    if (!title_candidate && /^["']?[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\-:]+["']?$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 80) {
      title_candidate = trimmed.replace(/["']/g, '').trim();
    }
    
    // Draft date patterns
    const dateMatch = trimmed.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\w+\s+\d{1,2},?\s+\d{4})/);
    if (dateMatch && !draft_date) draft_date = dateMatch[0];
    
    // Authors: "Written by", "By", "Escrito por", etc.
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
  };
}

function parseSluglineRest(rest: string): { place_main: string; place_sub: string | null; notes: string[] } {
  const notes: string[] = [];
  let r = rest;
  
  // Extract parenthetical notes
  r = r.replace(/\(([^)]{1,60})\)/g, (_, n) => { notes.push(n.trim()); return ''; });
  r = r.replace(/\s+/g, ' ').trim();
  
  // Split by " - " (the common separator for sub-locations)
  const parts = r.split(/\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
  const place_main = parts[0] || r || 'UNKNOWN';
  const place_sub = parts.length > 1 ? parts.slice(1).join(' - ') : null;
  
  return { place_main, place_sub, notes };
}

function normalizeIntExt(prefix: string): 'INT' | 'EXT' | 'INT/EXT' {
  const p = prefix.toUpperCase();
  if (p.includes('/') || p.includes('I/E')) return 'INT/EXT';
  if (p.startsWith('EXT') || p.startsWith('EXTER')) return 'EXT';
  return 'INT';
}

// =============================================================================
// CANONICALIZE NAMES
// =============================================================================

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
  
  // Remove parenthetical tags
  for (const suffix of TECHNICAL_SUFFIXES) {
    const patterns = [
      new RegExp(`\\s*\\(\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)\\s*`, 'gi'),
      new RegExp(`\\s*${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gi'),
    ];
    for (const pat of patterns) {
      s = s.replace(pat, '');
    }
  }
  
  // Remove empty parentheses
  s = s.replace(/\(\s*\)/g, '');
  
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  
  // Remove special quotes
  s = s.replace(/[""]/g, '"').replace(/[']/g, "'");
  
  return s;
}

export function likelyAlias(a: string, b: string): boolean {
  const A = a.replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, '').trim();
  const B = b.replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, '').trim();
  
  if (!A || !B) return false;
  
  // Substring check (SOLO ⊂ NAPOLEON SOLO)
  if (B.includes(A) && A.length >= 3) return true;
  if (A.includes(B) && B.length >= 3) return true;
  
  // Inicial + apellido (N. SOLO vs NAPOLEON SOLO)
  const partsB = B.split(' ');
  if (partsB.length >= 2) {
    const last = partsB[partsB.length - 1];
    if (A.endsWith(last) && A.length <= last.length + 4) return true;
  }
  
  return false;
}

// =============================================================================
// EXTRACT CHARACTERS FROM SCENE BLOCK (deterministic)
// =============================================================================

export function extractCharactersFromBlock(block: SceneBlock): CharacterCue[] {
  const cues: CharacterCue[] = [];
  
  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i].trim();
    const match = CHARACTER_CUE_RE.exec(line);
    
    if (match && match.groups) {
      const rawName = match.groups.name || '';
      const canonName = canonicalizeName(rawName);
      
      // Skip if it looks like a transition or technical term
      if (TRANSITION_RE.test(line)) continue;
      if (SHOT_RE.test(line)) continue;
      if (SECTION_RE.test(line)) continue;
      
      // Skip common non-character terms
      const skipTerms = ['CONTINUED', 'THE END', 'FADE', 'CUT', 'TITLE', 'SUPER', 'BLACK', 'END'];
      if (skipTerms.some(t => canonName === t || canonName.startsWith(t + ' '))) continue;
      
      if (canonName.length >= 2 && canonName.length <= 40) {
        cues.push({
          name: canonName,
          is_continued: !!match.groups.cont,
          delivery_tag: match.groups.paren ? match.groups.paren.replace(/[()]/g, '').trim() : null,
          line_number: block.start_line + i,
        });
      }
    }
  }
  
  return cues;
}

// =============================================================================
// VALIDATION / DIAGNOSTICS
// =============================================================================

export interface ParseDiagnostics {
  is_valid_screenplay: boolean;
  confidence: 'high' | 'medium' | 'low';
  issues: string[];
  suggestions: string[];
}

export function diagnoseParseResult(result: ParseResult): ParseDiagnostics {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Check scene count
  if (result.scene_blocks.length < 5) {
    issues.push(`LOW_SCENE_COUNT:${result.scene_blocks.length}`);
    suggestions.push('Documento puede no ser un guion o tener formato inusual');
  }
  
  // Check character cue density
  const cueRatio = result.parse_stats.character_cues_found / Math.max(result.scene_blocks.length, 1);
  if (cueRatio < 1) {
    issues.push(`LOW_CHARACTER_CUE_DENSITY:${cueRatio.toFixed(1)}`);
  }
  
  // CRITICAL: Check for missing dialogues (scenes exist but no dialogues detected)
  if (result.scene_blocks.length > 0 && result.parse_stats.dialogue_lines_found === 0) {
    issues.push('NO_DIALOGUES_DETECTED');
    suggestions.push('Se detectaron escenas pero ningún diálogo. El formato del PDF puede estar corrupto o no es un guion con diálogos.');
  }
  
  // Check dialogue block ratio (should have roughly as many dialogue blocks as character cues)
  const dialogueBlockRatio = result.parse_stats.dialogue_blocks_found / Math.max(result.parse_stats.character_cues_found, 1);
  if (result.parse_stats.character_cues_found > 0 && dialogueBlockRatio < 0.5) {
    issues.push(`LOW_DIALOGUE_BLOCK_RATIO:${(dialogueBlockRatio * 100).toFixed(0)}%`);
    suggestions.push('Muchos personajes sin diálogos detectados; posible problema de formato');
  }
  
  // Check orphan lines
  const orphanRatio = result.orphan_lines.length / Math.max(result.metadata.total_lines, 1);
  if (orphanRatio > 0.3) {
    issues.push(`HIGH_ORPHAN_RATIO:${(orphanRatio * 100).toFixed(0)}%`);
    suggestions.push('Muchas líneas antes de la primera escena; posible formato PDF roto');
  }
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'high';
  if (issues.length >= 2) confidence = 'low';
  else if (issues.length === 1) confidence = 'medium';
  
  // CRITICAL: No dialogues = invalid screenplay for production
  const hasDialogues = result.parse_stats.dialogue_lines_found > 0 || result.parse_stats.dialogue_blocks_found > 0;
  const is_valid_screenplay = result.scene_blocks.length >= 5 && 
    result.parse_stats.character_cues_found >= 3 &&
    (hasDialogues || result.scene_blocks.length === 0); // Allow if no scenes (not a screenplay)
  
  return {
    is_valid_screenplay,
    confidence,
    issues,
    suggestions,
  };
}
