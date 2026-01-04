import jsPDF from 'jspdf';

/**
 * Professional Outline PDF Export
 * Creates a commercial-grade, cinematic pitch document with:
 * - Cover page with title treatment
 * - Logline and synopsis
 * - Episode breakdown with scene counts
 * - Character roster with role hierarchy
 * - Location bible
 * - Subplot and narrative arc summary
 * - Teaser/trailer breakdown
 */

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
}

interface LocationData {
  name: string;
  type?: string;
  scale?: string;
  description?: string;
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

interface OutlineData {
  title: string;
  logline?: string;
  synopsis?: string;
  genre?: string;
  tone?: string;
  format?: 'film' | 'series' | 'short' | string;
  targetAudience?: string;
  estimatedDuration?: number;
  episodes?: EpisodeData[];
  teasers?: {
    teaser60?: TeaserData;
    teaser30?: TeaserData;
  };
  characters?: CharacterData[];
  locations?: LocationData[];
  props?: any[];
  subplots?: SubplotData[];
  plot_twists?: PlotTwistData[];
  themes?: string[];
  visualStyle?: string;
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
  const episodeLabel = data.format === 'film' ? 'ACTOS' : 
                       data.format === 'short' ? 'PARTES' : 'EPISODIOS';

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
  // Dark background simulation with border
  doc.setDrawColor(COLORS.gold[0], COLORS.gold[1], COLORS.gold[2]);
  doc.setLineWidth(2);
  doc.rect(30, 30, pageWidth - 60, pageHeight - 60);
  
  // Inner border
  doc.setLineWidth(0.5);
  doc.rect(35, 35, pageWidth - 70, pageHeight - 70);

  // Format badge at top
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setColor(COLORS.gold);
  doc.text(formatLabel, pageWidth / 2, 80, { align: 'center' });

  // Decorative line
  drawLine(95);

  // Main title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  setColor(COLORS.darkGray);
  
  const titleLines = doc.splitTextToSize(data.title.toUpperCase(), contentWidth - 40);
  const titleY = 180;
  doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' });

  // Subtitle line
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
  if (data.episodes?.length) {
    stats.push(`${data.episodes.length} ${episodeLabel}`);
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
  if (data.estimatedDuration) {
    stats.push(`~${data.estimatedDuration} MIN`);
  }

  if (stats.length > 0) {
    drawLine(statsY - 20, COLORS.lightGray);
    doc.text(stats.join('  •  '), pageWidth / 2, statsY, { align: 'center' });
  }

  // Genre/Tone if available
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

  // Themes if available
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

  // Visual style if available
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

  // =================== EPISODES BREAKDOWN ===================
  if (data.episodes?.length) {
    checkPageBreak(100);
    y += 20;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text(`ESTRUCTURA — ${data.episodes.length} ${episodeLabel}`, marginLeft, y);
    drawLine(y + 8);
    y += 40;

    for (let i = 0; i < data.episodes.length; i++) {
      const ep = data.episodes[i];
      checkPageBreak(80);

      // Episode header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setColor(COLORS.darkGray);
      
      const epNum = data.format === 'film' ? `ACTO ${ep.episode_number}` :
                    data.format === 'short' ? `PARTE ${ep.episode_number}` :
                    `EP ${String(ep.episode_number).padStart(2, '0')}`;
      
      doc.text(epNum, marginLeft, y);
      
      // Episode title
      if (ep.title) {
        doc.setFont('helvetica', 'bold');
        setColor(COLORS.gold);
        doc.text(`  —  ${ep.title.toUpperCase()}`, marginLeft + doc.getTextWidth(epNum), y);
      }

      // Duration badge
      if (ep.duration_min) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setColor(COLORS.lightGray);
        doc.text(`~${ep.duration_min} min`, pageWidth - marginRight, y, { align: 'right' });
      }
      y += 18;

      // Episode synopsis
      if (ep.synopsis) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        const synLines = doc.splitTextToSize(ep.synopsis, contentWidth - 20);
        doc.text(synLines, marginLeft + 15, y);
        y += synLines.length * 12 + 5;
      }

      // Scene count
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
        checkPageBreak(50);
        
        // Character name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setColor(COLORS.darkGray);
        doc.text(char.name.toUpperCase(), marginLeft + 10, y);
        
        // Role detail
        if (char.role_detail) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          setColor(COLORS.lightGray);
          doc.text(`  —  ${char.role_detail}`, marginLeft + 10 + doc.getTextWidth(char.name.toUpperCase()), y);
        }
        y += 15;

        // Description
        if (char.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          setColor(COLORS.darkGray);
          const descLines = doc.splitTextToSize(char.description, contentWidth - 30);
          doc.text(descLines, marginLeft + 20, y);
          y += descLines.length * 12 + 5;
        }

        // Arc
        if (char.arc) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          setColor(COLORS.lightGray);
          const arcLines = doc.splitTextToSize(`Arco: ${char.arc}`, contentWidth - 30);
          doc.text(arcLines, marginLeft + 20, y);
          y += arcLines.length * 11 + 5;
        }

        y += 8;
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
      checkPageBreak(50);
      
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

      if (loc.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        const descLines = doc.splitTextToSize(loc.description, contentWidth - 30);
        doc.text(descLines, marginLeft + 20, y);
        y += descLines.length * 12 + 10;
      }
    }
  }

  // =================== SUBPLOTS & ARCS ===================
  if (data.subplots?.length || data.plot_twists?.length) {
    doc.addPage();
    y = 60;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.gold);
    doc.text('ESTRUCTURA NARRATIVA', marginLeft, y);
    drawLine(y + 8);
    y += 40;

    // Subplots
    if (data.subplots?.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setColor(COLORS.accent);
      doc.text('TRAMAS Y SUBTRAMAS', marginLeft, y);
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
        minor: '○',
        major: '◉',
        paradigm_shift: '★',
      };

      for (const twist of data.plot_twists) {
        checkPageBreak(40);
        
        const impact = impactLabels[twist.impact || 'minor'] || '○';
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(COLORS.darkGray);
        doc.text(`${impact} ${twist.name}`, marginLeft + 10, y);
        y += 14;

        if (twist.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
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

  // Decorative border
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
