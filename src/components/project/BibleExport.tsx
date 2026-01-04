import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileJson, FileText, Loader2, Star, Printer, Clock } from 'lucide-react';
import { BibleProDocument } from './BibleProDocument';
import { BibleNormalDocument } from './BibleNormalDocument';

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
  scene: number | null;
  shot: number | null;
  runId: string | null;
  createdAt: string;
}

interface AcceptedRun {
  id: string;
  type: string;
  name: string;
  date: string;
}

interface BibleData {
  project: {
    id: string;
    name: string;
    tone: string | null;
    lensStyle: string | null;
    realismLevel: string | null;
    description: string | null;
    colorPalette: string[] | null;
  };
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  continuity: {
    keyframes: KeyframeData[];
  };
  recentRuns: AcceptedRun[];
  stats: {
    totalCharacters: number;
    totalLocations: number;
    totalScenes: number;
    totalShots: number;
    canonCharacters: number;
    canonLocations: number;
    canonStyle: number;
    acceptedKeyframes: number;
  };
  exportedAt: string;
  version: string;
}

interface LastExport {
  type: 'json' | 'normal' | 'pro';
  date: Date;
}

export function BibleExport({ projectId, projectTitle }: BibleExportProps) {
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingNormal, setExportingNormal] = useState(false);
  const [exportingPro, setExportingPro] = useState(false);
  const [showNormalPreview, setShowNormalPreview] = useState(false);
  const [showProPreview, setShowProPreview] = useState(false);
  const [bibleData, setBibleData] = useState<BibleData | null>(null);
  const [lastExport, setLastExport] = useState<LastExport | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchBibleData = async (): Promise<BibleData> => {
    const { data, error } = await supabase.functions.invoke('export-bible', {
      body: { projectId }
    });
    if (error) throw error;
    if (!data.ok) throw new Error(data.error);
    return data.data;
  };

  const handleExportJSON = async () => {
    setExportingJson(true);
    try {
      const data = await fetchBibleData();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `biblia-${projectTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setLastExport({ type: 'json', date: new Date() });
      toast.success('Biblia exportada como JSON');
    } catch (err) {
      console.error('Error exporting JSON:', err);
      toast.error('Error al exportar la biblia');
    } finally {
      setExportingJson(false);
    }
  };

  const handleExportNormal = async () => {
    setExportingNormal(true);
    try {
      const data = await fetchBibleData();
      setBibleData(data);
      setShowNormalPreview(true);
    } catch (err) {
      console.error('Error preparing Normal PDF:', err);
      toast.error('Error al preparar el PDF Normal');
    } finally {
      setExportingNormal(false);
    }
  };

  const handleExportPro = async () => {
    setExportingPro(true);
    try {
      const data = await fetchBibleData();
      setBibleData(data);
      setShowProPreview(true);
    } catch (err) {
      console.error('Error preparing PRO PDF:', err);
      toast.error('Error al preparar la biblia PRO');
    } finally {
      setExportingPro(false);
    }
  };

  const handlePrintNormal = useCallback(() => {
    window.print();
    setLastExport({ type: 'normal', date: new Date() });
    toast.success('Usa "Guardar como PDF" en el diálogo de impresión');
  }, []);

  const handlePrintPro = useCallback(() => {
    window.print();
    setLastExport({ type: 'pro', date: new Date() });
    toast.success('Usa "Guardar como PDF" en el diálogo de impresión');
  }, []);

  const isLoading = exportingJson || exportingNormal || exportingPro;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            disabled={isLoading}
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
            onClick={handleExportNormal}
            disabled={isLoading}
            className="gap-2"
          >
            {exportingNormal ? (
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
            disabled={isLoading}
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
              Último: <span className="font-medium">
                {lastExport.type === 'json' ? 'JSON' : lastExport.type === 'pro' ? 'PRO' : 'Normal'}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Normal Preview Dialog */}
      <Dialog open={showNormalPreview} onOpenChange={setShowNormalPreview}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[900px] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between no-print">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              PDF Normal Preview
            </DialogTitle>
            <Button 
              onClick={handlePrintNormal} 
              variant="outline"
              className="gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Guardar PDF
            </Button>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto bg-gray-100 p-4 rounded-lg">
            {bibleData && (
              <div ref={printRef}>
                <BibleNormalDocument data={bibleData} />
              </div>
            )}
          </div>

          <div className="flex-shrink-0 text-xs text-muted-foreground text-center pt-2 no-print">
            💡 <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl/Cmd + P</kbd> → "Guardar como PDF"
          </div>
        </DialogContent>
      </Dialog>

      {/* PRO Preview Dialog */}
      <Dialog open={showProPreview} onOpenChange={setShowProPreview}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[900px] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between no-print">
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Biblia PRO Preview
            </DialogTitle>
            <Button 
              onClick={handlePrintPro} 
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Guardar PDF
            </Button>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto bg-gray-100 p-4 rounded-lg">
            {bibleData && (
              <div ref={printRef}>
                <BibleProDocument data={bibleData} />
              </div>
            )}
          </div>

          <div className="flex-shrink-0 text-xs text-muted-foreground text-center pt-2 no-print">
            💡 <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl/Cmd + P</kbd> → "Guardar como PDF"
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
