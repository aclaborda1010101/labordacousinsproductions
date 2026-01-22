/**
 * EngineShootout - Video engine comparison tool
 * Compares Veo vs Kling video generation engines
 * Note: Results are now stored in project settings instead of engine_tests table
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, 
  Play, 
  Trophy, 
  RefreshCw, 
  CheckCircle2, 
  XCircle,
  Video,
  Sparkles
} from 'lucide-react';

interface EngineShootoutProps {
  projectId: string;
}

interface Character {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface QCResult {
  overall: number;
  identity: number;
  motion: number;
  lighting: number;
  composition: number;
}

export default function EngineShootout({ projectId }: EngineShootoutProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [sceneDescription, setSceneDescription] = useState('');
  const [duration, setDuration] = useState(5);
  const [testing, setTesting] = useState(false);
  const [winner, setWinner] = useState<'veo' | 'kling' | null>(null);
  const [results, setResults] = useState<{
    veo: { qc: QCResult | null; videoUrl: string | null };
    kling: { qc: QCResult | null; videoUrl: string | null };
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    const [charsRes, locsRes] = await Promise.all([
      supabase.from('characters').select('id, name').eq('project_id', projectId),
      supabase.from('locations').select('id, name').eq('project_id', projectId)
    ]);

    if (charsRes.data) setCharacters(charsRes.data);
    if (locsRes.data) setLocations(locsRes.data);
  };

  const runShootout = async () => {
    if (!selectedCharacter || !sceneDescription.trim()) {
      toast.error('Selecciona un personaje y describe la escena');
      return;
    }

    setTesting(true);
    setResults(null);
    setWinner(null);

    try {
      const { data, error } = await supabase.functions.invoke('engine-shootout', {
        body: {
          projectId,
          characterId: selectedCharacter,
          locationId: selectedLocation || null,
          sceneDescription,
          durationSec: duration,
        }
      });

      if (error) throw error;

      setResults({
        veo: { qc: data.veo?.qc || null, videoUrl: data.veo?.videoUrl || null },
        kling: { qc: data.kling?.qc || null, videoUrl: data.kling?.videoUrl || null }
      });

      const winnerEngine = data.winner === 'none' 
        ? (data.veo?.qc?.overall >= data.kling?.qc?.overall ? 'veo' : 'kling') 
        : data.winner;
      setWinner(winnerEngine);

      // Update project with preferred engine (no need for engine_tests table)
      await supabase.from('projects').update({
        preferred_engine: winnerEngine,
        engine_test_completed: true,
      }).eq('id', projectId);

      toast.success(`Test completado - Ganador: ${winnerEngine.toUpperCase()}`);
    } catch (err) {
      console.error('Shootout error:', err);
      toast.error('Error durante el test de motores');
    } finally {
      setTesting(false);
    }
  };

  const QCDisplay = ({ qc, label, isWinner }: { qc: QCResult | null; label: string; isWinner: boolean }) => {
    if (!qc) return null;
    
    return (
      <Card className={isWinner ? 'border-2 border-green-500' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              {label}
            </span>
            {isWinner && (
              <Badge className="bg-green-500">
                <Trophy className="h-3 w-3 mr-1" />
                Winner
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-3 text-center">
            {Math.round(qc.overall)}/100
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Identity</span>
              <span className={qc.identity >= 80 ? 'text-green-500' : 'text-yellow-500'}>
                {qc.identity}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Motion</span>
              <span className={qc.motion >= 80 ? 'text-green-500' : 'text-yellow-500'}>
                {qc.motion}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Lighting</span>
              <span className={qc.lighting >= 80 ? 'text-green-500' : 'text-yellow-500'}>
                {qc.lighting}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Composition</span>
              <span className={qc.composition >= 80 ? 'text-green-500' : 'text-yellow-500'}>
                {qc.composition}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Engine Shootout
        </h2>
        <p className="text-sm text-muted-foreground">
          Compara Veo vs Kling para encontrar el mejor motor para tu proyecto
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuración del Test</CardTitle>
          <CardDescription>
            Configura una escena de prueba para comparar los motores
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Personaje *</label>
              <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {characters.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Locación</label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Descripción de la escena *</label>
            <Textarea
              value={sceneDescription}
              onChange={(e) => setSceneDescription(e.target.value)}
              placeholder="Describe la acción: 'El personaje camina hacia la cámara mientras mira a su alrededor nerviosamente...'"
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Duración (segundos)</label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5s</SelectItem>
                <SelectItem value="10">10s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={runShootout} 
            disabled={testing || !selectedCharacter || !sceneDescription.trim()}
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generando en ambos motores...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Iniciar Comparación
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <div className="grid grid-cols-2 gap-4">
          <QCDisplay 
            qc={results.veo.qc} 
            label="VEO (Google)" 
            isWinner={winner === 'veo'} 
          />
          <QCDisplay 
            qc={results.kling.qc} 
            label="KLING (Kuaishou)" 
            isWinner={winner === 'kling'} 
          />
        </div>
      )}

      {results && (
        <div className="grid grid-cols-2 gap-4">
          {results.veo.videoUrl && (
            <Card>
              <CardContent className="p-2">
                <video 
                  src={results.veo.videoUrl} 
                  controls 
                  className="w-full rounded"
                />
              </CardContent>
            </Card>
          )}
          {results.kling.videoUrl && (
            <Card>
              <CardContent className="p-2">
                <video 
                  src={results.kling.videoUrl} 
                  controls 
                  className="w-full rounded"
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
