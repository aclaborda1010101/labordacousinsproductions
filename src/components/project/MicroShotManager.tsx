/**
 * MicroShotManager Component
 * Manages micro-shots within a shot, including subdivision, keyframe assignment,
 * and video generation with chained keyframes
 */

import { useState, useEffect, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useMicroShots, MicroShot, Keyframe } from '@/hooks/useMicroShots';
import { toast } from 'sonner';
import {
  Loader2,
  Scissors,
  Link2,
  Play,
  Pause,
  Video,
  Image as ImageIcon,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  Clock,
  Film
} from 'lucide-react';

interface MicroShotManagerProps {
  shotId: string;
  duration: number;
  onMicroShotsChange?: (microShots: MicroShot[]) => void;
}

export default function MicroShotManager({
  shotId,
  duration,
  onMicroShotsChange
}: MicroShotManagerProps) {
  const [microDuration, setMicroDuration] = useState<string>('2');
  const [selectedEngine, setSelectedEngine] = useState<'kling' | 'veo'>('kling');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0);
  const [keyframesMap, setKeyframesMap] = useState<Record<string, Keyframe>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const {
    microShots,
    loading,
    error,
    subdivide,
    assignKeyframes,
    generateVideo,
    generateAllVideos,
    pollVideoStatus,
    refresh
  } = useMicroShots({ shotId, enabled: true });

  // Notify parent of changes
  useEffect(() => {
    onMicroShotsChange?.(microShots);
  }, [microShots, onMicroShotsChange]);

  // Load keyframes for display
  useEffect(() => {
    const loadKeyframes = async () => {
      const keyframeIds = new Set<string>();
      microShots.forEach(ms => {
        if (ms.keyframe_initial_id) keyframeIds.add(ms.keyframe_initial_id);
        if (ms.keyframe_final_id) keyframeIds.add(ms.keyframe_final_id);
      });

      if (keyframeIds.size === 0) return;

      const { data } = await supabase
        .from('keyframes')
        .select('*')
        .in('id', Array.from(keyframeIds));

      if (data) {
        const map: Record<string, Keyframe> = {};
        data.forEach(kf => {
          map[kf.id] = kf as Keyframe;
        });
        setKeyframesMap(map);
      }
    };

    loadKeyframes();
  }, [microShots]);

  // Playback logic
  useEffect(() => {
    if (!isPlaying || microShots.length === 0) return;

    const readyShots = microShots.filter(ms => ms.video_url);
    if (readyShots.length === 0) {
      setIsPlaying(false);
      return;
    }

    const interval = setInterval(() => {
      setCurrentPlayIndex(prev => (prev + 1) % readyShots.length);
    }, 2000); // 2s per clip for preview

    return () => clearInterval(interval);
  }, [isPlaying, microShots]);

  // Poll for generating videos
  useEffect(() => {
    const generatingShots = microShots.filter(ms => ms.video_status === 'generating');
    if (generatingShots.length === 0) return;

    const pollInterval = setInterval(() => {
      generatingShots.forEach(ms => pollVideoStatus(ms.id));
    }, 5000); // Poll every 5s

    return () => clearInterval(pollInterval);
  }, [microShots, pollVideoStatus]);

  const handleSubdivide = async () => {
    try {
      await subdivide(Number(microDuration));
    } catch (err) {
      console.error('[MicroShotManager] Subdivide error:', err);
    }
  };

  const handleAssignKeyframes = async () => {
    try {
      await assignKeyframes();
    } catch (err) {
      console.error('[MicroShotManager] Assign keyframes error:', err);
    }
  };

  const handleGenerateVideo = async (msId: string) => {
    setGeneratingId(msId);
    try {
      await generateVideo(msId, selectedEngine);
    } catch (err) {
      console.error('[MicroShotManager] Generate video error:', err);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateAll = async () => {
    try {
      await generateAllVideos(selectedEngine);
    } catch (err) {
      console.error('[MicroShotManager] Generate all error:', err);
    }
  };

  // Calculate progress
  const completedCount = microShots.filter(ms => ms.video_status === 'ready' || ms.video_status === 'approved').length;
  const progress = microShots.length > 0 ? (completedCount / microShots.length) * 100 : 0;

  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Listo</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-blue-600"><CheckCircle2 className="w-3 h-3 mr-1" />Aprobado</Badge>;
      case 'generating':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generando</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive text-sm">
        Error: {error}
        <Button variant="link" onClick={refresh}>Reintentar</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Film className="w-4 h-4" />
              Micro-Shots
            </CardTitle>
            <CardDescription>
              Segmentos de {microDuration}s para generación precisa de video
            </CardDescription>
          </div>
          {microShots.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {completedCount}/{microShots.length}
              </span>
              <Progress value={progress} className="w-24 h-2" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Duración:</Label>
            <Select value={microDuration} onValueChange={setMicroDuration}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1s</SelectItem>
                <SelectItem value="2">2s</SelectItem>
                <SelectItem value="3">3s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSubdivide}
            className="gap-1"
          >
            <Scissors className="w-3 h-3" />
            Subdividir
          </Button>

          {microShots.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAssignKeyframes}
                className="gap-1"
              >
                <Link2 className="w-3 h-3" />
                Encadenar KFs
              </Button>

              <div className="flex items-center gap-2 ml-auto">
                <Select value={selectedEngine} onValueChange={(v) => setSelectedEngine(v as 'kling' | 'veo')}>
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kling">Kling</SelectItem>
                    <SelectItem value="veo">Veo</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  onClick={handleGenerateAll}
                  className="gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Generar Todos
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Timeline Visualization */}
        {microShots.length > 0 && (
          <div className="space-y-3">
            {/* Timeline bar */}
            <div className="relative h-8 bg-muted rounded-lg overflow-hidden flex">
              {microShots.map((ms, idx) => {
                const widthPercent = (ms.duration_sec / duration) * 100;
                const hasInitialKf = ms.keyframe_initial_id && keyframesMap[ms.keyframe_initial_id]?.image_url;
                const hasVideo = !!ms.video_url;

                return (
                  <TooltipProvider key={ms.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-full border-r border-background flex items-center justify-center text-xs font-medium cursor-pointer transition-colors ${
                            hasVideo 
                              ? 'bg-green-600/80 text-white' 
                              : hasInitialKf 
                                ? 'bg-blue-600/60 text-white' 
                                : 'bg-muted-foreground/20 text-muted-foreground'
                          }`}
                          style={{ width: `${widthPercent}%` }}
                        >
                          {idx + 1}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>MS {ms.sequence_no}: {ms.start_sec}s - {ms.end_sec}s</p>
                        <p className="text-xs text-muted-foreground">{ms.video_status}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>

            {/* Keyframe Chain Visualization */}
            <ScrollArea className="w-full">
              <div className="flex items-center gap-1 py-2 min-w-max">
                {microShots.map((ms, idx) => {
                  const initialKf = ms.keyframe_initial_id ? keyframesMap[ms.keyframe_initial_id] : null;
                  const finalKf = ms.keyframe_final_id ? keyframesMap[ms.keyframe_final_id] : null;
                  const isSharedWithPrev = idx > 0 && microShots[idx - 1].keyframe_final_id === ms.keyframe_initial_id;

                  return (
                    <Fragment key={ms.id}>
                      {/* Initial Keyframe */}
                      <div className={`relative flex-shrink-0 ${isSharedWithPrev ? 'opacity-50' : ''}`}>
                        <div className="w-12 h-8 rounded border-2 border-dashed border-muted-foreground/30 bg-muted overflow-hidden">
                          {initialKf?.image_url ? (
                            <img 
                              src={initialKf.image_url} 
                              alt={`KF ${idx * 2}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        {initialKf?.approved && (
                          <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-green-500" />
                        )}
                        {isSharedWithPrev && (
                          <Link2 className="absolute -top-1 -left-1 w-3 h-3 text-blue-500" />
                        )}
                      </div>

                      {/* Video Segment */}
                      <div 
                        className="w-16 h-10 rounded bg-background border flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                        onClick={() => handleGenerateVideo(ms.id)}
                      >
                        {ms.video_status === 'generating' || generatingId === ms.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : ms.video_url ? (
                          <video 
                            src={ms.video_url} 
                            className="w-full h-full object-cover rounded"
                            muted
                          />
                        ) : (
                          <Video className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>

                      {/* Final Keyframe (only for last micro-shot or if different from next initial) */}
                      {(idx === microShots.length - 1 || 
                        (finalKf && microShots[idx + 1]?.keyframe_initial_id !== ms.keyframe_final_id)) && (
                        <div className="relative flex-shrink-0">
                          <div className="w-12 h-8 rounded border-2 border-dashed border-muted-foreground/30 bg-muted overflow-hidden">
                            {finalKf?.image_url ? (
                              <img 
                                src={finalKf.image_url} 
                                alt={`KF ${idx * 2 + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-3 h-3 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          {finalKf?.approved && (
                            <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-green-500" />
                          )}
                        </div>
                      )}

                      {/* Chain Arrow */}
                      {idx < microShots.length - 1 && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Playback Controls */}
            {microShots.some(ms => ms.video_url) && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="gap-1"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3 h-3" />
                      Pausar
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      Preview
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refresh}
                  className="gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {microShots.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Shot de {duration}s sin subdividir</p>
            <p className="text-xs mt-1">
              Haz clic en "Subdividir" para crear micro-shots de {microDuration}s
            </p>
          </div>
        )}

        {/* Micro-shots List */}
        {microShots.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Detalle de Micro-Shots</Label>
            <div className="grid gap-2">
              {microShots.map((ms, idx) => (
                <div 
                  key={ms.id}
                  className="flex items-center gap-3 p-2 rounded border bg-card text-sm"
                >
                  <div className="font-mono text-xs bg-muted px-2 py-1 rounded">
                    #{ms.sequence_no}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground">
                      {ms.start_sec}s → {ms.end_sec}s
                    </span>
                    {ms.motion_notes && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ms.motion_notes}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(ms.video_status)}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!ms.keyframe_initial_id || ms.video_status === 'generating'}
                    onClick={() => handleGenerateVideo(ms.id)}
                  >
                    {ms.video_status === 'generating' || generatingId === ms.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Video className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
