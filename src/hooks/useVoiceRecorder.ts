/**
 * useVoiceRecorder - Hook for recording voice and transcribing with ElevenLabs
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseVoiceRecorderOptions {
  onTranscript: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  maxDurationMs?: number;
}

export function useVoiceRecorder({
  onTranscript,
  onPartialTranscript,
  maxDurationMs = 60000, // 1 minute max
}: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    return new Promise<Blob>((resolve) => {
      mediaRecorderRef.current!.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current!.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        resolve(audioBlob);
      };

      mediaRecorderRef.current!.stop();
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      setIsRecording(false);
    });
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) {
      toast.error('Grabación muy corta');
      return;
    }

    setIsTranscribing(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const { data, error } = await supabase.functions.invoke('forge-stt', {
        body: formData,
      });

      if (error) {
        throw error;
      }

      if (data?.text) {
        onTranscript(data.text);
        toast.success('Transcripción completada');
      } else {
        toast.error('No se detectó voz');
      }
    } catch (err) {
      console.error('[VoiceRecorder] Transcription error:', err);
      toast.error('Error al transcribir');
    } finally {
      setIsTranscribing(false);
      setRecordingTime(0);
    }
  }, [onTranscript]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      setRecordingTime(0);

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);

      // Timer for UI
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setRecordingTime(Math.floor(elapsed / 1000));
        
        // Auto-stop at max duration
        if (elapsed >= maxDurationMs) {
          stopRecording().then((blob) => {
            if (blob) transcribeAudio(blob);
          });
        }
      }, 1000);

      // Partial feedback
      if (onPartialTranscript) {
        onPartialTranscript('Escuchando...');
      }

      toast.info('Grabando... Pulsa de nuevo para terminar');
    } catch (err) {
      console.error('[VoiceRecorder] Start error:', err);
      toast.error('No se pudo acceder al micrófono');
    }
  }, [maxDurationMs, onPartialTranscript, stopRecording, transcribeAudio]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (blob) {
        await transcribeAudio(blob);
      }
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, transcribeAudio]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
    toast.info('Grabación cancelada');
  }, []);

  return {
    isRecording,
    isTranscribing,
    recordingTime,
    toggleRecording,
    cancelRecording,
  };
}
