import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, FileJson, FileText, Loader2, Star, ExternalLink, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import { BibleProDocument } from './BibleProDocument';

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

interface KeyframeData {
  id: string;
  imageUrl: string | null;
  sceneNumber?: number;
  shotNumber?: number;
}

interface StylePackData {
  genre?: string;
  tone?: string;
  era?: string;
  keywords?: string[];
  colorPalette?: string[];
  description?: string;
}

interface BibleData {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  version?: string;
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  keyframes?: KeyframeData[];
  stylePack?: StylePackData;
  heroImageUrl?: string;
}

export function BibleExport({ projectId, projectTitle }: BibleExportProps) {
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPro, setExportingPro] = useState(false);
  const [showProPreview, setShowProPreview] = useState(false);
  const [proData, setProData] = useState<BibleData | null>(null);
  const [lastProExport, setLastProExport] = useState<{ url: string; date: Date } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

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
        body: { projectId, format: 'json', style: 'pro' }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      // Fetch additional data for PRO document
      const [keyframesRes, stylePackRes] = await Promise.all([
        supabase
          .from('keyframes')
          .select('id, image_url, shot_id, shots(shot_number, scenes(scene_number))')
          .eq('approved', true)
          .order('created_at', { ascending: false })
          .limit(16),
        supabase
          .from('style_packs')
          .select('tone, color_palette, description, lens_style, realism_level')
          .eq('project_id', projectId)
          .maybeSingle()
      ]);

      // Find hero image - prefer first accepted keyframe with image
      let heroImageUrl: string | undefined;
      if (keyframesRes.data && keyframesRes.data.length > 0) {
        const kfWithImage = keyframesRes.data.find(kf => kf.image_url);
        if (kfWithImage) heroImageUrl = kfWithImage.image_url ?? undefined;
      }
      if (!heroImageUrl && data.data.canon.characters[0]?.imageUrl) {
        heroImageUrl = data.data.canon.characters[0].imageUrl;
      }

      const proDocData: BibleData = {
        ...data.data,
        version: '1.0',
        heroImageUrl,
        keyframes: keyframesRes.data?.map(kf => {
          const shots = kf.shots as { shot_number?: number; scenes?: { scene_number?: number } } | null;
          return {
            id: kf.id,
            imageUrl: kf.image_url,
            shotNumber: shots?.shot_number,
            sceneNumber: shots?.scenes?.scene_number
          };
        }) || [],
        stylePack: stylePackRes.data ? {
          tone: stylePackRes.data.tone ?? undefined,
          colorPalette: stylePackRes.data.color_palette ?? undefined,
          description: stylePackRes.data.description ?? undefined,
          genre: stylePackRes.data.lens_style ?? undefined,
          era: stylePackRes.data.realism_level ?? undefined
        } : undefined
      };

      setProData(proDocData);
      setShowProPreview(true);
      setLastProExport({ url: '', date: new Date() });

    } catch (err) {
      console.error('Error preparing PRO PDF:', err);
      toast.error('Error al preparar la biblia PRO');
    } finally {
      setExportingPro(false);
    }
  };

  const handlePrint = useCallback(() => {
    // Open print dialog
    window.print();
    toast.success('Usa "Guardar como PDF" en el diálogo de impresión');
  }, []);

  const handleCloseProPreview = () => {
    setShowProPreview(false);
    setProData(null);
  };

  return (
    <>
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
            variant="default"
            size="sm"
            onClick={handleExportPro}
            disabled={exportingJson || exportingPdf || exportingPro}
            className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-medium"
          >
            {exportingPro ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Star className="w-4 h-4" />
            )}
            PDF PRO
          </Button>
        </div>
        
        {lastProExport && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <Download className="w-3 h-3" />
              {lastProExport.date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </Badge>
            <span className="text-muted-foreground">PRO preview abierto</span>
          </div>
        )}
      </div>

      {/* PRO Preview Dialog */}
      <Dialog open={showProPreview} onOpenChange={handleCloseProPreview}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[900px] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between no-print">
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Biblia PRO Preview
            </DialogTitle>
            <Button 
              onClick={handlePrint} 
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Guardar PDF
            </Button>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto bg-gray-100 p-4 rounded-lg">
            {proData && (
              <div ref={printRef}>
                <BibleProDocument 
                  data={proData} 
                  onReady={() => console.log('Document ready for print')}
                />
              </div>
            )}
          </div>

          <div className="flex-shrink-0 text-xs text-muted-foreground text-center pt-2 no-print">
            💡 Tip: Usa <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl/Cmd + P</kbd> → "Guardar como PDF" para exportar
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
