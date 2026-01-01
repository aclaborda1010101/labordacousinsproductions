import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Play, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Wrench,
  MessageSquare,
  Star,
  ChevronLeft,
  ChevronRight,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DailiesSession {
  id: string;
  title: string;
  status: string;
  created_at: string;
  project_id: string;
}

interface DailiesItem {
  id: string;
  render_id: string;
  decision: 'SELECT' | 'FIX' | 'REJECT' | 'NONE';
  notes: string | null;
  render?: {
    id: string;
    take_label: string;
    video_url: string | null;
    status: string;
    shot?: {
      shot_no: number;
      scene?: {
        slugline: string;
        scene_no: number;
      };
    };
  };
}

type Rating = { acting: number; camera: number; lighting: number; sound: number; feelsReal: number };

export default function Dailies() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<DailiesSession[]>([]);
  const [activeSession, setActiveSession] = useState<DailiesSession | null>(null);
  const [items, setItems] = useState<DailiesItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratings, setRatings] = useState<Rating>({ acting: 3, camera: 3, lighting: 3, sound: 3, feelsReal: 3 });
  const [frameNote, setFrameNote] = useState('');

  useEffect(() => {
    async function fetchSessions() {
      const { data } = await supabase
        .from('dailies_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      setSessions(data || []);
      if (data && data.length > 0) {
        setActiveSession(data[0]);
      }
      setLoading(false);
    }
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSession) {
      fetchItems(activeSession.id);
    }
  }, [activeSession]);

  const fetchItems = async (sessionId: string) => {
    const { data } = await supabase
      .from('dailies_items')
      .select(`
        *,
        render:renders(
          id,
          take_label,
          video_url,
          status,
          shot:shots(
            shot_no,
            scene:scenes(slugline, scene_no)
          )
        )
      `)
      .eq('session_id', sessionId);
    setItems(data || []);
  };

  const currentItem = items[currentIndex];

  const setDecision = async (decision: 'SELECT' | 'FIX' | 'REJECT') => {
    if (!currentItem) return;
    await supabase
      .from('dailies_items')
      .update({ decision })
      .eq('id', currentItem.id);
    
    setItems(items.map((item, i) => 
      i === currentIndex ? { ...item, decision } : item
    ));
    
    toast.success(`${t.dailies.markedAs} ${decision}`);
    
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const addFrameNote = async () => {
    if (!currentItem || !frameNote.trim() || !user) return;
    
    await supabase.from('frame_notes').insert({
      render_id: currentItem.render_id,
      timestamp_sec: 0,
      author_id: user.id,
      note: frameNote.trim()
    });
    
    toast.success(t.common.success);
    setFrameNote('');
  };

  const createDemoSession = async () => {
    if (!user) return;
    
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1);
    
    if (!projects || projects.length === 0) {
      toast.error(t.projects.createFirst);
      return;
    }

    const { data: session } = await supabase
      .from('dailies_sessions')
      .insert({
        project_id: projects[0].id,
        title: `Dailies ${new Date().toLocaleDateString()}`,
        status: 'active'
      })
      .select()
      .single();

    if (session) {
      setSessions([session, ...sessions]);
      setActiveSession(session);
      toast.success(t.common.success);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const ratingLabels: Record<keyof Rating, string> = {
    acting: t.dailies.acting,
    camera: t.dailies.camera,
    lighting: t.dailies.lighting,
    sound: t.dailies.sound,
    feelsReal: t.dailies.feelsReal,
  };

  return (
    <AppLayout>
      <PageHeader title={t.dailies.title} description={t.dailies.subtitle}>
        <Button variant="outline" onClick={createDemoSession}>
          {t.dailies.createDemoSession}
        </Button>
      </PageHeader>

      <div className="flex-1 flex overflow-hidden">
        {/* Sessions sidebar */}
        <div className="w-64 bg-sidebar border-r border-sidebar-border overflow-y-auto p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">{t.dailies.sessions}</p>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2">{t.dailies.noSessions}</p>
          ) : sessions.map(session => (
            <button
              key={session.id}
              onClick={() => setActiveSession(session)}
              className={cn(
                "w-full text-left p-3 rounded-lg transition-colors",
                activeSession?.id === session.id 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
              )}
            >
              <p className="font-medium truncate">{session.title || 'Untitled'}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(session.created_at).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>

        {/* Main review area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!activeSession || items.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Play className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{t.dailies.noRenders}</h3>
                <p className="text-muted-foreground max-w-md">
                  {t.dailies.noRendersDesc}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Video player area */}
              <div className="flex-1 bg-black flex items-center justify-center relative">
                {currentItem?.render?.video_url ? (
                  <video 
                    src={currentItem.render.video_url} 
                    controls 
                    className="max-h-full max-w-full"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No video available</p>
                    <p className="text-sm">{t.dailies.take} {currentItem?.render?.take_label}</p>
                  </div>
                )}

                {/* Navigation arrows */}
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setCurrentIndex(Math.min(items.length - 1, currentIndex + 1))}
                  disabled={currentIndex === items.length - 1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>

                {/* Decision badge */}
                {currentItem?.decision !== 'NONE' && (
                  <div className="absolute top-4 right-4">
                    <Badge variant={
                      currentItem.decision === 'SELECT' ? 'pass' :
                      currentItem.decision === 'FIX' ? 'pending' : 'fail'
                    } className="text-sm px-3 py-1">
                      {currentItem.decision}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Review controls */}
              <div className="border-t border-border bg-card p-4">
                <div className="max-w-4xl mx-auto">
                  {/* Shot info */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-mono text-foreground">
                        {currentItem?.render?.shot?.scene?.slugline || 'Unknown scene'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t.dailies.scene} {currentItem?.render?.shot?.scene?.scene_no}, 
                        {t.dailies.shot} {currentItem?.render?.shot?.shot_no}, 
                        {t.dailies.take} {currentItem?.render?.take_label}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {currentIndex + 1} {t.dailies.of} {items.length}
                    </p>
                  </div>

                  {/* Rating sliders */}
                  <div className="grid grid-cols-5 gap-4 mb-4">
                    {(['acting', 'camera', 'lighting', 'sound', 'feelsReal'] as const).map(key => (
                      <div key={key} className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">{ratingLabels[key]}</p>
                        <div className="flex justify-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => setRatings({...ratings, [key]: n})}
                              className={cn(
                                "w-5 h-5 rounded-sm transition-colors",
                                n <= ratings[key] ? "bg-primary" : "bg-muted"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Frame note input */}
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      placeholder={t.dailies.addFrameNote}
                      value={frameNote}
                      onChange={e => setFrameNote(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addFrameNote()}
                      className="flex-1 h-9 px-3 rounded-lg bg-input border border-border text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={addFrameNote}>
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Decision buttons */}
                  <div className="flex gap-3 justify-center">
                    <Button
                      size="lg"
                      variant={currentItem?.decision === 'SELECT' ? 'success' : 'outline'}
                      onClick={() => setDecision('SELECT')}
                      className="min-w-32"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      {t.dailies.select}
                    </Button>
                    <Button
                      size="lg"
                      variant={currentItem?.decision === 'FIX' ? 'warning' : 'outline'}
                      onClick={() => setDecision('FIX')}
                      className="min-w-32"
                    >
                      <Wrench className="w-5 h-5" />
                      {t.dailies.fix}
                    </Button>
                    <Button
                      size="lg"
                      variant={currentItem?.decision === 'REJECT' ? 'destructive' : 'outline'}
                      onClick={() => setDecision('REJECT')}
                      className="min-w-32"
                    >
                      <XCircle className="w-5 h-5" />
                      {t.dailies.reject}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
