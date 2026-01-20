/**
 * MicroShotManager Component - Phase 5 Enhanced UI
 * Features: Provider selector, A→B toggle, anchor indicators, thumbnails
 */

import { useState, useEffect, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Film,
  Anchor,
  AlertTriangle,
  Zap,
  ArrowRightLeft,
  RotateCcw,
  Eye,
  Settings2
} from 'lucide-react';

// Provider configuration with A→B support info
const PROVIDER_CONFIG = {
  auto: { label: 'Auto', icon: Zap, supportsAB: true, color: 'text-purple-500' },
  kling: { label: 'Kling v2', icon: Film, supportsAB: true, color: 'text-orange-500' },
  runway: { label: 'Runway', icon: Video, supportsAB: true, color: 'text-blue-500' },
  veo: { label: 'Veo 3.1', icon: Sparkles, supportsAB: false, color: 'text-green-500' }
} as const;

type ProviderKey = keyof typeof PROVIDER_CONFIG;

interface MicroShotManagerProps {
  shotId: string;
  duration: number;
  continuityAnchorUrl?: string | null;
  providerPreference?: string;
  onMicroShotsChange?: (microShots: MicroShot[]) => void;
  onProviderChange?: (provider: string) => void;
}

export default function MicroShotManager({
  shotId,
  duration,
  continuityAnchorUrl,
  providerPreference = 'auto',
  onMicroShotsChange,
  onProviderChange
}: MicroShotManagerProps) {
  const [microDuration, setMicroDuration] = useState<string>('0.5'); // Hollywood Standard: 0.5s per microshot
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>(providerPreference as ProviderKey || 'auto');
  const [abModeEnabled, setAbModeEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0);
  const [keyframesMap, setKeyframesMap] = useState<Record<string, Keyframe>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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

  // Sync provider preference
  useEffect(() => {
    if (providerPreference && providerPreference !== selectedProvider) {
      setSelectedProvider(providerPreference as ProviderKey);
    }
  }, [providerPreference]);

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
    }, 2000);

    return () => clearInterval(interval);
  }, [isPlaying, microShots]);

  // Poll for generating videos
  useEffect(() => {
    const generatingShots = microShots.filter(ms => ms.video_status === 'generating');
    if (generatingShots.length === 0) return;

    const pollInterval = setInterval(() => {
      generatingShots.forEach(ms => pollVideoStatus(ms.id));
    }, 5000);

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

  const handleProviderChange = (value: string) => {
    const provider = value as ProviderKey;
    setSelectedProvider(provider);
    onProviderChange?.(provider);
    
    // Warn if switching to provider without A→B while in A→B mode
    if (abModeEnabled && !PROVIDER_CONFIG[provider].supportsAB) {
      toast.info('Veo no soporta A→B nativo. Se usará chaining automático.');
    }
  };

  const handleGenerateVideo = async (msId: string) => {
    setGeneratingId(msId);
    try {
      // Determine effective engine based on A→B mode
      const effectiveEngine = selectedProvider === 'auto' 
        ? (abModeEnabled ? 'kling' : 'veo')
        : selectedProvider;
      
      await generateVideo(msId, effectiveEngine as 'kling' | 'veo' | 'runway');
    } catch (err) {
      console.error('[MicroShotManager] Generate video error:', err);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateAll = async () => {
    try {
      const effectiveEngine = selectedProvider === 'auto' 
        ? (abModeEnabled ? 'kling' : 'veo')
        : selectedProvider;
      
      await generateAllVideos(effectiveEngine as 'kling' | 'veo' | 'runway');
    } catch (err) {
      console.error('[MicroShotManager] Generate all error:', err);
    }
  };

  const handleRegenerateMicroshot = async (msId: string) => {
    // Reset status and regenerate
    await supabase
      .from('micro_shots')
      .update({ video_status: 'pending', video_url: null, end_frame_image_url: null })
      .eq('id', msId);
    
    await refresh();
    await handleGenerateVideo(msId);
  };

  // Calculate progress
  const completedCount = microShots.filter(ms => ms.video_status === 'ready' || ms.video_status === 'approved').length;
  const progress = microShots.length > 0 ? (completedCount / microShots.length) * 100 : 0;

  // Check anchor status
  const hasAnchor = !!continuityAnchorUrl || microShots.some(ms => ms.keyframe_initial_id);
  const firstMsHasChain = microShots.length > 0 && (
    !!continuityAnchorUrl || 
    (microShots[0].keyframe_initial_id && keyframesMap[microShots[0].keyframe_initial_id]?.image_url)
  );

  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge variant="default" className="bg-green-600 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Listo</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-blue-600 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>;
      case 'generating':
        return <Badge variant="secondary" className="text-xs"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Gen...</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />Pend</Badge>;
    }
  };

  // Engine badge helper
  const getEngineBadge = (provider: string) => {
    const config = PROVIDER_CONFIG[provider as ProviderKey] || PROVIDER_CONFIG.auto;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`text-xs ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
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
          <div className="flex items-center gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Film className="w-4 h-4" />
                Micro-Shots Pipeline
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                {microShots.length > 0 ? (
                  <>
                    {microShots.length} segmentos × {microDuration}s
                    {getEngineBadge(selectedProvider)}
                  </>
                ) : (
                  `Shot de ${duration}s sin subdividir`
                )}
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Anchor Status Indicator */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                    firstMsHasChain 
                      ? 'bg-green-500/10 text-green-600' 
                      : 'bg-yellow-500/10 text-yellow-600'
                  }`}>
                    {firstMsHasChain ? (
                      <>
                        <Anchor className="w-3 h-3" />
                        Anchor OK
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        Sin Anchor
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {firstMsHasChain 
                    ? 'Continuidad asegurada desde shot anterior' 
                    : 'Falta imagen de continuidad del shot anterior'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Progress */}
            {microShots.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {completedCount}/{microShots.length}
                </span>
                <Progress value={progress} className="w-20 h-2" />
              </div>
            )}

            {/* Settings Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              {/* Provider Selector */}
              <div className="flex items-center gap-2">
                <Label className="text-xs">Motor:</Label>
                <Select value={selectedProvider} onValueChange={handleProviderChange}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <config.icon className={`w-3 h-3 ${config.color}`} />
                          <span>{config.label}</span>
                          {config.supportsAB && <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* A→B Mode Toggle */}
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="ab-mode"
                          checked={abModeEnabled}
                          onCheckedChange={setAbModeEnabled}
                        />
                        <Label htmlFor="ab-mode" className="text-xs flex items-center gap-1 cursor-pointer">
                          <ArrowRightLeft className="w-3 h-3" />
                          Modo A→B
                        </Label>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium">Transición A→B</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Usa frame inicial y final para guiar la generación (Kling, Runway).
                        Si está OFF, solo usa chaining con frame inicial.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {abModeEnabled && (
                  <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600">
                    <Zap className="w-3 h-3 mr-1" />
                    Start+End
                  </Badge>
                )}
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Duration Selector */}
              <div className="flex items-center gap-2">
                <Label className="text-xs">Duración:</Label>
                <Select value={microDuration} onValueChange={setMicroDuration}>
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5s</SelectItem>
                    <SelectItem value="1">1s</SelectItem>
                    <SelectItem value="2">2s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
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
                <Button
                  size="sm"
                  onClick={handleGenerateAll}
                  disabled={microShots.some(ms => ms.video_status === 'generating')}
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
            {/* Continuity Anchor Preview */}
            {continuityAnchorUrl && (
              <div className="flex items-center gap-2 p-2 bg-green-500/5 border border-green-500/20 rounded">
                <div className="w-12 h-8 rounded overflow-hidden border border-green-500/30">
                  <img 
                    src={continuityAnchorUrl} 
                    alt="Anchor" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-green-600 flex items-center gap-1">
                    <Anchor className="w-3 h-3" />
                    Continuity Anchor (Shot anterior)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Este frame inicia la cadena de microshots
                  </p>
                </div>
              </div>
            )}

            {/* Timeline bar */}
            <div className="relative h-8 bg-muted rounded-lg overflow-hidden flex">
              {microShots.map((ms, idx) => {
                const widthPercent = (ms.duration_sec / duration) * 100;
                const hasInitialKf = ms.keyframe_initial_id && keyframesMap[ms.keyframe_initial_id]?.image_url;
                const hasEndFrame = !!(ms as any).end_frame_image_url;
                const hasVideo = !!ms.video_url;

                return (
                  <TooltipProvider key={ms.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-full border-r border-background flex items-center justify-center text-xs font-medium cursor-pointer transition-colors ${
                            hasVideo 
                              ? 'bg-green-600/80 text-white' 
                              : ms.video_status === 'generating'
                                ? 'bg-yellow-500/60 text-white animate-pulse'
                                : hasInitialKf 
                                  ? 'bg-blue-600/60 text-white' 
                                  : 'bg-muted-foreground/20 text-muted-foreground'
                          }`}
                          style={{ width: `${widthPercent}%` }}
                          onClick={() => handleGenerateVideo(ms.id)}
                        >
                          {idx + 1}
                          {hasEndFrame && <CheckCircle2 className="w-2 h-2 ml-0.5" />}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">MS {ms.sequence_no}: {ms.start_sec}s - {ms.end_sec}s</p>
                        <p className="text-xs text-muted-foreground capitalize">{ms.video_status}</p>
                        {hasEndFrame && <p className="text-xs text-green-500">✓ End frame extraído</p>}
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
                  const endFrameUrl = (ms as any).end_frame_image_url;
                  const isSharedWithPrev = idx > 0 && microShots[idx - 1].keyframe_final_id === ms.keyframe_initial_id;
                  const usesAnchor = idx === 0 && continuityAnchorUrl && !initialKf?.image_url;

                  return (
                    <Fragment key={ms.id}>
                      {/* Initial Keyframe / End Frame from Previous */}
                      <div className={`relative flex-shrink-0 ${isSharedWithPrev ? 'opacity-50' : ''}`}>
                        <div className={`w-14 h-10 rounded border-2 overflow-hidden ${
                          usesAnchor 
                            ? 'border-green-500' 
                            : initialKf?.image_url 
                              ? 'border-blue-500/50' 
                              : 'border-dashed border-muted-foreground/30'
                        }`}>
                          {usesAnchor ? (
                            <img 
                              src={continuityAnchorUrl} 
                              alt="Anchor"
                              className="w-full h-full object-cover"
                            />
                          ) : initialKf?.image_url ? (
                            <img 
                              src={initialKf.image_url} 
                              alt={`KF ${idx * 2}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <Badge 
                          variant="secondary" 
                          className="absolute -bottom-1 -left-1 text-[8px] px-1 py-0"
                        >
                          A
                        </Badge>
                        {(initialKf?.approved || usesAnchor) && (
                          <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-green-500" />
                        )}
                        {isSharedWithPrev && (
                          <Link2 className="absolute -top-1 -left-1 w-3 h-3 text-blue-500" />
                        )}
                      </div>

                      {/* Video Segment with Status */}
                      <div className="relative">
                        <div 
                          className={`w-20 h-12 rounded border flex items-center justify-center cursor-pointer transition-all ${
                            ms.video_status === 'ready' || ms.video_status === 'approved'
                              ? 'border-green-500 bg-green-500/5'
                              : ms.video_status === 'generating'
                                ? 'border-yellow-500 bg-yellow-500/5'
                                : ms.video_status === 'failed'
                                  ? 'border-destructive bg-destructive/5'
                                  : 'border-muted-foreground/30 bg-background hover:border-primary'
                          }`}
                          onClick={() => handleGenerateVideo(ms.id)}
                        >
                          {ms.video_status === 'generating' || generatingId === ms.id ? (
                            <div className="text-center">
                              <Loader2 className="w-4 h-4 animate-spin text-yellow-500 mx-auto" />
                              <span className="text-[8px] text-muted-foreground">Generando</span>
                            </div>
                          ) : ms.video_url ? (
                            <video 
                              src={ms.video_url} 
                              className="w-full h-full object-cover rounded"
                              muted
                            />
                          ) : (
                            <div className="text-center">
                              <Video className="w-4 h-4 text-muted-foreground mx-auto" />
                              <span className="text-[8px] text-muted-foreground">{ms.duration_sec}s</span>
                            </div>
                          )}
                        </div>
                        {/* Regenerate button for completed/failed */}
                        {(ms.video_status === 'ready' || ms.video_status === 'failed') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-background border shadow-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRegenerateMicroshot(ms.id);
                            }}
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                          </Button>
                        )}
                      </div>

                      {/* End Frame (extracted or target) */}
                      <div className="relative flex-shrink-0">
                        <div className={`w-14 h-10 rounded border-2 overflow-hidden ${
                          endFrameUrl 
                            ? 'border-green-500' 
                            : finalKf?.image_url && abModeEnabled
                              ? 'border-purple-500/50' 
                              : 'border-dashed border-muted-foreground/30'
                        }`}>
                          {endFrameUrl ? (
                            <img 
                              src={endFrameUrl} 
                              alt={`End ${idx}`}
                              className="w-full h-full object-cover"
                            />
                          ) : finalKf?.image_url && abModeEnabled ? (
                            <img 
                              src={finalKf.image_url} 
                              alt={`Target ${idx}`}
                              className="w-full h-full object-cover opacity-60"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <ImageIcon className="w-3 h-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <Badge 
                          variant="secondary" 
                          className={`absolute -bottom-1 -right-1 text-[8px] px-1 py-0 ${
                            endFrameUrl ? 'bg-green-500 text-white' : ''
                          }`}
                        >
                          B
                        </Badge>
                        {endFrameUrl && (
                          <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-green-500" />
                        )}
                      </div>

                      {/* Chain Arrow */}
                      {idx < microShots.length - 1 && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-green-500" />
                <span>Extraído/Anchor</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-blue-500/50" />
                <span>Keyframe</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-purple-500/50" />
                <span>Target A→B</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-dashed border-muted-foreground/30" />
                <span>Pendiente</span>
              </div>
            </div>

            {/* Playback Controls */}
            {microShots.some(ms => ms.video_url) && (
              <div className="flex items-center justify-center gap-2 pt-2">
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
                      Preview Secuencia
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
            {!continuityAnchorUrl && (
              <p className="text-xs mt-2 text-yellow-600 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Sin anchor de continuidad del shot anterior
              </p>
            )}
          </div>
        )}

        {/* Micro-shots Detail List */}
        {microShots.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Detalle de Micro-Shots</Label>
              <Button variant="ghost" size="sm" onClick={refresh} className="h-6 text-xs gap-1">
                <RefreshCw className="w-3 h-3" />
                Actualizar
              </Button>
            </div>
            <div className="grid gap-2">
              {microShots.map((ms, idx) => {
                const endFrameUrl = (ms as any).end_frame_image_url;
                
                return (
                  <div 
                    key={ms.id}
                    className="flex items-center gap-3 p-2 rounded border bg-card text-sm"
                  >
                    {/* Index */}
                    <div className="font-mono text-xs bg-muted px-2 py-1 rounded w-8 text-center">
                      {ms.sequence_no}
                    </div>

                    {/* Start Thumbnail */}
                    <div className="w-10 h-7 rounded overflow-hidden border bg-muted flex-shrink-0">
                      {ms.keyframe_initial_id && keyframesMap[ms.keyframe_initial_id]?.image_url ? (
                        <img 
                          src={keyframesMap[ms.keyframe_initial_id].image_url!}
                          alt="Start"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-2.5 h-2.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />

                    {/* End Thumbnail */}
                    <div className={`w-10 h-7 rounded overflow-hidden border flex-shrink-0 ${
                      endFrameUrl ? 'border-green-500' : 'bg-muted'
                    }`}>
                      {endFrameUrl ? (
                        <img 
                          src={endFrameUrl}
                          alt="End"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ImageIcon className="w-2.5 h-2.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Duration */}
                    <div className="flex-1 min-w-0">
                      <span className="text-muted-foreground text-xs">
                        {ms.start_sec}s → {ms.end_sec}s ({ms.duration_sec}s)
                      </span>
                    </div>

                    {/* Status */}
                    {getStatusBadge(ms.video_status)}

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {ms.video_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => window.open(ms.video_url!, '_blank')}
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRegenerateMicroshot(ms.id)}
                        disabled={ms.video_status === 'generating'}
                      >
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
