import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Play, Trophy, CheckCircle2, XCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface EngineShootoutProps {
  projectId: string;
  onComplete: (winner: string) => void;
}

interface Character {
  id: string;
  name: string;
  bio: string | null;
}

interface Location {
  id: string;
  name: string;
  description: string | null;
}

type ShootoutStep = 'setup' | 'generating' | 'qc' | 'results';

interface QCResult {
  continuity: number;
  lighting: number;
  texture: number;
  motion: number;
  overall: number;
}

interface EngineResult {
  videoUrl?: string;
  keyframeUrl?: string;
  qc?: QCResult;
  success?: boolean;
  usedFallback?: boolean;
  error?: string;
}

export function EngineShootout({ projectId, onComplete }: EngineShootoutProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<ShootoutStep>('setup');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Form state
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [sceneDescription, setSceneDescription] = useState('');
  const [duration, setDuration] = useState(8);

  // Results
  const [veoResult, setVeoResult] = useState<EngineResult | null>(null);
  const [klingResult, setKlingResult] = useState<EngineResult | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    const [charsRes, locsRes] = await Promise.all([
      supabase.from('characters').select('id, name, bio').eq('project_id', projectId),
      supabase.from('locations').select('id, name, description').eq('project_id', projectId),
    ]);
    
    if (charsRes.data) setCharacters(charsRes.data);
    if (locsRes.data) setLocations(locsRes.data);
    setLoading(false);
  };

  const runShootout = async () => {
    if (!selectedCharacter || !selectedLocation || !sceneDescription.trim()) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setGenerating(true);
    setStep('generating');
    setProgress(0);

    try {
      const character = characters.find(c => c.id === selectedCharacter);
      const location = locations.find(l => l.id === selectedLocation);

      // Progress updates while waiting for API
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) {
            const messages = [
              'Preparando prompt unificado...',
              'Enviando a Veo 3.1...',
              'Enviando a Kling 2.0...',
              'Esperando renders (puede tardar varios minutos)...',
              'Analizando continuidad visual...',
              'Evaluando iluminación y textura...',
              'Calculando puntuación de motion...',
            ];
            setProgressMessage(messages[Math.floor(prev / 15)] || 'Procesando...');
            return prev + 2;
          }
          return prev;
        });
      }, 3000);

      // Call the real edge function
      const response = await supabase.functions.invoke('engine-shootout', {
        body: {
          characterName: character?.name || '',
          characterDescription: character?.bio || '',
          locationName: location?.name || '',
          locationDescription: location?.description || '',
          sceneDescription,
          duration,
        }
      });

      clearInterval(progressInterval);
      setProgress(100);
      setProgressMessage('Comparando resultados...');

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;

      // Set results with full data including fallback info
      setVeoResult({ 
        videoUrl: data.veo?.videoUrl || undefined,
        keyframeUrl: data.veo?.keyframeUrl || undefined,
        qc: data.veo?.qc,
        success: data.veo?.success,
        usedFallback: data.veo?.usedFallback,
        error: data.veo?.error,
      });
      setKlingResult({ 
        videoUrl: data.kling?.videoUrl || undefined,
        keyframeUrl: data.kling?.keyframeUrl || undefined,
        qc: data.kling?.qc,
        success: data.kling?.success,
        usedFallback: data.kling?.usedFallback,
        error: data.kling?.error,
      });

      const winnerEngine = data.winner === 'none' ? (data.veo?.qc?.overall >= data.kling?.qc?.overall ? 'veo' : 'kling') : data.winner;
      setWinner(winnerEngine);

      // Save to database
      await supabase.from('engine_tests').insert({
        project_id: projectId,
        character_id: selectedCharacter,
        location_id: selectedLocation,
        scene_description: sceneDescription,
        duration_sec: duration,
        veo_result: { qc: data.veo?.qc, videoUrl: data.veo?.videoUrl },
        kling_result: { qc: data.kling?.qc, videoUrl: data.kling?.videoUrl },
        qc_results: { veo: data.veo?.qc, kling: data.kling?.qc },
        winner: winnerEngine,
      } as any);

      // Update project with preferred engine
      await supabase.from('projects').update({
        preferred_engine: winnerEngine,
        engine_test_completed: true,
      }).eq('id', projectId);

      setStep('results');
      
      if (data.veo?.success && data.kling?.success) {
        toast.success('Engine Shootout completado con éxito');
      } else {
        toast.warning('Engine Shootout completado con algunos errores de API');
      }
    } catch (error) {
      console.error('Error in shootout:', error);
      toast.error('Error durante el test: ' + (error instanceof Error ? error.message : 'Error desconocido'));
      setStep('setup');
    } finally {
      setGenerating(false);
    }
  };

  const QCScoreBar = ({ label, score }: { label: string; score: number }) => {
    const getColor = (s: number) => {
      if (s >= 90) return 'bg-green-500';
      if (s >= 80) return 'bg-yellow-500';
      return 'bg-red-500';
    };

    return (
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{score}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full ${getColor(score)} transition-all`} 
            style={{ width: `${score}%` }} 
          />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Engine Shootout</CardTitle>
            <CardDescription>
              Prueba automática para determinar el mejor motor de render para tu proyecto
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {step === 'setup' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Personaje</Label>
                <Select value={selectedCharacter} onValueChange={setSelectedCharacter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un personaje" />
                  </SelectTrigger>
                  <SelectContent>
                    {characters.map(char => (
                      <SelectItem key={char.id} value={char.id}>{char.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {characters.length === 0 && (
                  <p className="text-xs text-destructive">Necesitas al menos 1 personaje definido</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Localización</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una localización" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {locations.length === 0 && (
                  <p className="text-xs text-destructive">Necesitas al menos 1 localización definida</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descripción de la Micro-Escena</Label>
              <Textarea
                value={sceneDescription}
                onChange={e => setSceneDescription(e.target.value)}
                placeholder="Describe una escena corta de 8 segundos. Ej: El personaje entra en la habitación, mira a su alrededor con curiosidad, y se acerca lentamente a la ventana..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Duración (segundos)</Label>
              <Input
                type="number"
                min={5}
                max={15}
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value) || 8)}
                className="w-24"
              />
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">¿Qué evaluamos?</h4>
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Continuidad visual</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Iluminación consistente</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Calidad de textura</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Fluidez de movimiento</span>
                </div>
              </div>
            </div>

            <Button
              variant="gold"
              className="w-full"
              onClick={runShootout}
              disabled={!selectedCharacter || !selectedLocation || !sceneDescription.trim() || characters.length === 0 || locations.length === 0}
            >
              <Play className="w-4 h-4 mr-2" />
              Iniciar Engine Shootout
            </Button>
          </div>
        )}

        {step === 'generating' && (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Ejecutando Engine Shootout</h3>
              <p className="text-muted-foreground">{progressMessage}</p>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="grid grid-cols-2 gap-4 text-center text-sm">
              <div className="p-4 rounded-lg bg-blue-500/10">
                <p className="font-medium text-blue-500">Veo 3.1</p>
                <p className="text-muted-foreground">Google DeepMind</p>
              </div>
              <div className="p-4 rounded-lg bg-purple-500/10">
                <p className="font-medium text-purple-500">Kling 2.0</p>
                <p className="text-muted-foreground">Kuaishou</p>
              </div>
            </div>
          </div>
        )}

        {step === 'results' && veoResult && klingResult && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <Trophy className="w-12 h-12 text-primary mx-auto mb-2" />
              <h3 className="text-xl font-bold">
                {winner === 'veo' ? 'Veo 3.1' : 'Kling 2.0'} gana para este proyecto
              </h3>
              <p className="text-muted-foreground">
                Guardado en tu Taste Profile para futuras generaciones
              </p>
            </div>

            {/* Video/Keyframe Preview Section */}
            <div className="grid grid-cols-2 gap-4">
              {/* Veo Preview */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-500 font-bold text-xs">V</span>
                  </div>
                  <span className="font-medium text-sm">Veo 3.1</span>
                  {veoResult.usedFallback && (
                    <Badge variant="secondary" className="text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Keyframe
                    </Badge>
                  )}
                </div>
                <div className="aspect-video bg-muted rounded-lg overflow-hidden border">
                  {veoResult.videoUrl ? (
                    <video 
                      src={veoResult.videoUrl} 
                      controls 
                      className="w-full h-full object-cover"
                      poster={veoResult.keyframeUrl}
                    >
                      Tu navegador no soporta video HTML5.
                    </video>
                  ) : veoResult.keyframeUrl ? (
                    <img 
                      src={veoResult.keyframeUrl} 
                      alt="Veo keyframe" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <XCircle className="w-8 h-8 mr-2" />
                      <span>Sin resultado</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Kling Preview */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <span className="text-purple-500 font-bold text-xs">K</span>
                  </div>
                  <span className="font-medium text-sm">Kling 2.0</span>
                  {klingResult.usedFallback && (
                    <Badge variant="secondary" className="text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Keyframe
                    </Badge>
                  )}
                </div>
                <div className="aspect-video bg-muted rounded-lg overflow-hidden border">
                  {klingResult.videoUrl ? (
                    <video 
                      src={klingResult.videoUrl} 
                      controls 
                      className="w-full h-full object-cover"
                      poster={klingResult.keyframeUrl}
                    >
                      Tu navegador no soporta video HTML5.
                    </video>
                  ) : klingResult.keyframeUrl ? (
                    <img 
                      src={klingResult.keyframeUrl} 
                      alt="Kling keyframe" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <XCircle className="w-8 h-8 mr-2" />
                      <span>Sin resultado</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* QC Scores Section */}
            <div className="grid grid-cols-2 gap-4">
              {/* Veo Results */}
              <div className={`p-4 rounded-lg border-2 ${winner === 'veo' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="text-blue-500 font-bold text-sm">V</span>
                    </div>
                    <span className="font-medium">Veo 3.1</span>
                  </div>
                  {winner === 'veo' && (
                    <Badge variant="default" className="bg-primary">
                      <Trophy className="w-3 h-3 mr-1" />
                      Ganador
                    </Badge>
                  )}
                </div>
                <div className="space-y-3">
                  <QCScoreBar label="Continuidad" score={veoResult.qc?.continuity || 0} />
                  <QCScoreBar label="Iluminación" score={veoResult.qc?.lighting || 0} />
                  <QCScoreBar label="Textura" score={veoResult.qc?.texture || 0} />
                  <QCScoreBar label="Motion" score={veoResult.qc?.motion || 0} />
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="font-medium">Puntuación Total</span>
                      <span className="font-bold text-lg">{veoResult.qc?.overall || 0}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Kling Results */}
              <div className={`p-4 rounded-lg border-2 ${winner === 'kling' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="text-purple-500 font-bold text-sm">K</span>
                    </div>
                    <span className="font-medium">Kling 2.0</span>
                  </div>
                  {winner === 'kling' && (
                    <Badge variant="default" className="bg-primary">
                      <Trophy className="w-3 h-3 mr-1" />
                      Ganador
                    </Badge>
                  )}
                </div>
                <div className="space-y-3">
                  <QCScoreBar label="Continuidad" score={klingResult.qc?.continuity || 0} />
                  <QCScoreBar label="Iluminación" score={klingResult.qc?.lighting || 0} />
                  <QCScoreBar label="Textura" score={klingResult.qc?.texture || 0} />
                  <QCScoreBar label="Motion" score={klingResult.qc?.motion || 0} />
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="font-medium">Puntuación Total</span>
                      <span className="font-bold text-lg">{klingResult.qc?.overall || 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Button
              variant="gold"
              className="w-full"
              onClick={() => onComplete(winner!)}
            >
              Continuar con {winner === 'veo' ? 'Veo 3.1' : 'Kling 2.0'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
