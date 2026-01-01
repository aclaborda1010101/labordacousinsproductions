import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Shot {
  shot_no: number;
  shot_type: string;
  dialogue_text: string | null;
  duration_target: number | null;
  hero: boolean | null;
  effective_mode: string;
  camera?: Record<string, unknown> | null;
}

interface Scene {
  id: string;
  episode_no: number;
  scene_no: number;
  slugline: string;
  summary: string | null;
  time_of_day: string | null;
  quality_mode: string;
  shots: Shot[];
}

interface Character {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface ExportStoryboardParams {
  projectTitle: string;
  scenes: Scene[];
  characters: Character[];
  locations: Location[];
}

export function exportStoryboardPDF({
  projectTitle,
  scenes,
  characters,
  locations,
}: ExportStoryboardParams) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Cover page
  doc.setFillColor(20, 20, 25);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('STORYBOARD', pageWidth / 2, 80, { align: 'center' });
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(projectTitle, pageWidth / 2, 100, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(150, 150, 150);
  doc.text('CINEFORGE Studio', pageWidth / 2, 130, { align: 'center' });
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  })}`, pageWidth / 2, 140, { align: 'center' });
  
  // Stats
  const totalScenes = scenes.length;
  const totalShots = scenes.reduce((sum, s) => sum + s.shots.length, 0);
  const totalDuration = scenes.reduce((sum, s) => 
    sum + s.shots.reduce((shotSum, shot) => shotSum + (shot.duration_target || 3), 0), 0);
  const episodes = [...new Set(scenes.map(s => s.episode_no))].length;
  
  doc.setFillColor(30, 30, 35);
  doc.roundedRect(30, 160, pageWidth - 60, 50, 5, 5, 'F');
  
  const statWidth = (pageWidth - 60) / 4;
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  
  ['Episodios', 'Escenas', 'Planos', 'Duración'].forEach((label, i) => {
    doc.text(label, 40 + statWidth * i, 175);
  });
  
  doc.setFontSize(18);
  doc.setTextColor(212, 175, 55);
  [episodes.toString(), totalScenes.toString(), totalShots.toString(), 
   `${Math.floor(totalDuration / 60)}:${String(Math.round(totalDuration % 60)).padStart(2, '0')}`
  ].forEach((value, i) => {
    doc.text(value, 40 + statWidth * i, 195);
  });
  
  // Group scenes by episode
  const episodeGroups = scenes.reduce((acc, scene) => {
    if (!acc[scene.episode_no]) acc[scene.episode_no] = [];
    acc[scene.episode_no].push(scene);
    return acc;
  }, {} as Record<number, Scene[]>);
  
  // Process each episode
  Object.entries(episodeGroups).sort(([a], [b]) => Number(a) - Number(b)).forEach(([episodeNo, episodeScenes]) => {
    doc.addPage();
    
    // Episode header
    doc.setFillColor(20, 20, 25);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`EPISODIO ${episodeNo}`, 14, 22);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const epShots = episodeScenes.reduce((sum, s) => sum + s.shots.length, 0);
    const epDuration = episodeScenes.reduce((sum, s) => 
      sum + s.shots.reduce((shotSum, shot) => shotSum + (shot.duration_target || 3), 0), 0);
    doc.text(`${episodeScenes.length} escenas · ${epShots} planos · ${Math.floor(epDuration / 60)}:${String(Math.round(epDuration % 60)).padStart(2, '0')}`, pageWidth - 14, 22, { align: 'right' });
    
    let currentY = 45;
    
    episodeScenes.sort((a, b) => a.scene_no - b.scene_no).forEach((scene) => {
      // Check if we need a new page
      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 20;
      }
      
      // Scene header
      doc.setFillColor(40, 40, 45);
      doc.roundedRect(14, currentY, pageWidth - 28, 20, 3, 3, 'F');
      
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${scene.scene_no}. ${scene.slugline}`, 20, currentY + 13);
      
      // Mode badge
      const modeColor = scene.quality_mode === 'ULTRA' ? [139, 92, 246] : [59, 130, 246];
      doc.setFillColor(modeColor[0], modeColor[1], modeColor[2]);
      doc.roundedRect(pageWidth - 45, currentY + 5, 25, 10, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(scene.quality_mode, pageWidth - 32.5, currentY + 12, { align: 'center' });
      
      currentY += 25;
      
      // Summary if exists
      if (scene.summary) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        const summaryLines = doc.splitTextToSize(scene.summary, pageWidth - 40);
        doc.text(summaryLines, 20, currentY);
        currentY += summaryLines.length * 4 + 5;
      }
      
      // Shots table
      if (scene.shots.length > 0) {
        autoTable(doc, {
          startY: currentY,
          head: [['#', 'Tipo', 'Duración', 'Diálogo', 'Modo']],
          body: scene.shots.map(shot => [
            `${shot.shot_no}${shot.hero ? ' ★' : ''}`,
            shot.shot_type,
            `${shot.duration_target || 3}s`,
            (shot.dialogue_text || '-').substring(0, 60) + ((shot.dialogue_text?.length || 0) > 60 ? '...' : ''),
            shot.effective_mode
          ]),
          theme: 'plain',
          headStyles: { 
            fillColor: [50, 50, 55], 
            textColor: [212, 175, 55],
            fontStyle: 'bold',
            fontSize: 8
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [80, 80, 80],
            cellPadding: 3
          },
          alternateRowStyles: {
            fillColor: [248, 248, 248]
          },
          columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 25 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 20, halign: 'center' }
          },
          margin: { left: 14, right: 14 },
        });
        
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }
    });
  });
  
  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${projectTitle} - Storyboard - Página ${i - 1} de ${pageCount - 1}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }
  
  doc.save(`${projectTitle.replace(/[^a-zA-Z0-9]/g, '_')}_storyboard.pdf`);
}
