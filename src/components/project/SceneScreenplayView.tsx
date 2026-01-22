import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Film, MessageSquare, User } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DialogueLine {
  character: string;
  line: string;
  parenthetical?: string;
}

interface SceneScreenplayViewProps {
  projectId: string;
  episodeNo: number;
  sceneNo: number;
  slugline?: string;
}

/**
 * SceneScreenplayView - P0 Implementation
 * Displays the screenplay content for a specific scene derived from scripts.parsed_json.
 * Read-only view - no editing capability in P0.
 */
export function SceneScreenplayView({ 
  projectId, 
  episodeNo, 
  sceneNo, 
  slugline 
}: SceneScreenplayViewProps) {
  const [loading, setLoading] = useState(true);
  const [sceneData, setSceneData] = useState<{
    slugline: string;
    action: string;
    summary: string;
    dialogues: DialogueLine[];
    mood?: string;
    music_cue?: string;
    sfx_cue?: string;
  } | null>(null);

  useEffect(() => {
    fetchSceneScreenplay();
  }, [projectId, episodeNo, sceneNo]);

  const fetchSceneScreenplay = async () => {
    setLoading(true);
    try {
      // PRIORITY 1: Try to get data from scenes table (v70 system stores here)
      const { data: sceneRow } = await supabase
        .from('scenes')
        .select('slugline, summary, parsed_json, objective, metadata')
        .eq('project_id', projectId)
        .eq('episode_no', episodeNo)
        .eq('scene_no', sceneNo)
        .maybeSingle();

      if (sceneRow) {
        const parsedJson = sceneRow.parsed_json as any;
        if (parsedJson?.action || parsedJson?.dialogues?.length > 0 || sceneRow.summary) {
          setSceneData({
            slugline: sceneRow.slugline || `SECUENCIA ${sceneNo}`,
            action: parsedJson?.action || parsedJson?.description || '',
            summary: sceneRow.summary || '',
            dialogues: (parsedJson?.dialogues || parsedJson?.dialogue || []).map((d: any) => ({
              character: d.character || 'PERSONAJE',
              line: d.line || d.text || '',
              parenthetical: d.parenthetical || ''
            })),
            mood: parsedJson?.mood,
            music_cue: parsedJson?.music_cue,
            sfx_cue: parsedJson?.sfx_cue
          });
          setLoading(false);
          return; // Found in scenes table, no need to check scripts
        }
      }

      // PRIORITY 2: Fallback to scripts.parsed_json (legacy system)
      const { data: script, error } = await supabase
        .from('scripts')
        .select('parsed_json')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (script?.parsed_json) {
        const parsed = script.parsed_json as any;
        const episodes = parsed.episodes || [{ scenes: parsed.scenes || [] }];
        
        // Find the matching episode
        const episode = episodes.find((ep: any) => 
          (ep.episode_number || 1) === episodeNo
        ) || episodes[0];
        
        if (episode?.scenes) {
          // Find the matching scene by scene_number or index
          const scene = episode.scenes.find((s: any, idx: number) => 
            (s.scene_number || idx + 1) === sceneNo
          );
          
          if (scene) {
            setSceneData({
              slugline: scene.slugline || slugline || `SECUENCIA ${sceneNo}`,
              action: scene.action || scene.description || '',
              summary: scene.summary || scene.action_summary || '',
              dialogues: (scene.dialogue || scene.dialogues || []).map((d: any) => ({
                character: d.character || d.speaker || 'PERSONAJE',
                line: d.line || d.text || d.dialogue || '',
                parenthetical: d.parenthetical || d.wryly || ''
              })),
              mood: scene.mood,
              music_cue: scene.music_cue,
              sfx_cue: scene.sfx_cue
            });
          }
        }
      }
    } catch (err) {
      console.error('Error fetching scene screenplay:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Cargando guion de la escena...</p>
        </CardContent>
      </Card>
    );
  }

  if (!sceneData || (!sceneData.action && !sceneData.summary && sceneData.dialogues.length === 0)) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium text-lg mb-2">Sin contenido de guion</h3>
          <p className="text-muted-foreground">
            Esta escena no tiene contenido de guion asociado.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Genera el guion completo desde la pestaña "Guion" del proyecto.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Film className="w-5 h-5 text-primary" />
            Guion de la Secuencia
          </CardTitle>
          <div className="flex gap-2">
            {sceneData.mood && (
              <Badge variant="outline" className="text-xs">
                {sceneData.mood}
              </Badge>
            )}
            {sceneData.dialogues.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                <MessageSquare className="w-3 h-3 mr-1" />
                {sceneData.dialogues.length} diálogos
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[500px]">
          <div className="screenplay-format font-mono text-sm space-y-4">
            {/* SLUGLINE */}
            <div className="screenplay-slugline">
              <p className="text-base font-bold uppercase tracking-wide text-foreground bg-muted/50 p-2 rounded">
                {sceneData.slugline}
              </p>
            </div>

            {/* ACTION/SUMMARY */}
            {(sceneData.action || sceneData.summary) && (
              <div className="screenplay-action">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {sceneData.action || sceneData.summary}
                </p>
              </div>
            )}

            {/* CUES */}
            {(sceneData.music_cue || sceneData.sfx_cue) && (
              <div className="flex gap-4 text-xs text-muted-foreground italic">
                {sceneData.music_cue && (
                  <span>🎵 {sceneData.music_cue}</span>
                )}
                {sceneData.sfx_cue && (
                  <span>🔊 {sceneData.sfx_cue}</span>
                )}
              </div>
            )}

            {/* DIALOGUES */}
            {sceneData.dialogues.length > 0 && (
              <div className="screenplay-dialogues space-y-4 mt-6">
                {sceneData.dialogues.map((dialogue, idx) => (
                  <div key={idx} className="dialogue-block pl-8 pr-4">
                    {/* Character Name - centered, uppercase */}
                    <div className="dialogue-character text-center">
                      <span className="font-bold uppercase text-primary">
                        <User className="w-3 h-3 inline mr-1 opacity-50" />
                        {dialogue.character}
                      </span>
                    </div>
                    
                    {/* Parenthetical - centered, smaller */}
                    {dialogue.parenthetical && (
                      <div className="dialogue-parenthetical text-center">
                        <span className="text-muted-foreground italic text-xs">
                          ({dialogue.parenthetical})
                        </span>
                      </div>
                    )}
                    
                    {/* Dialogue Line - centered block */}
                    <div className="dialogue-line text-center max-w-md mx-auto">
                      <p className="text-foreground leading-relaxed">
                        {dialogue.line}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer info */}
            <div className="pt-4 border-t border-border mt-6">
              <p className="text-xs text-muted-foreground text-center">
                Vista de solo lectura • Ep. {episodeNo} - Secuencia {sceneNo}
              </p>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default SceneScreenplayView;
