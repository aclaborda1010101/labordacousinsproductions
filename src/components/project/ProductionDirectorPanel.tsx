import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, 
  X, 
  Trash2, 
  Sparkles,
  Minimize2,
  Maximize2,
  CheckCircle2,
  Loader2,
  ArrowRight,
  User,
  MapPin,
  FileText,
  Film,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Image,
  BarChart3,
  Users,
  Upload,
  ImagePlus,
  Palette,
  TrendingUp,
  Clock,
  DollarSign,
  AlertTriangle,
  Lightbulb,
  Square
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useForge, ForgeMessage, ForgeAction, ForgeAnalytics } from '@/hooks/useForge';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface ProductionDirectorPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function ProductionDirectorPanel({ 
  projectId, 
  isOpen, 
  onClose,
  onRefresh
}: ProductionDirectorPanelProps) {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    messages,
    isLoading,
    userProfile,
    analytics,
    isRecording,
    isSpeaking,
    voiceEnabled,
    collaborators,
    sendMessage,
    clearConversation,
    startRecording,
    stopRecording,
    stopSpeaking,
    toggleVoice,
    loadAnalytics
  } = useForge({
    projectId,
    onNavigate: (section) => {
      navigate(`/projects/${projectId}?tab=${section}`);
    },
    onProjectUpdated: () => {
      onRefresh?.();
      loadAnalytics();
    },
    onCharacterCreated: () => {
      onRefresh?.();
      loadAnalytics();
    },
    onLocationCreated: () => {
      onRefresh?.();
      loadAnalytics();
    }
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input;
    const images = attachedImages.length ? [...attachedImages] : undefined;
    setInput('');
    setAttachedImages([]);
    await sendMessage(message, images);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachedImages(prev => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = '';
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleVoiceToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  if (!isOpen) return null;

  const getSuggestions = () => {
    if (userProfile === 'professional') {
      return [
        'Analiza la continuidad del proyecto',
        'Genera concept art del protagonista',
        'Revisa el arco narrativo'
      ];
    } else if (userProfile === 'creator') {
      return [
        'Genera un visual de mi personaje',
        'Ideas para escenas',
        'Ayuda con el guión'
      ];
    }
    return [
      '¿Cómo empiezo mi proyecto?',
      'Quiero crear un personaje',
      'Genera un concept art'
    ];
  };

  return (
    <div 
      className={cn(
        "fixed bottom-4 right-4 z-50 bg-background border rounded-xl shadow-2xl flex flex-col transition-all duration-300",
        isExpanded 
          ? "w-[700px] h-[85vh] max-h-[900px]" 
          : "w-[450px] h-[600px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-gradient-to-r from-muted/50 to-muted/30">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-lg">
          <Sparkles className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Forge</h3>
            {collaborators.length > 1 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1">
                      <Users className="w-3 h-3" />
                      {collaborators.length}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Colaboradores activos: {collaborators.join(', ')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Director de Producción AI</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge 
            variant="outline" 
            className="text-[10px] px-2 py-0.5 border-primary/30 text-primary"
          >
            {userProfile === 'professional' ? 'Pro' : userProfile === 'creator' ? 'Creator' : 'Explorer'}
          </Badge>
          
          {/* Voice toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={voiceEnabled ? "default" : "ghost"} 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={toggleVoice}
                >
                  {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{voiceEnabled ? 'Desactivar voz' : 'Activar voz'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Analytics popover */}
          <Popover open={showAnalytics} onOpenChange={setShowAnalytics}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <BarChart3 className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <AnalyticsPanel analytics={analytics} />
            </PopoverContent>
          </Popover>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isExpanded ? 'Reducir' : 'Expandir'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={clearConversation}
                  disabled={messages.length === 0}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Nueva conversación</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Proactive suggestions bar */}
      {analytics?.recommendations?.length ? (
        <div className="px-4 py-2 border-b bg-amber-500/5 flex items-center gap-2 overflow-x-auto">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400 truncate">
            {analytics.recommendations[0]}
          </p>
        </div>
      ) : null}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h4 className="font-semibold text-lg mb-2">¡Hola! Soy Forge</h4>
            <p className="text-sm text-muted-foreground max-w-xs mb-4">
              Tu Director de Producción AI. Puedo crear personajes, generar concept art, 
              y guiarte en todo el proceso de producción.
            </p>
            
            {/* Capabilities badges */}
            <div className="flex flex-wrap gap-2 justify-center mb-6">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Mic className="w-3 h-3" /> Voz
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <ImagePlus className="w-3 h-3" /> Genera imágenes
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Upload className="w-3 h-3" /> Analiza referencias
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <BarChart3 className="w-3 h-3" /> Analytics
              </Badge>
            </div>
            
            <div className="flex flex-wrap gap-2 justify-center">
              {getSuggestions().map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => {
                    setInput(suggestion);
                    textareaRef.current?.focus();
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble 
                key={message.id} 
                message={message}
                isSpeaking={isSpeaking}
                onStopSpeaking={stopSpeaking}
              />
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-primary-foreground animate-pulse" />
                </div>
                <div className="flex-1 bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Forge está pensando...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Attached images preview */}
      {attachedImages.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/20 flex gap-2 overflow-x-auto">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative shrink-0">
              <img src={img} alt="Attached" className="h-16 w-16 object-cover rounded-lg border" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full"
                onClick={() => removeAttachedImage(idx)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-muted/10">
        <div className="flex gap-2">
          {/* Image upload button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-12 w-12 rounded-xl"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Image className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Subir imagen de referencia</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe o graba tu mensaje..."
            className="min-h-[48px] max-h-32 resize-none rounded-xl"
            rows={1}
            disabled={isLoading || isRecording}
          />

          {/* Voice recording button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "outline"}
                  size="icon"
                  className="shrink-0 h-12 w-12 rounded-xl"
                  onClick={handleVoiceToggle}
                  disabled={isLoading}
                >
                  {isRecording ? (
                    <Square className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isRecording ? 'Detener grabación' : 'Grabar mensaje'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button 
            type="submit" 
            size="icon" 
            disabled={(!input.trim() && !attachedImages.length) || isLoading}
            className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Enter para enviar · Shift+Enter para nueva línea · 🎤 para hablar
        </p>
      </form>
    </div>
  );
}

// Analytics Panel Component
function AnalyticsPanel({ analytics }: { analytics: ForgeAnalytics | null }) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Analytics del Proyecto</h4>
        <Badge variant="outline" className="text-[10px]">
          {analytics.completion.overall}% completado
        </Badge>
      </div>

      {/* Progress bars */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Personajes</span>
            <span>{analytics.completion.characters}%</span>
          </div>
          <Progress value={analytics.completion.characters} className="h-1.5" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Locaciones</span>
            <span>{analytics.completion.locations}%</span>
          </div>
          <Progress value={analytics.completion.locations} className="h-1.5" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Escenas</span>
            <span>{analytics.completion.scenes}%</span>
          </div>
          <Progress value={analytics.completion.scenes} className="h-1.5" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/30 rounded-lg p-2">
          <div className="text-lg font-bold">{analytics.stats.characters}</div>
          <div className="text-[10px] text-muted-foreground">Personajes</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2">
          <div className="text-lg font-bold">{analytics.stats.locations}</div>
          <div className="text-[10px] text-muted-foreground">Locaciones</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2">
          <div className="text-lg font-bold">{analytics.stats.shots}</div>
          <div className="text-[10px] text-muted-foreground">Shots</div>
        </div>
      </div>

      {/* Estimates */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <div>
            <div className="text-xs font-medium">${analytics.costs.estimate.expected}</div>
            <div className="text-[9px] text-muted-foreground">Costo estimado</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
          <Clock className="w-4 h-4 text-blue-500" />
          <div>
            <div className="text-xs font-medium">{analytics.time.daysToComplete} días</div>
            <div className="text-[9px] text-muted-foreground">Tiempo restante</div>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {analytics.suggestions?.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs font-medium">
            <Lightbulb className="w-3 h-3 text-amber-500" />
            Próximos pasos
          </div>
          {analytics.suggestions.slice(0, 2).map((s, i) => (
            <div key={i} className="text-[10px] text-muted-foreground pl-4">
              • {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Message Bubble Component
interface MessageBubbleProps {
  message: ForgeMessage;
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
}

function MessageBubble({ message, isSpeaking, onStopSpeaking }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {!isUser && (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      <div className={cn(
        "flex-1 rounded-xl p-4 max-w-[85%]",
        isUser 
          ? "bg-primary text-primary-foreground ml-auto" 
          : "bg-muted/50"
      )}>
        {/* User attached images */}
        {isUser && message.attachedImages?.length ? (
          <div className="flex gap-2 mb-3 flex-wrap">
            {message.attachedImages.map((img, idx) => (
              <img key={idx} src={img} alt="Reference" className="h-20 w-20 object-cover rounded-lg" />
            ))}
          </div>
        ) : null}

        <div 
          className={cn(
            "text-sm prose prose-sm max-w-none",
            isUser ? "prose-invert" : "dark:prose-invert"
          )}
          dangerouslySetInnerHTML={{ 
            __html: formatMessage(message.content) 
          }}
        />

        {/* Generated images */}
        {!isUser && message.images?.length ? (
          <div className="mt-3 space-y-2">
            {message.images.map((img, idx) => (
              <div key={idx} className="relative group">
                <img 
                  src={img} 
                  alt="Generated visual" 
                  className="w-full max-w-sm rounded-lg border shadow-lg"
                />
                <div className="absolute bottom-2 left-2 flex gap-1">
                  <Badge className="text-[9px] bg-black/50 border-0">
                    <Palette className="w-3 h-3 mr-1" />
                    Generado por Forge
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        
        {/* Mostrar acciones ejecutadas */}
        {!isUser && message.actions && message.actions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
            {message.actions.map((action, idx) => (
              <ActionBadge key={idx} action={action} />
            ))}
          </div>
        )}

        {/* Speaking indicator */}
        {!isUser && isSpeaking && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={onStopSpeaking}
            >
              <Volume2 className="w-3 h-3 animate-pulse" />
              Hablando... (click para detener)
            </Button>
          </div>
        )}
        
        {message.isStreaming && (
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Escribiendo...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Action Badge Component
function ActionBadge({ action }: { action: ForgeAction }) {
  const getActionIcon = () => {
    switch (action.tool) {
      case 'create_project': return <Film className="w-3 h-3" />;
      case 'create_character': return <User className="w-3 h-3" />;
      case 'create_location': return <MapPin className="w-3 h-3" />;
      case 'generate_script_outline': return <FileText className="w-3 h-3" />;
      case 'navigate_to': return <ArrowRight className="w-3 h-3" />;
      case 'generate_visual': return <ImagePlus className="w-3 h-3" />;
      default: return <CheckCircle2 className="w-3 h-3" />;
    }
  };

  const getActionLabel = () => {
    switch (action.tool) {
      case 'create_project': return 'Proyecto configurado';
      case 'create_character': return 'Personaje creado';
      case 'create_location': return 'Locación creada';
      case 'generate_script_outline': return 'Outline generado';
      case 'navigate_to': return `Ir a ${action.result.section}`;
      case 'generate_visual': return 'Visual generado';
      default: return 'Acción completada';
    }
  };

  return (
    <div className={cn(
      "flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg",
      action.result.success 
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
        : "bg-destructive/10 text-destructive"
    )}>
      {action.result.success ? <CheckCircle2 className="w-3 h-3" /> : getActionIcon()}
      <span>{action.result.message || getActionLabel()}</span>
    </div>
  );
}

// Format message with markdown-like syntax
function formatMessage(content: string): string {
  if (!content) return '';
  
  return content
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-bold mt-3 mb-2">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>');
}

// Floating trigger button
interface ProductionDirectorTriggerProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function ProductionDirectorTrigger({ onClick, hasUnread }: ProductionDirectorTriggerProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onClick}
            size="icon"
            className="fixed bottom-20 sm:bottom-4 right-4 z-[9999] h-14 w-14 rounded-2xl shadow-xl bg-gradient-to-br from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 hover:scale-105 transition-transform"
          >
            <Sparkles className="w-6 h-6 text-primary-foreground" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full border-2 border-background flex items-center justify-center">
                <span className="text-[8px] text-destructive-foreground font-bold">!</span>
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="font-medium">
          <p>Forge - Director AI</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ProductionDirectorPanel;
