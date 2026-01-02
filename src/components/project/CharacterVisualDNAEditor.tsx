import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  ChevronDown, ChevronUp, User, Eye, Palette, Scissors, 
  Hand, Mic, Move, Star, Plus, X, Sparkles, Save, Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ===== INTERFACES =====
export interface CharacterVisualDNA {
  physical_identity: {
    age_exact: number;
    biological_sex: 'male' | 'female';
    gender_presentation: 'masculine' | 'feminine' | 'androgynous';
    ethnicity: {
      primary: string;
      secondary?: string;
      skin_tone: string;
    };
    height_cm: number;
    body_type: {
      build: string;
      musculature: string;
      weight_appearance: string;
      posture: string;
    };
  };
  face: {
    shape: string;
    eyes: {
      color: string;
      color_hex: string;
      shape: string;
      size: string;
      distance: string;
      distinctive_features: string[];
    };
    eyebrows: {
      thickness: string;
      shape: string;
      color: string;
    };
    nose: {
      bridge: string;
      shape: string;
      width: string;
      distinctive_features: string[];
    };
    mouth: {
      lip_fullness: string;
      lip_shape: string;
      lip_color: string;
    };
    jaw_chin: {
      jaw_shape: string;
      chin: string;
      jawline_definition: string;
    };
    cheekbones: {
      prominence: string;
      shape: string;
    };
    forehead: {
      height: string;
      width: string;
    };
    distinctive_marks: {
      scars: Array<{ location: string; description: string; visibility: string }>;
      moles: Array<{ location: string; size_mm: number; color: string }>;
      wrinkles: {
        forehead: string;
        eyes_crows_feet: string;
        nasolabial_folds: string;
        other: string[];
      };
    };
  };
  hair: {
    length: string;
    texture: string;
    thickness: string;
    color: {
      base: string;
      highlights: string[];
      color_hex: string;
    };
    style: string;
    distinctive_features: string[];
    facial_hair: {
      type: string;
      length_mm: number;
      density: string;
      color: string;
      grooming: string;
      distinctive_features: string[];
    };
  };
  skin: {
    texture: string;
    condition: string;
    sun_exposure: string;
    distinctive_features: string[];
  };
  hands: {
    size: string;
    fingers: string;
    skin_texture: string;
    nails: {
      length: string;
      condition: string;
    };
    distinctive_features: string[];
  };
  voice: {
    pitch: string;
    tone: string;
    accent: string;
    speech_pattern: string;
    distinctive_features: string[];
  };
  movement: {
    gait: string;
    posture_default: string;
    gestures: string[];
    tics_habits: string[];
  };
  visual_references: {
    celebrity_likeness: {
      primary: { name: string; percentage: number };
      secondary: { name: string; percentage: number };
      combination_note: string;
    };
    art_style: string;
    era_reference: string;
  };
}

// ===== DEFAULT VALUES =====
const getDefaultVisualDNA = (): CharacterVisualDNA => ({
  physical_identity: {
    age_exact: 35,
    biological_sex: 'male',
    gender_presentation: 'masculine',
    ethnicity: {
      primary: 'caucasian',
      secondary: '',
      skin_tone: 'Medium',
    },
    height_cm: 175,
    body_type: {
      build: 'average',
      musculature: 'moderate',
      weight_appearance: 'average',
      posture: 'upright_confident',
    },
  },
  face: {
    shape: 'oval',
    eyes: {
      color: 'brown',
      color_hex: '#6B4423',
      shape: 'almond',
      size: 'medium',
      distance: 'average',
      distinctive_features: [],
    },
    eyebrows: {
      thickness: 'medium',
      shape: 'arched',
      color: 'dark brown',
    },
    nose: {
      bridge: 'medium',
      shape: 'straight',
      width: 'medium',
      distinctive_features: [],
    },
    mouth: {
      lip_fullness: 'medium',
      lip_shape: 'cupids_bow_soft',
      lip_color: 'natural pink',
    },
    jaw_chin: {
      jaw_shape: 'rounded_soft',
      chin: 'rounded',
      jawline_definition: 'moderate',
    },
    cheekbones: {
      prominence: 'moderate',
      shape: 'rounded',
    },
    forehead: {
      height: 'medium',
      width: 'medium',
    },
    distinctive_marks: {
      scars: [],
      moles: [],
      wrinkles: {
        forehead: 'none',
        eyes_crows_feet: 'none',
        nasolabial_folds: 'none',
        other: [],
      },
    },
  },
  hair: {
    length: 'short',
    texture: 'straight',
    thickness: 'medium',
    color: {
      base: 'dark brown',
      highlights: [],
      color_hex: '#3D2817',
    },
    style: 'neat, combed to the side',
    distinctive_features: [],
    facial_hair: {
      type: 'clean_shaven',
      length_mm: 0,
      density: 'none',
      color: '',
      grooming: 'clean',
      distinctive_features: [],
    },
  },
  skin: {
    texture: 'smooth_natural',
    condition: 'clear',
    sun_exposure: 'light_tan',
    distinctive_features: [],
  },
  hands: {
    size: 'medium',
    fingers: 'average',
    skin_texture: 'smooth',
    nails: {
      length: 'short_trimmed',
      condition: 'clean_neat',
    },
    distinctive_features: [],
  },
  voice: {
    pitch: 'medium',
    tone: 'smooth',
    accent: 'neutral',
    speech_pattern: 'calm and measured',
    distinctive_features: [],
  },
  movement: {
    gait: 'confident stride',
    posture_default: 'relaxed, shoulders back',
    gestures: [],
    tics_habits: [],
  },
  visual_references: {
    celebrity_likeness: {
      primary: { name: '', percentage: 50 },
      secondary: { name: '', percentage: 50 },
      combination_note: '',
    },
    art_style: 'photorealistic',
    era_reference: 'Contemporary 2025',
  },
});

