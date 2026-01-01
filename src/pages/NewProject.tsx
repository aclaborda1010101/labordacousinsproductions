import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Film, Tv, Clapperboard, Sparkles, Loader2, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export default function NewProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ProjectFormat>('series');
  const [episodesCount, setEpisodesCount] = useState(6);
  const [targetDuration, setTargetDuration] = useState(30);
  const [masterLanguage, setMasterLanguage] = useState('es');
  const [targetLanguages, setTargetLanguages] = useState<string[]>(['es']);
  const [budgetCap, setBudgetCap] = useState<string>('');

  const WIZARD_STEPS = [
    { id: 'basics', ...t.newProject.steps.basics },
    { id: 'episodes', ...t.newProject.steps.episodes },
    { id: 'language', ...t.newProject.steps.language },
    { id: 'budget', ...t.newProject.steps.budget },
  ];

  const FORMAT_OPTIONS = [
    { value: 'series' as ProjectFormat, label: t.projects.format.series, icon: Tv, description: t.newProject.formatDesc.series, recommended: true },
    { value: 'mini' as ProjectFormat, label: t.projects.format.mini, icon: Film, description: t.newProject.formatDesc.mini },
    { value: 'film' as ProjectFormat, label: t.projects.format.film, icon: Clapperboard, description: t.newProject.formatDesc.film },
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return title.trim().length >= 2;
      case 1: return episodesCount >= 1 && targetDuration >= 1;
      case 2: return masterLanguage.length > 0;
      case 3: return true;
      default: return false;
    }
  };

  const handleNext = () => { if (currentStep < WIZARD_STEPS.length - 1) setCurrentStep(currentStep + 1); };
  const handleBack = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  const handleCreate = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('projects').insert({
        owner_id: user.id,
        title: title.trim(),
        format,
        episodes_count: format === 'film' ? 1 : episodesCount,
        target_duration_min: targetDuration,
        master_language: masterLanguage,
        target_languages: targetLanguages,
        budget_cap_project_eur: budgetCap ? parseFloat(budgetCap) : null,
        bible_completeness_score: 0,
      }).select().single();
      if (error) throw error;
      await supabase.from('cost_assumptions').insert({ project_id: data.id });
      toast.success(t.common.success);
      navigate(`/projects/${data.id}/bible`);
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error(t.common.error);
    } finally {
      setSaving(false);
    }
  };

  const toggleTargetLanguage = (code: string) => {
    if (targetLanguages.includes(code)) setTargetLanguages(targetLanguages.filter(l => l !== code));
    else setTargetLanguages([...targetLanguages, code]);
  };

  return (
    <AppLayout>
      <PageHeader title={t.newProject.title} description={t.newProject.subtitle}>
        <Button variant="ghost" onClick={() => navigate('/projects')}><ArrowLeft className="w-4 h-4" />{t.newProject.cancel}</Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Progress steps */}
          <div className="flex items-center justify-between mb-12">
            {WIZARD_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all", index < currentStep ? "bg-primary text-primary-foreground" : index === currentStep ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground")}>
                    {index < currentStep ? <Check className="w-5 h-5" /> : index + 1}
                  </div>
                  <div className="mt-2 text-center">
                    <div className={cn("text-sm font-medium", index <= currentStep ? "text-foreground" : "text-muted-foreground")}>{step.title}</div>
                    <div className="text-xs text-muted-foreground hidden sm:block">{step.description}</div>
                  </div>
                </div>
                {index < WIZARD_STEPS.length - 1 && <div className={cn("w-12 lg:w-24 h-0.5 mx-2 transition-colors", index < currentStep ? "bg-primary" : "bg-muted")} />}
              </div>
            ))}
          </div>

          <div className="panel-elevated p-8">
            {currentStep === 0 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.whatsCalled}</h2><p className="text-muted-foreground">{t.newProject.memorableTitle}</p></div>
                <div className="space-y-2"><Label htmlFor="title">{t.newProject.projectTitle}</Label><Input id="title" placeholder={t.newProject.titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg h-12" /></div>
                <div className="space-y-3"><Label>{t.newProject.format}</Label>
                  <div className="grid gap-3">
                    {FORMAT_OPTIONS.map((option) => { const Icon = option.icon; const isSelected = format === option.value;
                      return (<button key={option.value} onClick={() => setFormat(option.value)} className={cn("flex items-center gap-4 p-4 rounded-lg border text-left transition-all", isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", isSelected ? "bg-primary/10" : "bg-muted")}><Icon className={cn("w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground")} /></div>
                        <div className="flex-1"><div className="flex items-center gap-2"><span className="font-medium text-foreground">{option.label}</span>{option.recommended && <Badge variant="cine">{t.newProject.recommended}</Badge>}</div><span className="text-sm text-muted-foreground">{option.description}</span></div>
                        <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center", isSelected ? "border-primary bg-primary" : "border-muted-foreground")}>{isSelected && <Check className="w-3 h-3 text-primary-foreground" />}</div>
                      </button>);
                    })}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.structureContent}</h2><p className="text-muted-foreground">{t.newProject.defineScope}</p></div>
                {format !== 'film' && (<div className="space-y-2"><Label htmlFor="episodes">{t.newProject.numberOfEpisodes}</Label><div className="flex items-center gap-4"><Input id="episodes" type="number" min={1} max={100} value={episodesCount} onChange={(e) => setEpisodesCount(parseInt(e.target.value) || 1)} className="w-24" /><span className="text-muted-foreground">{t.newProject.episodes}</span></div><button className="flex items-center gap-2 text-sm text-primary hover:underline mt-2"><HelpCircle className="w-4 h-4" /><span>{t.newProject.notSure}</span></button></div>)}
                <div className="space-y-2"><Label htmlFor="duration">{t.newProject.targetDuration} {format === 'film' ? t.newProject.film : t.newProject.episode}</Label><div className="flex items-center gap-4"><Input id="duration" type="number" min={1} max={240} value={targetDuration} onChange={(e) => setTargetDuration(parseInt(e.target.value) || 30)} className="w-24" /><span className="text-muted-foreground">{t.newProject.minutes}</span></div></div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.languageSettings}</h2><p className="text-muted-foreground">{t.newProject.languageDesc}</p></div>
                <div className="space-y-3"><Label>{t.newProject.masterLanguage}</Label><p className="text-sm text-muted-foreground">{t.newProject.masterLanguageDesc}</p><div className="flex flex-wrap gap-2">{LANGUAGE_OPTIONS.map((lang) => (<button key={lang.code} onClick={() => setMasterLanguage(lang.code)} className={cn("px-4 py-2 rounded-lg border text-sm font-medium transition-all", masterLanguage === lang.code ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 text-foreground")}>{lang.label}</button>))}</div></div>
                <div className="space-y-3"><Label>{t.newProject.targetLanguages}</Label><p className="text-sm text-muted-foreground">{t.newProject.targetLanguagesDesc}</p><div className="flex flex-wrap gap-2">{LANGUAGE_OPTIONS.filter(l => l.code !== masterLanguage).map((lang) => (<button key={lang.code} onClick={() => toggleTargetLanguage(lang.code)} className={cn("px-4 py-2 rounded-lg border text-sm font-medium transition-all", targetLanguages.includes(lang.code) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 text-foreground")}>{lang.label}{targetLanguages.includes(lang.code) && <Check className="w-3 h-3 ml-1 inline" />}</button>))}</div></div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6 animate-fade-in">
                <div><h2 className="text-xl font-semibold text-foreground mb-1">{t.newProject.budgetLimits}</h2><p className="text-muted-foreground">{t.newProject.budgetDesc}</p></div>
                <div className="space-y-2"><Label htmlFor="budget">{t.newProject.projectBudgetCap}</Label><div className="flex items-center gap-2"><span className="text-muted-foreground">€</span><Input id="budget" type="number" placeholder={t.newProject.noLimit} value={budgetCap} onChange={(e) => setBudgetCap(e.target.value)} className="w-40" /><span className="text-muted-foreground">EUR</span></div></div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-8">
            <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}><ArrowLeft className="w-4 h-4" />{t.newProject.back}</Button>
            {currentStep < WIZARD_STEPS.length - 1 ? (
              <Button variant="gold" onClick={handleNext} disabled={!canProceed()}>{t.newProject.next}<ArrowRight className="w-4 h-4" /></Button>
            ) : (
              <Button variant="gold" onClick={handleCreate} disabled={!canProceed() || saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t.newProject.create}<ArrowRight className="w-4 h-4" /></Button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
