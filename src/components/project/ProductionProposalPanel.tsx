/**
 * ProductionProposalPanel - Vista de propuesta de producción por escena
 * Permite ver y editar la propuesta de shots antes de aprobar
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Camera, Clock, Film, Edit2, Trash2, Plus, 
  ChevronDown, ChevronRight, AlertTriangle, 
  Check, Video, Lightbulb, Volume2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ProductionProposalPanelProps,
  ProposedShot,
  SHOT_TYPES,
  COVERAGE_TYPES,
  STORY_PURPOSES,
  CAMERA_MOVEMENTS,
  CAMERA_HEIGHTS,
} from '@/types/production';

export function ProductionProposalPanel({
  sceneId,
  sceneSlugline,
  sceneNo,
  episodeNo,
  proposal,
  onUpdateProposal,
  onRemoveShot,
  onAddShot,
}: ProductionProposalPanelProps) {
  const [expandedSetup, setExpandedSetup] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState(false);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);

  const { scene_setup, scene_analysis, shots, sequence_summary, production_warnings } = proposal;

  const handleShotChange = (shotId: string, field: keyof ProposedShot, value: any) => {
    const updatedShots = shots.map(shot => {
      if (shot.shot_id === shotId) {
        return { ...shot, [field]: value };
      }
      return shot;
    });
    onUpdateProposal({ ...proposal, shots: updatedShots });
  };

  const handleCameraVariationChange = (shotId: string, field: string, value: any) => {
    const updatedShots = shots.map(shot => {
      if (shot.shot_id === shotId) {
        return {
          ...shot,
          camera_variation: { ...shot.camera_variation, [field]: value }
        };
      }
      return shot;
    });
    onUpdateProposal({ ...proposal, shots: updatedShots });
  };

  const formatStoryPurpose = (purpose: string) => {
    return purpose.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-4">
      {/* Header con resumen */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">
            E{episodeNo} · S{sceneNo}
          </Badge>
          <span className="text-sm font-medium text-foreground">{sceneSlugline}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Film className="w-4 h-4" />
          <span>{sequence_summary.shot_count} shots</span>
          <span className="mx-1">·</span>
          <Clock className="w-4 h-4" />
          <span>{Math.floor(sequence_summary.total_duration_sec / 60)}m {sequence_summary.total_duration_sec % 60}s</span>
        </div>
      </div>

      {/* Warnings */}
      {production_warnings && production_warnings.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
          <div className="text-sm text-warning">
            {production_warnings.map((warning, i) => (
              <p key={i}>{warning}</p>
            ))}
          </div>
        </div>
      )}

      {/* Scene Setup - Collapsible */}
      <Collapsible open={expandedSetup} onOpenChange={setExpandedSetup}>
        <CollapsibleTrigger asChild>
          <Card className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" />
                  Scene Setup
                </CardTitle>
                {expandedSetup ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
            </CardHeader>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-1 border-t-0 rounded-t-none">
            <CardContent className="pt-4 grid grid-cols-3 gap-4 text-sm">
              {/* Camera Package */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Video className="w-3 h-3" /> Cámara
                </Label>
                <p className="font-medium">{scene_setup.camera_package.body}</p>
                <p className="text-muted-foreground">
                  {scene_setup.camera_package.codec} · {scene_setup.camera_package.fps}fps
                </p>
              </div>
              
              {/* Lens Set */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Camera className="w-3 h-3" /> Lentes
                </Label>
                <p className="font-medium">{scene_setup.lens_set.family}</p>
                <p className="text-muted-foreground">{scene_setup.lens_set.look}</p>
              </div>
              
              {/* Lighting */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Lightbulb className="w-3 h-3" /> Iluminación
                </Label>
                <p className="font-medium">{scene_setup.lighting_plan.key_style}</p>
                <p className="text-muted-foreground">{scene_setup.lighting_plan.color_temp_base_k}K</p>
              </div>

              {/* Audio Plan */}
              <div className="col-span-3 border-t pt-3 mt-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Volume2 className="w-3 h-3" /> Audio
                </Label>
                <p className="text-sm">{scene_setup.audio_plan.room_tone}</p>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Scene Analysis - Collapsible */}
      <Collapsible open={expandedAnalysis} onOpenChange={setExpandedAnalysis}>
        <CollapsibleTrigger asChild>
          <Card className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-warning" />
                  Análisis de Escena
                </CardTitle>
                {expandedAnalysis ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
            </CardHeader>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-1 border-t-0 rounded-t-none">
            <CardContent className="pt-4 space-y-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Arco Emocional</Label>
                <p>{scene_analysis.emotional_arc}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Estrategia Visual</Label>
                <p>{scene_analysis.visual_strategy}</p>
              </div>
              {scene_analysis.key_moments && scene_analysis.key_moments.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Momentos Clave</Label>
                  <ul className="list-disc list-inside">
                    {scene_analysis.key_moments.map((moment, i) => (
                      <li key={i}>{moment}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Shot List - Editable */}
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            Lista de Shots
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onAddShot}>
            <Plus className="w-3 h-3 mr-1" />
            Añadir Shot
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {shots.map((shot, index) => (
              <div
                key={shot.shot_id}
                className={cn(
                  "p-4 hover:bg-muted/30 transition-colors",
                  editingShotId === shot.shot_id && "bg-muted/50"
                )}
              >
                {editingShotId === shot.shot_id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Tipo de Plano</Label>
                        <Select
                          value={shot.shot_type}
                          onValueChange={(v) => handleShotChange(shot.shot_id, 'shot_type', v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SHOT_TYPES.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Cobertura</Label>
                        <Select
                          value={shot.coverage_type}
                          onValueChange={(v) => handleShotChange(shot.shot_id, 'coverage_type', v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COVERAGE_TYPES.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Movimiento</Label>
                        <Select
                          value={shot.camera_variation.movement}
                          onValueChange={(v) => handleCameraVariationChange(shot.shot_id, 'movement', v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CAMERA_MOVEMENTS.map(type => (
                              <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Duración (s)</Label>
                        <Input
                          type="number"
                          className="h-8"
                          value={shot.duration_estimate_sec}
                          onChange={(e) => handleShotChange(shot.shot_id, 'duration_estimate_sec', parseInt(e.target.value) || 3)}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Story Purpose</Label>
                        <Select
                          value={shot.story_purpose}
                          onValueChange={(v) => handleShotChange(shot.shot_id, 'story_purpose', v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STORY_PURPOSES.map(purpose => (
                              <SelectItem key={purpose} value={purpose}>
                                {formatStoryPurpose(purpose)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Altura de Cámara</Label>
                        <Select
                          value={shot.camera_variation.height}
                          onValueChange={(v) => handleCameraVariationChange(shot.shot_id, 'height', v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CAMERA_HEIGHTS.map(height => (
                              <SelectItem key={height} value={height}>{height}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingShotId(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setEditingShotId(null)}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {shot.shot_no}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={shot.hero ? 'default' : 'secondary'} className="text-xs">
                            {shot.shot_type}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {shot.coverage_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {shot.camera_variation.movement} · {shot.duration_estimate_sec}s
                          </span>
                        </div>
                        <p className="text-sm text-foreground">
                          {formatStoryPurpose(shot.story_purpose)}
                        </p>
                        {shot.blocking_min?.action && (
                          <p className="text-xs text-muted-foreground">
                            {shot.blocking_min.action}
                          </p>
                        )}
                        {shot.blocking_min?.dialogue && (
                          <p className="text-xs text-muted-foreground italic">
                            "{shot.blocking_min.dialogue}"
                          </p>
                        )}
                        {shot.ai_risks && shot.ai_risks.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3 text-warning" />
                            <span className="text-xs text-warning">
                              {shot.ai_risks.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingShotId(shot.shot_id)}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onRemoveShot(shot.shot_id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ProductionProposalPanel;
