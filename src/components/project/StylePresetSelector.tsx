import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Palette, Check, Plus, Film, Moon, Sun, Sparkles } from 'lucide-react';

interface StylePreset {
  id: string;
  name: string;
  description: string;
  category: string;
  preset_data: {
    lighting?: string;
    color_grade?: string;
    grain?: string;
    contrast?: number;
    saturation?: number;
    warmth?: number;
    vignette?: number;
    atmosphere?: string;
    composition?: string;
    shadows_tint?: string;
    highlights_tint?: string;
  };
  is_system: boolean;
  usage_count: number;
}

interface StylePresetSelectorProps {
  selectedPresetId?: string;
  onSelect: (preset: StylePreset | null) => void;
  projectId?: string;
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
  'Noir': <Moon className="h-5 w-5" />,
  'Wes Anderson': <Palette className="h-5 w-5" />,
  'Blade Runner': <Sparkles className="h-5 w-5" />,
  'Golden Hour': <Sun className="h-5 w-5" />,
  'Moonlight': <Moon className="h-5 w-5" />,
  'default': <Film className="h-5 w-5" />
};

const PRESET_COLORS: Record<string, string> = {
  'Noir': 'from-slate-800 to-slate-900',
  'Wes Anderson': 'from-pink-200 to-amber-200',
  'Blade Runner': 'from-cyan-600 to-orange-500',
  'Vintage Film': 'from-amber-300 to-orange-400',
  'Bleach Bypass': 'from-gray-400 to-gray-600',
  'Golden Hour': 'from-amber-400 to-orange-500',
  'Moonlight': 'from-blue-600 to-indigo-800',
  'default': 'from-gray-500 to-gray-700'
};

export function StylePresetSelector({ selectedPresetId, onSelect, projectId }: StylePresetSelectorProps) {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPreset, setNewPreset] = useState({
    name: '',
    description: '',
    contrast: 1.0,
    saturation: 0,
    warmth: 1.0,
    grain: 'none',
    vignette: 0
  });

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const { data, error } = await supabase
        .from('style_presets')
        .select('*')
        .order('is_system', { ascending: false })
        .order('usage_count', { ascending: false });

      if (error) throw error;
      setPresets((data || []) as StylePreset[]);
    } catch (error) {
      console.error('Error loading presets:', error);
      toast.error('Failed to load style presets');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (preset: StylePreset) => {
    onSelect(preset);
    
    // Increment usage count
    await supabase
      .from('style_presets')
      .update({ usage_count: preset.usage_count + 1 })
      .eq('id', preset.id);
  };

  const handleCreatePreset = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('style_presets')
        .insert({
          name: newPreset.name,
          description: newPreset.description,
          category: 'custom',
          preset_data: {
            contrast: newPreset.contrast,
            saturation: newPreset.saturation,
            warmth: newPreset.warmth,
            grain: newPreset.grain,
            vignette: newPreset.vignette
          },
          is_system: false,
          created_by: user.id
        });

      if (error) throw error;

      toast.success('Custom preset created!');
      setCreateDialogOpen(false);
      setNewPreset({
        name: '',
        description: '',
        contrast: 1.0,
        saturation: 0,
        warmth: 1.0,
        grain: 'none',
        vignette: 0
      });
      loadPresets();
    } catch (error) {
      console.error('Error creating preset:', error);
      toast.error('Failed to create preset');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  const systemPresets = presets.filter(p => p.is_system);
  const customPresets = presets.filter(p => !p.is_system);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Cinematic Style Presets
            </CardTitle>
            <CardDescription>
              Apply consistent visual styles across your project
            </CardDescription>
          </div>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Custom
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Custom Preset</DialogTitle>
                <DialogDescription>
                  Define your own cinematic style
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input
                    value={newPreset.name}
                    onChange={(e) => setNewPreset({ ...newPreset, name: e.target.value })}
                    placeholder="My Custom Style"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newPreset.description}
                    onChange={(e) => setNewPreset({ ...newPreset, description: e.target.value })}
                    placeholder="Describe the visual characteristics..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Contrast ({newPreset.contrast.toFixed(1)})</Label>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={newPreset.contrast}
                      onChange={(e) => setNewPreset({ ...newPreset, contrast: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Saturation ({(newPreset.saturation * 100).toFixed(0)}%)</Label>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.1"
                      value={newPreset.saturation}
                      onChange={(e) => setNewPreset({ ...newPreset, saturation: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Warmth ({newPreset.warmth.toFixed(1)})</Label>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.1"
                      value={newPreset.warmth}
                      onChange={(e) => setNewPreset({ ...newPreset, warmth: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Vignette ({(newPreset.vignette * 100).toFixed(0)}%)</Label>
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.05"
                      value={newPreset.vignette}
                      onChange={(e) => setNewPreset({ ...newPreset, vignette: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleCreatePreset}
                  disabled={!newPreset.name}
                >
                  Create Preset
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* System Presets */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Cinematic Styles</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {systemPresets.map((preset) => {
              const isSelected = preset.id === selectedPresetId;
              const gradientClass = PRESET_COLORS[preset.name] || PRESET_COLORS.default;
              const icon = PRESET_ICONS[preset.name] || PRESET_ICONS.default;

              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelect(preset)}
                  className={`relative group rounded-lg overflow-hidden transition-all ${
                    isSelected ? 'ring-2 ring-primary ring-offset-2' : 'hover:ring-1 hover:ring-primary/50'
                  }`}
                >
                  {/* Gradient Preview */}
                  <div className={`h-16 bg-gradient-to-br ${gradientClass} flex items-center justify-center`}>
                    <div className="text-white/80">
                      {icon}
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-primary rounded-full p-0.5">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 bg-card border-t">
                    <p className="font-medium text-sm truncate">{preset.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{preset.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* No Preset Option */}
        <button
          onClick={() => onSelect(null)}
          className={`w-full rounded-lg border-2 border-dashed p-4 transition-colors ${
            !selectedPresetId ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
              <Film className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="font-medium">No Style Preset</p>
              <p className="text-xs text-muted-foreground">Use default rendering without color grading</p>
            </div>
            {!selectedPresetId && (
              <Check className="h-5 w-5 text-primary ml-auto" />
            )}
          </div>
        </button>

        {/* Custom Presets */}
        {customPresets.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Custom Styles</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {customPresets.map((preset) => {
                const isSelected = preset.id === selectedPresetId;

                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelect(preset)}
                    className={`relative rounded-lg border p-3 text-left transition-all ${
                      isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm truncate">{preset.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{preset.description}</p>
                    
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                    )}

                    <Badge variant="outline" className="mt-2 text-xs">
                      Custom
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default StylePresetSelector;
