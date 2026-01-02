import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { 
  FileText, 
  Wand2, 
  Loader2,
  CheckCircle,
  Film,
  Users,
  MapPin,
  Lightbulb,
  Stethoscope,
  Layers,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Lock,
  Unlock,
  Package,
  Volume2,
  Zap,
  BookOpen,
  FileDown,
  Settings2,
  Rocket,
  XCircle,
  RefreshCw,
  Snowflake
} from 'lucide-react';
import jsPDF from 'jspdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { calculateAutoTargets, CalculatedTargets, TargetInputs } from '@/lib/autoTargets';

interface ScriptImportProps {
  projectId: string;
  onScenesCreated?: () => void;
}

interface PipelineStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
}

export default function ScriptImport({ projectId, onScenesCreated }: ScriptImportProps) {
  const [activeTab, setActiveTab] = useState('generate');
  const [scriptText, setScriptText] = useState('');
  const [scriptLocked, setScriptLocked] = useState(false);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);

  // Form state
  const [ideaText, setIdeaText] = useState('');
  const [format, setFormat] = useState<'film' | 'series'>('series');
  const [episodesCount, setEpisodesCount] = useState(6);
  const [episodeDurationMin, setEpisodeDurationMin] = useState(45);
  const [filmDurationMin, setFilmDurationMin] = useState(100);
  const [genre, setGenre] = useState('drama');
  const [tone, setTone] = useState('Cinematográfico realista');
  const [language, setLanguage] = useState('es-ES');
  const [references, setReferences] = useState('');
  const [complexity, setComplexity] = useState<'simple' | 'medium' | 'high'>('medium');

  // Auto/Pro mode
  const [proMode, setProMode] = useState(false);
  const [targets, setTargets] = useState<CalculatedTargets | null>(null);

  // Pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { id: 'targets', label: 'Calculando targets', status: 'pending' },
    { id: 'outline', label: 'Generando outline', status: 'pending' },
    { id: 'qc', label: 'QC del outline', status: 'pending' },
    { id: 'screenplay', label: 'Generando guion', status: 'pending' },
    { id: 'save', label: 'Guardando', status: 'pending' },
  ]);

  // Generated data
  const [outline, setOutline] = useState<any>(null);
  const [qcResult, setQcResult] = useState<any>(null);
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<number, boolean>>({});

  // Script Doctor state
  const [analyzing, setAnalyzing] = useState(false);
  const [doctorSuggestions, setDoctorSuggestions] = useState<any[]>([]);
  const [doctorScore, setDoctorScore] = useState<number | null>(null);

  // Load existing script
  useEffect(() => {
    const fetchData = async () => {
      const [projectRes, scriptsRes] = await Promise.all([
        supabase.from('projects').select('episodes_count, format').eq('id', projectId).single(),
        supabase.from('scripts').select('id, status, raw_text, parsed_json').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1)
      ]);
      
      if (projectRes.data) {
        setEpisodesCount(projectRes.data.episodes_count || 6);
        setFormat(projectRes.data.format === 'film' ? 'film' : 'series');
      }
      
      if (scriptsRes.data && scriptsRes.data.length > 0) {
        const script = scriptsRes.data[0];
        setCurrentScriptId(script.id);
        setScriptLocked(script.status === 'locked');
        if (script.raw_text) setScriptText(script.raw_text);
        if (script.parsed_json && typeof script.parsed_json === 'object') {
          const parsed = script.parsed_json as Record<string, unknown>;
          if (parsed.episodes || parsed.screenplay || parsed.title) {
            setGeneratedScript(parsed);
            setActiveTab('summary');
          }
        }
      }
    };
    fetchData();
  }, [projectId]);

  // Calculate targets when inputs change
  useEffect(() => {
    if (!proMode) {
      const inputs: TargetInputs = {
        format,
        duration: filmDurationMin,
        episodesCount,
        episodeDurationMin,
        complexity,
        genre
      };
      setTargets(calculateAutoTargets(inputs));
    }
  }, [format, filmDurationMin, episodesCount, episodeDurationMin, complexity, genre, proMode]);

  const updatePipelineStep = (stepId: string, status: PipelineStep['status']) => {
    setPipelineSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  };

  // Main pipeline: Generate Script "Listo para Rodar"
  const runFullPipeline = async () => {
    if (!ideaText.trim()) {
      toast.error('Escribe una idea para generar el guion');
      return;
    }

    if (!targets) {
      toast.error('Los targets no están calculados');
      return;
    }

    setPipelineRunning(true);
    setPipelineProgress(0);
    setPipelineSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));

    try {
      // Step 1: Targets (already calculated)
      updatePipelineStep('targets', 'running');
      setPipelineProgress(10);
      await new Promise(r => setTimeout(r, 500));
      updatePipelineStep('targets', 'success');
      setPipelineProgress(20);

      // Step 2: Generate Outline
      updatePipelineStep('outline', 'running');
      const { data: outlineData, error: outlineError } = await supabase.functions.invoke('script-generate-outline', {
        body: {
          projectId,
          idea: ideaText,
          format,
          episodesCount: format === 'series' ? episodesCount : undefined,
          episodeDurationMin: format === 'series' ? episodeDurationMin : undefined,
          filmDurationMin: format === 'film' ? filmDurationMin : undefined,
          genre,
          tone,
          language,
          references,
          targets
        }
      });

      if (outlineError) throw outlineError;
      if (!outlineData?.outline) throw new Error('No se generó el outline');
      
      let currentOutline = outlineData.outline;
      setOutline(currentOutline);
      updatePipelineStep('outline', 'success');
      setPipelineProgress(40);

      // Step 3: QC Outline
      updatePipelineStep('qc', 'running');
      let qcPassed = false;
      let retryCount = 0;
      const maxRetries = 2;

      while (!qcPassed && retryCount <= maxRetries) {
        const { data: qcData, error: qcError } = await supabase.functions.invoke('script-qc-outline', {
          body: { outline: currentOutline, targets }
        });

        if (qcError) throw qcError;
        setQcResult(qcData);

        if (qcData?.passes) {
          qcPassed = true;
        } else if (retryCount < maxRetries && qcData?.rewrite_instructions) {
          // Rewrite outline
          toast.info(`QC no aprobado, reintentando (${retryCount + 1}/${maxRetries})...`);
          const { data: rewriteData, error: rewriteError } = await supabase.functions.invoke('script-rewrite-outline', {
            body: { outline: currentOutline, rewriteInstructions: qcData.rewrite_instructions, targets }
          });
          if (rewriteError) throw rewriteError;
          if (rewriteData?.outline) {
            currentOutline = rewriteData.outline;
            setOutline(currentOutline);
          }
          retryCount++;
        } else {
          // Failed after retries
          updatePipelineStep('qc', 'error');
          toast.error('El outline no cumple los targets después de varios intentos');
          setPipelineRunning(false);
          return;
        }
      }

      updatePipelineStep('qc', 'success');
      setPipelineProgress(60);

      // Step 4: Generate Screenplay
      updatePipelineStep('screenplay', 'running');
      const { data: screenplayData, error: screenplayError } = await supabase.functions.invoke('script-generate-screenplay', {
        body: { outline: currentOutline, targets, language }
      });

      if (screenplayError) throw screenplayError;
      if (!screenplayData?.screenplay) throw new Error('No se generó el guion');

      setGeneratedScript(screenplayData.screenplay);
      updatePipelineStep('screenplay', 'success');
      setPipelineProgress(80);

      // Step 5: Save to DB
      updatePipelineStep('save', 'running');
      const screenplayText = JSON.stringify(screenplayData.screenplay, null, 2);

      const { data: savedScript, error: saveError } = await supabase.from('scripts').upsert({
        id: currentScriptId || undefined,
        project_id: projectId,
        raw_text: screenplayText,
        parsed_json: screenplayData.screenplay,
        status: 'draft',
        version: 1
      }, { onConflict: 'id' }).select().single();

      if (saveError) throw saveError;
      setCurrentScriptId(savedScript.id);
      setScriptText(screenplayText);

      updatePipelineStep('save', 'success');
      setPipelineProgress(100);

      toast.success('¡Guion listo para rodar generado correctamente!');
      setActiveTab('summary');

    } catch (error: any) {
      console.error('Pipeline error:', error);
      toast.error(error.message || 'Error en el pipeline de generación');
      const currentStep = pipelineSteps.find(s => s.status === 'running');
      if (currentStep) updatePipelineStep(currentStep.id, 'error');
    } finally {
      setPipelineRunning(false);
    }
  };

  // Script Doctor
  const analyzeWithDoctor = async () => {
    const textToAnalyze = generatedScript ? JSON.stringify(generatedScript) : scriptText;
    if (!textToAnalyze || textToAnalyze.length < 200) {
      toast.error('El guion debe tener contenido suficiente');
      return;
    }
    
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('script-doctor', {
        body: { scriptText: textToAnalyze, language }
      });
      if (error) throw error;
      if (data?.analysis) {
        setDoctorScore(data.analysis.overall_assessment?.score || null);
        setDoctorSuggestions(data.analysis.suggestions || []);
        toast.success(`Análisis completado: ${data.analysis.suggestions?.length || 0} sugerencias`);
      }
    } catch (err: any) {
      console.error('Error analyzing script:', err);
      toast.error('Error al analizar guion');
    }
    setAnalyzing(false);
  };

  // Freeze script
  const freezeScript = async () => {
    if (!currentScriptId) {
      toast.error('Primero genera o guarda un guion');
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('script-freeze', {
        body: { scriptId: currentScriptId, projectId }
      });
      if (error) throw error;
      setScriptLocked(true);
      toast.success('Guion congelado correctamente');
    } catch (err: any) {
      console.error('Error freezing script:', err);
      toast.error('Error al congelar guion');
    }
  };

  const unlockScript = async () => {
    if (!currentScriptId) return;
    
    const { error } = await supabase.from('scripts').update({ status: 'draft' }).eq('id', currentScriptId);
    if (error) {
      toast.error('Error al desbloquear');
      return;
    }
    setScriptLocked(false);
    toast.success('Guion desbloqueado');
  };

  // Export PDF
  const exportCompletePDF = () => {
    if (!generatedScript) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(generatedScript.title || 'Guion', pageWidth / 2, 60, { align: 'center' });

    if (generatedScript.synopsis) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      const synopsisLines = doc.splitTextToSize(generatedScript.synopsis, pageWidth - 60);
      doc.text(synopsisLines, pageWidth / 2, 100, { align: 'center', maxWidth: pageWidth - 60 });
    }

    // Episodes
    const episodes = generatedScript.episodes || [{ title: 'Película', scenes: generatedScript.scenes || [] }];
    episodes.forEach((ep: any, epIdx: number) => {
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(ep.title || `Episodio ${epIdx + 1}`, pageWidth / 2, y, { align: 'center' });
      y += 10;

      (ep.scenes || []).forEach((scene: any, sceneIdx: number) => {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Escena ${scene.scene_number || sceneIdx + 1}: ${scene.slugline || ''}`, 20, y);
        y += 6;

        if (scene.dialogue && scene.dialogue.length > 0) {
          doc.setFontSize(8);
          scene.dialogue.forEach((d: any) => {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setFont('helvetica', 'bold');
            doc.text(`${d.character}:`, 25, y);
            doc.setFont('helvetica', 'normal');
            const lineText = doc.splitTextToSize(d.line || '', pageWidth - 55);
            doc.text(lineText, 50, y);
            y += Math.max(lineText.length * 4, 5);
          });
        }
        y += 6;
      });
    });

    doc.save(`${(generatedScript.title || 'guion').replace(/\s+/g, '_')}.pdf`);
    toast.success('PDF exportado');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'blocker': return 'bg-red-500/20 text-red-600 border-red-500/30';
      case 'critical': return 'bg-orange-500/20 text-orange-600 border-orange-500/30';
      case 'warning': return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30';
      default: return 'bg-blue-500/20 text-blue-600 border-blue-500/30';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Guion (Generar / Importar)</h2>
          <p className="text-sm text-muted-foreground">
            Pipeline completo: Idea → Outline → QC → Guion → Freeze
          </p>
        </div>
        <div className="flex items-center gap-2">
          {generatedScript && (
            <>
              <Button 
                variant={scriptLocked ? "default" : "outline"} 
                size="sm"
                onClick={scriptLocked ? unlockScript : freezeScript}
              >
                {scriptLocked ? <Lock className="w-4 h-4 mr-2" /> : <Snowflake className="w-4 h-4 mr-2" />}
                {scriptLocked ? 'Congelado' : 'Freeze Script'}
              </Button>
              <Button variant="outline" size="sm" onClick={analyzeWithDoctor} disabled={analyzing}>
                {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                Script Doctor
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline Status */}
      <div className="flex gap-2 p-3 bg-muted/30 rounded-lg items-center overflow-x-auto">
        <span className="text-xs font-medium text-muted-foreground shrink-0">Pipeline:</span>
        {['Draft', 'Outline', 'QC', 'Screenplay', 'Doctor', 'Freeze', 'Breakdown'].map((step, i) => (
          <Badge 
            key={step} 
            variant={
              (step === 'Draft' && !outline && !generatedScript) ||
              (step === 'Outline' && outline && !generatedScript) ||
              (step === 'Screenplay' && generatedScript && !scriptLocked) ||
              (step === 'Freeze' && scriptLocked)
                ? 'default' 
                : 'outline'
            }
            className="shrink-0"
          >
            {step}
          </Badge>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Generar desde Idea
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="doctor" className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4" />
            Script Doctor
          </TabsTrigger>
        </TabsList>

        {/* GENERATE TAB */}
        <TabsContent value="generate" className="space-y-4">
          {/* CTA Principal */}
          <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-primary" />
                    Generar Guion Listo para Rodar
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Pipeline automático: Targets → Outline → QC → Screenplay completo
                  </p>
                </div>
                <Button 
                  variant="gold" 
                  size="lg"
                  onClick={runFullPipeline} 
                  disabled={pipelineRunning || !ideaText.trim()}
                >
                  {pipelineRunning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</>
                  ) : (
                    <><Wand2 className="w-4 h-4 mr-2" />Generar Guion Completo</>
                  )}
                </Button>
              </div>

              {/* Pipeline Progress */}
              {pipelineRunning && (
                <div className="mt-4 space-y-3">
                  <Progress value={pipelineProgress} className="h-2" />
                  <div className="flex gap-2 flex-wrap">
                    {pipelineSteps.map(step => (
                      <Badge 
                        key={step.id}
                        variant={step.status === 'success' ? 'default' : step.status === 'error' ? 'destructive' : 'outline'}
                        className="flex items-center gap-1"
                      >
                        {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {step.status === 'success' && <CheckCircle className="w-3 h-3" />}
                        {step.status === 'error' && <XCircle className="w-3 h-3" />}
                        {step.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Idea & Format */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tu Idea</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Ej: Una detective de homicidios descubre que su padre, un policía retirado, podría estar involucrado en una serie de asesinatos sin resolver..."
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  className="min-h-[120px]"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Formato</Label>
                    <Select value={format} onValueChange={(v: 'film' | 'series') => setFormat(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="series">Serie</SelectItem>
                        <SelectItem value="film">Película</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {format === 'series' ? (
                    <>
                      <div className="space-y-2">
                        <Label>Nº Episodios</Label>
                        <Select value={String(episodesCount)} onValueChange={(v) => setEpisodesCount(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[4, 6, 8, 10, 12].map(n => (
                              <SelectItem key={n} value={String(n)}>{n} episodios</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Duración/ep</Label>
                        <Select value={String(episodeDurationMin)} onValueChange={(v) => setEpisodeDurationMin(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[20, 30, 45, 60].map(n => (
                              <SelectItem key={n} value={String(n)}>{n} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Duración</Label>
                      <Select value={String(filmDurationMin)} onValueChange={(v) => setFilmDurationMin(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[80, 90, 100, 120].map(n => (
                            <SelectItem key={n} value={String(n)}>{n} min</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Género</Label>
                    <Select value={genre} onValueChange={setGenre}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="drama">Drama</SelectItem>
                        <SelectItem value="thriller">Thriller</SelectItem>
                        <SelectItem value="comedy">Comedia</SelectItem>
                        <SelectItem value="action">Acción</SelectItem>
                        <SelectItem value="horror">Terror</SelectItem>
                        <SelectItem value="sci-fi">Ciencia Ficción</SelectItem>
                        <SelectItem value="crime">Crimen</SelectItem>
                        <SelectItem value="romance">Romance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tono</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cinematográfico realista">Cinematográfico realista</SelectItem>
                        <SelectItem value="Oscuro y tenso">Oscuro y tenso</SelectItem>
                        <SelectItem value="Ligero y entretenido">Ligero y entretenido</SelectItem>
                        <SelectItem value="Épico y grandioso">Épico y grandioso</SelectItem>
                        <SelectItem value="Intimista y emocional">Intimista y emocional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Referencias (inspiración, no copiar)</Label>
                  <Input
                    placeholder="Ej: True Detective, Mindhunter, Sicario..."
                    value={references}
                    onChange={(e) => setReferences(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Density Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Densidad Narrativa
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">Modo PRO</span>
                    <Switch checked={proMode} onCheckedChange={setProMode} />
                  </div>
                </CardTitle>
                <CardDescription>
                  {proMode ? 'Edita los targets manualmente' : 'Targets calculados automáticamente'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!proMode && (
                  <div className="space-y-2">
                    <Label>Complejidad</Label>
                    <Select value={complexity} onValueChange={(v: 'simple' | 'medium' | 'high') => setComplexity(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {targets && (
                  <div className="grid grid-cols-2 gap-3">
                    <TargetField label="Protagonistas" value={targets.protagonists_min} editable={proMode} onChange={(v) => setTargets({...targets, protagonists_min: v})} />
                    <TargetField label="Secundarios" value={targets.supporting_min} editable={proMode} onChange={(v) => setTargets({...targets, supporting_min: v})} />
                    <TargetField label="Extras c/frase" value={targets.extras_min} editable={proMode} onChange={(v) => setTargets({...targets, extras_min: v})} />
                    <TargetField label="Localizaciones" value={targets.locations_min} editable={proMode} onChange={(v) => setTargets({...targets, locations_min: v})} />
                    <TargetField label="Props clave" value={targets.hero_props_min} editable={proMode} onChange={(v) => setTargets({...targets, hero_props_min: v})} />
                    <TargetField label="Setpieces" value={targets.setpieces_min} editable={proMode} onChange={(v) => setTargets({...targets, setpieces_min: v})} />
                    <TargetField label="Subtramas" value={targets.subplots_min} editable={proMode} onChange={(v) => setTargets({...targets, subplots_min: v})} />
                    <TargetField label="Giros" value={targets.twists_min} editable={proMode} onChange={(v) => setTargets({...targets, twists_min: v})} />
                    {format === 'series' && targets.scenes_per_episode && (
                      <TargetField label="Escenas/ep" value={targets.scenes_per_episode} editable={proMode} onChange={(v) => setTargets({...targets, scenes_per_episode: v})} />
                    )}
                    {format === 'film' && targets.scenes_target && (
                      <TargetField label="Escenas total" value={targets.scenes_target} editable={proMode} onChange={(v) => setTargets({...targets, scenes_target: v})} />
                    )}
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Ratio Diálogo/Acción</Label>
                      <Badge variant="secondary" className="mt-1">{targets.dialogue_action_ratio}</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* QC Result */}
          {qcResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {qcResult.passes ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-orange-500" />}
                  QC del Outline: {qcResult.passes ? 'APROBADO' : 'REVISIÓN NECESARIA'}
                </CardTitle>
              </CardHeader>
              {qcResult.issues?.length > 0 && (
                <CardContent>
                  <div className="space-y-2">
                    {qcResult.issues.map((issue: any, i: number) => (
                      <div key={i} className={`p-2 rounded border ${getSeverityColor(issue.severity)}`}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{issue.severity}</Badge>
                          <span className="text-sm font-medium">{issue.message}</span>
                        </div>
                        <p className="text-xs mt-1">{issue.fix}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </TabsContent>

        {/* IMPORT TAB */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Importar Guion Existente
              </CardTitle>
              <CardDescription>
                Pega tu guion para analizarlo, ejecutar Script Doctor o Breakdown
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="INT. CAFETERÍA - DÍA&#10;&#10;SARA (30s) espera nerviosa..."
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                disabled={scriptLocked}
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{scriptText.length} caracteres</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={analyzeWithDoctor} disabled={analyzing || scriptText.length < 200}>
                    {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                    Script Doctor
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="space-y-4">
          {!generatedScript ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium text-lg mb-2">No hay guion generado</h3>
                <p className="text-muted-foreground mb-4">
                  Genera un guion desde la pestaña "Generar desde Idea"
                </p>
                <Button variant="outline" onClick={() => setActiveTab('generate')}>
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Ir a Generar
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{generatedScript.title || 'Guion Generado'}</h3>
                  <p className="text-sm text-muted-foreground">
                    {generatedScript.episodes?.length || 1} episodio(s) • {generatedScript.genre || ''} • {generatedScript.counts?.total_scenes || '?'} escenas
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportCompletePDF}>
                    <FileDown className="w-4 h-4 mr-2" />
                    Exportar PDF
                  </Button>
                </div>
              </div>

              {generatedScript.synopsis && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Sinopsis</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{generatedScript.synopsis}</p>
                  </CardContent>
                </Card>
              )}

              {/* Counts */}
              {generatedScript.counts && (
                <div className="grid gap-3 grid-cols-4 md:grid-cols-8">
                  <CountBadge label="Protagonistas" value={generatedScript.counts.protagonists} />
                  <CountBadge label="Secundarios" value={generatedScript.counts.supporting} />
                  <CountBadge label="Localizaciones" value={generatedScript.counts.locations} />
                  <CountBadge label="Props" value={generatedScript.counts.hero_props} />
                  <CountBadge label="Setpieces" value={generatedScript.counts.setpieces} />
                  <CountBadge label="Subtramas" value={generatedScript.counts.subplots} />
                  <CountBadge label="Giros" value={generatedScript.counts.twists} />
                  <CountBadge label="Escenas" value={generatedScript.counts.total_scenes} />
                </div>
              )}

              {/* Characters & Locations */}
              <div className="grid gap-4 md:grid-cols-2">
                {generatedScript.characters?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        Personajes ({generatedScript.characters.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[150px]">
                        <ul className="space-y-2 text-sm">
                          {generatedScript.characters.map((char: any, i: number) => (
                            <li key={i}>
                              <span className="font-medium">{char.name}</span>
                              {char.role && <Badge variant="outline" className="ml-2 text-xs">{char.role}</Badge>}
                              {char.description && <p className="text-xs text-muted-foreground">{char.description.substring(0, 100)}...</p>}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
                {generatedScript.locations?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        Localizaciones ({generatedScript.locations.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[150px]">
                        <ul className="space-y-1 text-sm">
                          {generatedScript.locations.map((loc: any, i: number) => (
                            <li key={i}>
                              <span className="font-medium">{loc.name || loc}</span>
                              {loc.type && <Badge variant="secondary" className="ml-2 text-xs">{loc.type}</Badge>}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Episodes */}
              <div className="space-y-3">
                <h4 className="font-medium">Episodios</h4>
                {(generatedScript.episodes || [{ title: 'Película', scenes: generatedScript.scenes || [] }]).map((ep: any, epIdx: number) => (
                  <Card key={epIdx}>
                    <Collapsible open={expandedEpisodes[epIdx] ?? false} onOpenChange={(open) => setExpandedEpisodes(prev => ({ ...prev, [epIdx]: open }))}>
                      <CardHeader className="py-3">
                        <CollapsibleTrigger className="flex items-center gap-2 w-full justify-between">
                          <div className="flex items-center gap-2">
                            {expandedEpisodes[epIdx] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            <span className="font-medium">{ep.title || `Episodio ${epIdx + 1}`}</span>
                            <Badge variant="secondary">{ep.scenes?.length || 0} escenas</Badge>
                          </div>
                        </CollapsibleTrigger>
                      </CardHeader>
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          {ep.synopsis && <p className="text-sm text-muted-foreground mb-3">{ep.synopsis}</p>}
                          <div className="space-y-2">
                            {(ep.scenes || []).slice(0, 10).map((scene: any, sceneIdx: number) => (
                              <div key={sceneIdx} className="p-2 rounded border text-sm">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">#{scene.scene_number || sceneIdx + 1}</Badge>
                                  <span className="font-medium">{scene.slugline}</span>
                                </div>
                                {scene.dialogue && scene.dialogue.length > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    {scene.dialogue.slice(0, 2).map((d: any, di: number) => (
                                      <p key={di}><strong>{d.character}:</strong> {d.line?.substring(0, 60)}...</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                            {(ep.scenes?.length || 0) > 10 && (
                              <p className="text-sm text-muted-foreground text-center">+{ep.scenes.length - 10} escenas más</p>
                            )}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* DOCTOR TAB */}
        <TabsContent value="doctor" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-blue-500" />
                    Script Doctor
                    {doctorScore !== null && (
                      <Badge variant={doctorScore >= 80 ? 'default' : doctorScore >= 60 ? 'secondary' : 'destructive'}>
                        Score: {doctorScore}/100
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Análisis profesional con sugerencias accionables</CardDescription>
                </div>
                <Button variant="outline" onClick={analyzeWithDoctor} disabled={analyzing || (!generatedScript && scriptText.length < 200)}>
                  {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Analizar
                </Button>
              </div>
            </CardHeader>
            {doctorSuggestions.length > 0 && (
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {doctorSuggestions.map((s: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={getSeverityColor(s.severity)}>{s.severity}</Badge>
                          <Badge variant="outline">{s.category}</Badge>
                        </div>
                        <p className="font-medium text-sm">{s.issue}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                        <div className="mt-2 p-2 bg-primary/5 rounded text-sm">
                          <strong>Sugerencia:</strong> {s.suggestion}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper components
function TargetField({ label, value, editable, onChange }: { label: string; value: number; editable: boolean; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editable ? (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8"
        />
      ) : (
        <div className="h-8 flex items-center px-3 rounded-md bg-muted text-sm font-medium">{value}</div>
      )}
    </div>
  );
}

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/50">
      <div className="text-lg font-bold text-primary">{value || 0}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
