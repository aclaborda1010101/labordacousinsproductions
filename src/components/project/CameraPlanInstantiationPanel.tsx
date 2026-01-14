import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Plus, 
  Loader2, 
  CheckCircle2, 
  Camera,
  Clock,
  ArrowRight
} from 'lucide-react';

interface CameraPlanShot {
  shot_no: number;
  shot_type_hint: string;
  shot_label: string;
  blocking_ref?: string;
  framing_hint?: string;
  panel_ref?: string;
  notes?: string;
}

interface CameraPlanInstantiationPanelProps {
  sceneId: string;
  cameraPlanShots: CameraPlanShot[];
  existingShotCount: number;
  qualityMode: 'CINE' | 'ULTRA';
  onShotsCreated: () => void;
}

// Map Camera Plan shot type hints to DB shot types
function mapShotTypeHint(hint: string): string {
  const map: Record<string, string> = {
    'PG': 'Wide',
    'PM': 'Medium',
    'PMC': 'MediumClose',
    'PP': 'CloseUp',
    'PPP': 'ExtremeCloseUp',
    'OTS': 'OverShoulder',
    'INSERT': 'Insert',
    '2SHOT': 'TwoShot',
    'TRACK': 'Tracking',
    'CRANE': 'Crane',
    'DUTCH': 'Dutch',
    'POV': 'POV',
    'ESTABLISHING': 'Wide',
    'MASTER': 'Wide',
    'CU': 'CloseUp',
    'ECU': 'ExtremeCloseUp',
    'MCU': 'MediumClose',
    'MLS': 'MediumLong',
    'LS': 'Long',
    'ELS': 'ExtremeLong',
    'WS': 'Wide',
    'MS': 'Medium',
  };
  const upper = hint?.toUpperCase() || '';
  return map[upper] || hint || 'Medium';
}

// Extract story purpose from notes
function extractPurpose(notes?: string): string {
  if (!notes) return '';
  // First sentence or up to 100 chars
  const firstSentence = notes.split(/[.!?]/)[0];
  return firstSentence?.substring(0, 100) || '';
}

export default function CameraPlanInstantiationPanel({
  sceneId,
  cameraPlanShots,
  existingShotCount,
  qualityMode,
  onShotsCreated
}: CameraPlanInstantiationPanelProps) {
  const [creating, setCreating] = useState(false);

  const instantiateShots = async () => {
    if (cameraPlanShots.length === 0) {
      toast.error('No hay shots definidos en el Camera Plan');
      return;
    }

    setCreating(true);
    try {
      // Build shots from Camera Plan data
      const shotsToInsert = cameraPlanShots.map((cp, idx) => ({
        scene_id: sceneId,
        shot_no: cp.shot_no || idx + 1,
        shot_type: mapShotTypeHint(cp.shot_type_hint),
        duration_target: 3, // Default duration, can be overridden from technical doc later
        effective_mode: qualityMode,
        camera: {
          movement: cp.framing_hint || 'static',
        },
        blocking: {
          action: cp.shot_label,
          ref: cp.blocking_ref,
          notes: cp.notes,
        },
        coverage_type: cp.shot_type_hint,
        story_purpose: extractPurpose(cp.notes),
        continuity_notes: cp.notes || null,
        // Mark as inherited from Camera Plan
        inherit_technical: true,
        technical_shot_idx: idx,
      }));

      const { error } = await supabase.from('shots').insert(shotsToInsert);
      
      if (error) throw error;

      toast.success(`${shotsToInsert.length} shots creados desde Camera Plan`);
      onShotsCreated();
    } catch (error) {
      console.error('Error creating shots from Camera Plan:', error);
      toast.error('Error al crear shots');
    } finally {
      setCreating(false);
    }
  };

  const alreadyHasShots = existingShotCount > 0;

  return (
    <div className="space-y-4 p-4 bg-green-500/5 rounded-lg border border-green-500/20">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <span className="font-medium">Camera Plan Aprobado</span>
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
          {cameraPlanShots.length} planos
        </Badge>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Los shots se crearán exactamente como están definidos en el Camera Plan.
        <span className="block text-xs mt-1 opacity-70">
          Sin interpretación creativa — instanciación directa 1:1.
        </span>
      </p>

      {/* Preview of shots to create */}
      <ScrollArea className="h-48">
        <div className="space-y-2 pr-4">
          {cameraPlanShots.map((shot, idx) => (
            <div 
              key={shot.shot_no || idx} 
              className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/50"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-mono text-primary font-bold">
                  {shot.shot_no || idx + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    <Camera className="w-3 h-3 mr-1" />
                    {shot.shot_type_hint}
                  </Badge>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs capitalize">
                    {mapShotTypeHint(shot.shot_type_hint)}
                  </Badge>
                  {shot.blocking_ref && (
                    <Badge variant="outline" className="text-xs opacity-70">
                      {shot.blocking_ref}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground line-clamp-2">
                  {shot.shot_label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Button 
        onClick={instantiateShots}
        disabled={creating || alreadyHasShots}
        className="w-full"
        variant={alreadyHasShots ? "outline" : "gold"}
      >
        {creating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Plus className="w-4 h-4 mr-2" />
        )}
        Crear {cameraPlanShots.length} Shots desde Camera Plan
      </Button>

      {alreadyHasShots && (
        <p className="text-xs text-amber-600 text-center">
          Ya existen {existingShotCount} shots. Elimínalos primero para reinstanciar desde Camera Plan.
        </p>
      )}
    </div>
  );
}
