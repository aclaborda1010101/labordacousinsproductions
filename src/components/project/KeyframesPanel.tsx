import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, 
  ImageIcon, 
  RefreshCw, 
  Check, 
  AlertTriangle,
  Camera,
  Play
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Shot {
  id: string;
  shot_no: number;
  shot_type: string;
  duration_target: number;
  effective_mode: 'CINE' | 'ULTRA';
  dialogue_text: string | null;
  camera?: any;
  blocking?: any;
}

interface KeyframeRow {
  id: string;
  shot_id: string;
  image_url: string | null;
  frame_type: string;
  timestamp_sec: number;
  approved: boolean;
}

interface Keyframe {
  id: string;
  shot_id: string;
  image_url: string | null;
  frame_type: 'initial' | 'intermediate' | 'final';
  timestamp_sec: number;
  approved: boolean;
}

interface Character {
  id: string;
  name: string;
  token?: string;
  turnaround_urls?: string[];
}

interface Location {
  id: string;
  name: string;
  reference_urls?: string[];
}

interface KeyframesPanelProps {
  sceneId: string;
  projectId: string;
  sceneSlugline: string;
  sceneSummary?: string;
  technicalDocStatus: 'draft' | 'approved' | 'locked' | null;
  characters?: Character[];
  location?: Location;
  visualStyle?: string;
}

