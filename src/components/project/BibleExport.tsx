import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, FileJson, FileText, Loader2, Star, Printer, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import { BibleProDocument } from './BibleProDocument';

interface BibleExportProps {
  projectId: string;
  projectTitle: string;
}

interface CanonAsset {
  id: string;
  name: string;
  imageUrl: string;
  notes: string | null;
  runId: string;
  model: string | null;
  engine: string | null;
  createdAt: string;
  assetType: string;
}

interface KeyframeData {
  id: string;
  imageUrl: string | null;
  sceneNumber?: number | null;
  shotNumber?: number | null;
  frameType?: string | null;
}

interface StylePackData {
  description?: string | null;
  tone?: string | null;
  lensStyle?: string | null;
  realismLevel?: string | null;
  colorPalette?: string[] | null;
  referenceUrls?: string[] | null;
}

interface ProjectStats {
  totalCharacters: number;
  totalLocations: number;
  totalScenes: number;
  totalShots: number;
  totalKeyframes: number;
  canonCharacters: number;
  canonLocations: number;
  canonStyle: number;
  lastUpdated: string;
}

interface BibleData {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  version: string;
  heroImageUrl: string | null;
  stylePack: StylePackData | null;
  stats: ProjectStats;
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  keyframes: KeyframeData[];
}

interface LastExport {
  type: 'normal' | 'pro';
  date: Date;
  fileName: string;
}

