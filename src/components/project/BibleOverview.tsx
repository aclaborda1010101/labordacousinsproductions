import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Book, Users, MapPin, Palette, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Project { id: string; title: string; format: string; episodes_count: number; target_duration_min: number; bible_completeness_score: number; created_at: string; }
interface BibleOverviewProps { project: Project; setProject: React.Dispatch<React.SetStateAction<Project | null>>; }

export default function BibleOverview({ project, setProject }: BibleOverviewProps) {
  const { t } = useLanguage();
  const [stats, setStats] = useState({ style: false, characters: 0, locations: 0 });

  useEffect(() => {
    async function fetchStats() {
      const [styleRes, charsRes, locsRes] = await Promise.all([
        supabase.from('style_packs').select('id').eq('project_id', project.id).maybeSingle(),
        supabase.from('characters').select('id').eq('project_id', project.id),
        supabase.from('locations').select('id').eq('project_id', project.id),
      ]);

      const hasStyle = !!styleRes.data;
      const charCount = charsRes.data?.length || 0;
      const locCount = locsRes.data?.length || 0;

      setStats({ style: hasStyle, characters: charCount, locations: locCount });

      let score = 0;
      if (hasStyle) score += 30;
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

  const sections = [
    { id: 'style', label: t.bible.sections.style.label, icon: Palette, complete: stats.style, path: '/style', desc: t.bible.sections.style.desc },
    { id: 'characters', label: t.bible.sections.characters.label, icon: Users, complete: stats.characters >= 1, path: '/characters', desc: `${stats.characters} ${t.bible.sections.characters.desc}` },
    { id: 'locations', label: t.bible.sections.locations.label, icon: MapPin, complete: stats.locations >= 1, path: '/locations', desc: `${stats.locations} ${t.bible.sections.locations.desc}` },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t.bible.title}</h2>
        <p className="text-muted-foreground">{t.bible.subtitle}</p>
      </div>

      <div className="panel p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">{t.bible.completeness}</span>
          <Badge variant={project.bible_completeness_score >= 85 ? 'pass' : 'pending'}>{project.bible_completeness_score}%</Badge>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-amber-500 rounded-full transition-all duration-500" style={{ width: `${project.bible_completeness_score}%` }} />
        </div>
        {project.bible_completeness_score >= 85 && (
          <p className="text-sm text-qc-pass mt-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {t.bible.readyToProceed}</p>
        )}
      </div>

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
