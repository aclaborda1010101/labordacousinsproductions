import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SceneEstimate {
  slugline: string;
  quality_mode: string;
  shot_count: number;
  total_duration: number;
  hero_count: number;
  episode_no: number;
  low: number;
  expected: number;
  high: number;
}

interface EpisodeEstimate {
  episode_no: number;
  scene_count: number;
  shot_count: number;
  total_duration: number;
  low: number;
  expected: number;
  high: number;
}

interface ExportBudgetParams {
  projectTitle: string;
  sceneEstimates: SceneEstimate[];
  episodeEstimates: EpisodeEstimate[];
  totalLow: number;
  totalExpected: number;
  totalHigh: number;
  totalDuration: number;
  budgetCap?: number | null;
}

export function exportBudgetPDF({
  projectTitle,
  sceneEstimates,
  episodeEstimates,
  totalLow,
  totalExpected,
  totalHigh,
  totalDuration,
  budgetCap,
}: ExportBudgetParams) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(20, 20, 25);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(212, 175, 55); // Gold color
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('CINEFORGE Studio', 14, 20);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Presupuesto de Producción', 14, 30);
  
  // Project info
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(projectTitle, 14, 55);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-ES', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`, 14, 62);
  
  // Summary box
  const summaryY = 72;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(14, summaryY, pageWidth - 28, 35, 3, 3, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  
  const colWidth = (pageWidth - 28) / 4;
  
  // Low
  doc.text('Estimación Baja', 20, summaryY + 10);
  doc.setFontSize(16);
  doc.setTextColor(34, 139, 34);
  doc.text(`€${totalLow.toFixed(2)}`, 20, summaryY + 22);
  
  // Expected
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('Estimación Media', 20 + colWidth, summaryY + 10);
  doc.setFontSize(16);
  doc.setTextColor(212, 175, 55);
  doc.text(`€${totalExpected.toFixed(2)}`, 20 + colWidth, summaryY + 22);
  
  // High
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('Estimación Alta', 20 + colWidth * 2, summaryY + 10);
  doc.setFontSize(16);
  doc.setTextColor(220, 53, 69);
  doc.text(`€${totalHigh.toFixed(2)}`, 20 + colWidth * 2, summaryY + 22);
  
  // Duration
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('Duración Total', 20 + colWidth * 3, summaryY + 10);
  doc.setFontSize(16);
  doc.setTextColor(60, 60, 60);
  const mins = Math.floor(totalDuration / 60);
  const secs = Math.round(totalDuration % 60);
  doc.text(`${mins}m ${secs}s`, 20 + colWidth * 3, summaryY + 22);
  
  // Budget warning if over
  if (budgetCap && totalExpected > budgetCap) {
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(14, summaryY + 40, pageWidth - 28, 15, 3, 3, 'F');
    doc.setFontSize(10);
    doc.setTextColor(185, 28, 28);
    doc.text(`⚠ Presupuesto excedido: €${(totalExpected - budgetCap).toFixed(2)} sobre el límite de €${budgetCap.toFixed(2)}`, 20, summaryY + 50);
  }
  
  // Episode breakdown table
  let tableY = budgetCap && totalExpected > budgetCap ? summaryY + 65 : summaryY + 50;
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Desglose por Episodio', 14, tableY);
  
  autoTable(doc, {
    startY: tableY + 5,
    head: [['Episodio', 'Escenas', 'Planos', 'Duración', 'Bajo', 'Esperado', 'Alto']],
    body: episodeEstimates.map(ep => [
      `Ep. ${ep.episode_no}`,
      ep.scene_count.toString(),
      ep.shot_count.toString(),
      `${Math.floor(ep.total_duration / 60)}m ${Math.round(ep.total_duration % 60)}s`,
      `€${ep.low.toFixed(2)}`,
      `€${ep.expected.toFixed(2)}`,
      `€${ep.high.toFixed(2)}`,
    ]),
    foot: [[
      'TOTAL',
      sceneEstimates.length.toString(),
      sceneEstimates.reduce((sum, s) => sum + s.shot_count, 0).toString(),
      `${mins}m ${secs}s`,
      `€${totalLow.toFixed(2)}`,
      `€${totalExpected.toFixed(2)}`,
      `€${totalHigh.toFixed(2)}`,
    ]],
    theme: 'striped',
    headStyles: { 
      fillColor: [20, 20, 25], 
      textColor: [212, 175, 55],
      fontStyle: 'bold'
    },
    footStyles: {
      fillColor: [245, 245, 245],
      textColor: [30, 30, 30],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
  });
  
  // Scene breakdown - new page
  doc.addPage();
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Desglose por Escena', 14, 20);
  
  autoTable(doc, {
    startY: 25,
    head: [['Ep.', 'Escena', 'Modo', 'Planos', 'Hero', 'Duración', 'Bajo', 'Esperado', 'Alto']],
    body: sceneEstimates.map(scene => [
      scene.episode_no.toString(),
      scene.slugline.substring(0, 30) + (scene.slugline.length > 30 ? '...' : ''),
      scene.quality_mode,
      scene.shot_count.toString(),
      scene.hero_count.toString(),
      `${Math.floor(scene.total_duration / 60)}m ${Math.round(scene.total_duration % 60)}s`,
      `€${scene.low.toFixed(2)}`,
      `€${scene.expected.toFixed(2)}`,
      `€${scene.high.toFixed(2)}`,
    ]),
    theme: 'striped',
    headStyles: { 
      fillColor: [20, 20, 25], 
      textColor: [212, 175, 55],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    columnStyles: {
      1: { cellWidth: 50 },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
  });
  
  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `CINEFORGE Studio - ${projectTitle} - Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  // Save the PDF
  doc.save(`${projectTitle.replace(/[^a-zA-Z0-9]/g, '_')}_presupuesto.pdf`);
}