export function BibleExport({ projectId, projectTitle }: BibleExportProps) {
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPro, setExportingPro] = useState(false);
  const [showProPreview, setShowProPreview] = useState(false);
  const [proData, setProData] = useState<BibleData | null>(null);
  const [lastExport, setLastExport] = useState<LastExport | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchBibleData = async (): Promise<BibleData> => {
    const { data, error } = await supabase.functions.invoke('export-bible', {
      body: { projectId, format: 'json' }
    });
    if (error) throw error;
    if (!data.ok) throw new Error(data.error);
    return data.data;
  };

  const handleExportJSON = async () => {
    setExportingJson(true);
    try {
      const bibleData = await fetchBibleData();
      
      const blob = new Blob([JSON.stringify(bibleData, null, 2)], { type: 'application/json' });
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
      const bibleData = await fetchBibleData();
      const hasCanon = bibleData.canon.characters.length > 0 || 
                       bibleData.canon.locations.length > 0 || 
                       bibleData.canon.style.length > 0;
      
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
      pdf.setFillColor(15, 15, 15);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      
      pdf.setTextColor(245, 158, 11);
      pdf.setFontSize(28);
      pdf.setFont('helvetica', 'bold');
      const titleLines = pdf.splitTextToSize(bibleData.projectTitle, pageWidth - 2 * margin);
      pdf.text(titleLines, pageWidth / 2, pageHeight / 3, { align: 'center' });
      
      pdf.setTextColor(150, 150, 150);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Biblia de Producción', pageWidth / 2, pageHeight / 3 + 20, { align: 'center' });
      
      pdf.setFontSize(11);
      const exportDate = new Date(bibleData.exportedAt).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      pdf.text(`Exportado: ${exportDate}`, pageWidth / 2, pageHeight / 3 + 32, { align: 'center' });

      // If no canon, show project status page
      if (!hasCanon) {
        pdf.addPage();
        yPos = margin;
        
        pdf.setFillColor(15, 15, 15);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        
        pdf.setTextColor(245, 158, 11);
        pdf.setFontSize(22);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Estado del Proyecto', margin, yPos + 10);
        yPos += 30;
        
        pdf.setDrawColor(245, 158, 11);
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPos, margin + 50, yPos);
        yPos += 20;

        // Stats
        const stats = bibleData.stats;
        const statItems = [
          { label: 'Personajes definidos', value: stats.totalCharacters },
          { label: 'Localizaciones definidas', value: stats.totalLocations },
          { label: 'Escenas creadas', value: stats.totalScenes },
          { label: 'Shots definidos', value: stats.totalShots },
          { label: 'Canon activos (personajes)', value: stats.canonCharacters },
          { label: 'Canon activos (localizaciones)', value: stats.canonLocations },
          { label: 'Canon activos (estilo)', value: stats.canonStyle },
        ];

        pdf.setFontSize(12);
        for (const item of statItems) {
          pdf.setTextColor(150, 150, 150);
          pdf.setFont('helvetica', 'normal');
          pdf.text(item.label + ':', margin, yPos);
          pdf.setTextColor(229, 229, 229);
          pdf.setFont('helvetica', 'bold');
          pdf.text(String(item.value), margin + 80, yPos);
          yPos += 10;
        }

        yPos += 15;
        pdf.setTextColor(100, 100, 100);
        pdf.setFontSize(10);
        const lastUpdated = new Date(stats.lastUpdated).toLocaleDateString('es-ES', {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        pdf.text(`Última actualización: ${lastUpdated}`, margin, yPos);

        // Checklist
        yPos += 25;
        pdf.setTextColor(245, 158, 11);
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Próximos Pasos', margin, yPos);
        yPos += 15;

        const checklist = [
          { done: stats.totalCharacters > 0, text: 'Crear personajes principales' },
          { done: stats.totalLocations > 0, text: 'Definir localizaciones clave' },
          { done: stats.canonCharacters > 0, text: 'Aprobar canon de personajes' },
          { done: stats.canonLocations > 0, text: 'Aprobar canon de localizaciones' },
          { done: stats.totalScenes > 0, text: 'Estructurar escenas' },
          { done: stats.totalKeyframes > 0, text: 'Generar keyframes de referencia' },
        ];

        pdf.setFontSize(11);
        for (const item of checklist) {
          const icon = item.done ? '✓' : '○';
          pdf.setTextColor(item.done ? 100 : 60, item.done ? 180 : 60, item.done ? 100 : 60);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`${icon}  ${item.text}`, margin, yPos);
          yPos += 9;
        }

      } else {
        // Render sections with canon
        const renderSection = (title: string, assets: CanonAsset[]) => {
          if (assets.length === 0) return;
          
          pdf.addPage();
          yPos = margin;
          
          pdf.setFillColor(15, 15, 15);
          pdf.rect(0, 0, pageWidth, pageHeight, 'F');
          
          pdf.setTextColor(245, 158, 11);
          pdf.setFontSize(22);
          pdf.setFont('helvetica', 'bold');
          pdf.text(title, margin, yPos + 10);
          yPos += 25;
          
          pdf.setDrawColor(245, 158, 11);
          pdf.setLineWidth(0.5);
          pdf.line(margin, yPos, margin + 50, yPos);
          yPos += 15;

          for (const asset of assets) {
            if (yPos > pageHeight - 65) {
              pdf.addPage();
              pdf.setFillColor(15, 15, 15);
              pdf.rect(0, 0, pageWidth, pageHeight, 'F');
              yPos = margin;
            }

            pdf.setFillColor(26, 26, 26);
            pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 50, 3, 3, 'F');

            pdf.setTextColor(229, 229, 229);
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text(asset.name, margin + 8, yPos + 12);

            if (asset.notes) {
              pdf.setTextColor(150, 150, 150);
              pdf.setFontSize(10);
              pdf.setFont('helvetica', 'normal');
              const noteLines = pdf.splitTextToSize(asset.notes, pageWidth - 2 * margin - 16);
              pdf.text(noteLines.slice(0, 2), margin + 8, yPos + 24);
            }

            pdf.setTextColor(100, 100, 100);
            pdf.setFontSize(9);
            pdf.text(`Motor: ${asset.engine || 'N/A'} | Modelo: ${asset.model || 'N/A'}`, margin + 8, yPos + 42);

            yPos += 55;
          }
        };

        renderSection('Personajes Canon', bibleData.canon.characters);
        renderSection('Localizaciones Canon', bibleData.canon.locations);
        renderSection('Estilo Canon', bibleData.canon.style);
      }

      // Footer on last page
      pdf.setTextColor(80, 80, 80);
      pdf.setFontSize(8);
      pdf.text(`${projectId} | Bible v${bibleData.version}`, margin, pageHeight - 10);
      pdf.text(exportDate, pageWidth - margin, pageHeight - 10, { align: 'right' });

      const fileName = `biblia-${projectTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`;
      pdf.save(fileName);
      
      setLastExport({ type: 'normal', date: new Date(), fileName });
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
      const bibleData = await fetchBibleData();
      setProData(bibleData);
      setShowProPreview(true);
    } catch (err) {
      console.error('Error preparing PRO PDF:', err);
      toast.error('Error al preparar la biblia PRO');
    } finally {
      setExportingPro(false);
    }
  };

  const handlePrint = useCallback(() => {
    window.print();
    if (proData) {
      const fileName = `biblia-pro-${projectTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`;
      setLastExport({ type: 'pro', date: new Date(), fileName });
    }
    toast.success('Usa "Guardar como PDF" en el diálogo de impresión');
  }, [proData, projectTitle]);

  const handleCloseProPreview = () => {
    setShowProPreview(false);
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
            PDF Normal
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
        
        {lastExport && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" />
              {lastExport.date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </Badge>
            <span>
              Último: <span className="font-medium">{lastExport.type === 'pro' ? 'PRO' : 'Normal'}</span>
            </span>
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
                <BibleProDocument data={proData} />
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
