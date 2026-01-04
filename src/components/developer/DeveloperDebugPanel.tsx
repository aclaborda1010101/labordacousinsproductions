import React, { useState } from 'react';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Copy,
  RefreshCw,
  AlertTriangle,
  Code,
} from 'lucide-react';
import { toast } from 'sonner';

export interface DebugPanelData {
  prompt?: string;
  negativePrompt?: string;
  engine?: string;
  preset?: string;
  seed?: number | string;
  consistencyKey?: string;
  contextJson?: Record<string, unknown>;
  rawResponse?: unknown;
}

interface DeveloperDebugPanelProps {
  data: DebugPanelData;
  onPromptChange?: (prompt: string) => void;
  onNegativePromptChange?: (negativePrompt: string) => void;
  onEngineChange?: (engine: string) => void;
  onPresetChange?: (preset: string) => void;
  onSeedChange?: (seed: string) => void;
  onForceRegenerate?: () => void;
  onBypassWarnings?: () => void;
  availableEngines?: { id: string; label: string }[];
  availablePresets?: { id: string; label: string }[];
  showEngineSelector?: boolean;
  showPresetSelector?: boolean;
  showSeed?: boolean;
  title?: string;
}

export function DeveloperDebugPanel({
  data,
  onPromptChange,
  onNegativePromptChange,
  onEngineChange,
  onPresetChange,
  onSeedChange,
  onForceRegenerate,
  onBypassWarnings,
  availableEngines = [],
  availablePresets = [],
  showEngineSelector = true,
  showPresetSelector = true,
  showSeed = true,
  title = 'Debug / Advanced',
}: DeveloperDebugPanelProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const [isOpen, setIsOpen] = useState(false);

  if (!isDeveloperMode) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20"
        >
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-amber-500" />
            <span className="text-amber-500 font-medium">{title}</span>
            <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">
              DEV
            </Badge>
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-amber-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-amber-500" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4 p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
        {/* Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Prompt Final</Label>
            {data.prompt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(data.prompt || '', 'Prompt')}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copiar
              </Button>
            )}
          </div>
          <Textarea
            value={data.prompt || ''}
            onChange={(e) => onPromptChange?.(e.target.value)}
            placeholder="Prompt final..."
            className="min-h-[100px] font-mono text-xs"
            readOnly={!onPromptChange}
          />
        </div>

        {/* Negative Prompt */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Negative Prompt</Label>
          <Textarea
            value={data.negativePrompt || ''}
            onChange={(e) => onNegativePromptChange?.(e.target.value)}
            placeholder="Negative prompt..."
            className="min-h-[60px] font-mono text-xs"
            readOnly={!onNegativePromptChange}
          />
        </div>

        {/* Engine & Preset Row */}
        <div className="grid grid-cols-2 gap-4">
          {showEngineSelector && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Engine</Label>
              {availableEngines.length > 0 && onEngineChange ? (
                <Select value={data.engine || ''} onValueChange={onEngineChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar engine" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEngines.map((eng) => (
                      <SelectItem key={eng.id} value={eng.id}>
                        {eng.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={data.engine || 'N/A'} readOnly className="font-mono text-xs" />
              )}
            </div>
          )}

          {showPresetSelector && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preset</Label>
              {availablePresets.length > 0 && onPresetChange ? (
                <Select value={data.preset || ''} onValueChange={onPresetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePresets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={data.preset || 'N/A'} readOnly className="font-mono text-xs" />
              )}
            </div>
          )}
        </div>

        {/* Seed */}
        {showSeed && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Seed / Consistency Key</Label>
            <div className="grid grid-cols-2 gap-4">
              <Input
                value={data.seed?.toString() || ''}
                onChange={(e) => onSeedChange?.(e.target.value)}
                placeholder="Seed"
                className="font-mono text-xs"
                readOnly={!onSeedChange}
              />
              <Input
                value={data.consistencyKey || ''}
                placeholder="Consistency Key"
                className="font-mono text-xs"
                readOnly
              />
            </div>
          </div>
        )}

        {/* Context JSON */}
        {data.contextJson && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Contexto JSON</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyToClipboard(JSON.stringify(data.contextJson, null, 2), 'JSON Debug')
                }
              >
                <Code className="h-3 w-3 mr-1" />
                Copiar JSON
              </Button>
            </div>
            <pre className="p-3 bg-muted/50 rounded-lg overflow-auto max-h-[200px] text-xs font-mono">
              {JSON.stringify(data.contextJson, null, 2)}
            </pre>
          </div>
        )}

        {/* Raw Response */}
        {data.rawResponse && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Respuesta Cruda (Raw)</Label>
            <pre className="p-3 bg-muted/50 rounded-lg overflow-auto max-h-[200px] text-xs font-mono">
              {typeof data.rawResponse === 'string'
                ? data.rawResponse
                : JSON.stringify(data.rawResponse, null, 2)}
            </pre>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-500/20">
          {onForceRegenerate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onForceRegenerate}
              className="border-amber-500/50"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Force Regenerate
            </Button>
          )}
          {onBypassWarnings && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBypassWarnings}
              className="border-orange-500/50 text-orange-500"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Bypass Warnings
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
