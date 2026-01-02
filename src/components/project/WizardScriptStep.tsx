import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  FileText, Lightbulb, Pencil, ArrowRight, BookOpen, Wand2, Loader2, 
  Sparkles, ChevronDown, ChevronRight, Users, MapPin, Package, Download,
  Check, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';

interface GeneratedCharacter {
  name: string;
  role?: string;
  description?: string;
  arc?: string;
  first_appearance?: string;
}

interface GeneratedLocation {
  name: string;
  type?: string;
  description?: string;
  scenes_count?: number;
}

interface GeneratedProp {
  name: string;
  importance?: string;
  description?: string;
}

interface GeneratedEpisode {
  episode_number?: number;
  title: string;
  synopsis?: string;
  summary?: string;
  duration_min?: number;
  scenes?: Array<{
    slugline?: string;
    description?: string;
    characters?: string[];
  }>;
}

interface BeatSheetItem {
  beat: string;
  description: string;
  page_range?: string;
}

export interface GeneratedScript {
  title?: string;
  logline?: string;
  synopsis?: string;
  genre?: string;
  tone?: string;
  themes?: string[];
  beat_sheet?: BeatSheetItem[];
  episodes?: GeneratedEpisode[];
  characters?: GeneratedCharacter[];
  locations?: GeneratedLocation[];
  props?: GeneratedProp[];
  screenplay?: string;
}

interface EntitySelection {
  characters: Record<string, boolean>;
  locations: Record<string, boolean>;
  props: Record<string, boolean>;
}

interface WizardScriptStepProps {
  format: 'series' | 'mini' | 'film';
  episodesCount: number;
  targetDuration: number;
  masterLanguage: string;
  scriptMode: 'idea' | 'import' | 'skip';
  setScriptMode: (mode: 'idea' | 'import' | 'skip') => void;
  scriptIdea: string;
  setScriptIdea: (idea: string) => void;
  scriptGenre: string;
  setScriptGenre: (genre: string) => void;
  scriptTone: string;
  setScriptTone: (tone: string) => void;
  scriptText: string;
  setScriptText: (text: string) => void;
  generatedScript: GeneratedScript | null;
  setGeneratedScript: (script: GeneratedScript | null) => void;
  onShootoutDataReady: (character: { name: string; bio: string }, location: { name: string; description: string }) => void;
  setProjectTitle?: (title: string) => void;
}

const GENRE_OPTIONS = [
  { value: 'drama', label: 'Drama' },
  { value: 'thriller', label: 'Thriller' },
  { value: 'comedy', label: 'Comedia' },
  { value: 'action', label: 'Acción' },
  { value: 'horror', label: 'Terror' },
  { value: 'sci-fi', label: 'Ciencia Ficción' },
  { value: 'romance', label: 'Romance' },
  { value: 'fantasy', label: 'Fantasía' },
  { value: 'crime', label: 'Crimen' },
];

const TONE_OPTIONS = [
  { value: 'Cinematográfico realista', label: 'Cinematográfico realista' },
  { value: 'Oscuro y tenso', label: 'Oscuro y tenso' },
  { value: 'Ligero y entretenido', label: 'Ligero y entretenido' },
  { value: 'Épico y grandioso', label: 'Épico y grandioso' },
  { value: 'Intimista y emocional', label: 'Intimista y emocional' },
  { value: 'Estilizado y visual', label: 'Estilizado y visual' },
];

const PROGRESS_STAGES = [
  { key: 'init', label: 'Inicializando...', progress: 5 },
  { key: 'analyzing', label: 'Analizando idea y género...', progress: 15 },
  { key: 'structure', label: 'Creando estructura narrativa...', progress: 30 },
  { key: 'characters', label: 'Desarrollando personajes...', progress: 45 },
  { key: 'locations', label: 'Definiendo localizaciones...', progress: 55 },
  { key: 'episodes', label: 'Escribiendo episodios...', progress: 70 },
  { key: 'screenplay', label: 'Generando guion completo...', progress: 85 },
  { key: 'finalizing', label: 'Finalizando...', progress: 95 },
  { key: 'done', label: '¡Completado!', progress: 100 },
];

