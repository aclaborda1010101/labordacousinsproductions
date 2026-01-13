import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Camera, 
  Wand2, 
  Check, 
  RefreshCw, 
  GripVertical,
  FileText,
  MapPin,
  Clock,
  Users,
  ChevronUp,
  ChevronDown,
  Edit2,
  Save,
  X,
  Target,
  Move
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CameraPlanTabProps {
  sceneId: string;
  projectId: string;
  sceneSlugline?: string;
  onApproved?: () => void;
}

interface CameraPlanShot {
  shot_no: number;
  panel_ref: string;
  shot_label: string;
  shot_type_hint: string;
  framing_hint?: string;
  blocking_ref?: string;
  notes?: string;
}

interface BlockingDiagram {
  blocking_id: string;
  type: string;
  frame_shape: string;
  entities: Array<{ kind: string; id: string; label: string; pos: { x: number; y: number } }>;
  camera_marks: Array<{ cam_id: string; shot_no: number; pos: { x: number; y: number }; aim: { x: number; y: number } }>;
  movement_arrows: Array<{ type: string; id?: string; from: { x: number; y: number }; to: { x: number; y: number } }>;
}

interface CameraPlan {
  id: string;
  version: number;
  status: string;
  plan_header: {
    sec_code?: string;
    location_code?: string;
    set_code?: string;
    time_context?: string;
    scene_logline?: string;
  };
  shots_list: CameraPlanShot[];
  blocking_diagrams: BlockingDiagram[];
}

const SHOT_TYPES = ['PG', 'PM', 'PMC', 'PP', 'PPP', 'INSERT', 'OTS', 'POV', '2SHOT', 'TOP_DOWN', 'LOW_ANGLE', 'HIGH_ANGLE'];
const FRAMING_HINTS = ['frontal', 'lateral', '3/4', 'profile', 'top', 'low_angle', 'high_angle', 'dutch', 'escorzo'];

