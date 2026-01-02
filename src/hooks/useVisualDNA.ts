import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VisualDNAVersion {
  id: string;
  character_id: string;
  version: number;
  version_name: string;
  is_active: boolean;
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  visual_dna: any;
  continuity_lock: {
    never_change: string[];
    allowed_variants: Array<{ field_path: string; allowed_values: string[]; context: string }>;
    must_avoid: string[];
    version_notes: string;
  };
  created_at: string;
  updated_at: string;
}

export function useVisualDNA(characterId: string) {
  const [activeVersion, setActiveVersion] = useState<VisualDNAVersion | null>(null);
  const [allVersions, setAllVersions] = useState<VisualDNAVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch all versions for this character
  const fetchVersions = useCallback(async () => {
    if (!characterId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('character_visual_dna')
        .select('*')
        .eq('character_id', characterId)
        .order('version', { ascending: false });

      if (error) throw error;

      const versions = (data || []) as unknown as VisualDNAVersion[];
      setAllVersions(versions);
      
      const active = versions.find(v => v.is_active) || versions[0] || null;
      setActiveVersion(active);
    } catch (error) {
      console.error('Error fetching visual DNA:', error);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Save visual DNA (create new version or update existing)
  const saveVisualDNA = async (
    visualDna: any, 
    options?: { 
      createNewVersion?: boolean; 
      versionName?: string;
      continuityLock?: VisualDNAVersion['continuity_lock'];
    }
  ) => {
    setSaving(true);
    try {
      if (options?.createNewVersion) {
        // Create new version using database function
        const { data, error } = await supabase.rpc('create_visual_dna_version', {
          char_id: characterId,
          new_version_name: options.versionName || `Version ${allVersions.length + 1}`,
          modifications: visualDna
        });

        if (error) throw error;
        toast.success('Nueva versión de Visual DNA creada');
      } else if (activeVersion) {
        // Update existing version
        const { error } = await supabase
          .from('character_visual_dna')
          .update({ 
            visual_dna: visualDna,
            ...(options?.continuityLock && { continuity_lock: options.continuityLock }),
            updated_at: new Date().toISOString()
          })
          .eq('id', activeVersion.id);

        if (error) throw error;
        toast.success('Visual DNA guardado');
      } else {
        // Create first version
        const { error } = await supabase
          .from('character_visual_dna')
          .insert({
            character_id: characterId,
            version: 1,
            version_name: 'default',
            is_active: true,
            visual_dna: visualDna,
            continuity_lock: options?.continuityLock || {
              never_change: [],
              allowed_variants: [],
              must_avoid: [],
              version_notes: ''
            }
          });

        if (error) throw error;
        toast.success('Visual DNA creado');
      }

      await fetchVersions();
    } catch (error) {
      console.error('Error saving visual DNA:', error);
      toast.error('Error al guardar Visual DNA');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Switch to a different version
  const switchVersion = async (versionId: string) => {
    try {
      // Deactivate all versions
      await supabase
        .from('character_visual_dna')
        .update({ is_active: false })
        .eq('character_id', characterId);

      // Activate selected version
      const { error } = await supabase
        .from('character_visual_dna')
        .update({ is_active: true })
        .eq('id', versionId);

      if (error) throw error;

      // Update character reference
      await supabase
        .from('characters')
        .update({ active_visual_dna_id: versionId })
        .eq('id', characterId);

      await fetchVersions();
      toast.success('Versión activada');
    } catch (error) {
      console.error('Error switching version:', error);
      toast.error('Error al cambiar versión');
    }
  };

  // Approve version
  const approveVersion = async (versionId: string, approvedBy: string) => {
    try {
      const { error } = await supabase
        .from('character_visual_dna')
        .update({ 
          approved: true, 
          approved_by: approvedBy,
          approved_at: new Date().toISOString()
        })
        .eq('id', versionId);

      if (error) throw error;
      await fetchVersions();
      toast.success('Visual DNA aprobado');
    } catch (error) {
      console.error('Error approving version:', error);
      toast.error('Error al aprobar');
    }
  };

  // Update continuity lock
  const updateContinuityLock = async (lock: VisualDNAVersion['continuity_lock']) => {
    if (!activeVersion) return;

    try {
      const { error } = await supabase
        .from('character_visual_dna')
        .update({ continuity_lock: lock })
        .eq('id', activeVersion.id);

      if (error) throw error;
      await fetchVersions();
      toast.success('Continuity lock actualizado');
    } catch (error) {
      console.error('Error updating continuity lock:', error);
      toast.error('Error al actualizar lock');
    }
  };

  return {
    activeVersion,
    allVersions,
    loading,
    saving,
    saveVisualDNA,
    switchVersion,
    approveVersion,
    updateContinuityLock,
    refetch: fetchVersions
  };
}