export function WizardScriptStep({
  format,
  episodesCount,
  targetDuration,
  masterLanguage,
  scriptMode,
  setScriptMode,
  scriptIdea,
  setScriptIdea,
  scriptGenre,
  setScriptGenre,
  scriptTone,
  setScriptTone,
  scriptText,
  setScriptText,
  generatedScript,
  setGeneratedScript,
  onShootoutDataReady,
  setProjectTitle,
}: WizardScriptStepProps) {
  const [generating, setGenerating] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<number, boolean>>({});
  const [entitySelection, setEntitySelection] = useState<EntitySelection>({
    characters: {},
    locations: {},
    props: {},
  });

  // Initialize entity selection when script is generated
  useEffect(() => {
    if (generatedScript) {
      const charSel: Record<string, boolean> = {};
      const locSel: Record<string, boolean> = {};
      const propSel: Record<string, boolean> = {};
      
      generatedScript.characters?.forEach((c, i) => { charSel[`char_${i}`] = true; });
      generatedScript.locations?.forEach((l, i) => { locSel[`loc_${i}`] = true; });
      generatedScript.props?.forEach((p, i) => { propSel[`prop_${i}`] = true; });
      
      setEntitySelection({ characters: charSel, locations: locSel, props: propSel });
    }
  }, [generatedScript]);

  const generateScriptFromIdea = async () => {
    if (!scriptIdea.trim()) {
      toast.error('Escribe una idea para generar el guion');
      return;
    }
    
    setGenerating(true);
    setProgressStage(0);

    // Simulate progress stages
    const progressInterval = setInterval(() => {
      setProgressStage(prev => {
        if (prev < PROGRESS_STAGES.length - 2) return prev + 1;
        return prev;
      });
    }, 3000);

    try {
      const { data, error } = await supabase.functions.invoke('script-generate', {
        body: {
          idea: scriptIdea,
          genre: scriptGenre,
          tone: scriptTone,
          format: format === 'film' ? 'film' : 'series',
          episodesCount: format === 'film' ? 1 : episodesCount,
          episodeDurationMin: targetDuration,
          language: masterLanguage === 'es' ? 'es-ES' : masterLanguage,
        }
      });

      clearInterval(progressInterval);

      if (error) throw error;

      if (data?.script) {
        setProgressStage(PROGRESS_STAGES.length - 1);
        setGeneratedScript(data.script);
        
        // Auto-fill title
        if (data.script.title && setProjectTitle) {
          setProjectTitle(data.script.title);
        }
        
        // Auto-fill shootout data
        if (data.script.characters?.length > 0) {
          const mainChar = data.script.characters[0];
          const mainLoc = data.script.locations?.[0];
          onShootoutDataReady(
            { name: mainChar.name, bio: mainChar.description || '' },
            { name: mainLoc?.name || 'Localización principal', description: mainLoc?.description || '' }
          );
        }
        
        toast.success('Guion generado correctamente');
      } else {
        toast.error('No se pudo generar el guion');
      }
    } catch (err: any) {
      console.error('Error generating script:', err);
      clearInterval(progressInterval);
      if (err.message?.includes('429')) {
        toast.error('Rate limit alcanzado. Espera un momento.');
      } else if (err.message?.includes('402')) {
        toast.error('Créditos agotados.');
      } else {
        toast.error('Error al generar guion');
      }
    }
    
    setGenerating(false);
  };

  const toggleEntitySelection = (type: keyof EntitySelection, key: string) => {
    setEntitySelection(prev => ({
      ...prev,
      [type]: { ...prev[type], [key]: !prev[type][key] }
    }));
  };

  const selectAllEntities = (type: keyof EntitySelection, selected: boolean) => {
    const newSelection: Record<string, boolean> = {};
    if (type === 'characters') {
      generatedScript?.characters?.forEach((_, i) => { newSelection[`char_${i}`] = selected; });
    } else if (type === 'locations') {
      generatedScript?.locations?.forEach((_, i) => { newSelection[`loc_${i}`] = selected; });
    } else {
      generatedScript?.props?.forEach((_, i) => { newSelection[`prop_${i}`] = selected; });
    }
    setEntitySelection(prev => ({ ...prev, [type]: newSelection }));
  };

  const getSelectedEntities = () => {
    const chars = generatedScript?.characters?.filter((_, i) => entitySelection.characters[`char_${i}`]) || [];
    const locs = generatedScript?.locations?.filter((_, i) => entitySelection.locations[`loc_${i}`]) || [];
    const props = generatedScript?.props?.filter((_, i) => entitySelection.props[`prop_${i}`]) || [];
    return { characters: chars, locations: locs, props };
  };

  const exportEpisodePDF = (episode: GeneratedEpisode, index: number) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(20, 20, 25);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(generatedScript?.title || 'Guion', 14, 25);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(`Episodio ${index + 1}: ${episode.title}`, 14, 35);
    
    let yPos = 55;
    
    // Synopsis
    if (episode.synopsis || episode.summary) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.text('SINOPSIS:', 14, yPos);
      yPos += 7;
      
      const synopsis = episode.synopsis || episode.summary || '';
      const synopsisLines = doc.splitTextToSize(synopsis, pageWidth - 28);
      doc.setFont('helvetica', 'normal');
      doc.text(synopsisLines, 14, yPos);
      yPos += synopsisLines.length * 5 + 10;
    }

    // Scenes if available
    if (episode.scenes?.length) {
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('ESCENAS:', 14, yPos);
      yPos += 10;

      episode.scenes.forEach((scene, sIdx) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${sIdx + 1}. ${scene.slugline || 'ESCENA'}`, 14, yPos);
        yPos += 6;
        
        if (scene.description) {
          doc.setFont('helvetica', 'normal');
          const descLines = doc.splitTextToSize(scene.description, pageWidth - 28);
          doc.text(descLines, 14, yPos);
          yPos += descLines.length * 5 + 5;
        }
        
        if (scene.characters?.length) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 100, 100);
          doc.text(`Personajes: ${scene.characters.join(', ')}`, 14, yPos);
          yPos += 8;
        }
      });
    }

    // Characters list
    if (generatedScript?.characters?.length) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('PERSONAJES:', 14, yPos);
      yPos += 8;
      
      generatedScript.characters.forEach(char => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`• ${char.name}`, 14, yPos);
        if (char.role) {
          doc.setFont('helvetica', 'normal');
          doc.text(` (${char.role})`, 14 + doc.getTextWidth(`• ${char.name}`), yPos);
        }
        yPos += 5;
        if (char.description) {
          doc.setFont('helvetica', 'normal');
          const descLines = doc.splitTextToSize(char.description, pageWidth - 35);
          doc.text(descLines, 20, yPos);
          yPos += descLines.length * 4 + 3;
        }
      });
    }

    // Locations list
    if (generatedScript?.locations?.length) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      yPos += 5;
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('LOCALIZACIONES:', 14, yPos);
      yPos += 8;
      
      generatedScript.locations.forEach(loc => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`• ${loc.name}`, 14, yPos);
        if (loc.type) {
          doc.setFont('helvetica', 'normal');
          doc.text(` (${loc.type})`, 14 + doc.getTextWidth(`• ${loc.name}`), yPos);
        }
        yPos += 5;
        if (loc.description) {
          doc.setFont('helvetica', 'normal');
          const descLines = doc.splitTextToSize(loc.description, pageWidth - 35);
          doc.text(descLines, 20, yPos);
          yPos += descLines.length * 4 + 3;
        }
      });
    }

    // Props list
    if (generatedScript?.props?.length) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      yPos += 5;
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('OBJETOS/PROPS:', 14, yPos);
      yPos += 8;
      
      generatedScript.props.forEach(prop => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`• ${prop.name}`, 14, yPos);
        if (prop.importance) {
          doc.setFont('helvetica', 'normal');
          doc.text(` [${prop.importance}]`, 14 + doc.getTextWidth(`• ${prop.name}`), yPos);
        }
        yPos += 5;
      });
    }
    
    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `${generatedScript?.title || 'Guion'} - Ep.${index + 1} - Página ${i}/${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
    
    doc.save(`${(generatedScript?.title || 'guion').replace(/[^a-zA-Z0-9]/g, '_')}_ep${index + 1}.pdf`);
    toast.success(`Episodio ${index + 1} exportado`);
  };

  const currentProgress = PROGRESS_STAGES[progressStage];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-500" />
          Tu guion o idea
        </h2>
        <p className="text-muted-foreground">Genera desde una idea, importa un guion o sáltalo para después</p>
      </div>

      {/* Script mode selector */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => setScriptMode('idea')}
          disabled={generating}
          className={cn(
            "p-4 rounded-lg border text-center transition-all",
            scriptMode === 'idea' ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/50",
            generating && "opacity-50 cursor-not-allowed"
          )}
        >
          <Lightbulb className={cn("w-6 h-6 mx-auto mb-2", scriptMode === 'idea' ? "text-amber-500" : "text-muted-foreground")} />
          <div className="font-medium text-sm">Desde idea</div>
          <div className="text-xs text-muted-foreground">IA genera todo</div>
        </button>
        <button
          onClick={() => setScriptMode('import')}
          disabled={generating}
          className={cn(
            "p-4 rounded-lg border text-center transition-all",
            scriptMode === 'import' ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/50",
            generating && "opacity-50 cursor-not-allowed"
          )}
        >
          <Pencil className={cn("w-6 h-6 mx-auto mb-2", scriptMode === 'import' ? "text-amber-500" : "text-muted-foreground")} />
          <div className="font-medium text-sm">Importar guion</div>
          <div className="text-xs text-muted-foreground">Tengo escrito</div>
        </button>
        <button
          onClick={() => setScriptMode('skip')}
          disabled={generating}
          className={cn(
            "p-4 rounded-lg border text-center transition-all",
            scriptMode === 'skip' ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/50",
            generating && "opacity-50 cursor-not-allowed"
          )}
        >
          <ArrowRight className={cn("w-6 h-6 mx-auto mb-2", scriptMode === 'skip' ? "text-amber-500" : "text-muted-foreground")} />
          <div className="font-medium text-sm">Saltar</div>
          <div className="text-xs text-muted-foreground">Lo haré después</div>
        </button>
      </div>

      {/* Idea mode */}
      {scriptMode === 'idea' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tu idea *</Label>
            <Textarea
              placeholder="Ej: Una detective de homicidios descubre que su padre podría estar involucrado en una serie de asesinatos sin resolver de hace 20 años..."
              value={scriptIdea}
              onChange={(e) => setScriptIdea(e.target.value)}
              className="min-h-[100px]"
              disabled={generating}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Género</Label>
              <Select value={scriptGenre} onValueChange={setScriptGenre} disabled={generating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENRE_OPTIONS.map(g => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tono</Label>
              <Select value={scriptTone} onValueChange={setScriptTone} disabled={generating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Progress bar during generation */}
          {generating && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-amber-500/30">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                <span className="text-sm font-medium">{currentProgress.label}</span>
              </div>
              <Progress value={currentProgress.progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Generando guion completo con {format === 'film' ? 'escenas' : `${episodesCount} episodios`}, personajes, localizaciones y diálogos...
              </p>
            </div>
          )}

          {!generating && !generatedScript && (
            <Button 
              variant="gold" 
              onClick={generateScriptFromIdea} 
              disabled={scriptIdea.trim().length < 10}
              className="w-full"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Generar guion completo con IA
            </Button>
          )}

          {/* Generated content - FULL VIEW */}
          {generatedScript && !generating && (
            <div className="space-y-6">
              {/* Header with title and logline */}
              <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-primary/10 border border-amber-500/30">
                <div className="flex items-center gap-2 text-amber-500 mb-3">
                  <Sparkles className="w-5 h-5" />
                  <span className="font-semibold">Guion generado</span>
                  <Badge variant="cine" className="ml-auto">
                    {format === 'film' ? 'Película' : `${generatedScript.episodes?.length || episodesCount} episodios`}
                  </Badge>
                </div>
                
                {generatedScript.title && (
                  <h3 className="text-xl font-bold text-foreground">{generatedScript.title}</h3>
                )}
                
                {generatedScript.logline && (
                  <p className="text-sm text-muted-foreground mt-2 italic">"{generatedScript.logline}"</p>
                )}

                {generatedScript.synopsis && (
                  <p className="text-sm mt-3">{generatedScript.synopsis}</p>
                )}
              </div>

              {/* Episodes with collapsible content */}
              {generatedScript.episodes && generatedScript.episodes.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-amber-500" />
                      Episodios ({generatedScript.episodes.length})
                    </Label>
                  </div>
                  
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-2 pr-4">
                      {generatedScript.episodes.map((ep, idx) => (
                        <Collapsible 
                          key={idx} 
                          open={expandedEpisodes[idx]}
                          onOpenChange={(open) => setExpandedEpisodes(prev => ({ ...prev, [idx]: open }))}
                        >
                          <div className="rounded-lg border border-border bg-card overflow-hidden">
                            <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-3">
                                {expandedEpisodes[idx] ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                                <Badge variant="outline" className="text-xs">Ep {idx + 1}</Badge>
                                <span className="font-medium text-sm">{ep.title}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); exportEpisodePDF(ep, idx); }}
                                className="h-7 text-xs"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                PDF
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
                                {(ep.synopsis || ep.summary) && (
                                  <p className="text-sm text-muted-foreground">{ep.synopsis || ep.summary}</p>
                                )}
                                {ep.duration_min && (
                                  <Badge variant="secondary" className="text-xs">{ep.duration_min} min</Badge>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Entity selection panels */}
              <div className="grid gap-4">
                {/* Characters */}
                {generatedScript.characters && generatedScript.characters.length > 0 && (
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="font-semibold flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        Personajes ({generatedScript.characters.length})
                      </Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => selectAllEntities('characters', true)}>
                          <Check className="w-3 h-3 mr-1" />Todos
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => selectAllEntities('characters', false)}>
                          <X className="w-3 h-3 mr-1" />Ninguno
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {generatedScript.characters.map((char, idx) => (
                        <div 
                          key={idx} 
                          className={cn(
                            "flex items-start gap-3 p-2 rounded-lg transition-colors cursor-pointer",
                            entitySelection.characters[`char_${idx}`] ? "bg-primary/10" : "hover:bg-muted/50"
                          )}
                          onClick={() => toggleEntitySelection('characters', `char_${idx}`)}
                        >
                          <Checkbox 
                            checked={entitySelection.characters[`char_${idx}`] || false}
                            onCheckedChange={() => toggleEntitySelection('characters', `char_${idx}`)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{char.name}</span>
                              {char.role && <Badge variant="secondary" className="text-xs">{char.role}</Badge>}
                            </div>
                            {char.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{char.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Locations */}
                {generatedScript.locations && generatedScript.locations.length > 0 && (
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="font-semibold flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        Localizaciones ({generatedScript.locations.length})
                      </Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => selectAllEntities('locations', true)}>
                          <Check className="w-3 h-3 mr-1" />Todos
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => selectAllEntities('locations', false)}>
                          <X className="w-3 h-3 mr-1" />Ninguno
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {generatedScript.locations.map((loc, idx) => (
                        <div 
                          key={idx} 
                          className={cn(
                            "flex items-start gap-3 p-2 rounded-lg transition-colors cursor-pointer",
                            entitySelection.locations[`loc_${idx}`] ? "bg-primary/10" : "hover:bg-muted/50"
                          )}
                          onClick={() => toggleEntitySelection('locations', `loc_${idx}`)}
                        >
                          <Checkbox 
                            checked={entitySelection.locations[`loc_${idx}`] || false}
                            onCheckedChange={() => toggleEntitySelection('locations', `loc_${idx}`)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{loc.name}</span>
                              {loc.type && <Badge variant="outline" className="text-xs">{loc.type}</Badge>}
                            </div>
                            {loc.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{loc.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Props */}
                {generatedScript.props && generatedScript.props.length > 0 && (
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="font-semibold flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        Objetos/Props ({generatedScript.props.length})
                      </Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => selectAllEntities('props', true)}>
                          <Check className="w-3 h-3 mr-1" />Todos
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => selectAllEntities('props', false)}>
                          <X className="w-3 h-3 mr-1" />Ninguno
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {generatedScript.props.map((prop, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors",
                            entitySelection.props[`prop_${idx}`] 
                              ? "bg-primary/10 border-primary/50" 
                              : "hover:bg-muted/50 border-border"
                          )}
                          onClick={() => toggleEntitySelection('props', `prop_${idx}`)}
                        >
                          <Checkbox 
                            checked={entitySelection.props[`prop_${idx}`] || false}
                            onCheckedChange={() => toggleEntitySelection('props', `prop_${idx}`)}
                            className="w-3 h-3"
                          />
                          <span className="text-sm">{prop.name}</span>
                          {prop.importance === 'key' && <Badge variant="cine" className="text-xs h-4">Key</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Summary of selections */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Selección:</span>{' '}
                  {Object.values(entitySelection.characters).filter(Boolean).length} personajes,{' '}
                  {Object.values(entitySelection.locations).filter(Boolean).length} localizaciones,{' '}
                  {Object.values(entitySelection.props).filter(Boolean).length} objetos
                  <span className="text-xs ml-2">(se crearán al finalizar el proyecto)</span>
                </p>
              </div>

              {/* Regenerate button */}
              <Button 
                variant="outline" 
                onClick={() => { setGeneratedScript(null); }} 
                className="w-full"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Generar de nuevo
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Import mode */}
      {scriptMode === 'import' && (
        <div className="space-y-2">
          <Label>Pega tu guion *</Label>
          <Textarea
            placeholder="INT. CAFETERÍA - DÍA&#10;&#10;SARA (30s) espera nerviosa..."
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{scriptText.length} caracteres (mínimo 100)</p>
        </div>
      )}

      {/* Skip mode */}
      {scriptMode === 'skip' && (
        <div className="p-6 rounded-lg bg-muted/30 border border-border text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            Podrás crear o importar tu guion después desde la sección "Importar Guión" del proyecto.
          </p>
        </div>
      )}
    </div>
  );
}
