/**
 * Pantalla: Editor de Bible del Proyecto
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Plus, X, Save, Library } from 'lucide-react';
import type { ProjectBible } from '@/lib/editorialMVPTypes';
import { PRESET_TONES, PRESET_PERIODS, PRESET_RATINGS } from '@/lib/editorialMVPTypes';
import { SeriesBiblePanel } from '@/components/project/SeriesBiblePanel';

interface BibleEditorProps {
  bible: ProjectBible | null;
  projectId: string;
  onUpdate: (updates: Partial<Pick<ProjectBible, 'tone' | 'period' | 'rating' | 'facts'>>) => Promise<void>;
}

export function BibleEditor({ bible, projectId, onUpdate }: BibleEditorProps) {
  const [tone, setTone] = useState(bible?.tone || '');
  const [period, setPeriod] = useState(bible?.period || '');
  const [rating, setRating] = useState(bible?.rating || '');
  const [facts, setFacts] = useState<string[]>(bible?.facts || []);
  const [newFact, setNewFact] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const changed = 
      tone !== (bible?.tone || '') ||
      period !== (bible?.period || '') ||
      rating !== (bible?.rating || '') ||
      JSON.stringify(facts) !== JSON.stringify(bible?.facts || []);
    setHasChanges(changed);
  }, [tone, period, rating, facts, bible]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({ tone, period, rating, facts });
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const addFact = () => {
    if (newFact.trim()) {
      setFacts([...facts, newFact.trim()]);
      setNewFact('');
    }
  };

  const removeFact = (index: number) => {
    setFacts(facts.filter((_, i) => i !== index));
  };

  return (
    <Tabs defaultValue="project" className="w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Biblia
          </h2>
          <p className="text-muted-foreground">
            Define el tono, época y reglas canónicas que guiarán todas las generaciones.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TabsList>
            <TabsTrigger value="project" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Proyecto
            </TabsTrigger>
            <TabsTrigger value="series" className="gap-2">
              <Library className="h-4 w-4" />
              Serie
            </TabsTrigger>
          </TabsList>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      <TabsContent value="project" className="space-y-6 mt-0">
        <div className="grid md:grid-cols-3 gap-4">
        {/* Tono */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tono</CardTitle>
            <CardDescription>La atmósfera emocional del proyecto</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tono..." />
              </SelectTrigger>
              <SelectContent>
                {PRESET_TONES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tone && (
              <p className="text-xs text-muted-foreground mt-2">
                Las generaciones mantendrán coherencia con este tono.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Época */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Época</CardTitle>
            <CardDescription>El período temporal de la historia</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar época..." />
              </SelectTrigger>
              <SelectContent>
                {PRESET_PERIODS.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period && (
              <p className="text-xs text-muted-foreground mt-2">
                El sistema advertirá sobre anacronismos.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Clasificación */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clasificación</CardTitle>
            <CardDescription>Límites de contenido permitido</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {PRESET_RATINGS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rating && (
              <p className="text-xs text-muted-foreground mt-2">
                Contenido que exceda esta clasificación será bloqueado.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hechos canónicos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hechos Canónicos</CardTitle>
          <CardDescription>
            Verdades establecidas que no pueden contradecirse en las generaciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="Ej: Elena tiene 28 años y es arquitecta..."
              onKeyDown={(e) => e.key === 'Enter' && addFact()}
            />
            <Button onClick={addFact} disabled={!newFact.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {facts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay hechos canónicos definidos.
            </p>
          ) : (
            <div className="space-y-2">
              {facts.map((fact, i) => (
                <div 
                  key={i} 
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded"
                >
                  <span className="flex-1 text-sm">{fact}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => removeFact(i)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            El sistema verificará que las generaciones no contradigan estos hechos.
          </p>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="series" className="mt-0">
        <SeriesBiblePanel projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
}
