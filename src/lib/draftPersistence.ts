/**
 * Draft Persistence System
 * Centralizes auto-save/restore for all project workflows
 * Borradores se guardan en localStorage y pueden recuperarse
 */

export type DraftType = 
  | 'script_idea'
  | 'script_upload'
  | 'character'
  | 'location'
  | 'scene'
  | 'outline'
  | 'generation_config';

export interface Draft<T = unknown> {
  type: DraftType;
  projectId: string;
  entityId?: string;
  data: T;
  savedAt: string;
  version: number;
}

const DRAFT_PREFIX = 'draft_v2_';
const MAX_DRAFTS_PER_PROJECT = 50;

/**
 * Generate storage key for a draft
 */
function getDraftKey(type: DraftType, projectId: string, entityId?: string): string {
  const base = `${DRAFT_PREFIX}${type}_${projectId}`;
  return entityId ? `${base}_${entityId}` : base;
}

/**
 * Save a draft to localStorage
 */
export function saveDraft<T>(
  type: DraftType,
  projectId: string,
  data: T,
  entityId?: string
): void {
  try {
    const key = getDraftKey(type, projectId, entityId);
    const draft: Draft<T> = {
      type,
      projectId,
      entityId,
      data,
      savedAt: new Date().toISOString(),
      version: 1,
    };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    console.warn('[DraftPersistence] Failed to save draft:', e);
  }
}

/**
 * Load a draft from localStorage
 */
export function loadDraft<T>(
  type: DraftType,
  projectId: string,
  entityId?: string
): Draft<T> | null {
  try {
    const key = getDraftKey(type, projectId, entityId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as Draft<T>;
  } catch (e) {
    console.warn('[DraftPersistence] Failed to load draft:', e);
    return null;
  }
}

/**
 * Check if a draft exists
 */
export function hasDraft(
  type: DraftType,
  projectId: string,
  entityId?: string
): boolean {
  const key = getDraftKey(type, projectId, entityId);
  return localStorage.getItem(key) !== null;
}

/**
 * Delete a draft
 */
export function deleteDraft(
  type: DraftType,
  projectId: string,
  entityId?: string
): void {
  try {
    const key = getDraftKey(type, projectId, entityId);
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('[DraftPersistence] Failed to delete draft:', e);
  }
}

/**
 * List all drafts for a project
 */
export function listProjectDrafts(projectId: string): Draft[] {
  const drafts: Draft[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX) && key.includes(projectId)) {
        const stored = localStorage.getItem(key);
        if (stored) {
          drafts.push(JSON.parse(stored));
        }
      }
    }
  } catch (e) {
    console.warn('[DraftPersistence] Failed to list drafts:', e);
  }
  return drafts.sort((a, b) => 
    new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

/**
 * Clear old drafts for a project (keep most recent)
 */
export function cleanupProjectDrafts(projectId: string): void {
  const drafts = listProjectDrafts(projectId);
  if (drafts.length > MAX_DRAFTS_PER_PROJECT) {
    const toDelete = drafts.slice(MAX_DRAFTS_PER_PROJECT);
    toDelete.forEach(d => deleteDraft(d.type, d.projectId, d.entityId));
  }
}

/**
 * Clear all drafts for a project (called when project is completed)
 */
export function clearAllProjectDrafts(projectId: string): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX) && key.includes(projectId)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('[DraftPersistence] Failed to clear drafts:', e);
  }
}

/**
 * Hook-friendly auto-save with debounce
 */
let saveTimeouts: Record<string, NodeJS.Timeout> = {};

export function debouncedSaveDraft<T>(
  type: DraftType,
  projectId: string,
  data: T,
  entityId?: string,
  delayMs = 1000
): void {
  const key = getDraftKey(type, projectId, entityId);
  
  if (saveTimeouts[key]) {
    clearTimeout(saveTimeouts[key]);
  }
  
  saveTimeouts[key] = setTimeout(() => {
    saveDraft(type, projectId, data, entityId);
    delete saveTimeouts[key];
  }, delayMs);
}

/**
 * Format time ago for display
 */
export function formatDraftAge(savedAt: string): string {
  const diff = Date.now() - new Date(savedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
  if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `hace ${minutes} min`;
  return 'ahora mismo';
}
