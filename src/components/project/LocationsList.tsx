/**
 * LocationsList - MVP Clean UX for Locations
 * Single action per state, adapted by user level (Normal/Pro)
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { EntityCard, getEntityStatus, EntityStatus } from './EntityCard';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { useEntityProgress } from '@/hooks/useEntityProgress';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import NextStepNavigator from './NextStepNavigator';
import ProfilePreviewDialog from './ProfilePreviewDialog';
import {
  Plus,
  MapPin,
  Loader2,
  Search,
  PlayCircle,
  Trash2,
  Sun,
  Moon,
  Image,
  History,
  RefreshCw,
  Sparkles,
  Layers,
} from 'lucide-react';
import MultiAnglePreview, { AngleVariant } from './MultiAnglePreview';

interface LocationsListProps {
  projectId: string;
}

interface Location {
  id: string;
  name: string;
  description: string | null;
  variants: { day?: boolean; night?: boolean } | null;
  reference_urls: Record<string, string> | null;
  current_run_id?: string | null;
  accepted_run_id?: string | null;
  canon_asset_id?: string | null;
  // Generated images from runs
  current_run_image?: string | null;
  accepted_run_image?: string | null;
  canon_image?: string | null;
}

export default function LocationsList({ projectId }: LocationsListProps) {
  const { userLevel } = useEditorialKnowledgeBase({ projectId, assetType: 'location' });
  const isPro = userLevel === 'pro';
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();

  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  
  // Helpers for parallel generation
  const startGenerating = (id: string) => {
    setGeneratingIds(prev => new Set([...prev, id]));
  };
  const stopGenerating = (id: string) => {
    setGeneratingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const [generatingAll, setGeneratingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingFromScript, setImportingFromScript] = useState(false);
  const [scriptLocations, setScriptLocations] = useState<any[]>([]);
  const [enrichingAll, setEnrichingAll] = useState(false);

  // Profile preview state
  const [profilePreview, setProfilePreview] = useState<{
    location: Location;
    description: string;
    profileJson: any;
    isLoading: boolean;
    profileDetails?: {
      style?: string;
      timeOfDay?: string;
      locationType?: string;
    };
  } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hasDay: true,
    hasNight: true,
  });

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('locations')
      .select('id, name, description, variants, reference_urls, current_run_id, accepted_run_id, canon_asset_id')
      .eq('project_id', projectId)
      .order('created_at');

    if (data) {
      // Fetch generated images from runs
      const runIds = data.flatMap(l => [l.current_run_id, l.accepted_run_id].filter(Boolean)) as string[];
      const canonIds = data.map(l => l.canon_asset_id).filter(Boolean) as string[];
      
      let runImages: Record<string, string> = {};
      let canonImages: Record<string, string> = {};

      if (runIds.length > 0) {
        const { data: runs } = await supabase
          .from('generation_runs')
          .select('id, output_url')
          .in('id', runIds);
        if (runs) {
          runImages = Object.fromEntries(runs.filter(r => r.output_url).map(r => [r.id, r.output_url!]));
        }
      }

      if (canonIds.length > 0) {
        const { data: canons } = await supabase
          .from('canon_assets')
          .select('id, image_url')
          .in('id', canonIds);
        if (canons) {
          canonImages = Object.fromEntries(canons.filter(c => c.image_url).map(c => [c.id, c.image_url]));
        }
      }

      setLocations(data.map(l => ({
        ...l,
        variants: l.variants as Location['variants'],
        reference_urls: l.reference_urls as Record<string, string> | null,
        current_run_image: l.current_run_id ? runImages[l.current_run_id] : null,
        accepted_run_image: l.accepted_run_id ? runImages[l.accepted_run_id] : null,
        canon_image: l.canon_asset_id ? canonImages[l.canon_asset_id] : null,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLocations();
    fetchScriptLocations();
  }, [projectId]);

  const fetchScriptLocations = async () => {
    const { data: script } = await supabase
      .from('scripts')
      .select('parsed_json')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (script?.parsed_json) {
      const parsed = script.parsed_json as any;
      setScriptLocations(parsed.locations || parsed.main_locations || []);
    }
  };

  const handleImportFromScript = async () => {
    if (!scriptLocations.length) {
      toast.error('No hay localizaciones en el guion para importar');
      return;
    }

    setImportingFromScript(true);
    let insertedCount = 0;
    
    try {
      const { data: existingLocs } = await supabase
        .from('locations')
        .select('name')
        .eq('project_id', projectId);
      const existingNames = new Set((existingLocs || []).map(l => l.name.toLowerCase()));

      for (const loc of scriptLocations) {
        if (!loc.name || existingNames.has(loc.name.toLowerCase())) continue;
        
        const { error } = await supabase.from('locations').insert({
          project_id: projectId,
          name: loc.name,
          description: loc.description || loc.type || null,
          variants: { day: true, night: true },
        });
        
        if (!error) {
          insertedCount++;
          existingNames.add(loc.name.toLowerCase());
        }
      }

      if (insertedCount > 0) {
        toast.success(`${insertedCount} localizaciones importadas del guion`);
        fetchLocations();
      } else {
        toast.info('Todas las localizaciones del guion ya estaban importadas');
      }
    } catch (err) {
      console.error('Error importing locations:', err);
      toast.error('Error al importar localizaciones');
    } finally {
      setImportingFromScript(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', hasDay: true, hasNight: true });
  };

  const handleAddLocation = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('locations').insert({
      project_id: projectId,
      name: formData.name.trim(),
      description: formData.description || null,
      variants: { day: formData.hasDay, night: formData.hasNight },
    });

    if (error) {
      toast.error('Error al añadir localización');
    } else {
      toast.success('Localización añadida');
      resetForm();
      setShowAddDialog(false);
      fetchLocations();
    }
    setSaving(false);
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm('¿Eliminar esta localización?')) return;
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Localización eliminada');
      fetchLocations();
    }
  };

  // Primary action handler based on status
  const handlePrimaryAction = async (location: Location) => {
    const status = getEntityStatus(location.current_run_id, location.accepted_run_id, location.canon_asset_id);

    switch (status) {
      case 'not_generated':
        // Show preview dialog for locations without description
        await handleGenerateWithPreview(location);
        break;
      case 'generated':
        await handleAccept(location);
        break;
      case 'accepted':
        await handleSetCanon(location);
        break;
      case 'canon':
        await handleRegenerate(location);
        break;
    }
  };

  // Build rich description from entity-builder profile
  const buildDescriptionFromProfile = (profile: any): string => {
    if (!profile) return '';
    
    const parts: string[] = [];
    
    if (profile.location_type) parts.push(profile.location_type.replace(/_/g, ' '));
    if (profile.arch_style) parts.push(`${profile.arch_style.replace(/_/g, ' ')} architecture`);
    if (profile.materials?.length) parts.push(`materials: ${profile.materials.slice(0, 5).join(', ')}`);
    if (profile.set_dressing_fixed?.length) parts.push(`featuring ${profile.set_dressing_fixed.slice(0, 8).join(', ')}`);
    if (profile.lighting_logic?.motivation) parts.push(`${profile.lighting_logic.motivation.replace(/_/g, ' ')} lighting`);
    if (profile.color_palette) parts.push(`color palette: ${profile.color_palette}`);
    
    return parts.join('. ');
  };

  // Extract time of day from location name
  const extractTimeFromName = (name: string): string => {
    const upper = name.toUpperCase();
    if (upper.includes('NOCHE') || upper.includes('NIGHT')) return 'night';
    if (upper.includes('AMANECER') || upper.includes('DAWN')) return 'dawn';
    if (upper.includes('ATARDECER') || upper.includes('DUSK') || upper.includes('TARDE')) return 'dusk';
    return 'day';
  };

  // Determine if location is interior
  const isInteriorLocation = (name: string): boolean => {
    const upper = name.toUpperCase();
    if (upper.includes('INT.') || upper.includes('INT ')) return true;
    if (upper.includes('EXT.') || upper.includes('EXT ')) return false;
    // Default interior for common interior words
    return upper.match(/(HABITACIÓN|OFICINA|COCINA|BAÑO|SALA|COMEDOR|DORMITORIO|APARTAMENTO|CASA|PISO|HOTEL|BAR|RESTAURANTE|HOSPITAL|TIENDA)/i) !== null;
  };

  // Generate profile and show preview dialog
  const handleGenerateWithPreview = async (location: Location) => {
    let description = (location.description || '').trim();
    
    // If already has description, generate directly
    if (description) {
      await handleGenerateImage(location, description);
      return;
    }

    // Show loading state in preview dialog
    setProfilePreview({
      location,
      description: '',
      profileJson: null,
      isLoading: true,
    });

    try {
      const cleanName = location.name
        .replace(/[-–]\s*(MAÑANA|TARDE|NOCHE|DÍA|CONTINÚA|CONTINUOUS|DAY|NIGHT|DAWN|DUSK)/gi, '')
        .replace(/^(INT\.|EXT\.|INT |EXT )/i, '')
        .trim();
      
      const timeOfDay = extractTimeFromName(location.name);
      const isInterior = isInteriorLocation(location.name);
      
      // Fetch project visual style
      const { data: projectData } = await supabase
        .from('projects')
        .select('visual_style, animation_type, bible')
        .eq('id', projectId)
        .single();
      
      const visualStyle = (projectData as any)?.visual_style || 'realistic';
      const animationType = (projectData as any)?.animation_type || 'live_action';
      const bible = (projectData as any)?.bible;
      
      const { data: profileData, error: profileError } = await supabase.functions.invoke('entity-builder', {
        body: {
          entityType: 'location',
          name: cleanName,
          context: {
            timeOfDay,
            locationType: isInterior ? 'interior' : 'exterior',
            projectId,
          },
          projectStyle: {
            genre: bible?.genre || bible?.projectType || 'Drama',
            tone: bible?.tone || 'Cinematográfico',
            visualStyle,
            animationType,
            realism_level: visualStyle,
          },
        },
      });
      
      if (!profileError && (profileData?.entity?.profile || profileData?.profile)) {
        const profile = profileData?.entity?.profile || profileData?.profile;
        const generatedDescription = buildDescriptionFromProfile(profile);
        
        setProfilePreview({
          location,
          description: generatedDescription,
          profileJson: profileData?.entity || profileData,
          isLoading: false,
          profileDetails: {
            style: visualStyle,
            timeOfDay,
            locationType: isInterior ? 'Interior' : 'Exterior',
          },
        });
      } else {
        // Fallback description
        const fallbackDescription = `${isInterior ? 'Interior' : 'Exterior'} - ${cleanName}. ${
          timeOfDay === 'night' ? 'Escena nocturna.' : 
          timeOfDay === 'dusk' ? 'Iluminación de atardecer.' : 
          timeOfDay === 'dawn' ? 'Luz de amanecer.' : 
          'Luz diurna.'
        }`;
        
        setProfilePreview({
          location,
          description: fallbackDescription,
          profileJson: null,
          isLoading: false,
          profileDetails: {
            style: visualStyle,
            timeOfDay,
            locationType: isInterior ? 'Interior' : 'Exterior',
          },
        });
      }
    } catch (err) {
      console.error('Profile generation error:', err);
      const timeOfDay = extractTimeFromName(location.name);
      const isInterior = isInteriorLocation(location.name);
      const cleanName = location.name
        .replace(/[-–]\s*(MAÑANA|TARDE|NOCHE|DÍA|CONTINÚA|CONTINUOUS|DAY|NIGHT|DAWN|DUSK)/gi, '')
        .replace(/^(INT\.|EXT\.|INT |EXT )/i, '')
        .trim();
      
      setProfilePreview({
        location,
        description: `${isInterior ? 'Interior' : 'Exterior'} - ${cleanName}. Escenario cinematográfico.`,
        profileJson: null,
        isLoading: false,
        profileDetails: {
          timeOfDay,
          locationType: isInterior ? 'Interior' : 'Exterior',
        },
      });
    }
  };

  // Confirm profile and generate image
  const handleConfirmProfileAndGenerate = async (editedDescription: string) => {
    if (!profilePreview) return;
    
    const location = profilePreview.location;
    const profileJson = profilePreview.profileJson;
    
    // Save edited description to location
    await supabase.from('locations').update({
      description: editedDescription,
      profile_json: profileJson,
    }).eq('id', location.id);
    
    setProfilePreview(null);
    
    // Now generate image with the confirmed description
    await handleGenerateImage(location, editedDescription, profileJson);
  };

  // Generate image with a given description
  const handleGenerateImage = async (location: Location, description: string, profileJson?: any) => {
    startGenerating(location.id);
    
    const taskId = addTask({
      type: 'location_generation',
      title: `Generando ${location.name}`,
      projectId,
      entityId: location.id,
      entityName: location.name,
    });

    try {
      updateTask(taskId, { progress: 40, description: 'Generando imagen...' });
      
      const prompt = description || location.name;
      const timeOfDay = extractTimeFromName(location.name);
      
      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'location',
          phase: 'exploration',
          engine: 'fal-ai/flux-pro/v1.1-ultra',
          engineSelectedBy: 'auto',
          prompt,
          context: `Location: ${location.name}`,
          params: {
            locationName: location.name,
            viewAngle: 'establishing',
            timeOfDay,
            weather: 'clear',
            profileJson,
          },
        },
      });

      if (error) throw error;

      updateTask(taskId, { progress: 90, description: 'Guardando resultado...' });

      if (data?.runId) {
        await supabase.from('locations').update({ current_run_id: data.runId }).eq('id', location.id);
      }

      completeTask(taskId, data);
      toast.success(`${location.name} generada`);
      fetchLocations();
    } catch (err) {
      console.error('Generation error:', err);
      failTask(taskId, err instanceof Error ? err.message : 'Error al generar');
      toast.error(`Error al generar ${location.name}`);
    } finally {
      stopGenerating(location.id);
    }
  };

  // Legacy handleGenerate for "Generate All" (no preview, direct generation)
  const handleGenerate = async (location: Location) => {
    startGenerating(location.id);
    
    const taskId = addTask({
      type: 'location_generation',
      title: `Generando ${location.name}`,
      projectId,
      entityId: location.id,
      entityName: location.name,
    });

    try {
      updateTask(taskId, { progress: 5, description: 'Analizando ubicación...' });
      
      let description = (location.description || '').trim();
      let profileJson = null;
      
      if (!description) {
        updateTask(taskId, { progress: 15, description: 'Generando perfil visual...' });
        
        const cleanName = location.name
          .replace(/[-–]\s*(MAÑANA|TARDE|NOCHE|DÍA|CONTINÚA|CONTINUOUS|DAY|NIGHT|DAWN|DUSK)/gi, '')
          .replace(/^(INT\.|EXT\.|INT |EXT )/i, '')
          .trim();
        
        const timeOfDay = extractTimeFromName(location.name);
        const isInterior = isInteriorLocation(location.name);
        
        const { data: projectData } = await supabase
          .from('projects')
          .select('visual_style, animation_type, bible')
          .eq('id', projectId)
          .single();
        
        const visualStyle = (projectData as any)?.visual_style || 'realistic';
        const animationType = (projectData as any)?.animation_type || 'live_action';
        const bible = (projectData as any)?.bible;
        
        try {
          const { data: profileData, error: profileError } = await supabase.functions.invoke('entity-builder', {
            body: {
              entityType: 'location',
              name: cleanName,
              context: {
                timeOfDay,
                locationType: isInterior ? 'interior' : 'exterior',
                projectId,
              },
              projectStyle: {
                genre: bible?.genre || bible?.projectType || 'Drama',
                tone: bible?.tone || 'Cinematográfico',
                visualStyle,
                animationType,
                realism_level: visualStyle,
              },
            },
          });
          
          if (!profileError && (profileData?.entity?.profile || profileData?.profile)) {
            const profile = profileData?.entity?.profile || profileData?.profile;
            profileJson = profile;
            description = buildDescriptionFromProfile(profile);
            
            await supabase.from('locations').update({
              description,
              profile_json: profileData?.entity || profileData,
            }).eq('id', location.id);
          }
        } catch (profileErr) {
          console.warn('Could not generate profile, creating fallback description:', profileErr);
          
          const fallbackDescription = `${isInterior ? 'Interior' : 'Exterior'} - ${cleanName}. ${
            timeOfDay === 'night' ? 'Escena nocturna.' : 
            timeOfDay === 'dusk' ? 'Iluminación de atardecer.' : 
            timeOfDay === 'dawn' ? 'Luz de amanecer.' : 
            'Luz diurna.'
          }`;
          
          description = fallbackDescription;
          
          await supabase.from('locations').update({
            description: fallbackDescription,
          }).eq('id', location.id);
        }
      }
      
      const prompt = description || location.name;
      const timeOfDay = extractTimeFromName(location.name);

      updateTask(taskId, { progress: 40, description: 'Generando imagen...' });
      
      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'location',
          phase: 'exploration',
          engine: 'fal-ai/flux-pro/v1.1-ultra',
          engineSelectedBy: 'auto',
          prompt,
          context: `Location: ${location.name}`,
          params: {
            locationName: location.name,
            viewAngle: 'establishing',
            timeOfDay,
            weather: 'clear',
            profileJson,
          },
        },
      });

      if (error) throw error;

      updateTask(taskId, { progress: 90, description: 'Guardando resultado...' });

      if (data?.runId) {
        await supabase.from('locations').update({ current_run_id: data.runId }).eq('id', location.id);
      }

      completeTask(taskId, data);
      toast.success(`${location.name} generada`);
      fetchLocations();
    } catch (err) {
      console.error('Generation error:', err);
      failTask(taskId, err instanceof Error ? err.message : 'Error al generar');
      toast.error(`Error al generar ${location.name}`);
    } finally {
      stopGenerating(location.id);
    }
  };

  // Enrich all locations: regenerate profiles for all existing locations
  const handleEnrichAllLocations = async () => {
    const toEnrich = locations.filter(l => !l.description?.trim());
    if (toEnrich.length === 0) {
      toast.info('Todas las localizaciones ya tienen descripción');
      return;
    }

    if (!confirm(`¿Enriquecer ${toEnrich.length} localizaciones con perfiles IA? Esto regenerará sus descripciones.`)) return;

    setEnrichingAll(true);
    toast.info(`Enriqueciendo ${toEnrich.length} localizaciones...`);
    
    // Fetch project style once
    const { data: projectData } = await supabase
      .from('projects')
      .select('visual_style, animation_type, bible')
      .eq('id', projectId)
      .single();
    
    const visualStyle = (projectData as any)?.visual_style || 'realistic';
    const animationType = (projectData as any)?.animation_type || 'live_action';
    const bible = (projectData as any)?.bible;

    let successCount = 0;
    let errorCount = 0;

    for (const location of toEnrich) {
      try {
        const cleanName = location.name
          .replace(/[-–]\s*(MAÑANA|TARDE|NOCHE|DÍA|CONTINÚA|CONTINUOUS|DAY|NIGHT|DAWN|DUSK)/gi, '')
          .replace(/^(INT\.|EXT\.|INT |EXT )/i, '')
          .trim();
        
        const timeOfDay = extractTimeFromName(location.name);
        const isInterior = isInteriorLocation(location.name);
        
        const { data: profileData, error: profileError } = await supabase.functions.invoke('entity-builder', {
          body: {
            entityType: 'location',
            name: cleanName,
            context: {
              timeOfDay,
              locationType: isInterior ? 'interior' : 'exterior',
              projectId,
            },
            projectStyle: {
              genre: bible?.genre || bible?.projectType || 'Drama',
              tone: bible?.tone || 'Cinematográfico',
              visualStyle,
              animationType,
              realism_level: visualStyle,
            },
          },
        });
        
        if (!profileError && (profileData?.entity?.profile || profileData?.profile)) {
          const profile = profileData?.entity?.profile || profileData?.profile;
          const description = buildDescriptionFromProfile(profile);
          
          await supabase.from('locations').update({
            description,
            profile_json: profileData?.entity || profileData,
          }).eq('id', location.id);
          
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        console.error(`Error enriching ${location.name}:`, err);
        errorCount++;
      }
    }

    setEnrichingAll(false);
    fetchLocations();
    
    if (successCount > 0) {
      toast.success(`${successCount} localizaciones enriquecidas`);
    }
    if (errorCount > 0) {
      toast.warning(`${errorCount} localizaciones no pudieron ser enriquecidas`);
    }
  };
  const handleAccept = async (location: Location) => {
    if (!location.current_run_id) return;

    try {
      await supabase.from('locations').update({ accepted_run_id: location.current_run_id }).eq('id', location.id);
      await supabase.from('generation_runs').update({ verdict: 'approved' }).eq('id', location.current_run_id);
      toast.success('Localización aceptada');
      fetchLocations();
    } catch (err) {
      toast.error('Error al aceptar');
    }
  };

  const handleSetCanon = async (location: Location) => {
    if (!location.accepted_run_id) return;

    try {
      const { data: run } = await supabase
        .from('generation_runs')
        .select('output_url')
        .eq('id', location.accepted_run_id)
        .single();

      if (!run?.output_url) {
        toast.error('No hay imagen para fijar como canon');
        return;
      }

      const { data: canonAsset, error: canonError } = await supabase
        .from('canon_assets')
        .insert({
          project_id: projectId,
          asset_type: 'location',
          name: location.name,
          image_url: run.output_url,
          run_id: location.accepted_run_id || null,
          is_active: true,
        })
        .select()
        .single();

      if (canonError) throw canonError;

      await supabase.from('locations').update({ canon_asset_id: canonAsset.id }).eq('id', location.id);
      await supabase.from('generation_runs').update({ is_canon: true }).eq('id', location.accepted_run_id);

      toast.success('⭐ Fijado como referencia oficial');
      fetchLocations();
    } catch (err) {
      console.error('Canon error:', err);
      toast.error('Error al fijar como canon');
    }
  };

  const handleRegenerate = async (location: Location) => {
    startGenerating(location.id);
    
    // Register task in the global background task system
    const taskId = addTask({
      type: 'location_generation',
      title: `Nueva variante: ${location.name}`,
      projectId,
      entityId: location.id,
      entityName: location.name,
    });

    try {
      updateTask(taskId, { progress: 10, description: 'Preparando regeneración...' });
      
      const prompt = (location.description || '').trim() || location.name;

      updateTask(taskId, { progress: 30, description: 'Generando nueva variante...' });

      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'location',
          phase: 'exploration',
          engine: 'fal-ai/flux-pro/v1.1-ultra',
          engineSelectedBy: 'auto',
          prompt,
          context: `Location: ${location.name}`,
          parentRunId: location.accepted_run_id,
          params: {
            locationName: location.name,
            viewAngle: 'establishing',
            timeOfDay: 'day',
            weather: 'clear',
          },
        },
      });

      if (error) throw error;

      updateTask(taskId, { progress: 90, description: 'Guardando resultado...' });

      if (data?.runId) {
        await supabase.from('locations').update({ current_run_id: data.runId }).eq('id', location.id);
      }

      completeTask(taskId, data);
      toast.success(`Nueva variante de ${location.name} generada`);
      fetchLocations();
    } catch (err) {
      failTask(taskId, err instanceof Error ? err.message : 'Error al regenerar');
      toast.error(`Error al regenerar ${location.name}`);
    } finally {
      stopGenerating(location.id);
    }
  };
  const handleGenerateAll = async () => {
    const toGenerate = locations.filter(l => !l.current_run_id);
    if (toGenerate.length === 0) {
      toast.info('Todas las localizaciones ya tienen generación');
      return;
    }

    if (!confirm(`¿Generar ${toGenerate.length} localizaciones en paralelo?`)) return;

    setGeneratingAll(true);
    toast.info(`Iniciando generación de ${toGenerate.length} localizaciones...`);
    
    // Parallel generation with Promise.allSettled
    await Promise.allSettled(
      toGenerate.map(loc => handleGenerate(loc))
    );
    
    setGeneratingAll(false);
    toast.success('Generación masiva completada');
  };

  // Get first image URL from reference_urls
  const getLocationImage = (location: Location): string | null => {
    if (location.reference_urls) {
      const urls = Object.values(location.reference_urls);
      return urls.length > 0 ? urls[0] : null;
    }
    return null;
  };

  const filteredLocations = locations.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Localizaciones</h2>
          <p className="text-sm text-muted-foreground">Define los escenarios de tu producción</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scriptLocations.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleImportFromScript} disabled={importingFromScript}>
              {importingFromScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Importar del Guion ({scriptLocations.length})</span>
              <span className="ml-2 sm:hidden">Importar ({scriptLocations.length})</span>
            </Button>
          )}
          {locations.length > 0 && locations.some(l => !l.description?.trim()) && (
            <Button variant="outline" size="sm" onClick={handleEnrichAllLocations} disabled={enrichingAll}>
              {enrichingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Enriquecer</span>
            </Button>
          )}
          {locations.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleGenerateAll} disabled={generatingAll}>
              {generatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Generar Todas</span>
              <span className="ml-2 sm:hidden">Todas</span>
            </Button>
          )}
          <Button variant="gold" size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4" />
            <span className="ml-2 hidden sm:inline">Añadir Localización</span>
            <span className="ml-2 sm:hidden">Añadir</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      {locations.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar localizaciones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Location list */}
      <div className="space-y-3">
        {locations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay localizaciones aún</h3>
              <p className="text-muted-foreground mb-4">
                {scriptLocations.length > 0 
                  ? `Hay ${scriptLocations.length} localizaciones detectadas en tu guion. Impórtalas para comenzar.`
                  : 'Añade localizaciones para definir los escenarios'}
              </p>
              <div className="flex gap-2 justify-center">
                {scriptLocations.length > 0 && (
                  <Button variant="gold" onClick={handleImportFromScript} disabled={importingFromScript}>
                    {importingFromScript ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MapPin className="w-4 h-4 mr-2" />}
                    Importar del Guion
                  </Button>
                )}
                <Button variant={scriptLocations.length > 0 ? "outline" : "gold"} onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Manualmente
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : filteredLocations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin resultados</h3>
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Limpiar búsqueda
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredLocations.map(location => {
            // Get best available image: canon > accepted > current > reference
            const displayImage = location.canon_image || location.accepted_run_image || location.current_run_image || getLocationImage(location);
            
            return (
            <EntityCard
              key={location.id}
              id={location.id}
              name={location.name}
              description={location.description}
              imageUrl={displayImage}
              placeholderIcon={<MapPin className="w-6 h-6" />}
              status={getEntityStatus(location.current_run_id, location.accepted_run_id, location.canon_asset_id)}
              isExpanded={expandedId === location.id}
              isGenerating={generatingIds.has(location.id)}
              isPro={isPro}
              onToggleExpand={() => setExpandedId(expandedId === location.id ? null : location.id)}
              onPrimaryAction={() => handlePrimaryAction(location)}
              badges={
                <div className="flex gap-1">
                  {location.variants?.day && <Sun className="w-3 h-3 text-yellow-500" />}
                  {location.variants?.night && <Moon className="w-3 h-3 text-blue-400" />}
                </div>
              }
              expandedContent={
                <div className="space-y-4">
                  {/* Visual preview - show generated image */}
                  <div className="space-y-3">
                    {displayImage && (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={displayImage}
                          alt={location.name}
                          className="max-w-[350px] rounded-lg border shadow-sm"
                        />
                        <Badge variant={location.canon_image ? 'pass' : location.accepted_run_image ? 'secondary' : 'outline'} className="text-xs">
                          {location.canon_image ? '⭐ Aprobado' : location.accepted_run_image ? '✓ Aceptada' : location.current_run_image ? 'Pendiente de revisión' : 'Referencia'}
                        </Badge>
                      </div>
                    )}
                    
                    {/* Show pending vs accepted if different */}
                    {location.current_run_image && location.accepted_run_image && location.current_run_image !== location.accepted_run_image && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center">
                          <img src={location.accepted_run_image} alt="Aceptada" className="w-full rounded-lg border" />
                          <span className="text-xs text-muted-foreground mt-1">Aceptada</span>
                        </div>
                        <div className="text-center">
                          <img src={location.current_run_image} alt="Nueva generación" className="w-full rounded-lg border border-primary" />
                          <span className="text-xs text-primary mt-1">Nueva variante</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Descripción</Label>
                    <p className="text-sm">{location.description || 'Sin descripción'}</p>
                  </div>

                  {/* Variants info */}
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm">{location.variants?.day ? 'Día disponible' : 'Sin día'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4 text-blue-400" />
                      <span className="text-sm">{location.variants?.night ? 'Noche disponible' : 'Sin noche'}</span>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 flex-wrap">
                    {location.current_run_id && !location.accepted_run_id && (
                      <Button variant="outline" size="sm" onClick={() => handleRegenerate(location)}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Regenerar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteLocation(location.id)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              }
              advancedContent={
                <div className="space-y-4">
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">ID</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{location.id.slice(0, 8)}...</code>
                    </div>
                    {location.current_run_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Run ID</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{location.current_run_id.slice(0, 8)}...</code>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled>
                      <Image className="w-4 h-4 mr-2" />
                      Ver pack completo
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      <History className="w-4 h-4 mr-2" />
                      Historial
                    </Button>
                  </div>
                </div>
              }
            />
          );
          })
        )}
      </div>

      {/* Add Location Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir Localización</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre de la localización"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe el escenario..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Variantes de iluminación</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.hasDay}
                    onCheckedChange={(c) => setFormData({ ...formData, hasDay: !!c })}
                  />
                  <Sun className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm">Día</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.hasNight}
                    onCheckedChange={(c) => setFormData({ ...formData, hasNight: !!c })}
                  />
                  <Moon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">Noche</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleAddLocation} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Añadir Localización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Next Step Navigator - show when there are locations with canon status */}
      {locations.length > 0 && locations.some(l => l.canon_asset_id || l.accepted_run_id) && (
        <NextStepNavigator
          projectId={projectId}
          currentStep="locations"
          completionMessage="¡Localizaciones definidas!"
          stats={`${locations.filter(l => l.canon_asset_id || l.accepted_run_id).length}/${locations.length} listas`}
        />
      )}

      {/* Profile Preview Dialog */}
      <ProfilePreviewDialog
        open={!!profilePreview}
        onOpenChange={(open) => !open && setProfilePreview(null)}
        entityName={profilePreview?.location.name || ''}
        entityType="location"
        generatedDescription={profilePreview?.description || ''}
        profileDetails={profilePreview?.profileDetails}
        isLoading={profilePreview?.isLoading}
        onConfirm={handleConfirmProfileAndGenerate}
        onCancel={() => setProfilePreview(null)}
        onRegenerate={() => profilePreview && handleGenerateWithPreview(profilePreview.location)}
      />
    </div>
  );
}
