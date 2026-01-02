import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Wand2, 
  Loader2, 
  Plus, 
  Camera, 
  Clock,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

interface ShotSuggestion {
  shot_no: number;
  shot_type: string;
  duration_sec: number;
  camera_movement: string;
  blocking_action: string;
  dialogue?: string;
  intent: string;
  viewer_notice: string;
  ai_risk?: string;
  continuity_notes?: string;
}

interface Character {
  id: string;
  name: string;
  token?: string;
}

interface Location {
  id: string;
  name: string;
  token?: string;
}

interface ShotSuggestionPanelProps {
  sceneId: string;
  sceneSlugline: string;
  sceneSummary?: string;
  sceneTimeOfDay?: string;
  characters: Character[];
  location?: Location;
  qualityMode: 'CINE' | 'ULTRA';
  existingShotCount: number;
  onShotsAdded: () => void;
}

export default function ShotSuggestionPanel({
  sceneId,
  sceneSlugline,
  sceneSummary,
  sceneTimeOfDay,
  characters,
  location,
  qualityMode,
  existingShotCount,
  onShotsAdded
}: ShotSuggestionPanelProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ShotSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [additionalContext, setAdditionalContext] = useState('');
  const [adding, setAdding] = useState(false);

  const generateSuggestions = async () => {
    setLoading(true);
    setSuggestions([]);
    setSelectedSuggestions(new Set());

    try {
      const response = await supabase.functions.invoke('shot-suggest', {
        body: {
          scene: {
            slugline: sceneSlugline,
            summary: sceneSummary || '',
            time_of_day: sceneTimeOfDay
          },
          characters: characters.map(c => ({
            name: c.name,
            token: c.token
          })),
          location: location ? {
            name: location.name,
            token: location.token
          } : undefined,
          quality_mode: qualityMode,
          existing_shot_count: existingShotCount,
          additional_context: additionalContext || undefined
        }
      });

      if (response.error) {
        if (response.error.message?.includes('429')) {
          toast.error('Límite de solicitudes excedido. Intenta de nuevo en unos minutos.');
        } else if (response.error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Por favor añade fondos a tu cuenta.');
        } else {
          throw new Error(response.error.message);
        }
        return;
      }

      const data = response.data;
      if (data?.shots && Array.isArray(data.shots)) {
        setSuggestions(data.shots);
        // Auto-select all suggestions
        setSelectedSuggestions(new Set(data.shots.map((_: any, i: number) => i)));
        toast.success(`${data.shots.length} shots sugeridos`);
      } else {
        toast.error('No se recibieron sugerencias válidas');
      }
    } catch (error) {
      console.error('Error generating shot suggestions:', error);
      toast.error('Error al generar sugerencias');
    } finally {
      setLoading(false);
    }
  };

  const toggleSuggestion = (index: number) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedSuggestions(newSelected);
  };

  const addSelectedShots = async () => {
    if (selectedSuggestions.size === 0) {
      toast.error('Selecciona al menos un shot');
      return;
    }

    setAdding(true);
    try {
      const selectedShots = suggestions.filter((_, i) => selectedSuggestions.has(i));
      
      const shotsToInsert = selectedShots.map((shot, i) => ({
        scene_id: sceneId,
        shot_no: existingShotCount + i + 1,
        shot_type: shot.shot_type,
        duration_target: shot.duration_sec,
        effective_mode: qualityMode,
        dialogue_text: shot.dialogue || null,
        camera: {
          movement: shot.camera_movement
        },
        blocking: {
          action: shot.blocking_action,
          intention: shot.intent,
          viewer_notice: shot.viewer_notice,
          ai_risk: shot.ai_risk,
          continuity_notes: shot.continuity_notes
        }
      }));

      const { error } = await supabase.from('shots').insert(shotsToInsert);
      
      if (error) throw error;

      toast.success(`${selectedShots.length} shots añadidos`);
      setSuggestions([]);
      setSelectedSuggestions(new Set());
      onShotsAdded();
    } catch (error) {
      console.error('Error adding shots:', error);
      toast.error('Error al añadir shots');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">Shot Suggest AI</span>
        <Badge variant="outline" className="text-xs">{qualityMode}</Badge>
      </div>

      {suggestions.length === 0 ? (
        <div className="space-y-3">
          <Textarea
            placeholder="Contexto adicional (opcional): describe la acción, ritmo, o estilo que deseas..."
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <Button 
            onClick={generateSuggestions} 
            disabled={loading}
            className="w-full"
            variant="gold"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generando sugerencias...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Sugerir Shots con IA
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedSuggestions.size} de {suggestions.length} seleccionados
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selectedSuggestions.size === suggestions.length) {
                  setSelectedSuggestions(new Set());
                } else {
                  setSelectedSuggestions(new Set(suggestions.map((_, i) => i)));
                }
              }}
            >
              {selectedSuggestions.size === suggestions.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </Button>
          </div>

          <ScrollArea className="h-[300px]">
            <div className="space-y-2 pr-4">
              {suggestions.map((shot, index) => (
                <Card 
                  key={index}
                  className={`cursor-pointer transition-all ${
                    selectedSuggestions.has(index) 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => toggleSuggestion(index)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        selectedSuggestions.has(index) 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {selectedSuggestions.has(index) ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <span className="text-xs font-mono">{shot.shot_no}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs capitalize">
                            <Camera className="w-3 h-3 mr-1" />
                            {shot.shot_type}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            {shot.duration_sec}s
                          </Badge>
                          <span className="text-xs text-muted-foreground">{shot.camera_movement}</span>
                        </div>
                        <p className="text-sm text-foreground">{shot.blocking_action}</p>
                        {shot.dialogue && (
                          <p className="text-xs text-muted-foreground italic">"{shot.dialogue}"</p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ChevronRight className="w-3 h-3" />
                          <span>{shot.intent}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setSuggestions([]);
                setSelectedSuggestions(new Set());
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              variant="gold" 
              onClick={addSelectedShots}
              disabled={adding || selectedSuggestions.size === 0}
              className="flex-1"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Añadir {selectedSuggestions.size} Shots
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
