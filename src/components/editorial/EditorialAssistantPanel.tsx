import React, { useEffect } from 'react';
import { Lightbulb, X, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  useEditorialAssistant 
} from '@/hooks/useEditorialAssistant';
import { AssetType, EditorialSuggestion } from '@/lib/editorialAssistant';

interface EditorialAssistantPanelProps {
  projectId: string;
  assetType: AssetType;
  currentRunId?: string;
  phase: 'exploration' | 'production';
  presetId?: string;
  onApplyPromptPatch?: (patch: string) => void;
  onSwitchPreset?: (presetId: string) => void;
  onSetPhase?: (phase: 'exploration' | 'production') => void;
  onOpenCanonModal?: () => void;
  onReorderPresets?: (recommendedPresetId: string) => void;
}

export function EditorialAssistantPanel({
  projectId,
  assetType,
  currentRunId,
  phase,
  presetId,
  onApplyPromptPatch,
  onSwitchPreset,
  onSetPhase,
  onOpenCanonModal,
  onReorderPresets
}: EditorialAssistantPanelProps) {
  const {
    suggestions,
    loading,
    logEvent,
    dismissSuggestion
  } = useEditorialAssistant({
    projectId,
    assetType,
    currentRunId,
    phase,
    presetId,
    enabled: true
  });

  // Log when suggestions are shown
  useEffect(() => {
    if (suggestions.length > 0) {
      suggestions.forEach(s => {
        logEvent('suggestion_shown', s.id, { title: s.title });
      });
    }
  }, [suggestions, logEvent]);

  const handleApply = async (suggestion: EditorialSuggestion) => {
    await logEvent('suggestion_applied', suggestion.id, suggestion.actionPayload);

    switch (suggestion.actionType) {
      case 'apply_prompt_patch':
        if (onApplyPromptPatch && suggestion.actionPayload?.patch) {
          onApplyPromptPatch(suggestion.actionPayload.patch as string);
        }
        break;
      case 'switch_preset':
        if (onSwitchPreset && suggestion.actionPayload?.presetId) {
          onSwitchPreset(suggestion.actionPayload.presetId as string);
        }
        break;
      case 'set_phase':
        if (onSetPhase && suggestion.actionPayload?.phase) {
          onSetPhase(suggestion.actionPayload.phase as 'exploration' | 'production');
        }
        break;
      case 'open_canon_modal':
        if (onOpenCanonModal) {
          onOpenCanonModal();
        }
        break;
      case 'reorder_presets':
        if (onReorderPresets && suggestion.actionPayload?.presetId) {
          onReorderPresets(suggestion.actionPayload.presetId as string);
        }
        break;
    }

    dismissSuggestion(suggestion.id);
  };

  const handleDismiss = async (suggestion: EditorialSuggestion) => {
    await logEvent('suggestion_dismissed', suggestion.id);
    dismissSuggestion(suggestion.id);
  };

  if (loading || suggestions.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-primary/5 mt-4">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Asistente Editorial</span>
          <Badge variant="secondary" className="text-xs">
            {suggestions.length} {suggestions.length === 1 ? 'sugerencia' : 'sugerencias'}
          </Badge>
        </div>

        <div className="space-y-3">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onApply={() => handleApply(suggestion)}
              onDismiss={() => handleDismiss(suggestion)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface SuggestionCardProps {
  suggestion: EditorialSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}

function SuggestionCard({ suggestion, onApply, onDismiss }: SuggestionCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{suggestion.title}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {suggestion.message}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={onApply}
        >
          <Check className="h-3 w-3 mr-1" />
          {suggestion.actionLabel}
        </Button>
      </div>
    </div>
  );
}

export default EditorialAssistantPanel;
