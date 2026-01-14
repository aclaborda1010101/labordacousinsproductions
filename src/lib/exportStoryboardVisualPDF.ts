import jsPDF from 'jspdf';

interface StoryboardPanel {
  panel_no: number;
  panel_intent: string | null;
  shot_hint: string | null;
  image_url: string | null;
}

interface ExportVisualStoryboardParams {
  projectTitle: string;
  sceneSlugline: string;
  sceneNo: number;
  panels: StoryboardPanel[];
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null as unknown as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportStoryboardVisualPDF({
  projectTitle,
  sceneSlugline,
  sceneNo,
  panels,
}: ExportVisualStoryboardParams): Promise<void> {
  // A4 Landscape: 297mm x 210mm
  const doc = new jsPDF({ 
    orientation: 'landscape', 
    unit: 'mm', 
    format: 'a4' 
  });
  
  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 10;
  
  // Header background
  doc.setFillColor(20, 20, 25);
  doc.rect(0, 0, pageWidth, 18, 'F');
  
  // Header title
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('STORYBOARD', margin, 12);
  
  // Project title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(projectTitle, 55, 12);
  
  // Scene info
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
  doc.text(`Escena ${sceneNo}: ${sceneSlugline}`, pageWidth - margin, 12, { align: 'right' });
  
  // Grid layout: 4 cols × 2 rows
  const cols = 4;
  const rows = 2;
  const gridTop = 25;
  const gridLeft = margin;
  const gridWidth = pageWidth - (margin * 2);
  const gridHeight = pageHeight - gridTop - 18;
  
  const cellWidth = gridWidth / cols;
  const cellHeight = gridHeight / rows;
  const imgPadding = 3;
  const imgWidth = cellWidth - (imgPadding * 2);
  const imgHeight = cellHeight - 16;
  
  // Preload images as base64
  const panelsToRender = panels.slice(0, 8);
  const imagePromises = panelsToRender.map(async (panel) => {
    if (!panel.image_url) return null;
    return loadImageAsBase64(panel.image_url);
  });
  
  const images = await Promise.all(imagePromises);
  
  // Draw panels
  panelsToRender.forEach((panel, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    
    const x = gridLeft + (col * cellWidth) + imgPadding;
    const y = gridTop + (row * cellHeight);
    
    // Panel frame background
    doc.setFillColor(30, 30, 35);
    doc.roundedRect(x, y, imgWidth, imgHeight, 2, 2, 'F');
    
    // Panel frame border
    doc.setDrawColor(60, 60, 65);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, imgWidth, imgHeight, 2, 2, 'S');
    
    // Image or placeholder
    const imgData = images[index];
    if (imgData) {
      try {
        doc.addImage(imgData, 'JPEG', x + 1, y + 1, imgWidth - 2, imgHeight - 2);
      } catch {
        // Draw placeholder if image fails
        doc.setFillColor(40, 40, 45);
        doc.roundedRect(x + 1, y + 1, imgWidth - 2, imgHeight - 2, 2, 2, 'F');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(8);
        doc.text('Error al cargar', x + imgWidth/2, y + imgHeight/2, { align: 'center' });
      }
    } else {
      doc.setFillColor(40, 40, 45);
      doc.roundedRect(x + 1, y + 1, imgWidth - 2, imgHeight - 2, 2, 2, 'F');
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('Sin imagen', x + imgWidth/2, y + imgHeight/2, { align: 'center' });
    }
    
    // Panel number badge (top-left)
    doc.setFillColor(212, 175, 55);
    doc.roundedRect(x + 2, y + 2, 12, 6, 1, 1, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`P${panel.panel_no}`, x + 8, y + 6, { align: 'center' });
    
    // Shot hint badge (top-right)
    if (panel.shot_hint) {
      const hintColors: Record<string, [number, number, number]> = {
        'PG': [59, 130, 246],     // Blue
        'PM': [16, 185, 129],     // Green  
        'PP': [249, 115, 22],     // Orange
        'INSERT': [139, 92, 246], // Purple
        'OTS': [236, 72, 153],    // Pink
      };
      const color = hintColors[panel.shot_hint] || [100, 100, 100];
      const hintWidth = panel.shot_hint.length > 3 ? 18 : 14;
      
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x + imgWidth - hintWidth - 2, y + 2, hintWidth, 6, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.text(panel.shot_hint, x + imgWidth - hintWidth/2 - 2, y + 6, { align: 'center' });
    }
    
    // Panel intent (below image)
    const labelY = y + imgHeight + 4;
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const intent = (panel.panel_intent || 'Sin descripción').substring(0, 50);
    const displayIntent = intent + (panel.panel_intent && panel.panel_intent.length > 50 ? '...' : '');
    doc.text(displayIntent, x, labelY);
  });
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${projectTitle} - Storyboard Escena ${sceneNo} - ${new Date().toLocaleDateString('es-ES')}`,
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  );
  
  // Generate filename
  const safeTitle = projectTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const filename = `${safeTitle}_storyboard_esc${sceneNo}.pdf`;
  
  doc.save(filename);
}
