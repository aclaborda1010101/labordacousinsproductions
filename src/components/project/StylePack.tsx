import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface StylePackProps { projectId: string; }

export default function StylePack({ projectId }: StylePackProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [stylePack, setStylePack] = useState({ 
    aspectRatio: '16:9', 
    fps: 24, 
    lensStyle: '', 
    grainLevel: 'subtle',
    description: ''
  });

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('style_packs')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      
      if (data) {
        setExistingId(data.id);
        setStylePack({ 
          aspectRatio: data.aspect_ratio || '16:9', 
          fps: data.fps || 24, 
          lensStyle: data.lens_style || '', 
          grainLevel: data.grain_level || 'subtle',
          description: data.description || ''
        });
      }
      setLoading(false);
    }
    fetch();
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    
    const payload = { 
      project_id: projectId, 
      aspect_ratio: stylePack.aspectRatio, 
      fps: stylePack.fps, 
      lens_style: stylePack.lensStyle || null, 
      grain_level: stylePack.grainLevel,
      description: stylePack.description || null
    };

    let error;
    
    if (existingId) {
      // Update existing record
      const result = await supabase
        .from('style_packs')
        .update(payload)
        .eq('id', existingId);
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from('style_packs')
        .insert(payload)
        .select()
        .single();
      error = result.error;
      if (result.data) setExistingId(result.data.id);
    }
    
    if (error) {
      console.error('Save error:', error);
      toast.error('Error al guardar el estilo visual');
    } else {
      toast.success('Estilo visual guardado correctamente');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Estilo Visual</h2>
        <p className="text-muted-foreground">Define las reglas visuales de tu producción</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuración Visual</CardTitle>
          <CardDescription>
            Estos ajustes definen el look cinematográfico de tu proyecto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Description field */}
          <div className="space-y-2">
            <Label>Descripción del Estilo</Label>
            <Textarea
              value={stylePack.description}
              onChange={(e) => setStylePack({...stylePack, description: e.target.value})}
              placeholder="Describe el look visual general: atmósfera, paleta de colores, referencias cinematográficas, época..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Esta descripción se usará como contexto para la generación de imágenes y videos
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Relación de Aspecto</Label>
              <Select 
                value={stylePack.aspectRatio} 
                onValueChange={(v) => setStylePack({...stylePack, aspectRatio: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9 (Panorámico)</SelectItem>
                  <SelectItem value="2.39:1">2.39:1 (Cinemascope)</SelectItem>
                  <SelectItem value="1.85:1">1.85:1 (Widescreen)</SelectItem>
                  <SelectItem value="4:3">4:3 (Clásico)</SelectItem>
                  <SelectItem value="1:1">1:1 (Cuadrado)</SelectItem>
                  <SelectItem value="9:16">9:16 (Vertical)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Fotogramas por Segundo (FPS)</Label>
              <Select 
                value={String(stylePack.fps)} 
                onValueChange={(v) => setStylePack({...stylePack, fps: parseInt(v)})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 fps (Cine)</SelectItem>
                  <SelectItem value="25">25 fps (PAL)</SelectItem>
                  <SelectItem value="30">30 fps (NTSC)</SelectItem>
                  <SelectItem value="48">48 fps (HFR)</SelectItem>
                  <SelectItem value="60">60 fps (Suave)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Estilo de Lente</Label>
            <Select 
              value={stylePack.lensStyle || ""} 
              onValueChange={(v) => setStylePack({...stylePack, lensStyle: v})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona estilo de lente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anamorphic">Anamórfico (Cinemascope)</SelectItem>
                <SelectItem value="35mm-prime">35mm Prime (Clásico)</SelectItem>
                <SelectItem value="50mm-prime">50mm Prime (Natural)</SelectItem>
                <SelectItem value="vintage">Vintage (Suave, cálido)</SelectItem>
                <SelectItem value="modern-sharp">Moderno Nítido</SelectItem>
                <SelectItem value="telephoto">Teleobjetivo (Compresión)</SelectItem>
                <SelectItem value="wide-angle">Gran Angular (Dramático)</SelectItem>
                <SelectItem value="macro">Macro (Detalle extremo)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Define el tipo de óptica que quieres simular
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Grano de Película</Label>
            <Select 
              value={stylePack.grainLevel} 
              onValueChange={(v) => setStylePack({...stylePack, grainLevel: v})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin grano</SelectItem>
                <SelectItem value="subtle">Sutil</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="heavy">Intenso</SelectItem>
                <SelectItem value="vintage">Vintage (35mm)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button variant="gold" onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            <Save className="w-4 h-4 mr-2" />
            Guardar Estilo Visual
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
