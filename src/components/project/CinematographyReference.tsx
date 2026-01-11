import { useState } from 'react';
import { 
  Camera, 
  Move, 
  Layers, 
  Film, 
  ChevronDown, 
  ChevronRight,
  Search,
  Info,
  Clapperboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CAMERA_MOVEMENT_LIBRARY, type CameraMovement } from '@/lib/cameraMovementLibrary';
import { TRANSITION_LIBRARY, type CinematicTransition } from '@/lib/transitionLibrary';
import { COMPOSITION_LIBRARY, type CompositionRule } from '@/lib/shotCompositionLibrary';
import { MOTION_TEMPLATES, type MotionTemplate } from '@/lib/motionTemplates';

interface CinematographyReferenceProps {
  onSelectMovement?: (movement: CameraMovement) => void;
  onSelectTransition?: (transition: CinematicTransition) => void;
  onSelectComposition?: (composition: CompositionRule) => void;
  onSelectMotion?: (motion: MotionTemplate) => void;
  compact?: boolean;
}

// Convert Records to arrays
const CAMERA_MOVEMENTS = Object.values(CAMERA_MOVEMENT_LIBRARY);
const CINEMATIC_TRANSITIONS = Object.values(TRANSITION_LIBRARY);
const COMPOSITION_RULES = Object.values(COMPOSITION_LIBRARY);
const MOTION_TEMPLATE_LIST = Object.values(MOTION_TEMPLATES);

type CategoryKey = string;

