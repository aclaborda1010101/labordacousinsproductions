import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Lock, Shield, AlertTriangle, Plus, X, ChevronDown, ChevronUp, 
  Save, Loader2, Eye
} from 'lucide-react';
import { toast } from 'sonner';

export interface ContinuityLock {
  never_change: string[];
  allowed_variants: Array<{
    field_path: string;
    allowed_values: string[];
    context: string;
  }>;
  must_avoid: string[];
  version_notes: string;
}

interface ContinuityLockEditorProps {
  lock: ContinuityLock;
  onSave: (lock: ContinuityLock) => Promise<void>;
  saving?: boolean;
  visualDnaFields?: string[];
}

// Common Visual DNA field paths for suggestions
const COMMON_FIELDS = [
  'physical_identity.age_exact',
  'physical_identity.biological_sex',
  'physical_identity.ethnicity.primary',
  'physical_identity.ethnicity.skin_tone',
  'physical_identity.height_cm',
  'physical_identity.body_type.build',
  'face.shape',
  'face.eyes.color',
  'face.eyes.color_hex',
  'face.eyes.shape',
  'face.nose.shape',
  'face.mouth.lip_fullness',
  'face.jaw_chin.jaw_shape',
  'face.distinctive_marks.scars',
  'hair.length',
  'hair.texture',
  'hair.color.base',
  'hair.color.color_hex',
  'hair.style',
  'hair.facial_hair.type',
  'skin.texture',
  'hands.distinctive_features',
  'visual_references.celebrity_likeness.primary.name',
  'visual_references.celebrity_likeness.primary.percentage',
];

const COMMON_AVOID_TERMS = [
  'extra fingers',
  'deformed hands',
  'asymmetric face',
  'wrong eye color',
  'different skin tone',
  'age inconsistency',
  'height inconsistency',
  'missing scars',
  'wrong hair color',
  'wrong hairstyle',
  'beard when clean-shaven',
  'no beard when bearded',
  'glasses when none',
  'tattoos when none',
];