export function CameraPlanTab({
  sceneId,
  projectId,
  sceneSlugline,
  onApproved,
}: CameraPlanTabProps) {
  const [cameraPlan, setCameraPlan] = useState<CameraPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingShot, setEditingShot] = useState<number | null>(null);
  const [editedShots, setEditedShots] = useState<CameraPlanShot[]>([]);

  useEffect(() => {
    fetchCameraPlan();
  }, [sceneId]);

  const fetchCameraPlan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scene_camera_plan')
        .select('*')
        .eq('scene_id', sceneId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setCameraPlan({
          id: data.id,
          version: data.version,
          status: data.status,
          plan_header: data.plan_header as unknown as CameraPlan['plan_header'],
          shots_list: data.shots_list as unknown as CameraPlanShot[],
          blocking_diagrams: data.blocking_diagrams as unknown as BlockingDiagram[],
        });
        setEditedShots(data.shots_list as unknown as CameraPlanShot[]);
      }
    } catch (err) {
      console.error('Error fetching camera plan:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateCameraPlan = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-camera-plan', {
        body: {
          scene_id: sceneId,
          project_id: projectId,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Generation failed');

      toast.success(`Camera Plan v${data.version} generado con ${data.shots_count} planos`);
      await fetchCameraPlan();
    } catch (err: any) {
      console.error('Error generating camera plan:', err);
      toast.error(err.message || 'Error al generar Camera Plan');
    } finally {
      setGenerating(false);
    }
  };

  const saveChanges = async () => {
    if (!cameraPlan) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('scene_camera_plan')
        .update({ shots_list: JSON.parse(JSON.stringify(editedShots)) })
        .eq('id', cameraPlan.id);

      if (error) throw error;
      
      setCameraPlan({ ...cameraPlan, shots_list: editedShots });
      toast.success('Cambios guardados');
    } catch (err) {
      console.error('Error saving camera plan:', err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const approveCameraPlan = async () => {
    if (!cameraPlan) return;
    
    try {
      const { error } = await supabase
        .from('scene_camera_plan')
        .update({ status: 'approved' })
        .eq('id', cameraPlan.id);

      if (error) throw error;
      
      setCameraPlan({ ...cameraPlan, status: 'approved' });
      toast.success('Camera Plan aprobado');
      onApproved?.();
    } catch (err) {
      console.error('Error approving camera plan:', err);
      toast.error('Error al aprobar');
    }
  };

  const updateShot = (index: number, field: keyof CameraPlanShot, value: string) => {
    const newShots = [...editedShots];
    newShots[index] = { ...newShots[index], [field]: value };
    setEditedShots(newShots);
  };

  const moveShot = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= editedShots.length) return;
    
    const newShots = [...editedShots];
    const temp = newShots[index];
    newShots[index] = newShots[newIndex];
    newShots[newIndex] = temp;
    
    // Update shot_no
    newShots.forEach((shot, i) => {
      shot.shot_no = i + 1;
    });
    
    setEditedShots(newShots);
  };

  const hasChanges = cameraPlan && JSON.stringify(cameraPlan.shots_list) !== JSON.stringify(editedShots);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Camera Plan</h3>
          {cameraPlan && (
            <>
              <Badge variant="outline">v{cameraPlan.version}</Badge>
              <Badge variant={cameraPlan.status === 'approved' ? 'default' : 'secondary'}>
                {cameraPlan.status === 'approved' ? 'Aprobado' : 'Borrador'}
              </Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cameraPlan ? (
            <>
              {hasChanges && (
                <Button size="sm" variant="outline" onClick={saveChanges} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar cambios
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={generateCameraPlan} disabled={generating}>
                <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                Regenerar
              </Button>
              {cameraPlan.status !== 'approved' && (
                <Button size="sm" onClick={approveCameraPlan}>
                  <Check className="w-4 h-4 mr-2" />
                  Aprobar Camera Plan
                </Button>
              )}
            </>
          ) : (
            <Button onClick={generateCameraPlan} disabled={generating}>
              {generating ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Generar Camera Plan
            </Button>
          )}
        </div>
      </div>

      {cameraPlan ? (
        <>
          {/* Plan Header */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Encabezado</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="py-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">SEC:</span>
                  <span className="font-mono">{cameraPlan.plan_header.sec_code || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">LOC:</span>
                  <span className="font-mono">{cameraPlan.plan_header.location_code || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">SET:</span>
                  <span className="font-mono">{cameraPlan.plan_header.set_code || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">TIEMPO:</span>
                  <span className="font-mono">{cameraPlan.plan_header.time_context || 'N/A'}</span>
                </div>
              </div>
              {cameraPlan.plan_header.scene_logline && (
                <p className="mt-3 text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">
                  {cameraPlan.plan_header.scene_logline}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Shots List */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Lista de Planos</CardTitle>
                <Badge variant="outline">{editedShots.length} planos</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-border">
                  {editedShots.map((shot, index) => (
                    <div 
                      key={`${shot.shot_no}-${index}`}
                      className="p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Shot Number */}
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="font-mono text-sm font-bold text-primary">
                            {String(shot.shot_no).padStart(2, '0')}
                          </span>
                        </div>

                        {/* Panel Ref */}
                        <Badge variant="outline" className="font-mono shrink-0">
                          {shot.panel_ref}
                        </Badge>

                        {/* Shot Type */}
                        {editingShot === index ? (
                          <Select 
                            value={shot.shot_type_hint} 
                            onValueChange={(v) => updateShot(index, 'shot_type_hint', v)}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SHOT_TYPES.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            {shot.shot_type_hint}
                          </Badge>
                        )}

                        {/* Framing Hint */}
                        {editingShot === index ? (
                          <Select 
                            value={shot.framing_hint || 'frontal'} 
                            onValueChange={(v) => updateShot(index, 'framing_hint', v)}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FRAMING_HINTS.map(hint => (
                                <SelectItem key={hint} value={hint}>{hint}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : shot.framing_hint ? (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {shot.framing_hint}
                          </span>
                        ) : null}

                        {/* Shot Label */}
                        {editingShot === index ? (
                          <Input
                            value={shot.shot_label}
                            onChange={(e) => updateShot(index, 'shot_label', e.target.value)}
                            className="flex-1 h-8 text-sm"
                          />
                        ) : (
                          <span className="flex-1 text-sm truncate">
                            {shot.shot_label}
                          </span>
                        )}

                        {/* Blocking Ref */}
                        {shot.blocking_ref && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 shrink-0">
                                <Move className="w-3 h-3 mr-1" />
                                {shot.blocking_ref}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Referencia a diagrama de blocking</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {editingShot === index ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingShot(null)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingShot(index)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveShot(index, 'up')}
                            disabled={index === 0}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveShot(index, 'down')}
                            disabled={index === editedShots.length - 1}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Notes */}
                      {shot.notes && (
                        <p className="mt-2 ml-11 text-xs text-muted-foreground italic">
                          {shot.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Blocking Diagrams Preview */}
          {cameraPlan.blocking_diagrams.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Diagramas de Blocking</CardTitle>
                  <Badge variant="outline">{cameraPlan.blocking_diagrams.length} diagramas</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cameraPlan.blocking_diagrams.map((diagram) => (
                    <div 
                      key={diagram.blocking_id}
                      className="relative aspect-video bg-muted/50 rounded-lg border-2 border-dashed border-border p-4"
                    >
                      <div className="absolute top-2 left-2">
                        <Badge variant="outline" className="text-xs">
                          {diagram.blocking_id} • {diagram.frame_shape}
                        </Badge>
                      </div>
                      
                      {/* Simple SVG visualization */}
                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                        {/* Entities (circles) */}
                        {diagram.entities.map((entity) => (
                          <g key={entity.id}>
                            <circle
                              cx={entity.pos.x * 100}
                              cy={entity.pos.y * 100}
                              r="6"
                              className={entity.kind === 'character' ? 'fill-primary/60' : 'fill-muted-foreground/60'}
                            />
                            <text
                              x={entity.pos.x * 100}
                              y={entity.pos.y * 100 + 2}
                              textAnchor="middle"
                              className="fill-primary-foreground text-[5px] font-bold"
                            >
                              {entity.label}
                            </text>
                          </g>
                        ))}
                        
                        {/* Camera marks (triangles) */}
                        {diagram.camera_marks.map((cam) => (
                          <g key={cam.cam_id}>
                            <polygon
                              points={`${cam.pos.x * 100},${cam.pos.y * 100 - 5} ${cam.pos.x * 100 - 4},${cam.pos.y * 100 + 3} ${cam.pos.x * 100 + 4},${cam.pos.y * 100 + 3}`}
                              className="fill-amber-500"
                            />
                            <line
                              x1={cam.pos.x * 100}
                              y1={cam.pos.y * 100}
                              x2={cam.aim.x * 100}
                              y2={cam.aim.y * 100}
                              className="stroke-amber-500/50"
                              strokeWidth="0.5"
                              strokeDasharray="2,2"
                            />
                          </g>
                        ))}
                        
                        {/* Movement arrows */}
                        {diagram.movement_arrows.map((arrow, i) => (
                          <line
                            key={i}
                            x1={arrow.from.x * 100}
                            y1={arrow.from.y * 100}
                            x2={arrow.to.x * 100}
                            y2={arrow.to.y * 100}
                            className="stroke-blue-500"
                            strokeWidth="1"
                            markerEnd="url(#arrowhead)"
                          />
                        ))}
                        
                        <defs>
                          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                            <polygon points="0 0, 6 3, 0 6" className="fill-blue-500" />
                          </marker>
                        </defs>
                      </svg>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-2">
              No hay Camera Plan para esta escena.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              El Camera Plan traduce el storyboard aprobado en especificaciones de cámara.
            </p>
            <Button onClick={generateCameraPlan} disabled={generating}>
              {generating ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Generar Camera Plan
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Status indicator */}
      {cameraPlan?.status === 'approved' && (
        <div className="flex items-center justify-center gap-2 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-500 font-medium">
            Camera Plan aprobado - Listo para generar Documento Técnico
          </span>
        </div>
      )}
    </div>
  );
}
