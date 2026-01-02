import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Volume2, Waves, Footprints, Music, RefreshCw, CheckCircle2 } from 'lucide-react';

interface AudioLayer {
  id: string;
  room_tone: any;
  ambience_layers: any;
  foley_layers: any;
  mix_notes: any;
  validated: boolean | null;
}

interface AudioLayerEditorProps {
  projectId: string;
  shotId: string;
  locationName?: string;
  locationType?: string;
  shotDuration?: number;
  blockingDescription?: string;
  actions?: string[];
}

export default function AudioLayerEditor({
  projectId,
  shotId,
  locationName,
  locationType,
  shotDuration = 5,
  blockingDescription,
  actions = []
}: AudioLayerEditorProps) {
  const [audioLayer, setAudioLayer] = useState<AudioLayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadAudioLayer();
  }, [shotId]);

  const loadAudioLayer = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audio_layers')
        .select('*')
        .eq('shot_id', shotId)
        .maybeSingle();

      if (error) throw error;
      setAudioLayer(data);
    } catch (error) {
      console.error('Error loading audio layer:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAudioDesign = async (usePresets: boolean = true) => {
    setGenerating(true);
    try {
      const response = await supabase.functions.invoke('audio-design', {
        body: {
          projectId,
          targetType: 'shot',
          targetId: shotId,
          location: locationName ? {
            id: '',
            name: locationName,
            type: locationType || 'generic'
          } : undefined,
          shot: {
            id: shotId,
            duration_sec: shotDuration,
            blocking_description: blockingDescription || '',
            actions: actions
          },
          usePresets,
          language: 'es-ES'
        }
      });

      if (response.error) throw response.error;

      if (response.data?.success) {
        setAudioLayer(response.data.audioLayer);
        toast.success(`Audio generado (${response.data.method === 'presets' ? 'presets' : 'IA'})`);
      } else {
        throw new Error(response.data?.error || 'Failed to generate audio');
      }
    } catch (error) {
      console.error('Error generating audio:', error);
      toast.error('Error al generar audio');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-primary" />
          <span className="font-medium">Audio Design</span>
          {audioLayer?.validated && (
            <Badge variant="pass" className="text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Validated
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!audioLayer && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateAudioDesign(true)}
                disabled={generating}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Presets
              </Button>
              <Button
                size="sm"
                onClick={() => generateAudioDesign(false)}
                disabled={generating}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Generate with AI
              </Button>
            </>
          )}
          {audioLayer && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => generateAudioDesign(false)}
              disabled={generating}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {!audioLayer ? (
        <div className="text-center p-8 border-2 border-dashed border-border rounded-lg">
          <Music className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No audio layers defined</p>
          <p className="text-xs text-muted-foreground mt-1">
            Generate audio design to add room tone, ambience, and foley
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Room Tone */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Waves className="w-4 h-4 text-primary" />
                Room Tone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {audioLayer.room_tone?.description || 'No description'}
              </p>
              {audioLayer.room_tone?.reverb_size && (
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {audioLayer.room_tone.reverb_size}
                  </Badge>
                  {audioLayer.room_tone.decay_time_seconds && (
                    <Badge variant="outline" className="text-xs">
                      {audioLayer.room_tone.decay_time_seconds}s decay
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ambience Layers */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                Ambience ({audioLayer.ambience_layers?.length || 0} layers)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {audioLayer.ambience_layers?.map((layer: any, i: number) => (
                <div key={i} className="p-2 bg-muted/50 rounded text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px]">L{layer.layer || i + 1}</Badge>
                    <span className="text-muted-foreground">{layer.volume}</span>
                    <span className="text-muted-foreground">{layer.panning}</span>
                  </div>
                  <p className="text-foreground">{layer.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Foley Layers */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Footprints className="w-4 h-4 text-primary" />
                Foley ({audioLayer.foley_layers?.length || 0} layers)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {audioLayer.foley_layers?.map((layer: any, i: number) => (
                <div key={i} className="p-2 bg-muted/50 rounded text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-[10px]">L{layer.layer || i + 1}</Badge>
                    {layer.sync_to_action && (
                      <Badge variant="outline" className="text-[10px]">{layer.sync_to_action}</Badge>
                    )}
                  </div>
                  <p className="text-foreground">{layer.description}</p>
                  {layer.timing && (
                    <p className="text-muted-foreground mt-1">
                      Timing: {Array.isArray(layer.timing) ? layer.timing.join(', ') : layer.timing}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Mix Notes */}
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Music className="w-4 h-4 text-primary" />
                Mix Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {audioLayer.mix_notes?.dynamics && (
                <p><strong>Dynamics:</strong> {audioLayer.mix_notes.dynamics}</p>
              )}
              {audioLayer.mix_notes?.eq && (
                <p><strong>EQ:</strong> {audioLayer.mix_notes.eq}</p>
              )}
              {audioLayer.mix_notes?.reverb && (
                <p><strong>Reverb:</strong> {audioLayer.mix_notes.reverb}</p>
              )}
              {audioLayer.mix_notes?.compression && (
                <p><strong>Compression:</strong> {audioLayer.mix_notes.compression}</p>
              )}
              {audioLayer.mix_notes?.special_notes && (
                <p><strong>Notes:</strong> {audioLayer.mix_notes.special_notes}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
