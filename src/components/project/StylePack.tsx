import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface StylePackProps { projectId: string; }

export default function StylePack({ projectId }: StylePackProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stylePack, setStylePack] = useState({ aspectRatio: '16:9', fps: 24, lensStyle: '', grainLevel: 'subtle' });

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('style_packs').select('*').eq('project_id', projectId).maybeSingle();
      if (data) setStylePack({ aspectRatio: data.aspect_ratio || '16:9', fps: data.fps || 24, lensStyle: data.lens_style || '', grainLevel: data.grain_level || 'subtle' });
      setLoading(false);
    }
    fetch();
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('style_packs').upsert({ project_id: projectId, aspect_ratio: stylePack.aspectRatio, fps: stylePack.fps, lens_style: stylePack.lensStyle, grain_level: stylePack.grainLevel }, { onConflict: 'project_id' });
    if (error) toast.error('Failed to save');
    else toast.success('Style pack saved');
    setSaving(false);
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div><h2 className="text-2xl font-bold text-foreground">Style Pack</h2><p className="text-muted-foreground">Define visual rules for your production</p></div>
      <div className="panel p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Aspect Ratio</Label><Input value={stylePack.aspectRatio} onChange={e => setStylePack({...stylePack, aspectRatio: e.target.value})} /></div>
          <div><Label>FPS</Label><Input type="number" value={stylePack.fps} onChange={e => setStylePack({...stylePack, fps: parseInt(e.target.value) || 24})} /></div>
        </div>
        <div><Label>Lens Style</Label><Input placeholder="e.g., Anamorphic, 35mm prime" value={stylePack.lensStyle} onChange={e => setStylePack({...stylePack, lensStyle: e.target.value})} /></div>
        <div><Label>Film Grain</Label><Input value={stylePack.grainLevel} onChange={e => setStylePack({...stylePack, grainLevel: e.target.value})} /></div>
        <Button variant="gold" onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />}<Save className="w-4 h-4" />Save Style Pack</Button>
      </div>
    </div>
  );
}