export function CinematographyReference({
  onSelectMovement,
  onSelectTransition,
  onSelectComposition,
  onSelectMotion,
  compact = false
}: CinematographyReferenceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Group camera movements by category
  const movementsByCategory = CAMERA_MOVEMENTS.reduce((acc, movement) => {
    if (!acc[movement.category]) acc[movement.category] = [];
    acc[movement.category].push(movement);
    return acc;
  }, {} as Record<CategoryKey, CameraMovement[]>);

  // Group transitions by category
  const transitionsByCategory = CINEMATIC_TRANSITIONS.reduce((acc, transition) => {
    if (!acc[transition.category]) acc[transition.category] = [];
    acc[transition.category].push(transition);
    return acc;
  }, {} as Record<CategoryKey, CinematicTransition[]>);

  // Group compositions by category
  const compositionsByCategory = COMPOSITION_RULES.reduce((acc, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {} as Record<CategoryKey, CompositionRule[]>);

  // Group motion templates by category
  const motionsByCategory = MOTION_TEMPLATE_LIST.reduce((acc, motion) => {
    if (!acc[motion.category]) acc[motion.category] = [];
    acc[motion.category].push(motion);
    return acc;
  }, {} as Record<CategoryKey, MotionTemplate[]>);

  // Filter function
  const filterItems = <T extends { name: string; description: string }>(items: T[]): T[] => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(query) || 
      item.description.toLowerCase().includes(query)
    );
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      static: '📷',
      pan_tilt: '↔️',
      dolly_track: '🎥',
      crane_jib: '🏗️',
      handheld: '✋',
      steadicam_gimbal: '🎬',
      aerial: '🚁',
      specialty: '✨',
      cut: '✂️',
      optical: '🔮',
      camera: '📹',
      creative: '🎨',
      framing: '🖼️',
      depth: '🔍',
      balance: '⚖️',
      leading: '➡️',
      color: '🎨',
      special: '⭐',
      dialogue: '💬',
      action: '💥',
      emotional: '❤️',
      transition: '🔄',
      ambient: '🌅'
    };
    return icons[category] || '📌';
  };

  const getRiskBadgeColor = (risks: string[]) => {
    // Determine risk level based on number/content of risks
    const riskCount = risks.length;
    if (riskCount === 0) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (riskCount <= 1) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const getRiskLabel = (risks: string[]) => {
    const riskCount = risks.length;
    if (riskCount === 0) return 'low';
    if (riskCount <= 1) return 'medium';
    return 'high';
  };

  const renderMovementItem = (movement: CameraMovement) => (
    <div 
      key={movement.id}
      className="p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-all group"
      onClick={() => onSelectMovement?.(movement)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{movement.name}</span>
            <Badge variant="outline" className={`text-[10px] ${getRiskBadgeColor(movement.aiRisks)}`}>
              {getRiskLabel(movement.aiRisks)} risk
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {movement.description}
          </p>
          {movement.equipment.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {movement.equipment.slice(0, 2).map(eq => (
                <Badge key={eq} variant="secondary" className="text-[10px]">
                  {eq}
                </Badge>
              ))}
              {movement.equipment.length > 2 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{movement.equipment.length - 2}
                </Badge>
              )}
            </div>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                <Info className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="font-medium mb-1">Emotional Effect</p>
              <p className="text-xs text-muted-foreground">{movement.emotionalEffect}</p>
              {movement.famousExamples.length > 0 && (
                <>
                  <p className="font-medium mt-2 mb-1">Famous Examples</p>
                  <p className="text-xs text-muted-foreground">{movement.famousExamples.join(', ')}</p>
                </>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );

  const renderTransitionItem = (transition: CinematicTransition) => (
    <div 
      key={transition.id}
      className="p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-all group"
      onClick={() => onSelectTransition?.(transition)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{transition.name}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {transition.description}
          </p>
          <p className="text-[10px] text-primary/70 mt-1 italic">
            "{transition.useCase}"
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                <Info className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="font-medium mb-1">Keyframe Requirements</p>
              <p className="text-xs text-muted-foreground">
                <strong>End Frame A:</strong> {transition.keyframeRequirements.endFrameA}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <strong>Start Frame B:</strong> {transition.keyframeRequirements.startFrameB}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );

  const renderCompositionItem = (rule: CompositionRule) => (
    <div 
      key={rule.id}
      className="p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-all group"
      onClick={() => onSelectComposition?.(rule)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{rule.name}</span>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {rule.description}
          </p>
          <p className="text-[10px] text-primary/70 mt-1">
            Effect: {rule.visualEffect}
          </p>
          {rule.exampleFilms.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {rule.exampleFilms.slice(0, 2).map(film => (
                <Badge key={film} variant="outline" className="text-[10px]">
                  {film}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderMotionItem = (motion: MotionTemplate) => (
    <div 
      key={motion.id}
      className="p-3 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-all group"
      onClick={() => onSelectMotion?.(motion)}
    >
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm">{motion.name}</span>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {motion.description}
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          <Badge variant="secondary" className="text-[10px]">
            {motion.camera.movement.split(',')[0]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {motion.camera.speed}
          </Badge>
        </div>
      </div>
    </div>
  );

  const renderCategorySection = <T extends { name: string; description: string }>(
    categoryId: string,
    categoryName: string,
    items: T[],
    renderItem: (item: T) => React.ReactNode
  ) => {
    const filteredItems = filterItems(items);
    if (filteredItems.length === 0) return null;

    return (
      <Collapsible
        key={categoryId}
        open={expandedCategories.has(categoryId)}
        onOpenChange={() => toggleCategory(categoryId)}
      >
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between px-2 py-1.5 h-auto hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <span>{getCategoryIcon(categoryId)}</span>
              <span className="font-medium text-sm capitalize">
                {categoryName.replace(/_/g, ' ')}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {filteredItems.length}
              </Badge>
            </div>
            {expandedCategories.has(categoryId) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pl-2 pt-2">
          {filteredItems.map((item, index) => (
            <div key={index}>{renderItem(item)}</div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className={`flex flex-col ${compact ? 'h-80' : 'h-full'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border/50">
        <Clapperboard className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Cinematography Reference</h3>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search movements, transitions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="movements" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent h-auto p-0">
          <TabsTrigger 
            value="movements" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
          >
            <Camera className="h-4 w-4 mr-1.5" />
            <span className="text-xs">Movements</span>
            <Badge variant="secondary" className="ml-1.5 text-[10px]">
              {CAMERA_MOVEMENTS.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="transitions"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
          >
            <Film className="h-4 w-4 mr-1.5" />
            <span className="text-xs">Transitions</span>
            <Badge variant="secondary" className="ml-1.5 text-[10px]">
              {CINEMATIC_TRANSITIONS.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="composition"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
          >
            <Layers className="h-4 w-4 mr-1.5" />
            <span className="text-xs">Composition</span>
            <Badge variant="secondary" className="ml-1.5 text-[10px]">
              {COMPOSITION_RULES.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="motion"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
          >
            <Move className="h-4 w-4 mr-1.5" />
            <span className="text-xs">Motion</span>
            <Badge variant="secondary" className="ml-1.5 text-[10px]">
              {MOTION_TEMPLATE_LIST.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="movements" className="m-0 p-3 space-y-2">
            {Object.entries(movementsByCategory).map(([category, movements]) =>
              renderCategorySection(category, category, movements, renderMovementItem)
            )}
          </TabsContent>

          <TabsContent value="transitions" className="m-0 p-3 space-y-2">
            {Object.entries(transitionsByCategory).map(([category, transitions]) =>
              renderCategorySection(category, category, transitions, renderTransitionItem)
            )}
          </TabsContent>

          <TabsContent value="composition" className="m-0 p-3 space-y-2">
            {Object.entries(compositionsByCategory).map(([category, rules]) =>
              renderCategorySection(category, category, rules, renderCompositionItem)
            )}
          </TabsContent>

          <TabsContent value="motion" className="m-0 p-3 space-y-2">
            {Object.entries(motionsByCategory).map(([category, motions]) =>
              renderCategorySection(category, category, motions, renderMotionItem)
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Stats Footer */}
      <div className="p-2 border-t border-border/50 bg-muted/30">
        <div className="flex justify-center gap-4 text-[10px] text-muted-foreground">
          <span>{CAMERA_MOVEMENTS.length} movements</span>
          <span>•</span>
          <span>{CINEMATIC_TRANSITIONS.length} transitions</span>
          <span>•</span>
          <span>{COMPOSITION_RULES.length} compositions</span>
          <span>•</span>
          <span>{MOTION_TEMPLATE_LIST.length} templates</span>
        </div>
      </div>
    </div>
  );
}

export default CinematographyReference;
