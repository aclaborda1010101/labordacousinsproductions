/**
 * DensityProfileSelector - User-selectable complexity profiles
 * 
 * Allows users to choose between:
 * - Indie/Autor: 6 characters, 6 locations (character-driven cinema)
 * - Standard: 10 characters, 10 locations (medium production)
 * - Hollywood: 15+ characters, 15+ locations (large production)
 */

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, MapPin, Film, Sparkles, Crown } from 'lucide-react';

export type DensityProfileId = 'indie' | 'standard' | 'hollywood';

export interface DensityProfile {
  id: DensityProfileId;
  label: string;
  description: string;
  icon: React.ReactNode;
  minCharacters: number;
  minLocations: number;
  minBeats: number;
  minScenes: number;
  minSetpieces: number;
  minSequences: number;
  badge?: string;
}

export const DENSITY_PROFILES: Record<DensityProfileId, DensityProfile> = {
  indie: {
    id: 'indie',
    label: 'Indie / Autor',
    description: 'Cine de autor con enfoque en personajes profundos y localizaciones íntimas',
    icon: <Film className="h-4 w-4" />,
    minCharacters: 6,
    minLocations: 6,
    minBeats: 18,
    minScenes: 25,
    minSetpieces: 5,
    minSequences: 4,
  },
  standard: {
    id: 'standard',
    label: 'Estándar',
    description: 'Producción media con buen equilibrio entre profundidad y variedad visual',
    icon: <Sparkles className="h-4 w-4" />,
    minCharacters: 10,
    minLocations: 10,
    minBeats: 24,
    minScenes: 35,
    minSetpieces: 8,
    minSequences: 6,
    badge: 'Recomendado',
  },
  hollywood: {
    id: 'hollywood',
    label: 'Hollywood',
    description: 'Gran producción con elenco extenso, múltiples localizaciones y alta densidad narrativa',
    icon: <Crown className="h-4 w-4" />,
    minCharacters: 15,
    minLocations: 15,
    minBeats: 30,
    minScenes: 45,
    minSetpieces: 12,
    minSequences: 8,
  },
};

interface DensityProfileSelectorProps {
  value: DensityProfileId;
  onChange: (value: DensityProfileId) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function DensityProfileSelector({ 
  value, 
  onChange, 
  disabled = false,
  compact = false 
}: DensityProfileSelectorProps) {
  const selectedProfile = DENSITY_PROFILES[value];

  if (compact) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Perfil de Complejidad</Label>
        <RadioGroup 
          value={value} 
          onValueChange={(v) => onChange(v as DensityProfileId)}
          disabled={disabled}
          className="flex gap-2"
        >
          {Object.values(DENSITY_PROFILES).map((profile) => (
            <div key={profile.id} className="flex items-center">
              <RadioGroupItem 
                value={profile.id} 
                id={`density-${profile.id}`} 
                className="sr-only" 
              />
              <Label
                htmlFor={`density-${profile.id}`}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer
                  transition-colors text-sm
                  ${value === profile.id 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-muted hover:border-primary/50'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {profile.icon}
                <span>{profile.label}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {selectedProfile.minCharacters} personajes · {selectedProfile.minLocations} localizaciones
        </p>
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Perfil de Complejidad
        </CardTitle>
        <CardDescription>
          Elige el nivel de densidad narrativa para tu proyecto
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup 
          value={value} 
          onValueChange={(v) => onChange(v as DensityProfileId)}
          disabled={disabled}
          className="space-y-3"
        >
          {Object.values(DENSITY_PROFILES).map((profile) => (
            <div
              key={profile.id}
              className={`
                relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer
                transition-all
                ${value === profile.id 
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                  : 'border-muted hover:border-primary/30 hover:bg-muted/30'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              onClick={() => !disabled && onChange(profile.id)}
            >
              <RadioGroupItem 
                value={profile.id} 
                id={`density-full-${profile.id}`}
                className="mt-0.5"
              />
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  {profile.icon}
                  <Label 
                    htmlFor={`density-full-${profile.id}`}
                    className="font-medium cursor-pointer"
                  >
                    {profile.label}
                  </Label>
                  {profile.badge && (
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {profile.badge}
                    </Badge>
                  )}
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {profile.description}
                </p>
                
                <div className="flex gap-4 text-xs mt-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {profile.minCharacters} personajes
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {profile.minLocations} localizaciones
                  </span>
                </div>
              </div>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

export default DensityProfileSelector;
