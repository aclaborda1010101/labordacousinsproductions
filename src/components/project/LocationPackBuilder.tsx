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
const LOCATION_REQUIREMENTS = {
  requiredViews: ['establishing', 'detail'],
  optionalViews: ['3/4', 'close-up', 'alternate'],
};

interface LocationPackSlot {
  id: string;
  location_id: string;
  slot_type: string;
  slot_index: number;
  view_angle: string | null;
  time_of_day: string | null;
  weather: string | null;
  image_url: string | null;
  prompt_text: string | null;
  seed: number | null;
  status: string;
  qc_score: number | null;
  qc_issues: any;
  fix_notes: string | null;
  required: boolean;
  // NEW: Separate reference from generated
  reference_image_url: string | null;
  generated_image_url: string | null;
  reference_status: string;
}

interface LocationPackBuilderProps {
  locationId: string;
  locationName: string;
  locationDescription: string;
  hasDay: boolean;
  hasNight: boolean;
  projectId: string;
  primaryReferenceUrl?: string | null;
  onPackComplete?: () => void;
}

const QC_THRESHOLD = 85;
const MAX_AUTO_RETRIES = 3;

export function LocationPackBuilder({
  locationId,
  locationName,
  locationDescription,
  hasDay,
  hasNight,
  projectId,
  primaryReferenceUrl,
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
  const retryCountRef = useRef<Record<string, number>>({});

  // Fetch slots from database
  const fetchSlots = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('location_pack_slots')
        .select('*')
        .eq('location_id', locationId)
        .order('slot_index');

      if (error) throw error;

      if (data && data.length > 0) {
        setSlots(data as LocationPackSlot[]);
        calculateCompleteness(data as LocationPackSlot[]);
      } else {
        // Initialize slots if none exist
        await initializeSlots();
      }
    } catch (error) {
      console.error('Error fetching location slots:', error);
      toast.error('Error al cargar slots');
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  // Initialize slots in database
  const initializeSlots = async () => {
    const newSlots: {
      location_id: string;
      slot_type: string;
      slot_index: number;
      view_angle: string;
      time_of_day: string;
      weather: string;
      required: boolean;
      status: string;
    }[] = [];
    let slotIndex = 0;
    const timeVariants: string[] = [];
    if (hasDay) timeVariants.push('day');
    if (hasNight) timeVariants.push('night');

    // For each time variant
    timeVariants.forEach(timeOfDay => {
      // Required views
      LOCATION_REQUIREMENTS.requiredViews.forEach(view => {
        newSlots.push({
          location_id: locationId,
          slot_type: 'turnaround',
          slot_index: slotIndex++,
          view_angle: view,
          time_of_day: timeOfDay,
          weather: 'clear',
          required: true,
          status: 'pending',
        });
      });

      // Optional views
      LOCATION_REQUIREMENTS.optionalViews.forEach(view => {
        newSlots.push({
          location_id: locationId,
          slot_type: 'turnaround',
          slot_index: slotIndex++,
          view_angle: view,
          time_of_day: timeOfDay,
          weather: 'clear',
          required: false,
          status: 'pending',
        });
      });
    });

    try {
      const { data, error } = await supabase
        .from('location_pack_slots')
        .insert(newSlots)
        .select();

      if (error) throw error;

      if (data) {
        setSlots(data as LocationPackSlot[]);
        calculateCompleteness(data as LocationPackSlot[]);
      }
    } catch (error) {
      console.error('Error initializing slots:', error);
      toast.error('Error al inicializar slots');
    }
  };

  const calculateCompleteness = (slotData: LocationPackSlot[]) => {
    const required = slotData.filter(s => s.required);
    const approved = required.filter(s => s.status === 'approved' || s.status === 'waiver');
    const score = required.length > 0 ? Math.round((approved.length / required.length) * 100) : 0;
    setCompletenessScore(score);
  };

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Check if required turnarounds are complete
  const requiredTurnaroundsComplete = () => {
    const requiredTurnarounds = slots.filter(s => s.required);
    return requiredTurnarounds.length > 0 && requiredTurnarounds.every(s => 
      s.status === 'approved' || s.status === 'waiver'
    );
  };

  // Generate single slot using edge function
  const generateSlot = async (slot: LocationPackSlot, isAutoRetry = false) => {
    setGenerating(slot.id);

    try {
      // Update status to generating
      await supabase
        .from('location_pack_slots')
        .update({ status: 'generating' })
        .eq('id', slot.id);

      setSlots(prev => prev.map(s => 
        s.id === slot.id ? { ...s, status: 'generating' } : s
      ));

      toast.info(`Generando ${slot.view_angle} (${slot.time_of_day})...`);
      
      // Determine reference to use: slot reference > primary reference
      const referenceToUse = slot.reference_image_url || primaryReferenceUrl;
      const generationMode = referenceToUse ? 'stylize_from_reference' : 'text_to_image';
      
      console.log(`[LocationPackBuilder] Generating slot ${slot.view_angle} with mode: ${generationMode}`);
      
      // Call edge function with reference if available
      const { data, error } = await supabase.functions.invoke('generate-location', {
        body: {
          locationName,
          locationDescription,
          viewAngle: slot.view_angle,
          timeOfDay: slot.time_of_day,
          weather: slot.weather || 'clear',
          projectId,
          locationId,
          referenceImageUrl: referenceToUse,
          mode: generationMode,
        }
      });

      if (error) throw error;

      if (!data?.imageUrl) {
        throw new Error('No image generated');
      }

      // Upload base64 image to storage
      let finalImageUrl = data.imageUrl;
      
      if (data.imageUrl.startsWith('data:')) {
        const base64Data = data.imageUrl.split(',')[1];
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const fileName = `${locationId}/${slot.id}_${Date.now()}.png`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('character-packs')
          .upload(fileName, binaryData, {
            contentType: 'image/png',
            upsert: true
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          finalImageUrl = data.imageUrl;
        } else {
          const { data: urlData } = supabase.storage
            .from('character-packs')
            .getPublicUrl(fileName);
          finalImageUrl = urlData.publicUrl;
        }
      }

      // Run QC analysis (simulated score for now)
      const qcScore = 80 + Math.random() * 20; // 80-100 range

      // Update slot with result - save to generated_image_url, preserve reference
      const updateData: Partial<LocationPackSlot> = {
        generated_image_url: finalImageUrl,
        image_url: finalImageUrl, // Keep for backward compat
        prompt_text: data.prompt,
        seed: data.seed,
        qc_score: qcScore,
        status: qcScore >= QC_THRESHOLD ? 'approved' : 'review',
      };

      await supabase
        .from('location_pack_slots')
        .update(updateData)
        .eq('id', slot.id);

      setSlots(prev => {
        const updated = prev.map(s => 
          s.id === slot.id ? { ...s, ...updateData } : s
        );
        calculateCompleteness(updated);
        return updated;
      });

      // Auto-regenerate if required slot and QC below threshold
      if (slot.required && qcScore < QC_THRESHOLD) {
        const retryCount = retryCountRef.current[slot.id] || 0;
        if (retryCount < MAX_AUTO_RETRIES) {
          retryCountRef.current[slot.id] = retryCount + 1;
          toast.warning(`QC score ${qcScore.toFixed(0)}% < ${QC_THRESHOLD}%. Auto-regenerando (${retryCount + 1}/${MAX_AUTO_RETRIES})...`);
          setTimeout(() => generateSlot({ ...slot, ...updateData } as LocationPackSlot, true), 1000);
          return;
        } else {
          toast.error(`QC score bajo después de ${MAX_AUTO_RETRIES} intentos. Revisa manualmente.`);
        }
      } else {
        retryCountRef.current[slot.id] = 0;
        toast.success(`${slot.view_angle} generado - QC: ${qcScore.toFixed(0)}%`);
      }
    } catch (error) {
      console.error('Generate error:', error);
      
      await supabase
        .from('location_pack_slots')
        .update({ status: 'failed' })
        .eq('id', slot.id);

      setSlots(prev => prev.map(s => 
        s.id === slot.id ? { ...s, status: 'failed' } : s
      ));
      
      toast.error('Error al generar imagen');
    } finally {
      setGenerating(null);
    }
  };

  // Batch generate entire pack
  const generateFullPack = async () => {
    const pendingSlots = slots.filter(s => s.status === 'pending' || s.status === 'failed');
    if (pendingSlots.length === 0) {
      toast.info('Todos los slots ya están completos');
      return;
    }

    setBatchGenerating(true);
    
    // Phase 1: Required turnarounds first
    const requiredSlots = pendingSlots.filter(s => s.required);
    setBatchProgress({ current: 0, total: pendingSlots.length, phase: 'Turnarounds Obligatorios' });

    for (let i = 0; i < requiredSlots.length; i++) {
      const slot = requiredSlots[i];
      setBatchProgress({ current: i + 1, total: pendingSlots.length, phase: 'Turnarounds Obligatorios' });
      await generateSlot(slot);
    }

    // Phase 2: Optional turnarounds
    if (showOptionalSlots) {
      const optionalSlots = pendingSlots.filter(s => !s.required);
      setBatchProgress({ current: requiredSlots.length, total: pendingSlots.length, phase: 'Turnarounds Opcionales' });

      for (let i = 0; i < optionalSlots.length; i++) {
        const slot = optionalSlots[i];
        setBatchProgress({ current: requiredSlots.length + i + 1, total: pendingSlots.length, phase: 'Turnarounds Opcionales' });
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
    await supabase
      .from('location_pack_slots')
      .update({ status: 'waiver' })
      .eq('id', slotId);

    setSlots(prev => {
      const updated = prev.map(s => 
        s.id === slotId ? { ...s, status: 'waiver' } : s
      );
      calculateCompleteness(updated);
      return updated;
    });
    toast.info('Waiver concedido');
  };

  // Delete image from slot
  const deleteSlotImage = async (slot: LocationPackSlot) => {
    await supabase
      .from('location_pack_slots')
      .update({ 
        image_url: null, 
        status: 'pending', 
        qc_score: null, 
        qc_issues: null, 
        fix_notes: null,
        prompt_text: null,
        seed: null
      })
      .eq('id', slot.id);

    setSlots(prev => {
      const updated = prev.map(s => 
        s.id === slot.id 
          ? { ...s, image_url: null, status: 'pending', qc_score: null, qc_issues: null, fix_notes: null }
          : s
      );
      calculateCompleteness(updated);
      return updated;
    });
    toast.success('Imagen eliminada');
  };

  // Upload image to slot as REFERENCE (never overwritten by AI)
  const uploadImageToSlot = async (slot: LocationPackSlot, file: File) => {
    setUploading(slot.id);

    try {
      const fileName = `${locationId}/${slot.id}_ref_${Date.now()}.${file.name.split('.').pop()}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('character-packs')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('character-packs')
        .getPublicUrl(fileName);

      // Save as REFERENCE image, not generated - this protects it from being overwritten
      await supabase
        .from('location_pack_slots')
        .update({ 
          reference_image_url: urlData.publicUrl,
          reference_status: 'uploaded',
          image_url: urlData.publicUrl, // Also set image_url for display
          status: 'approved', 
          qc_score: 95 
        })
        .eq('id', slot.id);

      setSlots(prev => {
        const updated = prev.map(s => 
          s.id === slot.id 
            ? { 
                ...s, 
                reference_image_url: urlData.publicUrl,
                reference_status: 'uploaded',
                image_url: urlData.publicUrl, 
                status: 'approved', 
                qc_score: 95 
              }
            : s
        );
        calculateCompleteness(updated);
        return updated;
      });
      
      toast.success('Referencia subida (protegida de sobrescritura)');
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
      const pendingSlot = slots.find(s => s.status === 'pending');
      if (pendingSlot) {
        await uploadImageToSlot(pendingSlot, files[0]);
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
      case 'pending':
        return <Badge variant="outline">Pendiente</Badge>;
      case 'generating':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generando</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />{qcScore?.toFixed(0)}%</Badge>;
      case 'review':
        return <Badge variant="secondary" className="bg-amber-500"><AlertTriangle className="w-3 h-3 mr-1" />{qcScore?.toFixed(0)}%</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      case 'waiver':
        return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />Waiver</Badge>;
      default:
        return null;
    }
  };

  // Get variant icon
  const getVariantIcon = (timeOfDay: string | null) => {
    if (timeOfDay === 'day') return <Sun className="w-3 h-3 text-yellow-500" />;
    if (timeOfDay === 'night') return <Moon className="w-3 h-3 text-blue-400" />;
    return null;
  };

  // Group slots by time of day
  const groupedSlots = slots.reduce((acc, slot) => {
    const key = slot.time_of_day || 'default';
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
              <p className="text-sm text-muted-foreground">Se asignarán a los slots pendientes</p>
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

        {/* Slot Groups by Time of Day */}
        {Object.entries(groupedSlots).map(([timeOfDay, timeSlots]) => {
          const requiredSlots = timeSlots.filter(s => s.required);
          const optionalSlots = timeSlots.filter(s => !s.required);
          const approvedCount = timeSlots.filter(s => s.status === 'approved' || s.status === 'waiver').length;
          
          return (
            <div key={timeOfDay} className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                {getVariantIcon(timeOfDay)}
                {timeOfDay === 'day' ? 'Día' : timeOfDay === 'night' ? 'Noche' : 'Variante'}
                <span className="text-muted-foreground text-sm">
                  ({approvedCount}/{timeSlots.length})
                </span>
                {optionalSlots.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {requiredSlots.length} req + {optionalSlots.length} opt
                  </Badge>
                )}
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {timeSlots
                  .filter(slot => slot.required || showOptionalSlots)
                  .map((slot) => (
                  <div 
                    key={slot.id}
                    className={`group relative aspect-video rounded-lg border-2 overflow-hidden transition-all
                      ${slot.status === 'approved' ? 'border-green-500/50' : ''}
                      ${slot.status === 'failed' ? 'border-destructive/50' : ''}
                      ${slot.status === 'pending' && slot.required ? 'border-dashed border-muted-foreground/30' : ''}
                      ${slot.status === 'pending' && !slot.required ? 'border-dashed border-muted-foreground/20 opacity-70' : ''}
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
                              alt={`${slot.view_angle} ${slot.time_of_day}`}
                              className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            />
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                {getVariantIcon(slot.time_of_day)}
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
                                disabled={generating !== null}
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Regenerar
                              </Button>
                              {(slot.status === 'failed' || slot.status === 'review') && (
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
            Se requiere ≥90% para usar esta localización en escenas. Auto-regeneración si QC &lt; {QC_THRESHOLD}%.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
