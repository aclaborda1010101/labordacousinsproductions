import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, Upload, Sparkles, CheckCircle2, XCircle, AlertTriangle, 
  User, Camera, Shirt, Palette, RefreshCw, Lock, Play
} from 'lucide-react';

// Role-based slot requirements
const ROLE_REQUIREMENTS = {
  protagonist: {
    turnaround: { count: 4, views: ['front', 'side-left', 'back', 'side-right'] },
    expression: { count: 8, names: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'contempt'] },
    closeup: { count: 2 },
    outfit: { count: 5, viewsPerOutfit: 2 },
  },
  recurring: {
    turnaround: { count: 3, views: ['front', '3/4-left', 'back'] },
    expression: { count: 5, names: ['neutral', 'happy', 'sad', 'angry', 'surprised'] },
    closeup: { count: 1 },
    outfit: { count: 3, viewsPerOutfit: 2 },
  },
  episodic: {
    turnaround: { count: 2, views: ['front', '3/4'] },
    expression: { count: 3, names: ['neutral', 'happy', 'angry'] },
    closeup: { count: 1 },
    outfit: { count: 2, viewsPerOutfit: 1 },
  },
  extra: {
    base_look: { count: 1 },
  },
};

interface PackSlot {
  id: string;
  slot_type: string;
  slot_index: number;
  view_angle: string | null;
  expression_name: string | null;
  outfit_id: string | null;
  image_url: string | null;
  status: string;
  qc_score: number | null;
  qc_issues: string[];
  fix_notes: string | null;
  required: boolean;
}

interface CharacterPackBuilderProps {
  characterId: string;
  characterName: string;
  characterBio: string;
  characterRole: 'protagonist' | 'recurring' | 'episodic' | 'extra';
  styleToken?: string;
  onPackComplete?: () => void;
}

