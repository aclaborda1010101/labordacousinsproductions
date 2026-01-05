import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Book, Users, MapPin, Palette, CheckCircle2, Circle, ArrowRight, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BibleExport } from './BibleExport';

interface Project { id: string; title: string; format: string; episodes_count: number; target_duration_min: number; bible_completeness_score: number; created_at: string; }
interface BibleOverviewProps { project: Project; setProject: React.Dispatch<React.SetStateAction<Project | null>>; }

interface Requirement {
  id: string;
  label: string;
  points: number;
  complete: boolean;
  path: string;
}

export default function BibleOverview({ project, setProject }: BibleOverviewProps) {
  const { t } = useLanguage();
  const [stats, setStats] = useState({ style: false, hasDescription: false, characters: 0, locations: 0 });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      const [styleRes, charsRes, locsRes] = await Promise.all([
        supabase.from('style_packs').select('id, description').eq('project_id', project.id).maybeSingle(),
        supabase.from('characters').select('id, pack_completeness_score').eq('project_id', project.id),
        supabase.from('locations').select('id').eq('project_id', project.id),
      ]);

      const hasStyle = !!styleRes.data;
      const hasDescription = !!(styleRes.data?.description && styleRes.data.description.trim().length > 0);
      const charCount = charsRes.data?.length || 0;
      const locCount = locsRes.data?.length || 0;

      setStats({ style: hasStyle, hasDescription, characters: charCount, locations: locCount });

      let score = 0;
      if (hasStyle) score += 20;
      if (hasDescription) score += 10;
      if (charCount >= 1) score += 20;
      if (charCount >= 3) score += 15;
      if (locCount >= 1) score += 20;
      if (locCount >= 2) score += 15;

      if (score !== project.bible_completeness_score) {
        await supabase.from('projects').update({ bible_completeness_score: score }).eq('id', project.id);
        setProject({ ...project, bible_completeness_score: score });
      }
    }
    fetchStats();
  }, [project.id]);

  const requirements: Requirement[] = [
    { id: 'style', label: 'Estilo visual configurado', points: 20, complete: stats.style, path: '/style' },
    { id: 'description', label: 'Descripción del estilo', points: 10, complete: stats.hasDescription, path: '/style' },
    { id: 'char1', label: 'Al menos 1 personaje', points: 20, complete: stats.characters >= 1, path: '/characters' },
    { id: 'char3', label: '3+ personajes definidos', points: 15, complete: stats.characters >= 3, path: '/characters' },
    { id: 'loc1', label: 'Al menos 1 localización', points: 20, complete: stats.locations >= 1, path: '/locations' },
    { id: 'loc2', label: '2+ localizaciones definidas', points: 15, complete: stats.locations >= 2, path: '/locations' },
  ];

  const completedPoints = requirements.filter(r => r.complete).reduce((sum, r) => sum + r.points, 0);
  const missingRequirements = requirements.filter(r => !r.complete);

  // Defensive helper for i18n sections (handles both string and object formats)
  const getSectionLabel = (section: unknown): string => {
    if (typeof section === 'string') return section;
    return (section as { label?: string })?.label ?? '';
  };
  const getSectionDesc = (section: unknown): string => {
    if (typeof section === 'string') return '';
    return (section as { desc?: string })?.desc ?? '';
  };

  const sections = [
    { id: 'style', label: getSectionLabel(t.bible.sections.style), icon: Palette, complete: stats.style, path: '/style', desc: getSectionDesc(t.bible.sections.style) },
    { id: 'characters', label: getSectionLabel(t.bible.sections.characters), icon: Users, complete: stats.characters >= 1, path: '/characters', desc: `${stats.characters} ${getSectionDesc(t.bible.sections.characters)}` },
    { id: 'locations', label: getSectionLabel(t.bible.sections.locations), icon: MapPin, complete: stats.locations >= 1, path: '/locations', desc: `${stats.locations} ${getSectionDesc(t.bible.sections.locations)}` },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t.bible.title}</p>
          <h2 className="text-2xl font-bold text-foreground">{project.title}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t.bible.subtitle}</p>
        </div>
        <BibleExport projectId={project.id} projectTitle={project.title} />
      </div>

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="panel p-6">
          <CollapsibleTrigger asChild>
            <button className="w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t.bible.completeness}</span>
                  {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
                <Badge variant={project.bible_completeness_score >= 85 ? 'pass' : 'pending'}>{project.bible_completeness_score}%</Badge>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-amber-500 rounded-full transition-all duration-500" style={{ width: `${project.bible_completeness_score}%` }} />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 space-y-3">
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground mb-3">Desglose de puntuación:</p>
              <div className="space-y-2">
                {requirements.map((req) => (
                  <Link
                    key={req.id}
                    to={`/projects/${project.id}${req.path}`}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg transition-colors",
                      req.complete ? "bg-qc-pass/10" : "bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {req.complete ? (
                        <CheckCircle2 className="w-4 h-4 text-qc-pass" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className={cn("text-sm", req.complete ? "text-foreground" : "text-muted-foreground")}>
                        {req.label}
                      </span>
                    </div>
                    <Badge variant={req.complete ? "pass" : "secondary"} className="text-xs">
                      {req.complete ? `+${req.points}` : `0/${req.points}`}
                    </Badge>
                  </Link>
                ))}
              </div>

              {missingRequirements.length > 0 && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-sm text-amber-400">
                    <strong>Falta para 100%:</strong> {missingRequirements.map(r => r.label).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </CollapsibleContent>

          {project.bible_completeness_score >= 85 && (
            <p className="text-sm text-qc-pass mt-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {t.bible.readyToProceed}</p>
          )}
        </div>
      </Collapsible>

      <div className="grid gap-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.id} to={`/projects/${project.id}${section.path}`} className="panel p-5 hover:bg-card/80 transition-colors group flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="w-6 h-6 text-primary" /></div>
              <div className="flex-1"><h3 className="font-semibold text-foreground">{section.label}</h3><p className="text-sm text-muted-foreground">{section.desc}</p></div>
              {section.complete ? <CheckCircle2 className="w-5 h-5 text-qc-pass" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
