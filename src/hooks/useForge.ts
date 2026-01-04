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
  images?: string[]; // Generated visuals
  audioUrl?: string; // TTS audio
  attachedImages?: string[]; // User uploaded images
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
    estimate: {
      low: number;
      expected: number;
      high: number;
    };
    currency: string;
  };
  time: {
    daysToComplete: number;
    hoursPerDay: number;
    totalHours: number;
  };
  quality: {
    characterScore: number;
    locationScore: number;
    generationSuccessRate: number;
  };
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
  const { projectId, onNavigate, onProjectUpdated, onCharacterCreated, onLocationCreated } = options;
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sendMessageRef = useRef<((content: string, attachedImages?: string[]) => Promise<void>) | null>(null);

  // Cargar conversación existente y analytics al montar
  useEffect(() => {
    if (projectId && user?.id) {
      loadExistingConversation();
      loadAnalytics();
      subscribeToCollaboration();
    }
  }, [projectId, user?.id]);

  const loadExistingConversation = async () => {
    try {
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
      // Sin conversación previa
    }
  };

  // Analytics predictivos
  const loadAnalytics = async () => {
    try {
      const response = await supabase.functions.invoke('forge-analytics', {
        body: { projectId }
      });
      if (response.data && !response.error) {
        setAnalytics(response.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  // Colaboración en tiempo real
  const subscribeToCollaboration = () => {
    const channel = supabase
      .channel(`forge-collab-${projectId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat().map((p: any) => p.user_name || p.user_id);
        setCollaborators(users.filter((u, i, arr) => arr.indexOf(u) === i));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user?.id,
            user_name: user?.email?.split('@')[0] || 'Usuario',
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // Voice: Iniciar grabación
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      
      // Determinar el mejor formato compatible
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      
      const mediaRecorder = mimeType 
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
        
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        stream.getTracks().forEach(track => track.stop());
        
        // Verificar que hay audio grabado
        if (audioBlob.size < 1000) {
          toast.error('No se detectó audio. Habla más fuerte.');
          return;
        }
        
        // Transcribir audio
        const formData = new FormData();
        // Usar extensión correcta según el tipo MIME
        const extension = mediaRecorder.mimeType.includes('webm') ? 'webm' : 'mp4';
        formData.append('audio', audioBlob, `recording.${extension}`);
        
        toast.info('Procesando tu voz...');
        
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forge-stt`,
            {
              method: 'POST',
              headers: {
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: formData,
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('STT response error:', response.status, errorData);
            throw new Error(errorData.error || `Error ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data.error) {
            throw new Error(data.error);
          }
          
          if (data.text && data.text.trim()) {
            toast.success('¡Entendido!');
            // Usar ref para evitar dependencia circular
            if (sendMessageRef.current) {
              sendMessageRef.current(data.text);
            }
          } else {
            toast.warning('No pude entender lo que dijiste. Intenta de nuevo.');
          }
        } catch (error) {
          console.error('STT error:', error);
          const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
          toast.error(`No pude procesar el audio: ${errorMsg}`);
        }
      };

      mediaRecorder.start(1000); // Chunks cada segundo para mejor streaming
      setIsRecording(true);
      toast.success('🎤 Grabando... habla ahora');
    } catch (error) {
      console.error('Recording error:', error);
      toast.error('No pude acceder al micrófono. Verifica los permisos.');
    }
  }, []);

  // Voice: Detener grabación
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Voice: Reproducir respuesta TTS
  const speakResponse = useCallback(async (text: string) => {
    if (!voiceEnabled) return;
    
    // Detener audio anterior
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    try {
      setIsSpeaking(true);
      
      // Limpiar markdown y limitar longitud
      const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/^#+\s/gm, '')
        .replace(/^-\s/gm, '')
        .replace(/\n+/g, '. ')
        .substring(0, 1000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forge-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: cleanText }),
        }
      );

      if (!response.ok) throw new Error('TTS failed');
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
    }
  }, [voiceEnabled]);

  // Detener audio
  const stopSpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  // Generar visual durante la conversación
  const generateVisual = useCallback(async (prompt: string, type: 'concept' | 'storyboard' | 'character' | 'location' = 'concept') => {
    try {
      const response = await supabase.functions.invoke('forge-generate-visual', {
        body: { prompt, type, projectId, conversationId }
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    } catch (error) {
      console.error('Visual generation error:', error);
      toast.error('No pude generar la imagen');
      return null;
    }
  }, [projectId, conversationId]);

  // Analizar imagen de referencia
  const analyzeImage = useCallback(async (
    imageUrl: string,
    analysisType: 'reference' | 'character' | 'location' | 'style' = 'reference',
    userQuery?: string
  ) => {
    try {
      const response = await supabase.functions.invoke('forge-analyze-image', {
        body: { imageUrl, analysisType, userQuery }
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    } catch (error) {
      console.error('Image analysis error:', error);
      toast.error('No pude analizar la imagen');
      return null;
    }
  }, []);

  // Enviar mensaje principal
  const sendMessage = useCallback(async (content: string, attachedImages?: string[]) => {
    if (!content.trim() || isLoading) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const userMessage: ForgeMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
      attachedImages
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const assistantPlaceholder: ForgeMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };
    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      // Si hay imágenes adjuntas, analízalas primero
      let imageAnalysis = '';
      if (attachedImages?.length) {
        const analysis = await analyzeImage(attachedImages[0], 'reference', content);
        if (analysis?.analysis) {
          imageAnalysis = `\n\n[Análisis de imagen de referencia]:\n${analysis.analysis}`;
        }
      }

      const apiMessages = messages
        .filter(m => !m.isStreaming)
        .map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user', content: content.trim() + imageAnalysis });

      const response = await supabase.functions.invoke('production-director', {
        body: {
          projectId,
          messages: apiMessages,
          userId: user?.id,
          conversationId,
          analytics, // Pass analytics for context
          hasImages: !!attachedImages?.length
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Error en la respuesta');
      }

      const data = response.data;
      
      // Check if we should generate a visual
      let generatedImages: string[] = [];
      if (data.shouldGenerateVisual && data.visualPrompt) {
        const visual = await generateVisual(data.visualPrompt, data.visualType || 'concept');
        if (visual?.imageUrl || visual?.base64) {
          generatedImages = [visual.imageUrl || visual.base64];
        }
      }

      setMessages(prev => prev.map(m => 
        m.id === assistantPlaceholder.id
          ? {
              ...m,
              content: data.content || 'Lo siento, no pude procesar tu mensaje.',
              actions: data.actions || undefined,
              images: generatedImages.length ? generatedImages : undefined,
              isStreaming: false
            }
          : m
      ));

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      if (data.profile) {
        setUserProfile(data.profile);
      }

      if (data.actions?.length) {
        for (const action of data.actions) {
          handleExecutedAction(action);
        }
      }

      // Speak response if voice enabled
      if (voiceEnabled && data.content) {
        speakResponse(data.content);
      }

      // Refresh analytics after actions
      if (data.actions?.length) {
        loadAnalytics();
      }

    } catch (error: any) {
      console.error('Forge error:', error);
      
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
  }, [projectId, user?.id, messages, conversationId, isLoading, analytics, voiceEnabled, speakResponse, analyzeImage, generateVisual]);

  // Mantener ref actualizado para evitar dependencias circulares
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

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

      case 'generate_visual':
        if (action.result.imageUrl) {
          toast.success('Visual generado');
        }
        break;
    }
  };

  const clearConversation = useCallback(async () => {
    if (conversationId) {
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
        setMessages(prev => prev.slice(0, -1));
        sendMessage(lastUserMessage.content);
      }
    }
  }, [messages, sendMessage]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled(prev => !prev);
    toast.success(voiceEnabled ? 'Voz desactivada' : 'Voz activada');
  }, [voiceEnabled]);

  return {
    messages,
    isLoading,
    userProfile,
    conversationId,
    analytics,
    isRecording,
    isSpeaking,
    voiceEnabled,
    collaborators,
    sendMessage,
    clearConversation,
    retryLastMessage,
    startRecording,
    stopRecording,
    stopSpeaking,
    toggleVoice,
    generateVisual,
    analyzeImage,
    loadAnalytics
  };
}
