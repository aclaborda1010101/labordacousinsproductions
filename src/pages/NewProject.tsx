import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { toast } from 'sonner';
import { 
  ArrowLeft, ArrowRight, Check, Film, Tv, Clapperboard, Loader2, 
  FileText, DollarSign, Globe, Settings2, Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ScriptImport from '@/components/project/ScriptImport';
import ScriptWorkspace from '@/components/project/ScriptWorkspace';

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
  currentStep: number;
  savedAt: string;
}

export default function NewProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isDeveloperMode } = useDeveloperMode();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [useAdvancedScriptMode, setUseAdvancedScriptMode] = useState(false);

  // Basic info
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ProjectFormat>('series');
  const [episodesCount, setEpisodesCount] = useState(6);
  const [targetDuration, setTargetDuration] = useState(30);
  const [masterLanguage, setMasterLanguage] = useState('es');
  const [targetLanguages, setTargetLanguages] = useState<string[]>(['es']);
  const [budgetCap, setBudgetCap] = useState<string>('');

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
    if (title) {
      const draft: ProjectDraft = {
        title, format, episodesCount, targetDuration, masterLanguage, targetLanguages, budgetCap,
        currentStep, savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }
  }, [title, format, episodesCount, targetDuration, masterLanguage, targetLanguages, budgetCap, currentStep]);

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
      case 4: return true; // Script step - always allow proceeding
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
    if (currentStep === 3 && !createdProjectId) {
      // Before going to script step, create the project
      await createProject();
    } else if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  const createProject = async () => {
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
        const episodesToCreate = Array.from({ length: episodesCount }, (_, i) => ({
          project_id: project.id,
          episode_index: i + 1,
          title: `Episodio ${i + 1}`,
        }));
        await supabase.from('episodes').insert(episodesToCreate);
      }

      setCreatedProjectId(project.id);
      setCurrentStep(currentStep + 1);
      toast.success('Proyecto creado. Configura tu guion.');
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Error al crear el proyecto');
    } finally {
      setSaving(false);
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
        <div className="max-w-4xl mx-auto">
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
                      <Input id="episodes" type="number" min={format === 'mini' ? 3 : 1} max={format === 'mini' ? 6 : 100} value={episodesCount} onChange={(e) => setEpisodesCount(parseInt(e.target.value) || (format === 'mini' ? 3 : 1))} className="w-24" />
                      <span className="text-muted-foreground">episodios {format === 'mini' && '(3-6)'}</span>
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

            {/* Step 4: Script */}
            {currentStep === 4 && createdProjectId && (
              <div className="animate-fade-in -m-8">
                {/* Developer Mode toggle for advanced script mode */}
                {isDeveloperMode && (
                  <div className="m-8 mb-0 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium text-amber-500">Modo Avanzado de Guion</span>
                      <span className="text-xs text-muted-foreground">(Developer Mode)</span>
                    </div>
                    <Switch
                      checked={useAdvancedScriptMode}
                      onCheckedChange={setUseAdvancedScriptMode}
                    />
                  </div>
                )}
                
                {/* Show advanced ScriptImport or standard ScriptWorkspace */}
                {useAdvancedScriptMode && isDeveloperMode ? (
                  <ScriptImport 
                    projectId={createdProjectId} 
                    onScenesCreated={() => {
                      toast.success('Escenas creadas correctamente');
                    }}
                  />
                ) : (
                  <div className="p-8">
                    <ScriptWorkspace 
                      projectId={createdProjectId} 
                      onEntitiesExtracted={() => {
                        toast.success('Entidades extraídas correctamente');
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation buttons - hide on script step */}
          {currentStep < 4 && (
            <div className="flex items-center justify-between mt-8">
              <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
                <ArrowLeft className="w-4 h-4 mr-2" />Atrás
              </Button>
              
              <Button variant="gold" onClick={handleNext} disabled={!canProceed() || saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {currentStep === 3 ? 'Crear Proyecto y Configurar Guion' : 'Siguiente'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Finish button on script step */}
          {currentStep === 4 && createdProjectId && (
            <div className="flex items-center justify-end mt-8">
              <Button variant="gold" onClick={handleFinish}>
                <Check className="w-4 h-4 mr-2" />
                Finalizar y Abrir Proyecto
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
