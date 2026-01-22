import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  User, 
  Camera, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Upload,
  X,
  CheckCircle2,
  PawPrint,
  Bot,
  Ghost,
  SkipForward
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ROLE_PRESETS, type CharacterRoleType } from '@/lib/characterRolePresets';

interface CharacterCreationWizardProProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCharacterCreated: (characterId: string) => void;
}

type EntitySubtype = 'human' | 'animal' | 'creature' | 'robot' | 'other';

interface WizardData {
  name: string;
  bio: string;
  role: string;
  characterRole: CharacterRoleType | null;
  entitySubtype: EntitySubtype;
  referenceImage: File | null;
  referencePreview: string | null;
  physicalDescription: string;
}

const ENTITY_TYPES: { value: EntitySubtype; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'human', label: 'Humano', icon: <User className="h-5 w-5" />, description: 'Persona realista o estilizada' },
  { value: 'animal', label: 'Animal', icon: <PawPrint className="h-5 w-5" />, description: 'Mascota, animal salvaje, etc.' },
  { value: 'creature', label: 'Criatura', icon: <Ghost className="h-5 w-5" />, description: 'Ser fantástico o mitológico' },
  { value: 'robot', label: 'Robot/IA', icon: <Bot className="h-5 w-5" />, description: 'Máquina o inteligencia artificial' },
];

const STEPS = [
  { id: 'info', title: 'Información Básica', required: true },
  { id: 'type', title: 'Tipo de Entidad', required: false },
  { id: 'reference', title: 'Foto de Referencia', required: false },
  { id: 'details', title: 'Detalles Físicos', required: false },
  { id: 'confirm', title: 'Crear Personaje', required: true },
];