// ===== SELECT OPTIONS =====
const OPTIONS = {
  biological_sex: [
    { value: 'male', label: 'Masculino' },
    { value: 'female', label: 'Femenino' },
  ],
  gender_presentation: [
    { value: 'masculine', label: 'Masculino' },
    { value: 'feminine', label: 'Femenino' },
    { value: 'androgynous', label: 'Andrógino' },
  ],
  ethnicity: [
    { value: 'caucasian', label: 'Caucásico' },
    { value: 'african', label: 'Africano' },
    { value: 'asian_east', label: 'Asiático Oriental' },
    { value: 'asian_south', label: 'Asiático del Sur' },
    { value: 'middle_eastern', label: 'Medio Oriente' },
    { value: 'latin', label: 'Latino' },
    { value: 'mixed', label: 'Mixto' },
  ],
  skin_tone: [
    { value: 'Very_Fair', label: 'Muy claro' },
    { value: 'Fair', label: 'Claro' },
    { value: 'Light', label: 'Claro cálido' },
    { value: 'Medium', label: 'Medio' },
    { value: 'Olive', label: 'Oliva' },
    { value: 'Tan', label: 'Bronceado' },
    { value: 'Dark', label: 'Oscuro' },
    { value: 'Deep', label: 'Muy oscuro' },
  ],
  build: [
    { value: 'ectomorph_lean', label: 'Ectomorfo (delgado)' },
    { value: 'mesomorph_athletic', label: 'Mesomorfo (atlético)' },
    { value: 'endomorph_stocky', label: 'Endomorfo (robusto)' },
    { value: 'average', label: 'Promedio' },
  ],
  musculature: [
    { value: 'low', label: 'Baja' },
    { value: 'moderate', label: 'Moderada' },
    { value: 'athletic', label: 'Atlética' },
    { value: 'bodybuilder', label: 'Muy desarrollada' },
  ],
  weight_appearance: [
    { value: 'underweight', label: 'Bajo peso' },
    { value: 'slim', label: 'Delgado' },
    { value: 'average', label: 'Promedio' },
    { value: 'overweight', label: 'Sobrepeso' },
  ],
  posture: [
    { value: 'upright_confident', label: 'Erguido y confiado' },
    { value: 'slouched', label: 'Encorvado' },
    { value: 'military_rigid', label: 'Militar / Rígido' },
    { value: 'relaxed', label: 'Relajado' },
  ],
  face_shape: [
    { value: 'oval', label: 'Ovalado' },
    { value: 'round', label: 'Redondo' },
    { value: 'square', label: 'Cuadrado' },
    { value: 'heart', label: 'Corazón' },
    { value: 'diamond', label: 'Diamante' },
    { value: 'oblong', label: 'Oblongo' },
  ],
  eye_color: [
    { value: 'brown_dark', label: 'Marrón oscuro' },
    { value: 'brown_light', label: 'Marrón claro' },
    { value: 'hazel', label: 'Avellana' },
    { value: 'green', label: 'Verde' },
    { value: 'blue_light', label: 'Azul claro' },
    { value: 'blue_dark', label: 'Azul oscuro' },
    { value: 'grey', label: 'Gris' },
  ],
  eye_shape: [
    { value: 'almond', label: 'Almendrados' },
    { value: 'round', label: 'Redondos' },
    { value: 'hooded', label: 'Encapuchados' },
    { value: 'upturned', label: 'Elevados' },
    { value: 'downturned', label: 'Caídos' },
    { value: 'monolid', label: 'Monopárpado' },
  ],
  size: [
    { value: 'small', label: 'Pequeño' },
    { value: 'medium', label: 'Mediano' },
    { value: 'large', label: 'Grande' },
  ],
  distance: [
    { value: 'close_set', label: 'Juntos' },
    { value: 'average', label: 'Normal' },
    { value: 'wide_set', label: 'Separados' },
  ],
  eyebrow_thickness: [
    { value: 'thin', label: 'Finas' },
    { value: 'medium', label: 'Medias' },
    { value: 'thick', label: 'Gruesas' },
    { value: 'bushy', label: 'Pobladas' },
  ],
  eyebrow_shape: [
    { value: 'straight', label: 'Rectas' },
    { value: 'arched', label: 'Arqueadas' },
    { value: 'rounded', label: 'Redondeadas' },
    { value: 'angled', label: 'Angulosas' },
  ],
  nose_bridge: [
    { value: 'low', label: 'Bajo' },
    { value: 'medium', label: 'Medio' },
    { value: 'high', label: 'Alto' },
    { value: 'prominent', label: 'Prominente' },
  ],
  nose_shape: [
    { value: 'straight', label: 'Recta' },
    { value: 'roman', label: 'Romana' },
    { value: 'button', label: 'Respingona' },
    { value: 'hooked', label: 'Aguileña' },
    { value: 'upturned', label: 'Hacia arriba' },
  ],
  nose_width: [
    { value: 'narrow', label: 'Estrecha' },
    { value: 'medium', label: 'Media' },
    { value: 'wide', label: 'Ancha' },
  ],
  lip_fullness: [
    { value: 'thin', label: 'Finos' },
    { value: 'medium', label: 'Medios' },
    { value: 'full', label: 'Gruesos' },
  ],
  lip_shape: [
    { value: 'straight', label: 'Rectos' },
    { value: 'cupids_bow_defined', label: 'Arco de cupido definido' },
    { value: 'cupids_bow_soft', label: 'Arco de cupido suave' },
    { value: 'downturned', label: 'Hacia abajo' },
  ],
  jaw_shape: [
    { value: 'sharp_angular', label: 'Angular y marcada' },
    { value: 'rounded_soft', label: 'Redondeada y suave' },
    { value: 'square_strong', label: 'Cuadrada y fuerte' },
    { value: 'weak_receding', label: 'Retraída' },
  ],
  chin: [
    { value: 'pointed', label: 'Puntiaguda' },
    { value: 'rounded', label: 'Redondeada' },
    { value: 'square', label: 'Cuadrada' },
    { value: 'cleft', label: 'Con hendidura' },
    { value: 'receding', label: 'Retraída' },
  ],
  jawline_definition: [
    { value: 'very_defined', label: 'Muy definida' },
    { value: 'moderate', label: 'Moderada' },
    { value: 'soft', label: 'Suave' },
  ],
  cheekbone_prominence: [
    { value: 'flat', label: 'Planos' },
    { value: 'subtle', label: 'Sutiles' },
    { value: 'moderate', label: 'Moderados' },
    { value: 'high_prominent', label: 'Altos y prominentes' },
  ],
  cheekbone_shape: [
    { value: 'rounded', label: 'Redondeados' },
    { value: 'angular', label: 'Angulares' },
  ],
  height: [
    { value: 'low', label: 'Baja' },
    { value: 'medium', label: 'Media' },
    { value: 'high', label: 'Alta' },
  ],
  width: [
    { value: 'narrow', label: 'Estrecha' },
    { value: 'medium', label: 'Media' },
    { value: 'wide', label: 'Ancha' },
  ],
  wrinkle_level: [
    { value: 'none', label: 'Ninguna' },
    { value: 'light', label: 'Leve' },
    { value: 'moderate', label: 'Moderada' },
    { value: 'deep', label: 'Profunda' },
  ],
  hair_length: [
    { value: 'bald', label: 'Calvo' },
    { value: 'buzzcut', label: 'Rapado' },
    { value: 'short', label: 'Corto' },
    { value: 'medium', label: 'Medio' },
    { value: 'long', label: 'Largo' },
    { value: 'very_long', label: 'Muy largo' },
  ],
  hair_texture: [
    { value: 'straight', label: 'Liso' },
    { value: 'wavy', label: 'Ondulado' },
    { value: 'curly', label: 'Rizado' },
    { value: 'coily', label: 'Muy rizado' },
    { value: 'kinky', label: 'Afro' },
  ],
  hair_thickness: [
    { value: 'thin_fine', label: 'Fino' },
    { value: 'medium', label: 'Medio' },
    { value: 'thick_dense', label: 'Grueso y denso' },
  ],
  facial_hair_type: [
    { value: 'clean_shaven', label: 'Afeitado' },
    { value: 'stubble', label: 'Barba incipiente' },
    { value: 'goatee', label: 'Perilla' },
    { value: 'full_beard', label: 'Barba completa' },
    { value: 'mustache', label: 'Bigote' },
    { value: 'soul_patch', label: 'Mosca' },
  ],
  facial_hair_density: [
    { value: 'none', label: 'Ninguna' },
    { value: 'sparse', label: 'Escasa' },
    { value: 'medium', label: 'Media' },
    { value: 'thick', label: 'Densa' },
  ],
  facial_hair_grooming: [
    { value: 'clean', label: 'Limpio' },
    { value: 'scruffy', label: 'Descuidado' },
    { value: 'neat_trimmed', label: 'Recortado' },
    { value: 'styled', label: 'Estilizado' },
  ],
  skin_texture: [
    { value: 'smooth_flawless', label: 'Suave impecable' },
    { value: 'smooth_natural', label: 'Suave natural' },
    { value: 'textured_pores_visible', label: 'Texturada con poros visibles' },
    { value: 'rough', label: 'Áspera' },
    { value: 'weathered', label: 'Curtida' },
  ],
  skin_condition: [
    { value: 'clear', label: 'Limpia' },
    { value: 'occasional_blemishes', label: 'Imperfecciones ocasionales' },
    { value: 'acne', label: 'Acné' },
    { value: 'scarred', label: 'Con cicatrices' },
    { value: 'aged', label: 'Envejecida' },
  ],
  sun_exposure: [
    { value: 'pale_no_tan', label: 'Pálido sin bronceado' },
    { value: 'light_tan', label: 'Bronceado ligero' },
    { value: 'moderate_tan', label: 'Bronceado moderado' },
    { value: 'deep_tan', label: 'Bronceado intenso' },
    { value: 'sun_damaged', label: 'Dañada por el sol' },
  ],
  hand_size: [
    { value: 'small_delicate', label: 'Pequeñas y delicadas' },
    { value: 'medium', label: 'Medianas' },
    { value: 'large_robust', label: 'Grandes y robustas' },
  ],
  fingers: [
    { value: 'short', label: 'Cortos' },
    { value: 'average', label: 'Normales' },
    { value: 'long', label: 'Largos' },
  ],
  hand_texture: [
    { value: 'smooth', label: 'Suave' },
    { value: 'calloused', label: 'Con callos' },
    { value: 'rough', label: 'Áspera' },
    { value: 'aged_wrinkled', label: 'Envejecida y arrugada' },
  ],
  nail_length: [
    { value: 'short_trimmed', label: 'Cortas y recortadas' },
    { value: 'medium', label: 'Medias' },
    { value: 'long', label: 'Largas' },
  ],
  nail_condition: [
    { value: 'clean_neat', label: 'Limpias y cuidadas' },
    { value: 'chipped', label: 'Descascaradas' },
    { value: 'dirty_mechanic', label: 'Sucias de trabajo' },
    { value: 'polished', label: 'Pulidas/pintadas' },
  ],
  voice_pitch: [
    { value: 'very_low', label: 'Muy grave' },
    { value: 'low', label: 'Grave' },
    { value: 'medium', label: 'Media' },
    { value: 'high', label: 'Aguda' },
    { value: 'very_high', label: 'Muy aguda' },
  ],
  voice_tone: [
    { value: 'gravelly', label: 'Ronca' },
    { value: 'smooth', label: 'Suave' },
    { value: 'nasal', label: 'Nasal' },
    { value: 'breathy', label: 'Susurrante' },
    { value: 'husky', label: 'Rasposa' },
  ],
  art_style: [
    { value: 'photorealistic', label: 'Fotorrealista' },
    { value: 'slightly_stylized', label: 'Ligeramente estilizado' },
    { value: 'animation_realistic', label: 'Animación realista' },
    { value: 'mocap_game', label: 'Videojuego AAA' },
  ],
};

