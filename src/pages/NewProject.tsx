import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Film, Tv, Clapperboard, Sparkles, Loader2, HelpCircle, Zap, Users, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EngineShootout } from '@/components/project/EngineShootout';

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
        const draft: ProjectDraft = JSON.parse(savedDraft);
        setHasDraft(true);
        // We'll show a prompt to restore or discard
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save draft on changes
  useEffect(() => {
    if (title || shootoutCharacter.name || shootoutLocation.name) {
      const draft: ProjectDraft = {
        title,
        format,
        episodesCount,
        targetDuration,
        masterLanguage,
        targetLanguages,
        budgetCap,
        shootoutCharacter,
        shootoutLocation,
        shootoutScene,
        currentStep,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }
  }, [title, format, episodesCount, targetDuration, masterLanguage, targetLanguages, budgetCap, shootoutCharacter, shootoutLocation, shootoutScene, currentStep]);

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
    { id: 'basics', title: t.newProject.steps?.basics?.title || 'Información Básica', description: t.newProject.steps?.basics?.description || 'Título y formato' },
    { id: 'episodes', title: t.newProject.steps?.episodes?.title || 'Episodios', description: t.newProject.steps?.episodes?.description || 'Estructura' },
    { id: 'language', title: t.newProject.steps?.language?.title || 'Idiomas', description: t.newProject.steps?.language?.description || 'Localización' },
    { id: 'budget', title: t.newProject.steps?.budget?.title || 'Presupuesto', description: t.newProject.steps?.budget?.description || 'Límites' },
    { id: 'shootout-setup', title: 'Engine Test', description: 'Personaje y localización' },
    { id: 'shootout', title: 'Engine Shootout', description: 'Comparativa IA' },
  ];

  const FORMAT_OPTIONS = [
    { value: 'series' as ProjectFormat, label: t.projects.format.series, icon: Tv, description: t.newProject.formatDesc?.series || 'Múltiples episodios', recommended: true },
    { value: 'mini' as ProjectFormat, label: t.projects.format.mini, icon: Film, description: t.newProject.formatDesc?.mini || '3-6 episodios' },
    { value: 'film' as ProjectFormat, label: t.projects.format.film, icon: Clapperboard, description: t.newProject.formatDesc?.film || 'Largometraje único' },
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return title.trim().length >= 2;
      case 1: return episodesCount >= 1 && targetDuration >= 1;
      case 2: return masterLanguage.length > 0;
      case 3: return true;
      case 4: return shootoutCharacter.name.trim().length >= 2 && shootoutLocation.name.trim().length >= 2 && shootoutScene.trim().length >= 10;
      case 5: return engineTestCompleted;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (currentStep === 4 && !createdProjectId) {
      // Create the project before running the shootout
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

      // Create the test character
      await supabase.from('characters').insert({
        project_id: project.id,
        name: shootoutCharacter.name.trim(),
        bio: shootoutCharacter.bio || null,
        role: 'protagonist',
      });

      // Create the test location
      await supabase.from('locations').insert({
        project_id: project.id,
        name: shootoutLocation.name.trim(),
        description: shootoutLocation.description || null,
      });

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
        <Button variant="ghost" onClick={() => navigate('/projects')}><ArrowLeft className="w-4 h-4" />{t.newProject.cancel || 'Cancelar'}</Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Progress steps */}
          <div className="flex items-center justify-between mb-12 overflow-x-auto pb-2">
            {WIZARD_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center min-w-[60px]">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                    index < currentStep ? "bg-primary text-primary-foreground" 
                    : index === currentStep ? "bg-primary text-primary-foreground ring-4 ring-primary/20" 
                    : "bg-muted text-muted-foreground"
                  )}>
                    {index < currentStep ? <Check className="w-5 h-5" /> : step.id === 'shootout' ? <Zap className="w-5 h-5" /> : index + 1}
                  </div>
                  <div className="mt-2 text-center">
                    <div className={cn("text-xs font-medium", index <= currentStep ? "text-foreground" : "text-muted-foreground")}>{step.title}</div>
                  </div>
                </div>
                {index < WIZARD_STEPS.length - 1 && <div className={cn("w-6 lg:w-12 h-0.5 mx-1", index < currentStep ? "bg-primary" : "bg-muted")} />}
              </div>
            ))}
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
            {currentStep === 0 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.whatsCalled || '¿Cómo se llama tu proyecto?'}</h2><p className="text-muted-foreground">{t.newProject.memorableTitle || 'Elige un título memorable'}</p></div>
                <div className="space-y-2"><Label htmlFor="title">{t.newProject.projectTitle}</Label><Input id="title" placeholder={t.newProject.titlePlaceholder || 'Ej: La Gran Aventura'} value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg h-12" /></div>
                <div className="space-y-3"><Label>{t.newProject.format || 'Formato'}</Label>
                  <div className="grid gap-3">
                    {FORMAT_OPTIONS.map((option) => { const Icon = option.icon; const isSelected = format === option.value;
                      return (<button key={option.value} onClick={() => setFormat(option.value)} className={cn("flex items-center gap-4 p-4 rounded-lg border text-left transition-all", isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", isSelected ? "bg-primary/10" : "bg-muted")}><Icon className={cn("w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground")} /></div>
                        <div className="flex-1"><div className="flex items-center gap-2"><span className="font-medium text-foreground">{option.label}</span>{option.recommended && <Badge variant="cine">{t.newProject.recommended || 'Recomendado'}</Badge>}</div><span className="text-sm text-muted-foreground">{option.description}</span></div>
                        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", isSelected ? "border-primary bg-primary" : "border-muted-foreground")}>{isSelected && <Check className="w-3 h-3 text-primary-foreground" />}</div>
                      </button>);
                    })}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.structureContent || 'Estructura del contenido'}</h2><p className="text-muted-foreground">{t.newProject.defineScope || 'Define el alcance de tu producción'}</p></div>
                {format !== 'film' && (<div className="space-y-2"><Label htmlFor="episodes">{t.newProject.numberOfEpisodes || 'Número de episodios'}</Label><div className="flex items-center gap-4"><Input id="episodes" type="number" min={1} max={100} value={episodesCount} onChange={(e) => setEpisodesCount(parseInt(e.target.value) || 1)} className="w-24" /><span className="text-muted-foreground">{t.newProject.episodes || 'episodios'}</span></div><button className="flex items-center gap-2 text-sm text-primary hover:underline mt-2"><HelpCircle className="w-4 h-4" /><span>{t.newProject.notSure || '¿No estás seguro?'}</span></button></div>)}
                <div className="space-y-2"><Label htmlFor="duration">{t.newProject.targetDuration || 'Duración objetivo por'} {format === 'film' ? (t.newProject.film || 'película') : (t.newProject.episode || 'episodio')}</Label><div className="flex items-center gap-4"><Input id="duration" type="number" min={1} max={240} value={targetDuration} onChange={(e) => setTargetDuration(parseInt(e.target.value) || 30)} className="w-24" /><span className="text-muted-foreground">{t.newProject.minutes || 'minutos'}</span></div></div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.languageSettings || 'Configuración de idiomas'}</h2><p className="text-muted-foreground">{t.newProject.languageDesc || 'Define los idiomas de tu producción'}</p></div>
                <div className="space-y-3"><Label>{t.newProject.masterLanguage || 'Idioma principal'}</Label><p className="text-sm text-muted-foreground">{t.newProject.masterLanguageDesc || 'El idioma original de producción'}</p><div className="flex flex-wrap gap-2">{LANGUAGE_OPTIONS.map((lang) => (<button key={lang.code} onClick={() => setMasterLanguage(lang.code)} className={cn("px-4 py-2 rounded-lg border text-sm font-medium transition-all", masterLanguage === lang.code ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 text-foreground")}>{lang.label}</button>))}</div></div>
                <div className="space-y-3"><Label>{t.newProject.targetLanguages || 'Idiomas destino'}</Label><p className="text-sm text-muted-foreground">{t.newProject.targetLanguagesDesc || 'Idiomas para doblaje'}</p><div className="flex flex-wrap gap-2">{LANGUAGE_OPTIONS.filter(l => l.code !== masterLanguage).map((lang) => (<button key={lang.code} onClick={() => toggleTargetLanguage(lang.code)} className={cn("px-4 py-2 rounded-lg border text-sm font-medium transition-all", targetLanguages.includes(lang.code) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 text-foreground")}>{lang.label}{targetLanguages.includes(lang.code) && <Check className="w-3 h-3 ml-1 inline" />}</button>))}</div></div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.budgetLimits || 'Límites de presupuesto'}</h2><p className="text-muted-foreground">{t.newProject.budgetDesc || 'Configura alertas de costes'}</p></div>
                <div className="space-y-2"><Label htmlFor="budget">{t.newProject.projectBudgetCap || 'Presupuesto máximo del proyecto'}</Label><div className="flex items-center gap-2"><span className="text-muted-foreground">€</span><Input id="budget" type="number" placeholder={t.newProject.noLimit || 'Sin límite'} value={budgetCap} onChange={(e) => setBudgetCap(e.target.value)} className="w-40" /><span className="text-muted-foreground">EUR</span></div></div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Engine Shootout - Configuración
                  </h2>
                  <p className="text-muted-foreground">
                    Define 1 personaje, 1 localización y 1 micro-escena (8s) para comparar motores de IA
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

            {currentStep === 5 && createdProjectId && (
              <div className="animate-fade-in">
                <EngineShootout 
                  projectId={createdProjectId} 
                  onComplete={handleShootoutComplete}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-8">
            <Button variant="outline" onClick={handleBack} disabled={currentStep === 0 || (currentStep === 5 && !engineTestCompleted)}>
              <ArrowLeft className="w-4 h-4" />{t.newProject.back || 'Atrás'}
            </Button>
            
            {currentStep < WIZARD_STEPS.length - 1 ? (
              <Button variant="gold" onClick={handleNext} disabled={!canProceed() || saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {currentStep === 4 ? 'Crear y Ejecutar Shootout' : (t.newProject.next || 'Siguiente')}
                <ArrowRight className="w-4 h-4" />
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