export function CharacterCreationWizardPro({
  projectId,
  open,
  onOpenChange,
  onCharacterCreated,
}: CharacterCreationWizardProProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [data, setData] = useState<WizardData>({
    name: '',
    bio: '',
    role: '',
    characterRole: null,
    entitySubtype: 'human',
    referenceImage: null,
    referencePreview: null,
    physicalDescription: '',
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject HEIC files
    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
      toast.error('Formato HEIC no soportado. Por favor, usa JPG o PNG.');
      return;
    }

    const preview = URL.createObjectURL(file);
    setData(prev => ({ ...prev, referenceImage: file, referencePreview: preview }));
  };

  const removeReference = () => {
    if (data.referencePreview) {
      URL.revokeObjectURL(data.referencePreview);
    }
    setData(prev => ({ ...prev, referenceImage: null, referencePreview: null }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: // Info básica
        return data.name.trim().length >= 2;
      case 1: // Tipo (opcional)
      case 2: // Referencia (opcional)
      case 3: // Detalles (opcional)
        return true;
      case 4: // Confirmar
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkipToEnd = () => {
    setCurrentStep(STEPS.length - 1);
  };

  const handleCreate = async () => {
    if (!data.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setIsCreating(true);
    try {
      // Upload reference image if provided
      let referenceUrl: string | null = null;
      if (data.referenceImage) {
        const fileExt = data.referenceImage.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `characters/${projectId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('character-refs')
          .upload(filePath, data.referenceImage);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('character-refs')
            .getPublicUrl(filePath);
          referenceUrl = urlData.publicUrl;
        }
      }

      // Create character - map characterRole to valid enum values
      const characterRoleMap: Record<CharacterRoleType, 'protagonist' | 'recurring' | 'episodic' | 'extra'> = {
        lead: 'protagonist',
        supporting: 'recurring',
        recurring: 'recurring',
        background: 'extra',
        custom: 'episodic',
      };
      
      const { data: newChar, error } = await supabase
        .from('characters')
        .insert({
          project_id: projectId,
          name: data.name.trim(),
          bio: data.bio.trim() || null,
          role: data.role.trim() || null,
          character_role: data.characterRole ? characterRoleMap[data.characterRole] : null,
          entity_subtype: data.entitySubtype,
          visual_dna: data.physicalDescription ? { physical_description: data.physicalDescription } : null,
          turnaround_urls: referenceUrl ? { front: referenceUrl } : null,
          source: 'wizard_pro',
        })
        .select('id')
        .single();

      if (error) throw error;

      // If reference image was uploaded, create a reference anchor and ref slot
      if (referenceUrl && newChar) {
        // Create reference anchor in the new table
        await supabase.from('reference_anchors').insert({
          character_id: newChar.id,
          anchor_type: 'identity_primary',
          image_url: referenceUrl,
          priority: 1,
          is_active: true,
          approved: true,
        });

        // Also create a ref slot
        await supabase.from('character_pack_slots').insert({
          character_id: newChar.id,
          slot_type: 'ref_closeup_front',
          slot_index: 0,
          image_url: referenceUrl,
          status: 'uploaded',
          required: false,
        });
      }

      toast.success(`${data.name} creado correctamente`);
      onCharacterCreated(newChar.id);
      onOpenChange(false);

      // Reset wizard
      setCurrentStep(0);
      setData({
        name: '',
        bio: '',
        role: '',
        characterRole: null,
        entitySubtype: 'human',
        referenceImage: null,
        referencePreview: null,
        physicalDescription: '',
      });
    } catch (err) {
      console.error('Error creating character:', err);
      toast.error('Error al crear el personaje');
    } finally {
      setIsCreating(false);
    }
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Crear Personaje PRO
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{STEPS[currentStep].title}</span>
            <span>Paso {currentStep + 1} de {STEPS.length}</span>
          </div>
          <Progress value={progress} className="h-1" />
          <div className="flex gap-1">
            {STEPS.map((step, idx) => (
              <div
                key={step.id}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  idx <= currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[280px] py-4">
          {/* Step 0: Info Básica */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del personaje *</Label>
                <Input
                  id="name"
                  placeholder="Ej: María, Rex, Robot-X1"
                  value={data.name}
                  onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rol en la historia</Label>
                <Input
                  id="role"
                  placeholder="Ej: Protagonista, Villano, Mascota"
                  value={data.role}
                  onChange={(e) => setData(prev => ({ ...prev, role: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="characterRole">Tipo de rol narrativo</Label>
                <Select
                  value={data.characterRole || ''}
                  onValueChange={(v) => setData(prev => ({ ...prev, characterRole: v as CharacterRoleType }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rol..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_PRESETS).map(([key, role]) => (
                      <SelectItem key={key} value={key}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Biografía breve</Label>
                <Textarea
                  id="bio"
                  placeholder="Una breve descripción del personaje..."
                  value={data.bio}
                  onChange={(e) => setData(prev => ({ ...prev, bio: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 1: Tipo de Entidad */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecciona el tipo de entidad para optimizar la generación de imágenes.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {ENTITY_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setData(prev => ({ ...prev, entitySubtype: type.value }))}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      data.entitySubtype === type.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {type.icon}
                      <span className="font-medium">{type.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </button>
                ))}
              </div>
              <Badge variant="outline" className="text-xs">
                Opcional - Por defecto: Humano
              </Badge>
            </div>
          )}

          {/* Step 2: Referencia */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sube una foto de referencia para guiar la generación del personaje.
              </p>
              
              {data.referencePreview ? (
                <div className="relative">
                  <img
                    src={data.referencePreview}
                    alt="Referencia"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={removeReference}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="absolute bottom-2 left-2">
                    <Badge variant="secondary" className="bg-background/80">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Referencia cargada
                    </Badge>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click para subir imagen</span>
                  <span className="text-xs text-muted-foreground mt-1">JPG, PNG (máx. 10MB)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}
              
              <Badge variant="outline" className="text-xs">
                Opcional - Sin imagen se usará texto para generar
              </Badge>
            </div>
          )}

          {/* Step 3: Detalles Físicos */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Describe los rasgos físicos distintivos del personaje.
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="physical">Descripción física</Label>
                <Textarea
                  id="physical"
                  placeholder={
                    data.entitySubtype === 'animal' 
                      ? "Ej: Perro labrador dorado, pelaje brillante, ojos marrones expresivos, collar azul..."
                      : data.entitySubtype === 'robot'
                      ? "Ej: Robot humanoide metálico, ojos LED azules, 1.8m de altura, acabado cromado..."
                      : "Ej: Mujer de 30 años, cabello castaño ondulado, ojos verdes, pecas en las mejillas..."
                  }
                  value={data.physicalDescription}
                  onChange={(e) => setData(prev => ({ ...prev, physicalDescription: e.target.value }))}
                  rows={5}
                />
              </div>

              <Badge variant="outline" className="text-xs">
                Opcional - Ayuda a generar imágenes más precisas
              </Badge>
            </div>
          )}

          {/* Step 4: Confirmar */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Revisa la información antes de crear el personaje.
              </p>
              
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {data.referencePreview ? (
                    <img 
                      src={data.referencePreview} 
                      alt="Preview" 
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      {data.entitySubtype === 'animal' ? <PawPrint className="h-6 w-6 text-muted-foreground" /> :
                       data.entitySubtype === 'robot' ? <Bot className="h-6 w-6 text-muted-foreground" /> :
                       data.entitySubtype === 'creature' ? <Ghost className="h-6 w-6 text-muted-foreground" /> :
                       <User className="h-6 w-6 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-semibold">{data.name || 'Sin nombre'}</h4>
                    <p className="text-sm text-muted-foreground">{data.role || 'Sin rol definido'}</p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {ENTITY_TYPES.find(t => t.value === data.entitySubtype)?.label || 'Humano'}
                    </Badge>
                  </div>
                </div>

                {data.bio && (
                  <p className="text-sm border-t pt-3">{data.bio}</p>
                )}

                {data.physicalDescription && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-1">Descripción física:</p>
                    <p className="text-sm">{data.physicalDescription}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <span>Después de crear, podrás generar el pack visual completo</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            {currentStep > 0 && (
              <Button variant="ghost" onClick={handleBack} disabled={isCreating}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && currentStep < STEPS.length - 1 && (
              <Button variant="ghost" size="sm" onClick={handleSkipToEnd}>
                <SkipForward className="h-4 w-4 mr-1" />
                Saltar al final
              </Button>
            )}

            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={isCreating || !data.name.trim()}>
                {isCreating ? (
                  <>Creando...</>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" />
                    Crear Personaje
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
