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
  };
}

interface UseForgeOptions {
  projectId: string;
  onNavigate?: (section: string) => void;
  onProjectUpdated?: () => void;
  onCharacterCreated?: (characterId: string) => void;
  onLocationCreated?: (locationId: string) => void;
}

export function useForge(options: UseForgeOptions) {
  const { projectId, onNavigate, onProjectUpdated, onCharacterCreated, onLocationCreated } = options;
  const { user } = useAuth();
  
  const [messages, setMessages] = useState<ForgeMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<'explorer' | 'creator' | 'professional'>('explorer');
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cargar conversación existente al montar
  useEffect(() => {
    if (projectId && user?.id) {
      loadExistingConversation();
    }
  }, [projectId, user?.id]);

  const loadExistingConversation = async () => {
    try {
      // Buscar conversación activa
      const { data: conversation } = await supabase
        .from('forge_conversations')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (conversation) {
        setConversationId(conversation.id);
        
        // Cargar mensajes
        const { data: savedMessages } = await supabase
          .from('forge_messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: true });

        if (savedMessages?.length) {
          setMessages(savedMessages.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.created_at),
            actions: m.action_executed || undefined
          })));
        }
      }
    } catch (error) {
      // Sin conversación previa, es normal
    }
  };

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Cancelar petición anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Añadir mensaje del usuario
    const userMessage: ForgeMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Placeholder para respuesta del asistente
    const assistantPlaceholder: ForgeMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };
    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      // Preparar mensajes para el API
      const apiMessages = messages
        .filter(m => !m.isStreaming)
        .map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user', content: content.trim() });

      const response = await supabase.functions.invoke('production-director', {
        body: {
          projectId,
          messages: apiMessages,
          userId: user?.id,
          conversationId
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Error en la respuesta');
      }

      const data = response.data;
      
      // Actualizar mensaje del asistente
      setMessages(prev => prev.map(m => 
        m.id === assistantPlaceholder.id
          ? {
              ...m,
              content: data.content || 'Lo siento, no pude procesar tu mensaje.',
              actions: data.actions || undefined,
              isStreaming: false
            }
          : m
      ));

      // Guardar conversationId si es nuevo
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      // Actualizar perfil
      if (data.profile) {
        setUserProfile(data.profile);
      }

      // Procesar acciones ejecutadas
      if (data.actions?.length) {
        for (const action of data.actions) {
          handleExecutedAction(action);
        }
      }

    } catch (error: any) {
      console.error('Forge error:', error);
      
      // Actualizar mensaje con error
      setMessages(prev => prev.map(m => 
        m.id === assistantPlaceholder.id
          ? {
              ...m,
              content: error.message?.includes('429') 
                ? 'Hay mucho tráfico ahora. Dame un momento y reintenta.'
                : error.message?.includes('402')
                ? 'Se han agotado los créditos. Recarga para continuar.'
                : 'Algo falló. ¿Puedes intentarlo de nuevo?',
              isStreaming: false
            }
          : m
      ));
      
      toast.error('Error en la comunicación con Forge');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [projectId, user?.id, messages, conversationId, isLoading]);

  const handleExecutedAction = (action: ForgeAction) => {
    if (!action.result.success) {
      console.warn('Action failed:', action);
      return;
    }

    switch (action.tool) {
      case 'create_project':
        toast.success(`Proyecto "${action.result.message}" configurado`);
        onProjectUpdated?.();
        break;
      
      case 'create_character':
        toast.success(action.result.message || 'Personaje creado');
        if (action.result.characterId) {
          onCharacterCreated?.(action.result.characterId);
        }
        break;
      
      case 'create_location':
        toast.success(action.result.message || 'Locación creada');
        if (action.result.locationId) {
          onLocationCreated?.(action.result.locationId);
        }
        break;
      
      case 'navigate_to':
        if (action.result.section) {
          onNavigate?.(action.result.section);
        }
        break;
      
      case 'generate_script_outline':
        toast.success('Outline listo para generar');
        onNavigate?.('script');
        break;
    }
  };

  const clearConversation = useCallback(async () => {
    if (conversationId) {
      // Marcar conversación como inactiva
      await supabase
        .from('forge_conversations')
        .update({ is_active: false })
        .eq('id', conversationId);
    }
    
    setMessages([]);
    setConversationId(null);
    toast.success('Conversación limpiada');
  }, [conversationId]);

  const retryLastMessage = useCallback(() => {
    if (messages.length >= 2) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        // Quitar el último mensaje de error
        setMessages(prev => prev.slice(0, -1));
        sendMessage(lastUserMessage.content);
      }
    }
  }, [messages, sendMessage]);

  return {
    messages,
    isLoading,
    userProfile,
    conversationId,
    sendMessage,
    clearConversation,
    retryLastMessage
  };
}
