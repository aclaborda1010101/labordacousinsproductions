import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, 
  Video, 
  Trash2, 
  CheckCircle2,
  Star,
  StarOff,
  Play,
  Eye
} from 'lucide-react';

interface Render {
  id: string;
  shot_id: string;
  video_url: string | null;
  status: string;
  engine: string | null;
  take_label: string | null;
  locked: boolean | null;
  created_at: string;
  prompt_text: string | null;
}

interface TakesManagerProps {
  shotId: string;
  onTakeSelected?: (render: Render | null) => void;
}

export default function TakesManager({ shotId, onTakeSelected }: TakesManagerProps) {
  const [takes, setTakes] = useState<Render[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Load all takes for this shot
  useEffect(() => {
    const loadTakes = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('renders')
          .select('*')
          .eq('shot_id', shotId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const typedTakes = (data || []) as Render[];
        setTakes(typedTakes);
        
        // Auto-select locked take or first successful take
        const lockedTake = typedTakes.find(t => t.locked);
        const firstSuccessful = typedTakes.find(t => t.status === 'succeeded' && t.video_url);
        const autoSelect = lockedTake || firstSuccessful;
        
        if (autoSelect) {
          setSelectedTakeId(autoSelect.id);
          onTakeSelected?.(autoSelect);
        }
      } catch (error) {
        console.error('Error loading takes:', error);
        toast.error('Error al cargar takes');
      } finally {
        setLoading(false);
      }
    };

    if (shotId) {
      loadTakes();
    }
  }, [shotId, onTakeSelected]);

  // Select a take as the "winner"
  const selectTake = async (takeId: string) => {
    try {
      // First, unlock all other takes for this shot
      await supabase
        .from('renders')
        .update({ locked: false })
        .eq('shot_id', shotId);

      // Lock the selected take
      const { error } = await supabase
        .from('renders')
        .update({ locked: true })
        .eq('id', takeId);

      if (error) throw error;

      // Update local state
      setTakes(prev => prev.map(t => ({
        ...t,
        locked: t.id === takeId
      })));
      
      setSelectedTakeId(takeId);
      const selectedTake = takes.find(t => t.id === takeId);
      onTakeSelected?.(selectedTake || null);
      
      toast.success('Take seleccionado como definitivo');
    } catch (error) {
      console.error('Error selecting take:', error);
      toast.error('Error al seleccionar take');
    }
  };

  // Delete a take
  const deleteTake = async (takeId: string) => {
    try {
      const take = takes.find(t => t.id === takeId);
      if (take?.locked) {
        toast.error('No puedes eliminar el take seleccionado');
        return;
      }

      const { error } = await supabase
        .from('renders')
        .delete()
        .eq('id', takeId);

      if (error) throw error;

      setTakes(prev => prev.filter(t => t.id !== takeId));
      toast.success('Take eliminado');
    } catch (error) {
      console.error('Error deleting take:', error);
      toast.error('Error al eliminar take');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getEngineLabel = (engine: string | null) => {
    if (!engine) return 'Unknown';
    if (engine.toLowerCase().includes('o1') || engine.toLowerCase().includes('omni')) return 'Kling O1';
    if (engine.includes('kling')) return 'Kling 2.0';
    switch (engine) {
      case 'veo': return 'Veo 3.1';
      case 'lovable': return 'Keyframe';
      default: return engine;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (takes.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <Video className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No hay takes generados aún</p>
        <p className="text-xs mt-1">Genera un video en la pestaña "Generar"</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" />
            <span className="font-medium">Takes / Clips</span>
            <Badge variant="outline" className="text-xs">
              {takes.length} {takes.length === 1 ? 'take' : 'takes'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Selecciona el take que usarás en la edición final
          </p>
        </div>
      </div>

      {/* Takes grid */}
      <ScrollArea className="h-[300px]">
        <div className="grid gap-3 pr-4">
          {takes.map((take, index) => {
            const isSelected = take.locked;
            const isPreviewing = previewingId === take.id;

            return (
              <div
                key={take.id}
                className={`relative p-3 rounded-lg border-2 transition-all cursor-pointer ${
                  isSelected 
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30' 
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setPreviewingId(isPreviewing ? null : take.id)}
              >
                <div className="flex gap-3">
                  {/* Thumbnail */}
                  <div className="w-24 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                    {take.video_url ? (
                      isPreviewing ? (
                        <video
                          src={take.video_url}
                          className="w-full h-full object-cover"
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                      ) : (
                        <div className="w-full h-full bg-muted/80 flex items-center justify-center">
                          <Play className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-6 h-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            Take {takes.length - index}
                          </span>
                          {isSelected && (
                            <Badge variant="default" className="text-[10px] bg-green-600">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Seleccionado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">
                            {getEngineLabel(take.engine)}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDate(take.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1">
                        {take.video_url && (
                          <Button
                            size="icon"
                            variant={isSelected ? "default" : "ghost"}
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectTake(take.id);
                            }}
                          >
                            {isSelected ? (
                              <Star className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <StarOff className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                        
                        {take.video_url && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(take.video_url!, '_blank');
                            }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {!isSelected && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTake(take.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="mt-2">
                      {take.status === 'succeeded' && take.video_url ? (
                        <span className="text-[10px] text-green-600">✓ Video disponible</span>
                      ) : take.status === 'failed' ? (
                        <span className="text-[10px] text-amber-600">⚠ Solo keyframe</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{take.status}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded preview */}
                {isPreviewing && take.video_url && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <video
                      src={take.video_url}
                      controls
                      className="w-full rounded"
                      autoPlay
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Selected take info */}
      {selectedTakeId && (
        <div className="p-3 bg-primary/5 rounded-lg text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="font-medium">Take seleccionado para la edición final</span>
          </div>
          <p className="text-muted-foreground mt-1">
            Este take se usará cuando exportes el proyecto
          </p>
        </div>
      )}
    </div>
  );
}