export function ContinuityLockEditor({
  lock,
  onSave,
  saving = false,
  visualDnaFields = COMMON_FIELDS,
}: ContinuityLockEditorProps) {
  const [data, setData] = useState<ContinuityLock>(lock);
  const [expandedSections, setExpandedSections] = useState({
    never_change: true,
    allowed_variants: false,
    must_avoid: true,
  });
  const [newNeverChange, setNewNeverChange] = useState('');
  const [newMustAvoid, setNewMustAvoid] = useState('');
  const [newVariant, setNewVariant] = useState({
    field_path: '',
    allowed_values: '',
    context: '',
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSave = async () => {
    try {
      await onSave(data);
    } catch (e) {
      toast.error('Error al guardar continuity lock');
    }
  };

  const addNeverChange = () => {
    if (!newNeverChange.trim()) return;
    if (data.never_change.includes(newNeverChange.trim())) {
      toast.error('Este campo ya está bloqueado');
      return;
    }
    setData(prev => ({
      ...prev,
      never_change: [...prev.never_change, newNeverChange.trim()],
    }));
    setNewNeverChange('');
  };

  const removeNeverChange = (index: number) => {
    setData(prev => ({
      ...prev,
      never_change: prev.never_change.filter((_, i) => i !== index),
    }));
  };

  const addMustAvoid = () => {
    if (!newMustAvoid.trim()) return;
    if (data.must_avoid.includes(newMustAvoid.trim())) {
      toast.error('Este término ya está en la lista');
      return;
    }
    setData(prev => ({
      ...prev,
      must_avoid: [...prev.must_avoid, newMustAvoid.trim()],
    }));
    setNewMustAvoid('');
  };

  const removeMustAvoid = (index: number) => {
    setData(prev => ({
      ...prev,
      must_avoid: prev.must_avoid.filter((_, i) => i !== index),
    }));
  };

  const addVariant = () => {
    if (!newVariant.field_path.trim() || !newVariant.allowed_values.trim()) {
      toast.error('Campo y valores permitidos son obligatorios');
      return;
    }
    const values = newVariant.allowed_values.split(',').map(v => v.trim()).filter(Boolean);
    setData(prev => ({
      ...prev,
      allowed_variants: [
        ...prev.allowed_variants,
        {
          field_path: newVariant.field_path.trim(),
          allowed_values: values,
          context: newVariant.context.trim(),
        },
      ],
    }));
    setNewVariant({ field_path: '', allowed_values: '', context: '' });
  };

  const removeVariant = (index: number) => {
    setData(prev => ({
      ...prev,
      allowed_variants: prev.allowed_variants.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold">Continuity Lock</h3>
            <p className="text-xs text-muted-foreground">
              Reglas para mantener consistencia visual
            </p>
          </div>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar Lock
        </Button>
      </div>

      <div className="space-y-2">
        {/* Never Change Section */}
        <Card>
          <Collapsible open={expandedSections.never_change}>
            <CollapsibleTrigger
              onClick={() => toggleSection('never_change')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Lock className="w-4 h-4 text-destructive" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">Nunca Cambiar</h4>
                  <p className="text-xs text-muted-foreground">
                    Campos que NUNCA deben modificarse ({data.never_change.length})
                  </p>
                </div>
              </div>
              {expandedSections.never_change ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {data.never_change.map((field, i) => (
                    <Badge 
                      key={i} 
                      variant="outline" 
                      className="bg-destructive/10 text-destructive border-destructive/30 flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      {field}
                      <X 
                        className="w-3 h-3 cursor-pointer hover:text-destructive ml-1" 
                        onClick={() => removeNeverChange(i)} 
                      />
                    </Badge>
                  ))}
                  {data.never_change.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      No hay campos bloqueados
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      value={newNeverChange}
                      onChange={e => setNewNeverChange(e.target.value)}
                      placeholder="Ej: face.eyes.color"
                      className="h-8 text-sm"
                      list="field-suggestions"
                      onKeyDown={e => e.key === 'Enter' && addNeverChange()}
                    />
                    <datalist id="field-suggestions">
                      {visualDnaFields
                        .filter(f => !data.never_change.includes(f))
                        .map(f => (
                          <option key={f} value={f} />
                        ))}
                    </datalist>
                  </div>
                  <Button size="sm" variant="outline" onClick={addNeverChange}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>

                {/* Quick add common fields */}
                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Añadir rápido:
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {['face.eyes.color', 'physical_identity.ethnicity.skin_tone', 'hair.color.base', 'face.distinctive_marks.scars']
                      .filter(f => !data.never_change.includes(f))
                      .map(field => (
                        <Badge 
                          key={field}
                          variant="outline" 
                          className="cursor-pointer hover:bg-muted text-xs"
                          onClick={() => {
                            setData(prev => ({
                              ...prev,
                              never_change: [...prev.never_change, field],
                            }));
                          }}
                        >
                          <Plus className="w-2 h-2 mr-1" />
                          {field.split('.').pop()}
                        </Badge>
                      ))}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Must Avoid Section */}
        <Card>
          <Collapsible open={expandedSections.must_avoid}>
            <CollapsibleTrigger
              onClick={() => toggleSection('must_avoid')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">Evitar Siempre</h4>
                  <p className="text-xs text-muted-foreground">
                    Términos para prompt negativo ({data.must_avoid.length})
                  </p>
                </div>
              </div>
              {expandedSections.must_avoid ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {data.must_avoid.map((term, i) => (
                    <Badge 
                      key={i} 
                      variant="outline" 
                      className="bg-amber-500/10 text-amber-700 border-amber-500/30 flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {term}
                      <X 
                        className="w-3 h-3 cursor-pointer hover:text-destructive ml-1" 
                        onClick={() => removeMustAvoid(i)} 
                      />
                    </Badge>
                  ))}
                  {data.must_avoid.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      No hay términos a evitar
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      value={newMustAvoid}
                      onChange={e => setNewMustAvoid(e.target.value)}
                      placeholder="Ej: extra fingers, wrong eye color"
                      className="h-8 text-sm"
                      list="avoid-suggestions"
                      onKeyDown={e => e.key === 'Enter' && addMustAvoid()}
                    />
                    <datalist id="avoid-suggestions">
                      {COMMON_AVOID_TERMS
                        .filter(t => !data.must_avoid.includes(t))
                        .map(t => (
                          <option key={t} value={t} />
                        ))}
                    </datalist>
                  </div>
                  <Button size="sm" variant="outline" onClick={addMustAvoid}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>

                {/* Quick add common avoid terms */}
                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Añadir rápido:
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {COMMON_AVOID_TERMS.slice(0, 5)
                      .filter(t => !data.must_avoid.includes(t))
                      .map(term => (
                        <Badge 
                          key={term}
                          variant="outline" 
                          className="cursor-pointer hover:bg-muted text-xs"
                          onClick={() => {
                            setData(prev => ({
                              ...prev,
                              must_avoid: [...prev.must_avoid, term],
                            }));
                          }}
                        >
                          <Plus className="w-2 h-2 mr-1" />
                          {term}
                        </Badge>
                      ))}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Allowed Variants Section */}
        <Card>
          <Collapsible open={expandedSections.allowed_variants}>
            <CollapsibleTrigger
              onClick={() => toggleSection('allowed_variants')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">Variantes Permitidas</h4>
                  <p className="text-xs text-muted-foreground">
                    Campos con valores limitados ({data.allowed_variants.length})
                  </p>
                </div>
              </div>
              {expandedSections.allowed_variants ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                {data.allowed_variants.map((variant, i) => (
                  <div key={i} className="p-3 border rounded-lg space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <code className="text-xs bg-muted px-2 py-1 rounded">{variant.field_path}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVariant(i)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {variant.allowed_values.map((val, j) => (
                        <Badge key={j} variant="secondary" className="text-xs">
                          {val}
                        </Badge>
                      ))}
                    </div>
                    {variant.context && (
                      <p className="text-xs text-muted-foreground italic">
                        Contexto: {variant.context}
                      </p>
                    )}
                  </div>
                ))}

                {data.allowed_variants.length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-2">
                    No hay variantes definidas
                  </p>
                )}

                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">Añadir variante:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={newVariant.field_path}
                      onChange={e => setNewVariant(prev => ({ ...prev, field_path: e.target.value }))}
                      placeholder="Campo (ej: hair.style)"
                      className="h-8 text-sm"
                      list="field-suggestions"
                    />
                    <Input
                      value={newVariant.allowed_values}
                      onChange={e => setNewVariant(prev => ({ ...prev, allowed_values: e.target.value }))}
                      placeholder="Valores permitidos (separados por coma)"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newVariant.context}
                      onChange={e => setNewVariant(prev => ({ ...prev, context: e.target.value }))}
                      placeholder="Contexto (opcional)"
                      className="h-8 text-sm flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={addVariant}>
                      <Plus className="w-3 h-3 mr-1" />
                      Añadir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Version Notes */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Notas de versión</Label>
          <Textarea
            value={data.version_notes}
            onChange={e => setData(prev => ({ ...prev, version_notes: e.target.value }))}
            placeholder="Notas sobre esta configuración de continuity lock..."
            rows={2}
            className="text-sm"
          />
        </div>
      </div>
    </div>
  );
}

export default ContinuityLockEditor;