export function KeyframesPanel({
  sceneId,
  projectId,
  sceneSlugline,
  sceneSummary,
  technicalDocStatus,
  characters = [],
  location,
  visualStyle
}: KeyframesPanelProps) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [keyframes, setKeyframes] = useState<Record<string, Keyframe[]>>({});
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingShot, setGeneratingShot] = useState<string | null>(null);
  const [generatingFrame, setGeneratingFrame] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  const isEnabled = technicalDocStatus === 'approved' || technicalDocStatus === 'locked';

  // Fetch shots for this scene
  const fetchShots = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('shots')
        .select('*')
        .eq('scene_id', sceneId)
        .order('shot_no', { ascending: true });

      if (error) throw error;
      setShots(data || []);
      
      // Auto-select first shot
      if (data && data.length > 0 && !selectedShotId) {
        setSelectedShotId(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching shots:', err);
    }
  }, [sceneId, selectedShotId]);

  // Fetch keyframes for all shots
  const fetchKeyframes = useCallback(async () => {
    if (shots.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('keyframes')
        .select('*')
        .in('shot_id', shots.map(s => s.id))
        .order('timestamp_sec', { ascending: true });

      if (error) throw error;

      // Group by shot_id - cast frame_type from DB string to our union type
      const grouped: Record<string, Keyframe[]> = {};
      (data || []).forEach(row => {
        const kf: Keyframe = {
          id: row.id,
          shot_id: row.shot_id,
          image_url: row.image_url,
          frame_type: row.frame_type as 'initial' | 'intermediate' | 'final',
          timestamp_sec: row.timestamp_sec,
          approved: row.approved ?? false,
        };
        if (!grouped[kf.shot_id]) grouped[kf.shot_id] = [];
        grouped[kf.shot_id].push(kf);
      });
      setKeyframes(grouped);
    } catch (err) {
      console.error('Error fetching keyframes:', err);
    } finally {
      setLoading(false);
    }
  }, [shots]);

  useEffect(() => {
    fetchShots();
  }, [fetchShots]);

  useEffect(() => {
    if (shots.length > 0) {
      fetchKeyframes();
    }
  }, [shots, fetchKeyframes]);

  // Get keyframe count indicator for a shot
  const getKeyframeIndicator = (shotId: string) => {
    const kfs = keyframes[shotId] || [];
    const count = kfs.length;
    const indicators = [];
    for (let i = 0; i < 3; i++) {
      indicators.push(
        <span
          key={i}
          className={cn(
            "w-2 h-2 rounded-full",
            i < count ? "bg-primary" : "bg-muted-foreground/30"
          )}
        />
      );
    }
    return indicators;
  };

  // Generate keyframes for a shot (3 frames: start, mid, end)
  const generateKeyframesForShot = async (shot: Shot) => {
    setGeneratingShot(shot.id);
    
    try {
      const duration = shot.duration_target || 6;
      const frameTypes: Array<{ type: 'initial' | 'intermediate' | 'final'; timestamp: number }> = [
        { type: 'initial', timestamp: 0 },
        { type: 'intermediate', timestamp: duration / 2 },
        { type: 'final', timestamp: duration }
      ];

      let previousKeyframeUrl: string | null = null;

      for (const frame of frameTypes) {
        setGeneratingFrame(frame.type);
        
        const { data, error } = await supabase.functions.invoke('generate-keyframe', {
          body: {
            shotId: shot.id,
            projectId,
            sceneDescription: `${sceneSlugline} - ${sceneSummary || ''}`,
            shotType: shot.shot_type,
            duration,
            frameType: frame.type,
            timestampSec: frame.timestamp,
            characters: characters.map(c => ({
              id: c.id,
              name: c.name,
              token: c.token,
            })),
            location: location ? {
              id: location.id,
              name: location.name,
            } : undefined,
            cameraMovement: shot.camera?.movement,
            blocking: shot.blocking,
            shotDetails: {
              focalMm: shot.camera?.focal_mm,
              lightingStyle: visualStyle,
              effectiveMode: shot.effective_mode,
            },
            previousKeyframeUrl,
          }
        });

        if (error) {
          console.error(`Error generating ${frame.type} keyframe:`, error);
          toast.error(`Error generando keyframe ${frame.type}`);
          continue;
        }

        // Store for next iteration's continuity
        if (data?.image_url) {
          previousKeyframeUrl = data.image_url;
        }
      }

      toast.success(`Keyframes generados para Shot ${shot.shot_no}`);
      await fetchKeyframes();
    } catch (err) {
      console.error('Error generating keyframes:', err);
      toast.error('Error al generar keyframes');
    } finally {
      setGeneratingShot(null);
      setGeneratingFrame(null);
    }
  };

  // Generate all keyframes for all shots
  const generateAllKeyframes = async () => {
    setGeneratingAll(true);
    
    for (const shot of shots) {
      if ((keyframes[shot.id] || []).length < 3) {
        await generateKeyframesForShot(shot);
      }
    }
    
    setGeneratingAll(false);
    toast.success('Todos los keyframes generados');
  };

  // Regenerate a single keyframe
  const regenerateKeyframe = async (shot: Shot, frameType: 'initial' | 'intermediate' | 'final') => {
    setGeneratingFrame(frameType);
    
    try {
      const duration = shot.duration_target || 6;
      const timestamp = frameType === 'initial' ? 0 : frameType === 'intermediate' ? duration / 2 : duration;

      const { error } = await supabase.functions.invoke('generate-keyframe', {
        body: {
          shotId: shot.id,
          projectId,
          sceneDescription: `${sceneSlugline} - ${sceneSummary || ''}`,
          shotType: shot.shot_type,
          duration,
          frameType,
          timestampSec: timestamp,
          characters: characters.map(c => ({
            id: c.id,
            name: c.name,
            token: c.token,
          })),
          location: location ? {
            id: location.id,
            name: location.name,
          } : undefined,
          cameraMovement: shot.camera?.movement,
          blocking: shot.blocking,
          shotDetails: {
            focalMm: shot.camera?.focal_mm,
            lightingStyle: visualStyle,
            effectiveMode: shot.effective_mode,
          },
        }
      });

      if (error) throw error;
      
      toast.success(`Keyframe ${frameType} regenerado`);
      await fetchKeyframes();
    } catch (err) {
      console.error('Error regenerating keyframe:', err);
      toast.error('Error al regenerar keyframe');
    } finally {
      setGeneratingFrame(null);
    }
  };

  const selectedShot = shots.find(s => s.id === selectedShotId);
  const selectedKeyframes = selectedShotId ? (keyframes[selectedShotId] || []) : [];

  // Get keyframe by type
  const getKeyframeByType = (type: 'initial' | 'intermediate' | 'final') => {
    return selectedKeyframes.find(kf => kf.frame_type === type);
  };

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Documento Técnico Pendiente
        </h3>
        <p className="text-muted-foreground max-w-md">
          Aprueba el Documento Técnico primero para habilitar la generación de keyframes.
          El documento debe estar en estado "Aprobado" o "Locked".
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Camera className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Sin Shots
        </h3>
        <p className="text-muted-foreground max-w-md">
          Genera shots en el Documento Técnico antes de crear keyframes.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Left: Shots List */}
      <div className="col-span-1 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Shots</span>
          <Badge variant="secondary">{shots.length}</Badge>
        </div>
        
        <ScrollArea className="h-[400px]">
          <div className="space-y-1 pr-2">
            {shots.map(shot => (
              <button
                key={shot.id}
                onClick={() => setSelectedShotId(shot.id)}
                className={cn(
                  "w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors",
                  selectedShotId === shot.id
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-muted/50 hover:bg-muted"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">S{String(shot.shot_no).padStart(3, '0')}</span>
                  <span className="text-xs text-muted-foreground">{shot.shot_type}</span>
                </div>
                <div className="flex gap-0.5">
                  {getKeyframeIndicator(shot.id)}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        <Button
          variant="lime"
          size="sm"
          className="w-full mt-2"
          onClick={generateAllKeyframes}
          disabled={generatingAll}
        >
          {generatingAll ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generando...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Generar Todos
            </>
          )}
        </Button>
      </div>

      {/* Right: Keyframe Grid */}
      <div className="col-span-3">
        {selectedShot ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">
                  Shot {selectedShot.shot_no} - {selectedShot.shot_type}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedShot.duration_target || 6}s · {selectedShot.effective_mode}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateKeyframesForShot(selectedShot)}
                disabled={generatingShot === selectedShot.id}
              >
                {generatingShot === selectedShot.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {generatingFrame || 'Generando...'}
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generar 3 Keyframes
                  </>
                )}
              </Button>
            </div>

            {/* 3-Column Keyframe Grid */}
            <div className="grid grid-cols-3 gap-4">
              {(['initial', 'intermediate', 'final'] as const).map((frameType, index) => {
                const kf = getKeyframeByType(frameType);
                const label = index === 0 ? 'Start' : index === 1 ? 'Mid' : 'End';
                
                return (
                  <Card key={frameType} className="overflow-hidden">
                    <div className="aspect-video bg-muted relative">
                      {kf?.image_url ? (
                        <img
                          src={kf.image_url}
                          alt={`${label} keyframe`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                      )}
                      
                      {kf?.approved && (
                        <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}

                      {generatingFrame === frameType && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{label}</p>
                          <p className="text-xs text-muted-foreground">
                            {kf ? `${kf.timestamp_sec}s` : 'Sin generar'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => regenerateKeyframe(selectedShot, frameType)}
                          disabled={!!generatingFrame}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Shot details */}
            {selectedShot.dialogue_text && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">
                  <strong>Diálogo:</strong> {selectedShot.dialogue_text}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Selecciona un shot para ver sus keyframes
          </div>
        )}
      </div>
    </div>
  );
}

export default KeyframesPanel;
