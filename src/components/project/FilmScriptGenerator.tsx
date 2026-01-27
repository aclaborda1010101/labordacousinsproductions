/**
 * FilmScriptGenerator - Simplified script generation for films
 * 
 * Flow: Idea → Outline → Script (3 steps, no complexity)
 * 
 * This component provides a clean, linear workflow for generating
 * film scripts without the complex pipeline required for series.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Lightbulb,
  FileText,
  Film,
  Loader2,
  CheckCircle,
  ArrowRight,
  Sparkles,
  Download,
  Clock,
  RefreshCw,
  FileCode,
} from 'lucide-react';
import { convertToScreenplayText, formatAsFountain, type ScreenplayData } from '@/lib/formatScreenplay';

interface FilmScriptGeneratorProps {
  projectId: string;
  projectName?: string;
  existingIdea?: string;
  onComplete?: (script: string) => void;
}

type GenerationStep = 'idea' | 'outline' | 'script' | 'complete';

interface OutlineData {
  title: string;
  logline: string;
  synopsis: string;
  genre: string;
  tone: string;
  themes: string[];
  characters: any[];
  locations: any[];
  episodes: any[];
}

export default function FilmScriptGenerator({
  projectId,
  projectName = 'Mi Película',
  existingIdea = '',
  onComplete,
}: FilmScriptGeneratorProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState<GenerationStep>('idea');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  
  // Content state
  const [idea, setIdea] = useState(existingIdea);
  const [genre, setGenre] = useState<string>('comedia');
  const [duration, setDuration] = useState<number>(90);
  const [outline, setOutline] = useState<OutlineData | null>(null);
  const [script, setScript] = useState<string>('');
  const [scriptData, setScriptData] = useState<ScreenplayData | null>(null);
  
  // Error state
  const [error, setError] = useState<string | null>(null);

  // Load existing data from project
  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      // Load project details
      const { data: project } = await supabase
        .from('projects')
        .select('name, logline, genre, target_duration_min')
        .eq('id', projectId)
        .single();

      if (project) {
        if (project.logline && !idea) setIdea(project.logline);
        if (project.genre) setGenre(project.genre);
        if (project.target_duration_min) setDuration(project.target_duration_min);
      }

      // Check for existing outline
      const { data: existingOutline } = await supabase
        .from('outlines')
        .select('outline_json, status')
        .eq('project_id', projectId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingOutline?.outline_json) {
        setOutline(existingOutline.outline_json as unknown as OutlineData);
        setCurrentStep('outline');
      }

      // Check for existing script
      const { data: existingScript } = await supabase
        .from('scripts')
        .select('content, status')
        .eq('project_id', projectId)
        .eq('status', 'final')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingScript?.content) {
        setScript(existingScript.content);
        setCurrentStep('complete');
      }
    } catch (err) {
      console.error('Error loading project data:', err);
    }
  };

  // Step 1: Generate Outline from Idea
  const generateOutline = async () => {
    if (!idea.trim()) {
      toast.error('Escribe una idea para tu película');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(10);
    setProgressMessage('Generando estructura narrativa...');

    try {
      // Usar endpoint específico para películas (más rápido, sin polling)
      const { data, error: outlineError } = await supabase.functions.invoke('generate-film-outline', {
        body: {
          projectId,
          idea: idea.trim(),
          genre,
          duration,
        },
      });

      if (outlineError) throw outlineError;

      // Respuesta directa, sin polling
      const outlineData = data;

      if (!outlineData?.outline?.title) {
        throw new Error('No se pudo generar el outline');
      }

      setOutline(outlineData.outline);
      setProgress(100);
      setCurrentStep('outline');
      toast.success('¡Outline generado!');

      // Save to database
      await supabase.from('outlines').upsert({
        project_id: projectId,
        outline_json: outlineData.outline,
        status: 'approved',
        format: 'film',
        quality: outlineData.outline_quality || 'profesional',
      }, { onConflict: 'project_id' });

    } catch (err: any) {
      console.error('Outline generation error:', err);
      setError(err.message || 'Error generando outline');
      toast.error('Error generando outline', { description: err.message });
    } finally {
      setIsGenerating(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  // Poll for async outline completion
  const pollForOutline = async (outlineId: string): Promise<any> => {
    const maxAttempts = 60; // 2 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
      setProgress(10 + Math.min(attempts * 1.5, 80));

      const { data: outline } = await supabase
        .from('outlines')
        .select('outline_json, status, progress')
        .eq('id', outlineId)
        .single();

      if (outline?.status === 'approved' || outline?.status === 'complete') {
        return { outline: outline.outline_json };
      }
      if (outline?.status === 'failed') {
        throw new Error('La generación del outline falló');
      }
    }

    throw new Error('Timeout esperando el outline');
  };

  // Step 2: Generate Script from Outline
  const generateScript = async () => {
    if (!outline) {
      toast.error('Primero genera el outline');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(10);
    setProgressMessage('Escribiendo guión (esto puede tardar 2-3 minutos)...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sesión expirada. Recarga la página.');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/script-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          projectId,
          idea,
          genre,
          tone: outline.tone || '',
          format: 'film',
          episodesCount: 1,
          episodeDurationMin: duration,
          language: 'es-ES',
          stream: false,
          outline,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}`);
      }

      const rawScriptData = await response.json();
      
      // Guardar datos estructurados para exportación
      const screenplayData: ScreenplayData = {
        title: outline?.title || projectName,
        synopsis: rawScriptData.synopsis || outline?.synopsis,
        scenes: rawScriptData.scenes || [],
      };
      setScriptData(screenplayData);
      
      // Convertir a texto formateado Hollywood
      const fullScript = convertToScreenplayText(rawScriptData);

      if (!fullScript || fullScript.length < 100) {
        throw new Error('No se generó contenido de guión');
      }

      setScript(fullScript);
      setProgress(100);
      setCurrentStep('complete');
      toast.success('¡Guión generado!');

      // Save to database
      await supabase.from('scripts').upsert({
        project_id: projectId,
        content: fullScript,
        status: 'final',
        format: 'film',
      }, { onConflict: 'project_id' });

      onComplete?.(fullScript);

    } catch (err: any) {
      console.error('Script generation error:', err);
      setError(err.message || 'Error generando guión');
      toast.error('Error generando guión', { description: err.message });
    } finally {
      setIsGenerating(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  // Export script in Hollywood format
  const exportScript = (format: 'txt' | 'fountain' = 'txt') => {
    if (!script && !scriptData) return;

    let content: string;
    let extension: string;
    let mimeType: string;

    if (format === 'fountain' && scriptData) {
      content = formatAsFountain(scriptData);
      extension = 'fountain';
      mimeType = 'text/plain;charset=utf-8';
    } else {
      content = script;
      extension = 'txt';
      mimeType = 'text/plain;charset=utf-8';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_guion.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Guión exportado (${format.toUpperCase()})`);
  };

  // Reset to start over
  const resetGenerator = () => {
    setCurrentStep('idea');
    setOutline(null);
    setScript('');
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        <StepIndicator 
          step={1} 
          label="Idea" 
          active={currentStep === 'idea'} 
          completed={currentStep !== 'idea'} 
        />
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <StepIndicator 
          step={2} 
          label="Outline" 
          active={currentStep === 'outline'} 
          completed={currentStep === 'script' || currentStep === 'complete'} 
        />
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <StepIndicator 
          step={3} 
          label="Guión" 
          active={currentStep === 'script' || currentStep === 'complete'} 
          completed={currentStep === 'complete'} 
        />
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Idea Input */}
      {currentStep === 'idea' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Tu Idea
            </CardTitle>
            <CardDescription>
              Describe tu película en unas líneas. Cuanto más detalle, mejor resultado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Ej: Una comedia sobre tres Reyes Magos que se pierden camino a Belén y acaban en situaciones absurdas en el desierto..."
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={4}
              className="resize-none"
            />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Género</label>
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comedia">Comedia</SelectItem>
                    <SelectItem value="drama">Drama</SelectItem>
                    <SelectItem value="thriller">Thriller</SelectItem>
                    <SelectItem value="terror">Terror</SelectItem>
                    <SelectItem value="accion">Acción</SelectItem>
                    <SelectItem value="romance">Romance</SelectItem>
                    <SelectItem value="ciencia_ficcion">Ciencia Ficción</SelectItem>
                    <SelectItem value="aventura">Aventura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Duración</label>
                <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">60 min (Corto)</SelectItem>
                    <SelectItem value="90">90 min (Estándar)</SelectItem>
                    <SelectItem value="120">120 min (Largo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={generateOutline} 
              disabled={isGenerating || !idea.trim()}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {progressMessage || 'Generando...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generar Outline
                </>
              )}
            </Button>

            {isGenerating && (
              <Progress value={progress} className="h-2" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Outline Review */}
      {currentStep === 'outline' && outline && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Outline: {outline.title}
            </CardTitle>
            <CardDescription>{outline.logline}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div>
                <h4 className="font-medium mb-1">Sinopsis</h4>
                <p className="text-sm text-muted-foreground">{outline.synopsis}</p>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium mb-1">Género</h4>
                  <Badge variant="secondary">{outline.genre}</Badge>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Tono</h4>
                  <Badge variant="outline">{outline.tone}</Badge>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Personajes</h4>
                  <Badge>{outline.characters?.length || 0}</Badge>
                </div>
              </div>

              {outline.themes && outline.themes.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Temas</h4>
                  <div className="flex flex-wrap gap-1">
                    {outline.themes.map((theme, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{theme}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={generateScript} 
                disabled={isGenerating}
                className="flex-1"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {progressMessage || 'Generando guión...'}
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4 mr-2" />
                    Generar Guión Completo
                  </>
                )}
              </Button>
              
              <Button variant="outline" onClick={resetGenerator}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {isGenerating && (
              <Progress value={progress} className="h-2" />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Script Complete */}
      {currentStep === 'complete' && script && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              ¡Guión Completo!
            </CardTitle>
            <CardDescription>
              Tu guión está listo. Puedes exportarlo o editarlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 max-h-96 overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {script.slice(0, 3000)}
                {script.length > 3000 && '\n\n[... continúa ...]'}
              </pre>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => exportScript('txt')} className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Exportar TXT
              </Button>
              
              <Button onClick={() => exportScript('fountain')} variant="secondary">
                <FileCode className="w-4 h-4 mr-2" />
                Fountain
              </Button>
              
              <Button variant="outline" onClick={resetGenerator}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Nuevo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper component for step indicators
function StepIndicator({ step, label, active, completed }: { 
  step: number; 
  label: string; 
  active: boolean; 
  completed: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${active ? 'text-primary' : completed ? 'text-green-500' : 'text-muted-foreground'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
        active ? 'bg-primary text-primary-foreground' : 
        completed ? 'bg-green-500 text-white' : 
        'bg-muted'
      }`}>
        {completed ? <CheckCircle className="w-4 h-4" /> : step}
      </div>
      <span className="text-sm font-medium hidden sm:inline">{label}</span>
    </div>
  );
}
