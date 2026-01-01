import { useState, useEffect, useCallback, useRef, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, Upload, Sparkles, CheckCircle2, XCircle, AlertTriangle, 
  MapPin, Camera, RefreshCw, Lock, Play, ImagePlus, FolderUp, Trash2, Sun, Moon
} from 'lucide-react';

// Location pack slot requirements
// Turnaround views: establishing shot (wide) and detail are required
// Optional: 3/4 angle, alternate lighting variants
const LOCATION_REQUIREMENTS = {
  requiredViews: ['establishing', 'detail'],
  optionalViews: ['3/4', 'close-up', 'alternate'],
};

interface LocationPackSlot {
  id: string;
  slot_type: string;
  slot_index: number;
  view_angle: string | null;
  variant: 'day' | 'night' | null;
  image_url: string | null;
  status: string;
  qc_score: number | null;
  qc_issues: string[];
  fix_notes: string | null;
  required: boolean;
}

interface LocationPackBuilderProps {
  locationId: string;
  locationName: string;
  locationDescription: string;
  hasDay: boolean;
  hasNight: boolean;
  onPackComplete?: () => void;
}

export function LocationPackBuilder({
  locationId,
  locationName,
  locationDescription,
  hasDay,
  hasNight,
  onPackComplete,
}: LocationPackBuilderProps) {
  const [slots, setSlots] = useState<LocationPackSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, phase: '' });
  const [completenessScore, setCompletenessScore] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchUploadProgress, setBatchUploadProgress] = useState({ current: 0, total: 0 });
  const [showOptionalSlots, setShowOptionalSlots] = useState(true);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const globalFileInputRef = useRef<HTMLInputElement | null>(null);

  // Simulated slots since we don't have a location_pack_slots table
  // In production, this would fetch from a dedicated table
  const initializeSlots = useCallback(() => {
    const newSlots: LocationPackSlot[] = [];
    let slotIndex = 0;
    const variants: ('day' | 'night')[] = [];
    if (hasDay) variants.push('day');
    if (hasNight) variants.push('night');

    // For each lighting variant
    variants.forEach(variant => {
      // Required views
      LOCATION_REQUIREMENTS.requiredViews.forEach(view => {
        newSlots.push({
          id: `${locationId}-${variant}-${view}`,
          slot_type: 'turnaround',
          slot_index: slotIndex++,
          view_angle: view,
          variant,
          image_url: null,
          status: 'empty',
          qc_score: null,
          qc_issues: [],
          fix_notes: null,
          required: true,
        });
      });

      // Optional views
      LOCATION_REQUIREMENTS.optionalViews.forEach(view => {
        newSlots.push({
          id: `${locationId}-${variant}-${view}`,
          slot_type: 'turnaround',
          slot_index: slotIndex++,
          view_angle: view,
          variant,
          image_url: null,
          status: 'empty',
          qc_score: null,
          qc_issues: [],
          fix_notes: null,
          required: false,
        });
      });
    });

    setSlots(newSlots);
    calculateCompleteness(newSlots);
    setLoading(false);
  }, [locationId, hasDay, hasNight]);

  const calculateCompleteness = (slotData: LocationPackSlot[]) => {
    const required = slotData.filter(s => s.required);
    const approved = required.filter(s => s.status === 'approved' || s.status === 'waiver');
    const score = required.length > 0 ? Math.round((approved.length / required.length) * 100) : 0;
    setCompletenessScore(score);
  };

  useEffect(() => {
    initializeSlots();
  }, [initializeSlots]);

  // Check if required turnarounds (establishing/detail) are complete
  const requiredTurnaroundsComplete = () => {
    const requiredTurnarounds = slots.filter(s => s.required);
    return requiredTurnarounds.length > 0 && requiredTurnarounds.every(s => 
      s.status === 'approved' || s.status === 'waiver'
    );
  };

  // Generate single slot
  const generateSlot = async (slot: LocationPackSlot) => {
    setGenerating(slot.id);

    try {
      // Simulate generation for now - would call edge function
      toast.info(`Generando ${slot.view_angle} (${slot.variant})...`);
      
      // Simulated delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update slot status (simulated)
      setSlots(prev => prev.map(s => 
        s.id === slot.id 
          ? { ...s, status: 'approved', qc_score: 92 }
          : s
      ));
      
      toast.success(`${slot.view_angle} generado y aprobado`);
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
    
    // Phase 1: Required turnarounds first
    const requiredSlots = emptySlots.filter(s => s.required);
    setBatchProgress({ current: 0, total: emptySlots.length, phase: 'Turnarounds Obligatorios' });

    for (let i = 0; i < requiredSlots.length; i++) {
      const slot = requiredSlots[i];
      setBatchProgress({ current: i + 1, total: emptySlots.length, phase: 'Turnarounds Obligatorios' });
      await generateSlot(slot);
    }

    // Phase 2: Optional turnarounds
    if (showOptionalSlots) {
      const optionalSlots = emptySlots.filter(s => !s.required);
      setBatchProgress({ current: requiredSlots.length, total: emptySlots.length, phase: 'Turnarounds Opcionales' });

      for (let i = 0; i < optionalSlots.length; i++) {
        const slot = optionalSlots[i];
        setBatchProgress({ current: requiredSlots.length + i + 1, total: emptySlots.length, phase: 'Turnarounds Opcionales' });
        await generateSlot(slot);
      }
    }

    setBatchGenerating(false);
    toast.success('Pack de localización completo');
    
    if (onPackComplete) {
      onPackComplete();
    }
  };

  // Grant waiver for failed slot
  const grantWaiver = async (slotId: string) => {
    setSlots(prev => prev.map(s => 
      s.id === slotId ? { ...s, status: 'waiver' } : s
    ));
    toast.info('Waiver concedido');
  };

  // Delete image from slot
  const deleteSlotImage = async (slot: LocationPackSlot) => {
    setSlots(prev => prev.map(s => 
      s.id === slot.id 
        ? { ...s, image_url: null, status: 'empty', qc_score: null, qc_issues: [], fix_notes: null }
        : s
    ));
    toast.success('Imagen eliminada');
  };

  // Upload image to slot
  const uploadImageToSlot = async (slot: LocationPackSlot, file: File) => {
    setUploading(slot.id);

    try {
      // Simulate upload
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const fakeUrl = URL.createObjectURL(file);
      setSlots(prev => prev.map(s => 
        s.id === slot.id 
          ? { ...s, image_url: fakeUrl, status: 'approved', qc_score: 95 }
          : s
      ));
      
      toast.success('Imagen subida correctamente');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error al subir imagen');
    } finally {
      setUploading(null);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Upload to first empty slot
      const emptySlot = slots.find(s => s.status === 'empty');
      if (emptySlot) {
        await uploadImageToSlot(emptySlot, files[0]);
      }
    }
  };

  // Handle file input change
  const handleFileChange = (slot: LocationPackSlot, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Solo se permiten archivos de imagen');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('El archivo es demasiado grande (máximo 10MB)');
        return;
      }
      uploadImageToSlot(slot, file);
    }
    event.target.value = '';
  };

  // Trigger file input for slot
  const triggerFileUpload = (slotId: string) => {
    fileInputRefs.current[slotId]?.click();
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

  // Get variant icon
  const getVariantIcon = (variant: 'day' | 'night' | null) => {
    if (variant === 'day') return <Sun className="w-3 h-3 text-yellow-500" />;
    if (variant === 'night') return <Moon className="w-3 h-3 text-blue-400" />;
    return null;
  };

  // Group slots by variant
  const groupedSlots = slots.reduce((acc, slot) => {
    const key = slot.variant || 'default';
    if (!acc[key]) acc[key] = [];
    acc[key].push(slot);
    return acc;
  }, {} as Record<string, LocationPackSlot[]>);

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
              <MapPin className="w-5 h-5 text-primary" />
              Location Pack Builder
            </CardTitle>
            <CardDescription>
              {locationName}
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
      <CardContent 
        className="space-y-6"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag & Drop Overlay */}
        {isDragOver && (
          <div className="fixed inset-0 bg-primary/10 border-4 border-dashed border-primary rounded-lg z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-background/95 p-6 rounded-xl shadow-lg text-center">
              <FolderUp className="w-12 h-12 mx-auto text-primary mb-3" />
              <p className="font-medium">Suelta las imágenes aquí</p>
              <p className="text-sm text-muted-foreground">Se asignarán a los slots vacíos</p>
            </div>
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="gold"
            className="flex-1"
            onClick={generateFullPack}
            disabled={batchGenerating || batchUploading || generating !== null}
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
          
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => globalFileInputRef.current?.click()}
            disabled={batchGenerating || batchUploading || generating !== null}
          >
            <FolderUp className="w-4 h-4 mr-2" />
            Subir Múltiples
          </Button>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            ref={globalFileInputRef}
          />
        </div>

        {batchGenerating && (
          <Progress 
            value={(batchProgress.current / batchProgress.total) * 100} 
            className="h-2" 
          />
        )}

        {/* Required Turnarounds Warning */}
        {!requiredTurnaroundsComplete() && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-600">Turnarounds obligatorios requeridos</p>
              <p className="text-muted-foreground">
                Completa las tomas establishing y detail antes de usar esta localización en escenas.
              </p>
            </div>
          </div>
        )}

        {/* Toggle Optional Slots */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Mostrar slots opcionales</span>
            <Badge variant="outline" className="text-xs">
              {slots.filter(s => !s.required).length} slots
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOptionalSlots(!showOptionalSlots)}
            className="h-8"
          >
            {showOptionalSlots ? 'Ocultar' : 'Mostrar'}
          </Button>
        </div>

        {/* Slot Groups by Variant */}
        {Object.entries(groupedSlots).map(([variant, variantSlots]) => {
          const requiredSlots = variantSlots.filter(s => s.required);
          const optionalSlots = variantSlots.filter(s => !s.required);
          const approvedCount = variantSlots.filter(s => s.status === 'approved' || s.status === 'waiver').length;
          
          return (
            <div key={variant} className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                {getVariantIcon(variant as 'day' | 'night')}
                {variant === 'day' ? 'Día' : variant === 'night' ? 'Noche' : 'Variante'}
                <span className="text-muted-foreground text-sm">
                  ({approvedCount}/{variantSlots.length})
                </span>
                {optionalSlots.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {requiredSlots.length} req + {optionalSlots.length} opt
                  </Badge>
                )}
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {variantSlots
                  .filter(slot => slot.required || showOptionalSlots)
                  .map((slot) => (
                  <div 
                    key={slot.id}
                    className={`group relative aspect-video rounded-lg border-2 overflow-hidden transition-all
                      ${slot.status === 'approved' ? 'border-green-500/50' : ''}
                      ${slot.status === 'failed' ? 'border-destructive/50' : ''}
                      ${slot.status === 'empty' && slot.required ? 'border-dashed border-muted-foreground/30' : ''}
                      ${slot.status === 'empty' && !slot.required ? 'border-dashed border-muted-foreground/20 opacity-70' : ''}
                    `}
                  >
                    {/* Optional badge indicator */}
                    {!slot.required && (
                      <div className="absolute top-0 left-0 z-20">
                        <span className="text-[10px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded-br-md font-medium">
                          OPT
                        </span>
                      </div>
                    )}
                    {slot.image_url ? (
                      <>
                        {/* Delete button overlay */}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute top-1 left-1 h-6 w-6 p-0 z-10 opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSlotImage(slot);
                          }}
                          title="Eliminar imagen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <img 
                              src={slot.image_url} 
                              alt={`${slot.view_angle} ${slot.variant}`}
                              className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            />
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                {getVariantIcon(slot.variant)}
                                {slot.view_angle}
                              </DialogTitle>
                            </DialogHeader>
                            <img src={slot.image_url} alt="" className="w-full rounded-lg" />
                            {slot.fix_notes && (
                              <div className="p-3 bg-destructive/10 rounded-lg text-sm">
                                <p className="font-medium text-destructive">Fix Notes:</p>
                                <p>{slot.fix_notes}</p>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                className="flex-1"
                                onClick={() => generateSlot(slot)}
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Regenerar
                              </Button>
                              {slot.status === 'failed' && (
                                <Button 
                                  variant="secondary"
                                  onClick={() => grantWaiver(slot.id)}
                                >
                                  <AlertTriangle className="w-4 h-4 mr-2" />
                                  Grant Waiver
                                </Button>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-muted/50">
                        <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                        <p className="text-[10px] text-muted-foreground text-center mb-1 capitalize">
                          {slot.view_angle}
                        </p>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => generateSlot(slot)}
                            disabled={generating !== null || batchGenerating}
                          >
                            {generating === slot.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => triggerFileUpload(slot.id)}
                            disabled={uploading !== null}
                          >
                            {uploading === slot.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={el => { fileInputRefs.current[slot.id] = el; }}
                          onChange={(e) => handleFileChange(slot, e)}
                        />
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
          );
        })}

        {/* Pack Completeness Calculation Info */}
        <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-2">
          <h4 className="font-medium">Pack Completeness Score</h4>
          <p className="text-muted-foreground">
            Score = (Slots Approved + Waivers) / Total Required Slots × 100
          </p>
          <p className="text-muted-foreground">
            Se requiere ≥90% para usar esta localización en escenas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}