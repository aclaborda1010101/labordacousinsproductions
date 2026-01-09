/**
 * ProductionReviewModal - Modal de revisión completa de producción
 * Muestra todas las propuestas de producción antes de aprobar e insertar shots
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Film, Clock, Check, X, Clapperboard, AlertTriangle } from 'lucide-react';
import { ProductionReviewModalProps, ProductionProposal, ProposedShot } from '@/types/production';
import { ProductionProposalPanel } from './ProductionProposalPanel';

export function ProductionReviewModal({
  open,
  onOpenChange,
  proposals,
  scenes,
  onUpdateProposal,
  onApprove,
  isApproving,
}: ProductionReviewModalProps) {
  const [expandedScenes, setExpandedScenes] = useState<string[]>([]);

  // Calculate totals
  const totalShots = Array.from(proposals.values()).reduce(
    (acc, p) => acc + p.shots.length,
    0
  );
  const totalDuration = Array.from(proposals.values()).reduce(
    (acc, p) => acc + p.sequence_summary.total_duration_sec,
    0
  );
  const totalKeyframes = Array.from(proposals.values()).reduce(
    (acc, p) => acc + p.sequence_summary.keyframes_required,
    0
  );
  const totalWarnings = Array.from(proposals.values()).reduce(
    (acc, p) => acc + (p.production_warnings?.length || 0),
    0
  );

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const handleRemoveShot = (sceneId: string, shotId: string) => {
    const proposal = proposals.get(sceneId);
    if (!proposal) return;
    
    const updatedShots = proposal.shots.filter(s => s.shot_id !== shotId);
    // Renumber shots
    const renumberedShots = updatedShots.map((shot, i) => ({
      ...shot,
      shot_no: i + 1,
      shot_id: `S${String(i + 1).padStart(2, '0')}`
    }));
    
    onUpdateProposal(sceneId, {
      ...proposal,
      shots: renumberedShots,
      sequence_summary: {
        ...proposal.sequence_summary,
        shot_count: renumberedShots.length,
        total_duration_sec: renumberedShots.reduce((acc, s) => acc + s.duration_estimate_sec, 0),
      }
    });
  };

  const handleAddShot = (sceneId: string) => {
    const proposal = proposals.get(sceneId);
    if (!proposal) return;
    
    const newShotNo = proposal.shots.length + 1;
    const newShot: ProposedShot = {
      shot_id: `S${String(newShotNo).padStart(2, '0')}`,
      shot_no: newShotNo,
      shot_type: 'Medium',
      coverage_type: 'Single',
      story_purpose: 'dialogue_focus',
      effective_mode: proposal.sequence_summary.estimated_cost_tier,
      hero: false,
      camera_variation: {
        focal_mm: 50,
        aperture: 'T2.8',
        movement: 'Static',
        height: 'EyeLevel',
        stabilization: 'Tripod',
      },
      blocking_min: {
        subject_positions: '',
        screen_direction: '',
        axis_180_compliant: true,
        action: 'Nuevo shot - editar acción',
        dialogue: null,
      },
      duration_estimate_sec: 4,
      ai_risks: [],
    };
    
    onUpdateProposal(sceneId, {
      ...proposal,
      shots: [...proposal.shots, newShot],
      sequence_summary: {
        ...proposal.sequence_summary,
        shot_count: proposal.shots.length + 1,
        total_duration_sec: proposal.sequence_summary.total_duration_sec + newShot.duration_estimate_sec,
      }
    });
  };

  // Get scenes ordered by episode and scene number
  const orderedScenes = [...scenes].sort((a, b) => {
    if (a.episode_no !== b.episode_no) return a.episode_no - b.episode_no;
    return a.scene_no - b.scene_no;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-primary" />
            Revisión de Producción
          </DialogTitle>
          <DialogDescription>
            Revisa y edita la propuesta de producción antes de aprobar. Los shots se insertarán solo después de tu aprobación.
          </DialogDescription>
        </DialogHeader>

        {/* Summary Bar */}
        <div className="flex items-center justify-between py-3 px-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-bold">{totalShots}</span> shots
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-bold">{formatDuration(totalDuration)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-bold">{proposals.size}</span> escenas
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                ~{totalKeyframes} keyframes
              </span>
            </div>
          </div>
          {totalWarnings > 0 && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {totalWarnings} advertencias
            </Badge>
          )}
        </div>

        {/* Scene Proposals */}
        <ScrollArea className="flex-1 min-h-0 pr-4">
          <Accordion
            type="multiple"
            value={expandedScenes}
            onValueChange={setExpandedScenes}
            className="space-y-2"
          >
            {orderedScenes.map(scene => {
              const proposal = proposals.get(scene.id);
              if (!proposal) return null;
              
              return (
                <AccordionItem
                  key={scene.id}
                  value={scene.id}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          E{scene.episode_no} · S{scene.scene_no}
                        </Badge>
                        <span className="font-medium text-sm truncate max-w-[300px]">
                          {scene.slugline}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Film className="w-3.5 h-3.5" />
                        {proposal.shots.length}
                        <span className="mx-1">·</span>
                        <Clock className="w-3.5 h-3.5" />
                        {formatDuration(proposal.sequence_summary.total_duration_sec)}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <ProductionProposalPanel
                      sceneId={scene.id}
                      sceneSlugline={scene.slugline}
                      sceneNo={scene.scene_no}
                      episodeNo={scene.episode_no}
                      proposal={proposal}
                      onUpdateProposal={(p) => onUpdateProposal(scene.id, p)}
                      onRemoveShot={(shotId) => handleRemoveShot(scene.id, shotId)}
                      onAddShot={() => handleAddShot(scene.id)}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApproving}
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button
            variant="gold"
            onClick={onApprove}
            disabled={isApproving || proposals.size === 0}
          >
            {isApproving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Insertando shots...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Aprobar e Insertar {totalShots} Shots
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProductionReviewModal;
