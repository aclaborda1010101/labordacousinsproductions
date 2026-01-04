import jsPDF from 'jspdf';

/**
 * Bible Summary PDF Export
 * Exports a production bible summary with:
 * - Project overview and synopsis
 * - Characters (categorized by role)
 * - Locations
 * - Props
 * - Subplots and Plot Twists
 */

interface CharacterData {
  name: string;
  role?: string;
  role_detail?: string;
  entity_type?: string;
  description?: string;
  priority?: string;
}

interface LocationData {
  name: string;
  type?: string;
  description?: string;
}

interface SubplotData {
  name: string;
  description?: string;
  characters_involved?: string[];
}

interface PlotTwistData {
  name: string;
  description?: string;
  impact?: 'minor' | 'major' | 'paradigm_shift';
}

interface BibleSummaryData {
  title: string;
  synopsis?: string;
  format?: 'film' | 'series' | 'short' | string;
  episodeCount?: number;
  sceneCount?: number;
  characters?: CharacterData[];
  locations?: LocationData[];
  props?: any[];
  subplots?: SubplotData[];
  plot_twists?: PlotTwistData[];
}

const ROLE_LABELS: Record<string, string> = {
  protagonist: 'Protagonista',
  antagonist: 'Antagonista',
  supporting: 'Secundario',
  recurring: 'Recurrente',
  cameo: 'Cameo',
  extra_with_lines: 'Extra con líneas',
  background: 'Fondo',
  collective_entity: 'Entidad colectiva',
  cosmic_force: 'Fuerza cósmica',
};

export function exportBibleSummaryPDF(data: BibleSummaryData): void {
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
  let y = 60;

  const checkPageBreak = (neededSpace: number = 60) => {
    if (y + neededSpace > pageHeight - 60) {
      doc.addPage();
      y = 60;
    }
  };

  // Title page
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(data.title.toUpperCase(), pageWidth / 2, 200, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('BIBLIA DE PRODUCCIÓN', pageWidth / 2, 240, { align: 'center' });

  const formatLabel = data.format === 'film' ? 'Largometraje' : 
                      data.format === 'short' ? 'Cortometraje' : 'Serie';
  doc.setFontSize(12);
  doc.text(`Formato: ${formatLabel}`, pageWidth / 2, 280, { align: 'center' });
  
  if (data.episodeCount) {
    const episodeLabel = data.format === 'film' ? 'Actos' : 
                         data.format === 'short' ? 'Partes' : 'Episodios';
    doc.text(`${data.episodeCount} ${episodeLabel}`, pageWidth / 2, 300, { align: 'center' });
  }
  if (data.sceneCount) {
    doc.text(`${data.sceneCount} Escenas`, pageWidth / 2, 320, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setTextColor(128);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, pageWidth / 2, pageHeight - 60, { align: 'center' });
  doc.setTextColor(0);

  // Synopsis page
  doc.addPage();
  y = 60;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SINOPSIS', marginLeft, y);
  y += 30;

  if (data.synopsis) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const synopsisLines = doc.splitTextToSize(data.synopsis, contentWidth);
    doc.text(synopsisLines, marginLeft, y);
    y += synopsisLines.length * 14 + 30;
  }

  // Characters section
  checkPageBreak(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PERSONAJES', marginLeft, y);
  y += 25;

  if (data.characters?.length) {
    // Group by role
    const grouped: Record<string, CharacterData[]> = {};
    data.characters.forEach(char => {
      const role = char.role || 'other';
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push(char);
    });

    const roleOrder = ['protagonist', 'antagonist', 'supporting', 'recurring', 'cameo', 'extra_with_lines', 'background', 'collective_entity', 'cosmic_force', 'other'];
    
    for (const role of roleOrder) {
      if (!grouped[role] || grouped[role].length === 0) continue;
      
      checkPageBreak(50);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(ROLE_LABELS[role] || role.toUpperCase(), marginLeft, y);
      y += 18;

      for (const char of grouped[role]) {
        checkPageBreak(40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`• ${char.name}`, marginLeft + 10, y);
        
        if (char.role_detail) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          doc.text(` — ${char.role_detail}`, marginLeft + 15 + doc.getTextWidth(`• ${char.name}`), y);
        }
        y += 14;

        if (char.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          const descLines = doc.splitTextToSize(char.description, contentWidth - 20);
          doc.text(descLines, marginLeft + 20, y);
          y += descLines.length * 12 + 8;
        }
      }
      y += 10;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('No hay personajes definidos.', marginLeft, y);
    y += 20;
  }

  // Locations section
  checkPageBreak(80);
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('LOCALIZACIONES', marginLeft, y);
  y += 25;

  if (data.locations?.length) {
    for (const loc of data.locations) {
      checkPageBreak(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`• ${loc.name}`, marginLeft + 10, y);
      
      if (loc.type) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(` (${loc.type})`, marginLeft + 15 + doc.getTextWidth(`• ${loc.name}`), y);
      }
      y += 14;

      if (loc.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const descLines = doc.splitTextToSize(loc.description, contentWidth - 20);
        doc.text(descLines, marginLeft + 20, y);
        y += descLines.length * 12 + 8;
      }
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('No hay localizaciones definidas.', marginLeft, y);
    y += 20;
  }

  // Props section
  if (data.props?.length) {
    checkPageBreak(80);
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('PROPS', marginLeft, y);
    y += 25;

    for (const prop of data.props) {
      checkPageBreak(30);
      const propName = typeof prop === 'string' ? prop : prop.name;
      const propDesc = typeof prop === 'object' ? prop.description : null;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`• ${propName}`, marginLeft + 10, y);
      y += 14;

      if (propDesc) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const descLines = doc.splitTextToSize(propDesc, contentWidth - 20);
        doc.text(descLines, marginLeft + 20, y);
        y += descLines.length * 12 + 8;
      }
    }
  }

  // Subplots section
  if (data.subplots?.length) {
    checkPageBreak(80);
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SUBTRAMAS', marginLeft, y);
    y += 25;

    for (const subplot of data.subplots) {
      checkPageBreak(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`• ${subplot.name}`, marginLeft + 10, y);
      y += 14;

      if (subplot.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const descLines = doc.splitTextToSize(subplot.description, contentWidth - 20);
        doc.text(descLines, marginLeft + 20, y);
        y += descLines.length * 12 + 8;
      }

      if (subplot.characters_involved?.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.text(`Personajes: ${subplot.characters_involved.join(', ')}`, marginLeft + 20, y);
        y += 14;
      }
    }
  }

  // Plot Twists section
  if (data.plot_twists?.length) {
    checkPageBreak(80);
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('GIROS ARGUMENTALES', marginLeft, y);
    y += 25;

    const impactLabels: Record<string, string> = {
      minor: 'Menor',
      major: 'Mayor',
      paradigm_shift: 'Cambio de paradigma',
    };

    for (const twist of data.plot_twists) {
      checkPageBreak(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`• ${twist.name}`, marginLeft + 10, y);
      
      if (twist.impact) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(` [${impactLabels[twist.impact] || twist.impact}]`, marginLeft + 15 + doc.getTextWidth(`• ${twist.name}`), y);
      }
      y += 14;

      if (twist.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const descLines = doc.splitTextToSize(twist.description, contentWidth - 20);
        doc.text(descLines, marginLeft + 20, y);
        y += descLines.length * 12 + 8;
      }
    }
  }

  // Save
  const fileName = `${data.title.replace(/[^a-zA-Z0-9]/g, '_')}_Biblia_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
