import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  X, 
  Trash2, 
  RotateCcw, 
  Sparkles,
  Zap,
  Brain,
  Minimize2,
  Maximize2,
  CheckCircle2,
  Loader2,
  ArrowRight,
  User,
  MapPin,
  FileText,
  Film
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useForge, ForgeMessage, ForgeAction } from '@/hooks/useForge';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  const {
    messages,
    isLoading,
    userProfile,
    sendMessage,
    clearConversation,
    retryLastMessage
  } = useForge({
    projectId,
    onNavigate: (section) => {
      // Navegar a la sección indicada
      navigate(`/projects/${projectId}?tab=${section}`);
    },
    onProjectUpdated: () => {
      onRefresh?.();
    },
    onCharacterCreated: (characterId) => {
      onRefresh?.();
    },
    onLocationCreated: (locationId) => {
      onRefresh?.();
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
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  // Sugerencias dinámicas basadas en el perfil
  const getSuggestions = () => {
    if (userProfile === 'professional') {
      return [
        'Analiza la continuidad del proyecto',
        'Sugerencias de cinematografía',
        'Revisa el arco narrativo'
      ];
    } else if (userProfile === 'creator') {
      return [
        '¿Cómo mejoro mi personaje principal?',
        'Ideas para escenas',
        'Ayuda con el guión'
      ];
    }
    return [
      '¿Cómo empiezo mi proyecto?',
      'Quiero crear un personaje',
      'Ayúdame con mi historia'
    ];
  };

  return (
    <div 
      className={cn(
        "fixed bottom-4 right-4 z-50 bg-background border rounded-xl shadow-2xl flex flex-col transition-all duration-300",
        isExpanded 
          ? "w-[600px] h-[80vh] max-h-[800px]" 
          : "w-[420px] h-[550px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-gradient-to-r from-muted/50 to-muted/30">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-lg">
          <Sparkles className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">Forge</h3>
          <p className="text-xs text-muted-foreground">Tu Director de Producción AI</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge 
            variant="outline" 
            className="text-[10px] px-2 py-0.5 border-primary/30 text-primary"
          >
            {userProfile === 'professional' ? 'Pro' : userProfile === 'creator' ? 'Creator' : 'Explorer'}
          </Badge>
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

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h4 className="font-semibold text-lg mb-2">¡Hola! Soy Forge</h4>
            <p className="text-sm text-muted-foreground max-w-xs mb-6">
              Tu Director de Producción AI. Cuéntame qué quieres crear y te ayudo a hacerlo realidad.
            </p>
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-muted/10">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cuéntame qué quieres crear..."
            className="min-h-[48px] max-h-32 resize-none rounded-xl"
            rows={1}
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || isLoading}
            className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </form>
    </div>
  );
}

// Message Bubble Component
interface MessageBubbleProps {
  message: ForgeMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
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
        <div 
          className={cn(
            "text-sm prose prose-sm max-w-none",
            isUser ? "prose-invert" : "dark:prose-invert"
          )}
          dangerouslySetInnerHTML={{ 
            __html: formatMessage(message.content) 
          }}
        />
        
        {/* Mostrar acciones ejecutadas */}
        {!isUser && message.actions && message.actions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
            {message.actions.map((action, idx) => (
              <ActionBadge key={idx} action={action} />
            ))}
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
    // Headers
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-bold mt-3 mb-2">$1</h3>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4">$1</li>')
    // Bullet points
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Emojis remain as-is
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>');
}

// Floating trigger button for when panel is closed
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
            className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-2xl shadow-xl bg-gradient-to-br from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 hover:scale-105 transition-transform"
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