// ===== COMPONENT PROPS =====
interface CharacterVisualDNAEditorProps {
  characterId: string;
  characterName: string;
  characterBio?: string;
  initialData?: CharacterVisualDNA | null;
  onSave?: (data?: CharacterVisualDNA) => void;
  onGenerateWithAI?: () => void;
  saving?: boolean;
}

// ===== HELPER COMPONENT: Select Field =====
const SelectField = ({
  label,
  value,
  options,
  onChange,
  placeholder = 'Seleccionar...',
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

// ===== HELPER COMPONENT: Tag List =====
const TagList = ({
  label,
  items,
  onAdd,
  onRemove,
  placeholder = 'Añadir rasgo...',
}: {
  label: string;
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}) => {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(newItem.trim());
      setNewItem('');
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1 mb-2">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1">
            {item}
            <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => onRemove(i)} />
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm flex-1"
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
        />
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

// ===== MAIN COMPONENT =====
function CharacterVisualDNAEditor({
  characterId,
  characterName,
  characterBio,
  initialData,
  onSave,
  onGenerateWithAI,
  saving = false,
}: CharacterVisualDNAEditorProps) {
  const [data, setData] = useState<CharacterVisualDNA>(initialData || getDefaultVisualDNA());
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    physical: true,
    face: false,
    hair: false,
    skin: false,
    hands: false,
    voice: false,
    movement: false,
    references: false,
  });
  const [generating, setGenerating] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Deep update helper
  const updateData = (path: string[], value: any) => {
    setData(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      let current = newData;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newData;
    });
  };

  // Generate Visual DNA with AI based on current narrative bio
  const generateWithAI = async () => {
    setGenerating(true);
    try {
      const response = await supabase.functions.invoke('generate-visual-dna', {
        body: {
          characterId,
          characterName,
        },
      });

      if (response.error) {
        if (response.error.message?.includes('429')) {
          toast.error('Límite de solicitudes excedido. Intenta de nuevo en unos minutos.');
        } else if (response.error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Por favor añade fondos a tu cuenta.');
        } else {
          throw new Error(response.error.message);
        }
        return;
      }

      const { visualDNA } = response.data;
      if (visualDNA) {
        setData(visualDNA);
        toast.success('Visual DNA generado con IA');
      }
    } catch (error) {
      console.error('Error generating Visual DNA:', error);
      toast.error('Error al generar Visual DNA');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    // Save to database
    try {
      const { error } = await supabase
        .from('characters')
        .update({ profile_json: { ...data, visual_dna: true } })
        .eq('id', characterId);
      
      if (error) throw error;
      toast.success('Visual DNA guardado');
      onSave?.(data);
    } catch (error) {
      console.error('Error saving Visual DNA:', error);
      toast.error('Error al guardar Visual DNA');
    }
  };

  // Section Header Component
  const SectionHeader = ({ 
    id, 
    icon: Icon, 
    title, 
    description 
  }: { 
    id: string; 
    icon: React.ElementType; 
    title: string; 
    description: string;
  }) => (
    <CollapsibleTrigger
      onClick={() => toggleSection(id)}
      className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="text-left">
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {expandedSections[id] ? (
        <ChevronUp className="w-4 h-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      )}
    </CollapsibleTrigger>
  );

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Visual DNA - {characterName}
          </h3>
          <p className="text-sm text-muted-foreground">
            Define los atributos físicos precisos para generación consistente
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generateWithAI}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Generar con IA
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {/* Physical Identity */}
        <Card>
          <Collapsible open={expandedSections.physical}>
            <SectionHeader
              id="physical"
              icon={User}
              title="Identidad Física"
              description="Edad, sexo, etnia, altura y complexión"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Edad exacta</Label>
                  <Input
                    type="number"
                    value={data.physical_identity.age_exact}
                    onChange={e => updateData(['physical_identity', 'age_exact'], parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
                <SelectField
                  label="Sexo biológico"
                  value={data.physical_identity.biological_sex}
                  options={OPTIONS.biological_sex}
                  onChange={v => updateData(['physical_identity', 'biological_sex'], v)}
                />
                <SelectField
                  label="Presentación de género"
                  value={data.physical_identity.gender_presentation}
                  options={OPTIONS.gender_presentation}
                  onChange={v => updateData(['physical_identity', 'gender_presentation'], v)}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Altura (cm)</Label>
                  <Input
                    type="number"
                    value={data.physical_identity.height_cm}
                    onChange={e => updateData(['physical_identity', 'height_cm'], parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </div>
                <SelectField
                  label="Etnia principal"
                  value={data.physical_identity.ethnicity.primary}
                  options={OPTIONS.ethnicity}
                  onChange={v => updateData(['physical_identity', 'ethnicity', 'primary'], v)}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Etnia secundaria</Label>
                  <Input
                    value={data.physical_identity.ethnicity.secondary || ''}
                    onChange={e => updateData(['physical_identity', 'ethnicity', 'secondary'], e.target.value)}
                    placeholder="Ej: irish_italian_mix"
                    className="h-8 text-sm"
                  />
                </div>
                <SelectField
                  label="Tono de piel"
                  value={data.physical_identity.ethnicity.skin_tone}
                  options={OPTIONS.skin_tone}
                  onChange={v => updateData(['physical_identity', 'ethnicity', 'skin_tone'], v)}
                />
                <SelectField
                  label="Complexión"
                  value={data.physical_identity.body_type.build}
                  options={OPTIONS.build}
                  onChange={v => updateData(['physical_identity', 'body_type', 'build'], v)}
                />
                <SelectField
                  label="Musculatura"
                  value={data.physical_identity.body_type.musculature}
                  options={OPTIONS.musculature}
                  onChange={v => updateData(['physical_identity', 'body_type', 'musculature'], v)}
                />
                <SelectField
                  label="Peso aparente"
                  value={data.physical_identity.body_type.weight_appearance}
                  options={OPTIONS.weight_appearance}
                  onChange={v => updateData(['physical_identity', 'body_type', 'weight_appearance'], v)}
                />
                <SelectField
                  label="Postura"
                  value={data.physical_identity.body_type.posture}
                  options={OPTIONS.posture}
                  onChange={v => updateData(['physical_identity', 'body_type', 'posture'], v)}
                />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Face */}
        <Card>
          <Collapsible open={expandedSections.face}>
            <SectionHeader
              id="face"
              icon={Eye}
              title="Rostro"
              description="Forma, ojos, nariz, boca, mandíbula y marcas distintivas"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {/* Face shape */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SelectField
                    label="Forma de cara"
                    value={data.face.shape}
                    options={OPTIONS.face_shape}
                    onChange={v => updateData(['face', 'shape'], v)}
                  />
                </div>

                {/* Eyes */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Ojos
                  </h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SelectField
                      label="Color"
                      value={data.face.eyes.color}
                      options={OPTIONS.eye_color}
                      onChange={v => updateData(['face', 'eyes', 'color'], v)}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Color Hex</Label>
                      <div className="flex gap-2">
                        <Input
                          value={data.face.eyes.color_hex}
                          onChange={e => updateData(['face', 'eyes', 'color_hex'], e.target.value)}
                          className="h-8 text-sm flex-1"
                        />
                        <input
                          type="color"
                          value={data.face.eyes.color_hex}
                          onChange={e => updateData(['face', 'eyes', 'color_hex'], e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                    <SelectField
                      label="Forma"
                      value={data.face.eyes.shape}
                      options={OPTIONS.eye_shape}
                      onChange={v => updateData(['face', 'eyes', 'shape'], v)}
                    />
                    <SelectField
                      label="Tamaño"
                      value={data.face.eyes.size}
                      options={OPTIONS.size}
                      onChange={v => updateData(['face', 'eyes', 'size'], v)}
                    />
                    <SelectField
                      label="Distancia"
                      value={data.face.eyes.distance}
                      options={OPTIONS.distance}
                      onChange={v => updateData(['face', 'eyes', 'distance'], v)}
                    />
                  </div>
                  <div className="mt-3">
                    <TagList
                      label="Rasgos distintivos de ojos"
                      items={data.face.eyes.distinctive_features}
                      onAdd={item => updateData(['face', 'eyes', 'distinctive_features'], [...data.face.eyes.distinctive_features, item])}
                      onRemove={i => updateData(['face', 'eyes', 'distinctive_features'], data.face.eyes.distinctive_features.filter((_, idx) => idx !== i))}
                      placeholder="Ej: bolsas bajo ojos, mirada intensa..."
                    />
                  </div>
                </div>

                {/* Eyebrows */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3">Cejas</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <SelectField
                      label="Grosor"
                      value={data.face.eyebrows.thickness}
                      options={OPTIONS.eyebrow_thickness}
                      onChange={v => updateData(['face', 'eyebrows', 'thickness'], v)}
                    />
                    <SelectField
                      label="Forma"
                      value={data.face.eyebrows.shape}
                      options={OPTIONS.eyebrow_shape}
                      onChange={v => updateData(['face', 'eyebrows', 'shape'], v)}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Color</Label>
                      <Input
                        value={data.face.eyebrows.color}
                        onChange={e => updateData(['face', 'eyebrows', 'color'], e.target.value)}
                        placeholder="Ej: castaño oscuro"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Nose */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3">Nariz</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <SelectField
                      label="Puente"
                      value={data.face.nose.bridge}
                      options={OPTIONS.nose_bridge}
                      onChange={v => updateData(['face', 'nose', 'bridge'], v)}
                    />
                    <SelectField
                      label="Forma"
                      value={data.face.nose.shape}
                      options={OPTIONS.nose_shape}
                      onChange={v => updateData(['face', 'nose', 'shape'], v)}
                    />
                    <SelectField
                      label="Anchura"
                      value={data.face.nose.width}
                      options={OPTIONS.nose_width}
                      onChange={v => updateData(['face', 'nose', 'width'], v)}
                    />
                  </div>
                  <div className="mt-3">
                    <TagList
                      label="Rasgos distintivos de nariz"
                      items={data.face.nose.distinctive_features}
                      onAdd={item => updateData(['face', 'nose', 'distinctive_features'], [...data.face.nose.distinctive_features, item])}
                      onRemove={i => updateData(['face', 'nose', 'distinctive_features'], data.face.nose.distinctive_features.filter((_, idx) => idx !== i))}
                      placeholder="Ej: pequeño bulto en puente..."
                    />
                  </div>
                </div>

                {/* Mouth */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3">Boca</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <SelectField
                      label="Grosor de labios"
                      value={data.face.mouth.lip_fullness}
                      options={OPTIONS.lip_fullness}
                      onChange={v => updateData(['face', 'mouth', 'lip_fullness'], v)}
                    />
                    <SelectField
                      label="Forma de labios"
                      value={data.face.mouth.lip_shape}
                      options={OPTIONS.lip_shape}
                      onChange={v => updateData(['face', 'mouth', 'lip_shape'], v)}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Color de labios</Label>
                      <Input
                        value={data.face.mouth.lip_color}
                        onChange={e => updateData(['face', 'mouth', 'lip_color'], e.target.value)}
                        placeholder="Ej: rosa natural"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Jaw/Chin */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3">Mandíbula y mentón</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <SelectField
                      label="Forma de mandíbula"
                      value={data.face.jaw_chin.jaw_shape}
                      options={OPTIONS.jaw_shape}
                      onChange={v => updateData(['face', 'jaw_chin', 'jaw_shape'], v)}
                    />
                    <SelectField
                      label="Mentón"
                      value={data.face.jaw_chin.chin}
                      options={OPTIONS.chin}
                      onChange={v => updateData(['face', 'jaw_chin', 'chin'], v)}
                    />
                    <SelectField
                      label="Definición de mandíbula"
                      value={data.face.jaw_chin.jawline_definition}
                      options={OPTIONS.jawline_definition}
                      onChange={v => updateData(['face', 'jaw_chin', 'jawline_definition'], v)}
                    />
                  </div>
                </div>

                {/* Cheekbones & Forehead */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3">Pómulos y frente</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SelectField
                      label="Prominencia pómulos"
                      value={data.face.cheekbones.prominence}
                      options={OPTIONS.cheekbone_prominence}
                      onChange={v => updateData(['face', 'cheekbones', 'prominence'], v)}
                    />
                    <SelectField
                      label="Forma pómulos"
                      value={data.face.cheekbones.shape}
                      options={OPTIONS.cheekbone_shape}
                      onChange={v => updateData(['face', 'cheekbones', 'shape'], v)}
                    />
                    <SelectField
                      label="Altura frente"
                      value={data.face.forehead.height}
                      options={OPTIONS.height}
                      onChange={v => updateData(['face', 'forehead', 'height'], v)}
                    />
                    <SelectField
                      label="Anchura frente"
                      value={data.face.forehead.width}
                      options={OPTIONS.width}
                      onChange={v => updateData(['face', 'forehead', 'width'], v)}
                    />
                  </div>
                </div>

                {/* Wrinkles */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3">Arrugas</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <SelectField
                      label="Frente"
                      value={data.face.distinctive_marks.wrinkles.forehead}
                      options={OPTIONS.wrinkle_level}
                      onChange={v => updateData(['face', 'distinctive_marks', 'wrinkles', 'forehead'], v)}
                    />
                    <SelectField
                      label="Patas de gallo"
                      value={data.face.distinctive_marks.wrinkles.eyes_crows_feet}
                      options={OPTIONS.wrinkle_level}
                      onChange={v => updateData(['face', 'distinctive_marks', 'wrinkles', 'eyes_crows_feet'], v)}
                    />
                    <SelectField
                      label="Surcos nasogenianos"
                      value={data.face.distinctive_marks.wrinkles.nasolabial_folds}
                      options={OPTIONS.wrinkle_level}
                      onChange={v => updateData(['face', 'distinctive_marks', 'wrinkles', 'nasolabial_folds'], v)}
                    />
                  </div>
                  <div className="mt-3">
                    <TagList
                      label="Otras arrugas/líneas"
                      items={data.face.distinctive_marks.wrinkles.other}
                      onAdd={item => updateData(['face', 'distinctive_marks', 'wrinkles', 'other'], [...data.face.distinctive_marks.wrinkles.other, item])}
                      onRemove={i => updateData(['face', 'distinctive_marks', 'wrinkles', 'other'], data.face.distinctive_marks.wrinkles.other.filter((_, idx) => idx !== i))}
                      placeholder="Ej: líneas de expresión entre cejas..."
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Hair */}
        <Card>
          <Collapsible open={expandedSections.hair}>
            <SectionHeader
              id="hair"
              icon={Scissors}
              title="Cabello y Vello Facial"
              description="Longitud, textura, color, estilo y barba"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SelectField
                    label="Longitud"
                    value={data.hair.length}
                    options={OPTIONS.hair_length}
                    onChange={v => updateData(['hair', 'length'], v)}
                  />
                  <SelectField
                    label="Textura"
                    value={data.hair.texture}
                    options={OPTIONS.hair_texture}
                    onChange={v => updateData(['hair', 'texture'], v)}
                  />
                  <SelectField
                    label="Grosor"
                    value={data.hair.thickness}
                    options={OPTIONS.hair_thickness}
                    onChange={v => updateData(['hair', 'thickness'], v)}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Color base</Label>
                    <Input
                      value={data.hair.color.base}
                      onChange={e => updateData(['hair', 'color', 'base'], e.target.value)}
                      placeholder="Ej: castaño oscuro"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Color Hex</Label>
                    <div className="flex gap-2">
                      <Input
                        value={data.hair.color.color_hex}
                        onChange={e => updateData(['hair', 'color', 'color_hex'], e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                      <input
                        type="color"
                        value={data.hair.color.color_hex}
                        onChange={e => updateData(['hair', 'color', 'color_hex'], e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Estilo</Label>
                  <Textarea
                    value={data.hair.style}
                    onChange={e => updateData(['hair', 'style'], e.target.value)}
                    placeholder="Describe el estilo del cabello..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <TagList
                  label="Reflejos/mechas"
                  items={data.hair.color.highlights}
                  onAdd={item => updateData(['hair', 'color', 'highlights'], [...data.hair.color.highlights, item])}
                  onRemove={i => updateData(['hair', 'color', 'highlights'], data.hair.color.highlights.filter((_, idx) => idx !== i))}
                  placeholder="Ej: canas en sienes, mechas rubias..."
                />
                <TagList
                  label="Rasgos distintivos del cabello"
                  items={data.hair.distinctive_features}
                  onAdd={item => updateData(['hair', 'distinctive_features'], [...data.hair.distinctive_features, item])}
                  onRemove={i => updateData(['hair', 'distinctive_features'], data.hair.distinctive_features.filter((_, idx) => idx !== i))}
                  placeholder="Ej: entradas, remolino frontal..."
                />

                {/* Facial Hair */}
                <div className="border-t pt-4">
                  <h5 className="font-medium text-sm mb-3">Vello facial</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SelectField
                      label="Tipo"
                      value={data.hair.facial_hair.type}
                      options={OPTIONS.facial_hair_type}
                      onChange={v => updateData(['hair', 'facial_hair', 'type'], v)}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Longitud (mm)</Label>
                      <Input
                        type="number"
                        value={data.hair.facial_hair.length_mm}
                        onChange={e => updateData(['hair', 'facial_hair', 'length_mm'], parseInt(e.target.value) || 0)}
                        className="h-8"
                      />
                    </div>
                    <SelectField
                      label="Densidad"
                      value={data.hair.facial_hair.density}
                      options={OPTIONS.facial_hair_density}
                      onChange={v => updateData(['hair', 'facial_hair', 'density'], v)}
                    />
                    <SelectField
                      label="Cuidado"
                      value={data.hair.facial_hair.grooming}
                      options={OPTIONS.facial_hair_grooming}
                      onChange={v => updateData(['hair', 'facial_hair', 'grooming'], v)}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Color</Label>
                      <Input
                        value={data.hair.facial_hair.color}
                        onChange={e => updateData(['hair', 'facial_hair', 'color'], e.target.value)}
                        placeholder="Ej: castaño con canas"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <TagList
                      label="Rasgos distintivos vello facial"
                      items={data.hair.facial_hair.distinctive_features}
                      onAdd={item => updateData(['hair', 'facial_hair', 'distinctive_features'], [...data.hair.facial_hair.distinctive_features, item])}
                      onRemove={i => updateData(['hair', 'facial_hair', 'distinctive_features'], data.hair.facial_hair.distinctive_features.filter((_, idx) => idx !== i))}
                      placeholder="Ej: más canas en barba que cabello..."
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Skin */}
        <Card>
          <Collapsible open={expandedSections.skin}>
            <SectionHeader
              id="skin"
              icon={Palette}
              title="Piel"
              description="Textura, condición y exposición solar"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <SelectField
                    label="Textura"
                    value={data.skin.texture}
                    options={OPTIONS.skin_texture}
                    onChange={v => updateData(['skin', 'texture'], v)}
                  />
                  <SelectField
                    label="Condición"
                    value={data.skin.condition}
                    options={OPTIONS.skin_condition}
                    onChange={v => updateData(['skin', 'condition'], v)}
                  />
                  <SelectField
                    label="Exposición solar"
                    value={data.skin.sun_exposure}
                    options={OPTIONS.sun_exposure}
                    onChange={v => updateData(['skin', 'sun_exposure'], v)}
                  />
                </div>
                <TagList
                  label="Rasgos distintivos de piel"
                  items={data.skin.distinctive_features}
                  onAdd={item => updateData(['skin', 'distinctive_features'], [...data.skin.distinctive_features, item])}
                  onRemove={i => updateData(['skin', 'distinctive_features'], data.skin.distinctive_features.filter((_, idx) => idx !== i))}
                  placeholder="Ej: pecas en nariz, manchas de edad..."
                />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Hands */}
        <Card>
          <Collapsible open={expandedSections.hands}>
            <SectionHeader
              id="hands"
              icon={Hand}
              title="Manos"
              description="Crítico para IA - tamaño, dedos y uñas"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SelectField
                    label="Tamaño"
                    value={data.hands.size}
                    options={OPTIONS.hand_size}
                    onChange={v => updateData(['hands', 'size'], v)}
                  />
                  <SelectField
                    label="Dedos"
                    value={data.hands.fingers}
                    options={OPTIONS.fingers}
                    onChange={v => updateData(['hands', 'fingers'], v)}
                  />
                  <SelectField
                    label="Textura piel"
                    value={data.hands.skin_texture}
                    options={OPTIONS.hand_texture}
                    onChange={v => updateData(['hands', 'skin_texture'], v)}
                  />
                  <SelectField
                    label="Longitud uñas"
                    value={data.hands.nails.length}
                    options={OPTIONS.nail_length}
                    onChange={v => updateData(['hands', 'nails', 'length'], v)}
                  />
                  <SelectField
                    label="Condición uñas"
                    value={data.hands.nails.condition}
                    options={OPTIONS.nail_condition}
                    onChange={v => updateData(['hands', 'nails', 'condition'], v)}
                  />
                </div>
                <TagList
                  label="Rasgos distintivos de manos"
                  items={data.hands.distinctive_features}
                  onAdd={item => updateData(['hands', 'distinctive_features'], [...data.hands.distinctive_features, item])}
                  onRemove={i => updateData(['hands', 'distinctive_features'], data.hands.distinctive_features.filter((_, idx) => idx !== i))}
                  placeholder="Ej: venas prominentes, cicatriz en palma..."
                />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Voice */}
        <Card>
          <Collapsible open={expandedSections.voice}>
            <SectionHeader
              id="voice"
              icon={Mic}
              title="Voz"
              description="Tono, acento y patrones de habla"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <SelectField
                    label="Tono"
                    value={data.voice.pitch}
                    options={OPTIONS.voice_pitch}
                    onChange={v => updateData(['voice', 'pitch'], v)}
                  />
                  <SelectField
                    label="Timbre"
                    value={data.voice.tone}
                    options={OPTIONS.voice_tone}
                    onChange={v => updateData(['voice', 'tone'], v)}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Acento</Label>
                    <Input
                      value={data.voice.accent}
                      onChange={e => updateData(['voice', 'accent'], e.target.value)}
                      placeholder="Ej: español neutro, mexicano..."
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Patrón de habla</Label>
                  <Textarea
                    value={data.voice.speech_pattern}
                    onChange={e => updateData(['voice', 'speech_pattern'], e.target.value)}
                    placeholder="Describe cómo habla el personaje..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <TagList
                  label="Rasgos distintivos de voz"
                  items={data.voice.distinctive_features}
                  onAdd={item => updateData(['voice', 'distinctive_features'], [...data.voice.distinctive_features, item])}
                  onRemove={i => updateData(['voice', 'distinctive_features'], data.voice.distinctive_features.filter((_, idx) => idx !== i))}
                  placeholder="Ej: ligero ceceo, carraspea al mentir..."
                />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Movement */}
        <Card>
          <Collapsible open={expandedSections.movement}>
            <SectionHeader
              id="movement"
              icon={Move}
              title="Movimiento"
              description="Forma de caminar, postura y gestos"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Forma de caminar</Label>
                  <Textarea
                    value={data.movement.gait}
                    onChange={e => updateData(['movement', 'gait'], e.target.value)}
                    placeholder="Describe cómo camina el personaje..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Postura por defecto</Label>
                  <Textarea
                    value={data.movement.posture_default}
                    onChange={e => updateData(['movement', 'posture_default'], e.target.value)}
                    placeholder="Describe la postura habitual..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <TagList
                  label="Gestos característicos"
                  items={data.movement.gestures}
                  onAdd={item => updateData(['movement', 'gestures'], [...data.movement.gestures, item])}
                  onRemove={i => updateData(['movement', 'gestures'], data.movement.gestures.filter((_, idx) => idx !== i))}
                  placeholder="Ej: se toca las gafas al pensar..."
                />
                <TagList
                  label="Tics y hábitos"
                  items={data.movement.tics_habits}
                  onAdd={item => updateData(['movement', 'tics_habits'], [...data.movement.tics_habits, item])}
                  onRemove={i => updateData(['movement', 'tics_habits'], data.movement.tics_habits.filter((_, idx) => idx !== i))}
                  placeholder="Ej: parpadea rápido al mentir..."
                />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Visual References */}
        <Card>
          <Collapsible open={expandedSections.references}>
            <SectionHeader
              id="references"
              icon={Star}
              title="Referencias Visuales"
              description="Parecido con celebridades y estilo de arte"
            />
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3 p-3 border rounded-lg">
                    <Label className="text-sm font-medium">Parecido Principal</Label>
                    <Input
                      value={data.visual_references.celebrity_likeness.primary.name}
                      onChange={e => updateData(['visual_references', 'celebrity_likeness', 'primary', 'name'], e.target.value)}
                      placeholder="Nombre de celebridad..."
                      className="h-8 text-sm"
                    />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Porcentaje: {data.visual_references.celebrity_likeness.primary.percentage}%</Label>
                      <Slider
                        value={[data.visual_references.celebrity_likeness.primary.percentage]}
                        onValueChange={([v]) => updateData(['visual_references', 'celebrity_likeness', 'primary', 'percentage'], v)}
                        max={100}
                        step={5}
                      />
                    </div>
                  </div>
                  <div className="space-y-3 p-3 border rounded-lg">
                    <Label className="text-sm font-medium">Parecido Secundario</Label>
                    <Input
                      value={data.visual_references.celebrity_likeness.secondary.name}
                      onChange={e => updateData(['visual_references', 'celebrity_likeness', 'secondary', 'name'], e.target.value)}
                      placeholder="Nombre de celebridad..."
                      className="h-8 text-sm"
                    />
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Porcentaje: {data.visual_references.celebrity_likeness.secondary.percentage}%</Label>
                      <Slider
                        value={[data.visual_references.celebrity_likeness.secondary.percentage]}
                        onValueChange={([v]) => updateData(['visual_references', 'celebrity_likeness', 'secondary', 'percentage'], v)}
                        max={100}
                        step={5}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nota de combinación</Label>
                  <Textarea
                    value={data.visual_references.celebrity_likeness.combination_note}
                    onChange={e => updateData(['visual_references', 'celebrity_likeness', 'combination_note'], e.target.value)}
                    placeholder="Describe cómo combinar los parecidos..."
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <SelectField
                    label="Estilo de arte"
                    value={data.visual_references.art_style}
                    options={OPTIONS.art_style}
                    onChange={v => updateData(['visual_references', 'art_style'], v)}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Referencia de época</Label>
                    <Input
                      value={data.visual_references.era_reference}
                      onChange={e => updateData(['visual_references', 'era_reference'], e.target.value)}
                      placeholder="Ej: Contemporary 2025"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>
    </div>
  );
}

// ===== PROMPT GENERATOR =====
export function generateVisualPrompt(dna: CharacterVisualDNA, context: 'identity_closeup' | 'fullbody' | 'turnaround'): string {
  const p = dna.physical_identity;
  const f = dna.face;
  const h = dna.hair;
  const s = dna.skin;
  const vr = dna.visual_references;

  const sections: string[] = [];

  // Header based on context
  if (context === 'identity_closeup') {
    sections.push('Professional studio portrait photograph, shallow depth of field, 85mm lens at f/1.8.');
  } else if (context === 'turnaround') {
    sections.push('Professional character turnaround sheet, neutral grey background, even lighting, full body visible.');
  } else {
    sections.push('Professional full body photograph, studio lighting, clean background.');
  }

  // Subject
  sections.push(`
SUBJECT:
${p.gender_presentation.toUpperCase()} subject, age ${p.age_exact}, ${p.ethnicity.primary} ethnicity${p.ethnicity.secondary ? ` (${p.ethnicity.secondary})` : ''} with ${p.ethnicity.skin_tone} skin tone.
Height ${p.height_cm}cm, ${p.body_type.build} build, ${p.body_type.musculature} musculature, ${p.body_type.weight_appearance} weight, ${p.body_type.posture} posture.`.trim());

  // Face
  sections.push(`
FACE STRUCTURE:
${f.shape} face shape.
Eyes: ${f.eyes.shape} ${f.eyes.color} eyes (hex ${f.eyes.color_hex}), ${f.eyes.size} size, ${f.eyes.distance} set.${f.eyes.distinctive_features.length ? ' ' + f.eyes.distinctive_features.join(', ') + '.' : ''}
Eyebrows: ${f.eyebrows.thickness}, ${f.eyebrows.shape}, ${f.eyebrows.color}.
Nose: ${f.nose.bridge} bridge, ${f.nose.shape} shape, ${f.nose.width} width.${f.nose.distinctive_features.length ? ' ' + f.nose.distinctive_features.join(', ') + '.' : ''}
Mouth: ${f.mouth.lip_fullness} lips, ${f.mouth.lip_shape}, ${f.mouth.lip_color}.
Jaw/Chin: ${f.jaw_chin.jaw_shape} jaw, ${f.jaw_chin.chin} chin, ${f.jaw_chin.jawline_definition} definition.
Cheekbones: ${f.cheekbones.prominence}, ${f.cheekbones.shape}.
Forehead: ${f.forehead.height} height, ${f.forehead.width} width.`.trim());

  // Aging/wrinkles if present
  const wrinkles = f.distinctive_marks.wrinkles;
  if (wrinkles.forehead !== 'none' || wrinkles.eyes_crows_feet !== 'none' || wrinkles.nasolabial_folds !== 'none') {
    sections.push(`
AGING:
Forehead lines: ${wrinkles.forehead}. Crow's feet: ${wrinkles.eyes_crows_feet}. Nasolabial folds: ${wrinkles.nasolabial_folds}.${wrinkles.other.length ? ' ' + wrinkles.other.join(', ') + '.' : ''}`.trim());
  }

  // Hair
  sections.push(`
HAIR:
${h.length} ${h.texture} hair, ${h.thickness} thickness.
Color: ${h.color.base} (hex ${h.color.color_hex})${h.color.highlights.length ? ' with ' + h.color.highlights.join(', ') : ''}.
Style: ${h.style}.${h.distinctive_features.length ? ' ' + h.distinctive_features.join(', ') + '.' : ''}`.trim());

  // Facial hair if present
  if (h.facial_hair.type !== 'clean_shaven') {
    sections.push(`
FACIAL HAIR:
${h.facial_hair.type}, ${h.facial_hair.length_mm}mm, ${h.facial_hair.density} density, ${h.facial_hair.grooming}.
Color: ${h.facial_hair.color}.${h.facial_hair.distinctive_features.length ? ' ' + h.facial_hair.distinctive_features.join(', ') + '.' : ''}`.trim());
  }

  // Skin
  sections.push(`
SKIN:
${s.texture} texture, ${s.condition} condition, ${s.sun_exposure}.${s.distinctive_features.length ? ' ' + s.distinctive_features.join(', ') + '.' : ''}`.trim());

  // Celebrity likeness if provided
  if (vr.celebrity_likeness.primary.name) {
    sections.push(`
LIKENESS REFERENCE:
${vr.celebrity_likeness.primary.percentage}% ${vr.celebrity_likeness.primary.name}${vr.celebrity_likeness.secondary.name ? ` combined with ${vr.celebrity_likeness.secondary.percentage}% ${vr.celebrity_likeness.secondary.name}` : ''}.
${vr.celebrity_likeness.combination_note || ''}`.trim());
  }

  // Photography settings
  sections.push(`
PHOTOGRAPHY:
Neutral expression, direct eye contact.
Studio lighting: key light 45° camera right, fill light camera left at 1:3 ratio.
${vr.art_style} rendering style. ${vr.era_reference} aesthetic.`.trim());

  // Negative prompt
  sections.push(`
NEGATIVE PROMPT:
cartoon, anime, illustration, painting, CGI obvious, video game render, plastic skin, AI artifacts, uncanny valley, morphing features, asymmetric pupils, lazy eye, cross-eyed, blurred eyes, extra fingers, deformed hands, floating hair, inconsistent lighting, watermark, text overlay, logo.`.trim());

  return sections.join('\n\n');
}

export default CharacterVisualDNAEditor;
