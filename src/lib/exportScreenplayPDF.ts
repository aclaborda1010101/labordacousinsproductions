import jsPDF from 'jspdf';
import { hydrateCharacters, hydrateLocations, hydrateScenes, getBreakdownPayload } from '@/lib/breakdown/hydrate';

/**
 * Professional Screenplay PDF Export
 * Follows industry-standard formatting:
 * - Courier 12pt font
 * - 1.5" left margin, 1" right margin
 * - Sluglines in CAPS
 * - Character names centered in CAPS
 * - Dialogue centered under character name
 * - Parentheticals in parentheses, centered
 * - Action/description full width
 */

interface DialogueLine {
  character: string;
  parenthetical?: string;
  line: string;
}

interface Shot {
  shot_number?: number;
  shot_type?: string;
  duration_sec?: number;
  action?: string;
  dialogue?: DialogueLine[];
  camera_variation?: {
    focal_mm?: number;
    aperture?: string;
    movement?: string;
    height?: string;
    stabilization?: string;
    body?: string;
    lens?: string;
  };
  blocking?: {
    subject_positions?: string;
    screen_direction?: string;
    action?: string;
    timing_breakdown?: string;
  };
  lighting?: {
    style?: string;
    color_temp?: string;
    key_light_direction?: string;
  };
  sound_design?: {
    room_tone?: string;
    ambience?: string;
    foley?: string;
  };
  edit_intent?: {
    expected_cut?: string;
    hold_ms?: number;
    rhythm_note?: string;
    viewer_notice?: string;
    intention?: string;
  };
  keyframe_hints?: {
    start_frame?: string;
    end_frame?: string;
    mid_frames?: string[];
  };
  continuity?: {
    wardrobe_notes?: string;
    props_in_frame?: string[];
    match_to_previous?: string;
  };
}

interface Scene {
  scene_number?: number;
  slugline: string;
  summary?: string;
  action?: string;
  description?: string; // Alternative field name from API
  dialogue?: DialogueLine[];
  music_cue?: string;
  sfx_cue?: string;
  mood?: string;
  shots?: Shot[]; // Production shots
  pacing?: string;
  conflict?: string;
  scene_objective?: string;
}

interface Episode {
  episode_number?: number;
  title?: string;
  synopsis?: string;
  scenes?: Scene[];
}

interface ScreenplayData {
  title: string;
  logline?: string;
  synopsis?: string;
  genre?: string;
  episodes?: Episode[];
  scenes?: Scene[]; // For films
  characters?: any[];
  locations?: any[];
  props?: any[];
  parsedJson?: any; // Raw parsed JSON for extended extraction data
}

// Export mode option
interface ExportOptions {
  episodeOnly?: number;
  includeProductionDetails?: boolean; // Include shots, camera, lighting info
  includeCastingReport?: boolean; // Include casting report with dialogue metrics
}

// Page dimensions (US Letter in pts at 72 DPI)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// Margins (in pts) - industry standard
const MARGIN_LEFT = 108; // 1.5"
const MARGIN_RIGHT = 72; // 1"
const MARGIN_TOP = 72; // 1"
const MARGIN_BOTTOM = 72; // 1"

// Text widths
const TEXT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const DIALOGUE_WIDTH = 216; // 3" for dialogue
const DIALOGUE_LEFT = 180; // 2.5" from left edge
const CHARACTER_LEFT = 252; // 3.5" from left edge (centered)
const PARENTHETICAL_LEFT = 216; // 3" from left edge

// Line heights
const LINE_HEIGHT = 12; // Courier 12pt = 12 line height

