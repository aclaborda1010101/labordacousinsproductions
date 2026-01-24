/**
 * Series Bible Export
 * 
 * Exports the series bible to PDF format
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface SeriesBibleExportProps {
  bible: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = 'full' | 'summary' | 'pitch';

export function SeriesBibleExport({ bible, open, onOpenChange }: SeriesBibleExportProps) {
  const [format, setFormat] = useState<ExportFormat>('full');
  const [exporting, setExporting] = useState(false);

  const exportToPDF = async () => {
    setExporting(true);
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - 2 * margin;
      let y = margin;

      const addText = (text: string, fontSize: number = 10, isBold: boolean = false) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, contentWidth);
        
        if (y + lines.length * (fontSize * 0.4) > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          y = margin;
        }
        
        doc.text(lines, margin, y);
        y += lines.length * (fontSize * 0.4) + 4;
      };

      const addSection = (title: string) => {
        if (y > doc.internal.pageSize.getHeight() - 50) {
          doc.addPage();
          y = margin;
        }
        y += 8;
        addText(title.toUpperCase(), 14, true);
        y += 2;
      };

      // Title
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('BIBLIA DE SERIE', margin, y);
      y += 15;

      // Logline
      addText(bible.logline, 12, true);
      y += 5;

      // Premise
      if (format !== 'pitch') {
        addSection('Premisa');
        addText(bible.premise);
      }

      // Characters
      if (format === 'full' && bible.character_arcs?.length > 0) {
        addSection('Personajes');
        bible.character_arcs.forEach((char: any) => {
          addText(`${char.name} (${char.role})`, 11, true);
          addText(`Deseo: ${char.desire}`);
          addText(`Herida: ${char.wound}`);
          addText(`Máscara: ${char.mask}`);
          addText(`Línea roja: ${char.red_line}`);
          if (format === 'full') {
            addText(`Arco: ${char.season_arc}`);
          }
          y += 3;
        });
      }

      // Antagonism
      if (format !== 'pitch') {
        addSection('Fuerzas Antagonistas');
        if (bible.antagonism?.primary_forces?.length > 0) {
          addText('Fuerzas primarias: ' + bible.antagonism.primary_forces.join(', '));
        }
        if (bible.antagonism?.systemic_threats?.length > 0) {
          addText('Amenazas sistémicas: ' + bible.antagonism.systemic_threats.join(', '));
        }
      }

      // Season Structure
      addSection('Estructura de Temporada');
      addText(bible.season_structure?.season_logline || '', 11, true);
      addText(`Tema: ${bible.season_structure?.season_theme || ''}`);
      y += 3;

      if (bible.season_structure?.episodes?.length > 0) {
        bible.season_structure.episodes.forEach((ep: any) => {
          const bottleTag = ep.is_bottle ? ' [BOTTLE]' : '';
          addText(`Ep ${ep.number}: ${ep.title_suggestion}${bottleTag} (${ep.stake_level})`, 10, true);
          if (format === 'full') {
            addText(ep.synopsis);
          }
          y += 2;
        });
      }

      if (bible.season_structure?.season_cliffhanger) {
        y += 3;
        addText('CLIFFHANGER: ' + bible.season_structure.season_cliffhanger, 10, true);
      }

      // Episode Template
      if (format === 'full') {
        addSection('Plantilla de Episodio');
        addText(`TEASER: ${bible.episode_template?.teaser || ''}`);
        addText(`ACTO 1 (Tentación): ${bible.episode_template?.act_1_tentacion || ''}`);
        addText(`ACTO 2 (Intervención): ${bible.episode_template?.act_2_intervencion || ''}`);
        addText(`ACTO 3 (Coste): ${bible.episode_template?.act_3_coste || ''}`);
        addText(`TAG: ${bible.episode_template?.tag || ''}`);
      }

      // Tone Guidelines
      if (format !== 'pitch') {
        addSection('Directrices de Tono');
        if (bible.tone_guidelines?.promises?.length > 0) {
          addText('SIEMPRE entregamos:', 10, true);
          bible.tone_guidelines.promises.forEach((p: string) => addText(`• ${p}`));
        }
        y += 3;
        if (bible.tone_guidelines?.red_lines?.length > 0) {
          addText('NUNCA hacemos:', 10, true);
          bible.tone_guidelines.red_lines.forEach((r: string) => addText(`• ${r}`));
        }
      }

      // Artifact Rules (full only)
      if (format === 'full' && bible.artifact_rules) {
        addSection('Reglas del Artefacto');
        
        if (bible.artifact_rules.confirmed?.length > 0) {
          addText('CONFIRMADAS:', 10, true);
          bible.artifact_rules.confirmed.forEach((rule: any) => {
            addText(`• ${rule.rule}`);
            addText(`  (Fuente: ${rule.source})`, 8);
          });
        }
        
        if (bible.artifact_rules.undefined?.length > 0) {
          y += 3;
          addText('INDEFINIDAS (requieren decisión):', 10, true);
          bible.artifact_rules.undefined.forEach((aspect: any) => {
            addText(`• ${aspect.aspect}`);
            addText(`  SAFE: ${aspect.safe_option}`, 8);
            addText(`  BOLD: ${aspect.bold_option}`, 8);
          });
        }
      }

      // Footer
      const today = new Date().toLocaleDateString('es-ES');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${today} | Versión: ${bible.version}`, margin, doc.internal.pageSize.getHeight() - 10);

      // Save
      const formatNames = { full: 'Completa', summary: 'Resumen', pitch: 'Pitch' };
      doc.save(`biblia-serie-${formatNames[format].toLowerCase()}.pdf`);
      
      toast.success('PDF exportado correctamente');
      onOpenChange(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Error al exportar el PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Exportar Biblia de Serie
          </DialogTitle>
          <DialogDescription>
            Elige el formato de exportación según el uso que le darás.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)} className="space-y-3">
          <div className="flex items-start space-x-3 p-3 border rounded-lg">
            <RadioGroupItem value="full" id="full" className="mt-1" />
            <Label htmlFor="full" className="cursor-pointer flex-1">
              <span className="font-medium">Completa</span>
              <p className="text-sm text-muted-foreground">
                Incluye todo: personajes, reglas, episodios, plantilla. Para el equipo de guionistas.
              </p>
            </Label>
          </div>
          <div className="flex items-start space-x-3 p-3 border rounded-lg">
            <RadioGroupItem value="summary" id="summary" className="mt-1" />
            <Label htmlFor="summary" className="cursor-pointer flex-1">
              <span className="font-medium">Resumen</span>
              <p className="text-sm text-muted-foreground">
                Personajes, estructura y tono. Para productores o directores.
              </p>
            </Label>
          </div>
          <div className="flex items-start space-x-3 p-3 border rounded-lg">
            <RadioGroupItem value="pitch" id="pitch" className="mt-1" />
            <Label htmlFor="pitch" className="cursor-pointer flex-1">
              <span className="font-medium">Pitch</span>
              <p className="text-sm text-muted-foreground">
                Solo logline y estructura de temporada. Para presentaciones rápidas.
              </p>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={exportToPDF} disabled={exporting}>
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Descargar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
