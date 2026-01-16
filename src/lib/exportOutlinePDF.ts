import jsPDF from 'jspdf';

/**
 * Professional Outline PDF Export V2
 * Creates a comprehensive, commercial-grade cinematic production document with:
 * - Cover page with title treatment
 * - Logline and extended synopsis
 * - Full act structure with turning points and detailed beats
 * - Complete character roster with wants/needs/flaws/arcs
 * - Location bible
 * - Factions and power dynamics
 * - Entity operative rules (can/cannot do)
 * - Subplot and narrative arc summary
 * - Teaser/trailer breakdown
 */

// =================== INTERFACES ===================

interface BeatData {
  beat_number: number;
  event: string;
  agent?: string;
  consequence?: string;
  situation_detail?: {
    physical_context?: string;
    action?: string;
    goal?: string;
    obstacle?: string;
    state_change?: string;
  };
}

interface ActData {
  act_number: number;
  title: string;
  goal?: string;
  summary?: string;
  break_point?: string;
  inciting_incident?: string;
  midpoint?: string;
  all_is_lost?: string;
  climax?: string;
  beats?: BeatData[];
}

interface EpisodeData {
  episode_number: number;
  title: string;
  synopsis?: string;
  scenes?: any[];
  duration_min?: number;
}

interface TeaserData {
  title?: string;
  logline?: string;
  scenes?: any[];
  music_cue?: string;
  voiceover_text?: string;
}

interface CharacterData {
  name: string;
  role?: string;
  role_detail?: string;
  entity_type?: string;
  description?: string;
  priority?: string;
  first_appearance?: string;
  arc?: string;
  want?: string;
  need?: string;
  flaw?: string;
  decision_key?: string;
  arc_start?: string;
  arc_end?: string;
}

interface LocationData {
  name: string;
  type?: string;
  scale?: string;
  description?: string;
  visual_identity?: string;
  function?: string;
  narrative_role?: string;
}

interface FactionData {
  name: string;
  leader?: string;
  objective?: string;
  method?: string;
  red_line?: string;
}

interface EntityRuleData {
  entity: string;
  can_do?: string[];
  cannot_do?: string[];
  cost?: string;
  dramatic_purpose?: string;
}

interface SubplotData {
  name: string;
  description?: string;
  characters_involved?: string[];
  type?: string;
}

interface PlotTwistData {
  name: string;
  description?: string;
  impact?: 'minor' | 'major' | 'paradigm_shift';
  act?: number;
}

export interface OutlineData {
  title: string;
  logline?: string;
  synopsis?: string;
  genre?: string;
  tone?: string;
  format?: 'film' | 'series' | 'short' | string;
  targetAudience?: string;
  estimatedDuration?: number;
  // For film: structured acts with beats and turning points
  acts?: ActData[];
  // For series: episodes
  episodes?: EpisodeData[];
  teasers?: {
    teaser60?: TeaserData;
    teaser30?: TeaserData;
  };
  characters?: CharacterData[];
  locations?: LocationData[];
  props?: any[];
  // New fields for comprehensive export
  factions?: FactionData[];
  entity_rules?: EntityRuleData[];
  subplots?: SubplotData[];
  plot_twists?: PlotTwistData[];
  themes?: string[];
  visualStyle?: string;
  thematic_thread?: string;
  counts?: {
    total_scenes?: number;
    total_dialogue_lines?: number;
  };
}

// Color palette - cinematic gold/dark theme
const COLORS = {
  gold: [212, 175, 55] as [number, number, number],
  darkGray: [35, 35, 40] as [number, number, number],
  lightGray: [180, 180, 185] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  cream: [250, 248, 240] as [number, number, number],
  accent: [180, 140, 60] as [number, number, number],
  green: [60, 140, 80] as [number, number, number],
  red: [180, 60, 60] as [number, number, number],
};

const ROLE_LABELS: Record<string, string> = {
  protagonist: 'PROTAGONISTA',
  antagonist: 'ANTAGONISTA',
  supporting: 'SECUNDARIO',
  recurring: 'RECURRENTE',
  cameo: 'CAMEO',
  extra_with_lines: 'EXTRA',
  collective_entity: 'COLECTIVO',
};

const ROLE_ORDER = ['protagonist', 'antagonist', 'supporting', 'recurring', 'cameo', 'extra_with_lines', 'collective_entity'];

