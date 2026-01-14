import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Film, 
  Wand2, 
  Check, 
  RefreshCw, 
  GripVertical,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Pencil,
  Info,
  Loader2,
  AlertCircle,
  Download,
  Lock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { StoryboardPanel } from '@/types/technical-doc';
import { StoryboardGenerationOverlay } from './StoryboardGenerationOverlay';
import { useStoryboardProgress } from '@/hooks/useStoryboardProgress';
import { exportStoryboardVisualPDF } from '@/lib/exportStoryboardVisualPDF';
import { StoryboardStylePicker } from './StoryboardStylePicker';
import { type StoryboardStylePresetId } from '@/lib/storyboardStylePresets';

// Identity QC types
interface IdentityQC {
  characters?: Record<string, {
    identity_score: number;
    issues: string[];
    status: 'pass' | 'fail' | 'uncertain';
  }>;
  overall_score?: number;
  needs_regen?: boolean;
}

// Style QC types
interface StyleQC {
  preset_id?: string;
  compliance_score?: number;
  issues?: string[];
  needs_regen?: boolean;
}

interface CanvasFormat {
  aspect_ratio: string;
  orientation: string;
}

interface StoryboardPanelViewProps {
  sceneId: string;
  projectId: string;
  sceneText: string;
  visualStyle?: string;
  characterRefs?: { name: string; image_url?: string }[];
  locationRef?: { name: string; image_url?: string };
  onApproved?: () => void;
}