export function CharacterPackBuilder({
  characterId,
  characterName,
  characterBio,
  characterRole,
  styleToken,
  onPackComplete,
}: CharacterPackBuilderProps) {
  const [slots, setSlots] = useState<PackSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, phase: '' });
  const [completenessScore, setCompletenessScore] = useState(0);

  // Fetch or initialize slots
  const fetchSlots = useCallback(async () => {
    const { data, error } = await supabase
      .from('character_pack_slots')
      .select('*')
      .eq('character_id', characterId)
      .order('slot_type')
      .order('slot_index');

    if (error) {
      console.error('Error fetching slots:', error);
      return;
    }

    if (data && data.length > 0) {
      setSlots(data as PackSlot[]);
      calculateCompleteness(data as PackSlot[]);
    } else {
      await initializeSlots();
    }
    setLoading(false);
  }, [characterId]);

  // Initialize slots based on role
  const initializeSlots = async () => {
    const requirements = ROLE_REQUIREMENTS[characterRole];
    if (!requirements) return;

    const newSlots: Omit<PackSlot, 'id'>[] = [];

    // Closeups first (identity anchors)
    if ('closeup' in requirements) {
      for (let i = 0; i < requirements.closeup.count; i++) {
        newSlots.push({
          slot_type: 'closeup',
          slot_index: i,
          view_angle: null,
          expression_name: null,
          outfit_id: null,
          image_url: null,
          status: 'empty',
          qc_score: null,
          qc_issues: [],
          fix_notes: null,
          required: true,
        });
      }
    }

    // Turnarounds (identity anchors)
    if ('turnaround' in requirements) {
      requirements.turnaround.views.forEach((view, i) => {
        newSlots.push({
          slot_type: 'turnaround',
          slot_index: i,
          view_angle: view,
          expression_name: null,
          outfit_id: null,
          image_url: null,
          status: 'empty',
          qc_score: null,
          qc_issues: [],
          fix_notes: null,
          required: true,
        });
      });
    }

    // Expressions
    if ('expression' in requirements) {
      requirements.expression.names.forEach((name, i) => {
        newSlots.push({
          slot_type: 'expression',
          slot_index: i,
          view_angle: null,
          expression_name: name,
          outfit_id: null,
          image_url: null,
          status: 'empty',
          qc_score: null,
          qc_issues: [],
          fix_notes: null,
          required: true,
        });
      });
    }

    // Outfits (will be linked later)
    if ('outfit' in requirements) {
      for (let i = 0; i < requirements.outfit.count; i++) {
        const viewsPerOutfit = requirements.outfit.viewsPerOutfit;
        const views = viewsPerOutfit === 2 ? ['front', '3/4'] : ['3/4'];
        views.forEach((view, vi) => {
          newSlots.push({
            slot_type: 'outfit',
            slot_index: i * viewsPerOutfit + vi,
            view_angle: view,
            expression_name: null,
            outfit_id: null,
            image_url: null,
            status: 'empty',
            qc_score: null,
            qc_issues: [],
            fix_notes: null,
            required: true,
          });
        });
      }
    }

    // Base look for extras
    if ('base_look' in requirements) {
      newSlots.push({
        slot_type: 'base_look',
        slot_index: 0,
        view_angle: '3/4',
        expression_name: null,
        outfit_id: null,
        image_url: null,
        status: 'empty',
        qc_score: null,
        qc_issues: [],
        fix_notes: null,
        required: true,
      });
    }

    // Insert all slots
    const { data, error } = await supabase
      .from('character_pack_slots')
      .insert(newSlots.map(s => ({ ...s, character_id: characterId })))
      .select();

    if (error) {
      console.error('Error creating slots:', error);
      toast.error('Error al crear slots del pack');
      return;
    }

    setSlots(data as PackSlot[]);
  };

  const calculateCompleteness = (slotData: PackSlot[]) => {
    const required = slotData.filter(s => s.required);
    const approved = required.filter(s => s.status === 'approved' || s.status === 'waiver');
    const score = required.length > 0 ? Math.round((approved.length / required.length) * 100) : 0;
    setCompletenessScore(score);
  };

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Check if identity anchors are complete
  const anchorsComplete = () => {
    const anchors = slots.filter(s => s.slot_type === 'closeup' || s.slot_type === 'turnaround');
    return anchors.length > 0 && anchors.every(s => s.status === 'approved' || s.status === 'waiver');
  };

  // Generate single slot
  const generateSlot = async (slot: PackSlot) => {
    // Block outfit generation if anchors not complete
    if (slot.slot_type === 'outfit' && !anchorsComplete()) {
      toast.error('Completa primero los Identity Anchors (close-ups y turnarounds)');
      return;
    }

    setGenerating(slot.id);

    try {
      const response = await supabase.functions.invoke('generate-character', {
        body: {
          slotId: slot.id,
          characterId,
          characterName,
          characterBio,
          slotType: slot.slot_type,
          viewAngle: slot.view_angle,
          expressionName: slot.expression_name,
          outfitDescription: slot.outfit_id ? 'default outfit' : undefined,
          styleToken,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      if (result.success) {
        if (result.qc.passed) {
          toast.success(`${slot.slot_type} generado y aprobado`);
        } else {
          toast.warning(`${slot.slot_type} generado pero QC falló - revisa las Fix Notes`);
        }
        await fetchSlots();
      } else {
        toast.error(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Generate error:', error);
      toast.error('Error al generar imagen');
    } finally {
      setGenerating(null);
    }
  };

  // Batch generate entire pack
  const generateFullPack = async () => {
    const emptySlots = slots.filter(s => s.status === 'empty' || s.status === 'failed');
    if (emptySlots.length === 0) {
      toast.info('Todos los slots ya están completos');
      return;
    }

    setBatchGenerating(true);
    
    // Phase 1: Identity Anchors (closeups + turnarounds)
    const anchors = emptySlots.filter(s => s.slot_type === 'closeup' || s.slot_type === 'turnaround');
    setBatchProgress({ current: 0, total: emptySlots.length, phase: 'Identity Anchors' });

    for (let i = 0; i < anchors.length; i++) {
      const slot = anchors[i];
      setBatchProgress({ current: i + 1, total: emptySlots.length, phase: 'Identity Anchors' });
      
      try {
        const response = await supabase.functions.invoke('generate-character', {
          body: {
            slotId: slot.id,
            characterId,
            characterName,
            characterBio,
            slotType: slot.slot_type,
            viewAngle: slot.view_angle,
            styleToken,
          },
        });

        if (!response.data?.qc?.passed) {
          toast.error(`QC falló en ${slot.slot_type} - deteniendo batch para no quemar presupuesto`);
          await fetchSlots();
          setBatchGenerating(false);
          return;
        }
      } catch (e) {
        toast.error(`Error en anchor - deteniendo batch`);
        await fetchSlots();
        setBatchGenerating(false);
        return;
      }
    }

    // Phase 2: Expressions
    const expressions = emptySlots.filter(s => s.slot_type === 'expression');
    setBatchProgress({ current: anchors.length, total: emptySlots.length, phase: 'Expresiones' });

    for (let i = 0; i < expressions.length; i++) {
      const slot = expressions[i];
      setBatchProgress({ current: anchors.length + i + 1, total: emptySlots.length, phase: 'Expresiones' });
      
      try {
        const response = await supabase.functions.invoke('generate-character', {
          body: {
            slotId: slot.id,
            characterId,
            characterName,
            characterBio,
            slotType: slot.slot_type,
            expressionName: slot.expression_name,
            styleToken,
          },
        });

        if (!response.data?.qc?.passed) {
          toast.warning(`QC falló en expresión "${slot.expression_name}" - continuando con siguiente`);
        }
      } catch (e) {
        console.error('Expression error:', e);
      }
    }

    // Phase 3: Outfits
    const outfits = emptySlots.filter(s => s.slot_type === 'outfit');
    setBatchProgress({ current: anchors.length + expressions.length, total: emptySlots.length, phase: 'Outfits' });

    for (let i = 0; i < outfits.length; i++) {
      const slot = outfits[i];
      setBatchProgress({ current: anchors.length + expressions.length + i + 1, total: emptySlots.length, phase: 'Outfits' });
      
      try {
        await supabase.functions.invoke('generate-character', {
          body: {
            slotId: slot.id,
            characterId,
            characterName,
            characterBio,
            slotType: slot.slot_type,
            viewAngle: slot.view_angle,
            styleToken,
          },
        });
      } catch (e) {
        console.error('Outfit error:', e);
      }
    }

    await fetchSlots();
    setBatchGenerating(false);
    toast.success('Pack completo generado');
    
    if (onPackComplete) {
      onPackComplete();
    }
  };

  // Grant waiver for failed slot
  const grantWaiver = async (slotId: string) => {
    await supabase.from('character_pack_slots').update({ status: 'waiver' }).eq('id', slotId);
    await fetchSlots();
    toast.info('Waiver concedido');
  };

  // Get icon for slot type
  const getSlotIcon = (type: string) => {
    switch (type) {
      case 'turnaround': return <Camera className="w-4 h-4" />;
      case 'expression': return <Palette className="w-4 h-4" />;
      case 'closeup': return <User className="w-4 h-4" />;
      case 'outfit': return <Shirt className="w-4 h-4" />;
      case 'base_look': return <User className="w-4 h-4" />;
      default: return null;
    }
  };

  // Get status badge
  const getStatusBadge = (status: string, qcScore: number | null) => {
    switch (status) {
      case 'empty':
        return <Badge variant="outline">Vacío</Badge>;
      case 'generating':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generando</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />{qcScore}%</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />QC Failed</Badge>;
      case 'waiver':
        return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />Waiver</Badge>;
      default:
        return null;
    }
  };

  // Group slots by type
  const groupedSlots = slots.reduce((acc, slot) => {
    if (!acc[slot.slot_type]) acc[slot.slot_type] = [];
    acc[slot.slot_type].push(slot);
    return acc;
  }, {} as Record<string, PackSlot[]>);

  const slotTypeLabels: Record<string, string> = {
    closeup: 'Identity Close-ups',
    turnaround: 'Turnarounds',
    expression: 'Expresiones',
    outfit: 'Outfits',
    base_look: 'Base Look',
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Character Pack Builder
            </CardTitle>
            <CardDescription>
              {characterName} - {characterRole.charAt(0).toUpperCase() + characterRole.slice(1)}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{completenessScore}%</div>
            <div className="text-xs text-muted-foreground">Pack Completeness</div>
            {completenessScore >= 90 && (
              <Badge variant="default" className="mt-1 bg-green-600">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Ready for Scenes
              </Badge>
            )}
          </div>
        </div>
        <Progress value={completenessScore} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Batch Generate Button */}
        <Button
          variant="gold"
          className="w-full"
          onClick={generateFullPack}
          disabled={batchGenerating || generating !== null}
        >
          {batchGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {batchProgress.phase} ({batchProgress.current}/{batchProgress.total})
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Generar Pack Completo
            </>
          )}
        </Button>

        {batchGenerating && (
          <Progress 
            value={(batchProgress.current / batchProgress.total) * 100} 
            className="h-2" 
          />
        )}

        {/* Identity Anchors Warning */}
        {!anchorsComplete() && characterRole !== 'extra' && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600">Identity Anchors requeridos</p>
              <p className="text-muted-foreground">
                Completa los close-ups y turnarounds antes de generar outfits.
              </p>
            </div>
          </div>
        )}

        {/* Slot Groups */}
        {Object.entries(groupedSlots).map(([type, typeSlots]) => (
          <div key={type} className="space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              {getSlotIcon(type)}
              {slotTypeLabels[type] || type}
              <span className="text-muted-foreground text-sm">
                ({typeSlots.filter(s => s.status === 'approved' || s.status === 'waiver').length}/{typeSlots.length})
              </span>
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {typeSlots.map((slot) => (
                <div 
                  key={slot.id}
                  className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all
                    ${slot.status === 'approved' ? 'border-green-500/50' : ''}
                    ${slot.status === 'failed' ? 'border-destructive/50' : ''}
                    ${slot.status === 'empty' ? 'border-dashed border-muted-foreground/30' : ''}
                  `}
                >
                  {slot.image_url ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <img 
                          src={slot.image_url} 
                          alt={`${slot.slot_type} ${slot.slot_index}`}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            {slot.slot_type} {slot.view_angle || slot.expression_name || ''}
                          </DialogTitle>
                        </DialogHeader>
                        <img src={slot.image_url} alt="" className="w-full rounded-lg" />
                        {slot.fix_notes && (
                          <div className="p-3 bg-destructive/10 rounded-lg text-sm">
                            <p className="font-medium text-destructive">Fix Notes:</p>
                            <p>{slot.fix_notes}</p>
                          </div>
                        )}
                        {slot.status === 'failed' && (
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              className="flex-1"
                              onClick={() => generateSlot(slot)}
                              disabled={generating !== null}
                            >
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Regenerar
                            </Button>
                            <Button 
                              variant="secondary"
                              onClick={() => grantWaiver(slot.id)}
                            >
                              <AlertTriangle className="w-4 h-4 mr-2" />
                              Waiver
                            </Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted/30">
                      {generating === slot.id ? (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground text-center px-2">
                            {slot.view_angle || slot.expression_name || 'Slot'}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => generateSlot(slot)}
                              disabled={generating !== null || batchGenerating || (slot.slot_type === 'outfit' && !anchorsComplete())}
                            >
                              <Sparkles className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              disabled={generating !== null || batchGenerating}
                            >
                              <Upload className="w-3 h-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  
                  {/* Status badge overlay */}
                  <div className="absolute top-1 right-1">
                    {getStatusBadge(slot.status, slot.qc_score)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Pack Completeness Calculation Info */}
        <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-2">
          <h4 className="font-medium">Pack Completeness Score</h4>
          <p className="text-muted-foreground">
            Score = (Slots Approved + Waivers) / Total Required Slots × 100
          </p>
          <p className="text-muted-foreground">
            Se requiere ≥90% para usar este personaje en escenas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}