import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, FileJson, FileText, Loader2, Star, ExternalLink } from 'lucide-react';
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
  const [exportingPro, setExportingPro] = useState(false);
  const [lastProExport, setLastProExport] = useState<{ url: string; date: Date } | null>(null);

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
        body: { projectId, format: 'pdf', style: 'basic' }
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

      // Render sections
      const renderSection = (title: string, assets: CanonAsset[]) => {
        pdf.addPage();
        yPos = margin;
        
        pdf.setTextColor(245, 158, 11);
        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, margin, yPos);
        yPos += 15;
        
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
          if (yPos > pageHeight - 70) {
            pdf.addPage();
            yPos = margin;
          }

          pdf.setFillColor(26, 26, 26);
          pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 55, 3, 3, 'F');

          pdf.setTextColor(229, 229, 229);
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          pdf.text(asset.name, margin + 5, yPos + 10);

          if (asset.notes) {
            pdf.setTextColor(150, 150, 150);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            const noteLines = pdf.splitTextToSize(asset.notes, pageWidth - 2 * margin - 10);
            pdf.text(noteLines.slice(0, 2), margin + 5, yPos + 20);
          }

          pdf.setTextColor(100, 100, 100);
          pdf.setFontSize(9);
          pdf.text(`Motor: ${asset.engine || 'N/A'} | Modelo: ${asset.model || 'N/A'}`, margin + 5, yPos + 45);

          yPos += 60;
        }
      };

      renderSection('Personajes Canon', bibleData.canon.characters);
      renderSection('Localizaciones Canon', bibleData.canon.locations);
      renderSection('Estilo Canon', bibleData.canon.style);

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

  const handleExportPro = async () => {
    setExportingPro(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-bible', {
        body: { projectId, format: 'pdf', style: 'pro' }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      if (data.url) {
        // PDF is stored in Supabase Storage
        setLastProExport({ url: data.url, date: new Date() });
        
        // Trigger download
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.fileName || `biblia-pro-${Date.now()}.pdf`;
        a.target = '_blank';
        a.click();
        
        toast.success('Biblia PRO generada y almacenada');
      } else if (data.pdfBase64) {
        // Fallback: PDF returned as base64
        const binaryString = atob(data.pdfBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `biblia-pro-${projectTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast.success('Biblia PRO exportada');
      }
    } catch (err) {
      console.error('Error exporting PRO PDF:', err);
      toast.error('Error al exportar la biblia PRO');
    } finally {
      setExportingPro(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportJSON}
          disabled={exportingJson || exportingPdf || exportingPro}
          className="gap-2"
        >
          {exportingJson ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileJson className="w-4 h-4" />
          )}
          JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          disabled={exportingJson || exportingPdf || exportingPro}
          className="gap-2"
        >
          {exportingPdf ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          PDF Básico
        </Button>
        <Button
          variant="gold"
          size="sm"
          onClick={handleExportPro}
          disabled={exportingJson || exportingPdf || exportingPro}
          className="gap-2"
        >
          {exportingPro ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Star className="w-4 h-4" />
          )}
          Biblia PRO
        </Button>
      </div>
      
      {lastProExport && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1">
            <Download className="w-3 h-3" />
            {lastProExport.date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </Badge>
          <a 
            href={lastProExport.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            Abrir último export <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