export function StoryboardPanelView({
  sceneId,
  projectId,
  sceneText,
  visualStyle = 'cinematic realism',
  characterRefs = [],
  locationRef,
  onApproved,
}: StoryboardPanelViewProps) {
  const [panels, setPanels] = useState<StoryboardPanel[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [editingPanel, setEditingPanel] = useState<string | null>(null);
  const [allApproved, setAllApproved] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<'GRID_SHEET_V1' | 'TECH_PAGE_V1'>('GRID_SHEET_V1');
  const [selectedStylePreset, setSelectedStylePreset] = useState<StoryboardStylePresetId>('sb_cinematic_narrative');
  const [exporting, setExporting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; panelNo: number } | null>(null);
  const [canvasFormat, setCanvasFormat] = useState<CanvasFormat | null>(null);
  const [styleIsLocked, setStyleIsLocked] = useState(false);

  // Progress tracking hook
  const expectedPanelCount = selectedStyle === 'GRID_SHEET_V1' ? 8 : 5;
  const {
    panelStatuses,
    currentPhase,
    progress,
    currentPanel,
    elapsedSeconds,
    estimatedRemainingMs,
    totalPanels,
    panelsToRetry,
    markAsRetried,
  } = useStoryboardProgress(sceneId, generating, expectedPanelCount);

  // Auto-close overlay when generation completes
  useEffect(() => {
    if (!generating) return;
    
    // Check if all panels are complete (success or error)
    const allComplete = panelStatuses.length > 0 && 
      panelStatuses.every(s => s.status === 'success' || s.status === 'error');
    
    if (allComplete) {
      const successCount = panelStatuses.filter(s => s.status === 'success').length;
      const errorCount = panelStatuses.filter(s => s.status === 'error').length;
      
      setGenerating(false);
      setShowOverlay(false);
      fetchPanels(); // Refresh panels list
      
      if (errorCount === 0) {
        toast.success(`¡Storyboard completo! ${successCount} paneles generados`);
      } else {
        toast.warning(`Storyboard generado: ${successCount} éxitos, ${errorCount} errores`);
      }
    }
  }, [panelStatuses, generating]);

  // Auto-retry panels with errors after 30 seconds
  useEffect(() => {
    if (panelsToRetry.length === 0) return;

    const retryPanel = async (panelStatus: typeof panelsToRetry[0]) => {
      markAsRetried(panelStatus.panel_id);
      console.log(`Auto-retrying panel ${panelStatus.panel_no} after 30s error`);
      
      try {
        // Update status to generating
        await supabase
          .from('storyboard_panels')
          .update({ image_status: 'generating', image_error: null })
          .eq('id', panelStatus.panel_id);

        const { data, error } = await supabase.functions.invoke('regenerate-storyboard-panel', {
          body: { panelId: panelStatus.panel_id },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Retry failed');
        
        toast.success(`Panel ${panelStatus.panel_no} regenerado automáticamente`);
      } catch (err) {
        console.error(`Auto-retry failed for panel ${panelStatus.panel_no}:`, err);
        toast.error(`Reintento automático falló para panel ${panelStatus.panel_no}`);
      }
    };

    // Retry each panel that needs it (one at a time to avoid overload)
    panelsToRetry.forEach(retryPanel);
  }, [panelsToRetry, markAsRetried]);

  // Fetch existing panels
  useEffect(() => {
    fetchPanels();
  }, [sceneId]);

  // Fetch canvas format from style_packs
  useEffect(() => {
    const fetchCanvasFormat = async () => {
      const { data } = await supabase
        .from('style_packs')
        .select('canvas_format, aspect_ratio')
        .eq('project_id', projectId)
        .single();
      
      if (data) {
        const canvasData = data.canvas_format as unknown as CanvasFormat | null;
        if (canvasData && canvasData.aspect_ratio) {
          setCanvasFormat(canvasData);
        } else if (data.aspect_ratio) {
          const ar = data.aspect_ratio as string;
          setCanvasFormat({ 
            aspect_ratio: ar, 
            orientation: ar === '9:16' || ar === '4:5' ? 'vertical' : 'horizontal' 
          });
        }
      }
    };
    fetchCanvasFormat();
  }, [projectId]);

  const fetchPanels = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('storyboard_panels')
        .select('*')
        .eq('scene_id', sceneId)
        .order('panel_no', { ascending: true });

      if (error) throw error;
      
      // Cast the data to our type
      const typedPanels = (data || []) as unknown as StoryboardPanel[];
      setPanels(typedPanels);
      setAllApproved(typedPanels.length > 0 && typedPanels.every(p => p.approved));
      // Lock style if panels exist
      setStyleIsLocked(typedPanels.length > 0);
      setAllApproved(typedPanels.length > 0 && typedPanels.every(p => p.approved));
    } catch (err) {
      console.error('Error fetching storyboard panels:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateStoryboard = async () => {
    setGenerating(true);
    setShowOverlay(true);
    setStyleIsLocked(true); // Lock style on generation start
    
    try {
      const panelCount = selectedStyle === 'GRID_SHEET_V1' ? 8 : 5;
      
      // ================================================================
      // FASE 1: Create panel structure (fast, ~10s)
      // ================================================================
      toast.info('Fase 1: Planificando paneles...');
      
      const { data: planData, error: planError } = await supabase.functions.invoke('generate-storyboard', {
        body: {
          scene_id: sceneId,
          project_id: projectId,
          scene_text: sceneText,
          visual_style: visualStyle,
          storyboard_style: selectedStyle,
          style_preset_id: selectedStylePreset, // NEW: Pass style preset
          character_refs: characterRefs,
          location_ref: locationRef,
          panel_count: panelCount,
        },
      });

      if (planError) {
        throw new Error(`Plan error: ${planError.message}`);
      }
      
      if (!planData?.success) {
        throw new Error(planData?.error || 'Planning failed');
      }

      const panelsCreated = planData.panels_created || planData.panels?.length || 0;
      toast.success(`${panelsCreated} paneles creados. Generando imágenes...`);
      
      // Refresh to show new panels (without images yet)
      await fetchPanels();

      // ================================================================
      // FASE 2: Render images in batches (2 per call, ~40s each)
      // ================================================================
      const maxBatches = 20; // Safety limit (20 batches × 2 = 40 panels max)
      
      for (let i = 0; i < maxBatches; i++) {
        const { data: batchData, error: batchError } = await supabase.functions.invoke('render-storyboard-batch', {
          body: { 
            scene_id: sceneId, 
            batch_size: 2,
            retry_errors: true,
          },
        });

        if (batchError) {
          console.warn(`Batch ${i + 1} error (retrying):`, batchError);
          // Don't break - wait and retry
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        // Refresh panels to show progress
        await fetchPanels();

        // Check if complete
        if (!batchData || batchData.processed === 0 || batchData.complete) {
          console.log(`Batch loop complete at iteration ${i + 1}`, batchData);
          break;
        }

        // Brief pause between batches
        await new Promise(r => setTimeout(r, 500));
      }

      // Final success message will be shown by the useEffect that monitors panelStatuses
      
    } catch (err) {
      console.error('Error in storyboard generation:', err);
      toast.error(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      setGenerating(false);
      setShowOverlay(false);
    }
  };

  const handleCancelGeneration = () => {
    // Note: actual cancellation would need backend support
    // For now, just hide overlay and let it finish in background
    setGenerating(false);
    setShowOverlay(false);
    toast.info('Generación cancelada');
  };

  const generatePanelImage = async (panel: StoryboardPanel) => {
    try {
      // Check for canvas format mismatch (validation)
      const panelCanvasFormat = (panel as any).canvas_format as CanvasFormat | null;
      if (panelCanvasFormat && canvasFormat) {
        const panelAspect = panelCanvasFormat.aspect_ratio;
        const currentAspect = canvasFormat.aspect_ratio;
        
        if (panelAspect !== currentAspect) {
          const proceed = window.confirm(
            `⚠️ ADVERTENCIA: Este panel fue creado en ${panelAspect} pero el proyecto ahora usa ${currentAspect}.\n\n` +
            `Regenerar creará una imagen con diferente composición.\n\n` +
            `¿Continuar de todas formas?`
          );
          if (!proceed) return;
        }
      }

      toast.info(`Generando imagen para panel ${panel.panel_no}...`);
      
      // Use dedicated regenerate-storyboard-panel function
      const { data, error } = await supabase.functions.invoke('regenerate-storyboard-panel', {
        body: {
          panelId: panel.id,
          prompt: panel.image_prompt,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Generation failed');

      toast.success(`Imagen generada para panel ${panel.panel_no}`);
      await fetchPanels();
    } catch (err) {
      console.error('Error generating panel image:', err);
      toast.error('Error al generar imagen');
    }
  };

  const updatePanel = async (panelId: string, updates: Partial<StoryboardPanel>) => {
    try {
      const { error } = await supabase
        .from('storyboard_panels')
        .update(updates)
        .eq('id', panelId);

      if (error) throw error;
      await fetchPanels();
    } catch (err) {
      console.error('Error updating panel:', err);
      toast.error('Error al actualizar panel');
    }
  };

  const toggleApproval = async (panel: StoryboardPanel) => {
    await updatePanel(panel.id, { approved: !panel.approved });
  };

  const approveAllPanels = async () => {
    try {
      const { error } = await supabase
        .from('storyboard_panels')
        .update({ approved: true })
        .eq('scene_id', sceneId);

      if (error) throw error;
      toast.success('Storyboard aprobado');
      await fetchPanels();
      onApproved?.();
    } catch (err) {
      console.error('Error approving storyboard:', err);
      toast.error('Error al aprobar storyboard');
    }
  };

  const movePanel = async (panel: StoryboardPanel, direction: 'up' | 'down') => {
    const currentIndex = panels.findIndex(p => p.id === panel.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= panels.length) return;

    const otherPanel = panels[newIndex];
    
    // Swap panel_no
    await Promise.all([
      updatePanel(panel.id, { panel_no: otherPanel.panel_no }),
      updatePanel(otherPanel.id, { panel_no: panel.panel_no }),
    ]);
  };

  const deletePanel = async (panelId: string) => {
    try {
      const { error } = await supabase
        .from('storyboard_panels')
        .delete()
        .eq('id', panelId);

      if (error) throw error;
      toast.success('Panel eliminado');
      await fetchPanels();
    } catch (err) {
      console.error('Error deleting panel:', err);
      toast.error('Error al eliminar panel');
    }
  };

  const handleExportPDF = async () => {
    if (panels.length === 0) {
      toast.error('No hay paneles para exportar');
      return;
    }
    
    setExporting(true);
    try {
      // Fetch scene info for slugline and project title
      const { data: scene } = await supabase
        .from('scenes')
        .select('slugline, scene_no, projects(title)')
        .eq('id', sceneId)
        .single();
      
      const projectData = scene?.projects as { title?: string } | null;
      
      await exportStoryboardVisualPDF({
        projectTitle: projectData?.title || 'Proyecto',
        sceneSlugline: scene?.slugline || '',
        sceneNo: scene?.scene_no || 1,
        panels: panels.map(p => ({
          panel_no: p.panel_no,
          panel_intent: p.panel_intent,
          shot_hint: p.shot_hint,
          image_url: p.image_url,
        })),
        canvasFormat: canvasFormat || undefined,
      });
      
      toast.success('Storyboard exportado como PDF');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Error al exportar PDF');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-lg" />
        ))}
      </div>
    );
  }

  // Helper to get panel status for badges
  const getPanelImageStatus = (panel: StoryboardPanel) => {
    const status = panelStatuses.find(s => s.panel_no === panel.panel_no);
    return status?.status || (panel.image_url ? 'success' : 'pending');
  };

  return (
    <div className="space-y-4">
      {/* Progress Overlay */}
      {generating && showOverlay && (
        <StoryboardGenerationOverlay
          totalPanels={totalPanels}
          currentPanel={currentPanel}
          panelStatuses={panelStatuses}
          currentPhase={currentPhase}
          progress={progress}
          elapsedSeconds={elapsedSeconds}
          estimatedRemainingMs={estimatedRemainingMs}
          onContinueInBackground={() => setShowOverlay(false)}
          onCancel={handleCancelGeneration}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Storyboard</h3>
          <Badge variant={panels.length > 0 ? 'secondary' : 'outline'}>
            {panels.length} paneles
          </Badge>
          {canvasFormat && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10">
              <Lock className="w-3 h-3 mr-1" />
              {canvasFormat.aspect_ratio} bloqueado
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* NEW: Style Preset Picker (4 differentiated styles) */}
          <StoryboardStylePicker
            selectedPresetId={selectedStylePreset}
            onSelectPreset={setSelectedStylePreset}
            isLocked={styleIsLocked}
            existingPanelCount={panels.length}
            onConfirmChange={() => {
              // Regenerate all panels with new style
              generateStoryboard();
            }}
          />
          
          {/* Layout Selector - GRID_SHEET vs TECH_PAGE */}
          <Select value={selectedStyle} onValueChange={(v) => setSelectedStyle(v as 'GRID_SHEET_V1' | 'TECH_PAGE_V1')}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <Pencil className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Layout" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GRID_SHEET_V1">
                Multipanel (6-9)
              </SelectItem>
              <SelectItem value="TECH_PAGE_V1">
                Técnica (4-6)
              </SelectItem>
            </SelectContent>
          </Select>
          
          {panels.length === 0 ? (
            <Button onClick={generateStoryboard} disabled={generating}>
              {generating ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Generar Storyboard
            </Button>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportPDF} 
                disabled={exporting || panels.length === 0}
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Exportar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={generateStoryboard} disabled={generating}>
                <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                Regenerar
              </Button>
              {!allApproved && (
                <Button size="sm" onClick={approveAllPanels}>
                  <Check className="w-4 h-4 mr-2" />
                  Aprobar Todo
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Panels Grid */}
      {panels.length > 0 ? (
        <ScrollArea className="h-[600px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pr-4">
            {panels.map((panel) => (
              <Card 
                key={panel.id} 
                className={`relative group ${panel.approved ? 'ring-2 ring-green-500' : ''}`}
              >
                <CardHeader className="p-3 pb-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Panel {panel.panel_no}
                      </Badge>
                    {/* Status Badge - Phase 4: Enhanced status display */}
                    {getPanelImageStatus(panel) === 'generating' && (
                      <Badge variant="secondary" className="text-xs animate-pulse">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Generando
                      </Badge>
                    )}
                    {getPanelImageStatus(panel) === 'pending_regen' && (
                      <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400 bg-amber-500/10 animate-pulse">
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        En cola QC
                      </Badge>
                    )}
                    {getPanelImageStatus(panel) === 'failed_safe' && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Intervención requerida
                      </Badge>
                    )}
                    {getPanelImageStatus(panel) === 'error' && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Error
                      </Badge>
                    )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => movePanel(panel, 'up')}
                        disabled={panel.panel_no === 1}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => movePanel(panel, 'down')}
                        disabled={panel.panel_no === panels.length}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => deletePanel(panel.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 space-y-2">
                  {/* Image */}
                  <div 
                    className="aspect-video bg-muted rounded-md flex items-center justify-center overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (panel.image_url) {
                        setSelectedImage({ url: panel.image_url, panelNo: panel.panel_no });
                      } else {
                        generatePanelImage(panel);
                      }
                    }}
                  >
                    {panel.image_url ? (
                      <img 
                        src={panel.image_url} 
                        alt={`Panel ${panel.panel_no}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-muted-foreground text-xs">
                        <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                        <span>Click para generar</span>
                      </div>
                    )}
                  </div>

                  {/* Identity QC Score Badge */}
                  {(() => {
                    const identityQc = (panel as any).identity_qc as IdentityQC | undefined;
                    if (!identityQc?.overall_score) return null;
                    const score = Math.round(identityQc.overall_score * 100);
                    const issues = Object.values(identityQc.characters || {})
                      .flatMap(c => c.issues || []);
                    
                    return (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge 
                          variant={identityQc.needs_regen ? 'destructive' : 'outline'}
                          className={`text-xs ${!identityQc.needs_regen ? 'border-green-500/50 text-green-400' : ''}`}
                        >
                          ID: {score}%
                        </Badge>
                        {issues.slice(0, 2).map((issue, i) => (
                          <Badge 
                            key={i} 
                            variant="outline" 
                            className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30"
                          >
                            {issue.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Shot Hint */}
                  <Badge variant="secondary" className="text-xs w-full justify-center">
                    {panel.shot_hint}
                  </Badge>

                  {/* Intent */}
                  {editingPanel === panel.id ? (
                    <Textarea
                      value={panel.panel_intent || ''}
                      onChange={(e) => {
                        const newPanels = panels.map(p => 
                          p.id === panel.id ? { ...p, panel_intent: e.target.value } : p
                        );
                        setPanels(newPanels);
                      }}
                      onBlur={() => {
                        updatePanel(panel.id, { panel_intent: panel.panel_intent });
                        setEditingPanel(null);
                      }}
                      className="text-xs"
                      rows={2}
                    />
                  ) : (
                    <p 
                      className="text-xs text-muted-foreground line-clamp-2 cursor-pointer hover:text-foreground"
                      onClick={() => setEditingPanel(panel.id)}
                    >
                      {panel.panel_intent}
                    </p>
                  )}

                  {/* Phase 4: Action buttons based on status */}
                  {(getPanelImageStatus(panel) === 'error' || 
                    getPanelImageStatus(panel) === 'failed_safe' ||
                    (panel as any).identity_qc?.needs_regen) ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => generatePanelImage(panel)}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Regenerar con corrección
                    </Button>
                  ) : (
                    <Button
                      variant={panel.approved ? 'default' : 'outline'}
                      size="sm"
                      className="w-full"
                      onClick={() => toggleApproval(panel)}
                    >
                      {panel.approved ? (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          Aprobado
                        </>
                      ) : (
                        'Aprobar'
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Film className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              No hay paneles de storyboard. Genera el storyboard para comenzar el proceso de producción.
            </p>
            <Button onClick={generateStoryboard} disabled={generating}>
              {generating ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Generar Storyboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Approval Status */}
      {allApproved && (
        <div className="flex items-center justify-center gap-2 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-500 font-medium">
            Storyboard aprobado - Listo para generar Documento Técnico
          </span>
        </div>
      )}

      {/* Pedagogical Message */}
      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-muted/50 rounded-lg border border-border/50">
        <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <p className="text-xs text-muted-foreground text-center">
          El storyboard es una herramienta de planificación cinematográfica. 
          No representa el resultado visual final.
        </p>
      </div>

      {/* Modal para ver imagen en grande */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl w-full p-2">
          <DialogTitle className="sr-only">
            Panel {selectedImage?.panelNo}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Vista ampliada del panel de storyboard
          </DialogDescription>
          {selectedImage && (
            <img 
              src={selectedImage.url} 
              alt={`Panel ${selectedImage.panelNo} - Vista ampliada`}
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
