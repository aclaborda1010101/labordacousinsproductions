/**
 * useForge - SIMPLIFIED
 * forge_conversations and forge_messages tables removed.
 * This hook provides a placeholder implementation.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ForgeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ForgeAction[];
  isStreaming?: boolean;
  images?: string[];
  audioUrl?: string;
  attachedImages?: string[];
}

export interface ForgeAction {
  tool: string;
  result: {
    success: boolean;
    message?: string;
    action?: string;
    section?: string;
    characterId?: string;
    locationId?: string;
    projectId?: string;
    error?: string;
    imageUrl?: string;
  };
}

export interface ForgeAnalytics {
  projectId: string;
  projectName: string;
  stats: {
    characters: number;
    locations: number;
    scenes: number;
    shots: number;
    scripts: number;
  };
  completion: {
    overall: number;
    characters: number;
    locations: number;
    scenes: number;
    shots: number;
  };
  costs: {
    spent: number;
    estimate: { low: number; expected: number; high: number };
    currency: string;
  };
  time: { daysToComplete: number; hoursPerDay: number; totalHours: number };
  quality: { characterScore: number; locationScore: number; generationSuccessRate: number };
  recommendations: string[];
  suggestions: string[];
}

interface UseForgeOptions {
  projectId: string;
  onNavigate?: (section: string) => void;
  onProjectUpdated?: () => void;
  onCharacterCreated?: (characterId: string) => void;
  onLocationCreated?: (locationId: string) => void;
}

export function useForge(options: UseForgeOptions) {
  const { projectId } = options;
  const { user } = useAuth();

  const [messages, setMessages] = useState<ForgeMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<'explorer' | 'creator' | 'professional'>('explorer');
  const [analytics, setAnalytics] = useState<ForgeAnalytics | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [collaborators, setCollaborators] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load analytics only (conversations table removed)
  useEffect(() => {
    if (projectId && user?.id) {
      loadAnalytics();
    }
  }, [projectId, user?.id]);

  const loadAnalytics = async () => {
    try {
      const response = await supabase.functions.invoke('forge-analytics', {
        body: { projectId },
      });
      if (response.data && !response.error) {
        setAnalytics(response.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  // Placeholder send message - no persistence
  const sendMessage = useCallback(
    async (content: string, attachedImages?: string[]) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ForgeMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
        attachedImages,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
        apiMessages.push({ role: 'user', content: content.trim() });

        const response = await supabase.functions.invoke('production-director', {
          body: {
            projectId,
            messages: apiMessages,
            userId: user?.id,
            conversationId,
            analytics,
            hasImages: !!attachedImages?.length,
          },
        });

        if (response.error) {
          throw new Error(response.error.message || 'Error en la respuesta');
        }

        const data = response.data;

        const assistantMessage: ForgeMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.content || 'Lo siento, no pude procesar tu mensaje.',
          timestamp: new Date(),
          actions: data.actions || undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (data.profile) {
          setUserProfile(data.profile);
        }
      } catch (error) {
        console.error('Forge error:', error);
        const errorMessage: ForgeMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Hubo un error procesando tu mensaje. Intenta de nuevo.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        toast.error('Error en la comunicación');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, projectId, user?.id, conversationId, analytics]
  );

  // Placeholder functions
  const startRecording = useCallback(async () => {
    toast.info('Grabación de voz no disponible');
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
  }, []);

  const speakResponse = useCallback(async (_text: string) => {
    // No-op
  }, []);

  const stopSpeaking = useCallback(() => {
    setIsSpeaking(false);
  }, []);

  const generateVisual = useCallback(async (_prompt: string, _type?: string) => {
    return null;
  }, []);

  const analyzeImage = useCallback(async (_imageUrl: string, _type?: string, _query?: string) => {
    return null;
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const abortGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => !prev);
  }, []);

  return {
    messages,
    isLoading,
    conversationId,
    userProfile,
    analytics,
    isRecording,
    isSpeaking,
    voiceEnabled,
    collaborators,
    sendMessage,
    startRecording,
    stopRecording,
    speakResponse,
    stopSpeaking,
    generateVisual,
    analyzeImage,
    clearConversation,
    abortGeneration,
    toggleVoice,
    refreshAnalytics: loadAnalytics,
  };
}
