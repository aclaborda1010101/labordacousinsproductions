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
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Film, 
  Tv, 
  Clapperboard,
  Sparkles,
  Loader2,
  HelpCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ProjectFormat = 'series' | 'mini' | 'film';

interface WizardStep {
  id: string;
  title: string;
  description: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'basics', title: 'Project Basics', description: 'Name and format' },
  { id: 'episodes', title: 'Episodes', description: 'Structure your content' },
  { id: 'language', title: 'Language', description: 'Master and targets' },
  { id: 'budget', title: 'Budget', description: 'Set cost limits' },
];

const FORMAT_OPTIONS = [
  { 
    value: 'series' as ProjectFormat, 
    label: 'Series', 
    icon: Tv, 
    description: 'Multi-episode with recurring characters',
    recommended: true 
  },
  { 
    value: 'mini' as ProjectFormat, 
    label: 'Mini-Series', 
    icon: Film, 
    description: 'Limited episodes with complete arc' 
  },
  { 
    value: 'film' as ProjectFormat, 
    label: 'Film', 
    icon: Clapperboard, 
    description: 'Single long-form production' 
  },
];

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
];

export default function NewProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ProjectFormat>('series');
  const [episodesCount, setEpisodesCount] = useState(6);
  const [targetDuration, setTargetDuration] = useState(30);
  const [masterLanguage, setMasterLanguage] = useState('en');
  const [targetLanguages, setTargetLanguages] = useState<string[]>(['en']);
  const [budgetCap, setBudgetCap] = useState<string>('');

  const canProceed = () => {
    switch (currentStep) {
      case 0: return title.trim().length >= 2;
      case 1: return episodesCount >= 1 && targetDuration >= 1;
      case 2: return masterLanguage.length > 0;
      case 3: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreate = async () => {
    if (!user) return;
    
    setSaving(true);
    
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          owner_id: user.id,
          title: title.trim(),
          format,
          episodes_count: format === 'film' ? 1 : episodesCount,
          target_duration_min: targetDuration,
          master_language: masterLanguage,
          target_languages: targetLanguages,
          budget_cap_project_eur: budgetCap ? parseFloat(budgetCap) : null,
          bible_completeness_score: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Create default cost assumptions
      await supabase.from('cost_assumptions').insert({
        project_id: data.id,
      });

      toast.success('Project created! Now let\'s build your production bible.');
      navigate(`/projects/${data.id}/bible`);
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const toggleTargetLanguage = (code: string) => {
    if (targetLanguages.includes(code)) {
      setTargetLanguages(targetLanguages.filter(l => l !== code));
    } else {
      setTargetLanguages([...targetLanguages, code]);
    }
  };

  return (
    <AppLayout>
      <PageHeader title="New Project" description="Create a new production">
        <Button variant="ghost" onClick={() => navigate('/projects')}>
          <ArrowLeft className="w-4 h-4" />
          Cancel
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Progress steps */}
          <div className="flex items-center justify-between mb-12">
            {WIZARD_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div 
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                      index < currentStep 
                        ? "bg-primary text-primary-foreground" 
                        : index === currentStep 
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/20" 
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {index < currentStep ? <Check className="w-5 h-5" /> : index + 1}
                  </div>
                  <div className="mt-2 text-center">
                    <div className={cn(
                      "text-sm font-medium",
                      index <= currentStep ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {step.title}
                    </div>
                    <div className="text-xs text-muted-foreground hidden sm:block">
                      {step.description}
                    </div>
                  </div>
                </div>
                {index < WIZARD_STEPS.length - 1 && (
                  <div 
                    className={cn(
                      "w-12 lg:w-24 h-0.5 mx-2 transition-colors",
                      index < currentStep ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="panel-elevated p-8">
            {/* Step 0: Basics */}
            {currentStep === 0 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1">
                    What's your project called?
                  </h2>
                  <p className="text-muted-foreground">
                    Give your production a memorable title
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Project Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., The Last Frontier"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-lg h-12"
                  />
                </div>

                <div className="space-y-3">
                  <Label>Format</Label>
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
                            isSelected 
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            isSelected ? "bg-primary/10" : "bg-muted"
                          )}>
                            <Icon className={cn(
                              "w-5 h-5",
                              isSelected ? "text-primary" : "text-muted-foreground"
                            )} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{option.label}</span>
                              {option.recommended && (
                                <Badge variant="cine">Recommended</Badge>
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">{option.description}</span>
                          </div>
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                            isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                          )}>
                            {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
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
                  <h2 className="text-xl font-semibold text-foreground mb-1">
                    Structure your content
                  </h2>
                  <p className="text-muted-foreground">
                    Define the scope of your production
                  </p>
                </div>

                {format !== 'film' && (
                  <div className="space-y-2">
                    <Label htmlFor="episodes">Number of Episodes</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        id="episodes"
                        type="number"
                        min={1}
                        max={100}
                        value={episodesCount}
                        onChange={(e) => setEpisodesCount(parseInt(e.target.value) || 1)}
                        className="w-24"
                      />
                      <span className="text-muted-foreground">episodes</span>
                    </div>
                    <button className="flex items-center gap-2 text-sm text-primary hover:underline mt-2">
                      <HelpCircle className="w-4 h-4" />
                      <span>Not sure? Start with 6 episodes</span>
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="duration">Target Duration per {format === 'film' ? 'Film' : 'Episode'}</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      id="duration"
                      type="number"
                      min={1}
                      max={240}
                      value={targetDuration}
                      onChange={(e) => setTargetDuration(parseInt(e.target.value) || 30)}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">minutes</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {[10, 22, 30, 45, 60, 90].map((min) => (
                      <button
                        key={min}
                        onClick={() => setTargetDuration(min)}
                        className={cn(
                          "px-3 py-1 rounded-md text-sm transition-colors",
                          targetDuration === min 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                      >
                        {min} min
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel p-4 bg-muted/30">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">SOS Recommendation</p>
                      <p className="text-sm text-muted-foreground">
                        For a {format === 'series' ? 'series' : format === 'mini' ? 'mini-series' : 'film'} format, 
                        {format === 'film' 
                          ? ' 90-120 minutes is ideal for theatrical pacing.'
                          : ' 30-45 minute episodes allow for proper story development.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Language */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1">
                    Language settings
                  </h2>
                  <p className="text-muted-foreground">
                    Choose your master language and localization targets
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Master Language</Label>
                  <p className="text-sm text-muted-foreground">
                    The primary language for dialogue and production
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => setMasterLanguage(lang.code)}
                        className={cn(
                          "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                          masterLanguage === lang.code 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-border hover:border-primary/50 text-foreground"
                        )}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Target Languages (Optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    Languages for dubbing and localization
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGE_OPTIONS.filter(l => l.code !== masterLanguage).map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => toggleTargetLanguage(lang.code)}
                        className={cn(
                          "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                          targetLanguages.includes(lang.code) 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-border hover:border-primary/50 text-foreground"
                        )}
                      >
                        {lang.label}
                        {targetLanguages.includes(lang.code) && (
                          <Check className="w-3 h-3 ml-1 inline" />
                        )}
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
                  <h2 className="text-xl font-semibold text-foreground mb-1">
                    Budget limits (optional)
                  </h2>
                  <p className="text-muted-foreground">
                    Set spending caps to control costs
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="budget">Project Budget Cap</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">€</span>
                    <Input
                      id="budget"
                      type="number"
                      placeholder="No limit"
                      value={budgetCap}
                      onChange={(e) => setBudgetCap(e.target.value)}
                      className="w-40"
                    />
                    <span className="text-muted-foreground">EUR</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Leave empty for no limit. You can always adjust this later.
                  </p>
                </div>

                <div className="panel p-4 bg-muted/30">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Cost Estimation</p>
                      <p className="text-sm text-muted-foreground">
                        Based on your settings, we estimate this production will cost between 
                        <span className="text-foreground font-medium"> €500 - €2,000</span> depending on 
                        quality mode and render count. Detailed estimates available after scene planning.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <h3 className="font-medium text-foreground mb-3">Project Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Title:</span>
                      <span className="ml-2 text-foreground font-medium">{title}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Format:</span>
                      <span className="ml-2 text-foreground font-medium capitalize">{format}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Episodes:</span>
                      <span className="ml-2 text-foreground font-medium">
                        {format === 'film' ? '1' : episodesCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="ml-2 text-foreground font-medium">{targetDuration} min</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Language:</span>
                      <span className="ml-2 text-foreground font-medium">
                        {LANGUAGE_OPTIONS.find(l => l.code === masterLanguage)?.label}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Budget:</span>
                      <span className="ml-2 text-foreground font-medium">
                        {budgetCap ? `€${budgetCap}` : 'No limit'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>

            {currentStep < WIZARD_STEPS.length - 1 ? (
              <Button
                variant="gold"
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="gold"
                onClick={handleCreate}
                disabled={!canProceed() || saving}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Project
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
