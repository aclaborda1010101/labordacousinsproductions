import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, FileJson, FileText, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';

interface BibleExportProps {
  projectId: string;
  projectTitle: string;
}

interface CanonAsset {
  name: string;
  imageUrl: string;
  notes: string | null;
  runId: string;
  model: string | null;
  engine: string | null;
}

interface BibleData {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
}

export function BibleExport({ projectId, projectTitle }: BibleExportProps) {
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportJSON = async () => {
    setExportingJson(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-bible', {
        body: { projectId, format: 'json' }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      // Download JSON
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `biblia-${projectTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Biblia exportada como JSON');
    } catch (err) {
      console.error('Error exporting JSON:', err);
      toast.error('Error al exportar la biblia');
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-bible', {
        body: { projectId, format: 'pdf' }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      const bibleData: BibleData = data.data;
      
      // Generate PDF client-side using jsPDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;

      // Helper to add new page if needed
      const checkPageBreak = (neededHeight: number) => {
        if (yPos + neededHeight > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          return true;
        }
        return false;
      };

      // Cover page
      pdf.setFillColor(10, 10, 10);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      pdf.setTextColor(245, 158, 11);
      pdf.setFontSize(32);
      pdf.setFont('helvetica', 'bold');
      const titleLines = pdf.splitTextToSize(bibleData.projectTitle, pageWidth - 2 * margin);
      pdf.text(titleLines, pageWidth / 2, pageHeight / 3, { align: 'center' });
      
      pdf.setTextColor(150, 150, 150);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Biblia de Producción', pageWidth / 2, pageHeight / 3 + 20, { align: 'center' });
      
      pdf.setFontSize(12);
      const exportDate = new Date(bibleData.exportedAt).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      pdf.text(`Exportado: ${exportDate}`, pageWidth / 2, pageHeight / 3 + 35, { align: 'center' });

      // Helper to render asset section
      const renderSection = async (title: string, assets: CanonAsset[]) => {
        pdf.addPage();
        yPos = margin;
        
        // Section title
        pdf.setTextColor(245, 158, 11);
        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, margin, yPos);
        yPos += 15;
        
        // Underline
        pdf.setDrawColor(245, 158, 11);
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPos, margin + 60, yPos);
        yPos += 15;

        if (assets.length === 0) {
          pdf.setTextColor(100, 100, 100);
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'italic');
          pdf.text('No hay assets canon definidos', margin, yPos);
          return;
        }

        for (const asset of assets) {
          checkPageBreak(60);

          // Asset card background
          pdf.setFillColor(26, 26, 26);
          pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 55, 3, 3, 'F');

          // Asset name
          pdf.setTextColor(229, 229, 229);
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          pdf.text(asset.name, margin + 5, yPos + 10);

          // Notes
          if (asset.notes) {
            pdf.setTextColor(150, 150, 150);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            const noteLines = pdf.splitTextToSize(asset.notes, pageWidth - 2 * margin - 10);
            pdf.text(noteLines.slice(0, 2), margin + 5, yPos + 20);
          }

          // Meta info
          pdf.setTextColor(100, 100, 100);
          pdf.setFontSize(9);
          pdf.text(`Motor: ${asset.engine || 'N/A'} | Modelo: ${asset.model || 'N/A'}`, margin + 5, yPos + 45);

          // Image URL (as reference)
          pdf.setTextColor(80, 80, 80);
          pdf.setFontSize(8);
          const urlText = asset.imageUrl.length > 60 ? asset.imageUrl.substring(0, 60) + '...' : asset.imageUrl;
          pdf.text(`Imagen: ${urlText}`, margin + 5, yPos + 50);

          yPos += 60;
        }
      };

      // Render sections
      await renderSection('Personajes Canon', bibleData.canon.characters);
      await renderSection('Localizaciones Canon', bibleData.canon.locations);
      await renderSection('Estilo Canon', bibleData.canon.style);

      // Summary page
      pdf.addPage();
      yPos = margin;
      
      pdf.setTextColor(245, 158, 11);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Resumen', margin, yPos);
      yPos += 20;

      pdf.setTextColor(229, 229, 229);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Personajes: ${bibleData.canon.characters.length}`, margin, yPos);
      yPos += 8;
      pdf.text(`Total Localizaciones: ${bibleData.canon.locations.length}`, margin, yPos);
      yPos += 8;
      pdf.text(`Total Estilo: ${bibleData.canon.style.length}`, margin, yPos);
      yPos += 20;

      pdf.setTextColor(100, 100, 100);
      pdf.setFontSize(10);
      pdf.text('Este documento representa el estado actual de la biblia de producción.', margin, yPos);
      yPos += 6;
      pdf.text('Las imágenes de referencia están disponibles en las URLs indicadas.', margin, yPos);

      // Save PDF
      pdf.save(`biblia-${projectTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`);
      toast.success('Biblia exportada como PDF');

    } catch (err) {
      console.error('Error exporting PDF:', err);
      toast.error('Error al exportar la biblia');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportJSON}
        disabled={exportingJson || exportingPdf}
        className="gap-2"
      >
        {exportingJson ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileJson className="w-4 h-4" />
        )}
        Exportar JSON
      </Button>
      <Button
        variant="gold"
        size="sm"
        onClick={handleExportPDF}
        disabled={exportingJson || exportingPdf}
        className="gap-2"
      >
        {exportingPdf ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileText className="w-4 h-4" />
        )}
        Exportar PDF
      </Button>
    </div>
  );
}
