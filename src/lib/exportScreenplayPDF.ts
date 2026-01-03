import jsPDF from 'jspdf';

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

export function exportScreenplayPDF(screenplay: ScreenplayData, options?: { episodeOnly?: number }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter'
  });

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
  const writeLine = (text: string, x: number, options?: { bold?: boolean; italic?: boolean; uppercase?: boolean }) => {
    const style = options?.bold ? 'bold' : options?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(12);
    const displayText = options?.uppercase ? text.toUpperCase() : text;
    doc.text(displayText, x, currentY);
    currentY += LINE_HEIGHT;
  };

  // Helper: Write wrapped text
  const writeWrapped = (text: string, x: number, maxWidth: number, options?: { bold?: boolean; italic?: boolean; uppercase?: boolean }) => {
    const style = options?.bold ? 'bold' : options?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(12);
    const displayText = options?.uppercase ? text.toUpperCase() : text;
    const lines = doc.splitTextToSize(displayText, maxWidth);
    
    for (const line of lines) {
      checkPageBreak();
      doc.text(line, x, currentY);
      currentY += LINE_HEIGHT;
    }
  };

  // Helper: Write centered text
  const writeCentered = (text: string, options?: { bold?: boolean; italic?: boolean; uppercase?: boolean }) => {
    const style = options?.bold ? 'bold' : options?.italic ? 'italic' : 'normal';
    doc.setFont('Courier', style);
    doc.setFontSize(12);
    const displayText = options?.uppercase ? text.toUpperCase() : text;
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
      writeAction('(Episodio sin escenas generadas - regenere el contenido)');
    }
    
    for (const scene of scenesArray) {
      // Slugline
      writeSlugline(scene.slugline || 'INT. LOCALIZACIÓN - DÍA', scene.scene_number);

      // Action/Description - check multiple possible field names
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
    ? `${screenplay.title.replace(/\s+/g, '_')}_EP${options.episodeOnly! + 1}.pdf`
    : `${screenplay.title.replace(/\s+/g, '_')}_GUION_COMPLETO.pdf`;
  
  doc.save(filename);
  return filename;
}

// Export for a single episode
export function exportEpisodeScreenplayPDF(screenplay: ScreenplayData, episodeIndex: number) {
  return exportScreenplayPDF(screenplay, { episodeOnly: episodeIndex });
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