export function exportOutlinePDF(data: OutlineData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 50;
  const marginRight = 50;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 0;

  const formatLabel = data.format === 'film' ? 'LARGOMETRAJE' : 
                      data.format === 'short' ? 'CORTOMETRAJE' : 'SERIE';

  // Helper functions
  const setColor = (color: [number, number, number]) => {
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const drawLine = (yPos: number, color: [number, number, number] = COLORS.gold) => {
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  };

  const checkPageBreak = (neededSpace: number = 80) => {
    if (y + neededSpace > pageHeight - 60) {
      doc.addPage();
      y = 60;
      // Add subtle header on continuation pages
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setColor(COLORS.lightGray);
      doc.text(data.title.toUpperCase(), pageWidth - marginRight, 30, { align: 'right' });
      drawLine(40, COLORS.lightGray);
      y = 60;
    }
  };

  // =================== COVER PAGE ===================
  doc.setDrawColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setLineWidth(2);
  doc.rect(30, 30, pageWidth - 60, pageHeight - 60);
  
  doc.setLineWidth(0.5);
  doc.rect(35, 35, pageWidth - 70, pageHeight - 70);

  // Format badge at top
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setColor(COLORS.gold);
  doc.text(formatLabel, pageWidth / 2, 80, { align: 'center' });

  drawLine(95);

  // Main title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  setColor(COLORS.darkGray);
  
  const titleLines = doc.splitTextToSize(data.title.toUpperCase(), contentWidth - 40);
  const titleY = 180;
  doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' });

  const subtitleY = titleY + (titleLines.length * 40) + 20;
  drawLine(subtitleY);

  // Logline
  if (data.logline) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(14);
    setColor(COLORS.darkGray);
    const loglineLines = doc.splitTextToSize(`"${data.logline}"`, contentWidth - 60);
    doc.text(loglineLines, pageWidth / 2, subtitleY + 40, { align: 'center' });
  }

  // Stats section
  const statsY = pageHeight - 200;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  setColor(COLORS.lightGray);

  const stats: string[] = [];
  if (data.acts?.length) {
    stats.push(`${data.acts.length} ACTOS`);
  } else if (data.episodes?.length) {
    stats.push(`${data.episodes.length} EPISODIOS`);
  }
  const totalBeats = data.acts?.reduce((sum, act) => sum + (act.beats?.length || 0), 0) || 0;
  if (totalBeats > 0) {
    stats.push(`${totalBeats} BEATS`);
  }
  if (data.counts?.total_scenes) {
    stats.push(`${data.counts.total_scenes} ESCENAS`);
  }
  if (data.characters?.length) {
    stats.push(`${data.characters.length} PERSONAJES`);
  }
  if (data.locations?.length) {
    stats.push(`${data.locations.length} LOCALIZACIONES`);
  }
  if (data.factions?.length) {
    stats.push(`${data.factions.length} FACCIONES`);
  }
  if (data.estimatedDuration) {
    stats.push(`~${data.estimatedDuration} MIN`);
  }

  if (stats.length > 0) {
    drawLine(statsY - 20, COLORS.lightGray);
    doc.text(stats.join('  •  '), pageWidth / 2, statsY, { align: 'center' });
  }

  // Genre/Tone
  if (data.genre || data.tone) {
    doc.setFontSize(10);
    const genreTone = [data.genre, data.tone].filter(Boolean).join(' / ');
    doc.text(genreTone.toUpperCase(), pageWidth / 2, statsY + 25, { align: 'center' });
  }

  // Footer
  doc.setFontSize(9);
  setColor(COLORS.lightGray);
  doc.text('OUTLINE DE PRODUCCIÓN', pageWidth / 2, pageHeight - 80, { align: 'center' });
  doc.text(`LC Studio — ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })}`, pageWidth / 2, pageHeight - 65, { align: 'center' });

  // =================== SYNOPSIS PAGE ===================
  doc.addPage();
  y = 60;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setColor(COLORS.gold);
  doc.text('SINOPSIS', marginLeft, y);
  drawLine(y + 8);
  y += 35;

  if (data.synopsis) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    setColor(COLORS.darkGray);
    const synopsisLines = doc.splitTextToSize(data.synopsis, contentWidth);
    doc.text(synopsisLines, marginLeft, y);
    y += synopsisLines.length * 14 + 30;
  }

  // Themes
  if (data.themes?.length) {
    checkPageBreak(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(COLORS.gold);
    doc.text('TEMAS PRINCIPALES', marginLeft, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setColor(COLORS.darkGray);
    doc.text(data.themes.join('  •  '), marginLeft, y);
    y += 30;
  }

  // Thematic Thread
  if (data.thematic_thread) {
    checkPageBreak(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(COLORS.gold);
    doc.text('HILO TEMÁTICO', marginLeft, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setColor(COLORS.darkGray);
    const threadLines = doc.splitTextToSize(data.thematic_thread, contentWidth);
    doc.text(threadLines, marginLeft, y);
    y += threadLines.length * 12 + 30;
  }

  // Visual style
  if (data.visualStyle) {
    checkPageBreak(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setColor(COLORS.gold);
    doc.text('ESTILO VISUAL', marginLeft, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setColor(COLORS.darkGray);
    const styleLines = doc.splitTextToSize(data.visualStyle, contentWidth);
    doc.text(styleLines, marginLeft, y);
    y += styleLines.length * 12 + 30;
  }

  // =================== ACT STRUCTURE (for film) ===================
  if (data.acts?.length) {
    doc.addPage();
    y = 60;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text('ESTRUCTURA NARRATIVA — LARGOMETRAJE', marginLeft, y);
    drawLine(y + 8);
    y += 40;

    for (const act of data.acts) {
      checkPageBreak(120);

      // Act header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      setColor(COLORS.darkGray);
      const actLabel = act.act_number === 1 ? 'ACTO I — PLANTEAMIENTO' :
                      act.act_number === 2 ? 'ACTO II — CONFRONTACIÓN' :
                      'ACTO III — RESOLUCIÓN';
      doc.text(actLabel, marginLeft, y);
      y += 20;

      // Goal
      if (act.goal) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(COLORS.accent);
        doc.text('Objetivo:', marginLeft + 10, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const goalLines = doc.splitTextToSize(act.goal, contentWidth - 80);
        doc.text(goalLines, marginLeft + 70, y);
        y += goalLines.length * 12 + 8;
      }

      // Turning points based on act
      const turningPoints: { label: string; value?: string }[] = [];
      if (act.act_number === 1) {
        if (act.inciting_incident) turningPoints.push({ label: 'Detonante', value: act.inciting_incident });
        if (act.break_point) turningPoints.push({ label: 'Quiebre hacia Acto II', value: act.break_point });
      } else if (act.act_number === 2) {
        if (act.midpoint) turningPoints.push({ label: 'Midpoint', value: act.midpoint });
        if (act.all_is_lost) turningPoints.push({ label: 'All is Lost', value: act.all_is_lost });
        if (act.break_point) turningPoints.push({ label: 'Quiebre hacia Acto III', value: act.break_point });
      } else if (act.act_number === 3) {
        if (act.climax) turningPoints.push({ label: 'Clímax', value: act.climax });
      }

      for (const tp of turningPoints) {
        if (!tp.value) continue;
        checkPageBreak(40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(COLORS.accent);
        doc.text(`${tp.label}:`, marginLeft + 10, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const tpLines = doc.splitTextToSize(tp.value, contentWidth - 100);
        doc.text(tpLines, marginLeft + 100, y);
        y += tpLines.length * 12 + 8;
      }

      // Beats
      if (act.beats?.length) {
        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(COLORS.gold);
        doc.text('BEATS:', marginLeft + 10, y);
        y += 18;

        for (const beat of act.beats) {
          checkPageBreak(80);
          
          // Beat header
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          setColor(COLORS.darkGray);
          const beatLabel = `Beat ${beat.beat_number}:`;
          doc.text(beatLabel, marginLeft + 15, y);
          
          // Event
          doc.setFont('helvetica', 'normal');
          const eventLines = doc.splitTextToSize(beat.event || '', contentWidth - 80);
          doc.text(eventLines, marginLeft + 70, y);
          y += eventLines.length * 12 + 5;

          // Situation detail
          if (beat.situation_detail) {
            const sd = beat.situation_detail;
            const details: { icon: string; label: string; value: string }[] = [];
            
            if (sd.physical_context) details.push({ icon: '•', label: 'Contexto', value: sd.physical_context });
            if (sd.action) details.push({ icon: '•', label: 'Acción', value: sd.action });
            if (sd.goal) details.push({ icon: '•', label: 'Meta', value: sd.goal });
            if (sd.obstacle) details.push({ icon: '•', label: 'Obstáculo', value: sd.obstacle });
            if (sd.state_change) details.push({ icon: '→', label: 'Cambio', value: sd.state_change });

            for (const detail of details) {
              checkPageBreak(30);
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(9);
              setColor(COLORS.lightGray);
              doc.text(`    ${detail.icon} ${detail.label}:`, marginLeft + 20, y);
              doc.setFont('helvetica', 'normal');
              setColor(COLORS.darkGray);
              const detailLines = doc.splitTextToSize(detail.value, contentWidth - 130);
              doc.text(detailLines, marginLeft + 100, y);
              y += detailLines.length * 11 + 3;
            }
          }

          // Agent and consequence
          if (beat.agent || beat.consequence) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            setColor(COLORS.lightGray);
            if (beat.agent) {
              doc.text(`    Agente: ${beat.agent}`, marginLeft + 20, y);
              y += 12;
            }
            if (beat.consequence) {
              const consLines = doc.splitTextToSize(`    → ${beat.consequence}`, contentWidth - 40);
              doc.text(consLines, marginLeft + 20, y);
              y += consLines.length * 11;
            }
          }

          y += 12;
        }
      }

      y += 20;
    }
  }

  // =================== EPISODES (for series) ===================
  if (!data.acts?.length && data.episodes?.length) {
    checkPageBreak(100);
    y += 20;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text(`ESTRUCTURA — ${data.episodes.length} EPISODIOS`, marginLeft, y);
    drawLine(y + 8);
    y += 40;

    for (const ep of data.episodes) {
      checkPageBreak(80);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setColor(COLORS.darkGray);
      
      const epNum = `EP ${String(ep.episode_number).padStart(2, '0')}`;
      doc.text(epNum, marginLeft, y);
      
      if (ep.title) {
        doc.setFont('helvetica', 'bold');
        setColor(COLORS.gold);
        doc.text(`  —  ${ep.title.toUpperCase()}`, marginLeft + doc.getTextWidth(epNum), y);
      }

      if (ep.duration_min) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setColor(COLORS.lightGray);
        doc.text(`~${ep.duration_min} min`, pageWidth - marginRight, y, { align: 'right' });
      }
      y += 18;

      if (ep.synopsis) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        const synLines = doc.splitTextToSize(ep.synopsis, contentWidth - 20);
        doc.text(synLines, marginLeft + 15, y);
        y += synLines.length * 12 + 5;
      }

      if (ep.scenes?.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        setColor(COLORS.lightGray);
        doc.text(`${ep.scenes.length} escenas`, marginLeft + 15, y);
        y += 12;
      }

      y += 15;
    }
  }

  // =================== CHARACTERS ===================
  if (data.characters?.length) {
    doc.addPage();
    y = 60;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text(`PERSONAJES — ${data.characters.length}`, marginLeft, y);
    drawLine(y + 8);
    y += 40;

    // Group characters by role
    const grouped: Record<string, CharacterData[]> = {};
    data.characters.forEach(char => {
      const role = char.role || 'supporting';
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push(char);
    });

    for (const role of ROLE_ORDER) {
      if (!grouped[role] || grouped[role].length === 0) continue;

      checkPageBreak(60);
      
      // Role header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      setColor(COLORS.accent);
      doc.text(ROLE_LABELS[role] || role.toUpperCase(), marginLeft, y);
      y += 18;

      for (const char of grouped[role]) {
        checkPageBreak(100);
        
        // Character name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setColor(COLORS.darkGray);
        doc.text(char.name.toUpperCase(), marginLeft + 10, y);
        
        if (char.role_detail) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          setColor(COLORS.lightGray);
          doc.text(`  —  ${char.role_detail}`, marginLeft + 10 + doc.getTextWidth(char.name.toUpperCase()), y);
        }
        y += 18;

        // Want
        if (char.want) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          setColor(COLORS.gold);
          doc.text('Quiere:', marginLeft + 15, y);
          doc.setFont('helvetica', 'normal');
          setColor(COLORS.darkGray);
          const wantLines = doc.splitTextToSize(char.want, contentWidth - 80);
          doc.text(wantLines, marginLeft + 60, y);
          y += wantLines.length * 11 + 4;
        }

        // Need
        if (char.need) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          setColor(COLORS.gold);
          doc.text('Necesita:', marginLeft + 15, y);
          doc.setFont('helvetica', 'normal');
          setColor(COLORS.darkGray);
          const needLines = doc.splitTextToSize(char.need, contentWidth - 80);
          doc.text(needLines, marginLeft + 70, y);
          y += needLines.length * 11 + 4;
        }

        // Flaw
        if (char.flaw) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          setColor(COLORS.gold);
          doc.text('Defecto:', marginLeft + 15, y);
          doc.setFont('helvetica', 'normal');
          setColor(COLORS.darkGray);
          const flawLines = doc.splitTextToSize(char.flaw, contentWidth - 80);
          doc.text(flawLines, marginLeft + 65, y);
          y += flawLines.length * 11 + 4;
        }

        // Decision key
        if (char.decision_key) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          setColor(COLORS.gold);
          doc.text('Decisión clave:', marginLeft + 15, y);
          doc.setFont('helvetica', 'normal');
          setColor(COLORS.darkGray);
          const decLines = doc.splitTextToSize(char.decision_key, contentWidth - 100);
          doc.text(decLines, marginLeft + 95, y);
          y += decLines.length * 11 + 4;
        }

        // Arc (full description or start -> end)
        if (char.arc_start && char.arc_end) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          setColor(COLORS.gold);
          doc.text('Arco:', marginLeft + 15, y);
          doc.setFont('helvetica', 'italic');
          setColor(COLORS.darkGray);
          const arcText = `De "${char.arc_start}" a "${char.arc_end}"`;
          const arcLines = doc.splitTextToSize(arcText, contentWidth - 60);
          doc.text(arcLines, marginLeft + 50, y);
          y += arcLines.length * 11 + 4;
        } else if (char.arc) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          setColor(COLORS.gold);
          doc.text('Arco:', marginLeft + 15, y);
          doc.setFont('helvetica', 'italic');
          setColor(COLORS.darkGray);
          const arcLines = doc.splitTextToSize(char.arc, contentWidth - 60);
          doc.text(arcLines, marginLeft + 50, y);
          y += arcLines.length * 11 + 4;
        }

        // Description/bio as fallback
        if (char.description && !char.want && !char.need) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          setColor(COLORS.darkGray);
          const descLines = doc.splitTextToSize(char.description, contentWidth - 30);
          doc.text(descLines, marginLeft + 15, y);
          y += descLines.length * 12 + 5;
        }

        y += 12;
      }
      y += 10;
    }
  }

  // =================== LOCATIONS ===================
  if (data.locations?.length) {
    checkPageBreak(100);
    y += 30;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text(`LOCALIZACIONES — ${data.locations.length}`, marginLeft, y);
    drawLine(y + 8);
    y += 40;

    for (const loc of data.locations) {
      checkPageBreak(60);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setColor(COLORS.darkGray);
      doc.text(loc.name.toUpperCase(), marginLeft + 10, y);
      
      if (loc.type || loc.scale) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setColor(COLORS.lightGray);
        const typeScale = [loc.type, loc.scale].filter(Boolean).join(' — ');
        doc.text(`  (${typeScale})`, marginLeft + 10 + doc.getTextWidth(loc.name.toUpperCase()), y);
      }
      y += 15;

      // Visual identity
      if (loc.visual_identity) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.accent);
        doc.text('Visual:', marginLeft + 15, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const visLines = doc.splitTextToSize(loc.visual_identity, contentWidth - 70);
        doc.text(visLines, marginLeft + 55, y);
        y += visLines.length * 11 + 4;
      }

      // Function
      if (loc.function) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.accent);
        doc.text('Función:', marginLeft + 15, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const funcLines = doc.splitTextToSize(loc.function, contentWidth - 70);
        doc.text(funcLines, marginLeft + 60, y);
        y += funcLines.length * 11 + 4;
      }

      // Narrative role
      if (loc.narrative_role) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.accent);
        doc.text('Rol narrativo:', marginLeft + 15, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const roleLines = doc.splitTextToSize(loc.narrative_role, contentWidth - 90);
        doc.text(roleLines, marginLeft + 85, y);
        y += roleLines.length * 11 + 4;
      }

      // Description fallback
      if (loc.description && !loc.visual_identity && !loc.function) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        const descLines = doc.splitTextToSize(loc.description, contentWidth - 30);
        doc.text(descLines, marginLeft + 20, y);
        y += descLines.length * 12 + 5;
      }

      y += 10;
    }
  }

  // =================== FACTIONS ===================
  if (data.factions?.length) {
    doc.addPage();
    y = 60;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text(`FACCIONES — ${data.factions.length}`, marginLeft, y);
    drawLine(y + 8);
    y += 40;

    for (const faction of data.factions) {
      checkPageBreak(100);

      // Faction name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setColor(COLORS.darkGray);
      doc.text(faction.name.toUpperCase(), marginLeft + 10, y);
      
      if (faction.leader) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        setColor(COLORS.lightGray);
        doc.text(`  (Líder: ${faction.leader})`, marginLeft + 10 + doc.getTextWidth(faction.name.toUpperCase()), y);
      }
      y += 18;

      // Objective
      if (faction.objective) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.accent);
        doc.text('Objetivo:', marginLeft + 15, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const objLines = doc.splitTextToSize(faction.objective, contentWidth - 80);
        doc.text(objLines, marginLeft + 70, y);
        y += objLines.length * 11 + 4;
      }

      // Method
      if (faction.method) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.accent);
        doc.text('Método:', marginLeft + 15, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const methLines = doc.splitTextToSize(faction.method, contentWidth - 80);
        doc.text(methLines, marginLeft + 65, y);
        y += methLines.length * 11 + 4;
      }

      // Red line
      if (faction.red_line) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.red);
        doc.text('Línea roja:', marginLeft + 15, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const redLines = doc.splitTextToSize(faction.red_line, contentWidth - 80);
        doc.text(redLines, marginLeft + 75, y);
        y += redLines.length * 11 + 4;
      }

      y += 15;
    }
  }

  // =================== ENTITY RULES ===================
  if (data.entity_rules?.length) {
    checkPageBreak(120);
    y += 30;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text('REGLAS DEL MUNDO', marginLeft, y);
    drawLine(y + 8);
    y += 40;

    for (const rule of data.entity_rules) {
      checkPageBreak(120);

      // Entity name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setColor(COLORS.darkGray);
      doc.text(rule.entity.toUpperCase(), marginLeft + 10, y);
      y += 18;

      // Can do
      if (rule.can_do?.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.green);
        doc.text('✅ Puede:', marginLeft + 15, y);
        y += 14;
        
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        for (const item of rule.can_do) {
          checkPageBreak(20);
          const itemLines = doc.splitTextToSize(`• ${item}`, contentWidth - 40);
          doc.text(itemLines, marginLeft + 25, y);
          y += itemLines.length * 11 + 2;
        }
        y += 5;
      }

      // Cannot do
      if (rule.cannot_do?.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.red);
        doc.text('❌ No puede:', marginLeft + 15, y);
        y += 14;
        
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        for (const item of rule.cannot_do) {
          checkPageBreak(20);
          const itemLines = doc.splitTextToSize(`• ${item}`, contentWidth - 40);
          doc.text(itemLines, marginLeft + 25, y);
          y += itemLines.length * 11 + 2;
        }
        y += 5;
      }

      // Cost
      if (rule.cost) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.accent);
        doc.text('💰 Coste:', marginLeft + 15, y);
        doc.setFont('helvetica', 'normal');
        setColor(COLORS.darkGray);
        const costLines = doc.splitTextToSize(rule.cost, contentWidth - 80);
        doc.text(costLines, marginLeft + 70, y);
        y += costLines.length * 11 + 4;
      }

      // Dramatic purpose
      if (rule.dramatic_purpose) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(COLORS.accent);
        doc.text('🎭 Propósito dramático:', marginLeft + 15, y);
        y += 12;
        doc.setFont('helvetica', 'italic');
        setColor(COLORS.darkGray);
        const purposeLines = doc.splitTextToSize(rule.dramatic_purpose, contentWidth - 40);
        doc.text(purposeLines, marginLeft + 25, y);
        y += purposeLines.length * 11 + 4;
      }

      y += 15;
    }
  }

  // =================== SUBPLOTS & PLOT TWISTS ===================
  if (data.subplots?.length || data.plot_twists?.length) {
    doc.addPage();
    y = 60;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text('TRAMAS Y GIROS NARRATIVOS', marginLeft, y);
    drawLine(y + 8);
    y += 40;

    // Subplots
    if (data.subplots?.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setColor(COLORS.accent);
      doc.text('SUBTRAMAS', marginLeft, y);
      y += 20;

      for (const subplot of data.subplots) {
        checkPageBreak(50);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        doc.text(`• ${subplot.name}`, marginLeft + 10, y);
        y += 14;

        if (subplot.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          const descLines = doc.splitTextToSize(subplot.description, contentWidth - 30);
          doc.text(descLines, marginLeft + 20, y);
          y += descLines.length * 12 + 5;
        }

        if (subplot.characters_involved?.length) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          setColor(COLORS.lightGray);
          doc.text(`Personajes: ${subplot.characters_involved.join(', ')}`, marginLeft + 20, y);
          y += 14;
        }
      }
      y += 20;
    }

    // Plot Twists
    if (data.plot_twists?.length) {
      checkPageBreak(60);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setColor(COLORS.accent);
      doc.text('GIROS NARRATIVOS', marginLeft, y);
      y += 20;

      const impactLabels: Record<string, string> = {
        minor: '○ Menor',
        major: '◉ Mayor',
        paradigm_shift: '★ Cambio de paradigma',
      };

      for (const twist of data.plot_twists) {
        checkPageBreak(40);
        
        const impact = impactLabels[twist.impact || 'minor'] || '○ Menor';
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        doc.text(`${twist.name}`, marginLeft + 10, y);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setColor(COLORS.lightGray);
        doc.text(`  [${impact}]`, marginLeft + 10 + doc.getTextWidth(twist.name), y);
        y += 14;

        if (twist.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          setColor(COLORS.darkGray);
          const descLines = doc.splitTextToSize(twist.description, contentWidth - 30);
          doc.text(descLines, marginLeft + 20, y);
          y += descLines.length * 12 + 8;
        }
      }
    }
  }

  // =================== TEASERS ===================
  if (data.teasers?.teaser60 || data.teasers?.teaser30) {
    checkPageBreak(120);
    y += 30;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text('MATERIAL PROMOCIONAL', marginLeft, y);
    drawLine(y + 8);
    y += 40;

    const renderTeaser = (teaser: TeaserData, label: string) => {
      checkPageBreak(80);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setColor(COLORS.accent);
      doc.text(label, marginLeft, y);
      y += 18;

      if (teaser.logline) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        const logLines = doc.splitTextToSize(`"${teaser.logline}"`, contentWidth - 20);
        doc.text(logLines, marginLeft + 10, y);
        y += logLines.length * 12 + 10;
      }

      if (teaser.voiceover_text) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        doc.text('Voz en off:', marginLeft + 10, y);
        y += 14;
        const voLines = doc.splitTextToSize(teaser.voiceover_text, contentWidth - 30);
        doc.text(voLines, marginLeft + 20, y);
        y += voLines.length * 12 + 10;
      }

      if (teaser.music_cue) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        setColor(COLORS.lightGray);
        doc.text(`♪ ${teaser.music_cue}`, marginLeft + 10, y);
        y += 16;
      }

      y += 15;
    };

    if (data.teasers.teaser60) {
      renderTeaser(data.teasers.teaser60, 'TEASER 60"');
    }
    if (data.teasers.teaser30) {
      renderTeaser(data.teasers.teaser30, 'TEASER 30"');
    }
  }

  // =================== FINAL PAGE ===================
  doc.addPage();
  y = pageHeight / 2 - 60;

  doc.setDrawColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setLineWidth(1);
  doc.rect(30, 30, pageWidth - 60, pageHeight - 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setColor(COLORS.darkGray);
  doc.text(data.title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  
  y += 30;
  drawLine(y);
  y += 30;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  setColor(COLORS.lightGray);
  doc.text('OUTLINE DE PRODUCCIÓN', pageWidth / 2, y, { align: 'center' });
  
  y += 25;
  doc.setFontSize(10);
  doc.text('Documento confidencial', pageWidth / 2, y, { align: 'center' });
  
  y += 40;
  doc.setFontSize(9);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`, pageWidth / 2, y, { align: 'center' });
  
  y += 15;
  doc.text('LC Studio', pageWidth / 2, y, { align: 'center' });

  // Save
  const safeTitle = data.title.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_');
  const fileName = `${safeTitle}_Outline_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
