import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Star, Users, UserCheck, UserMinus, Settings, 
  CheckCircle, Sparkles, Image, Camera, Smile, Shirt 
} from 'lucide-react';
import { ROLE_PRESETS, CharacterRoleType, RolePreset, estimateCost } from '@/lib/characterRolePresets';
import { cn } from '@/lib/utils';

interface CharacterRoleSelectorProps {
  selectedRole: CharacterRoleType | null;
  onSelectRole: (role: CharacterRoleType) => void;
  onCustomize?: () => void;
}

const ROLE_ICONS: Record<CharacterRoleType, typeof Star> = {
  lead: Star,
  supporting: Users,
  recurring: UserCheck,
  background: UserMinus,
  custom: Settings,
};

const ROLE_COLORS: Record<CharacterRoleType, string> = {
  lead: 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20',
  supporting: 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20',
  recurring: 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20',
  background: 'border-gray-500/50 bg-gray-500/10 hover:bg-gray-500/20',
  custom: 'border-primary/50 bg-primary/10 hover:bg-primary/20',
};

const ROLE_SELECTED_COLORS: Record<CharacterRoleType, string> = {
  lead: 'border-amber-500 ring-2 ring-amber-500/30',
  supporting: 'border-blue-500 ring-2 ring-blue-500/30',
  recurring: 'border-purple-500 ring-2 ring-purple-500/30',
  background: 'border-gray-500 ring-2 ring-gray-500/30',
  custom: 'border-primary ring-2 ring-primary/30',
};

export function CharacterRoleSelector({ 
  selectedRole, 
  onSelectRole,
  onCustomize 
}: CharacterRoleSelectorProps) {
  const roles: CharacterRoleType[] = ['lead', 'supporting', 'recurring', 'background', 'custom'];

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-4">
        Selecciona el rol del personaje para configurar automáticamente la cantidad de imágenes necesarias.
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((roleId) => {
          const preset = ROLE_PRESETS[roleId];
          const Icon = ROLE_ICONS[roleId];
          const isSelected = selectedRole === roleId;
          const costs = estimateCost(preset);

          return (
            <Card
              key={roleId}
              className={cn(
                'cursor-pointer transition-all border-2',
                ROLE_COLORS[roleId],
                isSelected && ROLE_SELECTED_COLORS[roleId]
              )}
              onClick={() => onSelectRole(roleId)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <CardTitle className="text-base">{preset.label}</CardTitle>
                  </div>
                  {isSelected && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
                <CardDescription className="text-xs">
                  {preset.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Slot breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{preset.slotConfig.closeups} closeups</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Image className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{preset.slotConfig.turnarounds} turnarounds</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{preset.slotConfig.expressions} expressions</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shirt className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{preset.slotConfig.outfits} outfits</span>
                  </div>
                </div>

                {/* Total & LoRA */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant="secondary" className="text-xs">
                    {preset.totalSlots} slots
                  </Badge>
                  <Badge 
                    variant={preset.loraRecommended ? 'default' : 'outline'}
                    className={cn(
                      'text-xs',
                      preset.loraRecommended && 'bg-green-500/20 text-green-600 border-green-500/30'
                    )}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    LoRA {preset.loraLabel}
                  </Badge>
                </div>

                {/* Use case */}
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Uso:</span> {preset.useCase}
                </div>

                {/* Cost estimate */}
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                  <div className="flex justify-between">
                    <span>Generación:</span>
                    <span>{costs.generation}</span>
                  </div>
                  {preset.loraRecommended && (
                    <div className="flex justify-between">
                      <span>LoRA Training:</span>
                      <span>{costs.lora}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedRole === 'custom' && onCustomize && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={onCustomize}>
            <Settings className="h-4 w-4 mr-2" />
            Personalizar configuración
          </Button>
        </div>
      )}
    </div>
  );
}
