/**
 * useEditorialMVP - SIMPLIFIED
 * editorial_projects and asset_* tables removed. This hook now returns empty data.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

export interface EditorialProject {
  id: string;
  name: string;
  phase: 'ideation' | 'development' | 'production' | 'post';
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetCharacter {
  id: string;
  projectId: string;
  name: string;
  traitsText: string;
  referenceImageUrl?: string;
  fixedTraits?: string[];
}

export interface AssetLocation {
  id: string;
  projectId: string;
  name: string;
  traitsText: string;
  referenceImageUrl?: string;
  fixedElements?: string[];
}

export function useEditorialMVP() {
  const { user } = useAuth();
  const [projects] = useState<EditorialProject[]>([]);
  const [currentProject, setCurrentProject] = useState<EditorialProject | null>(null);
  const [characters] = useState<AssetCharacter[]>([]);
  const [locations] = useState<AssetLocation[]>([]);
  const [loading] = useState(false);

  // No-op functions - tables removed
  const loadProjects = useCallback(async () => {
    console.log('[useEditorialMVP] editorial_projects table removed');
  }, []);

  const loadProject = useCallback(async (id: string) => {
    console.log('[useEditorialMVP] editorial_projects table removed');
  }, []);

  const loadCharacters = useCallback(async (projId: string) => {
    console.log('[useEditorialMVP] asset_characters table removed');
  }, []);

  const loadLocations = useCallback(async (projId: string) => {
    console.log('[useEditorialMVP] asset_locations table removed');
  }, []);

  const createProject = useCallback(async (name: string) => {
    console.log('[useEditorialMVP] editorial_projects table removed');
    return null;
  }, []);

  const updateProjectPhase = useCallback(async (id: string, phase: EditorialProject['phase']) => {
    console.log('[useEditorialMVP] editorial_projects table removed');
  }, []);

  const saveCharacter = useCallback(async (char: Partial<AssetCharacter> & { projectId: string; name: string }) => {
    console.log('[useEditorialMVP] asset_characters table removed');
    return null;
  }, []);

  const saveLocation = useCallback(async (loc: Partial<AssetLocation> & { projectId: string; name: string }) => {
    console.log('[useEditorialMVP] asset_locations table removed');
    return null;
  }, []);

  const deleteCharacter = useCallback(async (id: string) => {
    console.log('[useEditorialMVP] asset_characters table removed');
  }, []);

  const deleteLocation = useCallback(async (id: string) => {
    console.log('[useEditorialMVP] asset_locations table removed');
  }, []);

  return {
    projects,
    currentProject,
    characters,
    locations,
    loading,
    loadProjects,
    loadProject,
    loadCharacters,
    loadLocations,
    createProject,
    updateProjectPhase,
    saveCharacter,
    saveLocation,
    deleteCharacter,
    deleteLocation,
    setCurrentProject,
  };
}