// Helper functions for character metrics (from CastingReportTable logic)
function getDialogueLines(c: any): number {
  const candidates = [
    c.dialogue_lines,
    c.dialogueLineCount,
    c.dialogue_line_count,
    c.lines,
    c.dialogue?.lines,
    c.dialogue?.count,
    c.dialogue?.line_count,
    c.counts?.dialogue_lines,
    c.counts?.lines,
    c.dialogue_words ? Math.ceil(c.dialogue_words / 10) : null,
  ];
  for (const v of candidates) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function getScenesCount(c: any): number {
  return c.scenes_count ?? c.scene_count ?? c.scenes?.length ?? c.scene_ids?.length ?? 0;
}

function getRole(c: any): string {
  return c.role ?? c.narrative_weight ?? c.classification ?? c.type ?? "unknown";
}

function getName(c: any): string {
  return c.name ?? c.character ?? c.id ?? "UNKNOWN";
}

function getConfidenceLevel(c: any): "high" | "medium" | "low" {
  const hasDialogue = getDialogueLines(c) > 0;
  const hasScenes = getScenesCount(c) > 0;
  const hasSlugline = !!c.detected_in_slugline || !!c.in_slugline;
  const hasDialogueBlock = !!c.has_dialogue_block || hasDialogue;
  
  if (hasDialogueBlock && hasScenes) return "high";
  if (hasDialogue || hasSlugline) return "medium";
  return "low";
}

const ROLE_LABELS: Record<string, string> = {
  protagonist: "Protagonista",
  "co-protagonist": "Co-Protagonista",
  major_supporting: "Secundario Principal",
  supporting: "Secundario",
  minor_speaking: "Menor con Diálogo",
  featured_extra: "Extra Destacado",
  voice: "Voz",
  functional: "Funcional",
  unknown: "Desconocido",
};

export function exportScreenplayPDF(screenplay: ScreenplayData, options?: ExportOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter'
  });

  const includeProduction = options?.includeProductionDetails ?? true;
  const includeCasting = options?.includeCastingReport ?? true;
  let currentY = MARGIN_TOP;
  let pageNumber = 1;

  // Helper: Add new page
  const addPage = () => {
    doc.addPage();
    pageNumber++;
    currentY = MARGIN_TOP;
  };

  // Helper: Check if we need a new page
  const checkPageBreak = (linesNeeded: number = 1) => {
    const spaceNeeded = linesNeeded * LINE_HEIGHT;
    if (currentY + spaceNeeded > PAGE_HEIGHT - MARGIN_BOTTOM) {
      addPage();
      return true;
    }
    return false;
  };

  // Helper: Write text line
  const writeLine = (text: string, x: number, opts?: { bold?: boolean; italic?: boolean; uppercase?: boolean; fontSize?: number }) => {
    const style = opts?.bold ? 'bold' : opts?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(opts?.fontSize || 12);
    const displayText = opts?.uppercase ? text.toUpperCase() : text;
    doc.text(displayText, x, currentY);
    currentY += opts?.fontSize || LINE_HEIGHT;
  };

  // Helper: Write wrapped text
  const writeWrapped = (text: string, x: number, maxWidth: number, opts?: { bold?: boolean; italic?: boolean; uppercase?: boolean; fontSize?: number }) => {
    const style = opts?.bold ? 'bold' : opts?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(opts?.fontSize || 12);
    const displayText = opts?.uppercase ? text.toUpperCase() : text;
    const lines = doc.splitTextToSize(displayText, maxWidth);
    
    for (const line of lines) {
      checkPageBreak();
      doc.text(line, x, currentY);
      currentY += opts?.fontSize || LINE_HEIGHT;
    }
  };

  // Helper: Write centered text
  const writeCentered = (text: string, opts?: { bold?: boolean; italic?: boolean; uppercase?: boolean }) => {
    const style = opts?.bold ? 'bold' : opts?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(12);
    const displayText = opts?.uppercase ? text.toUpperCase() : text;
    const textWidth = doc.getTextWidth(displayText);
    const x = (PAGE_WIDTH - textWidth) / 2;
    doc.text(displayText, x, currentY);
    currentY += LINE_HEIGHT;
  };

  // Write slugline
  const writeSlugline = (slugline: string, sceneNumber?: number) => {
    checkPageBreak(2);
    currentY += LINE_HEIGHT; // Blank line before slugline
    const prefix = sceneNumber ? `${sceneNumber}. ` : '';
    writeLine(`${prefix}${slugline.toUpperCase()}`, MARGIN_LEFT, { bold: true, uppercase: true });
    currentY += LINE_HEIGHT / 2; // Half line after slugline
  };

  // Write action/description
  const writeAction = (action: string) => {
    checkPageBreak();
    writeWrapped(action, MARGIN_LEFT, TEXT_WIDTH);
    currentY += LINE_HEIGHT / 2;
  };

  // Write dialogue block
  const writeDialogue = (d: DialogueLine) => {
    checkPageBreak(3);
    currentY += LINE_HEIGHT / 2;
    
    // Character name - centered and in CAPS
    doc.setFont('Courier', 'bold');
    doc.setFontSize(12);
    const charName = d.character.toUpperCase();
    doc.text(charName, CHARACTER_LEFT, currentY);
    currentY += LINE_HEIGHT;

    // Parenthetical if exists
    if (d.parenthetical) {
      doc.setFont('Courier', 'normal');
      const paren = `(${d.parenthetical.replace(/^\(|\)$/g, '')})`;
      doc.text(paren, PARENTHETICAL_LEFT, currentY);
      currentY += LINE_HEIGHT;
    }

    // Dialogue text - wrapped within dialogue width
    doc.setFont('Courier', 'normal');
    const dialogueLines = doc.splitTextToSize(d.line, DIALOGUE_WIDTH);
    for (const line of dialogueLines) {
      checkPageBreak();
      doc.text(line, DIALOGUE_LEFT, currentY);
      currentY += LINE_HEIGHT;
    }
  };

  // Write transition
  const writeTransition = (transition: string) => {
    checkPageBreak();
    currentY += LINE_HEIGHT;
    doc.setFont('Courier', 'bold');
    doc.setFontSize(12);
    const text = transition.toUpperCase();
    const textWidth = doc.getTextWidth(text);
    doc.text(text, PAGE_WIDTH - MARGIN_RIGHT - textWidth, currentY);
    currentY += LINE_HEIGHT;
  };

  // Write production shot with technical details
  const writeProductionShot = (shot: Shot, shotIdx: number, runningTime: number) => {
    checkPageBreak(8);
    
    // Shot header with type and timing
    const shotType = shot.shot_type || 'SHOT';
    const duration = shot.duration_sec || 0;
    const tc = `${Math.floor(runningTime / 60)}:${String(runningTime % 60).padStart(2, '0')}`;
    const shotHeader = `${String(shotIdx + 1).padStart(2, '0')}. ${shotType.toUpperCase()} — ${duration}s (TC: ${tc})`;
    
    writeLine(shotHeader, MARGIN_LEFT, { bold: true, fontSize: 11 });

    // Camera variation details
    if (shot.camera_variation) {
      const cam = shot.camera_variation;
      const camDetails: string[] = [];
      if (cam.focal_mm) camDetails.push(`${cam.focal_mm}mm`);
      if (cam.aperture) camDetails.push(cam.aperture);
      if (cam.movement) camDetails.push(cam.movement);
      if (cam.height) camDetails.push(cam.height);
      if (cam.stabilization) camDetails.push(cam.stabilization);
      
      if (camDetails.length > 0) {
        writeWrapped(`[CÁMARA: ${camDetails.join(' | ')}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
      
      if (cam.body || cam.lens) {
        const gear = [cam.body, cam.lens].filter(Boolean).join(' + ');
        writeWrapped(`[EQUIPO: ${gear}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
    }

    // Blocking details
    if (shot.blocking) {
      const block = shot.blocking;
      if (block.subject_positions || block.screen_direction) {
        const blockDetails = [block.subject_positions, block.screen_direction].filter(Boolean).join(' — ');
        writeWrapped(`[BLOCKING: ${blockDetails}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
      if (block.action) {
        writeWrapped(block.action, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { fontSize: 11 });
      }
    }

    // Action/description of shot
    if (shot.action && !shot.blocking?.action) {
      writeWrapped(shot.action, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { fontSize: 11 });
    }

    // Lighting details
    if (shot.lighting) {
      const light = shot.lighting;
      const lightDetails: string[] = [];
      if (light.style) lightDetails.push(light.style);
      if (light.color_temp) lightDetails.push(light.color_temp);
      if (light.key_light_direction) lightDetails.push(`Key: ${light.key_light_direction}`);
      
      if (lightDetails.length > 0) {
        writeWrapped(`[LUZ: ${lightDetails.join(' | ')}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
    }

    // Sound design
    if (shot.sound_design) {
      const sound = shot.sound_design;
      const soundDetails: string[] = [];
      if (sound.room_tone) soundDetails.push(`Tono: ${sound.room_tone}`);
      if (sound.ambience) soundDetails.push(`Ambiente: ${sound.ambience}`);
      if (sound.foley) soundDetails.push(`Foley: ${sound.foley}`);
      
      if (soundDetails.length > 0) {
        writeWrapped(`[SONIDO: ${soundDetails.join(' | ')}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
    }

    // Edit intent
    if (shot.edit_intent) {
      const edit = shot.edit_intent;
      const editDetails: string[] = [];
      if (edit.expected_cut) editDetails.push(`Corte: ${edit.expected_cut}`);
      if (edit.hold_ms) editDetails.push(`Hold: ${edit.hold_ms}ms`);
      if (edit.rhythm_note) editDetails.push(edit.rhythm_note);
      
      if (editDetails.length > 0) {
        writeWrapped(`[EDICIÓN: ${editDetails.join(' | ')}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
      
      if (edit.viewer_notice) {
        writeWrapped(`[ATENCIÓN: ${edit.viewer_notice}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
    }

    // Keyframe hints
    if (shot.keyframe_hints) {
      const kf = shot.keyframe_hints;
      if (kf.start_frame || kf.end_frame) {
        const kfDetails = [`Inicio: ${kf.start_frame || 'auto'}`, `Fin: ${kf.end_frame || 'auto'}`];
        if (kf.mid_frames?.length) kfDetails.push(`Intermedios: ${kf.mid_frames.length}`);
        writeWrapped(`[KEYFRAMES: ${kfDetails.join(' | ')}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
    }

    // Continuity notes
    if (shot.continuity) {
      const cont = shot.continuity;
      const contDetails: string[] = [];
      if (cont.wardrobe_notes) contDetails.push(`Vestuario: ${cont.wardrobe_notes}`);
      if (cont.props_in_frame?.length) contDetails.push(`Props: ${cont.props_in_frame.join(', ')}`);
      if (cont.match_to_previous) contDetails.push(`Match: ${cont.match_to_previous}`);
      
      if (contDetails.length > 0) {
        writeWrapped(`[CONTINUIDAD: ${contDetails.join(' | ')}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 10 });
      }
    }

    // Shot dialogue
    if (shot.dialogue && Array.isArray(shot.dialogue) && shot.dialogue.length > 0) {
      for (const d of shot.dialogue) {
        if (d && d.character && d.line) {
          doc.setFont('Courier', 'bold');
          doc.setFontSize(11);
          writeLine(`${d.character.toUpperCase()}:`, MARGIN_LEFT + 30, { bold: true, fontSize: 11 });
          writeWrapped(`"${d.line}"`, MARGIN_LEFT + 40, TEXT_WIDTH - 60, { italic: true, fontSize: 11 });
        }
      }
    }

    currentY += LINE_HEIGHT / 2;
  };

  // ========== TITLE PAGE ==========
  // Center the title
  currentY = PAGE_HEIGHT / 3;
  doc.setFont('Courier', 'bold');
  doc.setFontSize(24);
  const title = screenplay.title.toUpperCase();
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (PAGE_WIDTH - titleWidth) / 2, currentY);
  currentY += LINE_HEIGHT * 3;

  // "Written by" or "by"
  doc.setFont('Courier', 'normal');
  doc.setFontSize(12);
  writeCentered('escrito por');
  currentY += LINE_HEIGHT;
  writeCentered('[Autor]');

  // Logline at bottom if exists
  if (screenplay.logline) {
    currentY = PAGE_HEIGHT - MARGIN_BOTTOM - LINE_HEIGHT * 6;
    doc.setFont('Courier', 'italic');
    doc.setFontSize(10);
    const loglineLines = doc.splitTextToSize(screenplay.logline, TEXT_WIDTH);
    for (const line of loglineLines) {
      doc.text(line, MARGIN_LEFT, currentY);
      currentY += LINE_HEIGHT;
    }
  }

  // ========== SCREENPLAY CONTENT ==========
  const episodes = screenplay.episodes || [{ title: screenplay.title, scenes: screenplay.scenes || [] }];
  const isSingleEpisode = options?.episodeOnly !== undefined;
  const episodesToExport = isSingleEpisode 
    ? [episodes[options.episodeOnly!]] 
    : episodes;

  for (const episode of episodesToExport) {
    if (!episode) continue;
    
    // Episode title page (for series)
    if (episodes.length > 1 || isSingleEpisode) {
      addPage();
      currentY = PAGE_HEIGHT / 3;
      doc.setFont('Courier', 'bold');
      doc.setFontSize(18);
      const epTitle = episode.title || `EPISODIO ${episode.episode_number || 1}`;
      writeCentered(epTitle.toUpperCase(), { bold: true });
      
      if (episode.synopsis) {
        currentY += LINE_HEIGHT * 2;
        doc.setFont('Courier', 'italic');
        doc.setFontSize(10);
        const synLines = doc.splitTextToSize(episode.synopsis, TEXT_WIDTH - 60);
        for (const line of synLines) {
          writeCentered(line, { italic: true });
        }
      }
    }

    addPage();
    writeTransition('FADE IN:');

    // Scenes
    const scenesArray = episode.scenes || [];
    
    if (scenesArray.length === 0) {
      // No scenes - write placeholder
      writeAction('(Episodio sin secuencias generadas - regenere el contenido)');
    }
    
    for (const scene of scenesArray) {
      // Slugline
      writeSlugline(scene.slugline || 'INT. LOCALIZACIÓN - DÍA', scene.scene_number);

      // Scene metadata (pacing, conflict, objective)
      if (includeProduction && (scene.pacing || scene.conflict || scene.scene_objective)) {
        const metadata: string[] = [];
        if (scene.pacing) metadata.push(`Ritmo: ${scene.pacing}`);
        if (scene.conflict) metadata.push(`Conflicto: ${scene.conflict}`);
        if (scene.scene_objective) metadata.push(`Objetivo: ${scene.scene_objective}`);
        
        if (metadata.length > 0) {
          writeWrapped(`[${metadata.join(' | ')}]`, MARGIN_LEFT, TEXT_WIDTH, { italic: true, fontSize: 10 });
          currentY += LINE_HEIGHT / 2;
        }
      }

      // If scene has production shots, write them with full details
      if (includeProduction && scene.shots && Array.isArray(scene.shots) && scene.shots.length > 0) {
        currentY += LINE_HEIGHT / 2;
        writeLine('DESGLOSE DE PLANOS:', MARGIN_LEFT, { bold: true, uppercase: true, fontSize: 11 });
        currentY += LINE_HEIGHT / 2;
        
        let runningTime = 0;
        for (let shotIdx = 0; shotIdx < scene.shots.length; shotIdx++) {
          const shot = scene.shots[shotIdx];
          runningTime += shot.duration_sec || 0;
          writeProductionShot(shot, shotIdx, runningTime);
        }
        
        // Total scene duration
        currentY += LINE_HEIGHT / 2;
        writeLine(`DURACIÓN SECUENCIA: ${runningTime}s`, MARGIN_LEFT, { bold: true, fontSize: 10 });
      } else {
        // Fallback: standard screenplay format (action + dialogue)
        const actionText = scene.action || scene.description || scene.summary || '';
        if (actionText) {
          writeAction(actionText);
        }

        // Dialogue
        if (scene.dialogue && Array.isArray(scene.dialogue) && scene.dialogue.length > 0) {
          for (const d of scene.dialogue) {
            if (d && d.character && d.line) {
              writeDialogue(d);
            }
          }
        }
      }

      // Technical cues as action
      if (scene.music_cue || scene.sfx_cue) {
        const cues: string[] = [];
        if (scene.music_cue) cues.push(`[MÚSICA: ${scene.music_cue}]`);
        if (scene.sfx_cue) cues.push(`[SFX: ${scene.sfx_cue}]`);
        currentY += LINE_HEIGHT / 2;
        writeAction(cues.join(' '));
      }
    }

    writeTransition('FADE OUT.');
  }

  // ========== CASTING REPORT (Extended Extraction Data) ==========
  if (includeCasting && screenplay.parsedJson) {
    const payload = getBreakdownPayload(screenplay.parsedJson) ?? screenplay.parsedJson;
    const chars = hydrateCharacters(payload);
    const locs = hydrateLocations(payload);
    const scenes = hydrateScenes(payload);
    
    if (chars.length > 0) {
      addPage();
      
      // Title
      currentY = MARGIN_TOP + 20;
      doc.setFont('Courier', 'bold');
      doc.setFontSize(16);
      writeCentered('CASTING REPORT', { bold: true, uppercase: true });
      currentY += LINE_HEIGHT;
      
      // Summary stats
      const totalDialogueLines = chars.reduce((sum: number, c: any) => sum + getDialogueLines(c), 0);
      doc.setFont('Courier', 'normal');
      doc.setFontSize(11);
      writeLine(`Total Personajes: ${chars.length} | Secuencias: ${scenes.length} | Localizaciones: ${locs.length} | Líneas de Diálogo: ${totalDialogueLines}`, MARGIN_LEFT, { fontSize: 11 });
      currentY += LINE_HEIGHT;
      
      // Separator
      doc.setDrawColor(150);
      doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY);
      currentY += LINE_HEIGHT * 1.5;
      
      // Table header
      doc.setFont('Courier', 'bold');
      doc.setFontSize(10);
      const colWidths = { rank: 30, name: 120, role: 100, lines: 50, scenes: 50, conf: 80 };
      let xPos = MARGIN_LEFT;
      doc.text('#', xPos, currentY);
      xPos += colWidths.rank;
      doc.text('PERSONAJE', xPos, currentY);
      xPos += colWidths.name;
      doc.text('ROL', xPos, currentY);
      xPos += colWidths.role;
      doc.text('LÍNEAS', xPos, currentY);
      xPos += colWidths.lines;
      doc.text('SECUENCIAS', xPos, currentY);
      xPos += colWidths.scenes;
      doc.text('CONFIANZA', xPos, currentY);
      currentY += LINE_HEIGHT;
      
      // Separator
      doc.line(MARGIN_LEFT, currentY - 4, PAGE_WIDTH - MARGIN_RIGHT, currentY - 4);
      currentY += 4;
      
      // Build and sort rows
      const rows = chars.map((c: any) => ({
        name: getName(c),
        role: getRole(c),
        lines: getDialogueLines(c),
        scenes: getScenesCount(c),
        confidence: getConfidenceLevel(c),
      }));
      rows.sort((a: any, b: any) => (b.lines - a.lines) || a.name.localeCompare(b.name));
      
      // Print rows
      doc.setFont('Courier', 'normal');
      rows.forEach((row: any, idx: number) => {
        checkPageBreak(2);
        xPos = MARGIN_LEFT;
        doc.text(String(idx + 1), xPos, currentY);
        xPos += colWidths.rank;
        doc.text(row.name.substring(0, 18), xPos, currentY);
        xPos += colWidths.name;
        doc.text((ROLE_LABELS[row.role] || row.role).substring(0, 14), xPos, currentY);
        xPos += colWidths.role;
        doc.text(String(row.lines), xPos, currentY);
        xPos += colWidths.lines;
        doc.text(String(row.scenes), xPos, currentY);
        xPos += colWidths.scenes;
        const confLabel = row.confidence === 'high' ? 'ALTA' : row.confidence === 'medium' ? 'MEDIA' : 'BAJA';
        doc.text(confLabel, xPos, currentY);
        currentY += LINE_HEIGHT;
      });
      
      // Locations section
      if (locs.length > 0) {
        currentY += LINE_HEIGHT;
        checkPageBreak(4);
        doc.setFont('Courier', 'bold');
        doc.setFontSize(14);
        writeLine('LOCALIZACIONES', MARGIN_LEFT, { bold: true, uppercase: true, fontSize: 14 });
        currentY += LINE_HEIGHT / 2;
        
        doc.setFont('Courier', 'normal');
        doc.setFontSize(10);
        locs.forEach((loc: any, idx: number) => {
          checkPageBreak(2);
          const locName = loc.name || loc.location || 'UBICACIÓN';
          const locType = loc.type || loc.int_ext || '';
          const locDesc = loc.description || loc.traits || '';
          writeLine(`${idx + 1}. ${locName.toUpperCase()}${locType ? ` (${locType})` : ''}`, MARGIN_LEFT, { fontSize: 10 });
          if (locDesc) {
            writeWrapped(locDesc, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true, fontSize: 9 });
          }
        });
      }
    }
  }

  // ========== PAGE NUMBERS ==========
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('Courier', 'normal');
    doc.setFontSize(10);
    doc.text(`${i - 1}.`, PAGE_WIDTH - MARGIN_RIGHT, MARGIN_TOP / 2, { align: 'right' });
  }

  // Save
  const filename = isSingleEpisode 
    ? `${screenplay.title.replace(/\s+/g, '_')}_EP${options?.episodeOnly! + 1}.pdf`
    : `${screenplay.title.replace(/\s+/g, '_')}_GUION_COMPLETO.pdf`;
  
  doc.save(filename);
  return filename;
}

// Export for a single episode
export function exportEpisodeScreenplayPDF(screenplay: ScreenplayData, episodeIndex: number) {
  return exportScreenplayPDF(screenplay, { episodeOnly: episodeIndex });
}

// Export production version with full shot details
export function exportProductionScreenplayPDF(screenplay: ScreenplayData, episodeIndex?: number) {
  return exportScreenplayPDF(screenplay, { 
    episodeOnly: episodeIndex, 
    includeProductionDetails: true 
  });
}

// ========== TEASER PDF EXPORT ==========

interface TeaserScene {
  shot_type: string;
  duration_sec: number;
  description: string;
  character?: string;
  dialogue_snippet?: string;
  visual_hook: string;
  sound_design: string;
}

interface Teaser {
  duration_sec: number;
  title: string;
  logline: string;
  scenes: TeaserScene[];
  music_cue: string;
  voiceover_text?: string;
}

interface TeaserData {
  teaser60?: Teaser;
  teaser30?: Teaser;
}

export function exportTeaserPDF(
  projectTitle: string, 
  teasers: TeaserData, 
  options?: { teaserType?: '60' | '30' | 'both' }
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter'
  });

  let currentY = MARGIN_TOP;
  let pageNumber = 1;

  const addPage = () => {
    doc.addPage();
    pageNumber++;
    currentY = MARGIN_TOP;
  };

  const checkPageBreak = (linesNeeded: number = 1) => {
    const spaceNeeded = linesNeeded * LINE_HEIGHT;
    if (currentY + spaceNeeded > PAGE_HEIGHT - MARGIN_BOTTOM) {
      addPage();
      return true;
    }
    return false;
  };

  const writeLine = (text: string, x: number, options?: { bold?: boolean; italic?: boolean; uppercase?: boolean }) => {
    const style = options?.bold ? 'bold' : options?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(12);
    const displayText = options?.uppercase ? text.toUpperCase() : text;
    doc.text(displayText, x, currentY);
    currentY += LINE_HEIGHT;
  };

  const writeWrapped = (text: string, x: number, maxWidth: number, options?: { bold?: boolean; italic?: boolean }) => {
    const style = options?.bold ? 'bold' : options?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      checkPageBreak();
      doc.text(line, x, currentY);
      currentY += LINE_HEIGHT;
    }
  };

  const writeCentered = (text: string, options?: { bold?: boolean; italic?: boolean; uppercase?: boolean; fontSize?: number }) => {
    const style = options?.bold ? 'bold' : options?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(options?.fontSize || 12);
    const displayText = options?.uppercase ? text.toUpperCase() : text;
    const textWidth = doc.getTextWidth(displayText);
    const x = (PAGE_WIDTH - textWidth) / 2;
    doc.text(displayText, x, currentY);
    currentY += (options?.fontSize || 12);
  };

  const writeTeaser = (teaser: Teaser, isFirst: boolean = true) => {
    if (!isFirst) addPage();
    
    // Title
    currentY = MARGIN_TOP + 60;
    doc.setFont('Courier', 'bold');
    doc.setFontSize(18);
    writeCentered(`TEASER ${teaser.duration_sec}s`, { bold: true, uppercase: true, fontSize: 18 });
    currentY += LINE_HEIGHT;
    
    doc.setFontSize(14);
    writeCentered(teaser.title.toUpperCase(), { bold: true, fontSize: 14 });
    currentY += LINE_HEIGHT * 2;
    
    // Logline
    doc.setFont('Courier', 'italic');
    doc.setFontSize(11);
    const loglineLines = doc.splitTextToSize(`"${teaser.logline}"`, TEXT_WIDTH - 40);
    for (const line of loglineLines) {
      writeCentered(line, { italic: true });
    }
    currentY += LINE_HEIGHT * 2;

    // Music Cue
    doc.setFont('Courier', 'bold');
    doc.setFontSize(12);
    writeLine('MÚSICA:', MARGIN_LEFT, { bold: true });
    writeWrapped(teaser.music_cue, MARGIN_LEFT + 20, TEXT_WIDTH - 20);
    currentY += LINE_HEIGHT;

    // Voice Over
    if (teaser.voiceover_text) {
      writeLine('VOICE OVER:', MARGIN_LEFT, { bold: true });
      writeWrapped(`"${teaser.voiceover_text}"`, MARGIN_LEFT + 20, TEXT_WIDTH - 20, { italic: true });
      currentY += LINE_HEIGHT;
    }

    // Separator
    currentY += LINE_HEIGHT;
    doc.setDrawColor(150);
    doc.line(MARGIN_LEFT, currentY, PAGE_WIDTH - MARGIN_RIGHT, currentY);
    currentY += LINE_HEIGHT * 2;

    // Shot List Header
    writeLine('SECUENCIA DE PLANOS', MARGIN_LEFT, { bold: true, uppercase: true });
    currentY += LINE_HEIGHT;

    // Shots
    let runningTime = 0;
    teaser.scenes.forEach((shot, idx) => {
      checkPageBreak(6);
      
      runningTime += shot.duration_sec;
      
      // Shot header
      doc.setFont('Courier', 'bold');
      doc.setFontSize(11);
      const shotHeader = `${String(idx + 1).padStart(2, '0')}. ${shot.shot_type.toUpperCase()} — ${shot.duration_sec}s (TC: ${Math.floor(runningTime / 60)}:${String(runningTime % 60).padStart(2, '0')})`;
      writeLine(shotHeader, MARGIN_LEFT, { bold: true });
      
      // Description
      doc.setFont('Courier', 'normal');
      doc.setFontSize(11);
      writeWrapped(shot.description, MARGIN_LEFT + 20, TEXT_WIDTH - 40);
      
      // Visual Hook
      if (shot.visual_hook) {
        doc.setFont('Courier', 'italic');
        writeWrapped(`[VISUAL: ${shot.visual_hook}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true });
      }
      
      // Sound Design
      if (shot.sound_design) {
        writeWrapped(`[SONIDO: ${shot.sound_design}]`, MARGIN_LEFT + 20, TEXT_WIDTH - 40, { italic: true });
      }
      
      // Dialogue
      if (shot.dialogue_snippet) {
        doc.setFont('Courier', 'normal');
        const charName = shot.character?.toUpperCase() || 'PERSONAJE';
        writeLine(`${charName}:`, MARGIN_LEFT + 40);
        writeWrapped(`"${shot.dialogue_snippet}"`, MARGIN_LEFT + 60, TEXT_WIDTH - 80, { italic: true });
      }
      
      currentY += LINE_HEIGHT;
    });

    // Total Duration
    currentY += LINE_HEIGHT;
    doc.setFont('Courier', 'bold');
    writeLine(`DURACIÓN TOTAL: ${teaser.duration_sec} segundos`, MARGIN_LEFT, { bold: true });
  };

  // ========== TITLE PAGE ==========
  currentY = PAGE_HEIGHT / 3;
  doc.setFont('Courier', 'bold');
  doc.setFontSize(24);
  const title = projectTitle.toUpperCase();
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (PAGE_WIDTH - titleWidth) / 2, currentY);
  currentY += LINE_HEIGHT * 2;

  doc.setFontSize(16);
  writeCentered('TEASERS PROMOCIONALES', { bold: true, fontSize: 16 });
  currentY += LINE_HEIGHT * 3;

  doc.setFont('Courier', 'normal');
  doc.setFontSize(12);
  const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  writeCentered(date);

  // ========== TEASER CONTENT ==========
  const exportType = options?.teaserType || 'both';
  let isFirst = true;

  if ((exportType === '60' || exportType === 'both') && teasers.teaser60) {
    addPage();
    writeTeaser(teasers.teaser60, isFirst);
    isFirst = false;
  }

  if ((exportType === '30' || exportType === 'both') && teasers.teaser30) {
    writeTeaser(teasers.teaser30, isFirst);
  }

  // ========== PAGE NUMBERS ==========
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('Courier', 'normal');
    doc.setFontSize(10);
    doc.text(`${i - 1}.`, PAGE_WIDTH - MARGIN_RIGHT, MARGIN_TOP / 2, { align: 'right' });
  }

  // Save
  const suffix = exportType === 'both' ? 'TEASERS' : `TEASER_${exportType}s`;
  const filename = `${projectTitle.replace(/\s+/g, '_')}_${suffix}.pdf`;
  doc.save(filename);
  return filename;
}
