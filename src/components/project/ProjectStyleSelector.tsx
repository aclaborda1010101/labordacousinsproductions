/**
 * ProjectStyleSelector - High-level selectors for format, animation type, and visual style
 * Shows only in project settings or as initial setup
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  FormatProfile,
  AnimationType,
  VisualStyle,
  UserLevel,
  FORMAT_PROFILES,
  ANIMATION_STYLES,
  USER_LEVEL_CONFIG,
} from '@/lib/editorialKnowledgeBase';
import { Film, Palette, Layers, User } from 'lucide-react';

interface ProjectStyleSelectorProps {
  formatProfile: FormatProfile;
  animationType: AnimationType;
  visualStyle: VisualStyle;
  userLevel: UserLevel;
  onFormatChange: (value: FormatProfile) => void;
  onAnimationTypeChange: (value: AnimationType) => void;
  onVisualStyleChange: (value: VisualStyle) => void;
  onUserLevelChange: (value: UserLevel) => void;
  compact?: boolean;
  disabled?: boolean;
}

const formatOptions: { value: FormatProfile; label: string; icon: string }[] = [
  { value: 'short', label: 'Cortometraje', icon: '🎬' },
  { value: 'series', label: 'Serie', icon: '📺' },
  { value: 'trailer', label: 'Trailer', icon: '🎞️' },
  { value: 'teaser', label: 'Teaser', icon: '👁️' },
  { value: 'cinematic', label: 'Cinemática', icon: '🎥' },
];

const animationOptions: { value: AnimationType; label: string; icon: string }[] = [
  { value: '2D', label: '2D', icon: '✏️' },
  { value: '3D', label: '3D', icon: '🎲' },
  { value: 'mixed', label: 'Mixta', icon: '🔀' },
];

const styleOptions: { value: VisualStyle; label: string; icon: string; color: string }[] = [
  { value: 'pixar', label: 'Pixar', icon: '🏠', color: 'bg-blue-500' },
  { value: 'ghibli', label: 'Studio Ghibli', icon: '🍃', color: 'bg-green-500' },
  { value: 'anime', label: 'Anime / Manga', icon: '⚡', color: 'bg-pink-500' },
  { value: 'cartoon', label: 'Cartoon Clásico', icon: '🎨', color: 'bg-yellow-500' },
  { value: 'sports_epic', label: 'Deportivo Épico', icon: '⚽', color: 'bg-orange-500' },
  { value: 'realistic', label: 'Realista', icon: '📷', color: 'bg-gray-500' },
];

const userLevelOptions: { value: UserLevel; label: string; icon: string; description: string }[] = [
  { value: 'explorer', label: 'Explorador', icon: '🧭', description: 'El sistema decide todo' },
  { value: 'creator', label: 'Creador', icon: '✨', description: 'Recomendaciones visibles' },
  { value: 'pro', label: 'Profesional', icon: '🎬', description: 'Control total' },
];

export function ProjectStyleSelector({
  formatProfile,
  animationType,
  visualStyle,
  userLevel,
  onFormatChange,
  onAnimationTypeChange,
  onVisualStyleChange,
  onUserLevelChange,
  compact = false,
  disabled = false,
}: ProjectStyleSelectorProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 items-center">
        {/* Format badge */}
        <Badge variant="outline" className="gap-1">
          <Film className="h-3 w-3" />
          {formatOptions.find(f => f.value === formatProfile)?.label}
        </Badge>
        
        {/* Animation type badge */}
        <Badge variant="outline" className="gap-1">
          <Layers className="h-3 w-3" />
          {animationType}
        </Badge>
        
        {/* Visual style badge */}
        <Badge variant="outline" className="gap-1">
          <Palette className="h-3 w-3" />
          {styleOptions.find(s => s.value === visualStyle)?.label}
        </Badge>

        {/* User level badge */}
        <Badge variant="secondary" className="gap-1">
          <User className="h-3 w-3" />
          {USER_LEVEL_CONFIG[userLevel].icon} {USER_LEVEL_CONFIG[userLevel].label}
        </Badge>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Configuración Visual del Proyecto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Format Profile */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Film className="h-4 w-4" />
              Tipo de Obra
            </Label>
            <Select
              value={formatProfile}
              onValueChange={(v) => onFormatChange(v as FormatProfile)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formatOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ritmo: {FORMAT_PROFILES[formatProfile].rhythm} | 
              Plano medio: {FORMAT_PROFILES[formatProfile].avgShotDurationSec}s
            </p>
          </div>

          {/* Animation Type */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Tipo de Animación
            </Label>
            <Select
              value={animationType}
              onValueChange={(v) => onAnimationTypeChange(v as AnimationType)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {animationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Visual Style */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Estilo Visual
            </Label>
            <Select
              value={visualStyle}
              onValueChange={(v) => onVisualStyleChange(v as VisualStyle)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {styleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ANIMATION_STYLES[visualStyle].typicalComposition} | 
              {ANIMATION_STYLES[visualStyle].lighting}
            </p>
          </div>

          {/* User Level */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Nivel de Complejidad
            </Label>
            <Select
              value={userLevel}
              onValueChange={(v) => onUserLevelChange(v as UserLevel)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userLevelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                      <span className="text-muted-foreground text-xs">
                        - {option.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
