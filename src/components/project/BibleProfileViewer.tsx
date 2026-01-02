import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  BookOpen, 
  ChevronDown, 
  ChevronRight, 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  Image as ImageIcon,
  Palette,
  Layers,
  Shield
} from 'lucide-react';

interface BibleProfile {
  profile?: {
    description?: string;
    age_range?: string;
    skin_tone?: string;
    eye_color?: string;
    hair?: string;
    build?: string;
    distinctive_features?: string[];
    architecture_style?: string;
    lighting_logic?: string;
    atmosphere?: string;
    materials?: string[];
    color_palette?: string[];
    dimensions?: string;
    texture?: string;
  };
  continuity_lock?: {
    never_change?: string[];
    allowed_variants?: string[];
    must_avoid?: string[];
  };
  generation_plan?: {
    required_slots?: Array<{
      slot: string;
      prompt_hint?: string;
    }>;
    seed_strategy?: string;
  };
  risk_controls?: {
    ai_artifacts_to_avoid?: string[];
    consistency_anchors?: string[];
  };
}

interface BibleProfileViewerProps {
  profile: BibleProfile | null;
  entityType: 'character' | 'location' | 'prop';
  compact?: boolean;
}

export default function BibleProfileViewer({ 
  profile, 
  entityType, 
  compact = false 
}: BibleProfileViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
        <BookOpen className="w-4 h-4" />
        <span>Sin perfil Bible generado</span>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const profileData = profile.profile;
  const continuityLock = profile.continuity_lock;
  const generationPlan = profile.generation_plan;
  const riskControls = profile.risk_controls;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
          <BookOpen className="w-3 h-3 mr-1" />
          Bible
        </Badge>
        {continuityLock?.never_change?.length && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            <Lock className="w-3 h-3 mr-1" />
            {continuityLock.never_change.length} locks
          </Badge>
        )}
        {riskControls?.ai_artifacts_to_avoid?.length && (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {riskControls.ai_artifacts_to_avoid.length} risks
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <BookOpen className="w-4 h-4 text-primary" />
        <span>Perfil Bible Completo</span>
        <Badge variant="outline" className="ml-auto bg-green-500/10 text-green-600 border-green-500/30">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Generado
        </Badge>
      </div>

      {/* Profile Section */}
      {profileData && (
        <Collapsible 
          open={expandedSections.has('profile')}
          onOpenChange={() => toggleSection('profile')}
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
            {expandedSections.has('profile') ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Palette className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Perfil Visual</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="ml-6 mt-2 space-y-2">
            {profileData.description && (
              <p className="text-sm text-muted-foreground">{profileData.description}</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {entityType === 'character' && (
                <>
                  {profileData.age_range && (
                    <div><span className="text-muted-foreground">Edad:</span> {profileData.age_range}</div>
                  )}
                  {profileData.skin_tone && (
                    <div><span className="text-muted-foreground">Piel:</span> {profileData.skin_tone}</div>
                  )}
                  {profileData.eye_color && (
                    <div><span className="text-muted-foreground">Ojos:</span> {profileData.eye_color}</div>
                  )}
                  {profileData.hair && (
                    <div><span className="text-muted-foreground">Cabello:</span> {profileData.hair}</div>
                  )}
                  {profileData.build && (
                    <div><span className="text-muted-foreground">Complexión:</span> {profileData.build}</div>
                  )}
                </>
              )}
              {entityType === 'location' && (
                <>
                  {profileData.architecture_style && (
                    <div><span className="text-muted-foreground">Estilo:</span> {profileData.architecture_style}</div>
                  )}
                  {profileData.lighting_logic && (
                    <div><span className="text-muted-foreground">Iluminación:</span> {profileData.lighting_logic}</div>
                  )}
                  {profileData.atmosphere && (
                    <div><span className="text-muted-foreground">Atmósfera:</span> {profileData.atmosphere}</div>
                  )}
                </>
              )}
              {entityType === 'prop' && (
                <>
                  {profileData.dimensions && (
                    <div><span className="text-muted-foreground">Dimensiones:</span> {profileData.dimensions}</div>
                  )}
                  {profileData.texture && (
                    <div><span className="text-muted-foreground">Textura:</span> {profileData.texture}</div>
                  )}
                </>
              )}
            </div>
            {profileData.distinctive_features && profileData.distinctive_features.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {profileData.distinctive_features.map((feature, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            )}
            {profileData.materials && profileData.materials.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {profileData.materials.map((material, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {material}
                  </Badge>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Continuity Lock Section */}
      {continuityLock && (
        <Collapsible 
          open={expandedSections.has('continuity')}
          onOpenChange={() => toggleSection('continuity')}
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
            {expandedSections.has('continuity') ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Lock className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium">Continuity Lock</span>
            <Badge variant="outline" className="ml-auto text-xs">
              {(continuityLock.never_change?.length || 0) + (continuityLock.must_avoid?.length || 0)} reglas
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="ml-6 mt-2 space-y-3">
            {continuityLock.never_change && continuityLock.never_change.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-amber-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Nunca cambiar:
                </div>
                <div className="flex flex-wrap gap-1">
                  {continuityLock.never_change.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {continuityLock.allowed_variants && continuityLock.allowed_variants.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Variantes permitidas:
                </div>
                <div className="flex flex-wrap gap-1">
                  {continuityLock.allowed_variants.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {continuityLock.must_avoid && continuityLock.must_avoid.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Evitar siempre:
                </div>
                <div className="flex flex-wrap gap-1">
                  {continuityLock.must_avoid.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-red-500/10 text-red-700 border-red-500/30">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Generation Plan Section */}
      {generationPlan && generationPlan.required_slots && generationPlan.required_slots.length > 0 && (
        <Collapsible 
          open={expandedSections.has('generation')}
          onOpenChange={() => toggleSection('generation')}
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
            {expandedSections.has('generation') ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Layers className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">Plan de Generación</span>
            <Badge variant="outline" className="ml-auto text-xs">
              {generationPlan.required_slots.length} slots
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="ml-6 mt-2 space-y-2">
            <div className="grid gap-2">
              {generationPlan.required_slots.map((slot, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
                  <ImageIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{slot.slot}</div>
                    {slot.prompt_hint && (
                      <div className="text-xs text-muted-foreground truncate">{slot.prompt_hint}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Risk Controls Section */}
      {riskControls && (
        <Collapsible 
          open={expandedSections.has('risks')}
          onOpenChange={() => toggleSection('risks')}
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
            {expandedSections.has('risks') ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Shield className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium">Control de Riesgos</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="ml-6 mt-2 space-y-3">
            {riskControls.ai_artifacts_to_avoid && riskControls.ai_artifacts_to_avoid.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-red-600">Artefactos IA a evitar:</div>
                <div className="flex flex-wrap gap-1">
                  {riskControls.ai_artifacts_to_avoid.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-red-500/10 text-red-700 border-red-500/30">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {riskControls.consistency_anchors && riskControls.consistency_anchors.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-blue-600">Anclas de consistencia:</div>
                <div className="flex flex-wrap gap-1">
                  {riskControls.consistency_anchors.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-500/30">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
