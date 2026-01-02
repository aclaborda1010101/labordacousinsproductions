import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { 
  ArrowLeft, ArrowRight, Check, Film, Tv, Clapperboard, Loader2, 
  Zap, Users, MapPin, FileText, DollarSign,
  Globe, Settings2, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EngineShootout } from '@/components/project/EngineShootout';
import { WizardScriptStep, GeneratedScript } from '@/components/project/WizardScriptStep';

type ProjectFormat = 'series' | 'mini' | 'film';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
];

const STORAGE_KEY = 'cineforge_new_project_draft';

interface ProjectDraft {
  title: string;
  format: ProjectFormat;
  episodesCount: number;
  targetDuration: number;
  masterLanguage: string;
  targetLanguages: string[];
  budgetCap: string;
  scriptMode: 'idea' | 'import' | 'skip';
  scriptIdea: string;
  scriptGenre: string;
  scriptTone: string;
  scriptText: string;
  generatedScript: GeneratedScript | null;
  shootoutCharacter: { name: string; bio: string };
  shootoutLocation: { name: string; description: string };
  shootoutScene: string;
  currentStep: number;
  savedAt: string;
}

export default function NewProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Basic info
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ProjectFormat>('series');
  const [episodesCount, setEpisodesCount] = useState(6);
  const [targetDuration, setTargetDuration] = useState(30);
  const [masterLanguage, setMasterLanguage] = useState('es');
  const [targetLanguages, setTargetLanguages] = useState<string[]>(['es']);
  const [budgetCap, setBudgetCap] = useState<string>('');

  // Script/Idea
  const [scriptMode, setScriptMode] = useState<'idea' | 'import' | 'skip'>('idea');
  const [scriptIdea, setScriptIdea] = useState('');
  const [scriptGenre, setScriptGenre] = useState('drama');
  const [scriptTone, setScriptTone] = useState('Cinematográfico realista');
  const [scriptText, setScriptText] = useState('');
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);

  // Engine Shootout setup data
  const [shootoutCharacter, setShootoutCharacter] = useState({ name: '', bio: '' });
  const [shootoutLocation, setShootoutLocation] = useState({ name: '', description: '' });
  const [shootoutScene, setShootoutScene] = useState('');
  const [engineTestCompleted, setEngineTestCompleted] = useState(false);

  // Load draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      try {
        JSON.parse(savedDraft);
        setHasDraft(true);
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save draft on changes
  useEffect(() => {
    if (title || scriptIdea || shootoutCharacter.name) {
      const draft: ProjectDraft = {
        title, format, episodesCount, targetDuration, masterLanguage, targetLanguages, budgetCap,
        scriptMode, scriptIdea, scriptGenre, scriptTone, scriptText, generatedScript,
        shootoutCharacter, shootoutLocation, shootoutScene, currentStep, savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }
  }, [title, format, episodesCount, targetDuration, masterLanguage, targetLanguages, budgetCap, 
      scriptMode, scriptIdea, scriptGenre, scriptTone, scriptText, generatedScript,
      shootoutCharacter, shootoutLocation, shootoutScene, currentStep]);

  const restoreDraft = () => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      try {
        const draft: ProjectDraft = JSON.parse(savedDraft);
        setTitle(draft.title);
        setFormat(draft.format);
        setEpisodesCount(draft.episodesCount);
        setTargetDuration(draft.targetDuration);
        setMasterLanguage(draft.masterLanguage);
        setTargetLanguages(draft.targetLanguages);
        setBudgetCap(draft.budgetCap);
        setScriptMode(draft.scriptMode || 'idea');
        setScriptIdea(draft.scriptIdea || '');
        setScriptGenre(draft.scriptGenre || 'drama');
        setScriptTone(draft.scriptTone || 'Cinematográfico realista');
        setScriptText(draft.scriptText || '');
        setGeneratedScript(draft.generatedScript || null);
        setShootoutCharacter(draft.shootoutCharacter);
        setShootoutLocation(draft.shootoutLocation);
        setShootoutScene(draft.shootoutScene);
        setCurrentStep(draft.currentStep);
        toast.success('Borrador restaurado');
      } catch (e) {
        toast.error('Error al restaurar borrador');
      }
    }
    setHasDraft(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHasDraft(false);
  };

  const clearDraftOnComplete = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  const WIZARD_STEPS = [
    { id: 'basics', title: 'Información', description: 'Título y formato', icon: Settings2 },
    { id: 'episodes', title: 'Estructura', description: 'Episodios/Duración', icon: Film },
    { id: 'language', title: 'Idiomas', description: 'Localización', icon: Globe },
    { id: 'budget', title: 'Presupuesto', description: 'Límites', icon: DollarSign },
    { id: 'script', title: 'Guion', description: 'Idea o importar', icon: FileText },
    { id: 'shootout-setup', title: 'Engine Test', description: 'Personaje y loc', icon: Users },
    { id: 'shootout', title: 'Shootout', description: 'Comparativa IA', icon: Zap },
  ];

  const FORMAT_OPTIONS = [
    { value: 'series' as ProjectFormat, label: t.projects.format.series, icon: Tv, description: 'Múltiples episodios', recommended: true },
    { value: 'mini' as ProjectFormat, label: t.projects.format.mini, icon: Film, description: '3-6 episodios' },
    { value: 'film' as ProjectFormat, label: t.projects.format.film, icon: Clapperboard, description: 'Largometraje único' },
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return title.trim().length >= 2;
      case 1: return episodesCount >= 1 && targetDuration >= 1;
      case 2: return masterLanguage.length > 0;
      case 3: return true;
      case 4: return scriptMode === 'skip' || (scriptMode === 'idea' && scriptIdea.trim().length >= 10) || (scriptMode === 'import' && scriptText.trim().length >= 100);
      case 5: return shootoutCharacter.name.trim().length >= 2 && shootoutLocation.name.trim().length >= 2 && shootoutScene.trim().length >= 10;
      case 6: return engineTestCompleted;
      default: return false;
    }
  };

  const handleStepClick = (index: number) => {
    // Allow going back to any completed step or current step
    if (index <= currentStep || index === currentStep + 1) {
      // Only allow forward if can proceed
      if (index > currentStep && !canProceed()) return;
      setCurrentStep(index);
    }
  };

  const handleNext = async () => {
    if (currentStep === 5 && !createdProjectId) {
      await createProjectWithSetup();
    } else if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  const createProjectWithSetup = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Create project
      const { data: project, error: projectError } = await supabase.from('projects').insert({
        owner_id: user.id,
        title: title.trim(),
        format,
        episodes_count: format === 'film' ? 1 : episodesCount,
        target_duration_min: targetDuration,
        master_language: masterLanguage,
        target_languages: targetLanguages,
        budget_cap_project_eur: budgetCap ? parseFloat(budgetCap) : null,
        bible_completeness_score: 0,
        engine_test_completed: false,
      }).select().single();
      
      if (projectError) throw projectError;

      // Create cost assumptions
      await supabase.from('cost_assumptions').insert({ project_id: project.id });

      // Create episodes if series/mini
      if (format !== 'film') {
        const episodesToCreate = generatedScript?.episodes?.length 
          ? generatedScript.episodes.map((ep, idx) => ({
              project_id: project.id,
              episode_index: idx + 1,
              title: ep.title || `Episodio ${idx + 1}`,
              summary: ep.summary || null,
            }))
          : Array.from({ length: episodesCount }, (_, i) => ({
              project_id: project.id,
              episode_index: i + 1,
              title: `Episodio ${i + 1}`,
            }));
        await supabase.from('episodes').insert(episodesToCreate);
      }

      // Create script if we have one
      if ((scriptMode === 'idea' && generatedScript?.screenplay) || (scriptMode === 'import' && scriptText)) {
        await supabase.from('scripts').insert([{
          project_id: project.id,
          raw_text: scriptMode === 'import' ? scriptText : generatedScript?.screenplay || null,
          parsed_json: generatedScript ? JSON.parse(JSON.stringify(generatedScript)) : {},
          status: 'draft',
          version: 1,
        }]);
      }

      // Create characters from generated script
      if (generatedScript?.characters?.length) {
        const charsToCreate = generatedScript.characters.map((char, idx) => ({
          project_id: project.id,
          name: char.name,
          role: char.role || (idx === 0 ? 'protagonist' : 'recurring'),
          bio: char.description || null,
          character_role: idx === 0 ? 'protagonist' as const : 'recurring' as const,
        }));
        await supabase.from('characters').insert(charsToCreate);
      }

      // Create locations from generated script
      if (generatedScript?.locations?.length) {
        const locsToCreate = generatedScript.locations.map((loc) => ({
          project_id: project.id,
          name: loc.name,
          description: loc.description || null,
        }));
        await supabase.from('locations').insert(locsToCreate);
      }

      // Create the shootout test character if not from script
      if (!generatedScript?.characters?.length && shootoutCharacter.name) {
        await supabase.from('characters').insert({
          project_id: project.id,
          name: shootoutCharacter.name.trim(),
          bio: shootoutCharacter.bio || null,
          role: 'protagonist',
        });
      }

      // Create the shootout test location if not from script
      if (!generatedScript?.locations?.length && shootoutLocation.name) {
        await supabase.from('locations').insert({
          project_id: project.id,
          name: shootoutLocation.name.trim(),
          description: shootoutLocation.description || null,
        });
      }

      setCreatedProjectId(project.id);
      setCurrentStep(currentStep + 1);
      toast.success('Proyecto creado. Iniciando Engine Shootout...');
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Error al crear el proyecto');
    } finally {
      setSaving(false);
    }
  };

  const handleShootoutComplete = async (winningEngine: string) => {
    if (!createdProjectId) return;
    try {
      await supabase.from('projects').update({
        preferred_engine: winningEngine,
        engine_test_completed: true,
      }).eq('id', createdProjectId);
      
      setEngineTestCompleted(true);
      toast.success(`Engine Shootout completado. Motor preferido: ${winningEngine}`);
    } catch (error) {
      console.error('Error saving engine preference:', error);
    }
  };

  const handleFinish = () => {
    if (createdProjectId) {
      clearDraftOnComplete();
      navigate(`/projects/${createdProjectId}/bible`);
    }
  };

  const toggleTargetLanguage = (code: string) => {
    if (targetLanguages.includes(code)) setTargetLanguages(targetLanguages.filter(l => l !== code));
    else setTargetLanguages([...targetLanguages, code]);
  };

  return (
    <AppLayout>
      <PageHeader title={t.newProject.title} description={t.newProject.subtitle}>
        <Button variant="ghost" onClick={() => navigate('/projects')}><ArrowLeft className="w-4 h-4 mr-2" />{t.newProject.cancel || 'Cancelar'}</Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Progress steps - CLICKABLE */}
          <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
            {WIZARD_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;
              const isClickable = index <= currentStep || (index === currentStep + 1 && canProceed());
              
              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => handleStepClick(index)}
                    disabled={!isClickable}
                    className={cn(
                      "flex flex-col items-center min-w-[70px] transition-all",
                      isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                      isCompleted ? "bg-primary text-primary-foreground" 
                      : isCurrent ? "bg-amber-500 text-amber-950 ring-4 ring-amber-500/20" 
                      : "bg-muted text-muted-foreground"
                    )}>
                      {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <div className="mt-2 text-center">
                      <div className={cn(
                        "text-xs font-medium",
                        isCurrent ? "text-amber-500" : isCompleted ? "text-primary" : "text-muted-foreground"
                      )}>
                        {step.title}
                      </div>
                    </div>
                  </button>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div className={cn(
                      "w-4 lg:w-8 h-0.5 mx-1",
                      index < currentStep ? "bg-primary" : "bg-muted"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Draft restoration banner */}
          {hasDraft && (
            <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Borrador guardado encontrado</p>
                <p className="text-sm text-muted-foreground">¿Deseas continuar donde lo dejaste?</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={discardDraft}>Descartar</Button>
                <Button variant="gold" size="sm" onClick={restoreDraft}>Restaurar</Button>
              </div>
            </div>
          )}

          <div className="panel-elevated p-8">
            {/* Step 0: Basics */}
            {currentStep === 0 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-amber-500" />
                    ¿Cómo se llama tu proyecto?
                  </h2>
                  <p className="text-muted-foreground">Elige un título memorable y el formato</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Título del proyecto *</Label>
                  <Input 
                    id="title" 
                    placeholder="Ej: La Gran Aventura" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    className="text-lg h-12" 
                  />
                </div>
                <div className="space-y-3">
                  <Label>Formato</Label>
                  <div className="grid gap-3">
                    {FORMAT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isSelected = format === option.value;
                      return (
                        <button 
                          key={option.value} 
                          onClick={() => setFormat(option.value)} 
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-lg border text-left transition-all",
                            isSelected ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/50"
                          )}
                        >
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", isSelected ? "bg-amber-500/20" : "bg-muted")}>
                            <Icon className={cn("w-5 h-5", isSelected ? "text-amber-500" : "text-muted-foreground")} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{option.label}</span>
                              {option.recommended && <Badge variant="cine">Recomendado</Badge>}
                            </div>
                            <span className="text-sm text-muted-foreground">{option.description}</span>
                          </div>
                          <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", isSelected ? "border-amber-500 bg-amber-500" : "border-muted-foreground")}>
                            {isSelected && <Check className="w-3 h-3 text-amber-950" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Episodes */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Film className="w-5 h-5 text-amber-500" />
                    Estructura del contenido
                  </h2>
                  <p className="text-muted-foreground">Define el alcance de tu producción</p>
                </div>
                {format !== 'film' && (
                  <div className="space-y-2">
                    <Label htmlFor="episodes">Número de episodios</Label>
                    <div className="flex items-center gap-4">
                      <Input id="episodes" type="number" min={1} max={100} value={episodesCount} onChange={(e) => setEpisodesCount(parseInt(e.target.value) || 1)} className="w-24" />
                      <span className="text-muted-foreground">episodios</span>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="duration">Duración objetivo por {format === 'film' ? 'película' : 'episodio'}</Label>
                  <div className="flex items-center gap-4">
                    <Input id="duration" type="number" min={1} max={240} value={targetDuration} onChange={(e) => setTargetDuration(parseInt(e.target.value) || 30)} className="w-24" />
                    <span className="text-muted-foreground">minutos</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Languages */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-amber-500" />
                    Configuración de idiomas
                  </h2>
                  <p className="text-muted-foreground">Define los idiomas de tu producción</p>
                </div>
                <div className="space-y-3">
                  <Label>Idioma principal</Label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <button 
                        key={lang.code} 
                        onClick={() => setMasterLanguage(lang.code)} 
                        className={cn(
                          "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                          masterLanguage === lang.code ? "border-amber-500 bg-amber-500/10 text-amber-500" : "border-border hover:border-amber-500/50 text-foreground"
                        )}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Idiomas destino (doblaje)</Label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGE_OPTIONS.filter(l => l.code !== masterLanguage).map((lang) => (
                      <button 
                        key={lang.code} 
                        onClick={() => toggleTargetLanguage(lang.code)} 
                        className={cn(
                          "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                          targetLanguages.includes(lang.code) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 text-foreground"
                        )}
                      >
                        {lang.label}
                        {targetLanguages.includes(lang.code) && <Check className="w-3 h-3 ml-1 inline" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Budget */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-500" />
                    Límites de presupuesto
                  </h2>
                  <p className="text-muted-foreground">Configura alertas de costes (opcional)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget">Presupuesto máximo del proyecto</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">€</span>
                    <Input id="budget" type="number" placeholder="Sin límite" value={budgetCap} onChange={(e) => setBudgetCap(e.target.value)} className="w-40" />
                    <span className="text-muted-foreground">EUR</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Script/Idea - Using new component */}
            {currentStep === 4 && (
              <WizardScriptStep
                format={format}
                episodesCount={episodesCount}
                targetDuration={targetDuration}
                masterLanguage={masterLanguage}
                scriptMode={scriptMode}
                setScriptMode={setScriptMode}
                scriptIdea={scriptIdea}
                setScriptIdea={setScriptIdea}
                scriptGenre={scriptGenre}
                setScriptGenre={setScriptGenre}
                scriptTone={scriptTone}
                setScriptTone={setScriptTone}
                scriptText={scriptText}
                setScriptText={setScriptText}
                generatedScript={generatedScript}
                setGeneratedScript={setGeneratedScript}
                onShootoutDataReady={(char, loc) => {
                  setShootoutCharacter(char);
                  setShootoutLocation(loc);
                }}
                setProjectTitle={setTitle}
              />
            )}

            {/* Step 5: Shootout Setup */}
            {currentStep === 5 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Engine Shootout - Configuración
                  </h2>
                  <p className="text-muted-foreground">
                    {generatedScript ? 'Hemos pre-rellenado con datos del guion. Ajusta si es necesario.' : 'Define 1 personaje, 1 localización y 1 micro-escena (8s) para comparar motores de IA'}
                  </p>
                </div>

                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-primary" />
                    <Label className="text-base font-medium">Personaje de Prueba</Label>
                  </div>
                  <div className="space-y-3 pl-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="char-name" className="text-sm">Nombre *</Label>
                      <Input 
                        id="char-name"
                        value={shootoutCharacter.name} 
                        onChange={e => setShootoutCharacter({...shootoutCharacter, name: e.target.value})}
                        placeholder="Ej: Elena Varga"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="char-bio" className="text-sm">Descripción</Label>
                      <Textarea 
                        id="char-bio"
                        value={shootoutCharacter.bio}
                        onChange={e => setShootoutCharacter({...shootoutCharacter, bio: e.target.value})}
                        placeholder="Describe la apariencia física del personaje..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <Label className="text-base font-medium">Localización de Prueba</Label>
                  </div>
                  <div className="space-y-3 pl-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="loc-name" className="text-sm">Nombre *</Label>
                      <Input 
                        id="loc-name"
                        value={shootoutLocation.name} 
                        onChange={e => setShootoutLocation({...shootoutLocation, name: e.target.value})}
                        placeholder="Ej: Café nocturno"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="loc-desc" className="text-sm">Descripción</Label>
                      <Textarea 
                        id="loc-desc"
                        value={shootoutLocation.description}
                        onChange={e => setShootoutLocation({...shootoutLocation, description: e.target.value})}
                        placeholder="Describe el ambiente, iluminación, detalles..."
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <Label className="text-base font-medium">Micro-escena (8 segundos) *</Label>
                  </div>
                  <Textarea 
                    value={shootoutScene}
                    onChange={e => setShootoutScene(e.target.value)}
                    placeholder="Describe una acción corta: 'Elena entra al café, mira alrededor buscando a alguien, se sienta en una mesa junto a la ventana'"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Esta micro-escena se renderizará con Veo 3.1 y Kling 2.0 para comparar resultados
                  </p>
                </div>
              </div>
            )}

            {/* Step 6: Shootout */}
            {currentStep === 6 && createdProjectId && (
              <div className="animate-fade-in">
                <EngineShootout 
                  projectId={createdProjectId} 
                  onComplete={handleShootoutComplete}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-8">
            <Button variant="outline" onClick={handleBack} disabled={currentStep === 0 || (currentStep === 6 && !engineTestCompleted)}>
              <ArrowLeft className="w-4 h-4 mr-2" />Atrás
            </Button>
            
            {currentStep < WIZARD_STEPS.length - 1 ? (
              <Button variant="gold" onClick={handleNext} disabled={!canProceed() || saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {currentStep === 5 ? 'Crear y Ejecutar Shootout' : 'Siguiente'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button variant="gold" onClick={handleFinish} disabled={!engineTestCompleted}>
                <Check className="w-4 h-4 mr-2" />
                Finalizar y Abrir Proyecto
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
