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
  Check, X, Film, Music, Volume2, MessageSquare, Database
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

interface SceneDialogue {
  character: string;
  parenthetical?: string;
  line: string;
}

interface GeneratedScene {
  scene_number?: number;
  slugline?: string;
  description?: string;
  characters?: string[];
  action?: string;
  dialogue?: SceneDialogue[];
  music_cue?: string;
  sfx?: string[];
  vfx?: string[];
  mood?: string;
}

interface GeneratedEpisode {
  episode_number?: number;
  title: string;
  synopsis?: string;
  summary?: string;
  duration_min?: number;
  scenes?: GeneratedScene[];
  screenplay_text?: string;
}

interface BeatSheetItem {
  beat: string;
  description: string;
  page_range?: string;
}

interface MusicDesign {
  name: string;
  type?: string;
  description?: string;
  scenes?: string[];
}

interface SFXDesign {
  category: string;
  description?: string;
  scenes?: string[];
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
  music_design?: MusicDesign[];
  sfx_design?: SFXDesign[];
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
  projectId?: string;
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
  projectId,
}: WizardScriptStepProps) {
  const [generating, setGenerating] = useState(false);
  const [creatingEntities, setCreatingEntities] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<number, boolean>>({});
  const [showFullScreenplay, setShowFullScreenplay] = useState(false);
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

  // Create entities in database
  const createEntitiesInDB = async (targetProjectId: string) => {
    if (!generatedScript) return;
    
    setCreatingEntities(true);
    const selected = getSelectedEntities();
    
    try {
      // Create characters
      for (const char of selected.characters) {
        await supabase.from('characters').insert({
          project_id: targetProjectId,
          name: char.name,
          role: char.description || '',
          bio: char.arc || '',
          character_role: char.role === 'protagonist' ? 'protagonist' : 
                         char.role === 'antagonist' || char.role === 'supporting' ? 'recurring' : 'episodic',
          profile_json: {
            description: char.description,
            arc: char.arc,
            first_appearance: char.first_appearance,
            relationships: (char as any).relationships,
            voice_notes: (char as any).voice_notes,
            personality: (char as any).personality
          }
        });
      }
      
      // Create locations
      for (const loc of selected.locations) {
        await supabase.from('locations').insert({
          project_id: targetProjectId,
          name: loc.name,
          description: loc.description || '',
          profile_json: {
            type: loc.type,
            atmosphere: (loc as any).atmosphere,
            scenes_count: loc.scenes_count,
            time_variants: (loc as any).time_variants
          }
        });
      }
      
      // Create props
      for (const prop of selected.props) {
        await supabase.from('props').insert({
          project_id: targetProjectId,
          name: prop.name,
          description: prop.description || '',
          prop_type: prop.importance,
          profile_json: {
            importance: prop.importance,
            scenes: (prop as any).scenes
          }
        });
      }
      
      toast.success(`Creados ${selected.characters.length} personajes, ${selected.locations.length} localizaciones, ${selected.props.length} props`);
    } catch (err) {
      console.error('Error creating entities:', err);
      toast.error('Error al crear algunas entidades');
    }
    
    setCreatingEntities(false);
  };

  // Expose create function for parent component
  (window as any).__wizardCreateEntities = createEntitiesInDB;

  const exportEpisodePDF = (episode: GeneratedEpisode, index: number) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    
    // Helper to check page break
    const checkPageBreak = (requiredSpace: number) => {
      if (yPos > 270 - requiredSpace) {
        doc.addPage();
        yPos = 20;
      }
    };
    
    // Header
    doc.setFillColor(20, 20, 25);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(generatedScript?.title || 'Guion', margin, 22);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(`Episodio ${index + 1}: ${episode.title}`, margin, 35);
    
    if (episode.duration_min) {
      doc.setFontSize(10);
      doc.setTextColor(180, 180, 180);
      doc.text(`Duración: ${episode.duration_min} min`, pageWidth - margin - 40, 35);
    }
    
    let yPos = 60;
    
    // Episode Summary (brief)
    if (episode.summary) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN:', margin, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'italic');
      const summaryLines = doc.splitTextToSize(episode.summary, contentWidth);
      doc.text(summaryLines, margin, yPos);
      yPos += summaryLines.length * 5 + 8;
    }
    
    // Episode Synopsis (detailed)
    if (episode.synopsis && episode.synopsis !== episode.summary) {
      checkPageBreak(30);
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('SINOPSIS DETALLADA:', margin, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      const synopsisLines = doc.splitTextToSize(episode.synopsis, contentWidth);
      doc.text(synopsisLines, margin, yPos);
      yPos += synopsisLines.length * 5 + 12;
    }

    // SCREENPLAY / SCENES WITH DIALOGUES
    if (episode.scenes?.length) {
      checkPageBreak(20);
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('GUIÓN COMPLETO', margin, yPos);
      yPos += 10;
      
      doc.setDrawColor(212, 175, 55);
      doc.line(margin, yPos - 3, pageWidth - margin, yPos - 3);
      yPos += 5;

      episode.scenes.forEach((scene, sIdx) => {
        checkPageBreak(40);
        
        // Slugline
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(11);
        doc.setFont('courier', 'bold');
        doc.text(`${scene.slugline || `ESCENA ${sIdx + 1}`}`, margin, yPos);
        yPos += 7;
        
        // Action/Description
        if (scene.action || scene.description) {
          doc.setFont('courier', 'normal');
          doc.setFontSize(10);
          const actionText = scene.action || scene.description || '';
          const actionLines = doc.splitTextToSize(actionText, contentWidth);
          doc.text(actionLines, margin, yPos);
          yPos += actionLines.length * 5 + 5;
        }
        
        // Dialogues
        if (scene.dialogue?.length) {
          scene.dialogue.forEach(dial => {
            checkPageBreak(25);
            
            // Character name (centered)
            doc.setFont('courier', 'bold');
            doc.setFontSize(10);
            const charNameWidth = doc.getTextWidth(dial.character.toUpperCase());
            doc.text(dial.character.toUpperCase(), (pageWidth - charNameWidth) / 2, yPos);
            yPos += 5;
            
            // Parenthetical
            if (dial.parenthetical) {
              doc.setFont('courier', 'italic');
              doc.setFontSize(9);
              const parenText = `(${dial.parenthetical})`;
              const parenWidth = doc.getTextWidth(parenText);
              doc.text(parenText, (pageWidth - parenWidth) / 2, yPos);
              yPos += 4;
            }
            
            // Dialogue line (centered, narrower margins)
            doc.setFont('courier', 'normal');
            doc.setFontSize(10);
            const dialogueMargin = 40;
            const dialogueWidth = pageWidth - dialogueMargin * 2;
            const dialogueLines = doc.splitTextToSize(dial.line, dialogueWidth);
            dialogueLines.forEach((line: string) => {
              doc.text(line, dialogueMargin, yPos);
              yPos += 5;
            });
            yPos += 3;
          });
        }
        
        // Music/SFX cues
        if (scene.music_cue) {
          checkPageBreak(10);
          doc.setFont('courier', 'italic');
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 150);
          doc.text(`♪ ${scene.music_cue}`, margin, yPos);
          yPos += 5;
        }
        
        if (scene.sfx?.length) {
          doc.setTextColor(100, 150, 100);
          doc.text(`SFX: ${scene.sfx.join(', ')}`, margin, yPos);
          yPos += 5;
        }
        
        doc.setTextColor(50, 50, 50);
        yPos += 8;
      });
    }
    
    // If no scenes but has screenplay_text
    if (episode.screenplay_text && !episode.scenes?.length) {
      checkPageBreak(20);
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('GUIÓN', margin, yPos);
      yPos += 10;
      
      doc.setFont('courier', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      const screenplayLines = doc.splitTextToSize(episode.screenplay_text, contentWidth);
      
      screenplayLines.forEach((line: string) => {
        checkPageBreak(6);
        doc.text(line, margin, yPos);
        yPos += 5;
      });
    }

    // Characters section
    if (generatedScript?.characters?.length) {
      doc.addPage();
      yPos = 20;
      
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('PERSONAJES', margin, yPos);
      yPos += 12;
      
      generatedScript.characters.forEach(char => {
        checkPageBreak(25);
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`${char.name}`, margin, yPos);
        if (char.role) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          doc.text(` — ${char.role}`, margin + doc.getTextWidth(`${char.name} `), yPos);
        }
        yPos += 6;
        
        if (char.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(50, 50, 50);
          const descLines = doc.splitTextToSize(char.description, contentWidth - 10);
          doc.text(descLines, margin + 5, yPos);
          yPos += descLines.length * 4 + 2;
        }
        
        if (char.arc) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.setTextColor(80, 80, 80);
          const arcLines = doc.splitTextToSize(`Arco: ${char.arc}`, contentWidth - 10);
          doc.text(arcLines, margin + 5, yPos);
          yPos += arcLines.length * 4 + 6;
        }
      });
    }

    // Locations section
    if (generatedScript?.locations?.length) {
      checkPageBreak(40);
      yPos += 10;
      
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('LOCALIZACIONES', margin, yPos);
      yPos += 12;
      
      generatedScript.locations.forEach(loc => {
        checkPageBreak(20);
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`${loc.name}`, margin, yPos);
        if (loc.type) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 100, 100);
          doc.text(` (${loc.type})`, margin + doc.getTextWidth(`${loc.name} `), yPos);
        }
        yPos += 6;
        
        if (loc.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(50, 50, 50);
          const descLines = doc.splitTextToSize(loc.description, contentWidth - 10);
          doc.text(descLines, margin + 5, yPos);
          yPos += descLines.length * 4 + 6;
        }
      });
    }

    // Props section
    if (generatedScript?.props?.length) {
      checkPageBreak(30);
      yPos += 10;
      
      doc.setTextColor(212, 175, 55);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('OBJETOS / PROPS', margin, yPos);
      yPos += 10;
      
      generatedScript.props.forEach(prop => {
        checkPageBreak(12);
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`• ${prop.name}`, margin, yPos);
        if (prop.importance) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          doc.text(` [${prop.importance}]`, margin + doc.getTextWidth(`• ${prop.name} `), yPos);
        }
        yPos += 5;
        if (prop.description) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(50, 50, 50);
          const descLines = doc.splitTextToSize(prop.description, contentWidth - 10);
          doc.text(descLines, margin + 10, yPos);
          yPos += descLines.length * 4 + 3;
        }
      });
    }
    
    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `${generatedScript?.title || 'Guion'} — Episodio ${index + 1} — Página ${i} de ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
    
    doc.save(`${(generatedScript?.title || 'guion').replace(/[^a-zA-Z0-9]/g, '_')}_ep${index + 1}.pdf`);
    toast.success(`Episodio ${index + 1} exportado con guión completo`);
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
                              <div className="px-4 pb-4 pt-2 border-t border-border space-y-4">
                                {/* Summary */}
                                {ep.summary && (
                                  <div className="p-3 rounded-lg bg-muted/30">
                                    <div className="text-xs font-semibold text-amber-500 mb-1">RESUMEN</div>
                                    <p className="text-sm">{ep.summary}</p>
                                  </div>
                                )}
                                
                                {/* Synopsis */}
                                {ep.synopsis && ep.synopsis !== ep.summary && (
                                  <div>
                                    <div className="text-xs font-semibold text-muted-foreground mb-1">SINOPSIS DETALLADA</div>
                                    <p className="text-sm text-muted-foreground">{ep.synopsis}</p>
                                  </div>
                                )}
                                
                                {/* Scenes with dialogues */}
                                {ep.scenes && ep.scenes.length > 0 && (
                                  <div className="space-y-3">
                                    <div className="text-xs font-semibold text-amber-500 flex items-center gap-1">
                                      <Film className="w-3 h-3" />
                                      ESCENAS ({ep.scenes.length})
                                    </div>
                                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                                      {ep.scenes.slice(0, 5).map((scene, sIdx) => (
                                        <div key={sIdx} className="p-2 rounded border border-border/50 bg-card/50 text-xs space-y-1">
                                          <div className="font-mono font-bold text-foreground">{scene.slugline}</div>
                                          {scene.description && (
                                            <p className="text-muted-foreground line-clamp-2">{scene.description}</p>
                                          )}
                                          {scene.dialogue && scene.dialogue.length > 0 && (
                                            <div className="mt-2 pl-2 border-l-2 border-amber-500/30 space-y-1">
                                              <div className="flex items-center gap-1 text-amber-600">
                                                <MessageSquare className="w-3 h-3" />
                                                <span className="font-medium">Diálogos</span>
                                              </div>
                                              {scene.dialogue.slice(0, 3).map((d, dIdx) => (
                                                <div key={dIdx} className="text-muted-foreground">
                                                  <span className="font-semibold">{d.character}:</span> "{d.line.substring(0, 80)}{d.line.length > 80 ? '...' : ''}"
                                                </div>
                                              ))}
                                              {scene.dialogue.length > 3 && (
                                                <span className="text-muted-foreground">+{scene.dialogue.length - 3} más...</span>
                                              )}
                                            </div>
                                          )}
                                          {scene.music_cue && (
                                            <div className="flex items-center gap-1 text-purple-400">
                                              <Music className="w-3 h-3" />
                                              <span>{scene.music_cue}</span>
                                            </div>
                                          )}
                                          {scene.sfx && scene.sfx.length > 0 && (
                                            <div className="flex items-center gap-1 text-green-400">
                                              <Volume2 className="w-3 h-3" />
                                              <span>{scene.sfx.join(', ')}</span>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      {ep.scenes.length > 5 && (
                                        <p className="text-xs text-muted-foreground text-center">
                                          +{ep.scenes.length - 5} escenas más en el PDF
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-2">
                                  {ep.duration_min && (
                                    <Badge variant="secondary" className="text-xs">{ep.duration_min} min</Badge>
                                  )}
                                  {ep.scenes?.length && (
                                    <Badge variant="outline" className="text-xs">{ep.scenes.length} escenas</Badge>
                                  )}
                                </div>
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

              {/* Summary of selections + Create button */}
              <div className="p-4 rounded-lg bg-gradient-to-r from-primary/5 to-amber-500/5 border border-primary/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Database className="w-4 h-4 text-primary" />
                      Entidades a crear
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Object.values(entitySelection.characters).filter(Boolean).length} personajes,{' '}
                      {Object.values(entitySelection.locations).filter(Boolean).length} localizaciones,{' '}
                      {Object.values(entitySelection.props).filter(Boolean).length} objetos
                    </p>
                  </div>
                  {projectId && (
                    <Button 
                      variant="gold"
                      size="sm"
                      onClick={() => createEntitiesInDB(projectId)}
                      disabled={creatingEntities}
                    >
                      {creatingEntities ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Database className="w-4 h-4 mr-2" />
                      )}
                      Crear ahora
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {projectId ? 'Pulsa para crear las entidades en la base de datos' : 'Se crearán automáticamente al finalizar el wizard'}
                </p>
              </div>

              {/* Full screenplay toggle */}
              {generatedScript.screenplay && (
                <Collapsible open={showFullScreenplay} onOpenChange={setShowFullScreenplay}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Ver guión completo
                      </span>
                      {showFullScreenplay ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ScrollArea className="h-[300px] mt-3 p-4 rounded-lg border border-border bg-card">
                      <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                        {generatedScript.screenplay}
                      </pre>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
              )}

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
